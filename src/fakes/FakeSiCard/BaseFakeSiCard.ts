import type * as storage from '../../storage';
import type * as siProtocol from '../../siProtocol';

export abstract class BaseFakeSiCard {
	public storage: storage.ISiStorage<unknown> = {} as storage.ISiStorage<unknown>;

	abstract handleDetect(): siProtocol.SiMessage;

	abstract handleRequest(message: siProtocol.SiMessage): siProtocol.SiMessage[];
}
