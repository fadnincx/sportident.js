import * as storage from '../../storage';
import * as siProtocol from '../../siProtocol';
import * as utils from '../../utils';
import { getCroppedString, ModernSiCard, ModernSiCardSeries, cardSeriesStorageLocation } from './ModernSiCard';
import type { IBaseSiCardStorageFields } from '../ISiCard';
import { BaseSiCard } from '../BaseSiCard';
import type { IPunch } from '../IRaceResultData';

const logger = utils.getLogger('TCard');

class ReadFinishedException {}
const bytesPerPage = 128;

// TCard has 25 punches max: 9 in block 0 (offset 0x38, 8-byte stride) + 16 in block 1 (offset 0x00, 8-byte stride)
const MAX_NUM_PUNCHES = 25;
const PUNCHES_IN_BLOCK0 = 9;

// TCard control punch format (8 bytes per punch, different from HTAG 4-byte format):
//   byte[0] = Code number (8-bit, 0-255)
//   byte[1] = Station serial high
//   byte[2] = Station serial mid
//   byte[3] = Station serial low 2 bits (7-6) | Year 4 bits (5-2) | Month high 2 bits (1-0)
//   byte[4] = Month low 2 bits (7-6) | Day 5 bits (5-1) | AM/PM flag (bit 0)
//   byte[5] = Time high byte (TH)
//   byte[6] = Time low byte (TL)
//   byte[7] = Subsecond (1/256 s)

export const getPunchOffset = (i: number): number => {
	if (i < PUNCHES_IN_BLOCK0) {
		return 0x38 + i * 8;
	}
	return bytesPerPage + (i - PUNCHES_IN_BLOCK0) * 8;
};

interface PotentialTCardPunch {
	code: number | undefined;
	time: siProtocol.SiTimestamp | undefined;
}

const cropPunches = (allPunches: (PotentialTCardPunch | undefined)[]): IPunch[] => {
	const isPunchEntryValid = (punch: PotentialTCardPunch | undefined): punch is IPunch =>
		punch !== undefined && punch.code !== undefined && punch.code !== 0x00 && punch.time !== undefined && punch.time !== null;
	const firstInvalidIndex = allPunches.findIndex((punch) => !isPunchEntryValid(punch));
	const punchesUntilInvalid = firstInvalidIndex === -1 ? allPunches : allPunches.slice(0, firstInvalidIndex);
	return punchesUntilInvalid.filter<IPunch>(isPunchEntryValid);
};

const parseCardHolderString = (
	semicolonSeparatedString: string,
): { [property: string]: unknown } => {
	const informationComponents = semicolonSeparatedString.split(';');
	return {
		firstName: informationComponents.length > 1 ? informationComponents[0] : undefined,
		lastName: informationComponents.length > 2 ? informationComponents[1] : undefined,
		isComplete: informationComponents.length > 2,
	};
};

const parseCardHolder = (maybeCharCodes: (number | undefined)[]) => {
	const semicolonSeparatedString = getCroppedString(maybeCharCodes);
	return parseCardHolderString(semicolonSeparatedString || '');
};

export interface ITCardStorageFields extends IBaseSiCardStorageFields {
	uid: number;
	cardSeries: keyof typeof ModernSiCardSeries;
}

export const tCardStorageLocations: storage.ISiStorageLocations<ITCardStorageFields> = {
	uid: new storage.SiInt([[0x03], [0x02], [0x01], [0x00]]),
	cardSeries: cardSeriesStorageLocation,
	cardNumber: new storage.SiModified(
		new storage.SiArray(
			3,
			(i) => new storage.SiInt([[0x19 + (2 - i)]]),
		),
		(extractedValue) => siProtocol.arr2cardNumber(extractedValue),
	),
	// Start/finish/check times use standard 4-byte HTAG format [PTD, CN, TH, TL]
	startTime: new siProtocol.SiTime([[0x0F], [0x0E], [0x0C]]),
	finishTime: new siProtocol.SiTime([[0x13], [0x12], [0x10]]),
	checkTime: new siProtocol.SiTime([[0x0B], [0x0A], [0x08]]),
	punchCount: new storage.SiInt([[0x16]]),
	// TCard control punches use 8-byte format (NOT the standard 4-byte HTAG format):
	//   offset+0 = code number (8-bit)
	//   offset+4 = AM/PM at bit 0
	//   offset+5 = time high, offset+6 = time low
	punches: new storage.SiModified(
		new storage.SiArray(
			MAX_NUM_PUNCHES,
			(i) => new storage.SiDict({
				code: new storage.SiInt([
					[getPunchOffset(i) + 0],
				]),
				time: new siProtocol.SiTime([
					[getPunchOffset(i) + 6],
					[getPunchOffset(i) + 5],
					[getPunchOffset(i) + 4],
				]),
			}),
		),
		(allPunches) => cropPunches(allPunches),
	),
	cardHolder: new storage.SiModified(
		new storage.SiArray(
			0x18,
			(i) => new storage.SiInt([[0x20 + i]]),
		),
		(charCodes) => parseCardHolder(charCodes),
	),
};
export const tCardStorageDefinition = storage.defineStorage(
	0x100,
	tCardStorageLocations,
);

export class TCard extends ModernSiCard {
	static maxNumPunches = MAX_NUM_PUNCHES;

	static typeSpecificInstanceFromMessage(message: siProtocol.SiMessage) {
		const info = this.parseModernSiCardDetectionMessage(message);
		if (info === undefined) {
			return undefined;
		}
		if (info.cardSeries !== 'TCard') {
			return undefined;
		}
		return new this(info.cardNumber);
	}

	public storage: storage.ISiStorage<ITCardStorageFields>;

	public uid?: number;

	constructor(cardNumber: number) {
		super(cardNumber);
		this.storage = tCardStorageDefinition();
	}

	getMaxReadSteps(): number {
		const punchCount = this.storage.get('punchCount')?.value;
		if (punchCount !== undefined) {
			if (punchCount <= 0) return 1;
			if (punchCount <= PUNCHES_IN_BLOCK0) return 1;
			return 2;
		}
		return 2;
	}

	getEstimatedStepTimeMs(): number {
		return 800;
	}

	typeSpecificRead(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.typeSpecificGetPage(0)
				.then((page0: number[]) => {
					this.storage.splice(bytesPerPage * 0, bytesPerPage, ...page0);
					this.emitProgress('basic', 0);

					const readCardNumber = this.storage.get('cardNumber')!.value;
					if (this.cardNumber !== readCardNumber) {
						logger.warn('Card number mismatch', { expected: this.cardNumber, actual: readCardNumber });
					}

					const punchCount = this.storage.get('punchCount')!.value;
					if (punchCount <= PUNCHES_IN_BLOCK0) {
						throw new ReadFinishedException();
					}
					return this.typeSpecificGetPage(1);
				})
				.then((page1: number[]) => {
					this.storage.splice(bytesPerPage * 1, bytesPerPage, ...page1);
					this.emitProgress('punches', 1);
					throw new ReadFinishedException();
				})
				.catch((exc: Error) => {
					if (exc instanceof ReadFinishedException) {
						this.raceResult = {
							cardNumber: this.storage.get('cardNumber')!.value,
							startTime: this.storage.get('startTime')?.value,
							finishTime: this.storage.get('finishTime')?.value,
							checkTime: this.storage.get('checkTime')?.value,
							punches: this.storage.get('punches')!.value,
							cardHolder: this.storage.get('cardHolder')!.value,
						};
						this.punchCount = this.storage.get('punchCount')!.value;
						this.cardSeries = this.storage.get('cardSeries')?.value;
						this.uid = this.storage.get('uid')!.value;
						resolve();
					} else {
						reject(exc);
					}
				});
		});
	}
}
BaseSiCard.registerNumberRange(6000000, 7000000, TCard);
