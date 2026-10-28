import * as utils from '../utils';
import {
	READER_BT_NAME_PREFIX,
	readerBtCharacteristics,
	readerBtServices,
	type ReaderBtCharacteristicId
} from './readerBtConstants';
import { DeviceClosedError, SiDeviceState } from './ISiReaderBtDevice';
import type { ISiReaderBtDevice, ISiReaderBtDriverData } from './ISiReaderBtDevice';
import type { ISiReaderBtDriver, ISiReaderBtDriverWithDetection } from './ISiReaderBtDriver';
import { SiReaderBtDevice } from './SiReaderBtDevice';

const logger = utils.getLogger('WebBluetoothSiReaderBtDriver');

// Usually means the ~20 second advertising window has closed rather than that the
// reader is absent, so the message says how to reopen it.
export class ReaderBtNotFoundError extends utils.SiError {}

const SERVICE_CARD_HINT = 'Insert the Service/OFF instruction card and try again within 20 seconds.';

export interface ReaderBtRequestDeviceOptions {
	namePrefix?: string; // combined with the service filter, not OR-ed with it
	acceptAllDevices?: boolean; // escape hatch for an advertisement without the service
}

export interface WebBluetoothSiReaderBtDriverData extends ISiReaderBtDriverData<WebBluetoothSiReaderBtDriver> {
	driver: WebBluetoothSiReaderBtDriver;
	device: BluetoothDevice;
	server?: BluetoothRemoteGATTServer;
	// cleared on every disconnect, GATT handles do not survive a reconnect
	characteristics: { [id: string]: BluetoothRemoteGATTCharacteristic };
	notifyListeners: { [id: string]: EventListener };
}

export type IWebBluetoothSiReaderBtDevice = ISiReaderBtDevice<WebBluetoothSiReaderBtDriverData>;
export type WebBluetoothSiReaderBtDevice = SiReaderBtDevice<WebBluetoothSiReaderBtDriverData>;

// getDevices() is behind a Chrome flag, so it is feature-detected.
type BluetoothWithGetDevices = Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> };

/** Web Bluetooth backend. Implements detection but not autodetection, which needs
 * flagged Chrome APIs. Deep import only: navigator.bluetooth exists in Chrome and Edge
 * only, and only in a secure context. */
export class WebBluetoothSiReaderBtDriver
	implements ISiReaderBtDriver<WebBluetoothSiReaderBtDriverData>, ISiReaderBtDriverWithDetection<WebBluetoothSiReaderBtDriverData, [ReaderBtRequestDeviceOptions?]>
{
	public name = 'WebBluetoothReaderBt';

	private siDeviceByIdent: { [ident: string]: WebBluetoothSiReaderBtDevice } = {};

	constructor(private navigatorBluetooth: BluetoothWithGetDevices) {}

	isAvailable(): Promise<boolean> {
		if (this.navigatorBluetooth?.getAvailability === undefined) {
			return Promise.resolve(false);
		}
		return this.navigatorBluetooth.getAvailability();
	}

	// Must be called from a user gesture. Connection lives on the device instead, so a
	// reconnect does not need a new gesture.
	detect(options: ReaderBtRequestDeviceOptions = {}): Promise<WebBluetoothSiReaderBtDevice> {
		// Every service accessed later must be listed or getPrimaryService throws. Filters
		// are OR-ed, so namePrefix goes inside the same entry to narrow rather than widen.
		const optionalServices = Object.values(readerBtServices);
		const requestOptions: RequestDeviceOptions = options.acceptAllDevices
			? { acceptAllDevices: true, optionalServices: optionalServices }
			: {
					filters: [
						{
							services: [readerBtServices.settings],
							...(options.namePrefix === undefined ? {} : { namePrefix: options.namePrefix })
						}
					],
					optionalServices: optionalServices
			};
		return this.navigatorBluetooth.requestDevice(requestOptions).then(
			(bluetoothDevice) => this.getSiDevice(bluetoothDevice),
			(error: unknown) => {
				// Also what a cancelled chooser rejects with, so keep the browser's own message.
				if (error instanceof Error && error.name === 'NotFoundError') {
					throw new ReaderBtNotFoundError(`No ${READER_BT_NAME_PREFIX} found (${error.message}). ${SERVICE_CARD_HINT}`);
				}
				throw error;
			}
		);
	}

	// Previously permitted devices, [] where the platform cannot enumerate.
	getExistingDevices(): Promise<WebBluetoothSiReaderBtDevice[]> {
		if (typeof this.navigatorBluetooth?.getDevices !== 'function') {
			logger.debug('navigator.bluetooth.getDevices is unavailable; returning no devices');
			return Promise.resolve([]);
		}
		return this.navigatorBluetooth.getDevices().then((devices) => devices.map((device) => this.getSiDevice(device)));
	}

	getSiDevice(bluetoothDevice: BluetoothDevice): WebBluetoothSiReaderBtDevice {
		// BluetoothDevice.id is stable per origin, so it survives a reload.
		const ident = bluetoothDevice.id;
		if (this.siDeviceByIdent[ident] !== undefined) {
			return this.siDeviceByIdent[ident];
		}
		const data: WebBluetoothSiReaderBtDriverData = {
			driver: this,
			device: bluetoothDevice,
			characteristics: {},
			notifyListeners: {}
		};
		const siDevice = new SiReaderBtDevice(ident, data);
		bluetoothDevice.addEventListener('gattserverdisconnected', () => {
			// Every handle is dead now, a reconnect must re-walk them from the server.
			data.characteristics = {};
			data.notifyListeners = {};
			data.server = undefined;
			siDevice.setState(SiDeviceState.Closed);
		});
		this.siDeviceByIdent[ident] = siDevice;
		return siDevice;
	}

	forgetSiDevice(siDevice: IWebBluetoothSiReaderBtDevice): void {
		delete this.siDeviceByIdent[siDevice.data.device.id];
	}

	open(device: IWebBluetoothSiReaderBtDevice): Promise<unknown> {
		const gatt = device.data.device.gatt;
		if (gatt === undefined) {
			return Promise.reject(new DeviceClosedError('This Bluetooth device exposes no GATT server'));
		}
		device.data.characteristics = {};
		device.data.notifyListeners = {};
		return gatt.connect().then(
			(server) => {
				device.data.server = server;
			},
			(error: unknown) => {
				// The reader stops advertising once a connection drops, so a reconnect fails
				// within milliseconds with "Bluetooth Device is no longer in range" until the
				// Service/OFF card makes it advertise again.
				if (error instanceof Error && error.name === 'NetworkError') {
					throw new ReaderBtNotFoundError(`The ${READER_BT_NAME_PREFIX} is not advertising (${error.message}). ${SERVICE_CARD_HINT}`);
				}
				throw error;
			}
		);
	}

	async close(device: IWebBluetoothSiReaderBtDevice): Promise<unknown> {
		await Promise.all(Object.keys(device.data.notifyListeners).map((id) => this.unsubscribe(device, id as ReaderBtCharacteristicId)));
		device.data.characteristics = {};
		device.data.server = undefined;
		const gatt = device.data.device.gatt;
		if (gatt?.connected) {
			gatt.disconnect();
		}
		return undefined;
	}

	async subscribe(device: IWebBluetoothSiReaderBtDevice, characteristic: ReaderBtCharacteristicId): Promise<unknown> {
		const gattCharacteristic = await this.getCharacteristic(device, characteristic);
		const listener: EventListener = (event: Event) => {
			const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
			if (value === undefined) {
				return;
			}
			device.handleNotify(characteristic, [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)]);
		};
		gattCharacteristic.addEventListener('characteristicvaluechanged', listener);
		device.data.notifyListeners[characteristic] = listener;
		return gattCharacteristic.startNotifications();
	}

	async unsubscribe(device: IWebBluetoothSiReaderBtDevice, characteristic: ReaderBtCharacteristicId): Promise<unknown> {
		const listener = device.data.notifyListeners[characteristic];
		const gattCharacteristic = device.data.characteristics[characteristic];
		delete device.data.notifyListeners[characteristic];
		if (gattCharacteristic === undefined) {
			return undefined;
		}
		if (listener !== undefined) {
			gattCharacteristic.removeEventListener('characteristicvaluechanged', listener);
		}
		// The link may already be gone, in which case stopping notifications is moot.
		return gattCharacteristic.stopNotifications().catch((error: unknown) => {
			logger.debug('Could not stop notifications', { characteristic: characteristic, error: String(error) });
		});
	}

	async write(device: IWebBluetoothSiReaderBtDevice, characteristic: ReaderBtCharacteristicId, uint8Data: number[], withResponse: boolean): Promise<unknown> {
		const gattCharacteristic = await this.getCharacteristic(device, characteristic);
		const value = new Uint8Array(uint8Data);
		if (withResponse) {
			// writeValue is deprecated but still the only method on older Chrome.
			return gattCharacteristic.writeValueWithResponse === undefined ? gattCharacteristic.writeValue(value) : gattCharacteristic.writeValueWithResponse(value);
		}
		return gattCharacteristic.writeValueWithoutResponse === undefined ? gattCharacteristic.writeValue(value) : gattCharacteristic.writeValueWithoutResponse(value);
	}

	private async getCharacteristic(device: IWebBluetoothSiReaderBtDevice, characteristic: ReaderBtCharacteristicId): Promise<BluetoothRemoteGATTCharacteristic> {
		const cached = device.data.characteristics[characteristic];
		if (cached !== undefined) {
			return cached;
		}
		const server = device.data.server;
		if (server === undefined || !server.connected) {
			throw new DeviceClosedError('The Reader BT is not connected');
		}
		const spec = readerBtCharacteristics[characteristic];
		const service = await server.getPrimaryService(spec.service);
		const gattCharacteristic = await service.getCharacteristic(spec.uuid);
		device.data.characteristics[characteristic] = gattCharacteristic;
		return gattCharacteristic;
	}
}

export const getWebBluetoothSiReaderBtDriver = (navigatorBluetooth: Bluetooth): WebBluetoothSiReaderBtDriver => new WebBluetoothSiReaderBtDriver(navigatorBluetooth);

// True when this browser can talk to a Reader BT at all.
export const isWebBluetoothAvailable = (): boolean => typeof navigator !== 'undefined' && (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth !== undefined;
