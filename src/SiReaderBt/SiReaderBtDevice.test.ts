import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { LogLevel, getDefaultLogLevel, setDefaultLogLevel } from '../utils/logging';
import { FakeSiReaderBtDriver, getFakeSiReaderBtDriver, type FakeSiReaderBtDevice } from '../fakes/FakeSiReaderBtDriver';
import { ReaderBtOperatingMode, msg, readerBtNotifyCharacteristicIds } from './readerBtConstants';
import { renderMessage, renderRequest } from './readerBtProtocol';
import { DeviceClosedError, SiDeviceState } from './ISiReaderBtDevice';
import { SiReaderBtDevice } from './SiReaderBtDevice';
import { isSiReaderBtDriverWithAutodetection } from './ISiReaderBtDriver';
import { testISiReaderBtDriver } from './testUtils/testISiReaderBtDriver';

let previousLogLevel: LogLevel;
beforeAll(() => {
	previousLogLevel = getDefaultLogLevel();
	setDefaultLogLevel(LogLevel.ERROR);
});
afterAll(() => {
	setDefaultLogLevel(previousLogLevel);
});

const getOpenableDevice = (): { driver: FakeSiReaderBtDriver; device: FakeSiReaderBtDevice } => {
	const driver = getFakeSiReaderBtDriver();
	driver.identToBeDetected = 'reader-1';
	const device = driver.getSiDevice('reader-1');
	return { driver: driver, device: device };
};

describe('SiReaderBtDevice', () => {
	testISiReaderBtDriver<never>(
		(() => {
			const driver = getFakeSiReaderBtDriver();
			driver.identToBeDetected = 'conformance';
			return driver.detect();
		}) as any,
		((device: FakeSiReaderBtDevice, uint8Data: number[]) => {
			device.data.device.simulator.onNotify?.('cardState', uint8Data);
		}) as any
	);

	describe('identity', () => {
		test('names and idents are namespaced by driver', () => {
			const { device } = getOpenableDevice();
			expect(device.name).toEqual('FakeReaderBt(reader-1)');
			expect(device.ident).toEqual('FakeReaderBt-reader-1');
		});
		test('the same ident yields the same device instance', () => {
			const driver = getFakeSiReaderBtDriver();
			expect(driver.getSiDevice('a')).toBe(driver.getSiDevice('a'));
			expect(driver.getSiDevice('a')).not.toBe(driver.getSiDevice('b'));
		});
	});

	describe('state machine', () => {
		test('starts closed', () => {
			const { device } = getOpenableDevice();
			expect(device.state).toEqual(SiDeviceState.Closed);
		});

		test('open subscribes to every notifying characteristic', async () => {
			const { device } = getOpenableDevice();
			await device.open();
			expect(device.state).toEqual(SiDeviceState.Opened);
			readerBtNotifyCharacteristicIds.forEach((characteristic) => {
				expect(device.data.device.subscribed[characteristic]).toBe(true);
			});
		});

		test('dispatches stateChange only on an actual change', async () => {
			const { device } = getOpenableDevice();
			const states: SiDeviceState[] = [];
			device.addEventListener('stateChange', (event) => states.push(event.state));
			await device.open();
			await device.open();
			await device.close();
			expect(states).toEqual([SiDeviceState.Opening, SiDeviceState.Opened, SiDeviceState.Closing, SiDeviceState.Closed]);
		});

		test('opening an already open device resolves with the device', async () => {
			const { device } = getOpenableDevice();
			await device.open();
			await expect(device.open()).resolves.toBe(device);
		});

		test('closing an already closed device resolves with the device', async () => {
			const { device } = getOpenableDevice();
			await expect(device.close()).resolves.toBe(device);
		});

		test('rejects opening while opening', async () => {
			const { device } = getOpenableDevice();
			const opening = device.open();
			await expect(device.open()).rejects.toThrow();
			await opening;
		});

		test('rejects closing while opening', async () => {
			const { device } = getOpenableDevice();
			const opening = device.open();
			await expect(device.close()).rejects.toThrow();
			await opening;
		});

		test('returns to Closed when the driver fails to open', async () => {
			const driver = getFakeSiReaderBtDriver();
			driver.open = () => Promise.reject(new Error('nope'));
			const device = driver.getSiDevice('broken');
			await expect(device.open()).rejects.toThrow('nope');
			expect(device.state).toEqual(SiDeviceState.Closed);
		});

		test('returns to Closed when the driver fails to close', async () => {
			const { driver, device } = getOpenableDevice();
			await device.open();
			driver.close = () => Promise.reject(new Error('nope'));
			await expect(device.close()).rejects.toThrow('nope');
			expect(device.state).toEqual(SiDeviceState.Closed);
		});
	});

	describe('notifications', () => {
		test('carry both the characteristic and the bytes', async () => {
			const { device } = getOpenableDevice();
			await device.open();
			const events: { characteristic: string; uint8Data: number[] }[] = [];
			device.addEventListener('notify', (event) => events.push({ characteristic: event.characteristic, uint8Data: event.uint8Data }));
			device.handleNotify('cardState', [1, 2, 3]);
			expect(events).toEqual([{ characteristic: 'cardState', uint8Data: [1, 2, 3] }]);
		});

		test('are not delivered for characteristics that are not subscribed', async () => {
			const { device } = getOpenableDevice();
			await device.open();
			await device.unsubscribe('cardData');
			const events: string[] = [];
			device.addEventListener('notify', (event) => events.push(event.characteristic));
			device.data.device.simulator.onNotify?.('cardData', [1, 2, 3]);
			expect(events).toEqual([]);
		});
	});

	describe('write', () => {
		test('reaches the simulator', async () => {
			const { device } = getOpenableDevice();
			await device.open();
			await device.write('cardData', renderMessage(renderRequest(msg.CARD_READOUT_COMPLETE)), true);
			expect(device.data.device.simulator.writes.map((write) => write.messageId)).toEqual([msg.CARD_READOUT_COMPLETE]);
		});

		test('rejects when the device is not open', async () => {
			const { device } = getOpenableDevice();
			await expect(device.write('cardData', [1, 2, 3])).rejects.toBeInstanceOf(DeviceClosedError);
		});
	});

	describe('driver capability detection', () => {
		test('recognises an autodetecting driver', () => {
			expect(isSiReaderBtDriverWithAutodetection(getFakeSiReaderBtDriver())).toBe(true);
		});
		test('rejects a driver without autodetection', () => {
			const driver = getFakeSiReaderBtDriver() as unknown as { startAutoDetection?: unknown };
			driver.startAutoDetection = undefined;
			expect(isSiReaderBtDriverWithAutodetection(driver as never)).toBe(false);
		});
	});

	describe('FakeSiReaderBtDriver', () => {
		test('detect rejects without a configured ident', async () => {
			await expect(getFakeSiReaderBtDriver().detect()).rejects.toThrow();
		});

		test('detect returns the configured device', async () => {
			const driver = getFakeSiReaderBtDriver();
			driver.identToBeDetected = 'reader-9';
			const device = await driver.detect();
			expect(device.ident).toEqual('FakeReaderBt-reader-9');
		});

		test('rejects detecting the same device twice', async () => {
			const driver = getFakeSiReaderBtDriver();
			driver.identToBeDetected = 'reader-9';
			await driver.detect();
			await expect(driver.detect()).rejects.toThrow('Duplicate');
		});

		test('autodetection dispatches add and remove', async () => {
			const driver = getFakeSiReaderBtDriver();
			driver.identsToBeAutodetected = ['reader-1'];
			const added: string[] = [];
			const removed: string[] = [];
			driver.addEventListener('add', (event) => added.push(event.siDevice.ident));
			driver.addEventListener('remove', (event) => removed.push(event.siDevice.ident));

			const initial = await driver.startAutoDetection();
			expect(initial).toHaveLength(1);
			expect(driver.isAutoDetectionRunning()).toBe(true);
			expect(added).toEqual([]);

			await driver.handleDeviceConnected('reader-2');
			expect(added).toEqual(['FakeReaderBt-reader-2']);

			await driver.handleDeviceDisconnected('reader-2');
			expect(removed).toEqual(['FakeReaderBt-reader-2']);

			await driver.stopAutoDetection();
			expect(driver.isAutoDetectionRunning()).toBe(false);
		});

		test('hotplug callbacks require autodetection to be running', async () => {
			const driver = getFakeSiReaderBtDriver();
			await expect(driver.handleDeviceConnected('x')).rejects.toThrow('autodetection not running');
			await expect(driver.handleDeviceDisconnected('x')).rejects.toThrow('autodetection not running');
		});

		test('disconnecting an unknown device throws', async () => {
			const driver = getFakeSiReaderBtDriver();
			await driver.startAutoDetection();
			await expect(driver.handleDeviceDisconnected('nope')).rejects.toThrow('No such device');
		});

		test('disconnecting closes the device', async () => {
			const driver = getFakeSiReaderBtDriver();
			driver.identsToBeAutodetected = ['reader-1'];
			await driver.startAutoDetection();
			const device = driver.getSiDevice('reader-1');
			await device.open();
			await driver.handleDeviceDisconnected('reader-1');
			expect(device.state).toEqual(SiDeviceState.Closed);
		});

		test('forgetting a device that was never autodetected dispatches no remove', async () => {
			const driver = getFakeSiReaderBtDriver();
			const removed: string[] = [];
			driver.addEventListener('remove', (event) => removed.push(event.siDevice.ident));
			await driver.forgetSiDevice(driver.getSiDevice('never-detected'));
			expect(removed).toEqual([]);
		});

		test('subscribing to a closed device rejects', async () => {
			const { device } = getOpenableDevice();
			await expect(device.subscribe('cardData')).rejects.toBeInstanceOf(DeviceClosedError);
		});

		test('closing clears the subscriptions', async () => {
			const { device } = getOpenableDevice();
			await device.open();
			await device.close();
			expect(device.data.device.subscribed).toEqual({});
		});

		test('simulatorOptions are applied to new simulators', () => {
			const driver = getFakeSiReaderBtDriver();
			driver.simulatorOptions = { settings: { codeNumber: 42, operatingMode: ReaderBtOperatingMode.Standalone } };
			expect(driver.getSimulator('x').settings).toEqual({ codeNumber: 42, operatingMode: ReaderBtOperatingMode.Standalone });
		});

		test('the same ident yields the same simulator', () => {
			const driver = getFakeSiReaderBtDriver();
			expect(driver.getSimulator('x')).toBe(driver.getSimulator('x'));
		});
	});

	describe('SiReaderBtDevice constructor', () => {
		test('accepts a bare driver data object', () => {
			const driver = getFakeSiReaderBtDriver();
			const device = new SiReaderBtDevice('manual', {
				driver: driver,
				device: { ident: 'manual', isOpened: false, subscribed: {}, simulator: driver.getSimulator('manual') }
			});
			expect(device.ident).toEqual('FakeReaderBt-manual');
			expect(device.state).toEqual(SiDeviceState.Closed);
		});
	});
});
