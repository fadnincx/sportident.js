import * as utils from '../utils';
import type { ReaderBtCharacteristicId } from './readerBtConstants';
import type { ReaderBtMessage } from './readerBtProtocol';

const logger = utils.getLogger('ReaderBtRequestTask');

// Extend SiError like DeviceClosedError.
export class ReaderBtTimeoutError extends utils.SiError {}
export class ReaderBtDisconnectedError extends utils.SiError {}
// The reader sends nothing for a readout whose card was pulled, so without this the
// request would only fail on its idle timeout.
export class ReaderBtCardRemovedError extends utils.SiError {}

// Further messages a response announces, which belong to the same request.
export interface ReaderBtFollowUps {
	count: number;
	messageIds: number[];
}

export enum ReaderBtRequestTaskState {
	Queued = 0,
	InFlight = 1,
	Succeeded = 2,
	Failed = 3
}

export interface ReaderBtRequestTaskTimeouts {
	totalTimeoutMs: number; // hard deadline for the whole request
	idleTimeoutMs: number; // reset on each arriving segment
}

/** One in-flight Reader BT request. Separate from SiSendTask: the serial correlation
 * predicate lives in SiTargetMultiplexer rather than in the task, and this needs an
 * idle-timeout refresh that the serial path does not. */
export class ReaderBtRequestTask {
	public state: ReaderBtRequestTaskState = ReaderBtRequestTaskState.Queued;
	public response?: ReaderBtMessage;
	public followUps: ReaderBtMessage[] = [];
	private expectedFollowUps?: ReaderBtFollowUps;

	private totalTimer?: ReturnType<typeof setTimeout>;
	private idleTimer?: ReturnType<typeof setTimeout>;

	constructor(
		public readonly characteristic: ReaderBtCharacteristicId,
		public readonly message: ReaderBtMessage,
		// undefined means fire and forget: succeeds once the write resolves
		public readonly expectedResponseMessageId: number | undefined,
		public readonly timeouts: ReaderBtRequestTaskTimeouts,
		private readonly onSucceed: (task: ReaderBtRequestTask) => void,
		private readonly onFail: (task: ReaderBtRequestTask, error: unknown) => void,
		private readonly onProgress?: (receivedBytes: number, totalBytes: number) => void
	) {}

	get isSettled(): boolean {
		return this.state === ReaderBtRequestTaskState.Succeeded || this.state === ReaderBtRequestTaskState.Failed;
	}

	// Called when queued, not when written, so a request on a device that never opens
	// fails instead of hanging forever.
	start(): void {
		this.totalTimer = setTimeout(() => {
			this.fail(new ReaderBtTimeoutError(`Reader BT request 0x${this.message.messageId.toString(16)} timed out`));
		}, this.timeouts.totalTimeoutMs);
	}

	// The idle deadline starts here, so a request queued behind a long transfer is not
	// penalised for waiting.
	markInFlight(): void {
		this.state = ReaderBtRequestTaskState.InFlight;
		this.restartIdleTimer();
	}

	// Refreshes the idle deadline and reports byte progress for a segmented transfer.
	noteProgress(pending?: { receivedBytes: number; totalBytes: number }): void {
		if (this.isSettled) {
			return;
		}
		this.restartIdleTimer();
		if (pending !== undefined && this.onProgress !== undefined) {
			this.onProgress(pending.receivedBytes, pending.totalBytes);
		}
	}

	addResponse(message: ReaderBtMessage, followUps?: ReaderBtFollowUps): void {
		if (this.isSettled) {
			logger.warn('Response for an already settled task', { messageId: message.messageId });
			return;
		}
		this.response = message;
		if (followUps !== undefined && followUps.count > 0) {
			this.expectedFollowUps = followUps;
			this.restartIdleTimer();
			return;
		}
		this.succeed();
	}

	awaitsFollowUp(messageId: number): boolean {
		return !this.isSettled && this.expectedFollowUps !== undefined && this.expectedFollowUps.messageIds.includes(messageId);
	}

	addFollowUp(message: ReaderBtMessage): void {
		this.followUps.push(message);
		if (this.followUps.length >= this.expectedFollowUps!.count) {
			this.succeed();
		}
	}

	succeed(): void {
		if (this.isSettled) {
			return;
		}
		this.clearTimers();
		this.state = ReaderBtRequestTaskState.Succeeded;
		this.onSucceed(this);
	}

	fail(error: unknown): void {
		if (this.isSettled) {
			return;
		}
		this.clearTimers();
		this.state = ReaderBtRequestTaskState.Failed;
		this.onFail(this, error);
	}

	private restartIdleTimer(): void {
		if (this.idleTimer !== undefined) {
			clearTimeout(this.idleTimer);
		}
		this.idleTimer = setTimeout(() => {
			this.fail(new ReaderBtTimeoutError(`Reader BT request 0x${this.message.messageId.toString(16)} stalled`));
		}, this.timeouts.idleTimeoutMs);
	}

	private clearTimers(): void {
		if (this.totalTimer !== undefined) {
			clearTimeout(this.totalTimer);
			this.totalTimer = undefined;
		}
		if (this.idleTimer !== undefined) {
			clearTimeout(this.idleTimer);
			this.idleTimer = undefined;
		}
	}
}
