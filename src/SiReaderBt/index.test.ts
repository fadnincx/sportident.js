import { describe, expect, test } from '@jest/globals';
import { BaseSiCard } from '../SiCard/BaseSiCard';
import * as siReaderBt from './index';

describe('SiReaderBt index', () => {
	test('exports the public surface a consumer needs', () => {
		expect(typeof siReaderBt.SiReaderBtDevice).toEqual('function');
		expect(typeof siReaderBt.ReaderBtConnection).toEqual('function');
		expect(typeof siReaderBt.ReaderBtStation).toEqual('function');
		expect(typeof siReaderBt.ReaderBtCard).toEqual('function');
		expect(typeof siReaderBt.getReaderBtStation).toEqual('function');
		expect(typeof siReaderBt.readoutToRaceResult).toEqual('function');
		expect(typeof siReaderBt.getCardSeriesFromReadout).toEqual('function');
		expect(typeof siReaderBt.isSiReaderBtDriverWithAutodetection).toEqual('function');
		expect(typeof siReaderBt.readerBtProtocol.parseCardReadout).toEqual('function');
		expect(siReaderBt.READER_BT_DEVICE_TYPE).toEqual(0x00a7);
	});

	test('does not export the Web Bluetooth driver, which is a deep import only', () => {
		// It touches navigator.bluetooth, so pulling it into the barrel would drag a
		// Chrome-only DOM reference into every consumer's bundle.
		expect(Object.keys(siReaderBt)).not.toContain('WebBluetoothSiReaderBtDriver');
		expect(Object.keys(siReaderBt)).not.toContain('getWebBluetoothSiReaderBtDriver');
	});

	test('keeps ReaderBtCard out of the shared serial card registry', () => {
		// Registering it would hijack fromCardNumber/detectFromMessage for the serial path.
		expect(BaseSiCard.cardNumberRangeRegistry.values.includes(siReaderBt.ReaderBtCard)).toBe(false);
	});
});
