import type * as storage from '../../../storage';
import { FakeModernSiCard } from './FakeModernSiCard';
import { type ITCardStorageFields, TCard, tCardStorageDefinition } from '../../../SiCard/types/TCard';
import { getTCardExamples } from '../../../SiCard/types/tCardExamples';

export class FakeTCard extends FakeModernSiCard {
	static siCardClass = TCard;
	static getAllExamples = getTCardExamples;

	public storage: storage.ISiStorage<ITCardStorageFields>;

	constructor(storageData: (number | undefined)[] | undefined) {
		super();
		this.storage = tCardStorageDefinition(storageData);
	}
}
