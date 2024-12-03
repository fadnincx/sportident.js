import type * as storage from '../storage';
import type * as siProtocol from '../siProtocol';
import type { IPunch, IRaceResultData } from './IRaceResultData';

export interface ISiCard {
	cardNumber: number;
	storage: storage.ISiStorage<IBaseSiCardStorageFields>;
	read: () => Promise<ISiCard>;
	confirm: () => Promise<unknown>;
	toDict: () => IRaceResultData;
	toString: () => string;
}

export interface IBaseSiCardStorageFields {
	cardNumber: number;
	clearTime?: siProtocol.SiTimestamp;
	checkTime: siProtocol.SiTimestamp;
	startTime: siProtocol.SiTimestamp;
	finishTime: siProtocol.SiTimestamp;
	punchCount: number;
	punches: IPunch[];
	cardHolder: { [key: string]: unknown };
}
