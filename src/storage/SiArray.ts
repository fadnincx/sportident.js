import { type ISiDataType, type ISiStorageData, ValueFromStringError } from './interfaces';
import { SiDataType } from './SiDataType';

export type SiArrayValue<T> = (T | undefined)[];

export class SiArray<T> extends SiDataType<SiArrayValue<T>> implements ISiDataType<SiArrayValue<T>> {
	constructor(public length: number, public getDefinitionAtIndex: (index: number) => ISiDataType<T>) {
		super();
	}

	typeSpecificIsValueValid(_value: SiArrayValue<T>): boolean {
		return true;
	}

	typeSpecificValueToString(value: SiArrayValue<T>): string {
		return value
			.map((itemValue, index) => {
				if (itemValue === undefined) {
					return '?';
				}
				const definition = this.getDefinitionAtIndex(index);
				return definition.valueToString(itemValue);
			})
			.join(', ');
	}

	typeSpecificValueFromString(_string: string): ValueFromStringError {
		return new ValueFromStringError(`${this.constructor.name} does not support string parsing`);
	}

	typeSpecificExtractFromData(data: ISiStorageData): SiArrayValue<T> | undefined {
		const arrayValue = Array.from({length: this.length}, (_, i) => i).map((index) => {
			const definition = this.getDefinitionAtIndex(index);
			const itemFieldValue = definition.extractFromData(data);
			if (itemFieldValue === undefined) {
				return undefined;
			}
			return itemFieldValue.value;
		});
		return arrayValue;
	}

	typeSpecificUpdateData(data: ISiStorageData, newValue: SiArrayValue<T>): ISiStorageData {
		const updateLength = Math.min(newValue.length, this.length);
		let tempData = data;
		Array.from({length: updateLength}, (_, i) => i).forEach((index) => {
			const definition = this.getDefinitionAtIndex(index);
			const newItemValue = newValue[index];
			if (newItemValue !== undefined) {
				tempData = definition.updateData(tempData, newItemValue);
			}
		});
		return tempData;
	}
}
