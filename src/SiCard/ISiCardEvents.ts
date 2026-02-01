import * as utils from '../utils';
import type { BaseSiCard } from './BaseSiCard';

export type SiCardReadPhase = 'basic' | 'cardHolder' | 'punches';

export class SiCardReadStartEvent extends utils.Event<'readStart'> {
	constructor(public siCard: BaseSiCard, public totalSteps: number) {
		super();
	}
}

export class SiCardReadProgressEvent extends utils.Event<'readProgress'> {
	constructor(
		public siCard: BaseSiCard,
		public phase: SiCardReadPhase,
		public currentStep: number,
		public totalSteps: number,
		public pageNumber?: number
	) {
		super();
	}

	get progress(): number {
		return this.currentStep / this.totalSteps;
	}

	get percentage(): number {
		return Math.round(this.progress * 100);
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
