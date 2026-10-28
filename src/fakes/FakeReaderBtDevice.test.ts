import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { LogLevel, getDefaultLogLevel, setDefaultLogLevel } from '../utils/logging';
import { msg, ReaderBtOperatingMode, type ReaderBtCharacteristicId } from '../SiReaderBt/readerBtConstants';
import { parseAllMessages, renderAllSettings, renderMessage, renderRequest } from '../SiReaderBt/readerBtProtocol';
import { FakeReaderBtDevice } from './FakeReaderBtDevice';

let previousLogLevel: LogLevel;
beforeAll(() => {
	previousLogLevel = getDefaultLogLevel();
	setDefaultLogLevel(LogLevel.ERROR);
});
afterAll(() => {
	setDefaultLogLevel(previousLogLevel);
});

const collectNotifications = (simulator: FakeReaderBtDevice): { characteristic: ReaderBtCharacteristicId; messageId: number }[] => {
	const seen: { characteristic: ReaderBtCharacteristicId; messageId: number }[] = [];
	simulator.onNotify = (characteristic, uint8Data) => {
		parseAllMessages(uint8Data).messages.forEach((message) => seen.push({ characteristic: characteristic, messageId: message.messageId }));
	};
	return seen;
};

const write = (simulator: FakeReaderBtDevice, characteristic: ReaderBtCharacteristicId, messageId: number, payload: number[] = []): void => {
	simulator.handleWrite(characteristic, renderMessage(renderRequest(messageId, payload)));
};

describe('FakeReaderBtDevice', () => {
	test('drops notifications when nothing is listening', () => {
		const simulator = new FakeReaderBtDevice();
		// No onNotify assigned; must warn rather than throw.
		expect(() => simulator.insertCard(8123456)).not.toThrow();
	});

	test('warns and stays silent for a sessions page it has no fixture for', async () => {
		const simulator = new FakeReaderBtDevice({ sessionsPages: [] });
		const seen = collectNotifications(simulator);
		write(simulator, 'sessions', msg.READ_SESSIONS, [0]);
		await Promise.resolve();
		expect(seen).toEqual([]);
	});

	test('warns and stays silent for a session it has no fixture for', async () => {
		const simulator = new FakeReaderBtDevice({ sessionDataByNumber: {} });
		const seen = collectNotifications(simulator);
		write(simulator, 'sessions', msg.READ_SESSION_DATA, [99, 0]);
		await Promise.resolve();
		expect(seen).toEqual([]);
	});

	test('warns and stays silent for an unhandled request', async () => {
		const simulator = new FakeReaderBtDevice();
		const seen = collectNotifications(simulator);
		write(simulator, 'cardData', 0x7777);
		await Promise.resolve();
		expect(seen).toEqual([]);
	});

	test('answers a session data request with the header and its readouts, as a real reader does', async () => {
		const simulator = new FakeReaderBtDevice();
		const seen = collectNotifications(simulator);
		write(simulator, 'sessions', msg.READ_SESSION_DATA, [12, 0]);
		await Promise.resolve();
		expect(seen).toEqual([
			{ characteristic: 'sessions', messageId: msg.SESSION_DATA_RESPONSE },
			{ characteristic: 'sessions', messageId: msg.CARD_READOUT_COMPLETE },
			{ characteristic: 'sessions', messageId: msg.CARD_READOUT_COMPLETE }
		]);
	});

	test('defaults a session data request with no payload to session 0', async () => {
		const simulator = new FakeReaderBtDevice({ sessionDataByNumber: { 0: [] } });
		const seen = collectNotifications(simulator);
		write(simulator, 'sessions', msg.READ_SESSION_DATA);
		await Promise.resolve();
		expect(seen).toEqual([{ characteristic: 'sessions', messageId: msg.SESSION_DATA_RESPONSE }]);
	});

	test('defaults a sessions request with no payload to page 0', async () => {
		const simulator = new FakeReaderBtDevice();
		const seen = collectNotifications(simulator);
		write(simulator, 'sessions', msg.READ_SESSIONS);
		await Promise.resolve();
		expect(seen).toEqual([{ characteristic: 'sessions', messageId: msg.SESSIONS_RESPONSE }]);
	});

	test('records writes and feedback for assertions', async () => {
		const simulator = new FakeReaderBtDevice();
		collectNotifications(simulator);
		write(simulator, 'cardData', msg.FEEDBACK, [2]);
		expect(simulator.feedbacks).toEqual([2]);
		expect(simulator.writes.map((entry) => entry.messageId)).toEqual([msg.FEEDBACK]);
	});

	test('ignores an unparseable settings write', async () => {
		const simulator = new FakeReaderBtDevice();
		collectNotifications(simulator);
		const before = simulator.settings;
		write(simulator, 'writeSettings', msg.WRITE_ALL_SETTINGS, [1]);
		expect(simulator.settings).toBe(before);
	});

	test('ignores a settings write with an invalid operating mode', async () => {
		const simulator = new FakeReaderBtDevice();
		const before = simulator.settings;
		write(simulator, 'writeSettings', msg.WRITE_ALL_SETTINGS, renderAllSettings({ codeNumber: 5, operatingMode: 0 }));
		expect(simulator.settings).toBe(before);
	});

	test('disconnects when the operating mode changes, not when only the code does', async () => {
		const simulator = new FakeReaderBtDevice();
		let disconnects = 0;
		simulator.onDisconnect = () => {
			disconnects += 1;
		};
		write(simulator, 'writeSettings', msg.WRITE_ALL_SETTINGS, renderAllSettings({ codeNumber: 5, operatingMode: ReaderBtOperatingMode.Readout }));
		await Promise.resolve();
		expect(disconnects).toBe(0);
		write(simulator, 'writeSettings', msg.WRITE_ALL_SETTINGS, renderAllSettings({ codeNumber: 5, operatingMode: ReaderBtOperatingMode.Printout }));
		await Promise.resolve();
		expect(simulator.settings.operatingMode).toBe(ReaderBtOperatingMode.Printout);
		expect(disconnects).toBe(1);
	});

	test('a mode change without a driver attached does not throw', async () => {
		const simulator = new FakeReaderBtDevice();
		write(simulator, 'writeSettings', msg.WRITE_ALL_SETTINGS, renderAllSettings({ codeNumber: 5, operatingMode: ReaderBtOperatingMode.Printout }));
		await expect(Promise.resolve()).resolves.toBeUndefined();
	});

	test('sets and reports autosend, and resets it on connect', async () => {
		const simulator = new FakeReaderBtDevice();
		const seen = collectNotifications(simulator);
		write(simulator, 'writeSettings', msg.SET_AUTOSEND, [1]);
		expect(simulator.autosend).toBe(true);
		write(simulator, 'readSettings', msg.READ_AUTOSEND);
		await Promise.resolve();
		expect(seen).toEqual([{ characteristic: 'readSettings', messageId: msg.READ_AUTOSEND }]);
		simulator.connect();
		expect(simulator.autosend).toBe(false);
	});

	test('drops every response when configured to', async () => {
		const simulator = new FakeReaderBtDevice({ dropResponses: true });
		const seen = collectNotifications(simulator);
		write(simulator, 'readSettings', msg.READ_ALL_SETTINGS);
		await Promise.resolve();
		expect(seen).toEqual([]);
	});
});
