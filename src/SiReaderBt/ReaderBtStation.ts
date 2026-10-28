import * as utils from '../utils';
import type { BaseSiCard } from '../SiCard/BaseSiCard';
import { MAX_SESSIONS, ReaderBtCardState, ReaderBtFeedbackType, ReaderBtOperatingMode, SESSIONS_PER_PAGE, msg, type ReaderBtCharacteristicId } from './readerBtConstants';
import {
	parseAllSettings,
	parseAutosend,
	parseCardReadout,
	parseCardStateChange,
	parseDeviceInfo,
	parseSessionData,
	parseSessionsPage,
	renderCardReadoutRequest,
	renderFeedback,
	renderReadSessionDataRequest,
	renderReadSessionsRequest,
	renderRequest,
	renderSetAutosendRequest,
	renderWriteSettingsRequest,
	type ReaderBtCardReadout,
	type ReaderBtDeviceInfo,
	type ReaderBtMessage,
	type ReaderBtSessionData,
	type ReaderBtSessionEntry,
	type ReaderBtSettings
} from './readerBtProtocol';
import { SiDeviceState, type ISiReaderBtDevice, type ISiReaderBtDriverData } from './ISiReaderBtDevice';
import { ReaderBtConnection } from './ReaderBtConnection';
import { ReaderBtCard, type IReaderBtCardSource } from './ReaderBtCard';
import {
	ReaderBtStationSiCardInsertedEvent,
	ReaderBtStationSiCardObservedEvent,
	ReaderBtStationSiCardRemovedEvent,
	type IReaderBtStation,
	type ReaderBtCleanUpFunction,
	type ReaderBtStationEvents
} from './IReaderBtStation';

const logger = utils.getLogger('ReaderBtStation');

// Fields left out are left as the reader has them.
export interface ReaderBtStationSetup {
	codeNumber?: number;
	autoRead?: boolean; // the per-connection autosend flag, off on every new connection
}

const stationByDevice = new WeakMap<object, ReaderBtStation>();

/** The Reader BT analogue of SiMainStation: turns the connection's message stream into
 * card events, and exposes the settings, feedback and session operations. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ReaderBtStation implements IReaderBtStation, IReaderBtCardSource {
	static fromSiReaderBtDevice(siDevice: ISiReaderBtDevice<ISiReaderBtDriverData<unknown>>): ReaderBtStation {
		const existing = stationByDevice.get(siDevice);
		if (existing !== undefined) {
			return existing;
		}
		const instance = new this(ReaderBtConnection.fromSiReaderBtDevice(siDevice));
		stationByDevice.set(siDevice, instance);
		return instance;
	}

	public siCard: BaseSiCard | null = null;
	public codeNumber?: number; // from the most recent card state change

	// The connection dispatches every message regardless of who consumed it, so track
	// our own requests to tell them apart from autoRead pushes. With autoRead on, a real
	// reader sends no card state changes at all: a pushed readout is the only event.
	private readoutsInFlight = 0;

	constructor(public connection: ReaderBtConnection) {
		connection.addEventListener('message', (event) => {
			this.handleMessage(event.characteristic, event.message);
		});
	}

	get siDevice(): ISiReaderBtDevice<ISiReaderBtDriverData<unknown>> {
		return this.connection.siDevice;
	}

	get ident(): string {
		return this.siDevice.ident;
	}

	open(): Promise<ReaderBtStation> {
		return this.siDevice.open().then(() => this);
	}

	close(): Promise<ReaderBtStation> {
		return this.siDevice.close().then(() => this);
	}

	readDeviceInfo(): Promise<ReaderBtDeviceInfo> {
		return this.connection.request(renderRequest(msg.READ_DEVICE_INFO)).then((response) => {
			const info = parseDeviceInfo(response.payload);
			if (info === undefined) {
				throw new Error('Could not parse the Reader BT device info');
			}
			return info;
		});
	}

	readSettings(): Promise<ReaderBtSettings> {
		return this.connection.request(renderRequest(msg.READ_ALL_SETTINGS)).then((response) => {
			const settings = parseAllSettings(response.payload);
			if (settings === undefined) {
				throw new Error('Could not parse the Reader BT settings');
			}
			return settings;
		});
	}

	// The spec does not say whether 0x010D is acknowledged, so read back afterwards:
	// that is correct under either behaviour. Pass settings from readSettings() so the
	// operating mode and reserved bytes go back unchanged: changing the mode while
	// connected terminates the BLE connection.
	writeSettings(settings: ReaderBtSettings): Promise<ReaderBtSettings> {
		if (ReaderBtOperatingMode[settings.operatingMode] === undefined) {
			return Promise.reject(new Error(`Invalid Reader BT operating mode 0x${settings.operatingMode.toString(16)}`));
		}
		return this.connection.send(renderWriteSettingsRequest(settings)).then(() => this.readSettings());
	}

	readAutosend(): Promise<boolean> {
		return this.connection.request(renderRequest(msg.READ_AUTOSEND)).then((response) => {
			const enabled = parseAutosend(response.payload);
			if (enabled === undefined) {
				throw new Error('Could not parse the Reader BT autosend state');
			}
			return enabled;
		});
	}

	// Per connection: the reader resets it to off on every new connection.
	setAutosend(enabled: boolean): Promise<unknown> {
		return this.connection.send(renderSetAutosendRequest(enabled));
	}

	signal(feedbackType: ReaderBtFeedbackType = ReaderBtFeedbackType.Ok): Promise<unknown> {
		return this.sendFeedback(feedbackType);
	}

	sendFeedback(feedbackType: ReaderBtFeedbackType): Promise<unknown> {
		return this.connection.send(renderFeedback(feedbackType));
	}

	requestCardReadout(complete: boolean, onProgress?: (receivedBytes: number, totalBytes: number) => void): Promise<ReaderBtCardReadout> {
		this.readoutsInFlight += 1;
		return this.connection
			.request(renderCardReadoutRequest(complete), { onProgress: onProgress })
			.then((response) => {
				const readout = parseCardReadout(response.payload, complete);
				if (readout === undefined) {
					throw new Error('Could not parse the Reader BT card readout');
				}
				return readout;
			})
			.finally(() => {
				this.readoutsInFlight -= 1;
			});
	}

	// Pages through the session lookup table, newest first. Page numbering is not pinned
	// down by the spec, so read totalPages from the first response and cap the loop.
	async listSessions(): Promise<ReaderBtSessionEntry[]> {
		const entries: ReaderBtSessionEntry[] = [];
		const maxPages = Math.ceil(MAX_SESSIONS / SESSIONS_PER_PAGE) + 1;
		let totalPages = 1;
		for (let pageNumber = 0; pageNumber < totalPages && pageNumber < maxPages; pageNumber++) {
			const response = await this.connection.request(renderReadSessionsRequest(pageNumber));
			const page = parseSessionsPage(response.payload);
			if (page === undefined) {
				throw new Error('Could not parse the Reader BT sessions page');
			}
			entries.push(...page.entries);
			totalPages = Math.max(page.totalPages, 1);
			if (page.entries.length === 0) {
				break;
			}
		}
		return entries;
	}

	// Every card read during the session, as complete readouts.
	readSessionData(sessionNumber: number): Promise<ReaderBtSessionData> {
		return this.connection.requestAll(renderReadSessionDataRequest(sessionNumber)).then(([header, ...readouts]) => {
			const data = parseSessionData(header, readouts);
			if (data === undefined) {
				throw new Error('Could not parse the Reader BT session data');
			}
			return data;
		});
	}

	// Same contract as SiMainStation.readCards. Only what setup asks to change is written,
	// and the cleanup restores just that. autoRead is best left off: with it on the reader
	// pushes readouts nobody asked for, which the router tolerates but which breaks the
	// request/response model the rest of the library assumes.
	async readCards(onCardInserted: (card: BaseSiCard) => void, setup: ReaderBtStationSetup = {}): Promise<ReaderBtCleanUpFunction> {
		const restores: (() => Promise<unknown>)[] = [];
		if (setup.codeNumber !== undefined) {
			const previousSettings = await this.readSettings();
			if (previousSettings.codeNumber !== setup.codeNumber) {
				await this.writeSettings({ ...previousSettings, codeNumber: setup.codeNumber });
				restores.push(() => this.writeSettings(previousSettings));
			}
		}
		if (setup.autoRead !== undefined) {
			const previousAutosend = await this.readAutosend();
			if (previousAutosend !== setup.autoRead) {
				await this.setAutosend(setup.autoRead);
				restores.push(() => this.setAutosend(previousAutosend));
			}
		}
		const listener = (event: ReaderBtStationSiCardInsertedEvent): void => onCardInserted(event.siCard);
		this.addEventListener('siCardInserted', listener);
		return async () => {
			this.removeEventListener('siCardInserted', listener);
			for (const restore of restores.reverse()) {
				await restore();
			}
		};
	}

	private handleMessage(characteristic: ReaderBtCharacteristicId, message: ReaderBtMessage): void {
		if (message.messageId === msg.CARD_STATE_CHANGE) {
			this.handleCardStateChange(message);
			return;
		}
		// Readouts on the sessions characteristic are stored ones, part of a session download.
		if (characteristic === 'cardData' && (message.messageId === msg.CARD_READOUT_MINIMAL || message.messageId === msg.CARD_READOUT_COMPLETE)) {
			this.handleUnsolicitedReadout(message);
		}
	}

	private handleCardStateChange(message: ReaderBtMessage): void {
		const stateChange = parseCardStateChange(message.payload);
		if (stateChange === undefined) {
			return;
		}
		this.codeNumber = stateChange.codeNumber;
		if (stateChange.state === ReaderBtCardState.In) {
			const card = new ReaderBtCard(stateChange.cardNumber);
			card.source = this;
			card.deviceCodeNumber = stateChange.codeNumber;
			this.siCard = card;
			this.dispatchEvent('siCardInserted', new ReaderBtStationSiCardInsertedEvent(this, card));
			return;
		}
		const removedCard = this.siCard ?? Object.assign(new ReaderBtCard(stateChange.cardNumber), { source: this });
		this.siCard = null;
		this.dispatchEvent('siCardRemoved', new ReaderBtStationSiCardRemovedEvent(this, removedCard));
	}

	private handleUnsolicitedReadout(message: ReaderBtMessage): void {
		if (this.readoutsInFlight > 0) {
			return; // our own request, requestCardReadout handles it
		}
		const readout = parseCardReadout(message.payload, message.messageId === msg.CARD_READOUT_COMPLETE);
		if (readout === undefined) {
			logger.warn('Could not parse an unsolicited card readout');
			return;
		}
		const card = ReaderBtCard.fromReadout(readout);
		card.source = this;
		card.deviceCodeNumber = this.codeNumber;
		this.dispatchEvent('siCardObserved', new ReaderBtStationSiCardObservedEvent(this, card));
	}
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ReaderBtStation extends utils.EventTarget<ReaderBtStationEvents> {}
utils.applyMixins(ReaderBtStation, [utils.EventTarget]);

// convenience mirror of SiMainStation.fromSiDevice
export const getReaderBtStation = (siDevice: ISiReaderBtDevice<ISiReaderBtDriverData<unknown>>): ReaderBtStation => ReaderBtStation.fromSiReaderBtDevice(siDevice);

export { SiDeviceState };
