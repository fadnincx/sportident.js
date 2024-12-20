import { describe, expect, test } from '@jest/globals';
import * as testUtils from './testUtils';

testUtils.useFakeTimers();

describe('testUtils', () => {
	test('runPromises resolve with fake timers', async () => {
		const timeState = {
			promiseResolved: false
		};
		Promise.resolve().then(() => {
			timeState.promiseResolved = true;
		});
		expect(timeState).toEqual({ promiseResolved: false });
		await testUtils.runPromises();
		expect(timeState).toEqual({ promiseResolved: true });
	});
	test('runPromises reject with fake timers', async () => {
		const timeState = { promiseRejected: false };
		Promise.reject(new Error('test')).catch(() => {
			timeState.promiseRejected = true;
		});
		expect(timeState).toEqual({ promiseRejected: false });
		await testUtils.runPromises();
		expect(timeState).toEqual({ promiseRejected: true });
	});
	test('advanceTimersByTime', async () => {
		const timeState = {
			timeout0: false,
			promise0: false,
			timeout1: false,
			promise1: false,
			timeout2: false,
			promise2: false
		};
		setTimeout(() => {
			timeState.timeout0 = true;
		}, 0);
		setTimeout(() => {
			timeState.timeout1 = true;
		}, 1);
		setTimeout(() => {
			timeState.timeout2 = true;
		}, 2);
		const promise0 = new Promise((resolve) => setTimeout(resolve, 0));
		const promise1 = new Promise((resolve) => setTimeout(resolve, 1));
		const promise2 = new Promise((resolve) => setTimeout(resolve, 2));
		promise0.then(() => {
			timeState.promise0 = true;
		});
		promise1.then(() => {
			timeState.promise1 = true;
		});
		promise2.then(() => {
			timeState.promise2 = true;
		});
		expect(timeState).toEqual({
			timeout0: false,
			promise0: false,
			timeout1: false,
			promise1: false,
			timeout2: false,
			promise2: false
		});
		await testUtils.advanceTimersByTime(0);
		expect(timeState).toEqual({
			timeout0: true,
			promise0: true,
			timeout1: false,
			promise1: false,
			timeout2: false,
			promise2: false
		});
		await testUtils.advanceTimersByTime(1);
		expect(timeState).toEqual({
			timeout0: true,
			promise0: true,
			timeout1: true,
			promise1: true,
			timeout2: false,
			promise2: false
		});
		await testUtils.advanceTimersByTime(1);
		expect(timeState).toEqual({
			timeout0: true,
			promise0: true,
			timeout1: true,
			promise1: true,
			timeout2: true,
			promise2: true
		});
	});
	test('nTimesAsync', async () => {
		const timeState = {
			timeout0: false,
			promise0: false,
			timeout1: false,
			promise1: false,
			timeout2: false,
			promise2: false
		};
		setTimeout(() => {
			timeState.timeout0 = true;
		}, 0);
		setTimeout(() => {
			timeState.timeout1 = true;
		}, 1);
		setTimeout(() => {
			timeState.timeout2 = true;
		}, 2);
		const promise0 = new Promise((resolve) => setTimeout(resolve, 0));
		const promise1 = new Promise((resolve) => setTimeout(resolve, 1));
		const promise2 = new Promise((resolve) => setTimeout(resolve, 2));
		promise0.then(() => {
			timeState.promise0 = true;
		});
		promise1.then(() => {
			timeState.promise1 = true;
		});
		promise2.then(() => {
			timeState.promise2 = true;
		});
		expect(timeState).toEqual({
			timeout0: false,
			promise0: false,
			timeout1: false,
			promise1: false,
			timeout2: false,
			promise2: false
		});
		await testUtils.nTimesAsync(0, () => testUtils.advanceTimersByTime(0));
		expect(timeState).toEqual({
			timeout0: false,
			promise0: false,
			timeout1: false,
			promise1: false,
			timeout2: false,
			promise2: false
		});
		await testUtils.nTimesAsync(1, () => testUtils.advanceTimersByTime(0));
		expect(timeState).toEqual({
			timeout0: true,
			promise0: true,
			timeout1: false,
			promise1: false,
			timeout2: false,
			promise2: false
		});
		await testUtils.nTimesAsync(2, () => testUtils.advanceTimersByTime(1));
		expect(timeState).toEqual({
			timeout0: true,
			promise0: true,
			timeout1: true,
			promise1: true,
			timeout2: true,
			promise2: true
		});
	});
	test('getRandomInt with 0 options', () => {
		Array.from({length: 10}, (_, i) => i).forEach(() => {
			expect(testUtils.getRandomInt(0)).toBe(0);
		});
	});
	test('getRandomInt with 1 options', () => {
		Array.from({length: 10}, (_, i) => i).forEach(() => {
			expect(testUtils.getRandomInt(1)).toBe(0);
		});
	});
	test('getRandomInt with 2 options', () => {
		Array.from({length: 10}, (_, i) => i).forEach(() => {
			const randomInt = testUtils.getRandomInt(2);
			expect(randomInt).not.toBeLessThan(0);
			expect(randomInt).not.toBeGreaterThan(1);
		});
	});
	test('getRandomByte', () => {
		Array.from({length: 10}, (_, i) => i).forEach(() => {
			const randomByte = testUtils.getRandomByte();
			expect(randomByte).not.toBeLessThan(0x00);
			expect(randomByte).not.toBeGreaterThan(0xff);
			expect(Math.floor(randomByte)).toBe(randomByte);
		});
	});
	test('getRandomByteExcept one', () => {
		Array.from({length: 10}, (_, i) => i).forEach(() => {
			const randomByte = testUtils.getRandomByteExcept([0x42]);
			expect(randomByte).not.toBe(0x42);
			expect(randomByte).not.toBeLessThan(0x00);
			expect(randomByte).not.toBeGreaterThan(0xff);
			expect(Math.floor(randomByte)).toBe(randomByte);
		});
	});
	test('getRandomByteExcept all but one', () => {
		Array.from({length: 10}, (_, i) => i).forEach(() => {
			const randomByte = testUtils.getRandomByteExcept(Array.from({length: 255}, (_, i) => i));
			expect(randomByte).toBe(0xff);
		});
	});
	test('getRandomMessage', () => {
		Array.from({length: 10}, (_, i) => i).forEach(() => {
			const randomMessage = testUtils.getRandomMessage({});
			expect(randomMessage.command).not.toBeLessThan(0x00);
			expect(randomMessage.command).not.toBeGreaterThan(0xff);
			expect(randomMessage.parameters).toEqual([]);
		});
	});
	test('getRandomMessage with numParameters', () => {
		Array.from({length: 10}, (_, i) => i).forEach(() => {
			const numParameters = Math.floor(Math.random() * 3 + 1);
			const randomMessage = testUtils.getRandomMessage({ numParameters: numParameters });
			expect(randomMessage.command).not.toBeLessThan(0x00);
			expect(randomMessage.command).not.toBeGreaterThan(0xff);
			expect(randomMessage.parameters.length).toBe(numParameters);
			expect(randomMessage.parameters[0]).not.toBeLessThan(0x00);
			expect(randomMessage.parameters[0]).not.toBeGreaterThan(0xff);
		});
	});
	test('getRandomMessage with command', () => {
		Array.from({length: 10}, (_, i) => i).forEach(() => {
			const command = testUtils.getRandomByte();
			const randomMessage = testUtils.getRandomMessage({ command: command });
			expect(randomMessage.command).toBe(command);
			expect(randomMessage.parameters).toEqual([]);
		});
	});
	test('getRandomMessage with parameters', () => {
		Array.from({length: 10}, (_, i) => i).forEach(() => {
			const numParameters = Math.floor(Math.random() * 3 + 1);
			const parameters = Array.from({length: numParameters}, (_, i) => i).map(() => testUtils.getRandomByte());
			const randomMessage = testUtils.getRandomMessage({ parameters: parameters });
			expect(randomMessage.command).not.toBeLessThan(0x00);
			expect(randomMessage.command).not.toBeGreaterThan(0xff);
			expect(randomMessage.parameters).toEqual(parameters);
		});
	});
	test('runMock', () => {
		const mockObject: testUtils.Mockable<string> = {
			mocks: {
				existing: (index) => `existing${index}`
			},
			counts: {}
		};
		const getDefaultResult = (index: number) => `default${index}`;

		const resultExisting1 = testUtils.runMock(mockObject, 'existing', getDefaultResult);
		expect(resultExisting1).toBe('existing0');
		expect(mockObject.counts).toEqual({ existing: 1 });

		const resultNonExisting1 = testUtils.runMock(mockObject, 'nonExisting', getDefaultResult);
		expect(resultNonExisting1).toBe('default0');
		expect(mockObject.counts).toEqual({ existing: 1, nonExisting: 1 });

		const resultExisting2 = testUtils.runMock(mockObject, 'existing', getDefaultResult);
		expect(resultExisting2).toBe('existing1');
		expect(mockObject.counts).toEqual({ existing: 2, nonExisting: 1 });

		const resultNonExisting2 = testUtils.runMock(mockObject, 'nonExisting', getDefaultResult);
		expect(resultNonExisting2).toBe('default1');
		expect(mockObject.counts).toEqual({ existing: 2, nonExisting: 2 });

		const resultNonExisting3 = testUtils.runMock(mockObject, 'yetAnother', getDefaultResult);
		expect(resultNonExisting3).toBe('default0');
		expect(mockObject.counts).toEqual({ existing: 2, nonExisting: 2, yetAnother: 1 });
	});
});
