import {describe, expect, test} from '@jest/globals';
import * as index from './index';

describe('sportident-webserial', () => {
    test('fake test', () => {
        expect(index.getWebSerialSiDeviceDriver).not.toBe(undefined);
    });
});
