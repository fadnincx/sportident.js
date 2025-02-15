import { describe, expect, test } from '@jest/globals';
import { BaseSiCard } from '../BaseSiCard';
import { PCard } from './PCard';

describe('PCard', () => {
	test('is registered', () => {
		expect(BaseSiCard.getTypeByCardNumber(3999999)).not.toEqual(PCard);
		expect(BaseSiCard.getTypeByCardNumber(4000000)).toEqual(PCard);
		expect(BaseSiCard.getTypeByCardNumber(4999999)).toEqual(PCard);
		expect(BaseSiCard.getTypeByCardNumber(5000000)).not.toEqual(PCard);
	});
	test('is not implemented', (done) => {
		const pCard = new PCard(4000000);
		pCard.read().then(
			() => done(new Error('expect reject')),
			() => done()
		);
	});
});
