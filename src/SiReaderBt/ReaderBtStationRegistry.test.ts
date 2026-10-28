import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { LogLevel, getDefaultLogLevel, setDefaultLogLevel } from '../utils/logging';
import * as testUtils from '../testUtils';
import type { BaseSiCard } from '../SiCard/BaseSiCard';
import { getFakeSiReaderBtDriver, type FakeSiReaderBtDriver, type FakeSiReaderBtDriverData } from '../fakes/FakeSiReaderBtDriver';
import type { FakeReaderBtDevice } from '../fakes/FakeReaderBtDevice';
import { ReaderBtOperatingMode } from './readerBtConstants';
import { SIAC_CARD_NUMBER } from './readerBtExamples';
import { SiDeviceState } from './ISiReaderBtDevice';
import { ReaderBtStation } from './ReaderBtStation';
import { ReaderBtStationRegistry, getReaderBtStationRegistry } from './ReaderBtStationRegistry';

testUtils.useFakeTimers();

let previousLogLevel: LogLevel;
beforeAll(() => {
	previousLogLevel = getDefaultLogLevel();
	setDefaultLogLevel(LogLevel.ERROR);
});
afterAll(() => {
	setDefaultLogLevel(previousLogLevel);
});

const makeTwoReaders = async (): Promise<{
	driver: FakeSiReaderBtDriver;
	registry: ReaderBtStationRegistry;
	stationA: ReaderBtStation;
	stationB: ReaderBtStation;
}> => {
	const driver = getFakeSiReaderBtDriver();
	driver.simulatorOptions = { settings: { codeNumber: 31, operatingMode: ReaderBtOperatingMode.Readout } };
	const stationA = ReaderBtStation.fromSiReaderBtDevice(driver.getSiDevice('a'));
	const stationB = ReaderBtStation.fromSiReaderBtDevice(driver.getSiDevice('b'));
	await stationA.open();
	await stationB.open();
	const registry = getReaderBtStationRegistry();
	registry.add(stationA);
	registry.add(stationB);
	return { driver: driver, registry: registry, stationA: stationA, stationB: stationB };
};

const simulatorOf = (station: ReaderBtStation): FakeReaderBtDevice => (station.siDevice.data as FakeSiReaderBtDriverData).device.simulator;

describe('ReaderBtStationRegistry', () => {
	describe('membership', () => {
		test('holds stations by ident and is idempotent', async () => {
			const { registry, stationA } = await makeTwoReaders();
			expect(registry.stations).toHaveLength(2);
			expect(registry.add(stationA)).toBe(stationA);
			expect(registry.stations).toHaveLength(2);
			expect(registry.get(stationA.ident)).toBe(stationA);
			expect(registry.get('nope')).toBeUndefined();
		});

		test('dispatches add and remove', async () => {
			const { registry, stationA } = await makeTwoReaders();
			const removed: string[] = [];
			registry.addEventListener('remove', (event) => removed.push(event.station.ident));
			registry.remove(stationA.ident);
			expect(removed).toEqual([stationA.ident]);
			expect(registry.stations).toHaveLength(1);
		});

		test('removing an unknown ident is a no-op', async () => {
			const { registry } = await makeTwoReaders();
			registry.remove('nope');
			expect(registry.stations).toHaveLength(2);
		});

		test('a removed station no longer forwards its cards', async () => {
			const { registry, stationA } = await makeTwoReaders();
			const seen: BaseSiCard[] = [];
			registry.addEventListener('siCardInserted', (event) => seen.push(event.siCard));
			registry.remove(stationA.ident);
			simulatorOf(stationA).insertCard(SIAC_CARD_NUMBER);
			await testUtils.runPromises();
			expect(seen).toEqual([]);
		});
	});

	describe('active selection', () => {
		test('the first station added becomes active', async () => {
			const { registry, stationA } = await makeTwoReaders();
			expect(registry.active).toBe(stationA);
			expect(registry.activeIdent).toEqual(stationA.ident);
		});

		test('setActive dispatches activeChange', async () => {
			const { registry, stationB } = await makeTwoReaders();
			const changes: (string | undefined)[] = [];
			registry.addEventListener('activeChange', (event) => changes.push(event.station?.ident));
			registry.setActive(stationB.ident);
			expect(registry.active).toBe(stationB);
			expect(changes).toEqual([stationB.ident]);
		});

		test('setting the same active twice dispatches once', async () => {
			const { registry, stationB } = await makeTwoReaders();
			const changes: (string | undefined)[] = [];
			registry.addEventListener('activeChange', (event) => changes.push(event.station?.ident));
			registry.setActive(stationB.ident);
			registry.setActive(stationB.ident);
			expect(changes).toHaveLength(1);
		});

		test('throws for an unknown ident', async () => {
			const { registry } = await makeTwoReaders();
			expect(() => registry.setActive('nope')).toThrow('No Reader BT station');
		});

		test('removing the active station promotes another', async () => {
			const { registry, stationA, stationB } = await makeTwoReaders();
			registry.remove(stationA.ident);
			expect(registry.active).toBe(stationB);
		});

		test('removing the last station clears the active selection', async () => {
			const { registry, stationA, stationB } = await makeTwoReaders();
			registry.remove(stationA.ident);
			registry.remove(stationB.ident);
			expect(registry.active).toBeUndefined();
			expect(registry.activeIdent).toBeUndefined();
		});

		test('removing a non-active station leaves the active selection alone', async () => {
			const { registry, stationA, stationB } = await makeTwoReaders();
			registry.remove(stationB.ident);
			expect(registry.active).toBe(stationA);
		});

		test('can be cleared explicitly', async () => {
			const { registry } = await makeTwoReaders();
			registry.setActive(undefined);
			expect(registry.active).toBeUndefined();
		});
	});

	describe('dispatchMode', () => {
		test('all forwards every reader, tagged with its source', async () => {
			const { registry, stationA, stationB } = await makeTwoReaders();
			const sources: string[] = [];
			registry.addEventListener('siCardInserted', (event) => sources.push(event.station.ident));

			simulatorOf(stationA).insertCard(SIAC_CARD_NUMBER);
			simulatorOf(stationB).insertCard(1234567);
			await testUtils.runPromises();

			expect(sources).toEqual([stationA.ident, stationB.ident]);
		});

		test('activeOnly forwards just the active reader', async () => {
			const { registry, stationA, stationB } = await makeTwoReaders();
			registry.dispatchMode = 'activeOnly';
			registry.setActive(stationB.ident);
			const sources: string[] = [];
			registry.addEventListener('siCardInserted', (event) => sources.push(event.station.ident));

			simulatorOf(stationA).insertCard(SIAC_CARD_NUMBER);
			simulatorOf(stationB).insertCard(1234567);
			await testUtils.runPromises();

			expect(sources).toEqual([stationB.ident]);
		});

		test('forwards removals and observations too', async () => {
			const { registry, stationA } = await makeTwoReaders();
			const removed: number[] = [];
			const observed: number[] = [];
			registry.addEventListener('siCardRemoved', (event) => removed.push(event.siCard.cardNumber));
			registry.addEventListener('siCardObserved', (event) => observed.push(event.siCard.cardNumber));

			simulatorOf(stationA).autosend = true;
			simulatorOf(stationA).insertCard(SIAC_CARD_NUMBER);
			await testUtils.runPromises();
			await testUtils.runPromises();
			simulatorOf(stationA).removeCard(SIAC_CARD_NUMBER);
			await testUtils.runPromises();

			expect(removed).toEqual([SIAC_CARD_NUMBER]);
			expect(observed).toEqual([SIAC_CARD_NUMBER]);
		});
	});

	describe('device state', () => {
		test('a disconnect keeps the station registered and reports stateChange', async () => {
			const { registry, stationA } = await makeTwoReaders();
			const states: SiDeviceState[] = [];
			registry.addEventListener('stateChange', (event) => states.push(event.state));

			await stationA.close();

			expect(states).toContain(SiDeviceState.Closed);
			// BLE drops are routine; losing the entry would lose the user's selection.
			expect(registry.get(stationA.ident)).toBe(stationA);
			expect(registry.active).toBe(stationA);
		});
	});

	describe('attachDriver', () => {
		test('populates and depopulates from an autodetecting driver', async () => {
			const driver = getFakeSiReaderBtDriver();
			const registry = getReaderBtStationRegistry();
			const detach = registry.attachDriver(driver);
			await driver.startAutoDetection();

			await driver.handleDeviceConnected('scanned-1');
			expect(registry.stations.map((station) => station.ident)).toEqual(['FakeReaderBt-scanned-1']);

			await driver.handleDeviceDisconnected('scanned-1');
			expect(registry.stations).toEqual([]);

			detach();
			await driver.handleDeviceConnected('scanned-2');
			expect(registry.stations).toEqual([]);
		});
	});

	describe('readCards', () => {
		test('configures every station and aggregates their cards', async () => {
			const { registry, stationA, stationB } = await makeTwoReaders();
			const seen: number[] = [];
			const cleanUp = await registry.readCards((card) => seen.push(card.cardNumber), { codeNumber: 55 });

			expect(simulatorOf(stationA).settings.codeNumber).toEqual(55);
			expect(simulatorOf(stationB).settings.codeNumber).toEqual(55);

			simulatorOf(stationA).insertCard(SIAC_CARD_NUMBER);
			simulatorOf(stationB).insertCard(1234567);
			await testUtils.runPromises();
			expect(seen).toEqual([SIAC_CARD_NUMBER, 1234567]);

			await cleanUp();
			expect(simulatorOf(stationA).settings.codeNumber).toEqual(31);
			expect(simulatorOf(stationB).settings.codeNumber).toEqual(31);

			simulatorOf(stationA).insertCard(SIAC_CARD_NUMBER);
			await testUtils.runPromises();
			expect(seen).toHaveLength(2);
		});

		test('honours activeOnly', async () => {
			const { registry, stationA, stationB } = await makeTwoReaders();
			registry.dispatchMode = 'activeOnly';
			registry.setActive(stationB.ident);
			const seen: number[] = [];
			await registry.readCards((card) => seen.push(card.cardNumber));

			simulatorOf(stationA).insertCard(SIAC_CARD_NUMBER);
			simulatorOf(stationB).insertCard(1234567);
			await testUtils.runPromises();

			expect(seen).toEqual([1234567]);
		});
	});
});
