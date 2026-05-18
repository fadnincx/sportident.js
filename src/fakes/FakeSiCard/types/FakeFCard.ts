import type * as storage from '../../../storage';
import { FakeModernSiCard } from './FakeModernSiCard';
import { type IFCardStorageFields, FCard, fCardStorageDefinition } from '../../../SiCard/types/FCard';
import { getFCardExamples } from '../../../SiCard/types/fCardExamples';

export class FakeFCard extends FakeModernSiCard {
	static siCardClass = FCard;
	static getAllExamples = getFCardExamples;

	public storage: storage.ISiStorage<IFCardStorageFields>;

	constructor(storageData: (number | undefined)[] | undefined) {
		super();
		this.storage = fCardStorageDefinition(storageData);
	}
}
