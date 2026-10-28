import * as utils from '../utils';
import { msg, ReaderBtCardState, ReaderBtOperatingMode, type ReaderBtCharacteristicId } from '../SiReaderBt/readerBtConstants';
import {
	parseAllMessages,
	parseAllSettings,
	renderAllSettings,
	renderMessage,
	writeUint16LE,
	writeUint32LE,
	type ReaderBtMessage,
	type ReaderBtSettings
} from '../SiReaderBt/readerBtProtocol';
import {
	segmentMessages,
	sessionDataTransfer,
	DEVICE_INFO_PAYLOAD,
	SESSIONS_PAGE_PAYLOAD,
	SESSION_READOUTS,
	SIAC_COMPLETE_PAYLOAD,
	SICARD9_MINIMAL_PAYLOAD
} from '../SiReaderBt/readerBtExamples';

const logger = utils.getLogger('FakeReaderBtDevice');

export interface FakeReaderBtDeviceOptions {
	settings?: ReaderBtSettings;
	deviceInfoPayload?: number[];
	completeReadoutPayload?: number[];
	minimalReadoutPayload?: number[];
	// payloads for the 0x3103 response, indexed by page number
	sessionsPages?: number[][];
	// the card readouts each session holds
	sessionDataByNumber?: { [sessionNumber: number]: ReaderBtMessage[] };
	segmentPayloadSize?: number; // split responses into 0xA101 segments, i.e. a small MTU
	// Real notifications arrive spread over time; set this to exercise anything that
	// reacts to a transfer in flight, such as progress smoothing or the idle timeout.
	segmentDelayMs?: number;
	dropResponses?: boolean; // accept requests but never answer, to exercise timeouts
}

export interface RecordedWrite {
	characteristic: ReaderBtCharacteristicId;
	messageId: number;
	payload: number[];
}

/** A message-level Reader BT simulator, in the spirit of FakeSiMainStation. Answers
 * requests with fixture responses, pushes unsolicited card-state notifications, and can
 * segment or drop responses. */
export class FakeReaderBtDevice {
	public settings: ReaderBtSettings;
	public autosend = false; // per connection, reset by connect()
	public deviceInfoPayload: number[];
	public completeReadoutPayload: number[];
	public minimalReadoutPayload: number[];
	public sessionsPages: number[][];
	public sessionDataByNumber: { [sessionNumber: number]: ReaderBtMessage[] };
	public segmentPayloadSize?: number;
	public segmentDelayMs?: number;
	public dropResponses: boolean;

	public writes: RecordedWrite[] = []; // every request written, in order
	public feedbacks: number[] = []; // feedback types requested via 0x1110, in order

	// set by the driver, receives each notification the simulator emits
	public onNotify?: (characteristic: ReaderBtCharacteristicId, uint8Data: number[]) => void;
	// set by the driver, called when the simulator terminates the connection
	public onDisconnect?: () => void;

	constructor(options: FakeReaderBtDeviceOptions = {}) {
		this.settings = options.settings ?? { codeNumber: 10, operatingMode: ReaderBtOperatingMode.Readout, reserved: [0, 0, 0, 0, 0, 0, 0] };
		this.deviceInfoPayload = options.deviceInfoPayload ?? DEVICE_INFO_PAYLOAD;
		this.completeReadoutPayload = options.completeReadoutPayload ?? SIAC_COMPLETE_PAYLOAD;
		this.minimalReadoutPayload = options.minimalReadoutPayload ?? SICARD9_MINIMAL_PAYLOAD;
		this.sessionsPages = options.sessionsPages ?? [SESSIONS_PAGE_PAYLOAD];
		this.sessionDataByNumber = options.sessionDataByNumber ?? { 12: SESSION_READOUTS };
		this.segmentPayloadSize = options.segmentPayloadSize;
		this.segmentDelayMs = options.segmentDelayMs;
		this.dropResponses = options.dropResponses ?? false;
	}

	// Called by the driver when a client connects.
	connect(): void {
		this.autosend = false;
	}

	// Handles one write from the driver, emitting any response asynchronously.
	handleWrite(characteristic: ReaderBtCharacteristicId, uint8Data: number[]): void {
		const { messages } = parseAllMessages(uint8Data);
		messages.forEach((message) => {
			this.writes.push({ characteristic: characteristic, messageId: message.messageId, payload: message.payload });
			const response = this.buildResponse(message);
			if (response === undefined || this.dropResponses) {
				return;
			}
			this.emitLater(response.characteristic, response.messages);
		});
	}

	// Emits an unsolicited CardStateChange saying a card was inserted.
	insertCard(cardNumber: number, codeNumber = this.settings.codeNumber): void {
		this.emitCardState(cardNumber, ReaderBtCardState.In, codeNumber);
		if (this.autosend) {
			this.emitLater('cardData', [{ messageId: msg.CARD_READOUT_COMPLETE, payload: this.completeReadoutPayload }]);
		}
	}

	// Emits an unsolicited CardStateChange saying a card was removed.
	removeCard(cardNumber: number, codeNumber = this.settings.codeNumber): void {
		this.emitCardState(cardNumber, ReaderBtCardState.Out, codeNumber);
	}

	// Emits an arbitrary message, for tests that need an unexpected notification.
	emit(characteristic: ReaderBtCharacteristicId, message: ReaderBtMessage): void {
		this.emitTransfer(characteristic, [message]);
	}

	// Emits messages as one transfer, which is how a session download arrives.
	emitTransfer(characteristic: ReaderBtCharacteristicId, messages: ReaderBtMessage[]): void {
		const notifications =
			this.segmentPayloadSize === undefined ? [messages.flatMap((message) => renderMessage(message))] : segmentMessages(messages, this.segmentPayloadSize);
		notifications.forEach((notification, index) => {
			if (this.segmentDelayMs === undefined || index === 0) {
				this.deliver(characteristic, notification);
				return;
			}
			setTimeout(() => this.deliver(characteristic, notification), index * this.segmentDelayMs);
		});
	}

	private deliver(characteristic: ReaderBtCharacteristicId, notification: number[]): void {
		if (this.onNotify === undefined) {
			logger.warn('No listener for notification', { characteristic: characteristic });
			return;
		}
		this.onNotify(characteristic, notification);
	}

	private emitCardState(cardNumber: number, state: number, codeNumber: number): void {
		this.emitLater('cardState', [
			{
				messageId: msg.CARD_STATE_CHANGE,
				payload: [...writeUint32LE(cardNumber), state, ...writeUint16LE(codeNumber)]
			}
		]);
	}

	// Real notifications never arrive synchronously inside a write.
	private emitLater(characteristic: ReaderBtCharacteristicId, messages: ReaderBtMessage[]): void {
		void Promise.resolve().then(() => this.emitTransfer(characteristic, messages));
	}

	private buildResponse(request: ReaderBtMessage): { characteristic: ReaderBtCharacteristicId; messages: ReaderBtMessage[] } | undefined {
		const single = this.buildSingleResponse(request);
		if (single !== undefined) {
			return { characteristic: single.characteristic, messages: [single.message] };
		}
		if (request.messageId !== msg.READ_SESSION_DATA) {
			return undefined;
		}
		const sessionNumber = (request.payload[0] ?? 0) | ((request.payload[1] ?? 0) << 8);
		const readouts = this.sessionDataByNumber[sessionNumber];
		if (readouts === undefined) {
			logger.warn('No fixture for session', { sessionNumber: sessionNumber });
			return undefined;
		}
		return { characteristic: 'sessions', messages: sessionDataTransfer(sessionNumber, readouts) };
	}

	private buildSingleResponse(request: ReaderBtMessage): { characteristic: ReaderBtCharacteristicId; message: ReaderBtMessage } | undefined {
		switch (request.messageId) {
			case msg.READ_DEVICE_INFO:
				return { characteristic: 'readSettings', message: { messageId: msg.READ_DEVICE_INFO, payload: this.deviceInfoPayload } };
			case msg.READ_ALL_SETTINGS:
				return { characteristic: 'readSettings', message: { messageId: msg.READ_ALL_SETTINGS, payload: renderAllSettings(this.settings) } };
			case msg.WRITE_ALL_SETTINGS: {
				const newSettings = parseAllSettings(request.payload);
				if (newSettings === undefined) {
					return undefined;
				}
				// A real reader left its settings unchanged when sent mode 0x00.
				if (ReaderBtOperatingMode[newSettings.operatingMode] === undefined) {
					logger.warn('Ignoring settings with an invalid operating mode', { operatingMode: newSettings.operatingMode });
					return undefined;
				}
				const modeChanged = newSettings.operatingMode !== this.settings.operatingMode;
				this.settings = newSettings;
				if (modeChanged) {
					// per the spec, a mode change while connected terminates the connection
					void Promise.resolve().then(() => this.onDisconnect?.());
				}
				// The spec does not say whether 0x010D is acknowledged, assume it is not.
				return undefined;
			}
			case msg.SET_AUTOSEND:
				this.autosend = request.payload[0] === 1;
				return undefined;
			case msg.READ_AUTOSEND:
				return { characteristic: 'readSettings', message: { messageId: msg.READ_AUTOSEND, payload: [this.autosend ? 1 : 0] } };
			case msg.CARD_READOUT_MINIMAL:
				return { characteristic: 'cardData', message: { messageId: msg.CARD_READOUT_MINIMAL, payload: this.minimalReadoutPayload } };
			case msg.CARD_READOUT_COMPLETE:
				return { characteristic: 'cardData', message: { messageId: msg.CARD_READOUT_COMPLETE, payload: this.completeReadoutPayload } };
			case msg.FEEDBACK:
				this.feedbacks.push(request.payload[0]);
				return undefined;
			case msg.READ_SESSIONS: {
				const pageNumber = request.payload[0] ?? 0;
				const page = this.sessionsPages[pageNumber];
				if (page === undefined) {
					logger.warn('No fixture for sessions page', { pageNumber: pageNumber });
					return undefined;
				}
				return { characteristic: 'sessions', message: { messageId: msg.SESSIONS_RESPONSE, payload: page } };
			}
			case msg.READ_SESSION_DATA:
				return undefined; // a multi-message transfer, see buildResponse
			default:
				logger.warn('Unhandled request', { messageId: request.messageId });
				return undefined;
		}
	}
}
