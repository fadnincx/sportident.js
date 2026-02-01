import type * as storage from '../storage';
import type * as siProtocol from '../siProtocol';
import type * as utils from '../utils';
import type { IPunch, IRaceResultData } from './IRaceResultData';
import type { SiCardReadEvents } from './ISiCardEvents';

export interface ISiCard extends utils.IEventTarget<SiCardReadEvents> {
	cardNumber: number;
	storage: storage.ISiStorage<IBaseSiCardStorageFields>;
	read: () => Promise<ISiCard>;
	confirm: () => Promise<unknown>;
	toDict: () => IRaceResultData;
	toString: () => string;
	getMaxReadSteps: () => number;
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
