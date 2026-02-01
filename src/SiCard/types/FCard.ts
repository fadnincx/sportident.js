import * as utils from '../../utils';
import type * as siProtocol from '../../siProtocol';
import { BaseSiCard } from '../BaseSiCard';

export class FCard extends BaseSiCard {
	static typeSpecificInstanceFromMessage(_message: siProtocol.SiMessage): FCard | undefined {
		return undefined;
	}

	getMaxReadSteps(): number {
		return 0; // Not implemented
	}

	typeSpecificRead(): Promise<void> {
		return Promise.reject(new utils.NotImplementedError());
	}
}
BaseSiCard.registerNumberRange(14000000, 15000000, FCard);
