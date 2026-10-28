import * as utils from '../utils';
import type { ReaderBtCharacteristicId } from './readerBtConstants';
import type { ISiReaderBtDevice, ISiReaderBtDriverData } from './ISiReaderBtDevice';

/** Shaped like ISiDeviceDriver, so a native BLE driver is written the same way as a
 * native serial one. Characteristics are named rather than UUID-addressed so each
 * backend can map them onto its own handles. FakeSiReaderBtDriver is the reference. */
export interface ISiReaderBtDriver<T extends ISiReaderBtDriverData<unknown>> {
	name: string;
	open: (device: ISiReaderBtDevice<T>) => Promise<unknown>;
	close: (device: ISiReaderBtDevice<T>) => Promise<unknown>;
	subscribe: (device: ISiReaderBtDevice<T>, characteristic: ReaderBtCharacteristicId) => Promise<unknown>;
	unsubscribe: (device: ISiReaderBtDevice<T>, characteristic: ReaderBtCharacteristicId) => Promise<unknown>;
	write: (device: ISiReaderBtDevice<T>, characteristic: ReaderBtCharacteristicId, uint8Data: number[], withResponse: boolean) => Promise<unknown>;
}

export interface ISiReaderBtDriverWithDetection<T extends ISiReaderBtDriverData<unknown>, U extends Array<unknown>> extends ISiReaderBtDriver<T> {
	// on Web Bluetooth this must be called from a user gesture
	detect: (...args: U) => Promise<ISiReaderBtDevice<T>>;
}

export class SiReaderBtDeviceAddEvent<T extends ISiReaderBtDriverData<unknown>> extends utils.Event<'add'> {
	constructor(public siDevice: ISiReaderBtDevice<T>) {
		super();
	}
}

export class SiReaderBtDeviceRemoveEvent<T extends ISiReaderBtDriverData<unknown>> extends utils.Event<'remove'> {
	constructor(public siDevice: ISiReaderBtDevice<T>) {
		super();
	}
}

export type SiReaderBtDriverWithAutodetectionEvents<T extends ISiReaderBtDriverData<unknown>> = {
	add: SiReaderBtDeviceAddEvent<T>;
	remove: SiReaderBtDeviceRemoveEvent<T>;
};

/** Only for drivers that can genuinely scan. Web Bluetooth cannot: getDevices() and
 * watchAdvertisements() are behind Chrome flags, so it does not implement this and
 * consumers feature-check. */
export interface ISiReaderBtDriverWithAutodetection<T extends ISiReaderBtDriverData<unknown>>
	extends ISiReaderBtDriver<T>,
		utils.IEventTarget<SiReaderBtDriverWithAutodetectionEvents<T>> {
	startAutoDetection: () => Promise<ISiReaderBtDevice<T>[]>;
	stopAutoDetection: () => Promise<unknown>;
}

export const isSiReaderBtDriverWithAutodetection = <T extends ISiReaderBtDriverData<unknown>>(
	driver: ISiReaderBtDriver<T>
): driver is ISiReaderBtDriverWithAutodetection<T> =>
	typeof (driver as ISiReaderBtDriverWithAutodetection<T>).startAutoDetection === 'function';
