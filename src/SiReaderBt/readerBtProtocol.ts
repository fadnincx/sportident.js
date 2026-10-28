// Reader BT wire format, the counterpart of siProtocol.ts. No BLE or DOM dependency.
// All multi-byte integers are little-endian; utils.arr2big is big-endian and unusable here.

import * as utils from '../utils';
import type * as siProtocol from '../siProtocol';
import {
	CONTROL_INFO_BEACON_PUNCHING_MASK,
	CONTROL_INFO_STATION_MODE_MASK,
	CONTROL_INFO_RADIO_MODE_MASK,
	CONTROL_INFO_RADIO_MODE_SHIFT,
	MESSAGE_HEADER_LENGTH,
	MS_PER_DAY,
	MS_PER_SECOND,
	MS_PER_WEEK,
	OWNER_DATA_LENGTHS,
	PUNCH_RECORD_LENGTH,
	ReaderBtCardFamily,
	ReaderBtCharacterSet,
	ReaderBtFeedbackType,
	ReaderBtSegmentFlag,
	SESSION_ENTRY_LENGTH,
	SIAC_CARD_NUMBER_MAX,
	SIAC_CARD_NUMBER_MIN,
	SIAC_PRODUCTION_DATA_LENGTH,
	msg
} from './readerBtConstants';

const logger = utils.getLogger('ReaderBtProtocol');

// Little-endian primitives

export const readUint8 = (data: number[], offset: number): number => data[offset];

export const readUint16LE = (data: number[], offset: number): number => data[offset] | (data[offset + 1] << 8);

// Multiplication, not <<, because << 24 would produce a signed result.
export const readUint32LE = (data: number[], offset: number): number =>
	data[offset] + data[offset + 1] * 0x100 + data[offset + 2] * 0x10000 + data[offset + 3] * 0x1000000;

// No BigInt: the build targets es6. Unix seconds (~1.8e9) are far below 2^53.
export const readUint64LE = (data: number[], offset: number): number => readUint32LE(data, offset) + readUint32LE(data, offset + 4) * 0x100000000;

export const writeUint16LE = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff];

export const writeUint32LE = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];

// Message framing

export interface ReaderBtMessage {
	messageId: number;
	payload: number[];
}

export interface ReaderBtMessageParseResult {
	message: ReaderBtMessage | null;
	remainder: number[];
}

export const renderMessage = (message: ReaderBtMessage): number[] => {
	if (message.payload.length > 0xffff) {
		throw new utils.SiError(`Reader BT payload too long: ${message.payload.length}`);
	}
	return [...writeUint16LE(message.messageId), ...writeUint16LE(message.payload.length), ...message.payload];
};

// Returns message: null while the buffer is incomplete, like siProtocol.parse.
export const parseMessage = (data: number[]): ReaderBtMessageParseResult => {
	if (data.length < MESSAGE_HEADER_LENGTH) {
		return { message: null, remainder: data };
	}
	const messageId = readUint16LE(data, 0);
	const payloadLength = readUint16LE(data, 2);
	const totalLength = MESSAGE_HEADER_LENGTH + payloadLength;
	if (data.length < totalLength) {
		return { message: null, remainder: data };
	}
	return {
		message: { messageId: messageId, payload: data.slice(MESSAGE_HEADER_LENGTH, totalLength) },
		remainder: data.slice(totalLength)
	};
};

export const parseAllMessages = (data: number[]): { messages: ReaderBtMessage[]; remainder: number[] } => {
	const messages: ReaderBtMessage[] = [];
	let remainder = data;
	for (;;) {
		const result = parseMessage(remainder);
		if (result.message === null) {
			return { messages: messages, remainder: result.remainder };
		}
		messages.push(result.message);
		remainder = result.remainder;
	}
};

// Segmentation (wrapper message 0xA101)

// Reassembles messages split across several BLE notifications.
// The frame buffer and the segment accumulator are separate, so an unsolicited
// CardStateChange arriving mid-transfer cannot corrupt an in-progress reassembly.
// A segmented transfer is a byte stream, not one message: a session data response is
// its 8-byte header followed by every card readout of the session.
export class ReaderBtMessageAssembler {
	private frameBuffer: number[] = [];
	private segmentBuffer: number[] = [];
	private segmentTotalLength?: number;

	// Returns the messages this notification completed, if any.
	push(notificationBytes: number[]): ReaderBtMessage[] {
		const { messages, remainder } = parseAllMessages([...this.frameBuffer, ...notificationBytes]);
		this.frameBuffer = remainder;
		const completed: ReaderBtMessage[] = [];
		messages.forEach((message) => {
			if (message.messageId !== msg.SEGMENT_WRAPPER) {
				completed.push(message);
				return;
			}
			completed.push(...this.handleSegment(message.payload));
		});
		return completed;
	}

	reset(): void {
		this.frameBuffer = [];
		this.segmentBuffer = [];
		this.segmentTotalLength = undefined;
	}

	// undefined when no segmented transfer is in progress
	get pending(): { receivedBytes: number; totalBytes: number } | undefined {
		if (this.segmentTotalLength === undefined) {
			return undefined;
		}
		return { receivedBytes: this.segmentBuffer.length, totalBytes: this.segmentTotalLength };
	}

	private handleSegment(payload: number[]): ReaderBtMessage[] {
		if (payload.length < 1) {
			logger.warn('Ignoring empty segment wrapper');
			return [];
		}
		const flag = payload[0];
		if (flag === ReaderBtSegmentFlag.First) {
			if (payload.length < 5) {
				logger.warn('Ignoring truncated first segment', { length: payload.length });
				return [];
			}
			if (this.segmentTotalLength !== undefined) {
				logger.warn('New transfer started before the previous one finished', {
					discardedBytes: this.segmentBuffer.length
				});
			}
			this.segmentTotalLength = readUint32LE(payload, 1);
			this.segmentBuffer = payload.slice(5);
		} else if (flag === ReaderBtSegmentFlag.Subsequent || flag === ReaderBtSegmentFlag.Last) {
			if (this.segmentTotalLength === undefined) {
				logger.warn('Ignoring continuation segment with no transfer in progress', { flag: flag });
				return [];
			}
			this.segmentBuffer = [...this.segmentBuffer, ...payload.slice(1)];
		} else {
			logger.warn('Ignoring segment with unknown flag', { flag: flag });
			return [];
		}

		// Also complete on reaching the declared length, in case a firmware omits Last.
		const isComplete = flag === ReaderBtSegmentFlag.Last || this.segmentBuffer.length >= this.segmentTotalLength;
		if (!isComplete) {
			return [];
		}
		if (this.segmentBuffer.length !== this.segmentTotalLength) {
			logger.warn('Reassembled length differs from the declared total', {
				actual: this.segmentBuffer.length,
				declared: this.segmentTotalLength
			});
		}
		const { messages, remainder } = parseAllMessages(this.segmentBuffer);
		this.segmentBuffer = [];
		this.segmentTotalLength = undefined;
		if (remainder.length > 0) {
			logger.warn('Reassembled bytes end in an incomplete message', { discardedBytes: remainder.length });
		}
		return messages;
	}
}

// Times

// ms within the week (Sunday 00:00:00.000 = 0) to SiTimestamp, whose time is
// seconds within a day. weekday uses the same 0 = Sunday convention as the SI encoding.
export const msInWeekToSiTimestamp = (timeInWeekMs: number): siProtocol.SiTimestamp => {
	if (!Number.isFinite(timeInWeekMs) || timeInWeekMs < 0 || timeInWeekMs >= MS_PER_WEEK) {
		logger.warn('Time outside the week range', { timeInWeekMs: timeInWeekMs });
		return null;
	}
	const msOfDay = timeInWeekMs % MS_PER_DAY;
	return {
		time: Math.floor(msOfDay / MS_PER_SECOND),
		weekday: Math.floor(timeInWeekMs / MS_PER_DAY),
		milliseconds: msOfDay % MS_PER_SECOND
	};
};

export const siTimestampToMsInWeek = (timestamp: siProtocol.SiTimestamp): number | undefined => {
	if (timestamp === null) {
		return undefined;
	}
	const weekday = timestamp.weekday ?? 0;
	return weekday * MS_PER_DAY + timestamp.time * MS_PER_SECOND + (timestamp.milliseconds ?? 0);
};

// Punch records

export interface ReaderBtPunch {
	punchType: number;
	controlCode: number;
	timeInWeekMs: number;
	time: siProtocol.SiTimestamp;
	controlInfo: number; // raw byte, 0x00 on non-SIAC cards
	stationMode: number; // bits 0-5, see SiStationMode; 0 when the card does not record it
	beaconMode: boolean; // bit 5: 1 = punching mode, 0 = timing mode
	radioMode: number; // bits 6-7, see ReaderBtRadioMode
}

export const parsePunchRecord = (data: number[], offset = 0): ReaderBtPunch | undefined => {
	if (data.length < offset + PUNCH_RECORD_LENGTH) {
		return undefined;
	}
	const controlInfo = readUint8(data, offset);
	const timeInWeekMs = readUint32LE(data, offset + 4);
	return {
		punchType: readUint8(data, offset + 1),
		controlCode: readUint16LE(data, offset + 2),
		timeInWeekMs: timeInWeekMs,
		time: msInWeekToSiTimestamp(timeInWeekMs),
		controlInfo: controlInfo,
		stationMode: controlInfo & CONTROL_INFO_STATION_MODE_MASK,
		beaconMode: (controlInfo & CONTROL_INFO_BEACON_PUNCHING_MASK) !== 0,
		radioMode: (controlInfo & CONTROL_INFO_RADIO_MODE_MASK) >> CONTROL_INFO_RADIO_MODE_SHIFT
	};
};

// Stops short rather than throwing when the buffer is truncated.
export const parsePunchRecords = (data: number[], offset: number, count: number): ReaderBtPunch[] => {
	const punches: ReaderBtPunch[] = [];
	for (let index = 0; index < count; index++) {
		const punch = parsePunchRecord(data, offset + index * PUNCH_RECORD_LENGTH);
		if (punch === undefined) {
			logger.warn('Punch records truncated', { expected: count, got: punches.length });
			return punches;
		}
		punches.push(punch);
	}
	return punches;
};

// Card state change (0x1101)

export interface ReaderBtCardStateChange {
	cardNumber: number;
	state: number; // see ReaderBtCardState
	codeNumber: number;
}

export const parseCardStateChange = (payload: number[]): ReaderBtCardStateChange | undefined => {
	if (payload.length < 7) {
		logger.warn('CardStateChange payload too short', { length: payload.length });
		return undefined;
	}
	return {
		cardNumber: readUint32LE(payload, 0),
		state: readUint8(payload, 4),
		codeNumber: readUint16LE(payload, 5)
	};
};

// Owner data

const OWNER_FIELDS_BASIC = ['firstName', 'lastName'];
const OWNER_FIELDS_MODERN = ['firstName', 'lastName', 'gender', 'birthday', 'club', 'email', 'phone', 'city', 'street', 'zip', 'country'];

// Card text is CP850 whatever the charset byte claims, see ReaderBtCharacterSet. A table
// rather than TextDecoder, which has no CP850 and which jsdom lacks under Jest.
// Stops at the first NUL.
const decodeText = (data: number[]): string => {
	const endIndex = data.indexOf(0);
	return utils.decodeCp850(endIndex === -1 ? data : data.slice(0, endIndex));
};

export const parseOwnerData = (data: number[], cardFamily: number): { [property: string]: unknown } | undefined => {
	if (data.length === 0) {
		return undefined;
	}
	// Real readers send a leading character_set byte; treat byte 0 as one only when it is
	// a known value, so a block without it still parses.
	const leadingByte = data[0];
	const hasCharacterSetByte = leadingByte === ReaderBtCharacterSet.Iso8859_1 || leadingByte === ReaderBtCharacterSet.Gb2312;
	const characterSet = hasCharacterSetByte ? leadingByte : ReaderBtCharacterSet.Iso8859_1;
	const stringBytes = hasCharacterSetByte ? data.slice(1) : data;

	const characterSetUnsupported = characterSet === ReaderBtCharacterSet.Gb2312;
	if (characterSetUnsupported) {
		logger.warn('GB2312 owner data is decoded as CP850; non-ASCII characters will be wrong');
	}

	const components = decodeText(stringBytes).split(';');
	const fields = cardFamily === ReaderBtCardFamily.SiCard8 || cardFamily === ReaderBtCardFamily.SiCard9 ? OWNER_FIELDS_BASIC : OWNER_FIELDS_MODERN;
	const cardHolder: { [property: string]: unknown } = {};
	fields.forEach((field, index) => {
		cardHolder[field] = components[index];
	});
	cardHolder.isComplete = components.length >= fields.length;
	if (characterSetUnsupported) {
		cardHolder.characterSetUnsupported = true;
	}
	return cardHolder;
};

// SIAC production data

export interface ReaderBtSiacProduction {
	hardwareVersion: string;
	softwareVersion: string;
	signalCount: number;
	clearCount: number;
	batteryMilliVolts: number; // as reported, i.e. already millivolts
	batteryDate?: Date;
	productionDate?: Date;
}

const formatVersion = (raw: number): string => `${Math.floor(raw / 10)}.${raw % 10}`;

const toDate = (year: number, month: number, day: number): Date | undefined => {
	if (year === 0 && month === 0 && day === 0) {
		return undefined;
	}
	if (month === 0) {
		return undefined;
	}
	return new Date(2000 + year, month - 1, day);
};

export const parseSiacProductionData = (data: number[]): ReaderBtSiacProduction | undefined => {
	if (data.length < SIAC_PRODUCTION_DATA_LENGTH) {
		return undefined;
	}
	return {
		hardwareVersion: formatVersion(readUint8(data, 0)),
		softwareVersion: formatVersion(readUint8(data, 1)),
		signalCount: readUint16LE(data, 2),
		clearCount: readUint16LE(data, 4),
		batteryMilliVolts: readUint16LE(data, 6),
		batteryDate: toDate(readUint8(data, 8), readUint8(data, 9), readUint8(data, 10)),
		productionDate: toDate(readUint8(data, 11), readUint8(data, 12), 1)
	};
};

// Card readout (0x1102 minimal / 0x1103 complete)

export interface ReaderBtCardReadout {
	cardNumber: number;
	cardFamily: number;
	punchCount: number;
	punches: ReaderBtPunch[];
	siac?: ReaderBtSiacProduction;
	cardHolder?: { [property: string]: unknown };
}

const CARD_READOUT_HEADER_LENGTH = 7;

const isPlausibleOwnerLength = (length: number): boolean => OWNER_DATA_LENGTHS.some((expected) => length === expected || length === expected + 1);

// Splits the complete-readout tail into the optional SIAC production block and the
// owner data. The SIAC block is present only for card numbers in the SIAC range: family
// 15 is shared by SiCard10, SiCard11 and SIAC, which have different layouts. The length
// cross-check stops a wrong guess from misaligning the owner block.
const splitCompleteReadoutTail = (tail: number[], cardNumber: number): { siacBytes?: number[]; ownerBytes: number[] } => {
	const expectsSiac = cardNumber >= SIAC_CARD_NUMBER_MIN && cardNumber < SIAC_CARD_NUMBER_MAX;
	const canSplit = tail.length >= SIAC_PRODUCTION_DATA_LENGTH;
	if (expectsSiac && canSplit && isPlausibleOwnerLength(tail.length - SIAC_PRODUCTION_DATA_LENGTH)) {
		return { siacBytes: tail.slice(0, SIAC_PRODUCTION_DATA_LENGTH), ownerBytes: tail.slice(SIAC_PRODUCTION_DATA_LENGTH) };
	}
	if (isPlausibleOwnerLength(tail.length)) {
		return { ownerBytes: tail };
	}
	if (expectsSiac && canSplit) {
		logger.warn('Unexpected complete-readout tail length; assuming SIAC block plus owner data', { tailLength: tail.length });
		return { siacBytes: tail.slice(0, SIAC_PRODUCTION_DATA_LENGTH), ownerBytes: tail.slice(SIAC_PRODUCTION_DATA_LENGTH) };
	}
	if (tail.length > 0) {
		logger.warn('Unexpected complete-readout tail length; assuming owner data only', { tailLength: tail.length });
	}
	return { ownerBytes: tail };
};

export const parseCardReadout = (payload: number[], complete: boolean): ReaderBtCardReadout | undefined => {
	if (payload.length < CARD_READOUT_HEADER_LENGTH) {
		logger.warn('Card readout payload too short', { length: payload.length });
		return undefined;
	}
	const cardNumber = readUint32LE(payload, 0);
	const cardFamily = readUint8(payload, 4);
	const punchCount = readUint16LE(payload, 5);
	const punches = parsePunchRecords(payload, CARD_READOUT_HEADER_LENGTH, punchCount);
	const readout: ReaderBtCardReadout = {
		cardNumber: cardNumber,
		cardFamily: cardFamily,
		punchCount: punchCount,
		punches: punches
	};
	if (!complete) {
		return readout;
	}
	const tail = payload.slice(CARD_READOUT_HEADER_LENGTH + punches.length * PUNCH_RECORD_LENGTH);
	const { siacBytes, ownerBytes } = splitCompleteReadoutTail(tail, cardNumber);
	if (siacBytes !== undefined) {
		readout.siac = parseSiacProductionData(siacBytes);
	}
	const cardHolder = parseOwnerData(ownerBytes, cardFamily);
	if (cardHolder !== undefined) {
		readout.cardHolder = cardHolder;
	}
	return readout;
};

// Device info (0x010E)

export interface ReaderBtDeviceInfo {
	serialNumber: number;
	deviceType: number;
	hardwareVersion: string;
	productionDate?: Date;
	batteryDate?: Date;
	softwareVersion: string;
}

const DEVICE_INFO_MIN_LENGTH = 16;

/** Device info carries a full 4-digit year, unlike the card's years-since-2000. */
const toFullDate = (year: number, month: number, day: number): Date | undefined => {
	if (year === 0 || month === 0) {
		return undefined;
	}
	return new Date(year, month - 1, day);
};

export const parseDeviceInfo = (payload: number[]): ReaderBtDeviceInfo | undefined => {
	if (payload.length < DEVICE_INFO_MIN_LENGTH) {
		logger.warn('DeviceInfo payload too short', { length: payload.length });
		return undefined;
	}
	return {
		serialNumber: readUint32LE(payload, 0),
		deviceType: readUint16LE(payload, 4),
		hardwareVersion: `${readUint8(payload, 6)}.${readUint8(payload, 7)}`,
		productionDate: toFullDate(readUint16LE(payload, 8), readUint8(payload, 10), readUint8(payload, 11)),
		batteryDate: toFullDate(readUint16LE(payload, 12), readUint8(payload, 14), readUint8(payload, 15)),
		softwareVersion: decodeText(payload.slice(DEVICE_INFO_MIN_LENGTH))
	};
};

// Settings (0x010C / 0x010D) and autosend (0x010F / 0x0110)

// Auto-read is not part of these settings, it is the per-connection autosend flag.
export interface ReaderBtSettings {
	codeNumber: number;
	operatingMode: number; // see ReaderBtOperatingMode
	// Bytes 3-9, reserved for future use. Kept as read so a read-modify-write sends them
	// back unchanged; written as zeros when absent.
	reserved?: number[];
}

const SETTINGS_LENGTH = 10;
const SETTINGS_RESERVED_OFFSET = 3;

export const parseAllSettings = (payload: number[]): ReaderBtSettings | undefined => {
	if (payload.length < SETTINGS_RESERVED_OFFSET) {
		logger.warn('Settings payload too short', { length: payload.length });
		return undefined;
	}
	return {
		codeNumber: readUint16LE(payload, 0),
		operatingMode: readUint8(payload, 2),
		reserved: payload.slice(SETTINGS_RESERVED_OFFSET, SETTINGS_LENGTH)
	};
};

export const renderAllSettings = (settings: ReaderBtSettings): number[] => {
	const payload = [...writeUint16LE(settings.codeNumber), settings.operatingMode & 0xff, ...(settings.reserved ?? [])].slice(0, SETTINGS_LENGTH);
	while (payload.length < SETTINGS_LENGTH) {
		payload.push(0);
	}
	return payload;
};

export const parseAutosend = (payload: number[]): boolean | undefined => {
	if (payload.length < 1) {
		logger.warn('Autosend payload too short', { length: payload.length });
		return undefined;
	}
	return readUint8(payload, 0) === 1;
};

// Sessions (0x3101 / 0x3103 and 0x3102 / 0x3104)

export interface ReaderBtSessionEntry {
	sessionNumber: number;
	startTimeRaw: number; // unix seconds, 0 when the reader had no wall clock
	endTimeRaw: number; // unix seconds, or a duration when startTimeRaw is 0
	startDate?: Date;
	endDate?: Date;
	durationSeconds?: number;
	numberOfRecords: number;
}

export interface ReaderBtSessionsPage {
	pageNumber: number;
	totalPages: number;
	entriesCount: number;
	entries: ReaderBtSessionEntry[];
}

const SESSIONS_PAGE_HEADER_LENGTH = 3;

export const parseSessionEntry = (data: number[], offset: number): ReaderBtSessionEntry | undefined => {
	if (data.length < offset + SESSION_ENTRY_LENGTH) {
		return undefined;
	}
	const startTimeRaw = readUint64LE(data, offset + 2);
	const endTimeRaw = readUint64LE(data, offset + 10);
	const hasStart = startTimeRaw !== 0;
	return {
		sessionNumber: readUint16LE(data, offset),
		startTimeRaw: startTimeRaw,
		endTimeRaw: endTimeRaw,
		startDate: hasStart ? new Date(startTimeRaw * 1000) : undefined,
		endDate: hasStart ? new Date(endTimeRaw * 1000) : undefined,
		durationSeconds: hasStart ? endTimeRaw - startTimeRaw : endTimeRaw,
		numberOfRecords: readUint16LE(data, offset + 18)
	};
};

export const parseSessionsPage = (payload: number[]): ReaderBtSessionsPage | undefined => {
	if (payload.length < SESSIONS_PAGE_HEADER_LENGTH) {
		logger.warn('Sessions page payload too short', { length: payload.length });
		return undefined;
	}
	const entriesCount = readUint8(payload, 2);
	const entries: ReaderBtSessionEntry[] = [];
	for (let index = 0; index < entriesCount; index++) {
		const entry = parseSessionEntry(payload, SESSIONS_PAGE_HEADER_LENGTH + index * SESSION_ENTRY_LENGTH);
		if (entry === undefined) {
			logger.warn('Session entries truncated', { expected: entriesCount, got: entries.length });
			break;
		}
		entries.push(entry);
	}
	return {
		pageNumber: readUint8(payload, 0),
		totalPages: readUint8(payload, 1),
		entriesCount: entriesCount,
		entries: entries
	};
};

// As seen on a real reader, the 0x3104 message is only this header. The session's card
// readouts follow it in the same transfer, each a complete 0x1103 message, together
// byteLength bytes long.
export interface ReaderBtSessionDataHeader {
	sessionNumber: number;
	recordCount: number; // card readouts that follow, the entry's numberOfRecords
	byteLength: number;
}

const SESSION_DATA_HEADER_LENGTH = 8;

export const parseSessionDataHeader = (payload: number[]): ReaderBtSessionDataHeader | undefined => {
	if (payload.length < SESSION_DATA_HEADER_LENGTH) {
		logger.warn('Session data header too short', { length: payload.length });
		return undefined;
	}
	return {
		sessionNumber: readUint16LE(payload, 0),
		recordCount: readUint16LE(payload, 2),
		byteLength: readUint32LE(payload, 4)
	};
};

export const renderSessionDataHeader = (sessionNumber: number, readouts: ReaderBtMessage[]): number[] => [
	...writeUint16LE(sessionNumber),
	...writeUint16LE(readouts.length),
	...writeUint32LE(readouts.reduce((total, readout) => total + MESSAGE_HEADER_LENGTH + readout.payload.length, 0))
];

export interface ReaderBtSessionData {
	sessionNumber: number;
	recordCount: number;
	readouts: ReaderBtCardReadout[];
}

export const parseSessionData = (header: ReaderBtMessage, readoutMessages: ReaderBtMessage[]): ReaderBtSessionData | undefined => {
	const parsedHeader = parseSessionDataHeader(header.payload);
	if (parsedHeader === undefined) {
		return undefined;
	}
	const readouts: ReaderBtCardReadout[] = [];
	readoutMessages.forEach((message) => {
		const readout = parseCardReadout(message.payload, message.messageId === msg.CARD_READOUT_COMPLETE);
		if (readout !== undefined) {
			readouts.push(readout);
		}
	});
	if (readouts.length !== parsedHeader.recordCount) {
		logger.warn('Session readout count differs from the header', { expected: parsedHeader.recordCount, got: readouts.length });
	}
	return { sessionNumber: parsedHeader.sessionNumber, recordCount: parsedHeader.recordCount, readouts: readouts };
};

// Request builders

export const renderRequest = (messageId: number, payload: number[] = []): ReaderBtMessage => ({ messageId: messageId, payload: payload });

export const renderFeedback = (feedbackType: ReaderBtFeedbackType): ReaderBtMessage => renderRequest(msg.FEEDBACK, [feedbackType]);

export const renderCardReadoutRequest = (complete: boolean): ReaderBtMessage => renderRequest(complete ? msg.CARD_READOUT_COMPLETE : msg.CARD_READOUT_MINIMAL);

export const renderReadSessionsRequest = (pageNumber: number): ReaderBtMessage => renderRequest(msg.READ_SESSIONS, [pageNumber & 0xff]);

export const renderReadSessionDataRequest = (sessionNumber: number): ReaderBtMessage => renderRequest(msg.READ_SESSION_DATA, writeUint16LE(sessionNumber));

export const renderWriteSettingsRequest = (settings: ReaderBtSettings): ReaderBtMessage => renderRequest(msg.WRITE_ALL_SETTINGS, renderAllSettings(settings));

export const renderSetAutosendRequest = (enabled: boolean): ReaderBtMessage => renderRequest(msg.SET_AUTOSEND, [enabled ? 1 : 0]);
