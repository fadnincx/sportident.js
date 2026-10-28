import { describe, expect, test } from '@jest/globals';
import { SiStationMode } from '../SiStation/ISiStation';
import { ReaderBtCardFamily, ReaderBtCardState, ReaderBtOperatingMode, ReaderBtPunchType, READER_BT_DEVICE_TYPE, msg } from './readerBtConstants';
import {
	ReaderBtMessageAssembler,
	parseAllSettings,
	parseAutosend,
	parseCardReadout,
	parseCardStateChange,
	parseDeviceInfo,
	parseAllMessages,
	parseMessage,
	parseSessionData,
	parseSessionsPage,
	type ReaderBtMessage
} from './readerBtProtocol';
import {
	ANONYMISED_SIAC_OWNER,
	CAPTURED_AUTOSEND_OFF_NOTIFICATION,
	CAPTURED_AUTOSEND_ON_NOTIFICATION,
	CAPTURED_DEVICE_INFO_NOTIFICATION,
	CAPTURED_SETTINGS_NOTIFICATION,
	CAPTURED_SIAC_COMPLETE_SEGMENT_FIRST,
	CAPTURED_SIAC_COMPLETE_SEGMENT_LAST,
	CAPTURED_SIAC_INSERTED_NOTIFICATION,
	CAPTURED_SICARD9_COMPLETE_NOTIFICATION,
	CAPTURED_SICARD9_INSERTED_NOTIFICATION,
	CAPTURED_SICARD9_REMOVED_NOTIFICATION,
	CAPTURED_SESSIONS_PAGE_0_NOTIFICATION,
	CAPTURED_SESSIONS_PAGE_1_NOTIFICATION,
	CAPTURED_SESSION_3_NOTIFICATION,
	CAPTURED_SESSION_10_SEGMENT_FIRST,
	CAPTURED_SESSION_10_SEGMENT_LAST,
	CAPTURED_SICARD9_MINIMAL_NOTIFICATION,
	CAPTURED_SIAC_MINIMAL_SEGMENT_FIRST,
	CAPTURED_SIAC_MINIMAL_SEGMENT_LAST
} from './readerBtHardwareCaptures';
import { ReaderBtCard } from './ReaderBtCard';

// Every notification seen on hardware was exactly one whole message or one whole segment.
const single = (notification: number[]): ReaderBtMessage => {
	const { message, remainder } = parseMessage(notification);
	expect(remainder).toEqual([]);
	return message!;
};

const assembleSiac = (): ReaderBtMessage => {
	const assembler = new ReaderBtMessageAssembler();
	expect(assembler.push(CAPTURED_SIAC_COMPLETE_SEGMENT_FIRST)).toEqual([]);
	expect(assembler.pending).toEqual({ receivedBytes: 239, totalBytes: 393 });
	const messages = assembler.push(CAPTURED_SIAC_COMPLETE_SEGMENT_LAST);
	expect(messages).toHaveLength(1);
	expect(assembler.pending).toBeUndefined();
	return messages[0];
};

describe('Reader BT hardware captures', () => {
	test('device info', () => {
		const message = single(CAPTURED_DEVICE_INFO_NOTIFICATION);
		expect(message.messageId).toBe(msg.READ_DEVICE_INFO);
		expect(parseDeviceInfo(message.payload)).toEqual({
			serialNumber: 1000194, // as in the advertised name "Reader BT 1000194"
			deviceType: READER_BT_DEVICE_TYPE,
			hardwareVersion: '4.1',
			productionDate: new Date(2026, 9, 12),
			batteryDate: new Date(2026, 9, 12),
			softwareVersion: 'sireader@2.2.0+71f89ff.20261008113738'
		});
	});

	test('settings and autosend', () => {
		expect(parseAllSettings(single(CAPTURED_SETTINGS_NOTIFICATION).payload)).toEqual({
			codeNumber: 5,
			operatingMode: ReaderBtOperatingMode.Readout,
			reserved: [0, 0, 0, 0, 0, 0, 0]
		});
		expect(parseAutosend(single(CAPTURED_AUTOSEND_OFF_NOTIFICATION).payload)).toBe(false);
		expect(parseAutosend(single(CAPTURED_AUTOSEND_ON_NOTIFICATION).payload)).toBe(true);
	});

	test('card state changes carry the reader code number', () => {
		expect(parseCardStateChange(single(CAPTURED_SICARD9_INSERTED_NOTIFICATION).payload)).toEqual({ cardNumber: 1200995, state: ReaderBtCardState.In, codeNumber: 5 });
		expect(parseCardStateChange(single(CAPTURED_SICARD9_REMOVED_NOTIFICATION).payload)).toEqual({ cardNumber: 1200995, state: ReaderBtCardState.Out, codeNumber: 5 });
		expect(parseCardStateChange(single(CAPTURED_SIAC_INSERTED_NOTIFICATION).payload)?.cardNumber).toBe(8200995);
	});

	describe('SI-Card 9 complete readout', () => {
		const message = single(CAPTURED_SICARD9_COMPLETE_NOTIFICATION);

		test('parses the records', () => {
			expect(message.messageId).toBe(msg.CARD_READOUT_COMPLETE);
			const readout = parseCardReadout(message.payload, true)!;
			expect(readout.cardNumber).toBe(1200995);
			expect(readout.cardFamily).toBe(ReaderBtCardFamily.SiCard9);
			expect(readout.punches.map((punch) => [punch.punchType, punch.controlCode, punch.timeInWeekMs])).toEqual([
				[ReaderBtPunchType.Clear, 1, 509000],
				[ReaderBtPunchType.Check, 1, 509000],
				[ReaderBtPunchType.Start, 4, 750000],
				[ReaderBtPunchType.Finish, 6, 4590000],
				[ReaderBtPunchType.Control, 31, 1023000]
			]);
			// an SI-Card 9 records no station mode
			expect(readout.punches.every((punch) => punch.controlInfo === 0 && punch.stationMode === 0)).toBe(true);
		});

		test('decodes the owner block, character_set byte and CP850 included', () => {
			const readout = parseCardReadout(message.payload, true)!;
			expect(readout.siac).toBeUndefined();
			expect(readout.cardHolder).toEqual({ firstName: 'Hans', lastName: 'Müller', isComplete: true });
		});
	});

	describe('SIAC complete readout', () => {
		test('reassembles the two segments', () => {
			const message = assembleSiac();
			expect(message.messageId).toBe(msg.CARD_READOUT_COMPLETE);
			expect(message.payload).toHaveLength(389);
		});

		test('parses the records with their station modes', () => {
			const readout = parseCardReadout(assembleSiac().payload, true)!;
			expect(readout.cardNumber).toBe(8200995);
			expect(readout.cardFamily).toBe(ReaderBtCardFamily.Modern);
			expect(readout.punchCount).toBe(30);
			expect(readout.punches).toHaveLength(30);
			// special records come first, not in time order
			expect(readout.punches.slice(0, 3).map((punch) => [punch.punchType, punch.controlCode, punch.stationMode])).toEqual([
				[ReaderBtPunchType.Clear, 251, SiStationMode.Clear],
				[ReaderBtPunchType.Finish, 0, SiStationMode.BeaconFinish],
				[ReaderBtPunchType.FinishReserve, 0, SiStationMode.BeaconFinish]
			]);
			const controls = readout.punches.slice(3);
			expect(controls.every((punch) => punch.punchType === ReaderBtPunchType.Control && punch.stationMode === SiStationMode.BeaconControl && punch.beaconMode)).toBe(true);
			expect(controls[0]).toEqual(expect.objectContaining({ controlCode: 71, time: { time: 45030, weekday: 0, milliseconds: 859 } }));
			expect(controls[controls.length - 1]).toEqual(expect.objectContaining({ controlCode: 75, time: { time: 49573, weekday: 0, milliseconds: 0 } }));
		});

		test('parses the SIAC production data', () => {
			const readout = parseCardReadout(assembleSiac().payload, true)!;
			expect(readout.siac).toEqual({
				hardwareVersion: '1.6',
				softwareVersion: '4.3',
				signalCount: 5069,
				clearCount: 203,
				batteryMilliVolts: 2890,
				batteryDate: new Date(2021, 5, 2),
				productionDate: new Date(2021, 5, 1)
			});
		});

		test('decodes all eleven owner fields', () => {
			const readout = parseCardReadout(assembleSiac().payload, true)!;
			expect(readout.cardHolder).toEqual({
				firstName: 'Hans',
				lastName: 'Müller',
				gender: 'M',
				birthday: '01.01.1990',
				club: 'OL Zürich',
				email: 'hans@example.com',
				phone: '+41000000000',
				city: 'Bäch',
				street: 'Seestrasse 1',
				zip: '8806',
				country: 'CH',
				isComplete: true
			});
			expect(ANONYMISED_SIAC_OWNER.split(';')).toHaveLength(12);
		});

		test('becomes a race result', () => {
			const card = ReaderBtCard.fromReadout(parseCardReadout(assembleSiac().payload, true)!);
			expect(card.cardSeries).toBe('SIAC');
			expect(card.raceResult.clearTime).toEqual({ time: 44824, weekday: 0, milliseconds: 0 });
			expect(card.raceResult.startTime).toBeUndefined(); // this card was never punched at a start
			expect(card.raceResult.finishTime).toEqual({ time: 49610, weekday: 0, milliseconds: 355 });
			expect(card.raceResult.punches).toHaveLength(27);
			expect(card.raceResult.punches?.[0].stationMode).toBe(SiStationMode.BeaconControl);
			expect(card.raceResult.siac?.battery?.voltage).toBeCloseTo(2.89);
		});
	});

	describe('minimal readouts', () => {
		test('SI-Card 9: the records only', () => {
			const message = single(CAPTURED_SICARD9_MINIMAL_NOTIFICATION);
			expect(message.messageId).toBe(msg.CARD_READOUT_MINIMAL);
			const readout = parseCardReadout(message.payload, false)!;
			expect(readout.punches).toHaveLength(5);
			expect(readout.cardHolder).toBeUndefined();
		});

		test('SIAC: still segmented, without the SIAC block', () => {
			const assembler = new ReaderBtMessageAssembler();
			const messages = [...assembler.push(CAPTURED_SIAC_MINIMAL_SEGMENT_FIRST), ...assembler.push(CAPTURED_SIAC_MINIMAL_SEGMENT_LAST)];
			expect(messages.map((message) => [message.messageId, message.payload.length])).toEqual([[msg.CARD_READOUT_MINIMAL, 247]]);
			const readout = parseCardReadout(messages[0].payload, false)!;
			expect(readout.punches).toHaveLength(30);
			expect(readout.siac).toBeUndefined();
		});
	});

	describe('sessions', () => {
		test('pages are numbered from 0, newest first, with readouts counted', () => {
			const first = parseSessionsPage(single(CAPTURED_SESSIONS_PAGE_0_NOTIFICATION).payload)!;
			const second = parseSessionsPage(single(CAPTURED_SESSIONS_PAGE_1_NOTIFICATION).payload)!;
			expect([first.pageNumber, first.totalPages, second.pageNumber, second.totalPages]).toEqual([0, 2, 1, 2]);
			expect([...first.entries, ...second.entries].map((entry) => [entry.sessionNumber, entry.numberOfRecords])).toEqual([
				[10, 1],
				[9, 3],
				[8, 1],
				[7, 2],
				[6, 1],
				[5, 1],
				[4, 1],
				[3, 1],
				[2, 1],
				[1, 1]
			]);
			// no wall clock on this reader
			expect(first.entries[0]).toEqual(expect.objectContaining({ startTimeRaw: 0, endTimeRaw: 0, startDate: undefined }));
		});

		test('session data is a header followed by complete readouts, in one notification', () => {
			const { messages, remainder } = parseAllMessages(CAPTURED_SESSION_3_NOTIFICATION);
			expect(remainder).toEqual([]);
			expect(messages.map((message) => message.messageId)).toEqual([msg.SESSION_DATA_RESPONSE, msg.CARD_READOUT_COMPLETE]);
			const data = parseSessionData(messages[0], messages.slice(1))!;
			expect(data).toEqual(expect.objectContaining({ sessionNumber: 3, recordCount: 1 }));
			const readout = data.readouts[0];
			expect(readout.cardNumber).toBe(8744102);
			expect(readout.punches.map((punch) => [punch.punchType, punch.controlCode, punch.stationMode])).toEqual([
				[ReaderBtPunchType.Clear, 1, SiStationMode.Clear],
				[ReaderBtPunchType.Control, 31, SiStationMode.Control]
			]);
			expect(readout.punches[1].time).toEqual({ time: 48626, weekday: 1, milliseconds: 0 });
			expect(readout.siac).toEqual(expect.objectContaining({ hardwareVersion: '7.5', softwareVersion: '4.9', batteryMilliVolts: 2980 }));
			expect(readout.cardHolder).toEqual(expect.objectContaining({ firstName: 'SPORTident', lastName: 'Testlos', club: '' }));
		});

		test('a segmented session transfer yields the header and every readout', () => {
			const assembler = new ReaderBtMessageAssembler();
			expect(assembler.push(CAPTURED_SESSION_10_SEGMENT_FIRST)).toEqual([]);
			const messages = assembler.push(CAPTURED_SESSION_10_SEGMENT_LAST);
			expect(messages.map((message) => message.messageId)).toEqual([msg.SESSION_DATA_RESPONSE, msg.CARD_READOUT_COMPLETE]);
			const data = parseSessionData(messages[0], messages.slice(1))!;
			expect(data.sessionNumber).toBe(10);
			expect(data.readouts[0].cardNumber).toBe(8200995);
			expect(data.readouts[0].cardHolder?.lastName).toBe('Müller');
		});
	});
});
