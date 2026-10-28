import * as utils from '../utils';
import { readerBtNotifyCharacteristicIds, type ReaderBtCharacteristicId } from './readerBtConstants';
import {
	SiDeviceState,
	SiReaderBtDeviceNotifyEvent,
	SiReaderBtDeviceStateChangeEvent,
	type ISiReaderBtDevice,
	type ISiReaderBtDriverData,
	type SiReaderBtDeviceEvents
} from './ISiReaderBtDevice';
import type { ISiReaderBtDriver } from './ISiReaderBtDriver';
import type { IReaderBtConnection } from './IReaderBtConnection';

/** A connected Reader BT, mirroring SiDevice. BLE is push-based, so there is no
 * receiveLoop: where SiDevice.open() starts polling, this subscribes to the notifying
 * characteristics and the driver calls handleNotify() as data arrives. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SiReaderBtDevice<T extends ISiReaderBtDriverData<ISiReaderBtDriver<T>>> implements ISiReaderBtDevice<T> {
	public name: string;
	public ident: string;
	public data: T;
	public readerBtConnection?: IReaderBtConnection;
	private internalState: SiDeviceState;
	private readonly logger: utils.ILogger;

	constructor(typeSpecificIdent: string, data: T) {
		this.data = data;
		this.name = `${data.driver.name}(${typeSpecificIdent})`;
		this.ident = `${data.driver.name}-${typeSpecificIdent}`;
		this.internalState = SiDeviceState.Closed;
		this.logger = utils.getLogger('SiReaderBtDevice');
	}

	get state(): SiDeviceState {
		return this.internalState;
	}

	setState(newState: SiDeviceState): void {
		if (newState !== this.internalState) {
			this.internalState = newState;
			this.dispatchEvent('stateChange', new SiReaderBtDeviceStateChangeEvent(this, newState));
		}
	}

	open(): Promise<ISiReaderBtDevice<T>> {
		if (this.state === SiDeviceState.Closing || this.state === SiDeviceState.Opening) {
			return Promise.reject(new Error(`Cannot open device while ${SiDeviceState[this.state]}`));
		}
		if (this.state === SiDeviceState.Opened) {
			return Promise.resolve(this);
		}
		this.setState(SiDeviceState.Opening);
		return this.data.driver
			.open(this)
			.then(() => Promise.all(readerBtNotifyCharacteristicIds.map((characteristic) => this.data.driver.subscribe(this, characteristic))))
			.then(() => {
				this.setState(SiDeviceState.Opened);
				return this;
			})
			.catch((error: unknown) => {
				this.setState(SiDeviceState.Closed);
				throw error;
			});
	}

	close(): Promise<ISiReaderBtDevice<T>> {
		if (this.state === SiDeviceState.Closing || this.state === SiDeviceState.Opening) {
			return Promise.reject(new Error(`Cannot close device while ${SiDeviceState[this.state]}`));
		}
		if (this.state === SiDeviceState.Closed) {
			return Promise.resolve(this);
		}
		this.setState(SiDeviceState.Closing);
		return this.data.driver
			.close(this)
			.then(() => {
				this.setState(SiDeviceState.Closed);
				return this;
			})
			.catch((error: unknown) => {
				this.setState(SiDeviceState.Closed);
				throw error;
			});
	}

	subscribe(characteristic: ReaderBtCharacteristicId): Promise<unknown> {
		return this.data.driver.subscribe(this, characteristic);
	}

	unsubscribe(characteristic: ReaderBtCharacteristicId): Promise<unknown> {
		return this.data.driver.unsubscribe(this, characteristic);
	}

	write(characteristic: ReaderBtCharacteristicId, uint8Data: number[], withResponse = true): Promise<unknown> {
		this.logger.debug(`=> (${this.name}) ${characteristic}`, { data: utils.prettyHex(uint8Data) });
		return this.data.driver.write(this, characteristic, uint8Data, withResponse);
	}

	handleNotify(characteristic: ReaderBtCharacteristicId, uint8Data: number[]): void {
		this.logger.debug(`<= (${this.name}) ${characteristic}`, { data: utils.prettyHex(uint8Data) });
		this.dispatchEvent('notify', new SiReaderBtDeviceNotifyEvent(this, characteristic, uint8Data));
	}
}
export interface SiReaderBtDevice<T extends ISiReaderBtDriverData<ISiReaderBtDriver<T>>> extends utils.EventTarget<SiReaderBtDeviceEvents> {}
utils.applyMixins(SiReaderBtDevice, [utils.EventTarget]);
