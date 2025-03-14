import type * as storage from '../../../storage';
import { FakeModernSiCard } from './FakeModernSiCard';
import { type ISiCard9StorageFields, SiCard9, siCard9StorageDefinition } from '../../../SiCard/types/SiCard9';
import { getSiCard9Examples } from '../../../SiCard/types/siCard9Examples';

export class FakeSiCard9 extends FakeModernSiCard {
	static siCardClass = SiCard9;
	static getAllExamples = getSiCard9Examples;

	public storage: storage.ISiStorage<ISiCard9StorageFields>;

	constructor(storageData: (number | undefined)[] | undefined) {
		super();
		this.storage = siCard9StorageDefinition(storageData);
	}
}
