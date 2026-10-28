// SPEC-DERIVED fixtures, not verified against real hardware.
// Replace with real captures once a device is available.

import {
	ReaderBtCardFamily,
	ReaderBtCardState,
	ReaderBtCharacterSet,
	ReaderBtOperatingMode,
	ReaderBtPunchType,
	ReaderBtSegmentFlag,
	msg
} from './readerBtConstants';
import { encodeCp850 } from '../utils/charset';
import { renderMessage, renderSessionDataHeader, writeUint16LE, writeUint32LE, type ReaderBtMessage } from './readerBtProtocol';

const punchRecord = (controlInfo: number, punchType: number, controlCode: number, timeInWeekMs: number): number[] => [
	controlInfo,
	punchType,
	...writeUint16LE(controlCode),
	...writeUint32LE(timeInWeekMs)
];

export const EXAMPLE_TIME_IN_WEEK_MS = 183845000;


const ownerDataBlock = (text: string, length: number, characterSet = ReaderBtCharacterSet.Iso8859_1): number[] => {
	const block = [characterSet, ...encodeCp850(text), 0];
	while (block.length < length) {
		block.push(0);
	}
	return block.slice(0, length);
};

// Card state change (0x1101)

export const CARD_INSERTED_PAYLOAD = [...writeUint32LE(8123456), ReaderBtCardState.In, ...writeUint16LE(31)];

export const CARD_REMOVED_PAYLOAD = [...writeUint32LE(8123456), ReaderBtCardState.Out, ...writeUint16LE(31)];

export const CARD_INSERTED_MESSAGE: ReaderBtMessage = { messageId: msg.CARD_STATE_CHANGE, payload: CARD_INSERTED_PAYLOAD };

// Minimal readout (0x1102) - SI-Card 9, three punches

export const SICARD9_MINIMAL_PUNCHES = [
	punchRecord(0x00, ReaderBtPunchType.Check, 0, 180000000),
	punchRecord(0x00, ReaderBtPunchType.Start, 1, 183600000),
	punchRecord(0x00, ReaderBtPunchType.Control, 31, EXAMPLE_TIME_IN_WEEK_MS),
	punchRecord(0x00, ReaderBtPunchType.Control, 32, 183900000),
	punchRecord(0x00, ReaderBtPunchType.Finish, 2, 184000000)
];

export const SICARD9_MINIMAL_PAYLOAD = [
	...writeUint32LE(1234567),
	ReaderBtCardFamily.SiCard9,
	...writeUint16LE(SICARD9_MINIMAL_PUNCHES.length),
	...SICARD9_MINIMAL_PUNCHES.flat()
];

export const SICARD9_MINIMAL_MESSAGE: ReaderBtMessage = { messageId: msg.CARD_READOUT_MINIMAL, payload: SICARD9_MINIMAL_PAYLOAD };

// Complete readout (0x1103) - SIAC, with production data and owner data

// hw 1.6, sw 4.3, 12 signals, 5 clears, 2.95 V, battery 2023-04-05, produced 2022-09
export const SIAC_PRODUCTION_DATA = [16, 43, ...writeUint16LE(12), ...writeUint16LE(5), ...writeUint16LE(2950), 23, 4, 5, 22, 9];

export const SIAC_OWNER_DATA = ownerDataBlock('Ada;Lovelace;F;1815;Analytical OC;ada@example.org;+41790000000;London;Marylebone;W1;GB', 128);

export const SIAC_PUNCHES = [
	punchRecord(0x00, ReaderBtPunchType.Clear, 0, 179000000),
	punchRecord(0x00, ReaderBtPunchType.Check, 0, 180000000),
	punchRecord(0x00, ReaderBtPunchType.Start, 1, 183600000),
	// Beacon punching mode, radio mode "All"
	punchRecord(0xa0, ReaderBtPunchType.Control, 31, EXAMPLE_TIME_IN_WEEK_MS),
	punchRecord(0x00, ReaderBtPunchType.Finish, 2, 184000000)
];

export const SIAC_CARD_NUMBER = 8123456;

export const SIAC_COMPLETE_PAYLOAD = [
	...writeUint32LE(SIAC_CARD_NUMBER),
	ReaderBtCardFamily.Modern,
	...writeUint16LE(SIAC_PUNCHES.length),
	...SIAC_PUNCHES.flat(),
	...SIAC_PRODUCTION_DATA,
	...SIAC_OWNER_DATA
];

export const SIAC_COMPLETE_MESSAGE: ReaderBtMessage = { messageId: msg.CARD_READOUT_COMPLETE, payload: SIAC_COMPLETE_PAYLOAD };

// Same family as the SIAC above but outside the SIAC card number range, so it carries
// no production data block.
export const SICARD10_COMPLETE_PAYLOAD = [
	...writeUint32LE(7123456),
	ReaderBtCardFamily.Modern,
	...writeUint16LE(1),
	...punchRecord(0x00, ReaderBtPunchType.Control, 31, EXAMPLE_TIME_IN_WEEK_MS),
	...ownerDataBlock('Grace;Hopper;F;1906;Navy OC;grace@example.org;+15550000000;Arlington;Main;22201;US', 128)
];

export const SICARD8_CARD_NUMBER = 2003456;

export const SICARD8_COMPLETE_PAYLOAD = [
	...writeUint32LE(SICARD8_CARD_NUMBER),
	ReaderBtCardFamily.SiCard8,
	...writeUint16LE(1),
	...punchRecord(0x00, ReaderBtPunchType.Control, 31, EXAMPLE_TIME_IN_WEEK_MS),
	...ownerDataBlock('Alan;Turing', 104)
];

// Device info (0x010E) and settings (0x010C)

export const DEVICE_INFO_PAYLOAD = [
	...writeUint32LE(654321),
	...writeUint16LE(0x00a7),
	1,
	2,
	...writeUint16LE(2025),
	6,
	15,
	...writeUint16LE(2025),
	6,
	1,
	...encodeCp850('1.2.3'),
	0
];

export const DEVICE_INFO_MESSAGE: ReaderBtMessage = { messageId: msg.READ_DEVICE_INFO, payload: DEVICE_INFO_PAYLOAD };

export const SETTINGS_PAYLOAD = [...writeUint16LE(31), ReaderBtOperatingMode.Readout, 0, 0, 0, 0, 0, 0, 0];

// As sent by a real Reader BT (software sireader@2.2.0) on code number 5.
export const REAL_SETTINGS_PAYLOAD = [0x05, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

export const SETTINGS_MESSAGE: ReaderBtMessage = { messageId: msg.READ_ALL_SETTINGS, payload: SETTINGS_PAYLOAD };

// Sessions (0x3103)

const sessionEntry = (sessionNumber: number, startTime: number, endTime: number, numberOfRecords: number): number[] => [
	...writeUint16LE(sessionNumber),
	...writeUint32LE(startTime),
	...writeUint32LE(0),
	...writeUint32LE(endTime),
	...writeUint32LE(0),
	...writeUint16LE(numberOfRecords)
];

export const SESSIONS_PAGE_PAYLOAD = [
	0,
	1,
	2,
	...sessionEntry(12, 1750000000, 1750003600, 42),
	// startTime 0 means the reader had no wall clock; endTime is then a duration.
	...sessionEntry(11, 0, 3600, 7)
];

export const SESSIONS_PAGE_MESSAGE: ReaderBtMessage = { messageId: msg.SESSIONS_RESPONSE, payload: SESSIONS_PAGE_PAYLOAD };

// Session data (0x3104): the readouts a session holds. On the wire they follow an
// 8-byte header in one transfer, see sessionDataTransfer.
export const SESSION_READOUTS: ReaderBtMessage[] = [
	{ messageId: msg.CARD_READOUT_COMPLETE, payload: SICARD8_COMPLETE_PAYLOAD },
	{ messageId: msg.CARD_READOUT_COMPLETE, payload: SIAC_COMPLETE_PAYLOAD }
];

export const sessionDataTransfer = (sessionNumber: number, readouts: ReaderBtMessage[]): ReaderBtMessage[] => [
	{ messageId: msg.SESSION_DATA_RESPONSE, payload: renderSessionDataHeader(sessionNumber, readouts) },
	...readouts
];


// Splits rendered messages into 0xA101 wrapper notifications of at most
// segmentPayloadSize bytes each, as the reader does for large responses. A real reader
// puts a session's header and readouts in one such transfer.
export const segmentMessages = (messages: ReaderBtMessage[], segmentPayloadSize: number): number[][] => {
	const rendered = messages.flatMap((message) => renderMessage(message));
	const notifications: number[][] = [];
	for (let offset = 0; offset < rendered.length; offset += segmentPayloadSize) {
		const chunk = rendered.slice(offset, offset + segmentPayloadSize);
		const isFirst = offset === 0;
		const isLast = offset + segmentPayloadSize >= rendered.length;
		const wrapperPayload = isFirst
			? [ReaderBtSegmentFlag.First, ...writeUint32LE(rendered.length), ...chunk]
			: [isLast ? ReaderBtSegmentFlag.Last : ReaderBtSegmentFlag.Subsequent, ...chunk];
		notifications.push(renderMessage({ messageId: msg.SEGMENT_WRAPPER, payload: wrapperPayload }));
	}
	return notifications;
};

export const segmentMessage = (message: ReaderBtMessage, segmentPayloadSize: number): number[][] => segmentMessages([message], segmentPayloadSize);
