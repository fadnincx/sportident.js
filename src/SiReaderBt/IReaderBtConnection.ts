import * as utils from '../utils';
import type { ReaderBtCharacteristicId } from './readerBtConstants';
import type { ReaderBtMessage } from './readerBtProtocol';
import type { ReaderBtRequestTaskTimeouts } from './ReaderBtRequestTask';

export class ReaderBtMessageEvent extends utils.Event<'message'> {
	constructor(public connection: IReaderBtConnection, public characteristic: ReaderBtCharacteristicId, public message: ReaderBtMessage) {
		super();
	}
}

export type ReaderBtConnectionEvents = {
	message: ReaderBtMessageEvent;
};

export interface ReaderBtRequestOptions extends Partial<ReaderBtRequestTaskTimeouts> {
	responseMessageId?: number; // defaults to RESPONSE_MESSAGE_ID_BY_REQUEST
	characteristic?: ReaderBtCharacteristicId; // defaults to CHARACTERISTIC_BY_REQUEST
	// Only fires for responses split across 0xA101 wrappers; a single-notification
	// response has no intermediate progress to report.
	onProgress?: (receivedBytes: number, totalBytes: number) => void;
}

export interface IReaderBtConnection extends utils.IEventTarget<ReaderBtConnectionEvents> {
	request: (message: ReaderBtMessage, options?: ReaderBtRequestOptions) => Promise<ReaderBtMessage>;
	// the response followed by the messages it announced, e.g. a session's readouts
	requestAll: (message: ReaderBtMessage, options?: ReaderBtRequestOptions) => Promise<ReaderBtMessage[]>;
	// fire and forget: resolves once the write completes
	send: (message: ReaderBtMessage, options?: ReaderBtRequestOptions) => Promise<unknown>;
}
