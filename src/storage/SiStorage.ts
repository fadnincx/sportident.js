import _ from 'lodash';
import { List } from 'immutable';
import type { ISiFieldValue, ISiStorage, ISiStorageData, ISiStorageDefinition, ISiStorageLocations } from './interfaces';

export class SiStorage<T> implements ISiStorage<T> {
	private internalData: ISiStorageData;

	// eslint-disable-next-line no-useless-constructor
	constructor(public readonly size: number, public readonly locations: ISiStorageLocations<T>, initArg?: List<number | undefined> | Array<number | undefined>) {
		const initArrayOrList = (initArg === undefined ? _.range(size).map(() => undefined) : initArg) as List<number | undefined> | Array<number | undefined>;
		const initList = (initArrayOrList instanceof List ? initArrayOrList : List(initArrayOrList)) as List<number | undefined>;
		if (initList.size !== size) {
			throw new Error(`SiStorage constructor list "${initArg}" => "${initList}" ` + `must have size ${size} (but is ${initList.size})`);
		}
		this.internalData = initList;
	}

	get data(): ISiStorageData {
		return this.internalData;
	}

	get<U extends keyof T>(fieldName: U): ISiFieldValue<T[U]> | undefined {
		const fieldDefinition = this.locations[fieldName];
		return fieldDefinition.extractFromData(this.internalData);
	}

	set<U extends keyof T>(fieldName: U, newValue: ISiFieldValue<T[U]> | T[U]): void {
		const fieldDefinition = this.locations[fieldName];
		this.internalData = fieldDefinition.updateData(this.internalData, newValue);
	}

	splice(index: number, removeNum: number, ...values: number[]): void {
		const newData = this.internalData.splice(index, removeNum, ...values);
		if (newData.size !== this.internalData.size) {
			throw new Error('SiStorage.splice must preserve the size of the storage data ' + `(${this.internalData.size} -> ${newData.size})`);
		}
		this.internalData = newData;
	}
}

export const defineStorage =
	<T>(size: number, locations: ISiStorageLocations<T>): ISiStorageDefinition<T> =>
	(initArg?: List<number | undefined> | Array<number | undefined>): ISiStorage<T> =>
		new SiStorage<T>(size, locations, initArg);
