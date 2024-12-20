import { describe, expect, test } from '@jest/globals';
import * as testUtils from '../testUtils';
import type { ISiDevice, ISiDeviceDriverData } from '../SiDevice/ISiDevice';
import type { ISiDeviceDriver } from '../SiDevice/ISiDeviceDriver';
import { SiDevice } from '../SiDevice/SiDevice';
import { SiTargetMultiplexerTarget } from './ISiTargetMultiplexer';
import { CoupledSiStation } from './CoupledSiStation';
import { SiTargetMultiplexer } from './SiTargetMultiplexer';

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
});
