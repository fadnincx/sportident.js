import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { LogLevel, getDefaultLogLevel, setDefaultLogLevel } from '../utils/logging';
import * as testUtils from '../testUtils';
import type { BaseSiCard } from '../SiCard/BaseSiCard';
import { getFakeSiReaderBtDriver, type FakeSiReaderBtDevice } from '../fakes/FakeSiReaderBtDriver';
import { READER_BT_DEVICE_TYPE, ReaderBtFeedbackType, ReaderBtOperatingMode, msg } from './readerBtConstants';
import { SiDeviceState } from './ISiReaderBtDevice';
import type { ReaderBtSettings } from './readerBtProtocol';
import { SESSIONS_PAGE_PAYLOAD, SIAC_CARD_NUMBER, SICARD8_CARD_NUMBER } from './readerBtExamples';
import { ReaderBtStation } from './ReaderBtStation';
import { ReaderBtCard } from './ReaderBtCard';

testUtils.useFakeTimers();

let previousLogLevel: LogLevel;
beforeAll(() => {
	previousLogLevel = getDefaultLogLevel();
	setDefaultLogLevel(LogLevel.ERROR);
});
afterAll(() => {
	setDefaultLogLevel(previousLogLevel);
});

const READOUT_SETTINGS: ReaderBtSettings = { codeNumber: 31, operatingMode: ReaderBtOperatingMode.Readout, reserved: [0, 0, 0, 0, 0, 0, 0] };

const makeStation = async (
	ident = 'reader-1',
	options: { segmentPayloadSize?: number; segmentDelayMs?: number; settings?: ReaderBtSettings } = {}
): Promise<{ station: ReaderBtStation; device: FakeSiReaderBtDevice }> => {
	const driver = getFakeSiReaderBtDriver();
	driver.simulatorOptions = {
		segmentPayloadSize: options.segmentPayloadSize,
		segmentDelayMs: options.segmentDelayMs,
		settings: options.settings ?? READOUT_SETTINGS
	};
	const device = driver.getSiDevice(ident);
	const station = ReaderBtStation.fromSiReaderBtDevice(device);
	await station.open();
	return { station: station, device: device };
};

describe('ReaderBtStation', () => {
	test('is memoised per device and exposes the device ident', async () => {
		const { station, device } = await makeStation();
		expect(ReaderBtStation.fromSiReaderBtDevice(device)).toBe(station);
		expect(station.ident).toEqual('FakeReaderBt-reader-1');
	});

	describe('device info and settings', () => {
		test('reads the device info', async () => {
			const { station } = await makeStation();
			const info = await station.readDeviceInfo();
			expect(info.deviceType).toEqual(READER_BT_DEVICE_TYPE);
			expect(info.serialNumber).toEqual(654321);
			expect(info.softwareVersion).toEqual('1.2.3');
		});

		test('reads the settings', async () => {
			const { station } = await makeStation();
			await expect(station.readSettings()).resolves.toEqual(READOUT_SETTINGS);
		});

		test('writes settings and returns the read-back value', async () => {
			const { station, device } = await makeStation();
			const settings = { ...READOUT_SETTINGS, codeNumber: 42 };
			await expect(station.writeSettings(settings)).resolves.toEqual(settings);
			expect(device.data.device.simulator.settings).toEqual(settings);
		});

		test('refuses to write an invalid operating mode', async () => {
			const { station, device } = await makeStation();
			await expect(station.writeSettings({ codeNumber: 42, operatingMode: 0 })).rejects.toThrow('Invalid Reader BT operating mode 0x0');
			expect(device.data.device.simulator.writes.map((write) => write.messageId)).not.toContain(msg.WRITE_ALL_SETTINGS);
		});

		test('a mode change terminates the connection', async () => {
			const { station, device } = await makeStation();
			const written = station.writeSettings({ ...READOUT_SETTINGS, operatingMode: ReaderBtOperatingMode.Standalone }).catch(() => undefined);
			await testUtils.runPromises();
			await written;
			expect(device.state).toBe(SiDeviceState.Closed);
		});

		test('reads and sets autosend', async () => {
			const { station } = await makeStation();
			await expect(station.readAutosend()).resolves.toBe(false);
			await station.setAutosend(true);
			await expect(station.readAutosend()).resolves.toBe(true);
		});

		test('autosend is off again after a reconnect', async () => {
			const { station } = await makeStation();
			await station.setAutosend(true);
			await station.close();
			await station.open();
			await expect(station.readAutosend()).resolves.toBe(false);
		});

		test('throws when the autosend state cannot be parsed', async () => {
			const { station } = await makeStation();
			station.connection.request = () => Promise.resolve({ messageId: msg.READ_AUTOSEND, payload: [] });
			await expect(station.readAutosend()).rejects.toThrow('Could not parse');
		});

		test('throws when the device info cannot be parsed', async () => {
			const { station, device } = await makeStation();
			device.data.device.simulator.deviceInfoPayload = [1, 2, 3];
			await expect(station.readDeviceInfo()).rejects.toThrow('Could not parse');
		});

		test('throws when the settings cannot be parsed', async () => {
			const { station, device } = await makeStation();
			device.data.device.simulator.emit = () => undefined;
			device.data.device.simulator.onNotify = undefined;
			// Answer the settings request with a payload the codec rejects.
			const original = station.connection.request.bind(station.connection);
			station.connection.request = () => Promise.resolve({ messageId: msg.READ_ALL_SETTINGS, payload: [1] });
			await expect(station.readSettings()).rejects.toThrow('Could not parse');
			station.connection.request = original;
		});
	});

	describe('feedback', () => {
		test('signal sends an Ok feedback', async () => {
			const { station, device } = await makeStation();
			await station.signal();
			expect(device.data.device.simulator.feedbacks).toEqual([ReaderBtFeedbackType.Ok]);
		});

		test('signal can send an Error feedback', async () => {
			const { station, device } = await makeStation();
			await station.signal(ReaderBtFeedbackType.Error);
			expect(device.data.device.simulator.feedbacks).toEqual([ReaderBtFeedbackType.Error]);
		});
	});

	describe('card lifecycle', () => {
		test('dispatches siCardInserted with a readable card', async () => {
			const { station, device } = await makeStation();
			const inserted: BaseSiCard[] = [];
			station.addEventListener('siCardInserted', (event) => inserted.push(event.siCard));

			device.data.device.simulator.insertCard(SIAC_CARD_NUMBER, 31);
			await testUtils.runPromises();

			expect(inserted).toHaveLength(1);
			expect(inserted[0].cardNumber).toEqual(SIAC_CARD_NUMBER);
			expect((inserted[0] as ReaderBtCard).deviceCodeNumber).toEqual(31);
			expect(station.siCard).toBe(inserted[0]);
		});

		test('end to end: insert, read, confirm', async () => {
			const { station, device } = await makeStation();
			const cards: BaseSiCard[] = [];
			station.addEventListener('siCardInserted', (event) => cards.push(event.siCard));

			device.data.device.simulator.insertCard(SIAC_CARD_NUMBER, 31);
			await testUtils.runPromises();

			const card = cards[0] as ReaderBtCard;
			await card.read();

			expect(card.cardSeries).toEqual('SIAC');
			expect(card.records).toHaveLength(5);
			const result = card.toDict();
			expect(result.startTime?.time).toEqual(51 * 3600 - 48 * 3600);
			expect(result.punches?.map((punch) => punch.code)).toEqual([31]);
			expect(result.cardHolder?.lastName).toEqual('Lovelace');
			expect(result.siac?.battery?.voltage).toEqual(2.95);

			await card.confirm();
			expect(device.data.device.simulator.feedbacks).toEqual([ReaderBtFeedbackType.Ok]);
		});

		test('draws a smooth progress line while a segmented readout arrives', async () => {
			// Segments spread over time, as real BLE notifications are.
			const { station, device } = await makeStation('reader-1', { segmentPayloadSize: 16, segmentDelayMs: 40 });
			const cards: BaseSiCard[] = [];
			station.addEventListener('siCardInserted', (event) => cards.push(event.siCard));
			device.data.device.simulator.insertCard(SIAC_CARD_NUMBER, 31);
			await testUtils.runPromises();

			const percentages: number[] = [];
			cards[0].addEventListener('readProgress', (event) => percentages.push(event.percentage));
			const reading = cards[0].read();
			await testUtils.advanceTimersByTimeAsync(1200);
			await reading;

			// Many samples, not a couple of jumps: the 30ms timer is the sole emitter.
			expect(percentages.length).toBeGreaterThan(8);
			expect(percentages[percentages.length - 1]).toEqual(100);
			percentages.forEach((percentage, index) => {
				if (index === 0) {
					return;
				}
				// Monotonic: a progress bar must never rewind.
				expect(percentage).toBeGreaterThanOrEqual(percentages[index - 1]);
				// And no single sample leaps a large fraction of the bar.
				expect(percentage - percentages[index - 1]).toBeLessThanOrEqual(35);
			});
		});

		test('a measurement behind the clock estimate does not freeze the bar', async () => {
			// The old behaviour: the clock guess raced to its ceiling and then discarded
			// every real measurement below it, leaving the bar stuck until completion.
			const { station, device } = await makeStation('reader-1', { segmentPayloadSize: 16, segmentDelayMs: 200 });
			const cards: BaseSiCard[] = [];
			station.addEventListener('siCardInserted', (event) => cards.push(event.siCard));
			device.data.device.simulator.insertCard(SIAC_CARD_NUMBER, 31);
			await testUtils.runPromises();

			const percentages: number[] = [];
			cards[0].addEventListener('readProgress', (event) => percentages.push(event.percentage));
			const reading = cards[0].read();
			// Well past the 900ms estimate, so the old linear ramp would have saturated.
			await testUtils.advanceTimersByTimeAsync(3000);
			await reading;

			const beforeCompletion = percentages.filter((percentage) => percentage < 100);
			// The guess decays asymptotically instead of pinning at the ceiling, so there
			// is still room for the measurements to move the bar.
			expect(Math.max(...beforeCompletion)).toBeLessThan(99);
			expect(new Set(beforeCompletion).size).toBeGreaterThan(5);
		});

		test('reads a card whose readout arrives segmented', async () => {
			const { station, device } = await makeStation('reader-1', { segmentPayloadSize: 20 });
			const cards: BaseSiCard[] = [];
			station.addEventListener('siCardInserted', (event) => cards.push(event.siCard));
			device.data.device.simulator.insertCard(SIAC_CARD_NUMBER, 31);
			await testUtils.runPromises();

			await cards[0].read();
			expect(cards[0].toDict().cardHolder?.firstName).toEqual('Ada');
		});

		test('dispatches siCardRemoved and clears the current card', async () => {
			const { station, device } = await makeStation();
			const removed: BaseSiCard[] = [];
			station.addEventListener('siCardRemoved', (event) => removed.push(event.siCard));

			device.data.device.simulator.insertCard(SIAC_CARD_NUMBER, 31);
			await testUtils.runPromises();
			device.data.device.simulator.removeCard(SIAC_CARD_NUMBER, 31);
			await testUtils.runPromises();

			expect(removed).toHaveLength(1);
			expect(removed[0].cardNumber).toEqual(SIAC_CARD_NUMBER);
			expect(station.siCard).toBeNull();
		});

		test('dispatches siCardRemoved even without a preceding insert', async () => {
			const { station, device } = await makeStation();
			const removed: BaseSiCard[] = [];
			station.addEventListener('siCardRemoved', (event) => removed.push(event.siCard));
			device.data.device.simulator.removeCard(999999, 31);
			await testUtils.runPromises();
			expect(removed[0].cardNumber).toEqual(999999);
		});

		test('a readout we requested is not reported as observed', async () => {
			const { station } = await makeStation();
			const observed: BaseSiCard[] = [];
			station.addEventListener('siCardObserved', (event) => observed.push(event.siCard));

			const readout = await station.requestCardReadout(true);
			expect(readout.cardNumber).toEqual(SIAC_CARD_NUMBER);
			await testUtils.runPromises();
			expect(observed).toEqual([]);
		});

		test('an autoRead push is reported as observed, fully populated', async () => {
			const { station, device } = await makeStation();
			await station.setAutosend(true);
			const observed: BaseSiCard[] = [];
			station.addEventListener('siCardObserved', (event) => observed.push(event.siCard));

			device.data.device.simulator.insertCard(SIAC_CARD_NUMBER, 31);
			await testUtils.runPromises();
			await testUtils.runPromises();

			expect(observed).toHaveLength(1);
			expect(observed[0].toDict().cardHolder?.firstName).toEqual('Ada');
			expect((observed[0] as ReaderBtCard).cardSeries).toEqual('SIAC');
		});

		test('ignores an unparseable card state change', async () => {
			const { station, device } = await makeStation();
			const inserted: BaseSiCard[] = [];
			station.addEventListener('siCardInserted', (event) => inserted.push(event.siCard));
			device.data.device.simulator.emit('cardState', { messageId: msg.CARD_STATE_CHANGE, payload: [1, 2] });
			await testUtils.runPromises();
			expect(inserted).toEqual([]);
		});

		test('ignores an unparseable unsolicited readout', async () => {
			const { station, device } = await makeStation();
			const observed: BaseSiCard[] = [];
			station.addEventListener('siCardObserved', (event) => observed.push(event.siCard));
			device.data.device.simulator.emit('cardData', { messageId: msg.CARD_READOUT_COMPLETE, payload: [1, 2] });
			await testUtils.runPromises();
			expect(observed).toEqual([]);
		});

		test('throws when a requested readout cannot be parsed', async () => {
			const { station, device } = await makeStation();
			device.data.device.simulator.completeReadoutPayload = [1, 2, 3];
			await expect(station.requestCardReadout(true)).rejects.toThrow('Could not parse');
		});
	});

	describe('readCards', () => {
		const settingsWrites = (device: FakeSiReaderBtDevice): number[] =>
			device.data.device.simulator.writes
				.map((write) => write.messageId)
				.filter((messageId) => messageId === msg.WRITE_ALL_SETTINGS || messageId === msg.SET_AUTOSEND);

		test('changes the code number, delivers cards, and restores it on cleanup', async () => {
			const { station, device } = await makeStation();
			const seen: BaseSiCard[] = [];
			const cleanUp = await station.readCards((card) => seen.push(card), { codeNumber: 77 });

			expect(device.data.device.simulator.settings).toEqual({ ...READOUT_SETTINGS, codeNumber: 77 });

			device.data.device.simulator.insertCard(SIAC_CARD_NUMBER, 77);
			await testUtils.runPromises();
			expect(seen).toHaveLength(1);

			await cleanUp();
			expect(device.data.device.simulator.settings).toEqual(READOUT_SETTINGS);

			device.data.device.simulator.insertCard(SIAC_CARD_NUMBER, 31);
			await testUtils.runPromises();
			expect(seen).toHaveLength(1);
		});

		test('writes nothing when setup asks for nothing', async () => {
			const { station, device } = await makeStation();
			const cleanUp = await station.readCards(() => undefined);
			await cleanUp();
			expect(device.data.device.simulator.writes).toEqual([]);
		});

		test('writes nothing when the code number already matches', async () => {
			const { station, device } = await makeStation();
			const cleanUp = await station.readCards(() => undefined, { codeNumber: 31, autoRead: false });
			await cleanUp();
			expect(settingsWrites(device)).toEqual([]);
		});

		test('keeps the operating mode and reserved bytes', async () => {
			const settings = { codeNumber: 31, operatingMode: ReaderBtOperatingMode.Readout, reserved: [1, 2, 3, 4, 5, 6, 7] };
			const { station, device } = await makeStation('reader-1', { settings: settings });
			const cleanUp = await station.readCards(() => undefined, { codeNumber: 77 });
			expect(device.data.device.simulator.settings).toEqual({ ...settings, codeNumber: 77 });
			await cleanUp();
			expect(device.data.device.simulator.settings).toEqual(settings);
		});

		test('can opt into autoRead and turns it off again on cleanup', async () => {
			const { station, device } = await makeStation();
			const cleanUp = await station.readCards(() => undefined, { autoRead: true });
			expect(device.data.device.simulator.autosend).toBe(true);
			await cleanUp();
			expect(device.data.device.simulator.autosend).toBe(false);
			expect(settingsWrites(device)).toEqual([msg.SET_AUTOSEND, msg.SET_AUTOSEND]);
		});
	});

	describe('sessions', () => {
		test('lists the sessions on a single page', async () => {
			const { station } = await makeStation();
			const sessions = await station.listSessions();
			expect(sessions.map((session) => session.sessionNumber)).toEqual([12, 11]);
			expect(sessions[0].numberOfRecords).toEqual(42);
			expect(sessions[1].durationSeconds).toEqual(3600);
		});

		test('pages through a multi-page session table', async () => {
			const { station, device } = await makeStation();
			const secondPage = [1, 2, 1, ...SESSIONS_PAGE_PAYLOAD.slice(3, 23)];
			device.data.device.simulator.sessionsPages = [[0, 2, 2, ...SESSIONS_PAGE_PAYLOAD.slice(3)], secondPage];
			const sessions = await station.listSessions();
			expect(sessions).toHaveLength(3);
		});

		test('stops when a page comes back empty', async () => {
			const { station, device } = await makeStation();
			device.data.device.simulator.sessionsPages = [[0, 5, 0]];
			await expect(station.listSessions()).resolves.toEqual([]);
		});

		test('throws when a sessions page cannot be parsed', async () => {
			const { station, device } = await makeStation();
			device.data.device.simulator.sessionsPages = [[1]];
			await expect(station.listSessions()).rejects.toThrow('Could not parse');
		});

		test('reads the card readouts of one session', async () => {
			const { station } = await makeStation();
			const data = await station.readSessionData(12);
			expect(data.sessionNumber).toBe(12);
			expect(data.recordCount).toBe(2);
			expect(data.readouts.map((readout) => readout.cardNumber)).toEqual([SICARD8_CARD_NUMBER, SIAC_CARD_NUMBER]);
		});

		test('does not report the readouts of a session download as observed cards', async () => {
			const { station } = await makeStation();
			const observed: BaseSiCard[] = [];
			station.addEventListener('siCardObserved', (event) => observed.push(event.siCard));
			await station.readSessionData(12);
			expect(observed).toEqual([]);
		});

		test('throws when the session data header cannot be parsed', async () => {
			const { station, device } = await makeStation();
			device.data.device.simulator.dropResponses = true;
			const pending = station.readSessionData(12);
			await testUtils.runPromises();
			device.data.device.simulator.emit('sessions', { messageId: msg.SESSION_DATA_RESPONSE, payload: [12] });
			await expect(pending).rejects.toThrow('Could not parse the Reader BT session data');
		});
	});

	describe('lifecycle', () => {
		test('close closes the underlying device', async () => {
			const { station, device } = await makeStation();
			await station.close();
			expect(device.data.device.isOpened).toBe(false);
		});
	});
});
