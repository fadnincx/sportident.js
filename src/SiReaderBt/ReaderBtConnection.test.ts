import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { LogLevel, getDefaultLogLevel, setDefaultLogLevel } from '../utils/logging';
import * as testUtils from '../testUtils';
import { getFakeSiReaderBtDriver, type FakeSiReaderBtDevice, type FakeSiReaderBtDriver } from '../fakes/FakeSiReaderBtDriver';
import { msg } from './readerBtConstants';
import { renderMessage, renderRequest } from './readerBtProtocol';
import { SIAC_COMPLETE_PAYLOAD, SICARD9_MINIMAL_PAYLOAD, SIAC_CARD_NUMBER, segmentMessages, sessionDataTransfer } from './readerBtExamples';
import { ReaderBtConnection } from './ReaderBtConnection';
import { SiDeviceState } from './ISiReaderBtDevice';
import { ReaderBtCardRemovedError, ReaderBtDisconnectedError, ReaderBtTimeoutError } from './ReaderBtRequestTask';

testUtils.useFakeTimers();

let previousLogLevel: LogLevel;
beforeAll(() => {
	previousLogLevel = getDefaultLogLevel();
	setDefaultLogLevel(LogLevel.ERROR);
});
afterAll(() => {
	setDefaultLogLevel(previousLogLevel);
});

const SI9_READOUT = { messageId: msg.CARD_READOUT_MINIMAL, payload: SICARD9_MINIMAL_PAYLOAD };

/** A one-readout session download, pre-segmented so it can be trickled in by hand. */
const segmentedSessionData = (): number[][] => segmentMessages(sessionDataTransfer(12, [SI9_READOUT]), 8);

interface Harness {
	driver: FakeSiReaderBtDriver;
	device: FakeSiReaderBtDevice;
	connection: ReaderBtConnection;
}

const makeHarness = async (ident = 'reader-1', options: { segmentPayloadSize?: number; dropResponses?: boolean } = {}): Promise<Harness> => {
	const driver = getFakeSiReaderBtDriver();
	driver.simulatorOptions = options;
	const device = driver.getSiDevice(ident);
	const connection = ReaderBtConnection.fromSiReaderBtDevice(device);
	await device.open();
	return { driver: driver, device: device, connection: connection };
};

describe('ReaderBtConnection', () => {
	describe('memoisation', () => {
		test('returns the same connection for the same device', () => {
			const device = getFakeSiReaderBtDriver().getSiDevice('a');
			expect(ReaderBtConnection.fromSiReaderBtDevice(device)).toBe(ReaderBtConnection.fromSiReaderBtDevice(device));
		});
	});

	describe('request/response correlation', () => {
		test('resolves a settings request with its response', async () => {
			const { connection } = await makeHarness();
			const response = await connection.request(renderRequest(msg.READ_ALL_SETTINGS));
			expect(response.messageId).toEqual(msg.READ_ALL_SETTINGS);
		});

		test('writes the request to the characteristic the message belongs to', async () => {
			const { device, connection } = await makeHarness();
			await connection.request(renderRequest(msg.READ_DEVICE_INFO));
			await connection.request(renderRequest(msg.CARD_READOUT_COMPLETE));
			expect(device.data.device.simulator.writes.map((write) => write.characteristic)).toEqual(['readSettings', 'cardData']);
		});

		test('resolves a segmented response', async () => {
			const { connection } = await makeHarness('reader-1', { segmentPayloadSize: 24 });
			const response = await connection.request(renderRequest(msg.CARD_READOUT_COMPLETE));
			expect(response.payload).toEqual(SIAC_COMPLETE_PAYLOAD);
		});

		test('runs queued requests one at a time, in order', async () => {
			const { device, connection } = await makeHarness();
			const results = await Promise.all([
				connection.request(renderRequest(msg.CARD_READOUT_MINIMAL)),
				connection.request(renderRequest(msg.CARD_READOUT_COMPLETE)),
				connection.request(renderRequest(msg.READ_ALL_SETTINGS))
			]);
			expect(results.map((result) => result.messageId)).toEqual([msg.CARD_READOUT_MINIMAL, msg.CARD_READOUT_COMPLETE, msg.READ_ALL_SETTINGS]);
			expect(device.data.device.simulator.writes.map((write) => write.messageId)).toEqual([
				msg.CARD_READOUT_MINIMAL,
				msg.CARD_READOUT_COMPLETE,
				msg.READ_ALL_SETTINGS
			]);
		});

		test('does not let an unsolicited card state notification satisfy a request', async () => {
			const { device, connection } = await makeHarness();
			const seen: number[] = [];
			connection.addEventListener('message', (event) => seen.push(event.message.messageId));

			const pending = connection.request(renderRequest(msg.CARD_READOUT_COMPLETE));
			device.data.device.simulator.insertCard(8123456);
			const response = await pending;

			expect(response.messageId).toEqual(msg.CARD_READOUT_COMPLETE);
			expect(seen).toContain(msg.CARD_STATE_CHANGE);
		});

		test('ignores a response whose message id does not match the request', async () => {
			const { device, connection } = await makeHarness('reader-1', { dropResponses: true });
			// The assertion must be attached before the timers advance, or the rejection
			// lands with no handler and jest reports an unhandled rejection.
			const assertion = expect(connection.request(renderRequest(msg.READ_ALL_SETTINGS))).rejects.toBeInstanceOf(ReaderBtTimeoutError);
			device.data.device.simulator.emit('readSettings', { messageId: msg.SESSIONS_RESPONSE, payload: [0, 1, 0] });
			await testUtils.advanceTimersByTimeAsync(3000);
			await assertion;
		});

		test('tolerates a segmented notification arriving with an empty queue', async () => {
			const { device, connection } = await makeHarness('reader-1', { segmentPayloadSize: 8 });
			const seen: number[] = [];
			connection.addEventListener('message', (event) => seen.push(event.message.messageId));
			device.data.device.simulator.emit('cardData', { messageId: msg.CARD_READOUT_MINIMAL, payload: SICARD9_MINIMAL_PAYLOAD });
			await testUtils.runPromises();
			expect(seen).toEqual([msg.CARD_READOUT_MINIMAL]);
		});

		test('tolerates a response with no pending request', async () => {
			const { device, connection } = await makeHarness();
			const seen: number[] = [];
			connection.addEventListener('message', (event) => seen.push(event.message.messageId));
			device.data.device.simulator.emit('cardData', { messageId: msg.CARD_READOUT_COMPLETE, payload: SICARD9_MINIMAL_PAYLOAD });
			await testUtils.runPromises();
			expect(seen).toEqual([msg.CARD_READOUT_COMPLETE]);
		});

		test('rejects a request that has no defined response', async () => {
			const { connection } = await makeHarness();
			await expect(connection.request(renderRequest(msg.FEEDBACK))).rejects.toThrow('use send()');
		});

		test('rejects a request with no known characteristic', async () => {
			const { connection } = await makeHarness();
			// A response id is supplied so the lookup gets as far as the characteristic.
			await expect(connection.request({ messageId: 0x7777, payload: [] }, { responseMessageId: 0x8888 })).rejects.toThrow('No characteristic');
		});

		test('honours an explicit characteristic and response id', async () => {
			const { device, connection } = await makeHarness();
			const pending = connection.request(
				{ messageId: 0x7777, payload: [] },
				{ characteristic: 'cardData', responseMessageId: 0x8888, totalTimeoutMs: 5000, idleTimeoutMs: 5000 }
			);
			await testUtils.runPromises();
			device.data.device.simulator.emit('cardData', { messageId: 0x8888, payload: [1] });
			await expect(pending).resolves.toEqual({ messageId: 0x8888, payload: [1] });
		});
	});

	describe('send (fire and forget)', () => {
		test('resolves once the write completes, without waiting for a response', async () => {
			const { device, connection } = await makeHarness();
			await connection.send(renderRequest(msg.FEEDBACK, [1]));
			expect(device.data.device.simulator.feedbacks).toEqual([1]);
		});

		test('fails the request when the write itself rejects', async () => {
			const driver = getFakeSiReaderBtDriver();
			const device = driver.getSiDevice('write-fails');
			const connection = ReaderBtConnection.fromSiReaderBtDevice(device);
			await device.open();
			driver.write = () => Promise.reject(new Error('GATT write failed'));
			await expect(connection.request(renderRequest(msg.READ_ALL_SETTINGS))).rejects.toThrow('GATT write failed');
		});

		test('does not block later requests', async () => {
			const { connection } = await makeHarness();
			await connection.send(renderRequest(msg.FEEDBACK, [1]));
			const response = await connection.request(renderRequest(msg.READ_ALL_SETTINGS));
			expect(response.messageId).toEqual(msg.READ_ALL_SETTINGS);
		});
	});

	describe('timeouts', () => {
		test('fails a request that is never answered', async () => {
			const { connection } = await makeHarness('reader-1', { dropResponses: true });
			const assertion = expect(connection.request(renderRequest(msg.READ_ALL_SETTINGS))).rejects.toBeInstanceOf(ReaderBtTimeoutError);
			await testUtils.advanceTimersByTimeAsync(3000);
			await assertion;
		});

		test('a stalled transfer hits the idle timeout before the total budget', async () => {
			const { connection } = await makeHarness('reader-1', { dropResponses: true });
			// READ_SESSION_DATA has a 120s total budget but only a 5s idle budget.
			const assertion = expect(connection.request(renderRequest(msg.READ_SESSION_DATA, [12, 0]))).rejects.toBeInstanceOf(ReaderBtTimeoutError);
			await testUtils.advanceTimersByTimeAsync(5000);
			await assertion;
		});

		test('a request on a device stuck opening fails instead of hanging', async () => {
			const driver = getFakeSiReaderBtDriver();
			const device = driver.getSiDevice('never-opened');
			const connection = ReaderBtConnection.fromSiReaderBtDevice(device);
			device.setState(SiDeviceState.Opening);
			const assertion = expect(connection.request(renderRequest(msg.READ_ALL_SETTINGS))).rejects.toBeInstanceOf(ReaderBtTimeoutError);
			await testUtils.advanceTimersByTimeAsync(3000);
			await assertion;
		});

		test('arriving segments refresh the idle deadline', async () => {
			const { device, connection } = await makeHarness('reader-1', { dropResponses: true });
			const pending = connection.request(renderRequest(msg.READ_SESSION_DATA, [12, 0]));
			await testUtils.runPromises();

			// Trickle in segments more slowly than the 5s idle budget would allow in total,
			// but with each gap under it.
			const notifications = segmentedSessionData();
			for (const notification of notifications) {
				await testUtils.advanceTimersByTimeAsync(4000);
				device.data.device.simulator.onNotify?.('sessions', notification);
				await testUtils.runPromises();
			}
			const response = await pending;
			expect(response.messageId).toEqual(msg.SESSION_DATA_RESPONSE);
		});

		test('a session download waits for its readouts before it completes', async () => {
			const { device, connection } = await makeHarness('reader-1', { dropResponses: true });
			let settled = false;
			const pending = connection.requestAll(renderRequest(msg.READ_SESSION_DATA, [12, 0])).finally(() => {
				settled = true;
			});
			await testUtils.runPromises();
			const [header, readout] = sessionDataTransfer(12, [SI9_READOUT]);
			device.data.device.simulator.onNotify?.('sessions', renderMessage(header));
			await testUtils.runPromises();
			expect(settled).toBe(false);
			// The idle deadline restarts on the header, so a readout 4s later is in time.
			await testUtils.advanceTimersByTimeAsync(4000);
			device.data.device.simulator.onNotify?.('sessions', renderMessage(readout));
			await expect(pending).resolves.toEqual([header, readout]);
		});

		test('releases the queue so the next request can run after a timeout', async () => {
			const { device, connection } = await makeHarness('reader-1', { dropResponses: true });
			const firstAssertion = expect(connection.request(renderRequest(msg.READ_ALL_SETTINGS))).rejects.toBeInstanceOf(ReaderBtTimeoutError);
			// Generous budget so the second request outlives the first one's failure.
			const second = connection.request(renderRequest(msg.READ_DEVICE_INFO), { totalTimeoutMs: 60000, idleTimeoutMs: 60000 });
			await testUtils.runPromises();

			// Only affects writes from here on; the first request was already written.
			device.data.device.simulator.dropResponses = false;
			await testUtils.advanceTimersByTimeAsync(3000);
			await firstAssertion;

			await expect(second).resolves.toEqual(expect.objectContaining({ messageId: msg.READ_DEVICE_INFO }));
			// Both were attempted; the queue did not wedge on the first failure.
			expect(device.data.device.simulator.writes.map((write) => write.messageId)).toEqual([msg.READ_ALL_SETTINGS, msg.READ_DEVICE_INFO]);
		});
	});

	describe('disconnect', () => {
		test('fails every queued and in-flight request', async () => {
			const { device, connection } = await makeHarness('reader-1', { dropResponses: true });
			const firstAssertion = expect(connection.request(renderRequest(msg.READ_ALL_SETTINGS))).rejects.toBeInstanceOf(ReaderBtDisconnectedError);
			const secondAssertion = expect(connection.request(renderRequest(msg.READ_DEVICE_INFO))).rejects.toBeInstanceOf(ReaderBtDisconnectedError);
			await testUtils.runPromises();

			await device.close();

			await firstAssertion;
			await secondAssertion;
		});

		test('holds a request queued until the device opens', async () => {
			const driver = getFakeSiReaderBtDriver();
			const device = driver.getSiDevice('opening');
			const connection = ReaderBtConnection.fromSiReaderBtDevice(device);
			const opening = device.open();
			// as when a card is inserted while the subscriptions are still being set up
			const pending = connection.request(renderRequest(msg.READ_ALL_SETTINGS));
			expect(device.data.device.simulator.writes).toEqual([]);
			await opening;
			await expect(pending).resolves.toBeDefined();
		});

		test('rejects at once on a closed device instead of waiting out the timeout', async () => {
			const driver = getFakeSiReaderBtDriver();
			const device = driver.getSiDevice('closed');
			const connection = ReaderBtConnection.fromSiReaderBtDevice(device);
			await expect(connection.request(renderRequest(msg.READ_ALL_SETTINGS))).rejects.toThrow('Reader BT is closed');
			await expect(connection.send(renderRequest(msg.FEEDBACK, [1]))).rejects.toBeInstanceOf(ReaderBtDisconnectedError);
			expect(device.data.device.simulator.writes).toEqual([]);
		});
	});

	describe('session downloads', () => {
		test('collects the readouts the header announces, in one transfer', async () => {
			const { connection } = await makeHarness();
			const messages = await connection.requestAll(renderRequest(msg.READ_SESSION_DATA, [12, 0]));
			expect(messages.map((message) => message.messageId)).toEqual([msg.SESSION_DATA_RESPONSE, msg.CARD_READOUT_COMPLETE, msg.CARD_READOUT_COMPLETE]);
		});

		test('collects them from a segmented transfer too', async () => {
			const { connection } = await makeHarness('reader-1', { segmentPayloadSize: 40 });
			const messages = await connection.requestAll(renderRequest(msg.READ_SESSION_DATA, [12, 0]));
			expect(messages).toHaveLength(3);
		});

		test('does not take an autoRead push on cardData for a session readout', async () => {
			const { device, connection } = await makeHarness('reader-1', { dropResponses: true });
			const pending = connection.requestAll(renderRequest(msg.READ_SESSION_DATA, [12, 0]));
			await testUtils.runPromises();
			const [header, readout] = sessionDataTransfer(12, [SI9_READOUT]);
			const pushed = { messageId: msg.CARD_READOUT_COMPLETE, payload: SIAC_COMPLETE_PAYLOAD };
			device.data.device.simulator.onNotify?.('sessions', renderMessage(header));
			device.data.device.simulator.onNotify?.('cardData', renderMessage(pushed));
			device.data.device.simulator.onNotify?.('sessions', renderMessage(readout));
			await expect(pending).resolves.toEqual([header, readout]);
		});

		test('request() resolves with the header alone', async () => {
			const { connection } = await makeHarness();
			const response = await connection.request(renderRequest(msg.READ_SESSION_DATA, [12, 0]));
			expect(response.messageId).toEqual(msg.SESSION_DATA_RESPONSE);
		});

		test('requestAll rejects a fire-and-forget request', async () => {
			const { connection } = await makeHarness();
			await expect(connection.requestAll(renderRequest(msg.FEEDBACK, [1]))).rejects.toThrow('has no response');
		});
	});

	describe('card removal', () => {
		test('fails a readout whose card is pulled, without waiting for the timeout', async () => {
			const { device, connection } = await makeHarness('reader-1', { dropResponses: true });
			const pending = connection.request(renderRequest(msg.CARD_READOUT_COMPLETE));
			await testUtils.runPromises();
			device.data.device.simulator.removeCard(SIAC_CARD_NUMBER);
			await testUtils.runPromises();
			await expect(pending).rejects.toBeInstanceOf(ReaderBtCardRemovedError);
		});

		test('leaves a readout alone when a card is inserted', async () => {
			const { device, connection } = await makeHarness();
			const pending = connection.request(renderRequest(msg.CARD_READOUT_COMPLETE));
			device.data.device.simulator.insertCard(SIAC_CARD_NUMBER);
			await expect(pending).resolves.toEqual(expect.objectContaining({ messageId: msg.CARD_READOUT_COMPLETE }));
		});

		test('leaves other requests alone when a card is pulled', async () => {
			const { device, connection } = await makeHarness();
			const pending = connection.request(renderRequest(msg.READ_ALL_SETTINGS));
			device.data.device.simulator.removeCard(SIAC_CARD_NUMBER);
			await expect(pending).resolves.toBeDefined();
		});

		test('ignores a removal with nothing in flight', async () => {
			const { device, connection } = await makeHarness();
			device.data.device.simulator.removeCard(SIAC_CARD_NUMBER);
			await testUtils.runPromises();
			await expect(connection.request(renderRequest(msg.READ_ALL_SETTINGS))).resolves.toBeDefined();
		});
	});

	describe('multiple readers', () => {
		test('queues never span devices', async () => {
			const driver = getFakeSiReaderBtDriver();
			driver.simulatorOptions = {};
			const slowDevice = driver.getSiDevice('slow');
			const fastDevice = driver.getSiDevice('fast');
			const slowConnection = ReaderBtConnection.fromSiReaderBtDevice(slowDevice);
			const fastConnection = ReaderBtConnection.fromSiReaderBtDevice(fastDevice);
			await slowDevice.open();
			await fastDevice.open();

			// A long session download stalls on the slow reader...
			slowDevice.data.device.simulator.dropResponses = true;
			const slowAssertion = expect(slowConnection.request(renderRequest(msg.READ_SESSION_DATA, [12, 0]))).rejects.toBeInstanceOf(ReaderBtTimeoutError);

			// ...while the other reader completes a card readout unaffected.
			const readout = await fastConnection.request(renderRequest(msg.CARD_READOUT_COMPLETE));
			expect(readout.payload).toEqual(SIAC_COMPLETE_PAYLOAD);

			await testUtils.advanceTimersByTimeAsync(5000);
			await slowAssertion;
		});

		test('a disconnect on one reader leaves the other working', async () => {
			const driver = getFakeSiReaderBtDriver();
			const deviceA = driver.getSiDevice('a');
			const deviceB = driver.getSiDevice('b');
			const connectionA = ReaderBtConnection.fromSiReaderBtDevice(deviceA);
			const connectionB = ReaderBtConnection.fromSiReaderBtDevice(deviceB);
			await deviceA.open();
			await deviceB.open();

			deviceA.data.device.simulator.dropResponses = true;
			const assertionA = expect(connectionA.request(renderRequest(msg.READ_ALL_SETTINGS))).rejects.toBeInstanceOf(ReaderBtDisconnectedError);
			await testUtils.runPromises();
			await deviceA.close();
			await assertionA;

			const response = await connectionB.request(renderRequest(msg.READ_ALL_SETTINGS));
			expect(response.messageId).toEqual(msg.READ_ALL_SETTINGS);
		});
	});
});
