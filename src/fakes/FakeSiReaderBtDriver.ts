import * as utils from '../utils';
import type { ReaderBtCharacteristicId } from '../SiReaderBt/readerBtConstants';
import { DeviceClosedError, SiDeviceState } from '../SiReaderBt/ISiReaderBtDevice';
import type { ISiReaderBtDevice, ISiReaderBtDriverData } from '../SiReaderBt/ISiReaderBtDevice';
import { SiReaderBtDeviceAddEvent, SiReaderBtDeviceRemoveEvent } from '../SiReaderBt/ISiReaderBtDriver';
import type {
	ISiReaderBtDriver,
	ISiReaderBtDriverWithAutodetection,
	ISiReaderBtDriverWithDetection,
	SiReaderBtDriverWithAutodetectionEvents
} from '../SiReaderBt/ISiReaderBtDriver';
import { SiReaderBtDevice } from '../SiReaderBt/SiReaderBtDevice';
import { FakeReaderBtDevice, type FakeReaderBtDeviceOptions } from './FakeReaderBtDevice';

export interface FakeReaderBtConnection {
	ident: string;
	isOpened: boolean;
	subscribed: { [characteristic: string]: boolean };
	simulator: FakeReaderBtDevice;
}

export interface FakeSiReaderBtDriverData extends ISiReaderBtDriverData<FakeSiReaderBtDriver> {
	driver: FakeSiReaderBtDriver;
	device: FakeReaderBtConnection;
}

export type IFakeSiReaderBtDevice = ISiReaderBtDevice<FakeSiReaderBtDriverData>;
export type FakeSiReaderBtDevice = SiReaderBtDevice<FakeSiReaderBtDriverData>;

/** An in-memory Reader BT driver, mirroring FakeSiDeviceDriver. Unlike the Web
 * Bluetooth one it implements autodetection, since an in-memory driver can scan, which
 * also makes it the reference for anyone writing a native BLE driver. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FakeSiReaderBtDriver
	implements
		ISiReaderBtDriver<FakeSiReaderBtDriverData>,
		ISiReaderBtDriverWithDetection<FakeSiReaderBtDriverData, []>,
		ISiReaderBtDriverWithAutodetection<FakeSiReaderBtDriverData>
{
	public name = 'FakeReaderBt';

	private siDeviceByIdent: { [ident: string]: FakeSiReaderBtDevice } = {};

	private autodetectedSiDevices: { [ident: string]: FakeSiReaderBtDevice } = {};

	private autoDetectionRunning = false;

	private simulatorByIdent: { [ident: string]: FakeReaderBtDevice } = {};

	public identToBeDetected: string | null = null;
	public identsToBeAutodetected: string[] = [];
	// applied to every simulator created from here on
	public simulatorOptions: FakeReaderBtDeviceOptions = {};

	// The message-level simulator behind a device ident, created on demand.
	getSimulator(ident: string): FakeReaderBtDevice {
		if (this.simulatorByIdent[ident] === undefined) {
			this.simulatorByIdent[ident] = new FakeReaderBtDevice(this.simulatorOptions);
		}
		return this.simulatorByIdent[ident];
	}

	detect(): Promise<FakeSiReaderBtDevice> {
		if (!this.identToBeDetected) {
			return Promise.reject(new Error('No fake Reader BT ident to be detected'));
		}
		return this.autodetectSiDevice(this.identToBeDetected);
	}

	getSiDevice(ident: string): FakeSiReaderBtDevice {
		if (this.siDeviceByIdent[ident] !== undefined) {
			return this.siDeviceByIdent[ident];
		}
		const simulator = this.getSimulator(ident);
		const newSiDeviceData: FakeSiReaderBtDriverData = {
			driver: this,
			device: { ident: ident, isOpened: false, subscribed: {}, simulator: simulator }
		};
		const newSiDevice = new SiReaderBtDevice(ident, newSiDeviceData);
		simulator.onNotify = (characteristic, uint8Data) => {
			if (!newSiDeviceData.device.subscribed[characteristic]) {
				return;
			}
			newSiDevice.handleNotify(characteristic, uint8Data);
		};
		simulator.onDisconnect = () => {
			newSiDeviceData.device.isOpened = false;
			newSiDeviceData.device.subscribed = {};
			newSiDevice.setState(SiDeviceState.Closed);
		};
		this.siDeviceByIdent[ident] = newSiDevice;
		return newSiDevice;
	}

	async forgetSiDevice(siDevice: FakeSiReaderBtDevice): Promise<void> {
		const ident = siDevice.data.device.ident;
		delete this.siDeviceByIdent[ident];
		if (this.autodetectedSiDevices[ident] !== undefined) {
			this.dispatchEvent('remove', new SiReaderBtDeviceRemoveEvent(siDevice));
		}
		delete this.autodetectedSiDevices[ident];
	}

	public isAutoDetectionRunning(): boolean {
		return this.autoDetectionRunning;
	}

	startAutoDetection(): Promise<FakeSiReaderBtDevice[]> {
		this.autoDetectionRunning = true;
		return Promise.all(this.identsToBeAutodetected.map((ident) => this.autodetectSiDevice(ident)));
	}

	stopAutoDetection(): Promise<unknown> {
		this.autoDetectionRunning = false;
		return Promise.resolve();
	}

	autodetectSiDevice(ident: string): Promise<FakeSiReaderBtDevice> {
		if (this.autodetectedSiDevices[ident] !== undefined) {
			return Promise.reject(new Error('Duplicate Reader BT device'));
		}
		const siDevice = this.getSiDevice(ident);
		this.autodetectedSiDevices[ident] = siDevice;
		return Promise.resolve(siDevice);
	}

	public async handleDeviceConnected(ident: string): Promise<void> {
		if (!this.autoDetectionRunning) {
			throw new Error('autodetection not running');
		}
		const siDevice = await this.autodetectSiDevice(ident);
		this.dispatchEvent('add', new SiReaderBtDeviceAddEvent(siDevice));
	}

	public async handleDeviceDisconnected(ident: string): Promise<void> {
		if (!this.autoDetectionRunning) {
			throw new Error('autodetection not running');
		}
		const siDevice = this.siDeviceByIdent[ident];
		if (siDevice === undefined) {
			throw new Error('No such device');
		}
		siDevice.data.device.isOpened = false;
		siDevice.setState(SiDeviceState.Closed);
		await this.forgetSiDevice(siDevice);
	}

	open(device: IFakeSiReaderBtDevice): Promise<unknown> {
		device.data.device.isOpened = true;
		device.data.device.simulator.connect();
		return Promise.resolve();
	}

	close(device: IFakeSiReaderBtDevice): Promise<unknown> {
		device.data.device.isOpened = false;
		device.data.device.subscribed = {};
		return Promise.resolve();
	}

	subscribe(device: IFakeSiReaderBtDevice, characteristic: ReaderBtCharacteristicId): Promise<unknown> {
		if (!device.data.device.isOpened) {
			return Promise.reject(new DeviceClosedError('Device is not open'));
		}
		device.data.device.subscribed[characteristic] = true;
		return Promise.resolve();
	}

	unsubscribe(device: IFakeSiReaderBtDevice, characteristic: ReaderBtCharacteristicId): Promise<unknown> {
		delete device.data.device.subscribed[characteristic];
		return Promise.resolve();
	}

	write(device: IFakeSiReaderBtDevice, characteristic: ReaderBtCharacteristicId, uint8Data: number[], _withResponse: boolean): Promise<unknown> {
		if (!device.data.device.isOpened) {
			return Promise.reject(new DeviceClosedError('Device is not open'));
		}
		device.data.device.simulator.handleWrite(characteristic, uint8Data);
		return Promise.resolve();
	}
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FakeSiReaderBtDriver extends utils.EventTarget<SiReaderBtDriverWithAutodetectionEvents<FakeSiReaderBtDriverData>> {}
utils.applyMixins(FakeSiReaderBtDriver, [utils.EventTarget]);

export const getFakeSiReaderBtDriver = (): FakeSiReaderBtDriver => new FakeSiReaderBtDriver();
