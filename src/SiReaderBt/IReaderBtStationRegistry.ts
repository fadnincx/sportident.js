import * as utils from '../utils';
import type { SiDeviceState } from './ISiReaderBtDevice';
import type { ReaderBtStation } from './ReaderBtStation';
import type {
	ReaderBtStationSiCardInsertedEvent,
	ReaderBtStationSiCardObservedEvent,
	ReaderBtStationSiCardRemovedEvent
} from './IReaderBtStation';

export class ReaderBtRegistryAddEvent extends utils.Event<'add'> {
	constructor(public station: ReaderBtStation) {
		super();
	}
}

export class ReaderBtRegistryRemoveEvent extends utils.Event<'remove'> {
	constructor(public station: ReaderBtStation) {
		super();
	}
}

export class ReaderBtRegistryActiveChangeEvent extends utils.Event<'activeChange'> {
	constructor(public station: ReaderBtStation | undefined) {
		super();
	}
}

export class ReaderBtRegistryStateChangeEvent extends utils.Event<'stateChange'> {
	constructor(public station: ReaderBtStation, public state: SiDeviceState) {
		super();
	}
}

// The card events are re-dispatched verbatim from the stations, so a consumer reads
// event.station to know which reader a card came from.
export type ReaderBtStationRegistryEvents = {
	add: ReaderBtRegistryAddEvent;
	remove: ReaderBtRegistryRemoveEvent;
	activeChange: ReaderBtRegistryActiveChangeEvent;
	stateChange: ReaderBtRegistryStateChangeEvent;
	siCardInserted: ReaderBtStationSiCardInsertedEvent;
	siCardRemoved: ReaderBtStationSiCardRemovedEvent;
	siCardObserved: ReaderBtStationSiCardObservedEvent;
};

// 'all' forwards every reader's card events, for a desk running several readers into
// one results database; 'activeOnly' forwards just the active reader's.
export type ReaderBtDispatchMode = 'all' | 'activeOnly';
