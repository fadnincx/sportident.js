import * as storage from '../../storage';
import * as siProtocol from '../../siProtocol';
import * as utils from '../../utils';
import { cropPunches, getCroppedString, ModernSiCard, ModernSiCardSeries, cardSeriesStorageLocation } from './ModernSiCard';
import type { IBaseSiCardStorageFields } from '../ISiCard';
import { BaseSiCard } from '../BaseSiCard';

const logger = utils.getLogger('TCard');

class ReadFinishedException {}
const bytesPerPage = 128;

// TCard has 25 punches max: 9 in block 0 (offset 0x38, 8-byte stride) + 16 in block 1 (offset 0x00, 8-byte stride)
const MAX_NUM_PUNCHES = 25;
const PUNCHES_IN_BLOCK0 = 9;

// Block 0 punches start at 0x38 with 4-byte stride (9 punches fit in 0x38-0x5B)
// Block 1 punches start at 0x80 (page 1 offset) with 4-byte stride
export const getPunchOffset = (i: number): number => {
	if (i < PUNCHES_IN_BLOCK0) {
		return 0x38 + i * 4;
	}
	return bytesPerPage + (i - PUNCHES_IN_BLOCK0) * 4;
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
	startTime: new siProtocol.SiTime([[0x0F], [0x0E], [0x0C]]),
	finishTime: new siProtocol.SiTime([[0x13], [0x12], [0x10]]),
	checkTime: new siProtocol.SiTime([[0x0B], [0x0A], [0x08]]),
	punchCount: new storage.SiInt([[0x16]]),
	punches: new storage.SiModified(
		new storage.SiArray(
			MAX_NUM_PUNCHES,
			(i) => new storage.SiDict({
				code: new storage.SiInt([
					[getPunchOffset(i) + 1],
					[getPunchOffset(i) + 0, 7, 8],
				]),
				time: new siProtocol.SiTime([
					[getPunchOffset(i) + 3],
					[getPunchOffset(i) + 2],
					[getPunchOffset(i) + 0],
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
