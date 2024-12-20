import { describe, expect, test } from '@jest/globals';
import { List } from 'immutable';
import { proto } from './constants';
import * as utils from './utils';
import * as storage from './storage';
import * as testUtils from './testUtils';
import * as siProtocol from './siProtocol';

const json2date = (str: string): Date | undefined => {
	const res = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{3})Z$/.exec(str);
	if (!res) {
		return undefined;
	}
	return new Date(Number(res[1]!), Number(res[2]!) - 1, Number(res[3]!), Number(res[4]!), Number(res[5]!), Number(res[6]!), Number(res[7]!));
};

const date2json = (date: Date | undefined): string | undefined => {
	if (!date) {
		return undefined;
	}
	const year = date.getFullYear();
	const month = date.getMonth();
	const day = date.getDate();
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const seconds = date.getSeconds();
	const milliseconds = date.getMilliseconds();
	return new Date(Date.UTC(year, month, day, hours, minutes, seconds, milliseconds)).toJSON();
};

export const getValidButIncompleteMessageBytes = (): number[][] => {
	const cutOffCommands: number[][] = [];
	const appendCutOffCommands = (command: number[]) => {
		Array.from({length: command.length}, (_, i) => i).forEach((cutOffLength) => {
			cutOffCommands.push(command.slice(0, cutOffLength));
		});
	};
	const getRandomMessageBytes = (numParameters: number): number[] => siProtocol.render(testUtils.getRandomMessage({ numParameters: numParameters }));
	appendCutOffCommands(getRandomMessageBytes(0));
	appendCutOffCommands(getRandomMessageBytes(1));
	appendCutOffCommands(getRandomMessageBytes(2));
	return cutOffCommands;
};

describe('siProtocol', () => {
	const asOf = new Date('2020-01-01T00:00:00.000Z');
	test('arr2date works', () => {
		expect(date2json(siProtocol.arr2date([0x00, 0x01, 0x01], asOf))).toBe('2000-01-01T00:00:00.000Z');
		expect(date2json(siProtocol.arr2date([0x01, 0x02, 0x03], asOf))).toBe('2001-02-03T00:00:00.000Z');
		expect(date2json(siProtocol.arr2date([0x01, 0x0c, 0x1f], asOf))).toBe('2001-12-31T00:00:00.000Z');
		expect(date2json(siProtocol.arr2date([0x14, 0x0c, 0x1f], asOf))).toBe('2020-12-31T00:00:00.000Z');
		expect(date2json(siProtocol.arr2date([0x15, 0x01, 0x01], asOf))).toBe('1921-01-01T00:00:00.000Z');
		expect(date2json(siProtocol.arr2date([0x63, 0x0c, 0x1f], asOf))).toBe('1999-12-31T00:00:00.000Z');
		expect(date2json(siProtocol.arr2date([0x00, 0x01, 0x01, 0x00, 0x00, 0x00], asOf))).toBe('2000-01-01T00:00:00.000Z');
		expect(date2json(siProtocol.arr2date([0x14, 0x0c, 0x1f, 0x01, 0x00, 0x00], asOf))).toBe('2020-12-31T12:00:00.000Z');
		expect(date2json(siProtocol.arr2date([0x15, 0x0c, 0x1f, 0x01, 0x00, 0x00], asOf))).toBe('1921-12-31T12:00:00.000Z');
		expect(date2json(siProtocol.arr2date([0x63, 0x0c, 0x1f, 0x01, 0x00, 0x00], asOf))).toBe('1999-12-31T12:00:00.000Z');
		expect(date2json(siProtocol.arr2date([0x00, 0x01, 0x01, 0x00, 0xa8, 0xbf], asOf))).toBe('2000-01-01T11:59:59.000Z');
		expect(date2json(siProtocol.arr2date([0x63, 0x0c, 0x1f, 0x01, 0xa8, 0xbf], asOf))).toBe('1999-12-31T23:59:59.000Z');
		expect(date2json(siProtocol.arr2date([0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00], asOf))).toBe('2000-01-01T00:00:00.000Z');
		expect(date2json(siProtocol.arr2date([0x14, 0x0c, 0x1f, 0x01, 0x00, 0x00, 0x20], asOf))).toBe('2020-12-31T12:00:00.125Z');
		expect(date2json(siProtocol.arr2date([0x15, 0x0c, 0x1f, 0x01, 0x00, 0x00, 0x60], asOf))).toBe('1921-12-31T12:00:00.375Z');
		expect(date2json(siProtocol.arr2date([0x63, 0x0c, 0x1f, 0x01, 0x00, 0x00, 0x80], asOf))).toBe('1999-12-31T12:00:00.500Z');
		expect(date2json(siProtocol.arr2date([0x00, 0x01, 0x01, 0x00, 0xa8, 0xbf, 0x40], asOf))).toBe('2000-01-01T11:59:59.250Z');
		expect(date2json(siProtocol.arr2date([0x63, 0x0c, 0x1f, 0x01, 0xa8, 0xbf, 0xc0], asOf))).toBe('1999-12-31T23:59:59.750Z');
	});
	test('arr2date sanitizes', () => {
		expect(() => siProtocol.arr2date([], asOf)).toThrow();
		expect(() => siProtocol.arr2date([0x100], asOf)).toThrow();
		expect(() => siProtocol.arr2date([0x123, 0x123], asOf)).toThrow();
		expect(() => siProtocol.arr2date([1, 2, 3, 4], asOf)).toThrow();
		expect(() => siProtocol.arr2date([1, 2, 3, 4, 5], asOf)).toThrow();
		expect(() => siProtocol.arr2date([1, 2, 3, 4, 5, 6, 7, 8], asOf)).toThrow();
		expect(siProtocol.arr2date([100, 1, 1], asOf)).toBe(undefined);
		expect(siProtocol.arr2date([0xff, 1, 1], asOf)).toBe(undefined);
		expect(siProtocol.arr2date([12, 0, 1], asOf)).toBe(undefined);
		expect(siProtocol.arr2date([12, 13, 1], asOf)).toBe(undefined);
		expect(siProtocol.arr2date([12, 0xff, 1], asOf)).toBe(undefined);
	});
	test('arr2date without asOf', () => {
		expect(date2json(siProtocol.arr2date([0x00, 0x01, 0x01]))).toBe('2000-01-01T00:00:00.000Z');
	});
	test('date2arr', () => {
		expect(siProtocol.date2arr(json2date('2000-01-01T00:00:00.000Z')!)).toEqual([0x00, 0x01, 0x01, 0x0c, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-01T12:00:00.000Z')!)).toEqual([0x00, 0x01, 0x01, 0x0d, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-02T00:00:00.000Z')!)).toEqual([0x00, 0x01, 0x02, 0x00, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-02T12:00:00.000Z')!)).toEqual([0x00, 0x01, 0x02, 0x01, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-03T00:00:00.000Z')!)).toEqual([0x00, 0x01, 0x03, 0x02, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-03T12:00:00.000Z')!)).toEqual([0x00, 0x01, 0x03, 0x03, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-04T00:00:00.000Z')!)).toEqual([0x00, 0x01, 0x04, 0x04, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-04T12:00:00.000Z')!)).toEqual([0x00, 0x01, 0x04, 0x05, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-05T00:00:00.000Z')!)).toEqual([0x00, 0x01, 0x05, 0x06, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-05T12:00:00.000Z')!)).toEqual([0x00, 0x01, 0x05, 0x07, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-06T00:00:00.000Z')!)).toEqual([0x00, 0x01, 0x06, 0x08, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-06T12:00:00.000Z')!)).toEqual([0x00, 0x01, 0x06, 0x09, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-07T00:00:00.000Z')!)).toEqual([0x00, 0x01, 0x07, 0x0a, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2000-01-07T12:00:00.000Z')!)).toEqual([0x00, 0x01, 0x07, 0x0b, 0x00, 0x00, 0x00]);
		expect(siProtocol.date2arr(json2date('2099-12-31T12:00:00.500Z')!)).toEqual([0x63, 0x0c, 0x1f, 0x09, 0x00, 0x00, 0x80]);
		expect(siProtocol.date2arr(json2date('2000-01-01T11:59:59.250Z')!)).toEqual([0x00, 0x01, 0x01, 0x0c, 0xa8, 0xbf, 0x40]);
		expect(siProtocol.date2arr(json2date('1999-12-31T23:59:59.750Z')!)).toEqual([0x63, 0x0c, 0x1f, 0x0b, 0xa8, 0xbf, 0xc0]);
	});
	test('date2arr and arr2date do the reverse', () => {
		const forthAndBack = (date: Date) => siProtocol.arr2date(siProtocol.date2arr(date), asOf);
		const forthAndBackAsJson = (str: string) => date2json(forthAndBack(json2date(str)!));
		expect(forthAndBackAsJson('2000-01-01T00:00:00.000Z')).toBe('2000-01-01T00:00:00.000Z');
		expect(forthAndBackAsJson('2001-02-03T00:00:00.000Z')).toBe('2001-02-03T00:00:00.000Z');
		expect(forthAndBackAsJson('2001-12-31T00:00:00.000Z')).toBe('2001-12-31T00:00:00.000Z');
		expect(forthAndBackAsJson('2020-12-31T00:00:00.000Z')).toBe('2020-12-31T00:00:00.000Z');
		expect(forthAndBackAsJson('1921-01-01T00:00:00.000Z')).toBe('1921-01-01T00:00:00.000Z');
		expect(forthAndBackAsJson('1999-12-31T00:00:00.000Z')).toBe('1999-12-31T00:00:00.000Z');
		expect(forthAndBackAsJson('2000-01-01T06:30:00.000Z')).toBe('2000-01-01T06:30:00.000Z');
		expect(forthAndBackAsJson('2020-12-31T13:27:30.000Z')).toBe('2020-12-31T13:27:30.000Z');
		expect(forthAndBackAsJson('1921-12-31T12:00:00.000Z')).toBe('1921-12-31T12:00:00.000Z');
		expect(forthAndBackAsJson('1999-12-31T12:00:00.000Z')).toBe('1999-12-31T12:00:00.000Z');
		expect(forthAndBackAsJson('2000-01-01T11:59:59.000Z')).toBe('2000-01-01T11:59:59.000Z');
		expect(forthAndBackAsJson('1999-12-31T23:59:59.000Z')).toBe('1999-12-31T23:59:59.000Z');
		expect(forthAndBackAsJson('2000-01-01T00:00:00.000Z')).toBe('2000-01-01T00:00:00.000Z');
		expect(forthAndBackAsJson('2020-12-31T12:00:00.125Z')).toBe('2020-12-31T12:00:00.125Z');
		expect(forthAndBackAsJson('1921-12-31T12:00:00.375Z')).toBe('1921-12-31T12:00:00.375Z');
		expect(forthAndBackAsJson('1999-12-31T12:00:00.500Z')).toBe('1999-12-31T12:00:00.500Z');
		expect(forthAndBackAsJson('2000-01-01T11:59:59.250Z')).toBe('2000-01-01T11:59:59.250Z');
		expect(forthAndBackAsJson('1999-12-31T23:59:59.750Z')).toBe('1999-12-31T23:59:59.750Z');
	});
	test('arr2cardNumber works', () => {
		expect(siProtocol.arr2cardNumber([0x00, 0x00, 0x00])).toBe(0x000000);
		expect(siProtocol.arr2cardNumber([0x12, 0x34, 0x00])).toBe(0x003412);
		expect(siProtocol.arr2cardNumber([0x12, 0x34, 0x01])).toBe(0x003412 + 1 * 100000);
		expect(siProtocol.arr2cardNumber([0x12, 0x34, 0x02])).toBe(0x003412 + 2 * 100000);
		expect(siProtocol.arr2cardNumber([0x12, 0x34, 0x03])).toBe(0x003412 + 3 * 100000);
		expect(siProtocol.arr2cardNumber([0x12, 0x34, 0x04])).toBe(0x003412 + 4 * 100000);
		// the following should actually never appear, as 0x053412 = 341010, which would be represented differently
		expect(siProtocol.arr2cardNumber([0x12, 0x34, 0x05])).toBe(0x053412);
		expect(siProtocol.arr2cardNumber([0x12, 0x34, 0x08])).toBe(0x083412);
		expect(siProtocol.arr2cardNumber([0x12, 0x34, 0x56])).toBe(0x563412);
		expect(siProtocol.arr2cardNumber([0x00, 0x00, 0x00, 0x00])).toBe(0x00000000);
		expect(siProtocol.arr2cardNumber([0x00, 0x00, 0x00, 0x01])).toBe(0x01000000);
		expect(siProtocol.arr2cardNumber([0x12, 0x34, 0x56, 0x78])).toBe(0x78563412);
		expect(siProtocol.arr2cardNumber([0x12, 0x34, 0x56, undefined])).toBe(undefined);
		expect(siProtocol.arr2cardNumber([0x12, 0x34, undefined, 0x78])).toBe(undefined);
		expect(siProtocol.arr2cardNumber([0x12, undefined, 0x56, 0x78])).toBe(undefined);
		expect(siProtocol.arr2cardNumber([undefined, 0x34, 0x56, 0x78])).toBe(undefined);
	});
	test('arr2cardNumber sanitizes', () => {
		expect(() => siProtocol.arr2cardNumber([])).toThrow();
		expect(() => siProtocol.arr2cardNumber([1])).toThrow();
		expect(() => siProtocol.arr2cardNumber([1, 2])).toThrow();
		expect(() => siProtocol.arr2cardNumber([1, 2, 3, 4, 5])).toThrow();
		expect(() => siProtocol.arr2cardNumber([1, 2, 3, 4, 5, 6, 7, 8])).toThrow();
	});
	test('cardNumber2arr works', () => {
		expect(siProtocol.cardNumber2arr(0x000000)).toEqual([0x00, 0x00, 0x00, 0x00]);
		expect(siProtocol.cardNumber2arr(0x003412)).toEqual([0x12, 0x34, 0x00, 0x00]);
		expect(siProtocol.cardNumber2arr(0x003412 + 1 * 100000)).toEqual([0x12, 0x34, 0x01, 0x00]);
		expect(siProtocol.cardNumber2arr(0x003412 + 2 * 100000)).toEqual([0x12, 0x34, 0x02, 0x00]);
		expect(siProtocol.cardNumber2arr(0x003412 + 3 * 100000)).toEqual([0x12, 0x34, 0x03, 0x00]);
		expect(siProtocol.cardNumber2arr(0x003412 + 4 * 100000)).toEqual([0x12, 0x34, 0x04, 0x00]);
		expect(siProtocol.cardNumber2arr(0x083412)).toEqual([0x12, 0x34, 0x08, 0x00]);
		expect(siProtocol.cardNumber2arr(0x563412)).toEqual([0x12, 0x34, 0x56, 0x00]);
		expect(siProtocol.cardNumber2arr(0x00000000)).toEqual([0x00, 0x00, 0x00, 0x00]);
		expect(siProtocol.cardNumber2arr(0x01000000)).toEqual([0x00, 0x00, 0x00, 0x01]);
		expect(siProtocol.cardNumber2arr(0x78563412)).toEqual([0x12, 0x34, 0x56, 0x78]);
		expect(siProtocol.cardNumber2arr(undefined)).toEqual([undefined, undefined, undefined, undefined]);
	});
	test('consistent cardNumber <=> arr conversion', () => {
		const cardNumbers = [1000, 10000, 65535, 100000, 165535, 200000, 265535, 300000, 365535, 400000, 465535, 500000, 599999, 999999, 1000000, 1999999, 2000000, 2999999];
		cardNumbers.forEach((cardNumber) => {
			const arr = siProtocol.cardNumber2arr(cardNumber);
			const restoredCardNumber = siProtocol.arr2cardNumber(arr);
			expect(restoredCardNumber).toEqual(cardNumber);
		});
	});
	test('prettyMessage', () => {
		expect(siProtocol.prettyMessage({ command: proto.cmd.GET_MS, parameters: [] }).length > 3).toBe(true);
		expect(siProtocol.prettyMessage({ mode: proto.ACK }).length > 3).toBe(true);
	});
	test('CRC16', () => {
		expect(siProtocol.CRC16([])).toEqual([0x00, 0x00]);
		expect(siProtocol.CRC16([0x01])).toEqual([0x01, 0x00]);
		expect(siProtocol.CRC16([0x12])).toEqual([0x12, 0x00]);
		expect(siProtocol.CRC16([0xff])).toEqual([0xff, 0x00]);
		expect(siProtocol.CRC16([0x01, 0x02])).toEqual([0x01, 0x02]);
		expect(siProtocol.CRC16([0x12, 0x34])).toEqual([0x12, 0x34]);
		expect(siProtocol.CRC16([0x12, 0x34, 0x56])).toEqual([0xba, 0xbb]);
		expect(siProtocol.CRC16([0x12, 0x32, 0x56])).toEqual([0xba, 0xaf]);
		expect(siProtocol.CRC16([0x12, 0x34, 0x56, 0x78])).toEqual([0x1e, 0x83]);
		expect(siProtocol.CRC16([0x12, 0x32, 0x56, 0x78])).toEqual([0x1e, 0xfb]);
	});

	test('parse WAKEUP', () => {
		expect(siProtocol.parse([proto.WAKEUP])).toEqual({
			message: { mode: proto.WAKEUP },
			remainder: []
		});
		const randomByte = testUtils.getRandomByte();
		expect(siProtocol.parse([proto.WAKEUP, randomByte])).toEqual({
			message: { mode: proto.WAKEUP },
			remainder: [randomByte]
		});
	});
	test('parse ACK', () => {
		expect(siProtocol.parse([proto.ACK])).toEqual({
			message: { mode: proto.ACK },
			remainder: []
		});
		const randomByte = testUtils.getRandomByte();
		expect(siProtocol.parse([proto.ACK, randomByte])).toEqual({
			message: { mode: proto.ACK },
			remainder: [randomByte]
		});
	});
	test('parse NAK', () => {
		expect(siProtocol.parse([proto.NAK])).toEqual({
			message: { mode: proto.NAK },
			remainder: []
		});
		const randomByte = testUtils.getRandomByte();
		expect(siProtocol.parse([proto.NAK, randomByte])).toEqual({
			message: { mode: proto.NAK },
			remainder: [randomByte]
		});
	});
	test('parse with invalid start byte', () => {
		const invalidStartByte = testUtils.getRandomByteExcept([proto.STX, proto.WAKEUP, proto.NAK]);
		console.debug(`Chosen invalid start byte: ${utils.prettyHex([invalidStartByte])}`);
		expect(siProtocol.parse([invalidStartByte])).toEqual({ message: null, remainder: [] });
		const randomByte = testUtils.getRandomByte();
		expect(siProtocol.parse([invalidStartByte, randomByte])).toEqual({
			message: null,
			remainder: [randomByte]
		});
	});

	test('parse command without remainder', () => {
		const parseForMessage = (message: siProtocol.SiMessage) => siProtocol.parse(siProtocol.render(message)).message;
		expect(parseForMessage({ command: 0x00, parameters: [] })).toEqual({
			command: 0x00,
			parameters: []
		});
		expect(parseForMessage({ command: 0xff, parameters: [0xee] })).toEqual({
			command: 0xff,
			parameters: [0xee]
		});
	});
	test('parse command with remainder', () => {
		const parseForMessageWithRemainder = (message: siProtocol.SiMessage) => siProtocol.parse([...siProtocol.render(message), 0xdd]);
		expect(parseForMessageWithRemainder({ command: 0x00, parameters: [] })).toEqual({
			message: { command: 0x00, parameters: [] },
			remainder: [0xdd]
		});
		expect(parseForMessageWithRemainder({ command: 0xff, parameters: [0xee] })).toEqual({
			message: { command: 0xff, parameters: [0xee] },
			remainder: [0xdd]
		});
	});
	test('parse incomplete but valid command', () => {
		getValidButIncompleteMessageBytes().forEach((cutOffCommand) => {
			expect(siProtocol.parse(cutOffCommand)).toEqual({ message: null, remainder: cutOffCommand });
		});
	});
	test('parse command with invalid ETX', () => {
		const invalidETX = testUtils.getRandomByteExcept([proto.ETX]);
		console.debug(`Chosen invalid ETX: ${utils.prettyHex([invalidETX])}`);
		expect(siProtocol.parse([proto.STX, 0x00, 0x00, 0x00, 0x00, invalidETX])).toEqual({
			message: null,
			remainder: [0x00, 0x00, 0x00, 0x00, invalidETX]
		});
		expect(siProtocol.parse([proto.STX, 0xff, 0x01, 0xee, 0x00, 0x01, invalidETX])).toEqual({
			message: null,
			remainder: [0xff, 0x01, 0xee, 0x00, 0x01, invalidETX]
		});
		expect(siProtocol.parse([proto.STX, 0x00, 0x00, 0x00, 0x01, invalidETX, 0xdd])).toEqual({
			message: null,
			remainder: [0x00, 0x00, 0x00, 0x01, invalidETX, 0xdd]
		});
		expect(siProtocol.parse([proto.STX, 0xff, 0x01, 0xee, 0x00, 0x01, invalidETX, 0xdd])).toEqual({
			message: null,
			remainder: [0xff, 0x01, 0xee, 0x00, 0x01, invalidETX, 0xdd]
		});
	});
	test('parse command with invalid CRC', () => {
		expect(siProtocol.parse([proto.STX, 0x00, 0x00, 0x00, 0x01, proto.ETX])).toEqual({
			message: null,
			remainder: []
		});
		expect(siProtocol.parse([proto.STX, 0xff, 0x01, 0xee, 0x00, 0x01, proto.ETX])).toEqual({
			message: null,
			remainder: []
		});
		expect(siProtocol.parse([proto.STX, 0x00, 0x00, 0x00, 0x01, proto.ETX, 0xdd])).toEqual({
			message: null,
			remainder: [0xdd]
		});
		expect(siProtocol.parse([proto.STX, 0xff, 0x01, 0xee, 0x00, 0x01, proto.ETX, 0xdd])).toEqual({
			message: null,
			remainder: [0xdd]
		});
	});

	test('parseAll without remainder', () => {
		const stream0 = [] as number[];
		expect(siProtocol.parseAll(stream0)).toEqual({
			messages: [],
			remainder: []
		});

		const stream1 = siProtocol.render({ command: 0x00, parameters: [] });
		expect(siProtocol.parseAll(stream1)).toEqual({
			messages: [{ command: 0x00, parameters: [] }],
			remainder: []
		});

		const stream2 = [...siProtocol.render({ command: 0x00, parameters: [] }), proto.WAKEUP, ...siProtocol.render({ command: 0xff, parameters: [0xee] })];
		expect(siProtocol.parseAll(stream2)).toEqual({
			messages: [{ command: 0x00, parameters: [] }, { mode: proto.WAKEUP }, { command: 0xff, parameters: [0xee] }],
			remainder: []
		});
	});
	test('parseAll with valid remainder', () => {
		getValidButIncompleteMessageBytes().forEach((cutOffCommand) => {
			const stream0 = [...cutOffCommand];
			expect(siProtocol.parseAll(stream0)).toEqual({
				messages: [],
				remainder: cutOffCommand
			});

			const stream1 = [...siProtocol.render({ command: 0x00, parameters: [] }), proto.NAK, ...cutOffCommand];
			expect(siProtocol.parseAll(stream1)).toEqual({
				messages: [{ command: 0x00, parameters: [] }, { mode: proto.NAK }],
				remainder: cutOffCommand
			});

			const stream2 = [proto.WAKEUP, ...siProtocol.render({ command: 0x00, parameters: [] }), ...siProtocol.render({ command: 0xff, parameters: [0xee] }), ...cutOffCommand];
			expect(siProtocol.parseAll(stream2)).toEqual({
				messages: [{ mode: proto.WAKEUP }, { command: 0x00, parameters: [] }, { command: 0xff, parameters: [0xee] }],
				remainder: cutOffCommand
			});
		});
	});

	test('render ACK', () => {
		expect(siProtocol.render({ mode: proto.ACK })).toEqual([proto.ACK]);
	});
	test('render NAK', () => {
		expect(siProtocol.render({ mode: proto.NAK })).toEqual([proto.NAK]);
	});
	test('render WAKEUP', () => {
		expect(siProtocol.render({ mode: proto.WAKEUP })).toEqual([proto.WAKEUP]);
	});
	test('render command', () => {
		expect(siProtocol.render({ command: 0x00, parameters: [] })).toEqual([proto.STX, 0x00, 0x00, 0x00, 0x00, proto.ETX]);
		expect(siProtocol.render({ command: 0xff, parameters: [0xee] })).toEqual([proto.STX, 0xff, 0x01, 0xee, 0xec, 0x0a, proto.ETX]);
		expect(siProtocol.render({ mode: undefined, command: 0x00, parameters: [] })).toEqual([proto.STX, 0x00, 0x00, 0x00, 0x00, proto.ETX]);
		expect(siProtocol.render({ mode: undefined, command: 0xff, parameters: [0xee] })).toEqual([proto.STX, 0xff, 0x01, 0xee, 0xec, 0x0a, proto.ETX]);
	});
	test('render invalid mode', () => {
		const invalidMode = testUtils.getRandomByteExcept([proto.WAKEUP, proto.NAK, proto.ACK]);
		expect(() => siProtocol.render({ mode: invalidMode })).toThrow();
	});

	test('SiDate SiStorage integration', () => {
		const weirdStorage = storage.defineStorage(0x09, {
			weirdDate: new siProtocol.SiDate(3, (i) => i),
			crazyDate: new siProtocol.SiDate(6, (i) => 0x03 + i)
		});

		const myWeirdStorage = weirdStorage(utils.unPrettyHex('0F 03 07 00 00 00 00 00 00'));

		expect(myWeirdStorage.get('weirdDate')!.value).toEqual(new Date(2015, 2, 7));
		myWeirdStorage.set('weirdDate', new Date(2017, 12, 30));
		expect(myWeirdStorage.data.toJS()).toEqual(utils.unPrettyHex('12 01 1E 00 00 00 00 00 00'));
		expect(myWeirdStorage.get('weirdDate')!.value).toEqual(new Date(2017, 12, 30));

		expect(myWeirdStorage.get('crazyDate')).toEqual(undefined);
		myWeirdStorage.set('crazyDate', new Date(2003, 1, 30, 3, 7, 5));
		expect(myWeirdStorage.data.toJS()).toEqual(utils.unPrettyHex('12 01 1E 03 03 02 00 2B D9'));
		expect(myWeirdStorage.get('crazyDate')!.value).toEqual(new Date(2003, 1, 30, 3, 7, 5));

		const unknownWeirdStorage = weirdStorage();
		const ModifyUndefinedException = storage.ModifyUndefinedException;

		expect(unknownWeirdStorage.get('weirdDate')).toBe(undefined);
		expect(() => unknownWeirdStorage.set('weirdDate', new Date(2017, 12, 30))).toThrow(ModifyUndefinedException);

		expect(unknownWeirdStorage.get('crazyDate')).toBe(undefined);
		expect(() => unknownWeirdStorage.set('crazyDate', new Date(2003, 1, 30, 3, 7, 5))).toThrow(ModifyUndefinedException);
	});

	describe('SiDate', () => {
		const mySiDate = new siProtocol.SiDate(3, (i) => i);
		const fieldValueOf = (value: Date) => new storage.SiFieldValue(mySiDate, value);
		test('typeSpecificIsValueValid', () => {
			expect(mySiDate.typeSpecificIsValueValid(new Date())).toBe(true);
		});
		test('valueToString', () => {
			expect(mySiDate.valueToString(json2date('2000-01-01T00:00:00.000Z')!)).toBe('2000-01-01T00:00:00.000Z');
			expect(mySiDate.valueToString(json2date('2020-12-31T13:27:30.000Z')!)).toBe('2020-12-31T13:27:30.000Z');
		});
		test('valueFromString', () => {
			expect(mySiDate.valueFromString('2000-01-01T00:00:00.000Z')).toEqual(json2date('2000-01-01T00:00:00.000Z')!);
			expect(mySiDate.valueFromString('2020-12-31T13:27:30.000Z')).toEqual(json2date('2020-12-31T13:27:30.000Z')!);
			expect(mySiDate.valueFromString('2020-12-31T13:27:30.000') instanceof storage.ValueFromStringError).toBe(true);
			expect(mySiDate.valueFromString('2020-12-31T13:27:30Z') instanceof storage.ValueFromStringError).toBe(true);
			expect(mySiDate.valueFromString('2020-12-31Z') instanceof storage.ValueFromStringError).toBe(true);
			expect(mySiDate.valueFromString('2020-12-31') instanceof storage.ValueFromStringError).toBe(true);
			expect(mySiDate.valueFromString('test') instanceof storage.ValueFromStringError).toBe(true);
		});
		test('extractFromData gives field value', () => {
			const data = List([0x00, 0x01, 0x01]);
			const fieldValue = mySiDate.extractFromData(data);
			expect(fieldValue instanceof storage.SiFieldValue).toBe(true);
			expect(fieldValue!.field).toBe(mySiDate);
			expect(fieldValue!.value).toEqual(json2date('2000-01-01T00:00:00.000Z')!);
		});
		test('extractFromData', () => {
			const getExtractedFieldValue = (bytes: (number | undefined)[]) => mySiDate.extractFromData(List(bytes));
			expect(getExtractedFieldValue([0x00, 0x01, 0x01])!.value instanceof Date).toBe(true);
			expect(getExtractedFieldValue([0x00, 0x01, undefined])).toBe(undefined);
			expect(getExtractedFieldValue([0x00, undefined, 0x01])).toBe(undefined);
			expect(getExtractedFieldValue([undefined, 0x00, 0x01])).toBe(undefined);
			expect(getExtractedFieldValue([0x00])).toBe(undefined);
			expect(getExtractedFieldValue([])).toBe(undefined);
		});
		test('updateData', () => {
			const initialData = List([0x00, 0x00, 0x00]);
			const updateInitialData = (newValue: Date | storage.SiFieldValue<Date>) => mySiDate.updateData(initialData, newValue).toJS();

			expect(updateInitialData(json2date('2000-01-01T00:00:00.000Z')!)).toEqual([0x00, 0x01, 0x01]);
			expect(updateInitialData(fieldValueOf(json2date('2000-01-01T00:00:00.000Z')!))).toEqual([0x00, 0x01, 0x01]);
		});
		test('updateData modify undefined', () => {
			const updateData = (data: (number | undefined)[], newValue: Date | storage.SiFieldValue<Date>) => mySiDate.updateData(List(data), newValue).toJS();

			expect(() => updateData([], json2date('2000-01-01T00:00:00.000Z')!)).toThrow(storage.ModifyUndefinedException);
			expect(() => updateData([], fieldValueOf(json2date('2000-01-01T00:00:00.000Z')!))).toThrow(storage.ModifyUndefinedException);
			expect(() => updateData([0x00, 0x00, undefined], json2date('2000-01-01T00:00:00.000Z')!)).toThrow(storage.ModifyUndefinedException);
			expect(() => updateData([0x00, undefined, 0x00], json2date('2000-01-01T00:00:00.000Z')!)).toThrow(storage.ModifyUndefinedException);
			expect(() => updateData([undefined, 0x00, 0x00], json2date('2000-01-01T00:00:00.000Z')!)).toThrow(storage.ModifyUndefinedException);
		});
	});

	describe('SiTime', () => {
		const mySiTime = new siProtocol.SiTime([[0x01], [0x00]]);
		const myInexistentSiTime = new siProtocol.SiTime(undefined);
		const fieldValueOf = (value: siProtocol.SiTimestamp) => new storage.SiFieldValue(mySiTime, value);
		test('typeSpecificIsValueValid', () => {
			expect(mySiTime.typeSpecificIsValueValid({time:0})).toBe(true);
			expect(mySiTime.typeSpecificIsValueValid({time:43199})).toBe(true);
			expect(mySiTime.typeSpecificIsValueValid({time:86400})).toBe(false);
			expect(mySiTime.typeSpecificIsValueValid(null)).toBe(true);
		});
		test('valueToString', () => {
			expect(mySiTime.valueToString({time:0})).toBe('00:00:00');
			expect(mySiTime.valueToString({time:43199})).toBe('11:59:59');
			expect(mySiTime.valueToString(null)).toBe('NO_TIME');
		});
		test('valueFromString', () => {
			expect(mySiTime.valueFromString('00:00:00')).toEqual({time:0});
			expect(mySiTime.valueFromString('11:59:59')).toEqual({time:43199});
			expect(mySiTime.valueFromString('NO_TIME')).toBe(null);
			expect(mySiTime.valueFromString('06:12') instanceof storage.ValueFromStringError).toBe(true);
			expect(mySiTime.valueFromString('test') instanceof storage.ValueFromStringError).toBe(true);
		});
		test('extractFromData gives field value', () => {
			const data = List([0x01, 0x01]);
			const fieldValue = mySiTime.extractFromData(data);
			expect(fieldValue instanceof storage.SiFieldValue).toBe(true);
			expect(fieldValue!.field).toBe(mySiTime);
			expect(JSON.stringify(fieldValue!.value)).toBe(JSON.stringify({time:257, weekcounter: undefined, weekday: undefined}));
		});
		test('extractFromData', () => {
			const getExtractedFieldValue = (bytes: (number | undefined)[]) => mySiTime.extractFromData(List(bytes));
			expect(JSON.stringify(getExtractedFieldValue([0x00, 0x01])!.value)).toBe(JSON.stringify({time:1, weekcounter: undefined, weekday: undefined}));
			expect(getExtractedFieldValue([0xee, 0xee])!.value).toBe(null);
			expect(getExtractedFieldValue([0x00, undefined])).toBe(undefined);
			expect(getExtractedFieldValue([undefined, 0x01])).toBe(undefined);
			expect(getExtractedFieldValue([0x00])).toBe(undefined);
			expect(getExtractedFieldValue([])).toBe(undefined);
		});
		test('extractFromData for inexistent', () => {
			const getExtractedFieldValue = (bytes: (number | undefined)[]) => myInexistentSiTime.extractFromData(List(bytes));
			expect(getExtractedFieldValue([0x00, 0x01])!.value).toBe(null);
		});
		test('updateData', () => {
			const initialData = List([0x00, 0x00]);
			const updateInitialData = (newValue: siProtocol.SiTimestamp | storage.SiFieldValue<siProtocol.SiTimestamp>) => mySiTime.updateData(initialData, newValue).toJS();

			expect(updateInitialData({time:257})).toEqual([0x01, 0x01]);
			expect(updateInitialData(fieldValueOf({time:257}))).toEqual([0x01, 0x01]);
			expect(updateInitialData(null)).toEqual([0xee, 0xee]);
			expect(updateInitialData(fieldValueOf(null))).toEqual([0xee, 0xee]);
		});
		test('updateData for inexistent', () => {
			const initialData = List([0x00, 0x00]);
			const updateInitialData = (newValue: siProtocol.SiTimestamp | storage.SiFieldValue<siProtocol.SiTimestamp>) => myInexistentSiTime.updateData(initialData, newValue).toJS();

			expect(updateInitialData({time:257})).toEqual([0x00, 0x00]);
			expect(updateInitialData(fieldValueOf({time:257}))).toEqual([0x00, 0x00]);
		});
		test('updateData modify undefined', () => {
			const updateData = (data: (number | undefined)[], newValue: siProtocol.SiTimestamp | storage.SiFieldValue<siProtocol.SiTimestamp>) => mySiTime.updateData(List(data), newValue).toJS();

			expect(() => updateData([], {time:257})).toThrow(storage.ModifyUndefinedException);
			expect(() => updateData([], fieldValueOf({time:257}))).toThrow(storage.ModifyUndefinedException);
			expect(() => updateData([0x00, undefined], {time:257})).toThrow(storage.ModifyUndefinedException);
			expect(() => updateData([undefined, 0x01], {time:257})).toThrow(storage.ModifyUndefinedException);
		});
	});
});
