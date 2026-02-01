import * as storage from '../../storage';
import * as siProtocol from '../../siProtocol';
import { proto } from '../../constants';
import type { IBaseSiCardStorageFields } from '../ISiCard';
import { BaseSiCard } from '../BaseSiCard';
import type { IPunch } from '../IRaceResultData';
import * as utils from '../../utils';

const logger = utils.getLogger('SiCard5');

const bytesPerPage = 128;
const MAX_NUM_PUNCHES = 36;

interface PotentialSiCard5Punch {
	code: number | undefined;
	time: siProtocol.SiTimestamp | undefined;
}

export const getPunchOffset = (i: number): number => (i >= 30 ? 0x20 + (i - 30) * 16 : 0x20 + Math.floor(i / 5) + 1 + i * 3);

export const cropPunches = (allPunches: (PotentialSiCard5Punch | undefined)[]): IPunch[] => {
	const isPunchEntryValid = (punch: PotentialSiCard5Punch | undefined): punch is IPunch => punch !== undefined && punch.code !== undefined && punch.code !== 0x00;
	const firstInvalidIndex = allPunches.findIndex((punch) => !isPunchEntryValid(punch));
	const punchesUntilInvalid = firstInvalidIndex === -1 ? allPunches : allPunches.slice(0, firstInvalidIndex);
	return punchesUntilInvalid.filter<IPunch>(isPunchEntryValid);
};

export interface ISiCard5StorageFields extends IBaseSiCardStorageFields {
	softwareVersion: number;
	cardHolder: {
		countryCode: number | undefined;
		clubCode: number | undefined;
	};
}

export const siCard5StorageLocations: storage.ISiStorageLocations<ISiCard5StorageFields> = {
	cardNumber: new storage.SiModified(
		new storage.SiArray(3, (i) => new storage.SiInt([[[0x05, 0x04, 0x06][i]]])),
		(extractedValue) => siProtocol.arr2cardNumber(extractedValue)
		// (cardNumber) => siProtocol.cardNumber2arr(cardNumber),
		// (cardNumber) => `${cardNumber}`,
		// (cardNumberString) => parseInt(cardNumberString, 10),
		// (cardNumber) => cardNumber !== undefined && Number.isInteger(cardNumber) && cardNumber >= 0,
	),
	startTime: new siProtocol.SiTime([[0x14], [0x13]]),
	finishTime: new siProtocol.SiTime([[0x16], [0x15]]),
	checkTime: new siProtocol.SiTime([[0x1a], [0x19]]),
	punchCount: new storage.SiModified(new storage.SiInt([[0x17]]), (extractedValue) => extractedValue - 1),
	punches: new storage.SiModified(
		new storage.SiArray(
			MAX_NUM_PUNCHES,
			(i) =>
				new storage.SiDict({
					code: new storage.SiInt([[getPunchOffset(i) + 0]]),
					time: new siProtocol.SiTime(i >= 30 ? undefined : [[getPunchOffset(i) + 2], [getPunchOffset(i) + 1]])
				})
		),
		(allPunches) => cropPunches(allPunches)
	),
	cardHolder: new storage.SiDict({
		countryCode: new storage.SiInt([[0x01]]),
		clubCode: new storage.SiInt([[0x03], [0x02]])
	}),
	softwareVersion: new storage.SiInt([[0x1b]])
};
export const siCard5StorageDefinition = storage.defineStorage(0x80, siCard5StorageLocations);

export class SiCard5 extends BaseSiCard {
	static maxNumPunches = MAX_NUM_PUNCHES;

	static typeSpecificInstanceFromMessage(message: siProtocol.SiMessage): SiCard5 | undefined {
		if (message.mode !== undefined) {
			return undefined;
		}
		if (message.command !== proto.cmd.SI5_DET) {
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
		return new this(cardNumber);
	}

	public storage: storage.ISiStorage<ISiCard5StorageFields>;

	public punchCount?: number;
	public softwareVersion?: number;

	constructor(cardNumber: number) {
		super(cardNumber);
		this.storage = siCard5StorageDefinition();
	}

	getMaxReadSteps(): number {
		return 1;
	}

	getEstimatedStepTimeMs(): number {
		return 1500;
	}

	typeSpecificRead(): Promise<void> {
		if (!this.mainStation) {
			return Promise.reject(new Error('No main station'));
		}
		return this.mainStation
			.sendMessage(
				{
					command: proto.cmd.GET_SI5,
					parameters: []
				},
				1
			)
			.then((data: number[][]) => {
				this.storage.splice(bytesPerPage * 0, bytesPerPage, ...data[0].slice(2));
				this.emitProgress('basic', 0);

				const readCardNumber = this.storage.get('cardNumber')!.value;
				if (this.cardNumber !== readCardNumber) {
					logger.warn(`Card number mismatch`, { expected: this.cardNumber, actual: readCardNumber });
				}
				this.raceResult = {
					cardNumber: this.storage.get('cardNumber')!.value,
					startTime: this.storage.get('startTime')?.value,
					finishTime: this.storage.get('finishTime')?.value,
					checkTime: this.storage.get('checkTime')?.value,
					punches: this.storage.get('punches')!.value,
					cardHolder: this.storage.get('cardHolder')!.value
				};
				this.punchCount = this.storage.get('punchCount')!.value;
				this.softwareVersion = this.storage.get('softwareVersion')!.value;
			});
	}
}

// According to SI docs, the following ranges are possible 1 - 65000, 200001 - 265000, 300001-365000, 400001-465000
//  Cardnr | SI 2   | SI1| SI0|
// --------|--------|----|----|
//       1 | 0 or 1 | 00 | 01 |
//   65000 | 0 or 1 | FD | E8 |
//  200001 |      2 | 00 | 01 |
//  265000 |      2 | FD | E8 |
//  300001 |      3 | 00 | 01 |
//  365000 |      3 | FD | E8 |
//  400001 |      4 | 00 | 01 |
//  465000 |      4 | FD | E8 |

BaseSiCard.registerNumberRange(1000, 500000, SiCard5);
