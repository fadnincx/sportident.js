import { proto } from '../constants';
import * as utils from '../utils';
import type * as siProtocol from '../siProtocol';
import type * as storage from '../storage';
import type { IRaceResultData } from './IRaceResultData';
import { makeStartZeroTime, monotonizeRaceResult, prettyRaceResult } from './raceResultTools';
import {
	type SiCardReadEvents,
	type SiCardReadPhase,
	SiCardReadStartEvent,
	SiCardReadProgressEvent,
	SiCardReadCompleteEvent,
	SiCardReadErrorEvent
} from './ISiCardEvents';

const logger = utils.getLogger('BaseSiCard');

export type SiCardType<T extends BaseSiCard> = {
	new (cardNumber: number): T;
	typeSpecificInstanceFromMessage: (message: siProtocol.SiMessage) => T | undefined;
};
const initialRegistry: utils.NumberRangeRegistry<SiCardType<BaseSiCard>> = new utils.NumberRangeRegistry();

// fraction of the remaining distance covered per tick when following measurements
const EXACT_PROGRESS_EASING = 0.25;

export interface ISiMainStation {
	sendMessage: (message: siProtocol.SiMessage, numResponses?: number, timeoutInMiliseconds?: number) => Promise<number[][]>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class BaseSiCard {
	// abstract static maxNumPunches: number;
	static NumberRange: typeof utils.NumberRange = utils.NumberRange;
	static cardNumberRangeRegistry: utils.NumberRangeRegistry<SiCardType<BaseSiCard>> = initialRegistry;

	static resetNumberRangeRegistry(): void {
		this.cardNumberRangeRegistry = new utils.NumberRangeRegistry();
	}

	static registerNumberRange<T extends BaseSiCard>(firstCardNumberInRange: number, firstCardNumberAfterRange: number, siCardType: SiCardType<T>): void {
		const cardNumberRange = new utils.NumberRange(firstCardNumberInRange, firstCardNumberAfterRange);
		this.cardNumberRangeRegistry.register(cardNumberRange, siCardType);
	}

	static getTypeByCardNumber<T extends BaseSiCard>(cardNumber: number): SiCardType<T> | undefined {
		return this.cardNumberRangeRegistry.getValueForNumber(cardNumber) as SiCardType<T> | undefined;
	}

	// abstract static getPunchOffset(index: number): number;

	static fromCardNumber(cardNumber: number): BaseSiCard | undefined {
		const cardType = this.getTypeByCardNumber(cardNumber);
		if (!cardType) {
			return undefined;
		}
		return new cardType(cardNumber);
	}

	static detectFromMessage(message: siProtocol.SiMessage): BaseSiCard | undefined {
		const possibleCards = this.cardNumberRangeRegistry.values.map((cardType) => cardType.typeSpecificInstanceFromMessage(message)).filter((cardInstance) => cardInstance !== undefined);
		return possibleCards.get(0);
	}

	// abstract static typeSpecificInstanceFromMessage<Fields extends IBaseSiCardStorageFields>(
	//     _message: siProtocol.SiMessage,
	// ): BaseSiCard<Fields>|undefined;

	public mainStation?: ISiMainStation | undefined;
	public raceResult: IRaceResultData & { cardNumber: number };
	public storage: storage.ISiStorage<unknown> = {} as storage.ISiStorage<unknown>;
	private readStep = 0;
	private stepStartTime = 0;
	private progressTimer?: ReturnType<typeof setInterval>;
	private lastEmittedPercentage = 0;
	private currentPhase?: SiCardReadPhase;
	// last real measurement of the current step, as a percentage of that step
	private exactStepPercentage?: number;

	constructor(cardNumber: number) {
		this.raceResult = { cardNumber: cardNumber };
	}

	get cardNumber(): number {
		return this.raceResult.cardNumber;
	}

	getMaxReadSteps(): number {
		return 1;
	}

	getEstimatedStepTimeMs(): number {
		return 2000;
	}

	read(): Promise<BaseSiCard> {
		this.readStep = 0;
		this.lastEmittedPercentage = 0;
		this.stepStartTime = Date.now();
		this.currentPhase = undefined;
		this.exactStepPercentage = undefined;
		const totalSteps = this.getMaxReadSteps();

		this.dispatchEvent('readStart', new SiCardReadStartEvent(this, totalSteps));
		this.startProgressTimer();

		return this.typeSpecificRead()
			.then(() => {
				this.stopProgressTimer();
				this.dispatchEvent('readComplete', new SiCardReadCompleteEvent(this));
				return this;
			})
			.catch((error: Error) => {
				this.stopProgressTimer();
				this.dispatchEvent('readError', new SiCardReadErrorEvent(this, error));
				throw error;
			});
	}

	private startProgressTimer(): void {
		this.progressTimer = setInterval(() => this.emitInterpolatedProgress(), 30);
	}

	private stopProgressTimer(): void {
		if (this.progressTimer) {
			clearInterval(this.progressTimer);
			this.progressTimer = undefined;
		}
	}

	private emitInterpolatedProgress(): void {
		const totalSteps = this.getMaxReadSteps();
		if (totalSteps === 0) return;

		const stepSize = 100 / totalSteps;
		const basePercent = this.readStep * stepSize;
		const maxPercent = basePercent + stepSize - 1;

		const pct = this.expectsExactProgress()
			? this.getSmoothedProgress(basePercent, stepSize, maxPercent)
			: this.getClockProgress(basePercent, stepSize, maxPercent);

		if (pct > this.lastEmittedPercentage) {
			this.lastEmittedPercentage = pct;
			this.dispatchEvent('readProgress', new SiCardReadProgressEvent(
				this,
				this.currentPhase,
				this.readStep,
				totalSteps,
				pct,
				undefined
			));
		}
	}

	// The clock-only estimate, used when no real measurement is expected.
	private getClockProgress(basePercent: number, stepSize: number, maxPercent: number): number {
		const elapsed = Date.now() - this.stepStartTime;
		const progressInStep = Math.min(elapsed / this.getEstimatedStepTimeMs(), 1);
		const interpolated = Math.round(basePercent + progressInStep * (stepSize - 1));
		return Math.min(interpolated, maxPercent);
	}

	// Blends the clock estimate with real measurements. The guess decays asymptotically
	// instead of ramping to the ceiling, so it never saturates while a slow transfer is
	// still running, and the emitted value eases toward the target so a measurement
	// arriving once per segment glides rather than steps.
	private getSmoothedProgress(basePercent: number, stepSize: number, maxPercent: number): number {
		const elapsed = Date.now() - this.stepStartTime;
		const guessed = basePercent + (1 - Math.exp(-elapsed / this.getEstimatedStepTimeMs())) * (stepSize - 1);
		const measured = this.exactStepPercentage === undefined ? 0 : basePercent + (this.exactStepPercentage / 100) * (stepSize - 1);
		const target = Math.min(Math.max(guessed, measured), maxPercent);
		if (target <= this.lastEmittedPercentage) {
			return this.lastEmittedPercentage;
		}
		const eased = this.lastEmittedPercentage + Math.max(1, (target - this.lastEmittedPercentage) * EXACT_PROGRESS_EASING);
		return Math.min(Math.round(eased), Math.round(target));
	}

	// True when the transport can report real transfer progress, which switches the
	// timer to getSmoothedProgress. False keeps the original clock-only behaviour.
	protected expectsExactProgress(): boolean {
		return false;
	}

	// Records how far the current step has got, as a percentage of that step. Does not
	// dispatch: the timer stays the only emitter, so the line keeps its own cadence and
	// a measurement behind the clock guess reins it in instead of being discarded.
	protected emitExactProgress(phase: SiCardReadPhase, percentage: number): void {
		const pct = Math.max(0, Math.min(100, percentage));
		this.exactStepPercentage = Math.max(this.exactStepPercentage ?? 0, pct);
		this.currentPhase = phase;
	}

	protected emitProgress(phase: SiCardReadPhase, pageNumber?: number): void {
		const actualMs = Date.now() - this.stepStartTime;
		const estimatedMs = this.getEstimatedStepTimeMs();
		logger.info('Step timing', {
			cardType: this.constructor.name,
			step: this.readStep + 1,
			phase,
			actualMs,
			estimatedMs,
			diff: actualMs - estimatedMs
		});

		this.readStep++;
		this.stepStartTime = Date.now();
		this.currentPhase = phase;
		// measurements are relative to a step
		this.exactStepPercentage = undefined;

		const totalSteps = this.getMaxReadSteps();
		const pct = Math.round((this.readStep / totalSteps) * 100);
		this.lastEmittedPercentage = pct;

		this.dispatchEvent('readProgress', new SiCardReadProgressEvent(
			this,
			phase,
			this.readStep,
			totalSteps,
			pct,
			pageNumber
		));
	}

	getNormalizedRaceResult(): IRaceResultData {
		return makeStartZeroTime(this.getMonotonizedRaceResult());
	}

	getMonotonizedRaceResult(): IRaceResultData {
		return monotonizeRaceResult(this.raceResult);
	}

	abstract typeSpecificRead(): Promise<void>;

	confirm(): Promise<number[][]> {
		if (!this.mainStation) {
			return Promise.reject(new Error('No main station'));
		}
		return this.mainStation.sendMessage(
			{
				mode: proto.ACK
			},
			0
		);
	}

	toDict(): IRaceResultData {
		return this.raceResult;
	}

	toString(): string {
		return `${this.constructor.name}\n${prettyRaceResult(this.raceResult)}`;
	}
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface BaseSiCard extends utils.EventTarget<SiCardReadEvents> {}
utils.applyMixins(BaseSiCard, [utils.EventTarget]);
