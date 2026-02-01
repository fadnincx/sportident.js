import { describe, expect, test } from '@jest/globals';
import { proto } from '../../constants';
import type * as siProtocol from '../../siProtocol';
import * as testUtils from '../../testUtils';
import { BaseSiCard } from '../BaseSiCard';
import { SIAC, SIACBatteryStatus } from './SIAC';

describe('SIAC', () => {
	test('is registered', () => {
		expect(BaseSiCard.getTypeByCardNumber(7999999)).not.toEqual(SIAC);
		expect(BaseSiCard.getTypeByCardNumber(8000000)).toEqual(SIAC);
		expect(BaseSiCard.getTypeByCardNumber(8999999)).toEqual(SIAC);
		expect(BaseSiCard.getTypeByCardNumber(9000000)).not.toEqual(SIAC);
	});
	describe('typeSpecificInstanceFromMessage', () => {
		test('works for valid message', () => {
			const instance = SIAC.typeSpecificInstanceFromMessage({
				command: proto.cmd.SI8_DET,
				parameters: [0x00, 0x00, 0x0f, 0x88, 0x88, 0x88]  // SI3=0x0F for SIAC
			});
			if (instance === undefined) {
				throw new Error('expect instance');
			}
			expect(instance instanceof SIAC).toBe(true);
			expect(instance.cardNumber).toBe(8947848);
		});
		test('returns undefined when message has mode', () => {
			expect(
				SIAC.typeSpecificInstanceFromMessage({
					mode: proto.NAK
				})
			).toBe(undefined);
		});
		test('returns undefined when message has wrong command', () => {
			expect(
				SIAC.typeSpecificInstanceFromMessage({
					command: testUtils.getRandomByteExcept([proto.cmd.SI8_DET]),
					parameters: []
				})
			).toBe(undefined);
		});
		test('returns undefined when there are too few parameters', () => {
			expect(
				SIAC.typeSpecificInstanceFromMessage({
					command: proto.cmd.SI8_DET,
					parameters: []
				})
			).toBe(undefined);
		});
		test('returns undefined when the card number does not match', () => {
			expect(
				SIAC.typeSpecificInstanceFromMessage({
					command: proto.cmd.SI8_DET,
					parameters: [0x00, 0x00, 0x0f, 0x77, 0x77, 0x77]  // SI3=0x0F but card number 7829367 is SiCard10 range
				})
			).toBe(undefined);
		});
	});

	const createMockStation = (pages: { [pageNum: number]: number[] }) => ({
		sendMessage: (message: siProtocol.SiMessage, numResponses?: number) => {
			if (message.mode !== undefined) {
				return Promise.reject(new Error('message mode is not undefined'));
			}
			const { command, parameters } = message;
			expect(numResponses).toBe(1);

			if (command === proto.cmd.SET_SI8) {
				// Battery measurement request
				return Promise.resolve([[0x00, 0x01, 0x7e]]);
			}

			expect(command).toBe(proto.cmd.GET_SI8);
			const pageNumber = parameters[0];
			const pageData = pages[pageNumber] || Array(128).fill(0);
			return Promise.resolve([[0x00, 0x00, pageNumber, ...pageData]]);
		}
	});

	test('reads basic data', (done) => {
		const mySIAC = new SIAC(8500000);
		mySIAC.mainStation = createMockStation({});
		mySIAC.typeSpecificRead().then(() => {
			expect(mySIAC.raceResult.cardNumber).toBe(0);
			expect(mySIAC.raceResult.punches).toEqual([]);
			expect(mySIAC.punchCount).toBe(0);
			done();
		});
	});

	describe('production and version fields', () => {
		const createPage0WithProduction = (month: number, year: number): number[] => {
			const page = Array(128).fill(0);
			page[0x1c] = month;     // 0x1c - production month
			page[0x1d] = year;      // 0x1d - production year (offset from 2000)
			return page;
		};

		const createPage3WithVersions = (hwMajor: number, hwMinor: number, swMajor: number, swMinor: number): number[] => {
			const page = Array(128).fill(0);
			page[0x40] = hwMajor;   // 0x1c0 - 0x180 = 0x40
			page[0x41] = hwMinor;   // 0x1c1 - 0x180 = 0x41
			page[0x42] = swMajor;   // 0x1c2 - 0x180 = 0x42
			page[0x43] = swMinor;   // 0x1c3 - 0x180 = 0x43
			return page;
		};

		test('reads production date', (done) => {
			const mySIAC = new SIAC(8500000);
			const page0 = createPage0WithProduction(6, 21); // June 2021
			mySIAC.mainStation = createMockStation({ 0: page0 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.productionMonth).toBe(6);
				expect(mySIAC.productionYear).toBe(21);
				const prodDate = mySIAC.getProductionDate();
				expect(prodDate).toBeDefined();
				expect(prodDate!.getFullYear()).toBe(2021);
				expect(prodDate!.getMonth()).toBe(5); // June is month 5 (0-indexed)
				done();
			});
		});

		test('returns undefined for zero production date', (done) => {
			const mySIAC = new SIAC(8500000);
			const page0 = createPage0WithProduction(0, 0);
			mySIAC.mainStation = createMockStation({ 0: page0 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.getProductionDate()).toBeUndefined();
				done();
			});
		});

		test('reads hardware version', (done) => {
			const mySIAC = new SIAC(8500000);
			const page3 = createPage3WithVersions(1, 6, 0, 0); // HW 1.6
			mySIAC.mainStation = createMockStation({ 3: page3 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.hardwareVersionMajor).toBe(1);
				expect(mySIAC.hardwareVersionMinor).toBe(6);
				expect(mySIAC.getHardwareVersion()).toBe('1.6');
				done();
			});
		});

		test('reads software version', (done) => {
			const mySIAC = new SIAC(8500000);
			const page3 = createPage3WithVersions(0, 0, 4, 3); // SW 4.3
			mySIAC.mainStation = createMockStation({ 3: page3 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.softwareVersionMajor).toBe(4);
				expect(mySIAC.softwareVersionMinor).toBe(3);
				expect(mySIAC.getSoftwareVersion()).toBe('4.3');
				done();
			});
		});

		test('reads all version fields together', (done) => {
			const mySIAC = new SIAC(8500000);
			const page0 = createPage0WithProduction(6, 21);
			const page3 = createPage3WithVersions(1, 6, 4, 3);
			mySIAC.mainStation = createMockStation({ 0: page0, 3: page3 });
			mySIAC.typeSpecificRead().then(() => {
				// Production date
				expect(mySIAC.getProductionDate()!.getFullYear()).toBe(2021);
				expect(mySIAC.getProductionDate()!.getMonth()).toBe(5);
				// Hardware version
				expect(mySIAC.getHardwareVersion()).toBe('1.6');
				// Software version
				expect(mySIAC.getSoftwareVersion()).toBe('4.3');
				done();
			});
		});
	});

	describe('battery fields', () => {
		// Default reference voltage: 2.44V = 1.9 + (6 * 0.09)
		const DEFAULT_REF_V_RAW = 0x06;

		const createPage3WithBattery = (year: number, month: number, day: number, voltageRaw: number, status: number, refV: number = DEFAULT_REF_V_RAW): number[] => {
			const page = Array(128).fill(0);
			page[0x3c] = year;       // 0x1bc - 0x180 = 0x3c
			page[0x3d] = month;      // 0x1bd - 0x180 = 0x3d
			page[0x3e] = day;        // 0x1be - 0x180 = 0x3e
			page[0x47] = voltageRaw; // 0x1c7 - 0x180 = 0x47 (single byte)
			page[0x54] = refV;       // 0x1d4 - 0x180 = 0x54
			page[0x55] = status;     // 0x1d5 - 0x180 = 0x55
			return page;
		};

		test('reads battery date', (done) => {
			const mySIAC = new SIAC(8500000);
			const page3 = createPage3WithBattery(26, 6, 15, 0, 0);
			mySIAC.mainStation = createMockStation({ 3: page3 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.batteryDate).toBeDefined();
				expect(mySIAC.batteryDate!.getFullYear()).toBe(2026);
				expect(mySIAC.batteryDate!.getMonth()).toBe(5);
				expect(mySIAC.batteryDate!.getDate()).toBe(15);
				done();
			});
		});

		test('returns undefined for zero battery date', (done) => {
			const mySIAC = new SIAC(8500000);
			const page3 = createPage3WithBattery(0, 0, 0, 0, 0);
			mySIAC.mainStation = createMockStation({ 3: page3 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.batteryDate).toBeUndefined();
				done();
			});
		});

		test('reads battery voltage raw value', (done) => {
			const mySIAC = new SIAC(8500000);
			const page3 = createPage3WithBattery(26, 1, 1, 0x0B, 0); // 0x0B → 2.89V
			mySIAC.mainStation = createMockStation({ 3: page3 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.batteryVoltage).toBe(0x0B);
				done();
			});
		});

		test('converts battery voltage to volts', (done) => {
			const mySIAC = new SIAC(8500000);
			const page3 = createPage3WithBattery(26, 1, 1, 0x0B, 0); // 0x0B → 2.89V
			mySIAC.mainStation = createMockStation({ 3: page3 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.getBatteryVoltageV()).toBeCloseTo(2.89, 2);
				done();
			});
		});

		test('reads battery status OK', (done) => {
			const mySIAC = new SIAC(8500000);
			const page3 = createPage3WithBattery(26, 1, 1, 0, SIACBatteryStatus.OK);
			mySIAC.mainStation = createMockStation({ 3: page3 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.batteryStatus).toBe('OK');
				done();
			});
		});

		test('reads battery status LOW', (done) => {
			const mySIAC = new SIAC(8500000);
			const page3 = createPage3WithBattery(26, 1, 1, 0, SIACBatteryStatus.LOW);
			mySIAC.mainStation = createMockStation({ 3: page3 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.batteryStatus).toBe('LOW');
				done();
			});
		});

		test('reads battery reference voltage with default 2.44V', (done) => {
			const mySIAC = new SIAC(8500000);
			const page3 = createPage3WithBattery(26, 1, 1, 0x0B, 0); // uses default refV
			mySIAC.mainStation = createMockStation({ 3: page3 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.batteryRefV).toBe(0x06);
				expect(mySIAC.getBatteryRefVoltageV()).toBeCloseTo(2.44, 2);
				done();
			});
		});

		test('reads all battery fields together', (done) => {
			const mySIAC = new SIAC(8500000);
			const page3 = createPage3WithBattery(24, 3, 20, 0x0D, SIACBatteryStatus.OK); // 0x0D → 3.07V, default refV 2.44V
			mySIAC.mainStation = createMockStation({ 3: page3 });
			mySIAC.typeSpecificRead().then(() => {
				expect(mySIAC.batteryDate).toBeDefined();
				expect(mySIAC.batteryDate!.getFullYear()).toBe(2024);
				expect(mySIAC.batteryDate!.getMonth()).toBe(2);
				expect(mySIAC.batteryDate!.getDate()).toBe(20);
				expect(mySIAC.batteryVoltage).toBe(0x0D);
				expect(mySIAC.getBatteryVoltageV()).toBeCloseTo(3.07, 2);
				expect(mySIAC.batteryRefV).toBe(0x06);
				expect(mySIAC.getBatteryRefVoltageV()).toBeCloseTo(2.44, 2);
				expect(mySIAC.batteryStatus).toBe('OK');
				done();
			});
		});
	});

	test('getMaxReadSteps returns 8', () => {
		const mySIAC = new SIAC(8500000);
		expect(mySIAC.getMaxReadSteps()).toBe(8);
	});

	test('populates raceResult.siac with SIAC-specific data', (done) => {
		const mySIAC = new SIAC(8500000);
		// Set up page 0 with production date
		const page0 = Array(128).fill(0);
		page0[0x1c] = 6;   // production month
		page0[0x1d] = 21;  // production year (2021)
		// Set up page 3 with version and battery data
		const page3 = Array(128).fill(0);
		page3[0x40] = 1;   // hw major
		page3[0x41] = 6;   // hw minor
		page3[0x42] = 4;   // sw major
		page3[0x43] = 3;   // sw minor
		page3[0x3c] = 24;  // battery year
		page3[0x3d] = 3;   // battery month
		page3[0x3e] = 20;  // battery day
		page3[0x47] = 0x0B; // battery voltage raw (2.89V)
		page3[0x54] = 0x06; // battery ref raw (2.44V - default threshold)
		page3[0x55] = 0xaa; // battery status OK

		mySIAC.mainStation = createMockStation({ 0: page0, 3: page3 });
		mySIAC.typeSpecificRead().then(() => {
			expect(mySIAC.raceResult.siac).toBeDefined();
			// Production date
			expect(mySIAC.raceResult.siac!.productionDate!.getFullYear()).toBe(2021);
			expect(mySIAC.raceResult.siac!.productionDate!.getMonth()).toBe(5);
			// Versions
			expect(mySIAC.raceResult.siac!.hardwareVersion).toBe('1.6');
			expect(mySIAC.raceResult.siac!.softwareVersion).toBe('4.3');
			// Battery
			expect(mySIAC.raceResult.siac!.battery).toBeDefined();
			expect(mySIAC.raceResult.siac!.battery!.date!.getFullYear()).toBe(2024);
			expect(mySIAC.raceResult.siac!.battery!.voltage).toBeCloseTo(2.89, 2);
			expect(mySIAC.raceResult.siac!.battery!.referenceVoltage).toBeCloseTo(2.44, 2);
			expect(mySIAC.raceResult.siac!.battery!.status).toBe('OK');
			done();
		});
	});
});
