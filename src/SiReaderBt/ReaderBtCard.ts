import * as utils from '../utils';
import type * as siProtocol from '../siProtocol';
import { BaseSiCard } from '../SiCard/BaseSiCard';
import type { IPunch, IRaceResultData } from '../SiCard/IRaceResultData';
import { ModernSiCardSeries } from '../SiCard/types/ModernSiCard';
import {
	ReaderBtCardFamily,
	ReaderBtFeedbackType,
	ReaderBtPunchType,
	SECONDS_PER_DAY,
	SIAC_CARD_NUMBER_MAX,
	SIAC_CARD_NUMBER_MIN
} from './readerBtConstants';
import type { ReaderBtCardReadout, ReaderBtPunch } from './readerBtProtocol';

const logger = utils.getLogger('ReaderBtCard');

// What a card needs from its station, like BaseSiCard's own minimal ISiMainStation.
export interface IReaderBtCardSource {
	requestCardReadout: (complete: boolean, onProgress?: (receivedBytes: number, totalBytes: number) => void) => Promise<ReaderBtCardReadout>;
	sendFeedback: (feedbackType: ReaderBtFeedbackType) => Promise<unknown>;
}

// Family 15 is SI3 = 0x0f, shared by SiCard10, SiCard11 and SIAC, so the card number
// decides. Matches getModernSiCardSeries in ModernSiCard.ts.
export const getCardSeriesFromReadout = (cardFamily: number, cardNumber: number): keyof typeof ModernSiCardSeries | undefined => {
	switch (cardFamily) {
		case ReaderBtCardFamily.SiCard9:
			return 'SiCard9';
		case ReaderBtCardFamily.SiCard8:
			return 'SiCard8';
		case ReaderBtCardFamily.PCard:
			return 'PCard';
		case ReaderBtCardFamily.Modern:
			if (cardNumber >= 7000000 && cardNumber < 8000000) {
				return 'SiCard10';
			}
			if (cardNumber >= SIAC_CARD_NUMBER_MIN && cardNumber < SIAC_CARD_NUMBER_MAX) {
				return 'SIAC';
			}
			if (cardNumber >= 9000000 && cardNumber < 10000000) {
				return 'SiCard11';
			}
			return 'SiCard10';
		default:
			logger.warn('Unknown Reader BT card family', { cardFamily: cardFamily });
			return undefined;
	}
};

const toPunch = (record: ReaderBtPunch): IPunch => ({
	code: record.controlCode,
	time: record.time,
	punchType: record.punchType,
	controlInfo: record.controlInfo,
	stationMode: record.stationMode,
	beaconMode: record.beaconMode,
	radioMode: record.radioMode
});

// Reserve punches always get their own fields, and additionally fill startTime or
// finishTime when the primary punch is missing.
export const readoutToRaceResult = (readout: ReaderBtCardReadout): IRaceResultData & { cardNumber: number } => {
	const raceResult: IRaceResultData & { cardNumber: number } = { cardNumber: readout.cardNumber, punches: [] };
	const punches: IPunch[] = [];

	readout.punches.forEach((record) => {
		switch (record.punchType) {
			case ReaderBtPunchType.Clear:
				raceResult.clearTime = raceResult.clearTime ?? record.time;
				break;
			case ReaderBtPunchType.Check:
				raceResult.checkTime = raceResult.checkTime ?? record.time;
				break;
			case ReaderBtPunchType.Start:
				raceResult.startTime = record.time;
				break;
			case ReaderBtPunchType.StartReserve:
				raceResult.startReserveTime = raceResult.startReserveTime ?? record.time;
				break;
			case ReaderBtPunchType.Finish:
				raceResult.finishTime = record.time;
				break;
			case ReaderBtPunchType.FinishReserve:
				raceResult.finishReserveTime = raceResult.finishReserveTime ?? record.time;
				break;
			case ReaderBtPunchType.Control:
				punches.push(toPunch(record));
				break;
			default:
				// kept on ReaderBtCard.records rather than dropped
				logger.warn('Unknown Reader BT punch type', { punchType: record.punchType, controlCode: record.controlCode });
				punches.push(toPunch(record));
		}
	});

	raceResult.punches = punches;
	if (raceResult.startTime === undefined && raceResult.startReserveTime !== undefined) {
		raceResult.startTime = raceResult.startReserveTime;
	}
	if (raceResult.finishTime === undefined && raceResult.finishReserveTime !== undefined) {
		raceResult.finishTime = raceResult.finishReserveTime;
	}
	if (readout.cardHolder !== undefined) {
		raceResult.cardHolder = readout.cardHolder;
	}
	if (readout.siac !== undefined) {
		raceResult.siac = {
			productionDate: readout.siac.productionDate,
			hardwareVersion: readout.siac.hardwareVersion,
			softwareVersion: readout.siac.softwareVersion,
			signalCount: readout.siac.signalCount,
			clearCount: readout.siac.clearCount,
			battery: {
				date: readout.siac.batteryDate,
				// already millivolts, the classic 1.9 + raw * 0.09 does not apply
				voltage: readout.siac.batteryMilliVolts / 1000
			}
		};
	}
	return raceResult;
};

// Folds the weekday into the time, giving seconds within the week.
const toWeekSeconds = (timestamp: siProtocol.SiTimestamp | undefined): siProtocol.SiTimestamp | undefined => {
	if (timestamp === undefined || timestamp === null) {
		return timestamp;
	}
	return {
		time: (timestamp.weekday ?? 0) * SECONDS_PER_DAY + timestamp.time,
		milliseconds: timestamp.milliseconds
	};
};

/** A card read through a Reader BT. There is no memory image to parse: the reader
 * returns decoded punch records, so storage stays empty and typeSpecificRead() is a
 * single BLE round trip. */
export class ReaderBtCard extends BaseSiCard {
	// Never detected from an SI serial message. Returning undefined, and never calling
	// registerNumberRange, keeps this out of the registry the serial path uses.
	static typeSpecificInstanceFromMessage(): ReaderBtCard | undefined {
		return undefined;
	}

	static fromReadout(readout: ReaderBtCardReadout): ReaderBtCard {
		const card = new ReaderBtCard(readout.cardNumber);
		card.applyReadout(readout);
		return card;
	}

	public source?: IReaderBtCardSource;
	public cardFamily?: number;
	public cardSeries?: keyof typeof ModernSiCardSeries;
	public records: ReaderBtPunch[] = []; // every record in order, special types included
	public deviceCodeNumber?: number; // code the reader carried when the card was seen
	public readMode: 'minimal' | 'complete' = 'complete'; // complete adds owner and SIAC data

	typeSpecificRead(): Promise<void> {
		if (this.source === undefined) {
			return Promise.reject(new Error('No Reader BT station for this card'));
		}
		return this.source
			.requestCardReadout(this.readMode === 'complete', (receivedBytes, totalBytes) => {
				// Only a segmented response reports bytes; anything smaller falls back to
				// the interpolating timer in BaseSiCard.
				if (totalBytes > 0) {
					this.emitExactProgress('punches', (receivedBytes / totalBytes) * 100);
				}
			})
			.then((readout) => {
				this.applyReadout(readout);
				this.emitProgress('punches');
			});
	}

	applyReadout(readout: ReaderBtCardReadout): void {
		this.records = readout.punches;
		this.cardFamily = readout.cardFamily;
		this.cardSeries = getCardSeriesFromReadout(readout.cardFamily, readout.cardNumber);
		this.raceResult = readoutToRaceResult(readout);
	}

	// The equivalent of an ACK is a short beep. Resolves with an empty response list
	// because nothing answers the feedback message; it just keeps BaseSiCard's signature.
	confirm(): Promise<number[][]> {
		if (this.source === undefined) {
			return Promise.reject(new Error('No Reader BT station for this card'));
		}
		return this.source.sendFeedback(ReaderBtFeedbackType.Ok).then(() => []);
	}

	// longer error feedback, for when the application rejects the card
	reportError(): Promise<unknown> {
		if (this.source === undefined) {
			return Promise.reject(new Error('No Reader BT station for this card'));
		}
		return this.source.sendFeedback(ReaderBtFeedbackType.Error);
	}

	getMaxReadSteps(): number {
		return 1;
	}

	// a segmented readout reports how many of its bytes have arrived
	protected expectsExactProgress(): boolean {
		return true;
	}

	// Measured on a Reader BT (sireader 2.2.0): a SIAC complete readout with 30 punches
	// took ~1130 ms, an SI-Card 9 one ~140 ms. Nearly all of it passes before the first
	// byte, so segment progress cannot help and this estimate drives the progress bar.
	getEstimatedStepTimeMs(): number {
		return this.cardNumber >= SIAC_CARD_NUMBER_MIN && this.cardNumber < SIAC_CARD_NUMBER_MAX ? 1200 : 300;
	}

	// The base implementation adds a 12-hour carry when a time goes backwards, which is
	// right for classic cards but wrong here: these times are already absolute within
	// the week, so folding the weekday into the seconds is monotonic and exact.
	getMonotonizedRaceResult(): IRaceResultData {
		const result = this.raceResult;
		return {
			...result,
			clearTime: toWeekSeconds(result.clearTime),
			checkTime: toWeekSeconds(result.checkTime),
			startTime: toWeekSeconds(result.startTime),
			finishTime: toWeekSeconds(result.finishTime),
			startReserveTime: toWeekSeconds(result.startReserveTime),
			finishReserveTime: toWeekSeconds(result.finishReserveTime),
			punches: result.punches?.map((punch) => ({ ...punch, time: toWeekSeconds(punch.time) ?? null }))
		};
	}
}
