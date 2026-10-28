import * as utils from '../utils';
import { SiDeviceState } from '../SiDevice/ISiDevice';
import type { ReaderBtCharacteristicId } from './readerBtConstants';
import type { IReaderBtConnection } from './IReaderBtConnection';

// Same lifecycle as the serial devices, so the state enum and error are reused.
export { SiDeviceState, DeviceClosedError } from '../SiDevice/ISiDevice';

export interface ISiReaderBtDriverData<T> {
	driver: T;
}

export class SiReaderBtDeviceStateChangeEvent extends utils.Event<'stateChange'> {
	constructor(public siDevice: ISiReaderBtDevice<ISiReaderBtDriverData<unknown>>, public state: SiDeviceState) {
		super();
	}
}

// Unlike SiDeviceReceiveEvent this carries the characteristic id as well as the bytes:
// the same message id means different things on different characteristics.
export class SiReaderBtDeviceNotifyEvent extends utils.Event<'notify'> {
	constructor(
		public siDevice: ISiReaderBtDevice<ISiReaderBtDriverData<unknown>>,
		public characteristic: ReaderBtCharacteristicId,
		public uint8Data: number[]
	) {
		super();
	}
}

export type SiReaderBtDeviceEvents = {
	stateChange: SiReaderBtDeviceStateChangeEvent;
	notify: SiReaderBtDeviceNotifyEvent;
};

export interface ISiReaderBtDevice<T extends ISiReaderBtDriverData<unknown>> extends utils.IEventTarget<SiReaderBtDeviceEvents> {
	name: string;
	ident: string;
	state: SiDeviceState;
	setState: (newState: SiDeviceState) => void;
	data: T;
	// memoised by ReaderBtConnection.fromSiReaderBtDevice
	readerBtConnection?: IReaderBtConnection;
	open: () => Promise<ISiReaderBtDevice<T>>;
	close: () => Promise<ISiReaderBtDevice<T>>;
	subscribe: (characteristic: ReaderBtCharacteristicId) => Promise<unknown>;
	unsubscribe: (characteristic: ReaderBtCharacteristicId) => Promise<unknown>;
	write: (characteristic: ReaderBtCharacteristicId, uint8Data: number[], withResponse?: boolean) => Promise<unknown>;
	// called by the driver when a subscribed characteristic notifies
	handleNotify: (characteristic: ReaderBtCharacteristicId, uint8Data: number[]) => void;
}
