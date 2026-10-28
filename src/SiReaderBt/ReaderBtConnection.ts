import * as utils from '../utils';
import {
	CHARACTERISTIC_BY_REQUEST,
	RESPONSE_MESSAGE_ID_BY_REQUEST,
	UNSOLICITED_MESSAGE_IDS,
	ReaderBtCardState,
	msg,
	type ReaderBtCharacteristicId
} from './readerBtConstants';
import { ReaderBtMessageAssembler, parseCardStateChange, parseSessionDataHeader, renderMessage, type ReaderBtMessage } from './readerBtProtocol';
import { SiDeviceState, type ISiReaderBtDevice, type ISiReaderBtDriverData } from './ISiReaderBtDevice';
import { ReaderBtMessageEvent, type IReaderBtConnection, type ReaderBtConnectionEvents, type ReaderBtRequestOptions } from './IReaderBtConnection';
import {
	ReaderBtCardRemovedError,
	ReaderBtDisconnectedError,
	ReaderBtRequestTask,
	ReaderBtRequestTaskState,
	type ReaderBtFollowUps,
	type ReaderBtRequestTaskTimeouts
} from './ReaderBtRequestTask';

const logger = utils.getLogger('ReaderBtConnection');

// A session transfer can legitimately take minutes.
const DEFAULT_TIMEOUTS: ReaderBtRequestTaskTimeouts = { totalTimeoutMs: 10000, idleTimeoutMs: 3000 };

const TIMEOUTS_BY_REQUEST: { [messageId: number]: ReaderBtRequestTaskTimeouts } = {
	[msg.READ_DEVICE_INFO]: { totalTimeoutMs: 3000, idleTimeoutMs: 3000 },
	[msg.READ_ALL_SETTINGS]: { totalTimeoutMs: 3000, idleTimeoutMs: 3000 },
	[msg.CARD_READOUT_MINIMAL]: { totalTimeoutMs: 15000, idleTimeoutMs: 3000 },
	[msg.CARD_READOUT_COMPLETE]: { totalTimeoutMs: 15000, idleTimeoutMs: 3000 },
	[msg.READ_SESSIONS]: { totalTimeoutMs: 15000, idleTimeoutMs: 5000 },
	[msg.READ_SESSION_DATA]: { totalTimeoutMs: 120000, idleTimeoutMs: 5000 }
};

// Responses that announce further messages on the same characteristic, which complete
// the request together with them.
const FOLLOW_UPS_BY_RESPONSE: { [responseMessageId: number]: (response: ReaderBtMessage) => ReaderBtFollowUps } = {
	[msg.SESSION_DATA_RESPONSE]: (response) => ({
		count: parseSessionDataHeader(response.payload)?.recordCount ?? 0,
		messageIds: [msg.CARD_READOUT_COMPLETE, msg.CARD_READOUT_MINIMAL]
	})
};

const READOUT_REQUEST_IDS = [msg.CARD_READOUT_MINIMAL, msg.CARD_READOUT_COMPLETE];

/** Reassembly, the request queue and request/response correlation for one reader.
 * The protocol has no transaction ids, so a response is matched only by the message id
 * it is expected to carry; to keep that unambiguous exactly one request is in flight at
 * a time, per device. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ReaderBtConnection implements IReaderBtConnection {
	static fromSiReaderBtDevice(siDevice: ISiReaderBtDevice<ISiReaderBtDriverData<unknown>>): ReaderBtConnection {
		if (siDevice.readerBtConnection) {
			return siDevice.readerBtConnection as ReaderBtConnection;
		}
		const instance = new this(siDevice);
		siDevice.readerBtConnection = instance;
		return instance;
	}

	private sendQueue: ReaderBtRequestTask[] = [];

	// One per characteristic, so an unsolicited card-state notification cannot corrupt
	// a segmented readout in progress on another characteristic.
	private assemblerByCharacteristic: { [characteristic: string]: ReaderBtMessageAssembler } = {};

	constructor(public siDevice: ISiReaderBtDevice<ISiReaderBtDriverData<unknown>>) {
		siDevice.addEventListener('notify', (event) => {
			this.handleNotify(event.characteristic, event.uint8Data);
		});
		siDevice.addEventListener('stateChange', (event) => {
			this.handleDeviceStateChange(event.state);
		});
	}

	request(message: ReaderBtMessage, options: ReaderBtRequestOptions = {}): Promise<ReaderBtMessage> {
		const responseMessageId = options.responseMessageId ?? RESPONSE_MESSAGE_ID_BY_REQUEST[message.messageId];
		if (responseMessageId === undefined) {
			return Promise.reject(new Error(`Request 0x${message.messageId.toString(16)} has no response; use send() instead`));
		}
		// A task with an expected response id always carries one when it succeeds.
		return this.enqueue(message, responseMessageId, options).then((task) => task.response as ReaderBtMessage);
	}

	// The response followed by any messages it announced, see FOLLOW_UPS_BY_RESPONSE.
	requestAll(message: ReaderBtMessage, options: ReaderBtRequestOptions = {}): Promise<ReaderBtMessage[]> {
		const responseMessageId = options.responseMessageId ?? RESPONSE_MESSAGE_ID_BY_REQUEST[message.messageId];
		if (responseMessageId === undefined) {
			return Promise.reject(new Error(`Request 0x${message.messageId.toString(16)} has no response; use send() instead`));
		}
		return this.enqueue(message, responseMessageId, options).then((task) => [task.response as ReaderBtMessage, ...task.followUps]);
	}

	send(message: ReaderBtMessage, options: ReaderBtRequestOptions = {}): Promise<unknown> {
		return this.enqueue(message, undefined, options);
	}

	private enqueue(message: ReaderBtMessage, responseMessageId: number | undefined, options: ReaderBtRequestOptions): Promise<ReaderBtRequestTask> {
		const characteristic = options.characteristic ?? CHARACTERISTIC_BY_REQUEST[message.messageId];
		if (characteristic === undefined) {
			return Promise.reject(new Error(`No characteristic known for request 0x${message.messageId.toString(16)}`));
		}
		// Queued while Opening, which is how a card inserted during connect gets read; but
		// a request on a dropped link would otherwise sit out its whole timeout.
		if (this.siDevice.state === SiDeviceState.Closed || this.siDevice.state === SiDeviceState.Closing) {
			return Promise.reject(new ReaderBtDisconnectedError(`Reader BT is ${SiDeviceState[this.siDevice.state].toLowerCase()}`));
		}
		const defaults = TIMEOUTS_BY_REQUEST[message.messageId] ?? DEFAULT_TIMEOUTS;
		const timeouts: ReaderBtRequestTaskTimeouts = {
			totalTimeoutMs: options.totalTimeoutMs ?? defaults.totalTimeoutMs,
			idleTimeoutMs: options.idleTimeoutMs ?? defaults.idleTimeoutMs
		};
		return new Promise<ReaderBtRequestTask>((resolve, reject) => {
			const task = new ReaderBtRequestTask(
				characteristic,
				message,
				responseMessageId,
				timeouts,
				(succeeded) => {
					this.finishTask(succeeded);
					resolve(succeeded);
				},
				(failed, error) => {
					this.finishTask(failed);
					reject(error);
				},
				options.onProgress
			);
			this.sendQueue.push(task);
			task.start();
			this.processSendQueue();
		});
	}

	private finishTask(task: ReaderBtRequestTask): void {
		const index = this.sendQueue.indexOf(task);
		if (index !== -1) {
			this.sendQueue.splice(index, 1);
		}
		this.processSendQueue();
	}

	private processSendQueue(): void {
		const task = this.sendQueue[0];
		if (task === undefined || task.state !== ReaderBtRequestTaskState.Queued) {
			return;
		}
		if (this.siDevice.state !== SiDeviceState.Opened) {
			// Queued work resumes from handleDeviceStateChange once the device opens.
			return;
		}
		task.markInFlight();
		this.siDevice
			.write(task.characteristic, renderMessage(task.message), true)
			.then(() => {
				if (task.expectedResponseMessageId === undefined) {
					task.succeed();
				}
			})
			.catch((error: unknown) => {
				task.fail(error);
			});
	}

	private handleDeviceStateChange(state: SiDeviceState): void {
		if (state === SiDeviceState.Opened) {
			this.processSendQueue();
			return;
		}
		if (state === SiDeviceState.Closing || state === SiDeviceState.Closed) {
			this.abortSendQueue();
		}
	}

	private abortSendQueue(): void {
		const tasks = [...this.sendQueue];
		this.sendQueue = [];
		tasks.forEach((task) => {
			task.fail(new ReaderBtDisconnectedError('Reader BT disconnected'));
		});
		Object.values(this.assemblerByCharacteristic).forEach((assembler) => assembler.reset());
	}

	private getAssembler(characteristic: ReaderBtCharacteristicId): ReaderBtMessageAssembler {
		if (this.assemblerByCharacteristic[characteristic] === undefined) {
			this.assemblerByCharacteristic[characteristic] = new ReaderBtMessageAssembler();
		}
		return this.assemblerByCharacteristic[characteristic];
	}

	private handleNotify(characteristic: ReaderBtCharacteristicId, uint8Data: number[]): void {
		const assembler = this.getAssembler(characteristic);
		const before = assembler.pending;
		const messages = assembler.push(uint8Data);
		const after = assembler.pending;
		// On the segment that completes the transfer pending is already cleared, so report
		// the declared total as fully received.
		if (before !== undefined || after !== undefined) {
			const pending = after ?? (before === undefined ? undefined : { receivedBytes: before.totalBytes, totalBytes: before.totalBytes });
			this.sendQueue[0]?.noteProgress(pending);
		}
		messages.forEach((message) => this.handleMessage(characteristic, message));
	}

	private handleMessage(characteristic: ReaderBtCharacteristicId, message: ReaderBtMessage): void {
		// Dispatched unconditionally, like SiTargetMultiplexer.
		this.dispatchEvent('message', new ReaderBtMessageEvent(this, characteristic, message));

		const task = this.sendQueue[0];
		if (UNSOLICITED_MESSAGE_IDS[message.messageId]) {
			this.handleUnsolicitedMessage(message, task);
			return;
		}
		if (task === undefined || task.isSettled) {
			// Expected with autoRead: the reader pushes a readout nobody asked for.
			logger.debug('Response with no pending request', { messageId: message.messageId, characteristic: characteristic });
			return;
		}
		// Only on the request's own characteristic: an autoRead push on cardData must not
		// be taken for a readout of the session being downloaded.
		if (task.awaitsFollowUp(message.messageId) && characteristic === task.characteristic) {
			task.addFollowUp(message);
			return;
		}
		if (task.expectedResponseMessageId !== message.messageId) {
			logger.warn('Ignoring unexpected response', {
				expected: task.expectedResponseMessageId,
				got: message.messageId
			});
			return;
		}
		task.addResponse(message, FOLLOW_UPS_BY_RESPONSE[message.messageId]?.(message));
	}

	private handleUnsolicitedMessage(message: ReaderBtMessage, task: ReaderBtRequestTask | undefined): void {
		if (message.messageId !== msg.CARD_STATE_CHANGE || task === undefined || task.isSettled || !READOUT_REQUEST_IDS.includes(task.message.messageId)) {
			return;
		}
		const stateChange = parseCardStateChange(message.payload);
		if (stateChange?.state === ReaderBtCardState.Out) {
			task.fail(new ReaderBtCardRemovedError(`Card ${stateChange.cardNumber} was removed before its readout arrived`));
		}
	}
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ReaderBtConnection extends utils.EventTarget<ReaderBtConnectionEvents> {}
utils.applyMixins(ReaderBtConnection, [utils.EventTarget]);
