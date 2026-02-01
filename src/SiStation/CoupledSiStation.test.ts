import { describe, expect, test } from '@jest/globals';
import * as testUtils from '../testUtils';
import type { ISiDevice, ISiDeviceDriverData } from '../SiDevice/ISiDevice';
import type { ISiDeviceDriver } from '../SiDevice/ISiDeviceDriver';
import { SiDevice } from '../SiDevice/SiDevice';
import { SiTargetMultiplexerTarget, type ISiTargetMultiplexer } from './ISiTargetMultiplexer';
import { CoupledSiStation } from './CoupledSiStation';
import { SiTargetMultiplexer } from './SiTargetMultiplexer';
import { proto } from '../constants';
import type { SiMessageWithoutMode } from '../siProtocol';

testUtils.useFakeTimers();

function mockDriver(driver: Partial<ISiDeviceDriver<ISiDeviceDriverData<unknown>>>) {
	return driver as unknown as ISiDeviceDriver<ISiDeviceDriverData<unknown>>;
}

describe('CoupledSiStation', () => {
	test('fromSiDevice', () => {
		const fakeSiDevice = new SiDevice('fromSiDevice', {
			driver: mockDriver({ name: 'FakeSiDevice' })
		});
		const myCoupledStation1 = CoupledSiStation.fromSiDevice(fakeSiDevice);
		expect(myCoupledStation1 instanceof CoupledSiStation).toBe(true);
		expect(myCoupledStation1.ident).toBe('Remote-FakeSiDevice-fromSiDevice');
		expect(myCoupledStation1.multiplexerTarget).toBe(SiTargetMultiplexerTarget.Remote);
		const myCoupledStation2 = CoupledSiStation.fromSiDevice(fakeSiDevice);
		expect(myCoupledStation2).toBe(myCoupledStation1);
		expect(myCoupledStation2.ident).toBe('Remote-FakeSiDevice-fromSiDevice');
		expect(myCoupledStation2.multiplexerTarget).toBe(SiTargetMultiplexerTarget.Remote);
	});
	test('fromSiTargetMultiplexer', () => {
		const myTargetMultiplexer = new SiTargetMultiplexer({ ident: 'fake-ident' } as ISiDevice<ISiDeviceDriverData<unknown>>);
		const myCoupledStation1 = CoupledSiStation.fromSiTargetMultiplexer(myTargetMultiplexer);
		expect(myCoupledStation1 instanceof CoupledSiStation).toBe(true);
		expect(myCoupledStation1.ident).toBe('Remote-fake-ident');
		expect(myCoupledStation1.multiplexerTarget).toBe(SiTargetMultiplexerTarget.Remote);
		const myCoupledStation2 = CoupledSiStation.fromSiTargetMultiplexer(myTargetMultiplexer);
		expect(myCoupledStation2).toBe(myCoupledStation1);
		expect(myCoupledStation2.ident).toBe('Remote-fake-ident');
		expect(myCoupledStation2.multiplexerTarget).toBe(SiTargetMultiplexerTarget.Remote);
	});

	describe('getBackupData', () => {
		const createMockMultiplexer = (
			sendMessageImpl: (target: SiTargetMultiplexerTarget, message: SiMessageWithoutMode) => Promise<number[][]>
		): ISiTargetMultiplexer => ({
			siDevice: { ident: 'mock-device' } as ISiDevice<ISiDeviceDriverData<unknown>>,
			stations: {},
			sendMessage: sendMessageImpl
		} as unknown as ISiTargetMultiplexer);

		const createBackupPointerResponse = (pointer: number): number[] => [
			0x00, 0x00, 0x1c,
			(pointer >> 24) & 0xff, (pointer >> 16) & 0xff,
			0x00, 0x00, 0x00,
			(pointer >> 8) & 0xff, pointer & 0xff
		];

		const createOverflowResponse = (hasOverflow: boolean): number[] => [
			0x00, 0x00, 0x3d, hasOverflow ? 0x01 : 0x00
		];

		interface BackupRecordDate {
			year: number;
			month: number;
			day: number;
			hours: number;
			minutes: number;
			seconds: number;
			subseconds: number;
		}

		const createBackupRecord = (cardNumber: number, date: BackupRecordDate | null): number[] => {
			const si0 = cardNumber & 0xff;
			const si1 = (cardNumber >> 8) & 0xff;
			const si2 = (cardNumber >> 16) & 0xff;

			if (date === null) {
				return [si2, si1, si0, 0x00, 0x00, 0x00, 0x00, 0x00];
			}

			const halfday = date.hours >= 12 ? 1 : 0;
			const hours12 = date.hours % 12;
			const time12Seconds = hours12 * 3600 + date.minutes * 60 + date.seconds;

			const dateData3 = (date.year << 2) | ((date.month >> 2) & 0x03);
			const dateData4 = ((date.month & 0x03) << 6) | (date.day << 1) | halfday;
			const timeHigh = (time12Seconds >> 8) & 0xff;
			const timeLow = time12Seconds & 0xff;

			return [si2, si1, si0, dateData3, dateData4, timeHigh, timeLow, date.subseconds];
		};

		const date = (
			year: number, month: number, day: number,
			hours: number, minutes: number, seconds: number, subseconds: number
		): BackupRecordDate => ({ year, month, day, hours, minutes, seconds, subseconds });

		const expectDateMatch = (parsed: Date | undefined, expected: BackupRecordDate) => {
			expect(parsed).toBeDefined();
			if (!parsed) return;
			expect(parsed.getFullYear()).toBe(2000 + expected.year);
			expect(parsed.getMonth() + 1).toBe(expected.month);
			expect(parsed.getDate()).toBe(expected.day);
			expect(parsed.getHours()).toBe(expected.hours);
			expect(parsed.getMinutes()).toBe(expected.minutes);
			expect(parsed.getSeconds()).toBe(expected.seconds);
			const expectedMs = Math.floor((expected.subseconds * 1000) / 256);
			expect(parsed.getMilliseconds()).toBe(expectedMs);
		};

		const createBackupDataResponse = (address: number, records: number[][]): number[] => [
			0x00, 0x31,
			(address >> 16) & 0xff, (address >> 8) & 0xff, address & 0xff,
			...records.flat()
		];

		test('reads multiple records with correct dates and order', async () => {
			const dates = [
				date(26, 3, 15, 10, 30, 45, 128),
				date(26, 3, 15, 10, 31, 12, 64),
				date(26, 3, 15, 10, 31, 55, 192),
				date(26, 3, 15, 10, 32, 33, 32),
				date(26, 3, 15, 10, 33, 8, 255),
			];
			const cardNumbers = [1234567, 2345678, 3456789, 4567890, 5678901];
			const backupPointer = 0x0100 + dates.length * proto.REC_LEN;

			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					const records = cardNumbers.map((cn, i) => createBackupRecord(cn, dates[i]));
					return [createBackupDataResponse(0x0100, records)];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			await testUtils.advanceTimersByTimeAsync(300);
			const result = await resultPromise;

			expect(result.length).toBe(5);
			for (let i = 0; i < 5; i++) {
				expect(result[i].cardNumber).toBe(cardNumbers[i]);
				expectDateMatch(result[i].date, dates[i]);
			}
		});

		test('handles records with invalid date', async () => {
			const validD = date(26, 6, 20, 14, 45, 30, 100);
			const backupPointer = 0x0100 + 16;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					return [createBackupDataResponse(0x0100, [
						createBackupRecord(1234567, validD),
						createBackupRecord(2345678, null)
					])];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			await testUtils.advanceTimersByTimeAsync(300);
			const result = await resultPromise;

			expect(result.length).toBe(2);
			expect(result[0].cardNumber).toBe(1234567);
			expectDateMatch(result[0].date, validD);
			expect(result[1].cardNumber).toBe(2345678);
			expect(result[1].date).toBeUndefined();
		});

		test('emits progress events', async () => {
			const d1 = date(26, 1, 10, 9, 0, 0, 0);
			const d2 = date(26, 1, 10, 9, 0, 1, 50);
			const backupPointer = 0x0100 + 16;
			const progressEvents: number[] = [];
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					return [createBackupDataResponse(0x0100, [
						createBackupRecord(1111111, d1),
						createBackupRecord(2222222, d2)
					])];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			station.addEventListener('backupReadProgress', (e) => progressEvents.push(e.percentage));

			const resultPromise = station.getBackupData();
			await testUtils.advanceTimersByTimeAsync(300);
			await resultPromise;

			expect(progressEvents.length).toBeGreaterThan(0);
			expect(progressEvents[0]).toBe(0);
			expect(progressEvents[progressEvents.length - 1]).toBe(100);
		});

		test('emits start and complete events', async () => {
			const d = date(26, 5, 1, 8, 15, 0, 200);
			const backupPointer = 0x0100 + 8;
			let startReceived = false;
			let completeRecords = 0;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					return [createBackupDataResponse(0x0100, [createBackupRecord(1234567, d)])];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			station.addEventListener('backupReadStart', () => { startReceived = true; });
			station.addEventListener('backupReadComplete', (e) => { completeRecords = e.totalRecords; });

			const resultPromise = station.getBackupData();
			await testUtils.advanceTimersByTimeAsync(300);
			await resultPromise;

			expect(startReceived).toBe(true);
			expect(completeRecords).toBe(1);
		});

		test('retries backup pointer read on failure', async () => {
			const d = date(26, 2, 28, 16, 0, 0, 10);
			const backupPointer = 0x0100 + 8;
			let pointerAttempts = 0;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					pointerAttempts++;
					if (pointerAttempts <= 3) throw new Error('fail');
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					return [createBackupDataResponse(0x0100, [createBackupRecord(1234567, d)])];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			for (let i = 0; i < 10; i++) await testUtils.advanceTimersByTimeAsync(500);
			const result = await resultPromise;

			expect(pointerAttempts).toBeGreaterThan(1);
			expect(result.length).toBe(1);
		});

		test('retries overflow flag read on failure', async () => {
			const d = date(26, 7, 4, 12, 30, 0, 80);
			const backupPointer = 0x0100 + 8;
			let overflowAttempts = 0;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					overflowAttempts++;
					if (overflowAttempts <= 2) throw new Error('fail');
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					return [createBackupDataResponse(0x0100, [createBackupRecord(1234567, d)])];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			for (let i = 0; i < 5; i++) await testUtils.advanceTimersByTimeAsync(100);
			await testUtils.advanceTimersByTimeAsync(300);
			const result = await resultPromise;

			expect(overflowAttempts).toBeGreaterThan(1);
			expect(result.length).toBe(1);
		});

		test('retries data block before reducing block size', async () => {
			const d = date(26, 8, 15, 7, 45, 30, 150);
			const backupPointer = 0x0100 + 8;
			let attempts = 0;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					attempts++;
					if (attempts <= 3) throw new Error('NAK');
					return [createBackupDataResponse(0x0100, [createBackupRecord(1234567, d)])];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			for (let i = 0; i < 6; i++) await testUtils.advanceTimersByTimeAsync(100);
			const result = await resultPromise;

			expect(attempts).toBeGreaterThan(1);
			expect(result.length).toBe(1);
		});

		test('reduces block size after max retries', async () => {
			const d = date(26, 9, 1, 11, 11, 11, 111);
			const backupPointer = 0x0100 + 256;
			let attempts = 0;
			const blockSizes: number[] = [];
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					attempts++;
					blockSizes.push(message.parameters[3]);
					if (attempts <= 6) throw new Error('NAK');
					return [createBackupDataResponse(0x0100, [createBackupRecord(1234567, d)])];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			for (let i = 0; i < 20; i++) await testUtils.advanceTimersByTimeAsync(100);
			const result = await resultPromise;

			const uniqueSizes = [...new Set(blockSizes)];
			expect(uniqueSizes.length).toBeGreaterThan(1);
			expect(result.length).toBeGreaterThanOrEqual(1);
		});

		test('rejects when station cannot be accessed', async () => {
			let errorReceived = false;
			let caughtError: Error | undefined;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					throw new Error('fail');
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			station.addEventListener('backupReadError', () => { errorReceived = true; });

			const resultPromise = station.getBackupData().catch((err: Error) => { caughtError = err; });
			for (let i = 0; i < 25; i++) await testUtils.advanceTimersByTimeAsync(500);
			await resultPromise;

			expect(caughtError?.message).toBe('Unable to access coupled si station!');
			expect(errorReceived).toBe(true);
		});

		test('rejects when backup data cannot be read', async () => {
			const backupPointer = 0x0100 + 8;
			let errorReceived = false;
			let caughtError: Error | undefined;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					throw new Error('NAK');
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			station.addEventListener('backupReadError', () => { errorReceived = true; });

			const resultPromise = station.getBackupData().catch((err: Error) => { caughtError = err; });
			for (let i = 0; i < 100; i++) await testUtils.advanceTimersByTimeAsync(100);
			await resultPromise;

			expect(caughtError?.message).toBe('Unable to read backup data');
			expect(errorReceived).toBe(true);
		});

		test('turnOff=false does not send OFF command', async () => {
			const d = date(26, 10, 31, 23, 59, 59, 255);
			const backupPointer = 0x0100 + 8;
			let offReceived = false;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					return [createBackupDataResponse(0x0100, [createBackupRecord(1234567, d)])];
				}
				if (message.command === proto.cmd.OFF) {
					offReceived = true;
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData(false);
			await testUtils.runPromises();
			await resultPromise;

			expect(offReceived).toBe(false);
		});

		test('turnOff=true sends OFF command', async () => {
			const d = date(26, 11, 11, 11, 11, 11, 11);
			const backupPointer = 0x0100 + 8;
			let offReceived = false;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					return [createBackupDataResponse(0x0100, [createBackupRecord(1234567, d)])];
				}
				if (message.command === proto.cmd.OFF) {
					offReceived = true;
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			await testUtils.advanceTimersByTimeAsync(300);
			await resultPromise;

			expect(offReceived).toBe(true);
		});

		test('returns empty array when no data', async () => {
			const backupPointer = 0x0100;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			await testUtils.advanceTimersByTimeAsync(300);
			const result = await resultPromise;

			expect(result.length).toBe(0);
		});

		test('reads overflow flag from station', async () => {
			const d = date(26, 12, 25, 0, 0, 0, 1);
			const backupPointer = 0x0118;
			let overflowRequested = false;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					overflowRequested = true;
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					return [createBackupDataResponse(0x0100, [createBackupRecord(1234567, d)])];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			await testUtils.advanceTimersByTimeAsync(300);
			await resultPromise;

			expect(overflowRequested).toBe(true);
		});

		test('assumes no overflow when flag read fails', async () => {
			const d = date(26, 1, 1, 0, 0, 1, 128);
			const backupPointer = 0x0100 + 8;
			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					throw new Error('fail');
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					return [createBackupDataResponse(0x0100, [createBackupRecord(1234567, d)])];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			for (let i = 0; i < 10; i++) await testUtils.advanceTimersByTimeAsync(100);
			await testUtils.advanceTimersByTimeAsync(300);
			const result = await resultPromise;

			expect(result.length).toBe(1);
		});

		test('reads many records across multiple chunks with correct order', async () => {
			const records: { cardNumber: number; date: BackupRecordDate }[] = [];
			for (let i = 0; i < 20; i++) {
				records.push({
					cardNumber: 1000000 + i,
					date: date(26, 6, 15, 10, i, i * 2, i * 10)
				});
			}
			const backupPointer = 0x0100 + records.length * proto.REC_LEN;

			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					const addr = (message.parameters[0] << 16) | (message.parameters[1] << 8) | message.parameters[2];
					const len = message.parameters[3];
					const startIndex = (addr - 0x0100) / proto.REC_LEN;
					const numRecords = len / proto.REC_LEN;
					const chunk = records.slice(startIndex, startIndex + numRecords);
					const bytes = chunk.map(r => createBackupRecord(r.cardNumber, r.date));
					return [createBackupDataResponse(addr, bytes)];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			await testUtils.advanceTimersByTimeAsync(300);
			const result = await resultPromise;

			expect(result.length).toBe(20);
			for (let i = 0; i < 20; i++) {
				expect(result[i].cardNumber).toBe(records[i].cardNumber);
				expectDateMatch(result[i].date, records[i].date);
			}
		});

		test('reads wraparound data with overflow=true', async () => {
			const backupMaxLocation = 0x200000;
			const recordsAfterWrap = 5;
			const recordsBeforeWrap = 3;
			const backupPointer = 0x0100 + recordsAfterWrap * proto.REC_LEN;

			const allRecords: { cardNumber: number; date: BackupRecordDate; address: number }[] = [];
			for (let i = 0; i < recordsBeforeWrap; i++) {
				allRecords.push({
					cardNumber: 2000000 + i,
					date: date(26, 6, 1, 9, i, 0, i * 30),
					address: backupMaxLocation - (recordsBeforeWrap - i) * proto.REC_LEN
				});
			}
			for (let i = 0; i < recordsAfterWrap; i++) {
				allRecords.push({
					cardNumber: 3000000 + i,
					date: date(26, 6, 1, 10, i, 0, i * 30),
					address: 0x0100 + i * proto.REC_LEN
				});
			}

			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(true)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					const addr = (message.parameters[0] << 16) | (message.parameters[1] << 8) | message.parameters[2];
					const len = message.parameters[3];
					const matchingRecords = allRecords.filter(r => r.address >= addr && r.address < addr + len);
					const bytes = matchingRecords.map(r => createBackupRecord(r.cardNumber, r.date));
					return [createBackupDataResponse(addr, bytes)];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			for (let i = 0; i < 50; i++) await testUtils.advanceTimersByTimeAsync(100);
			const result = await resultPromise;

			expect(result.length).toBe(recordsBeforeWrap + recordsAfterWrap);
			for (let i = 0; i < allRecords.length; i++) {
				expect(result[i].cardNumber).toBe(allRecords[i].cardNumber);
				expectDateMatch(result[i].date, allRecords[i].date);
			}
		});

		test('PM times are parsed correctly', async () => {
			const pmDate = date(26, 4, 20, 14, 30, 45, 200);
			const amDate = date(26, 4, 20, 2, 30, 45, 200);
			const backupPointer = 0x0100 + 16;

			const multiplexer = createMockMultiplexer(async (_target, message) => {
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x1c) {
					return [createBackupPointerResponse(backupPointer)];
				}
				if (message.command === proto.cmd.GET_SYS_VAL && message.parameters[0] === 0x3d) {
					return [createOverflowResponse(false)];
				}
				if (message.command === proto.cmd.GET_BACKUP) {
					return [createBackupDataResponse(0x0100, [
						createBackupRecord(1111111, amDate),
						createBackupRecord(2222222, pmDate)
					])];
				}
				return [[]];
			});

			const station = new CoupledSiStation(multiplexer, SiTargetMultiplexerTarget.Remote);
			const resultPromise = station.getBackupData();
			await testUtils.advanceTimersByTimeAsync(300);
			const result = await resultPromise;

			expect(result.length).toBe(2);
			expectDateMatch(result[0].date, amDate);
			expectDateMatch(result[1].date, pmDate);
			expect(result[0].date!.getHours()).toBe(2);
			expect(result[1].date!.getHours()).toBe(14);
		});
	});
});
