import * as utils from '../utils';
import type { BaseSiCard } from './BaseSiCard';

export type SiCardReadPhase = 'basic' | 'cardHolder' | 'punches' | 'battery';

export class SiCardReadStartEvent extends utils.Event<'readStart'> {
	constructor(public siCard: BaseSiCard, public totalSteps: number) {
		super();
	}
}

export class SiCardReadProgressEvent extends utils.Event<'readProgress'> {
	constructor(
		public siCard: BaseSiCard,
		public phase: SiCardReadPhase | undefined,
		public currentStep: number,
		public totalSteps: number,
		public percentage: number,
		public pageNumber?: number
	) {
		super();
	}

}

export class SiCardReadCompleteEvent extends utils.Event<'readComplete'> {
	constructor(public siCard: BaseSiCard) {
		super();
	}
}

export class SiCardReadErrorEvent extends utils.Event<'readError'> {
	constructor(public siCard: BaseSiCard, public error: Error) {
		super();
	}
}

export type SiCardReadEvents = {
	readStart: SiCardReadStartEvent;
	readProgress: SiCardReadProgressEvent;
	readComplete: SiCardReadCompleteEvent;
	readError: SiCardReadErrorEvent;
};
