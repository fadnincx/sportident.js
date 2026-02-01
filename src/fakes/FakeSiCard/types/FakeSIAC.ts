import type * as storage from '../../../storage';
import { type ISIACStorageFields, siacStorageDefinition } from '../../../SiCard/types/SIAC';
import { FakeModernSiCard } from './FakeModernSiCard';
import { SIAC } from '../../../SiCard/types/SIAC';
import { getModernSiCardExamples } from '../../../SiCard/types/modernSiCardExamples';

export class FakeSIAC extends FakeModernSiCard {
	static siCardClass = SIAC;
	static getAllExamples = getModernSiCardExamples;

	public storage: storage.ISiStorage<ISIACStorageFields>;

	constructor(storageData: (number | undefined)[] | undefined) {
		super();
		this.storage = siacStorageDefinition(storageData);
	}
}
