import { beforeAll, afterAll, describe, expect, test } from '@jest/globals';
import { LogLevel, setDefaultLogLevel, getDefaultLogLevel } from '../utils/logging';
import { encodeCp850 } from '../utils/charset';
import {
	ReaderBtCardFamily,
	ReaderBtCardState,
	ReaderBtCharacterSet,
	ReaderBtFeedbackType,
	ReaderBtOperatingMode,
	ReaderBtPunchType,
	ReaderBtRadioMode,
	ReaderBtSegmentFlag,
	msg
} from './readerBtConstants';
import {
	ReaderBtMessageAssembler,
	msInWeekToSiTimestamp,
	parseAllMessages,
	parseAllSettings,
	parseAutosend,
	parseCardReadout,
	parseCardStateChange,
	parseDeviceInfo,
	parseMessage,
	parseOwnerData,
	parsePunchRecord,
	parsePunchRecords,
	parseSessionData,
	parseSessionDataHeader,
	renderSessionDataHeader,
	parseSessionEntry,
	parseSessionsPage,
	parseSiacProductionData,
	readUint16LE,
	readUint32LE,
	readUint64LE,
	readUint8,
	renderAllSettings,
	renderCardReadoutRequest,
	renderFeedback,
	renderMessage,
	renderReadSessionDataRequest,
	renderReadSessionsRequest,
	renderRequest,
	renderSetAutosendRequest,
	renderWriteSettingsRequest,
	siTimestampToMsInWeek,
	writeUint16LE,
	writeUint32LE,
	type ReaderBtMessage
} from './readerBtProtocol';
import {
	CARD_INSERTED_PAYLOAD,
	CARD_REMOVED_PAYLOAD,
	DEVICE_INFO_PAYLOAD,
	EXAMPLE_TIME_IN_WEEK_MS,
	SESSIONS_PAGE_PAYLOAD,
	SESSION_READOUTS,
	sessionDataTransfer,
	REAL_SETTINGS_PAYLOAD,
	SETTINGS_PAYLOAD,
	SIAC_CARD_NUMBER,
	SIAC_COMPLETE_PAYLOAD,
	SIAC_PRODUCTION_DATA,
	SICARD10_COMPLETE_PAYLOAD,
	SICARD8_COMPLETE_PAYLOAD,
	SICARD9_MINIMAL_PAYLOAD,
	segmentMessage
} from './readerBtExamples';

// The codec logs warnings on every tolerated malformation, which is most of this suite.
let previousLogLevel: LogLevel;
beforeAll(() => {
	previousLogLevel = getDefaultLogLevel();
	setDefaultLogLevel(LogLevel.ERROR);
});
afterAll(() => {
	setDefaultLogLevel(previousLogLevel);
});

const latin1 = (text: string): number[] => text.split('').map((character) => character.charCodeAt(0));

describe('readerBtProtocol', () => {
	describe('little-endian primitives', () => {
		test('readUint8', () => {
			expect(readUint8([0x11, 0x22], 1)).toBe(0x22);
		});
		test('readUint16LE', () => {
			expect(readUint16LE([0x34, 0x12], 0)).toBe(0x1234);
		});
		test('readUint32LE keeps the high bit unsigned', () => {
			expect(readUint32LE([0x00, 0x00, 0x00, 0x80], 0)).toBe(0x80000000);
			expect(readUint32LE([0xff, 0xff, 0xff, 0xff], 0)).toBe(0xffffffff);
		});
		test('readUint64LE', () => {
			expect(readUint64LE([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 0)).toBe(1);
			expect(readUint64LE([0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00], 0)).toBe(0x100000000);
		});
		test('writeUint16LE / writeUint32LE round-trip', () => {
			expect(readUint16LE(writeUint16LE(0xabcd), 0)).toBe(0xabcd);
			expect(readUint32LE(writeUint32LE(0xdeadbeef), 0)).toBe(0xdeadbeef);
		});
	});

	describe('renderMessage / parseMessage', () => {
		test('round-trips', () => {
			const message: ReaderBtMessage = { messageId: 0x1102, payload: [1, 2, 3] };
			expect(renderMessage(message)).toEqual([0x02, 0x11, 0x03, 0x00, 1, 2, 3]);
			expect(parseMessage(renderMessage(message))).toEqual({ message: message, remainder: [] });
		});
		test('round-trips every request builder', () => {
			const requests = [
				renderCardReadoutRequest(true),
				renderCardReadoutRequest(false),
				renderFeedback(ReaderBtFeedbackType.Ok),
				renderReadSessionsRequest(3),
				renderReadSessionDataRequest(4242),
				renderWriteSettingsRequest({ codeNumber: 31, operatingMode: ReaderBtOperatingMode.Readout }),
				renderSetAutosendRequest(true),
				renderRequest(msg.READ_DEVICE_INFO)
			];
			requests.forEach((request) => {
				expect(parseMessage(renderMessage(request)).message).toEqual(request);
			});
		});
		test('rejects an over-long payload', () => {
			expect(() => renderMessage({ messageId: 1, payload: new Array(0x10000).fill(0) })).toThrow();
		});
		test('returns no message for a truncated header', () => {
			expect(parseMessage([0x02, 0x11, 0x03])).toEqual({ message: null, remainder: [0x02, 0x11, 0x03] });
		});
		test('returns no message for a truncated payload', () => {
			const truncated = [0x02, 0x11, 0x03, 0x00, 1, 2];
			expect(parseMessage(truncated)).toEqual({ message: null, remainder: truncated });
		});
		test('leaves trailing bytes in the remainder', () => {
			expect(parseMessage([0x02, 0x11, 0x00, 0x00, 0xaa])).toEqual({
				message: { messageId: 0x1102, payload: [] },
				remainder: [0xaa]
			});
		});
	});

	describe('parseAllMessages', () => {
		test('handles an empty buffer', () => {
			expect(parseAllMessages([])).toEqual({ messages: [], remainder: [] });
		});
		test('parses two messages from one buffer', () => {
			const first: ReaderBtMessage = { messageId: 0x1101, payload: [1] };
			const second: ReaderBtMessage = { messageId: 0x1102, payload: [2, 3] };
			expect(parseAllMessages([...renderMessage(first), ...renderMessage(second)])).toEqual({
				messages: [first, second],
				remainder: []
			});
		});
		test('keeps a trailing partial message as the remainder', () => {
			const complete = renderMessage({ messageId: 0x1101, payload: [1] });
			const result = parseAllMessages([...complete, 0x02, 0x11]);
			expect(result.messages).toHaveLength(1);
			expect(result.remainder).toEqual([0x02, 0x11]);
		});
	});

	describe('ReaderBtMessageAssembler', () => {
		const cardInserted: ReaderBtMessage = { messageId: msg.CARD_STATE_CHANGE, payload: CARD_INSERTED_PAYLOAD };
		const bigMessage: ReaderBtMessage = { messageId: msg.CARD_READOUT_COMPLETE, payload: SIAC_COMPLETE_PAYLOAD };

		test('passes unsegmented messages straight through', () => {
			const assembler = new ReaderBtMessageAssembler();
			expect(assembler.push(renderMessage(cardInserted))).toEqual([cardInserted]);
		});

		test('reassembles a segmented message', () => {
			const assembler = new ReaderBtMessageAssembler();
			const notifications = segmentMessage(bigMessage, 40);
			expect(notifications.length).toBeGreaterThan(2);
			const completed = notifications.flatMap((notification) => assembler.push(notification));
			expect(completed).toEqual([bigMessage]);
		});

		test('reassembles regardless of where the notifications are split', () => {
			const notifications = segmentMessage(bigMessage, 37);
			const flattened = notifications.flat();
			for (let splitAt = 1; splitAt < flattened.length; splitAt += 17) {
				const assembler = new ReaderBtMessageAssembler();
				const completed = [...assembler.push(flattened.slice(0, splitAt)), ...assembler.push(flattened.slice(splitAt))];
				expect(completed).toEqual([bigMessage]);
			}
		});

		test('reassembles a message that fits in a single segment', () => {
			const assembler = new ReaderBtMessageAssembler();
			const completed = segmentMessage(cardInserted, 1000).flatMap((n) => assembler.push(n));
			expect(completed).toEqual([cardInserted]);
		});

		test('lets an unsolicited message through mid-transfer without corrupting it', () => {
			const assembler = new ReaderBtMessageAssembler();
			const notifications = segmentMessage(bigMessage, 40);
			const completed: ReaderBtMessage[] = [];
			completed.push(...assembler.push(notifications[0]));
			completed.push(...assembler.push(renderMessage(cardInserted)));
			notifications.slice(1).forEach((n) => completed.push(...assembler.push(n)));
			expect(completed).toEqual([cardInserted, bigMessage]);
		});

		test('reports progress while a transfer is in flight', () => {
			const assembler = new ReaderBtMessageAssembler();
			expect(assembler.pending).toBeUndefined();
			const notifications = segmentMessage(bigMessage, 40);
			assembler.push(notifications[0]);
			expect(assembler.pending).toEqual({
				receivedBytes: 40,
				totalBytes: renderMessage(bigMessage).length
			});
			notifications.slice(1).forEach((n) => assembler.push(n));
			expect(assembler.pending).toBeUndefined();
		});

		test('reset discards a partial transfer', () => {
			const assembler = new ReaderBtMessageAssembler();
			assembler.push(segmentMessage(bigMessage, 40)[0]);
			assembler.reset();
			expect(assembler.pending).toBeUndefined();
		});

		const wrapper = (payload: number[]): number[] => renderMessage({ messageId: msg.SEGMENT_WRAPPER, payload: payload });

		test('ignores an empty wrapper payload', () => {
			expect(new ReaderBtMessageAssembler().push(wrapper([]))).toEqual([]);
		});
		test('ignores a truncated first segment', () => {
			expect(new ReaderBtMessageAssembler().push(wrapper([ReaderBtSegmentFlag.First, 1, 2]))).toEqual([]);
		});
		test('ignores a continuation with no transfer in progress', () => {
			expect(new ReaderBtMessageAssembler().push(wrapper([ReaderBtSegmentFlag.Subsequent, 1, 2]))).toEqual([]);
			expect(new ReaderBtMessageAssembler().push(wrapper([ReaderBtSegmentFlag.Last, 1, 2]))).toEqual([]);
		});
		test('ignores an unknown segment flag', () => {
			expect(new ReaderBtMessageAssembler().push(wrapper([0x7f, 1, 2]))).toEqual([]);
		});
		test('restarts when a new transfer begins before the previous one finished', () => {
			const assembler = new ReaderBtMessageAssembler();
			assembler.push(wrapper([ReaderBtSegmentFlag.First, ...writeUint32LE(999), 1, 2, 3]));
			const completed = segmentMessage(cardInserted, 1000).flatMap((n) => assembler.push(n));
			expect(completed).toEqual([cardInserted]);
		});
		test('still completes when the declared total does not match', () => {
			const assembler = new ReaderBtMessageAssembler();
			const rendered = renderMessage(cardInserted);
			assembler.push(wrapper([ReaderBtSegmentFlag.First, ...writeUint32LE(999), ...rendered]));
			expect(assembler.push(wrapper([ReaderBtSegmentFlag.Last]))).toEqual([cardInserted]);
		});
		test('discards reassembled bytes that are not a complete message', () => {
			const assembler = new ReaderBtMessageAssembler();
			expect(assembler.push(wrapper([ReaderBtSegmentFlag.First, ...writeUint32LE(2), 0x01, 0x02]))).toEqual([]);
			expect(assembler.pending).toBeUndefined();
		});
	});

	describe('msInWeekToSiTimestamp', () => {
		test('converts the documented example', () => {
			// 183845000 ms = Tuesday 03:04:05.000
			expect(msInWeekToSiTimestamp(EXAMPLE_TIME_IN_WEEK_MS)).toEqual({
				time: 3 * 3600 + 4 * 60 + 5,
				weekday: 2,
				milliseconds: 0
			});
		});
		test('handles the start of the week', () => {
			expect(msInWeekToSiTimestamp(0)).toEqual({ time: 0, weekday: 0, milliseconds: 0 });
		});
		test('handles the last millisecond of Sunday', () => {
			expect(msInWeekToSiTimestamp(86399999)).toEqual({ time: 86399, weekday: 0, milliseconds: 999 });
		});
		test('handles the last millisecond of the week', () => {
			expect(msInWeekToSiTimestamp(604799999)).toEqual({ time: 86399, weekday: 6, milliseconds: 999 });
		});
		test('rejects out-of-range and non-finite values', () => {
			expect(msInWeekToSiTimestamp(-1)).toBeNull();
			expect(msInWeekToSiTimestamp(604800000)).toBeNull();
			expect(msInWeekToSiTimestamp(NaN)).toBeNull();
		});
	});

	describe('siTimestampToMsInWeek', () => {
		test('round-trips', () => {
			expect(siTimestampToMsInWeek(msInWeekToSiTimestamp(EXAMPLE_TIME_IN_WEEK_MS))).toBe(EXAMPLE_TIME_IN_WEEK_MS);
			expect(siTimestampToMsInWeek(msInWeekToSiTimestamp(604799999))).toBe(604799999);
		});
		test('treats missing weekday and milliseconds as zero', () => {
			expect(siTimestampToMsInWeek({ time: 10 })).toBe(10000);
		});
		test('returns undefined for NO_TIME', () => {
			expect(siTimestampToMsInWeek(null)).toBeUndefined();
		});
	});

	describe('parsePunchRecord', () => {
		test('parses a plain control punch', () => {
			const punch = parsePunchRecord([0x00, ReaderBtPunchType.Control, 0x1f, 0x00, ...writeUint32LE(EXAMPLE_TIME_IN_WEEK_MS)]);
			expect(punch).toEqual({
				punchType: ReaderBtPunchType.Control,
				controlCode: 31,
				timeInWeekMs: EXAMPLE_TIME_IN_WEEK_MS,
				time: { time: 11045, weekday: 2, milliseconds: 0 },
				controlInfo: 0x00,
				stationMode: 0,
				beaconMode: false,
				radioMode: ReaderBtRadioMode.No
			});
		});
		test('decodes the beacon and radio mode bits', () => {
			const punch = parsePunchRecord([0xe0, ReaderBtPunchType.Control, 0x1f, 0x00, ...writeUint32LE(0)]);
			expect(punch?.beaconMode).toBe(true);
			expect(punch?.radioMode).toBe(ReaderBtRadioMode.AllNew);
		});
		test('splits the station mode off the radio mode bits', () => {
			// BeaconControl (0x32) recorded with radio mode All
			const punch = parsePunchRecord([0xb2, ReaderBtPunchType.Control, 0x1f, 0x00, ...writeUint32LE(0)]);
			expect(punch?.stationMode).toBe(0x32);
			expect(punch?.radioMode).toBe(ReaderBtRadioMode.All);
		});
		test('reads at an offset', () => {
			const data = [0xff, 0xff, 0x00, ReaderBtPunchType.Start, 0x01, 0x00, ...writeUint32LE(0)];
			expect(parsePunchRecord(data, 2)?.punchType).toBe(ReaderBtPunchType.Start);
		});
		test('returns undefined when truncated', () => {
			expect(parsePunchRecord([0x00, 0x07, 0x1f])).toBeUndefined();
		});
	});

	describe('parsePunchRecords', () => {
		test('stops short when the buffer is truncated', () => {
			const oneRecord = [0x00, ReaderBtPunchType.Control, 0x1f, 0x00, ...writeUint32LE(0)];
			expect(parsePunchRecords([...oneRecord, 0x00], 0, 2)).toHaveLength(1);
		});
	});

	describe('parseCardStateChange', () => {
		test('parses an insertion', () => {
			expect(parseCardStateChange(CARD_INSERTED_PAYLOAD)).toEqual({
				cardNumber: 8123456,
				state: ReaderBtCardState.In,
				codeNumber: 31
			});
		});
		test('parses a removal', () => {
			expect(parseCardStateChange(CARD_REMOVED_PAYLOAD)?.state).toBe(ReaderBtCardState.Out);
		});
		test('returns undefined when too short', () => {
			expect(parseCardStateChange([1, 2, 3])).toBeUndefined();
		});
	});

	describe('parseOwnerData', () => {
		test('returns undefined for an empty block', () => {
			expect(parseOwnerData([], ReaderBtCardFamily.Modern)).toBeUndefined();
		});
		test('parses the modern field set', () => {
			const block = [ReaderBtCharacterSet.Iso8859_1, ...latin1('Ada;Lovelace;F;1815;OC;a@b.c;+41;London;Main;W1;GB'), 0];
			expect(parseOwnerData(block, ReaderBtCardFamily.Modern)).toEqual({
				firstName: 'Ada',
				lastName: 'Lovelace',
				gender: 'F',
				birthday: '1815',
				club: 'OC',
				email: 'a@b.c',
				phone: '+41',
				city: 'London',
				street: 'Main',
				zip: 'W1',
				country: 'GB',
				isComplete: true
			});
		});
		test('parses the two-field set for SI-Card 8 and 9', () => {
			const block = [ReaderBtCharacterSet.Iso8859_1, ...latin1('Alan;Turing'), 0];
			expect(parseOwnerData(block, ReaderBtCardFamily.SiCard8)).toEqual({
				firstName: 'Alan',
				lastName: 'Turing',
				isComplete: true
			});
			expect(parseOwnerData(block, ReaderBtCardFamily.SiCard9)?.isComplete).toBe(true);
		});
		test('marks a short field list as incomplete', () => {
			const block = [ReaderBtCharacterSet.Iso8859_1, ...latin1('Ada;Lovelace'), 0];
			const cardHolder = parseOwnerData(block, ReaderBtCardFamily.Modern);
			expect(cardHolder?.isComplete).toBe(false);
			expect(cardHolder?.country).toBeUndefined();
		});
		test('tolerates a block with no leading character set byte', () => {
			expect(parseOwnerData([...latin1('Ada;Lovelace'), 0], ReaderBtCardFamily.SiCard9)).toEqual({
				firstName: 'Ada',
				lastName: 'Lovelace',
				isComplete: true
			});
		});
		test('tolerates a block with no NUL terminator', () => {
			expect(parseOwnerData(latin1('Ada;Lovelace'), ReaderBtCardFamily.SiCard9)?.lastName).toBe('Lovelace');
		});
		test('flags GB2312 as unsupported', () => {
			const block = [ReaderBtCharacterSet.Gb2312, ...latin1('Ada;Lovelace'), 0];
			expect(parseOwnerData(block, ReaderBtCardFamily.SiCard9)?.characterSetUnsupported).toBe(true);
		});
		test('decodes high characters as CP850 despite the ISO8859-1 tag', () => {
			const block = [ReaderBtCharacterSet.Iso8859_1, ...encodeCp850('Jörg;Müller'), 0];
			expect(block).toContain(0x81); // ü as the official tools write it
			const holder = parseOwnerData(block, ReaderBtCardFamily.SiCard9);
			expect(holder?.firstName).toBe('Jörg');
			expect(holder?.lastName).toBe('Müller');
		});
	});

	describe('parseSiacProductionData', () => {
		test('parses the production block', () => {
			expect(parseSiacProductionData(SIAC_PRODUCTION_DATA)).toEqual({
				hardwareVersion: '1.6',
				softwareVersion: '4.3',
				signalCount: 12,
				clearCount: 5,
				batteryMilliVolts: 2950,
				batteryDate: new Date(2023, 3, 5),
				productionDate: new Date(2022, 8, 1)
			});
		});
		test('returns undefined when truncated', () => {
			expect(parseSiacProductionData([1, 2, 3])).toBeUndefined();
		});
		test('treats an all-zero battery date and a zero production month as unknown', () => {
			const data = [16, 43, 0, 0, 0, 0, 0, 0, 0, 0, 0, 22, 0];
			const parsed = parseSiacProductionData(data);
			expect(parsed?.batteryDate).toBeUndefined();
			expect(parsed?.productionDate).toBeUndefined();
		});
		test('treats a zero battery month with a non-zero year as unknown', () => {
			const data = [16, 43, 0, 0, 0, 0, 0, 0, 23, 0, 5, 22, 9];
			expect(parseSiacProductionData(data)?.batteryDate).toBeUndefined();
		});
	});

	describe('parseCardReadout', () => {
		test('returns undefined when too short', () => {
			expect(parseCardReadout([1, 2, 3], false)).toBeUndefined();
		});

		test('parses a minimal SI-Card 9 readout', () => {
			const readout = parseCardReadout(SICARD9_MINIMAL_PAYLOAD, false);
			expect(readout?.cardNumber).toBe(1234567);
			expect(readout?.cardFamily).toBe(ReaderBtCardFamily.SiCard9);
			expect(readout?.punchCount).toBe(5);
			expect(readout?.punches).toHaveLength(5);
			expect(readout?.siac).toBeUndefined();
			expect(readout?.cardHolder).toBeUndefined();
		});

		test('parses a complete SIAC readout with production and owner data', () => {
			const readout = parseCardReadout(SIAC_COMPLETE_PAYLOAD, true);
			expect(readout?.cardNumber).toBe(SIAC_CARD_NUMBER);
			expect(readout?.punches).toHaveLength(5);
			expect(readout?.siac?.hardwareVersion).toBe('1.6');
			expect(readout?.siac?.batteryMilliVolts).toBe(2950);
			expect(readout?.cardHolder?.firstName).toBe('Ada');
			expect(readout?.cardHolder?.country).toBe('GB');
		});

		test('does not read a production block for a family-15 card outside the SIAC range', () => {
			const readout = parseCardReadout(SICARD10_COMPLETE_PAYLOAD, true);
			expect(readout?.cardNumber).toBe(7123456);
			expect(readout?.cardFamily).toBe(ReaderBtCardFamily.Modern);
			expect(readout?.siac).toBeUndefined();
			expect(readout?.cardHolder?.firstName).toBe('Grace');
		});

		test('parses SI-Card 8 owner data from a 104-byte block', () => {
			const readout = parseCardReadout(SICARD8_COMPLETE_PAYLOAD, true);
			expect(readout?.cardHolder).toEqual({ firstName: 'Alan', lastName: 'Turing', isComplete: true });
		});

		test('ignores the tail when not reading a complete readout', () => {
			expect(parseCardReadout(SIAC_COMPLETE_PAYLOAD, false)?.cardHolder).toBeUndefined();
		});

		test('handles a complete readout with no tail at all', () => {
			const readout = parseCardReadout([...writeUint32LE(1234567), ReaderBtCardFamily.SiCard9, ...writeUint16LE(0)], true);
			expect(readout?.punches).toEqual([]);
			expect(readout?.cardHolder).toBeUndefined();
		});

		test('falls back to SIAC-block-plus-owner for an implausible SIAC tail length', () => {
			const payload = [
				...writeUint32LE(SIAC_CARD_NUMBER),
				ReaderBtCardFamily.Modern,
				...writeUint16LE(0),
				...SIAC_PRODUCTION_DATA,
				...latin1('Ada;Lovelace'),
				0
			];
			const readout = parseCardReadout(payload, true);
			expect(readout?.siac?.hardwareVersion).toBe('1.6');
			expect(readout?.cardHolder?.firstName).toBe('Ada');
		});

		test('falls back to owner-data-only for an implausible non-SIAC tail length', () => {
			const payload = [
				...writeUint32LE(1234567),
				ReaderBtCardFamily.SiCard9,
				...writeUint16LE(0),
				ReaderBtCharacterSet.Iso8859_1,
				...latin1('Ada;Lovelace'),
				0
			];
			expect(parseCardReadout(payload, true)?.cardHolder?.firstName).toBe('Ada');
		});

		test('tolerates a punch count larger than the payload', () => {
			const payload = [...writeUint32LE(1234567), ReaderBtCardFamily.SiCard9, ...writeUint16LE(99)];
			const readout = parseCardReadout(payload, false);
			expect(readout?.punchCount).toBe(99);
			expect(readout?.punches).toEqual([]);
		});
	});

	describe('parseDeviceInfo', () => {
		test('parses the device info response', () => {
			expect(parseDeviceInfo(DEVICE_INFO_PAYLOAD)).toEqual({
				serialNumber: 654321,
				deviceType: 0x00a7,
				hardwareVersion: '1.2',
				productionDate: new Date(2025, 5, 15),
				batteryDate: new Date(2025, 5, 1),
				softwareVersion: '1.2.3'
			});
		});
		test('returns undefined when too short', () => {
			expect(parseDeviceInfo([1, 2, 3])).toBeUndefined();
		});
		test('treats a zero year or month as an unknown date', () => {
			const payload = [...writeUint32LE(1), ...writeUint16LE(0x00a7), 1, 0, ...writeUint16LE(0), 6, 15, ...writeUint16LE(2025), 0, 1];
			const info = parseDeviceInfo(payload);
			expect(info?.productionDate).toBeUndefined();
			expect(info?.batteryDate).toBeUndefined();
			expect(info?.softwareVersion).toBe('');
		});
	});

	describe('settings', () => {
		test('parses the settings response', () => {
			expect(parseAllSettings(SETTINGS_PAYLOAD)).toEqual({
				codeNumber: 31,
				operatingMode: ReaderBtOperatingMode.Readout,
				reserved: [0, 0, 0, 0, 0, 0, 0]
			});
		});
		test('parses the settings of a real reader', () => {
			const settings = parseAllSettings(REAL_SETTINGS_PAYLOAD);
			expect(settings?.codeNumber).toBe(5);
			expect(settings?.operatingMode).toBe(ReaderBtOperatingMode.Readout);
		});
		test('returns undefined when too short', () => {
			expect(parseAllSettings([1, 2])).toBeUndefined();
		});
		test('renders a padded 10-byte payload', () => {
			const rendered = renderAllSettings({ codeNumber: 31, operatingMode: ReaderBtOperatingMode.Standalone });
			expect(rendered).toEqual([31, 0, 0x0c, 0, 0, 0, 0, 0, 0, 0]);
		});
		test('sends reserved bytes back unchanged', () => {
			const payload = [...writeUint16LE(300), ReaderBtOperatingMode.Printout, 1, 2, 3, 4, 5, 6, 7];
			const settings = parseAllSettings(payload);
			expect(settings && renderAllSettings(settings)).toEqual(payload);
		});
		test('truncates reserved bytes beyond the 10-byte payload', () => {
			expect(renderAllSettings({ codeNumber: 1, operatingMode: 5, reserved: new Array(9).fill(9) })).toHaveLength(10);
		});
	});

	describe('autosend', () => {
		test('parses on and off', () => {
			expect(parseAutosend([1])).toBe(true);
			expect(parseAutosend([0])).toBe(false);
		});
		test('returns undefined when empty', () => {
			expect(parseAutosend([])).toBeUndefined();
		});
	});

	describe('sessions', () => {
		test('parses a sessions page', () => {
			const page = parseSessionsPage(SESSIONS_PAGE_PAYLOAD);
			expect(page?.pageNumber).toBe(0);
			expect(page?.totalPages).toBe(1);
			expect(page?.entriesCount).toBe(2);
			expect(page?.entries).toHaveLength(2);
			expect(page?.entries[0]).toEqual({
				sessionNumber: 12,
				startTimeRaw: 1750000000,
				endTimeRaw: 1750003600,
				startDate: new Date(1750000000 * 1000),
				endDate: new Date(1750003600 * 1000),
				durationSeconds: 3600,
				numberOfRecords: 42
			});
		});
		test('treats endTime as a duration when startTime is zero', () => {
			const page = parseSessionsPage(SESSIONS_PAGE_PAYLOAD);
			expect(page?.entries[1]).toEqual({
				sessionNumber: 11,
				startTimeRaw: 0,
				endTimeRaw: 3600,
				startDate: undefined,
				endDate: undefined,
				durationSeconds: 3600,
				numberOfRecords: 7
			});
		});
		test('returns undefined when the page header is too short', () => {
			expect(parseSessionsPage([1, 2])).toBeUndefined();
		});
		test('stops short when the entries are truncated', () => {
			const page = parseSessionsPage([0, 1, 3, ...SESSIONS_PAGE_PAYLOAD.slice(3)]);
			expect(page?.entriesCount).toBe(3);
			expect(page?.entries).toHaveLength(2);
		});
		test('parseSessionEntry returns undefined when truncated', () => {
			expect(parseSessionEntry([1, 2, 3], 0)).toBeUndefined();
		});

		test('parses a session data header', () => {
			expect(parseSessionDataHeader([0x0a, 0x00, 0x01, 0x00, 0x89, 0x01, 0x00, 0x00])).toEqual({ sessionNumber: 10, recordCount: 1, byteLength: 393 });
			expect(parseSessionDataHeader([0x0a, 0x00])).toBeUndefined();
		});
		test('renders a header that announces the readouts', () => {
			expect(renderSessionDataHeader(12, SESSION_READOUTS)).toEqual([
				12,
				0,
				2,
				0,
				...writeUint32LE(8 + SESSION_READOUTS[0].payload.length + SESSION_READOUTS[1].payload.length)
			]);
		});
		test('parses session data into card readouts', () => {
			const [header, ...readouts] = sessionDataTransfer(12, SESSION_READOUTS);
			const data = parseSessionData(header, readouts);
			expect(data?.sessionNumber).toBe(12);
			expect(data?.recordCount).toBe(2);
			expect(data?.readouts.map((readout) => readout.cardFamily)).toEqual([ReaderBtCardFamily.SiCard8, ReaderBtCardFamily.Modern]);
			expect(data?.readouts[1].siac).toBeDefined();
		});
		test('parses a minimal readout within session data as minimal', () => {
			const minimal = { messageId: msg.CARD_READOUT_MINIMAL, payload: SICARD9_MINIMAL_PAYLOAD };
			const [header, readout] = sessionDataTransfer(3, [minimal]);
			expect(parseSessionData(header, [readout])?.readouts[0].cardHolder).toBeUndefined();
		});
		test('skips an unparsable readout and notes the shortfall', () => {
			const [header] = sessionDataTransfer(3, SESSION_READOUTS);
			const data = parseSessionData(header, [{ messageId: msg.CARD_READOUT_COMPLETE, payload: [1, 2] }]);
			expect(data?.recordCount).toBe(2);
			expect(data?.readouts).toEqual([]);
		});
		test('returns undefined for an unparsable header', () => {
			expect(parseSessionData({ messageId: msg.SESSION_DATA_RESPONSE, payload: [1] }, [])).toBeUndefined();
		});
	});

	describe('request builders', () => {
		test('renderFeedback', () => {
			expect(renderFeedback(ReaderBtFeedbackType.Error)).toEqual({ messageId: msg.FEEDBACK, payload: [2] });
		});
		test('renderCardReadoutRequest', () => {
			expect(renderCardReadoutRequest(true).messageId).toBe(msg.CARD_READOUT_COMPLETE);
			expect(renderCardReadoutRequest(false).messageId).toBe(msg.CARD_READOUT_MINIMAL);
		});
		test('renderReadSessionsRequest', () => {
			expect(renderReadSessionsRequest(2)).toEqual({ messageId: msg.READ_SESSIONS, payload: [2] });
		});
		test('renderReadSessionDataRequest', () => {
			expect(renderReadSessionDataRequest(0x1234)).toEqual({ messageId: msg.READ_SESSION_DATA, payload: [0x34, 0x12] });
		});
		test('renderWriteSettingsRequest', () => {
			expect(renderWriteSettingsRequest({ codeNumber: 31, operatingMode: ReaderBtOperatingMode.Readout })).toEqual({
				messageId: msg.WRITE_ALL_SETTINGS,
				payload: [31, 0, 0x05, 0, 0, 0, 0, 0, 0, 0]
			});
		});
		test('renderSetAutosendRequest', () => {
			expect(renderSetAutosendRequest(true)).toEqual({ messageId: msg.SET_AUTOSEND, payload: [1] });
			expect(renderSetAutosendRequest(false)).toEqual({ messageId: msg.SET_AUTOSEND, payload: [0] });
		});
		test('renderRequest defaults to an empty payload', () => {
			expect(renderRequest(msg.READ_ALL_SETTINGS)).toEqual({ messageId: msg.READ_ALL_SETTINGS, payload: [] });
		});
	});
});
