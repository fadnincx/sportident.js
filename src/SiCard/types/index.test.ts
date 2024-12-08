import { describe, expect, test } from '@jest/globals';
import * as utils from '../../utils';
import type { SiCardSample } from '../ISiCardExamples';
import { BaseSiCard, type SiCardType } from '../BaseSiCard';
import * as siCardIndex from './index';

describe('SiCard index', () => {
	const cardTypesInRegistry = BaseSiCard.cardNumberRangeRegistry.values;
	utils.typedKeys(siCardIndex).forEach((siCardExportName) => {
		const siCardExport = siCardIndex[siCardExportName];
		if (siCardExport.prototype instanceof BaseSiCard) {
			const cardType = siCardExport as SiCardType<BaseSiCard>;
			test(`card type ${siCardExportName} has been registered`, () => {
				expect(cardTypesInRegistry.includes(cardType)).toBe(true);
			});
		} else if (/^get\S+Examples$/.exec(siCardExportName)) {
			const getExamples = siCardExport as () => { [name: string]: SiCardSample };
			test(`card type examples ${siCardExportName} can be retrieved`, () => {
				const value = getExamples()
				expect(typeof value !== 'object' || value === null).toBe(false)
				expect(Object.prototype.toString.call(value) !== '[object Object]').toBe(false)

				const proto = Object.getPrototypeOf(value);
				if(proto != null){
					const Ctor = Object.prototype.hasOwnProperty.call(proto, 'constructor') && proto.constructor;
					expect((
						typeof Ctor === 'function' &&
						Ctor instanceof Ctor && Function.prototype.call(Ctor) === Function.prototype.call(value)
					)).toBe(true)
				}
			});
		} else {
			throw new Error('There are currently no other exports allowed');
		}
	});
});
