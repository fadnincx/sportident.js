import * as utils from '../utils';
import type { BaseSiCard } from '../SiCard/BaseSiCard';
import type { ISiReaderBtDriverData } from './ISiReaderBtDevice';
import type {
	ISiReaderBtDriverWithAutodetection,
	SiReaderBtDeviceAddEvent,
	SiReaderBtDeviceRemoveEvent
} from './ISiReaderBtDriver';
import { ReaderBtStation, type ReaderBtStationSetup } from './ReaderBtStation';
import type {
	ReaderBtCleanUpFunction,
	ReaderBtStationSiCardInsertedEvent,
	ReaderBtStationSiCardObservedEvent,
	ReaderBtStationSiCardRemovedEvent
} from './IReaderBtStation';
import {
	ReaderBtRegistryActiveChangeEvent,
	ReaderBtRegistryAddEvent,
	ReaderBtRegistryRemoveEvent,
	ReaderBtRegistryStateChangeEvent,
	type ReaderBtDispatchMode,
	type ReaderBtStationRegistryEvents
} from './IReaderBtStationRegistry';

/** Holds several connected Reader BTs and gives them one event stream. Each reader
 * already has its own device, connection and request queue, so a session download on
 * one never delays a card readout on another. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ReaderBtStationRegistry {
	// 'all' aggregates every reader, 'activeOnly' narrows to the selected one
	public dispatchMode: ReaderBtDispatchMode = 'all';

	private stationByIdent: { [ident: string]: ReaderBtStation } = {};
	private detachByIdent: { [ident: string]: () => void } = {};
	private internalActiveIdent?: string;

	get stations(): ReaderBtStation[] {
		return Object.values(this.stationByIdent);
	}

	get activeIdent(): string | undefined {
		return this.internalActiveIdent;
	}

	get active(): ReaderBtStation | undefined {
		return this.internalActiveIdent === undefined ? undefined : this.stationByIdent[this.internalActiveIdent];
	}

	get(ident: string): ReaderBtStation | undefined {
		return this.stationByIdent[ident];
	}

	// Idempotent by ident. The first station added also becomes the active one.
	add(station: ReaderBtStation): ReaderBtStation {
		const ident = station.ident;
		const existing = this.stationByIdent[ident];
		if (existing !== undefined) {
			return existing;
		}
		this.stationByIdent[ident] = station;

		const onInserted = (event: ReaderBtStationSiCardInsertedEvent): void => {
			this.forwardCardEvent('siCardInserted', station, event);
		};
		const onRemoved = (event: ReaderBtStationSiCardRemovedEvent): void => {
			this.forwardCardEvent('siCardRemoved', station, event);
		};
		const onObserved = (event: ReaderBtStationSiCardObservedEvent): void => {
			this.forwardCardEvent('siCardObserved', station, event);
		};
		const onStateChange = (event: { state: number }): void => {
			this.dispatchEvent('stateChange', new ReaderBtRegistryStateChangeEvent(station, event.state));
		};
		station.addEventListener('siCardInserted', onInserted);
		station.addEventListener('siCardRemoved', onRemoved);
		station.addEventListener('siCardObserved', onObserved);
		station.siDevice.addEventListener('stateChange', onStateChange);
		this.detachByIdent[ident] = () => {
			station.removeEventListener('siCardInserted', onInserted);
			station.removeEventListener('siCardRemoved', onRemoved);
			station.removeEventListener('siCardObserved', onObserved);
			station.siDevice.removeEventListener('stateChange', onStateChange);
		};

		this.dispatchEvent('add', new ReaderBtRegistryAddEvent(station));
		if (this.internalActiveIdent === undefined) {
			this.setActive(ident);
		}
		return station;
	}

	// A BLE disconnect does not remove a station: drops are routine and removing would
	// lose the active selection. Entries leave only here or on a driver 'remove' event.
	remove(ident: string): void {
		const station = this.stationByIdent[ident];
		if (station === undefined) {
			return;
		}
		this.detachByIdent[ident]();
		delete this.detachByIdent[ident];
		delete this.stationByIdent[ident];
		this.dispatchEvent('remove', new ReaderBtRegistryRemoveEvent(station));
		if (this.internalActiveIdent === ident) {
			this.setActive(this.stations[0]?.ident);
		}
	}

	// The ident is stable (BluetoothDevice.id on Web Bluetooth), so it can be persisted
	// and restored to remember which reader to use.
	setActive(ident: string | undefined): void {
		if (ident !== undefined && this.stationByIdent[ident] === undefined) {
			throw new Error(`No Reader BT station with ident ${ident}`);
		}
		if (this.internalActiveIdent === ident) {
			return;
		}
		this.internalActiveIdent = ident;
		this.dispatchEvent('activeChange', new ReaderBtRegistryActiveChangeEvent(this.active));
	}

	// Populates the registry from a driver that can scan. Web Bluetooth cannot, so there
	// the app calls add() itself after each detect().
	attachDriver<T extends ISiReaderBtDriverData<unknown>>(driver: ISiReaderBtDriverWithAutodetection<T>): () => void {
		const onAdd = (event: SiReaderBtDeviceAddEvent<T>): void => {
			this.add(ReaderBtStation.fromSiReaderBtDevice(event.siDevice));
		};
		const onRemove = (event: SiReaderBtDeviceRemoveEvent<T>): void => {
			this.remove(event.siDevice.ident);
		};
		driver.addEventListener('add', onAdd);
		driver.addEventListener('remove', onRemove);
		return () => {
			driver.removeEventListener('add', onAdd);
			driver.removeEventListener('remove', onRemove);
		};
	}

	// Configures every station registered now and delivers their cards to one handler.
	// Stations added later are not configured; call their own readCards.
	async readCards(onCardInserted: (card: BaseSiCard) => void, setup: ReaderBtStationSetup = {}): Promise<ReaderBtCleanUpFunction> {
		const cleanUps = await Promise.all(this.stations.map((station) => station.readCards(() => undefined, setup)));
		const listener = (event: ReaderBtStationSiCardInsertedEvent): void => onCardInserted(event.siCard);
		this.addEventListener('siCardInserted', listener);
		return async () => {
			this.removeEventListener('siCardInserted', listener);
			await Promise.all(cleanUps.map((cleanUp) => cleanUp()));
		};
	}

	private forwardCardEvent<K extends 'siCardInserted' | 'siCardRemoved' | 'siCardObserved'>(
		type: K,
		station: ReaderBtStation,
		event: ReaderBtStationRegistryEvents[K]
	): void {
		if (this.dispatchMode === 'activeOnly' && station !== this.active) {
			return;
		}
		this.dispatchEvent(type, event);
	}
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ReaderBtStationRegistry extends utils.EventTarget<ReaderBtStationRegistryEvents> {}
utils.applyMixins(ReaderBtStationRegistry, [utils.EventTarget]);

export const getReaderBtStationRegistry = (): ReaderBtStationRegistry => new ReaderBtStationRegistry();
