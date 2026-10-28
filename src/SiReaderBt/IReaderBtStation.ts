import * as utils from '../utils';
import type { BaseSiCard } from '../SiCard/BaseSiCard';

/** Mirrors ISiMainStation's event surface. Cards are typed BaseSiCard rather than
 * ISiCard, because ISiCard requires a decoded card memory image and a Reader BT never
 * exposes one. */
export interface IReaderBtStation extends utils.IEventTarget<ReaderBtStationEvents> {
	// so an aggregated event stream can tell which reader a card came from
	readonly ident: string;
}

export class ReaderBtStationSiCardInsertedEvent extends utils.Event<'siCardInserted'> {
	constructor(public station: IReaderBtStation, public siCard: BaseSiCard) {
		super();
	}
}

export class ReaderBtStationSiCardRemovedEvent extends utils.Event<'siCardRemoved'> {
	constructor(public station: IReaderBtStation, public siCard: BaseSiCard) {
		super();
	}
}

// dispatched when the reader pushes a readout nobody asked for, i.e. autoRead is on
export class ReaderBtStationSiCardObservedEvent extends utils.Event<'siCardObserved'> {
	constructor(public station: IReaderBtStation, public siCard: BaseSiCard) {
		super();
	}
}

export type ReaderBtStationEvents = {
	siCardInserted: ReaderBtStationSiCardInsertedEvent;
	siCardRemoved: ReaderBtStationSiCardRemovedEvent;
	siCardObserved: ReaderBtStationSiCardObservedEvent;
};

export type ReaderBtCleanUpFunction = () => Promise<void>;
