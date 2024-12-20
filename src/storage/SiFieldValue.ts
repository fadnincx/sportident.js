import { ValueToStringError, ValueFromStringError } from './interfaces';
import type { ISiFieldValue, ISiDataType } from './interfaces';

export class SiFieldValue<T> implements ISiFieldValue<T> {
	static fromString<U>(field: ISiDataType<U>, stringValue: string): SiFieldValue<U> | ValueFromStringError {
		const value = field.valueFromString(stringValue);
		if (value instanceof ValueFromStringError) {
			return value;
		}
		return new this(field, value);
	}

	// eslint-disable-next-line no-useless-constructor
	constructor(
		public field: ISiDataType<T>,
		public value: T // eslint-disable-next-line no-empty-function
	) {}

	toString(): string {
		const stringValue = this.field.valueToString(this.value);
		return stringValue instanceof ValueToStringError ? '' : stringValue;
	}
}
