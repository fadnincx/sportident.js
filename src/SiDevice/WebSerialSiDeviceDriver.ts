import * as utils from '../utils';
import type { ISiDevice, ISiDeviceDriverData } from '../SiDevice/ISiDevice';
import type { ISiDeviceDriver, SiDeviceDriverWithAutodetectionEvents } from '../SiDevice/ISiDeviceDriver';
import { SiDeviceRemoveEvent } from '../SiDevice/ISiDeviceDriver';
import { SiDevice } from '../SiDevice/SiDevice';
import type * as nav from './INavigatorWebSerial';

const siDeviceFilters = [{ usbVendorId: 0x10c4, usbProductId: 0x800a }];
const matchesSiDeviceFilters = (usbVendorId: number, usbProductId: number) => siDeviceFilters.some((filter) => usbVendorId === filter.usbVendorId && usbProductId === filter.usbProductId);

const getIdent = (device: nav.WebSerialDevice) => `${device.getInfo().usbProductId}`;

export interface WebSerialSiDeviceDriverData extends ISiDeviceDriverData<WebSerialSiDeviceDriver> {
	driver: WebSerialSiDeviceDriver;
	device: nav.WebSerialDevice;
}

export type IWebSerialSiDevice = ISiDevice<WebSerialSiDeviceDriverData>;
export type WebSerialSiDevice = SiDevice<WebSerialSiDeviceDriverData>;

export class WebSerialSiDeviceDriver implements ISiDeviceDriver<WebSerialSiDeviceDriverData> {
	public name = 'WebSerial';

	private siDeviceByIdent: { [ident: string]: WebSerialSiDevice } = {};

	private autodetectedSiDevices: { [ident: string]: WebSerialSiDevice } = {};

	private reader: ReadableStreamDefaultReader<any> | undefined;

	constructor(private navigatorSerial: nav.Serial) {}

	detect(): Promise<WebSerialSiDevice> {
		return this.navigatorSerial
			.requestPort({
				filters: siDeviceFilters
			})
			.catch((e) => {
				return Promise.reject(new Error('Failed to get access to Serial device!' + e.toString()));
			})
			.then((navigatorWebSerialDevice: nav.WebSerialDevice) => {
				if (!matchesSiDeviceFilters(navigatorWebSerialDevice.getInfo().usbVendorId || 0, navigatorWebSerialDevice.getInfo().usbProductId || 0)) {
					return Promise.reject(new Error('Not a SI device'));
				}
				const ident = getIdent(navigatorWebSerialDevice);
				if (this.autodetectedSiDevices[ident] !== undefined) {
					return Promise.reject(new Error('Duplicate SI device'));
				}
				const siDevice = this.getSiDevice(navigatorWebSerialDevice);
				this.autodetectedSiDevices[ident] = siDevice;
				return siDevice.open();
			});
	}

	getExistingDevices(): Promise<WebSerialSiDevice[]> {
		return Promise.resolve(Object.values(this.autodetectedSiDevices))
	}

	getSiDevice(navigatorWebSerialDevice: nav.WebSerialDevice): WebSerialSiDevice {
		const ident = getIdent(navigatorWebSerialDevice);
		if (this.siDeviceByIdent[ident] !== undefined) {
			return this.siDeviceByIdent[ident];
		}
		const newSiDeviceData: WebSerialSiDeviceDriverData = {
			driver: this,
			device: navigatorWebSerialDevice
		};
		const newSiDevice = new SiDevice(ident, newSiDeviceData);
		this.siDeviceByIdent[ident] = newSiDevice;
		return newSiDevice;
	}

	forgetSiDevice(siDevice: IWebSerialSiDevice) {
		const navigatorWebSerialDevice = siDevice.data.device;
		const ident = getIdent(navigatorWebSerialDevice);
		delete this.siDeviceByIdent[ident];
		if (this.autodetectedSiDevices[ident] !== undefined) {
			this.dispatchEvent('remove', new SiDeviceRemoveEvent(siDevice));
		}
		delete this.autodetectedSiDevices[ident];
	}

	open(device: IWebSerialSiDevice): Promise<void> {
		console.debug('Opening...');
		const navigatorDevice = device.data.device;
		return navigatorDevice.open({ baudRate: 38400 })
		.catch((e) => {
			return Promise.reject(new Error("Failed to open serial device"))
		});
	}

	async close(device: IWebSerialSiDevice): Promise<void> {
		console.debug('Disabling Serial...');
		const navigatorDevice = device.data.device;
		try {
			if (this.reader != undefined) {
				this.reader.releaseLock();
			}
		} catch (e) {
			console.warn(e);
		}
		this.forgetSiDevice(device);
		await navigatorDevice.readable.cancel();
		await navigatorDevice.close();
	}

	async receive(device: IWebSerialSiDevice): Promise<number[]> {
		const navigatorDevice = device.data.device;
		this.reader = navigatorDevice.readable.getReader();
		try {
			while (true) {
				const { value, done } = await this.reader.read();
				if (done) {
					if (value == undefined) {
						return [];
					}
					return value;
				}
				if (value != undefined) {
					return value;
				}
			}
		} catch (error) {
			console.warn(error);
		} finally {
			this.reader.releaseLock();
		}
		return [];
	}

	async send(device: IWebSerialSiDevice, uint8Data: number[]): Promise<void> {
		const navigatorDevice = device.data.device;
		const buffer = new Uint8Array(uint8Data);
		if (navigatorDevice.writable == null) {
			console.error('SiStation is not writable!');
			return;
		}
		const writer = navigatorDevice.writable.getWriter();
		await writer
			.write(buffer)
			.then(() => {
				return writer.releaseLock();
			})
			.then(() => true);
	}
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WebSerialSiDeviceDriver extends utils.EventTarget<SiDeviceDriverWithAutodetectionEvents<WebSerialSiDeviceDriverData>> {}
utils.applyMixins(WebSerialSiDeviceDriver, [utils.EventTarget]);

export const getWebSerialSiDeviceDriver = (navigatorWebSerial: Serial): WebSerialSiDeviceDriver => new WebSerialSiDeviceDriver(<nav.Serial>(<unknown>navigatorWebSerial));
