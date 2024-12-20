import type * as storage from '../../../storage';
import { type IModernSiCardStorageFields, modernSiCardStorageDefinition } from '../../../SiCard/types/ModernSiCard';
import { FakeModernSiCard } from './FakeModernSiCard';
import { SiCard11 } from '../../../SiCard/types/SiCard11';
import { getModernSiCardExamples } from '../../../SiCard/types/modernSiCardExamples';

export class FakeSiCard11 extends FakeModernSiCard {
	static siCardClass = SiCard11;
	static getAllExamples = getModernSiCardExamples;

	public storage: storage.ISiStorage<IModernSiCardStorageFields>;

	constructor(storageData: (number | undefined)[] | undefined) {
		super();
		this.storage = modernSiCardStorageDefinition(storageData);
	}
}
