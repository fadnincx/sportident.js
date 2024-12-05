import { describe, expect, test } from '@jest/globals';
import _ from 'lodash';
import { List } from 'immutable';
import { type ISiStorageData, ValueToStringError, ValueFromStringError } from './interfaces';
import { ModifyUndefinedException, SiDataType } from './SiDataType';
import { SiFieldValue } from './SiFieldValue';
import { SiModified } from './SiModified';

type FakeSiStorageData = (number | undefined)[];

describe('SiModified', () => {
	class FakeDataType extends SiDataType<string> {
		constructor(public index: number) {
			super();
		}

		typeSpecificIsValueValid(_value: string) {
			return true;
		}

		typeSpecificValueFromString(str: string): string | ValueFromStringError | never {
			return str.substr(2, str.length - 2);
		}

		typeSpecificValueToString(value: string): string {
			return `->${value}<-`;
		}

		typeSpecificExtractFromData(data: ISiStorageData): string | undefined {
			const byte = data.get(this.index);
			if (byte === undefined) {
				return undefined;
			}
			return String.fromCharCode(byte);
		}

		typeSpecificUpdateData(data: ISiStorageData, newValue: string): ISiStorageData {
			const byte = data.get(this.index);
			if (byte === undefined) {
				throw new ModifyUndefinedException();
			}
			return data.set(this.index, newValue.charCodeAt(0) & 0xff);
		}
	}

	const mySiModified = new SiModified(
		new FakeDataType(1),
		(char: string) => char.charCodeAt(0),
		(charCode: number) => (charCode < 32 ? undefined : String.fromCharCode(charCode)),
		(charCode: number) => charCode.toString(16),
		(hexString: string) => {
			const num = parseInt(hexString, 16);
			return Number.isNaN(num) ? new ValueFromStringError('NaN') : num;
		},
		(charCode: number) => _.isInteger(charCode) && charCode >= 0
	);
	const fieldValueOf = (modifiedValue: number) => new SiFieldValue(mySiModified, modifiedValue);
	test('typeSpecificIsValueValid', () => {
		expect(mySiModified.typeSpecificIsValueValid(0)).toBe(true);
		expect(mySiModified.typeSpecificIsValueValid(1)).toBe(true);
		expect(mySiModified.typeSpecificIsValueValid(0xff)).toBe(true);
		expect(mySiModified.typeSpecificIsValueValid(-1)).toBe(false);
		expect(mySiModified.typeSpecificIsValueValid(1.5)).toBe(false);
		expect(mySiModified.typeSpecificIsValueValid(-7.5)).toBe(false);
	});
	test('valueToString', () => {
		expect(mySiModified.valueToString(0)).toBe('0');
		expect(mySiModified.valueToString(1)).toBe('1');
		expect(mySiModified.valueToString(0xff)).toBe('ff');
		expect(mySiModified.valueToString(-1) instanceof ValueToStringError).toBe(true);
		expect(mySiModified.valueToString(-15) instanceof ValueToStringError).toBe(true);
	});
	test('valueFromString', () => {
		expect(mySiModified.valueFromString('0')).toBe(0);
		expect(mySiModified.valueFromString('1')).toBe(1);
		expect(mySiModified.valueFromString('ff')).toBe(0xff);
		expect(mySiModified.valueFromString('0xFF')).toBe(0xff);
		expect(mySiModified.valueFromString('g') instanceof ValueFromStringError).toBe(true);
		expect(mySiModified.valueFromString('test') instanceof ValueFromStringError).toBe(true);
	});
	test('extractFromData gives field value', () => {
		const data = List([0x00, 0x00]);
		const fieldValue = mySiModified.extractFromData(data);
		expect(fieldValue instanceof SiFieldValue).toBe(true);
		expect(fieldValue!.field).toBe(mySiModified);
		expect(fieldValue!.value).toBe(0);
	});
	test('extractFromData', () => {
		const getExtractedFieldValue = (bytes: FakeSiStorageData) => mySiModified.extractFromData(List(bytes));

		expect(getExtractedFieldValue([0x00, 0x00])!.value).toBe(0x00);
		expect(getExtractedFieldValue([0x0f, 0x00])!.value).toBe(0x00);
		expect(getExtractedFieldValue([0x00, 0x0f])!.value).toBe(0x0f);
		expect(getExtractedFieldValue([0xff, 0x0f])!.value).toBe(0x0f);
		expect(getExtractedFieldValue([0x00, 0xf0])!.value).toBe(0xf0);
		expect(getExtractedFieldValue([0xab, 0xcd])!.value).toBe(0xcd);
		expect(getExtractedFieldValue([0x00, undefined])).toBe(undefined);
		expect(getExtractedFieldValue([undefined, 0x00])!.value).toBe(0x00);
		expect(getExtractedFieldValue([0x00])).toBe(undefined);
		expect(getExtractedFieldValue([])).toBe(undefined);
	});
	test('updateData', () => {
		const initialData = List([0x00, 0x00]);
		const updateInitialData = (newValue: number | SiFieldValue<number>): FakeSiStorageData => mySiModified.updateData(initialData, newValue).toJS();

		expect(updateInitialData(0x000)).toEqual([0x00, 0x00]);
		expect(updateInitialData(0x00f)).toEqual([0x00, 0x00]);
		expect(updateInitialData(0x020)).toEqual([0x00, 0x20]);
		expect(updateInitialData(0x0ff)).toEqual([0x00, 0xff]);
		expect(updateInitialData(0xfff)).toEqual([0x00, 0xff]);
		expect(updateInitialData(0xf00)).toEqual([0x00, 0x00]);
		expect(updateInitialData(0xcab)).toEqual([0x00, 0xab]);
		expect(updateInitialData(fieldValueOf(0x7357))).toEqual([0x00, 0x57]);
	});
	test('updateData modify undefined', () => {
		const updateData = (data: FakeSiStorageData, newValue: number | SiFieldValue<number>): FakeSiStorageData => mySiModified.updateData(List(data), newValue).toJS();

		expect(() => updateData([], 0x000)).not.toThrow(ModifyUndefinedException);
		expect(() => updateData([], 0x01f)).not.toThrow(ModifyUndefinedException);
		expect(() => updateData([], 0x020)).toThrow(ModifyUndefinedException);
		expect(() => updateData([], 0xcab)).toThrow(ModifyUndefinedException);
		expect(() => updateData([], fieldValueOf(0x7357))).toThrow(ModifyUndefinedException);
		expect(() => updateData([0x00, undefined], 0xcab)).toThrow(ModifyUndefinedException);
		expect(() => updateData([0xab, undefined], fieldValueOf(0x0ab))).toThrow(ModifyUndefinedException);
	});

	const nullSiModified = new SiModified(new FakeDataType(1));
	test('defaults if modification functions are undefined', () => {
		expect(nullSiModified.isValueValid(0)).toBe(true);
		expect(nullSiModified.valueToString(5) instanceof ValueToStringError).toBe(true);
		expect(nullSiModified.valueFromString('5') instanceof ValueFromStringError).toBe(true);
		expect(nullSiModified.extractFromData(List([]))).toBe(undefined);
		expect(nullSiModified.updateData(List([]), 0)).toEqual(List([]));
	});
});
