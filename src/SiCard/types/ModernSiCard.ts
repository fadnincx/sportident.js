import { proto } from '../../constants';
import * as storage from '../../storage';
import * as utils from '../../utils';
import * as siProtocol from '../../siProtocol';
import type { IBaseSiCardStorageFields } from '../ISiCard';
import { BaseSiCard } from '../BaseSiCard';
import type { IPunch } from '../IRaceResultData';

class ReadFinishedException {}
const punchesPerPage = 32;
const bytesPerPage = 128;

const MAX_NUM_PUNCHES = 128;

export const ModernSiCardSeries = {
	SiCard8: 0x02,
	SiCard9: 0x01,
	SiCard10: 0x0f,
	PCard: 0x04,
	TCard: 0x06
	// TODO: Find out these values
	// SiCard11: ?,
	// SIAC: ?,
	// FCard: ?,
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

export const modernSiCardStorageLocations: storage.ISiStorageLocations<IModernSiCardStorageFields> = {
	uid: new storage.SiInt([[0x03], [0x02], [0x01], [0x00]]),
	cardSeries: new storage.SiEnum([[0x18]], ModernSiCardSeries),
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
					code: new storage.SiInt([[getPunchOffset(i) + 1]]),
					time: new siProtocol.SiTime([[getPunchOffset(i) + 3], [getPunchOffset(i) + 2], [getPunchOffset(i) + 0]])
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
		const cardNumber = siProtocol.arr2cardNumber([message.parameters[5], message.parameters[4], message.parameters[3]]);
		/* istanbul ignore next */
		if (cardNumber === undefined) {
			throw new Error('card number cannot be undefined');
		}
		const cardSeries = message.parameters[2];
		const lookup = utils.getLookup(ModernSiCardSeries);
		return {
			cardNumber: cardNumber,
			cardSeries: lookup[cardSeries] as keyof typeof ModernSiCardSeries
		};
	}

	public storage: storage.ISiStorage<IModernSiCardStorageFields>;

	public punchCount?: number;
	public cardSeries?: keyof typeof ModernSiCardSeries;

	constructor(cardNumber: number) {
		super(cardNumber);
		this.storage = modernSiCardStorageDefinition();
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
				console.assert(data[0][2] === pageNumber, `Page number ${data[0][2]} retrieved (expected ${pageNumber})`);
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

			const readCardNumber = this.storage.get('cardNumber')!.value;
			if (this.cardNumber !== readCardNumber) {
				console.warn(`ModernSiCard Number ${readCardNumber} (expected ${this.cardNumber})`);
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
		});
	}

	typeSpecificReadPunches(): Promise<void> {
		if (this.storage.get('punchCount')!.value <= punchesPerPage * 0) {
			return Promise.resolve();
		}
		return this.typeSpecificGetPage(4)
			.then((page4: number[]) => {
				this.storage.splice(bytesPerPage * 4, bytesPerPage, ...page4);
				if (this.storage.get('punchCount')!.value <= punchesPerPage * 1) {
					throw new ReadFinishedException();
				}
				return this.typeSpecificGetPage(5);
			})
			.then((page5: number[]) => {
				this.storage.splice(bytesPerPage * 5, bytesPerPage, ...page5);
				if (this.storage.get('punchCount')!.value <= punchesPerPage * 2) {
					throw new ReadFinishedException();
				}
				return this.typeSpecificGetPage(6);
			})
			.then((page6: number[]) => {
				this.storage.splice(bytesPerPage * 6, bytesPerPage, ...page6);
				if (this.storage.get('punchCount')!.value <= punchesPerPage * 3) {
					throw new ReadFinishedException();
				}
				return this.typeSpecificGetPage(7);
			})
			.then((page7: number[]) => {
				this.storage.splice(bytesPerPage * 7, bytesPerPage, ...page7);
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
