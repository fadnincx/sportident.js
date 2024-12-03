import { describe, expect, test } from '@jest/globals';
import _ from 'lodash';
import Immutable from 'immutable';
import { ValueToStringError, ValueFromStringError } from './interfaces';
import { ModifyUndefinedException } from './SiDataType';
import { SiFieldValue } from './SiFieldValue';
import { SiInt } from './SiInt';

type FakeSiStorageData = (number | undefined)[];

describe('SiInt', () => {
	const mySiInt = new SiInt([[0x00], [0x01, 4, 8]]);
	const fieldValueOf = (intValue: number): SiFieldValue<number> => new SiFieldValue(mySiInt, intValue);
	test('typeSpecificIsValueValid', () => {
		expect(mySiInt.typeSpecificIsValueValid(0)).toBe(true);
		expect(mySiInt.typeSpecificIsValueValid(1)).toBe(true);
		expect(mySiInt.typeSpecificIsValueValid(0xff)).toBe(true);
		expect(mySiInt.typeSpecificIsValueValid(-1)).toBe(false);
		expect(mySiInt.typeSpecificIsValueValid(1.5)).toBe(false);
		expect(mySiInt.typeSpecificIsValueValid(-7.5)).toBe(false);
	});
	test('valueToString', () => {
		expect(mySiInt.valueToString(0)).toBe('0');
		expect(mySiInt.valueToString(1)).toBe('1');
		expect(mySiInt.valueToString(0xff)).toBe('255');
		expect(mySiInt.valueToString(-1) instanceof ValueToStringError).toBe(true);
	});
	test('valueFromString', () => {
		expect(mySiInt.valueFromString('0')).toBe(0);
		expect(mySiInt.valueFromString('1')).toBe(1);
		expect(mySiInt.valueFromString('255')).toBe(0xff);
		expect(mySiInt.valueFromString('0xFF')).toBe(0);
		expect(mySiInt.valueFromString('-1') instanceof ValueFromStringError).toBe(true);
		expect(mySiInt.valueFromString('test') instanceof ValueFromStringError).toBe(true);
	});
	test('extractFromData gives field value', () => {
		const data = Immutable.List([0x00, 0x00]);
		const fieldValue = mySiInt.extractFromData(data);
		expect(fieldValue instanceof SiFieldValue).toBe(true);
		expect(fieldValue!.field).toBe(mySiInt);
		expect(fieldValue!.value).toBe(0);
	});
	test('extractFromData', () => {
		const getExtractedFieldValue = (bytes: FakeSiStorageData) => mySiInt.extractFromData(Immutable.List(bytes));

		expect(getExtractedFieldValue([0x00, 0x00])!.value).toBe(0x000);
		expect(getExtractedFieldValue([0x0f, 0x00])!.value).toBe(0x00f);
		expect(getExtractedFieldValue([0xff, 0x00])!.value).toBe(0x0ff);
		expect(getExtractedFieldValue([0xff, 0xf0])!.value).toBe(0xfff);
		expect(getExtractedFieldValue([0x00, 0xf0])!.value).toBe(0xf00);
		expect(getExtractedFieldValue([0xab, 0xcd])!.value).toBe(0xcab);
		expect(getExtractedFieldValue([0x00, undefined])).toBe(undefined);
		expect(getExtractedFieldValue([undefined, 0x00])).toBe(undefined);
		expect(getExtractedFieldValue([0x00])).toBe(undefined);
		expect(getExtractedFieldValue([])).toBe(undefined);
	});
	test('updateData', () => {
		const initialData = Immutable.List([0x00, 0x00]);
		const updateInitialData = (newValue: number | SiFieldValue<number>): FakeSiStorageData => mySiInt.updateData(initialData, newValue).toJS();

		expect(updateInitialData(0x000)).toEqual([0x00, 0x00]);
		expect(updateInitialData(0x00f)).toEqual([0x0f, 0x00]);
		expect(updateInitialData(0x0ff)).toEqual([0xff, 0x00]);
		expect(updateInitialData(0xfff)).toEqual([0xff, 0xf0]);
		expect(updateInitialData(0xf00)).toEqual([0x00, 0xf0]);
		expect(updateInitialData(0xcab)).toEqual([0xab, 0xc0]);
		expect(updateInitialData(fieldValueOf(0x7357))).toEqual([0x57, 0x30]);
	});
	test('updateData modify undefined', () => {
		const updateData = (data: FakeSiStorageData, newValue: number | SiFieldValue<number>): FakeSiStorageData => mySiInt.updateData(Immutable.List(data), newValue).toJS();

		expect(() => updateData([], 0x000)).toThrow(ModifyUndefinedException);
		expect(() => updateData([], 0xcab)).toThrow(ModifyUndefinedException);
		expect(() => updateData([], fieldValueOf(0x7357))).toThrow(ModifyUndefinedException);
		expect(() => updateData([0x00, undefined], 0xcab)).toThrow(ModifyUndefinedException);
		expect(() => updateData([undefined, 0x00], 0xcab)).toThrow(ModifyUndefinedException);
		expect(() => updateData([0xab, undefined], 0x0ab)).toThrow(ModifyUndefinedException);
		expect(() => updateData([undefined, 0xc0], 0xc00)).toThrow(ModifyUndefinedException);
	});
});
