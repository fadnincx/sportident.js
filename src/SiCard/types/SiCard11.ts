import type * as siProtocol from '../../siProtocol';
import { ModernSiCard } from './ModernSiCard';
import { BaseSiCard } from '../BaseSiCard';

export class SiCard11 extends ModernSiCard {
	static typeSpecificInstanceFromMessage(message: siProtocol.SiMessage): SiCard11 | undefined {
		const info = this.parseModernSiCardDetectionMessage(message);
		if (info === undefined) {
			return undefined;
		}
		if (info.cardSeries !== 'SiCard11') {
			return undefined;
		}
		return new this(info.cardNumber);
	}
}
BaseSiCard.registerNumberRange(9000000, 10000000, SiCard11);
