import { describe, expect, test } from '@jest/globals';
import { List } from 'immutable';
import { ValueFromStringError } from './interfaces';
import { ModifyUndefinedException } from './SiDataType';
import { SiFieldValue } from './SiFieldValue';
import { SiBool } from './SiBool';

describe('SiBool', () => {
	const mySiBool = new SiBool(0x00, 4);
	const myOtherSiBool = new SiBool(0x00);
	const fieldValueOf = (boolValue: boolean): SiFieldValue<boolean> => new SiFieldValue(mySiBool, boolValue);
	test('typeCheckValue', () => {
		expect(mySiBool.isValueValid(false)).toBe(true);
		expect(mySiBool.isValueValid(true)).toBe(true);
	});
	test('valueToString', () => {
		expect(mySiBool.valueToString(false)).toBe('false');
		expect(mySiBool.valueToString(true)).toBe('true');
	});
	test('valueFromString', () => {
		expect(mySiBool.valueFromString('false')).toBe(false);
		expect(mySiBool.valueFromString('true')).toBe(true);
		expect(mySiBool.valueFromString('test') instanceof ValueFromStringError).toBe(true);
	});
	test('extractFromData gives field value', () => {
		const data = List([0x00]);
		const fieldValue = mySiBool.extractFromData(data);
		expect(fieldValue instanceof SiFieldValue).toBe(true);
		expect(fieldValue!.field).toBe(mySiBool);
		expect(fieldValue!.value).toBe(false);
	});
	test('extractFromData', () => {
		const getExtractedFieldValue = (bytes: (number | undefined)[]) => mySiBool.extractFromData(List(bytes));

		expect(getExtractedFieldValue([0x00])!.value).toBe(false);
		expect(getExtractedFieldValue([0x10])!.value).toBe(true);
		expect(getExtractedFieldValue([0xff])!.value).toBe(true);
		expect(getExtractedFieldValue([undefined])).toBe(undefined);
		expect(getExtractedFieldValue([])).toBe(undefined);
	});
	test('extractFromData other', () => {
		const getExtractedFieldValue = (bytes: (number | undefined)[]) => myOtherSiBool.extractFromData(List(bytes));

		expect(getExtractedFieldValue([0x00])!.value).toBe(false);
		expect(getExtractedFieldValue([0x01])!.value).toBe(true);
		expect(getExtractedFieldValue([0xff])!.value).toBe(true);
		expect(getExtractedFieldValue([undefined])).toBe(undefined);
		expect(getExtractedFieldValue([])).toBe(undefined);
	});
	test('updateData', () => {
		const updateData = (data: (number | undefined)[], newValue: boolean | SiFieldValue<boolean>) => mySiBool.updateData(List(data), newValue).toJS();

		expect(updateData([0x10], false)).toEqual([0x00]);
		expect(updateData([0xff], false)).toEqual([0xef]);
		expect(updateData([0x00], true)).toEqual([0x10]);
		expect(updateData([0xef], true)).toEqual([0xff]);
		expect(updateData([0x10], fieldValueOf(false))).toEqual([0x00]);
		expect(updateData([0x00], fieldValueOf(true))).toEqual([0x10]);
	});
	test('updateData other', () => {
		const updateData = (data: (number | undefined)[], newValue: boolean | SiFieldValue<boolean>) => myOtherSiBool.updateData(List(data), newValue).toJS();

		expect(updateData([0x01], false)).toEqual([0x00]);
		expect(updateData([0xff], false)).toEqual([0xfe]);
		expect(updateData([0x00], true)).toEqual([0x01]);
		expect(updateData([0xfe], true)).toEqual([0xff]);
		expect(updateData([0x01], fieldValueOf(false))).toEqual([0x00]);
		expect(updateData([0x00], fieldValueOf(true))).toEqual([0x01]);
	});
	test('updateData modify undefined', () => {
		const updateData = (data: (number | undefined)[], newValue: boolean | SiFieldValue<boolean>) => mySiBool.updateData(List(data), newValue).toJS();

		expect(() => updateData([], false)).toThrow(ModifyUndefinedException);
		expect(() => updateData([], true)).toThrow(ModifyUndefinedException);
		expect(() => updateData([], fieldValueOf(false))).toThrow(ModifyUndefinedException);
		expect(() => updateData([], fieldValueOf(true))).toThrow(ModifyUndefinedException);
		expect(() => updateData([undefined], false)).toThrow(ModifyUndefinedException);
		expect(() => updateData([undefined], true)).toThrow(ModifyUndefinedException);
	});
});
