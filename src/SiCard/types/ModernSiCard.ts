import { proto } from '../../constants';
import * as storage from '../../storage';
import * as utils from '../../utils';
import * as siProtocol from '../../siProtocol';
import type { IBaseSiCardStorageFields } from '../ISiCard';
import { BaseSiCard } from '../BaseSiCard';
import type { IPunch } from '../IRaceResultData';

const logger = utils.getLogger('ModernSiCard');

class ReadFinishedException {}
const punchesPerPage = 32;
const bytesPerPage = 128;

const MAX_NUM_PUNCHES = 128;

// SI3 byte values for card series - includes all card types
// Note: SiCard10, SiCard11, SIAC all share SI3=0x0F - distinguished by card number range
export const ModernSiCardSeries = {
	SiCard8: 0x02,
	SiCard9: 0x01,
	SiCard10: 0x0f,
	SiCard11: 0x0f,  // Same SI3 as SiCard10 - distinguished by card number range
	SIAC: 0x0f,      // Same SI3 as SiCard10 - distinguished by card number range
	PCard: 0x04,
	TCard: 0x06,
	FCard: 0x0e,
};

// Detect card series from SI bytes (uses card number ranges for SI3=0x0F)
export const getModernSiCardSeries = (
	si0: number,
	si1: number,
	si2: number,
	si3: number
): keyof typeof ModernSiCardSeries | undefined => {
	// Unique SI3 values - can determine series directly
	switch (si3) {
		case 0x01: return 'SiCard9';
		case 0x02: return 'SiCard8';
		case 0x04: return 'PCard';
		case 0x06: return 'TCard';
		case 0x0e: return 'FCard';
	}

	// SI3 = 0x0F: need to check card number range
	if (si3 === 0x0f) {
		const cardNumber = siProtocol.arr2cardNumber([si0, si1, si2]);
		if (cardNumber !== undefined) {
			if (cardNumber >= 7000000 && cardNumber < 8000000) return 'SiCard10';
			if (cardNumber >= 8000000 && cardNumber < 9000000) return 'SIAC';
			if (cardNumber >= 9000000 && cardNumber < 10000000) return 'SiCard11';
		}
		// Default for SI3=0x0F with unknown/out-of-range card number
		return 'SiCard10';
	}

	return undefined;
};

export interface PotentialModernSiCardPunch {
	code: number | undefined;
	time: siProtocol.SiTimestamp | undefined;
}

export const getPunchOffset = (i: number): number => bytesPerPage * 4 + i * 4;

export const cropPunches = (allPunches: (PotentialModernSiCardPunch | undefined)[]): IPunch[] => {
	const isPunchEntryValid = (punch: PotentialModernSiCardPunch | undefined): punch is IPunch => punch !== undefined && punch.code !== undefined && punch.time !== undefined && punch.time !== null;
	const firstInvalidIndex = allPunches.findIndex((punch) => !isPunchEntryValid(punch));
	const punchesUntilInvalid = firstInvalidIndex === -1 ? allPunches : allPunches.slice(0, firstInvalidIndex);
	return punchesUntilInvalid.filter<IPunch>(isPunchEntryValid);
};

export const getCroppedString = (charCodes: (number | undefined)[]): string => {
	const isCharacterInvalid = (charCode: number | undefined) => charCode === undefined || charCode === 0xee;
	const firstInvalidIndex = charCodes.findIndex(isCharacterInvalid);
	const croppedCharCodes = (firstInvalidIndex === -1 ? charCodes : charCodes.slice(0, firstInvalidIndex)) as number[];
	return croppedCharCodes.map((charCode: number) => storage.siStringToUtf8(charCode)).join('');
};

export const parseCardHolderString = (semicolonSeparatedString: string): { [property: string]: unknown } => {
	const informationComponents = semicolonSeparatedString.split(';');
	return {
		firstName: informationComponents.length > 1 ? informationComponents[0] : undefined,
		lastName: informationComponents.length > 2 ? informationComponents[1] : undefined,
		gender: informationComponents.length > 3 ? informationComponents[2] : undefined,
		birthday: informationComponents.length > 4 ? informationComponents[3] : undefined,
		club: informationComponents.length > 5 ? informationComponents[4] : undefined,
		email: informationComponents.length > 6 ? informationComponents[5] : undefined,
		phone: informationComponents.length > 7 ? informationComponents[6] : undefined,
		city: informationComponents.length > 8 ? informationComponents[7] : undefined,
		street: informationComponents.length > 9 ? informationComponents[8] : undefined,
		zip: informationComponents.length > 10 ? informationComponents[9] : undefined,
		country: informationComponents.length > 11 ? informationComponents[10] : undefined,
		isComplete: informationComponents.length > 11
	};
};

export const parseCardHolder = (maybeCharCodes: (number | undefined)[]): { [property: string]: unknown } => {
	const semicolonSeparatedString = getCroppedString(maybeCharCodes);
	return parseCardHolderString(semicolonSeparatedString || '');
};

export interface IModernSiCardStorageFields extends IBaseSiCardStorageFields {
	uid: number;
	cardSeries: keyof typeof ModernSiCardSeries;
}

// Shared storage location for cardSeries - reads SI bytes and computes the correct series
export const cardSeriesStorageLocation = new storage.SiModified(
	new storage.SiDict({
		si3: new storage.SiInt([[0x18]]),
		si0: new storage.SiInt([[0x1b]]),
		si1: new storage.SiInt([[0x1a]]),
		si2: new storage.SiInt([[0x19]]),
	}),
	(data) => {
		if (data.si0 === undefined || data.si1 === undefined ||
			data.si2 === undefined || data.si3 === undefined) {
			return undefined;
		}
		return getModernSiCardSeries(data.si0, data.si1, data.si2, data.si3);
	},
	undefined, // modifyForUpdate - not needed for read-only
	(value) => value // modifiedToString - enum value is already a string
);

export const modernSiCardStorageLocations: storage.ISiStorageLocations<IModernSiCardStorageFields> = {
	uid: new storage.SiInt([[0x03], [0x02], [0x01], [0x00]]),
	cardSeries: cardSeriesStorageLocation,
	cardNumber: new storage.SiModified(
		new storage.SiArray(3, (i) => new storage.SiInt([[0x19 + (2 - i)]])),
		(extractedValue) => siProtocol.arr2cardNumber(extractedValue)
		// (cardNumber) => siProtocol.cardNumber2arr(cardNumber),
		// (cardNumber) => `${cardNumber}`,
		// (cardNumberString) => parseInt(cardNumberString, 10),
		// (cardNumber) => cardNumber !== undefined && Number.isInteger(cardNumber) && cardNumber >= 0,
	),
	startTime: new siProtocol.SiTime([[0x0f], [0x0e], [0x0c]]),
	finishTime: new siProtocol.SiTime([[0x13], [0x12], [0x10]]),
	checkTime: new siProtocol.SiTime([[0x0b], [0x0a], [0x08]]),
	punchCount: new storage.SiInt([[0x16]]),
	punches: new storage.SiModified(
		new storage.SiArray(
			MAX_NUM_PUNCHES,
			(i) =>
				new storage.SiDict({
					code: new storage.SiInt([
						[(getPunchOffset(i) + 1)],
						[getPunchOffset(i) + 0, 7, 8],
					]),
					time: new siProtocol.SiTime([
						[getPunchOffset(i) + 3],
						[getPunchOffset(i) + 2],
						[getPunchOffset(i) + 0],
					])
				})
		),
		(allPunches) => cropPunches(allPunches)
	),
	cardHolder: new storage.SiModified(new storage.SiArray(0x80, (i) => new storage.SiInt([[0x20 + i]])), (charCodes) => parseCardHolder(charCodes))
};
export const modernSiCardStorageDefinition = storage.defineStorage(0x400, modernSiCardStorageLocations);

export class ModernSiCard extends BaseSiCard {
	static maxNumPunches = MAX_NUM_PUNCHES;

	static parseModernSiCardDetectionMessage(message: siProtocol.SiMessage): { cardNumber: number; cardSeries: keyof typeof ModernSiCardSeries } | undefined {
		if (message.mode !== undefined) {
			return undefined;
		}
		if (message.command !== proto.cmd.SI8_DET) {
			return undefined;
		}
		if (message.parameters.length < 6) {
			return undefined;
		}

		const si0 = message.parameters[5];
		const si1 = message.parameters[4];
		const si2 = message.parameters[3];
		const si3 = message.parameters[2];

		const cardNumber = siProtocol.arr2cardNumber([si0, si1, si2]);
		/* istanbul ignore next */
		if (cardNumber === undefined) {
			throw new Error('card number cannot be undefined');
		}

		const cardSeries = getModernSiCardSeries(si0, si1, si2, si3);
		if (cardSeries === undefined) {
			return undefined;
		}

		return { cardNumber, cardSeries };
	}

	public storage: storage.ISiStorage<IModernSiCardStorageFields>;

	public punchCount?: number;
	public cardSeries?: keyof typeof ModernSiCardSeries;

	constructor(cardNumber: number) {
		super(cardNumber);
		this.storage = modernSiCardStorageDefinition();
	}

	getMaxReadSteps(): number {
		return 6;
	}

	getEstimatedStepTimeMs(): number {
		return 700;
	}

	typeSpecificGetPage(pageNumber: number): Promise<number[]> {
		if (!this.mainStation) {
			return Promise.reject(new Error('No main station'));
		}
		return this.mainStation
			.sendMessage(
				{
					command: proto.cmd.GET_SI8,
					parameters: [pageNumber]
				},
				1
			)
			.then((data: number[][]) => {
				if (data[0][2] !== pageNumber) {
					logger.warn(`Page number assertion failed: ${data[0][2]} retrieved (expected ${pageNumber})`);
				}
				return data[0].slice(3);
			});
	}

	typeSpecificRead(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.typeSpecificReadBasic()
				.then(() => this.typeSpecificReadCardHolder())
				.then(() => this.typeSpecificReadPunches())
				.then(() => {
					this.raceResult = {
						cardNumber: this.storage.get('cardNumber')?.value || 0,
						startTime: this.storage.get('startTime')?.value,
						finishTime: this.storage.get('finishTime')?.value,
						checkTime: this.storage.get('checkTime')?.value,
						punches: this.storage.get('punches')?.value,
						cardHolder: this.storage.get('cardHolder')?.value
					};
					this.punchCount = this.storage.get('punchCount')?.value;
					this.cardSeries = this.storage.get('cardSeries')?.value;
					resolve();
				})
				.catch((exc: Error) => reject(exc));
		});
	}

	typeSpecificReadBasic(): Promise<void> {
		return this.typeSpecificGetPage(0).then((page0: number[]) => {
			this.storage.splice(bytesPerPage * 0, bytesPerPage, ...page0);
			this.emitProgress('basic', 0);

			const readCardNumber = this.storage.get('cardNumber')!.value;
			if (this.cardNumber !== readCardNumber) {
				logger.warn('Card number mismatch', { expected: this.cardNumber, actual: readCardNumber });
			}
		});
	}

	typeSpecificReadCardHolder(): Promise<void> {
		const cardHolderSoFar = this.storage.get('cardHolder')!.value;
		if (cardHolderSoFar && cardHolderSoFar.isComplete) {
			return Promise.resolve();
		}
		return this.typeSpecificGetPage(1).then((page1: number[]) => {
			this.storage.splice(bytesPerPage * 1, bytesPerPage, ...page1);
			this.emitProgress('cardHolder', 1);
		});
	}

	typeSpecificReadPunches(): Promise<void> {
		if (this.storage.get('punchCount')!.value <= punchesPerPage * 0) {
			return Promise.resolve();
		}
		return this.typeSpecificGetPage(4)
			.then((page4: number[]) => {
				this.storage.splice(bytesPerPage * 4, bytesPerPage, ...page4);
				this.emitProgress('punches', 4);
				if (this.storage.get('punchCount')!.value <= punchesPerPage * 1) {
					throw new ReadFinishedException();
				}
				return this.typeSpecificGetPage(5);
			})
			.then((page5: number[]) => {
				this.storage.splice(bytesPerPage * 5, bytesPerPage, ...page5);
				this.emitProgress('punches', 5);
				if (this.storage.get('punchCount')!.value <= punchesPerPage * 2) {
					throw new ReadFinishedException();
				}
				return this.typeSpecificGetPage(6);
			})
			.then((page6: number[]) => {
				this.storage.splice(bytesPerPage * 6, bytesPerPage, ...page6);
				this.emitProgress('punches', 6);
				if (this.storage.get('punchCount')!.value <= punchesPerPage * 3) {
					throw new ReadFinishedException();
				}
				return this.typeSpecificGetPage(7);
			})
			.then((page7: number[]) => {
				this.storage.splice(bytesPerPage * 7, bytesPerPage, ...page7);
				this.emitProgress('punches', 7);
				throw new ReadFinishedException();
			})
			.catch((exc: Error) => {
				if (exc instanceof ReadFinishedException) {
					return;
				}
				throw exc;
			});
	}
}
