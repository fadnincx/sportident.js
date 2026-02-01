import * as utils from '../utils';
import type { ISiStation } from './ISiStation';
import type { SiTargetMultiplexerTarget } from './ISiTargetMultiplexer';

export class SiStationBackupReadStartEvent extends utils.Event<'backupReadStart'> {
	constructor(public siStation: ISiStation<SiTargetMultiplexerTarget>, public totalBytes: number) {
		super();
	}
}

export class SiStationBackupReadProgressEvent extends utils.Event<'backupReadProgress'> {
	constructor(
		public siStation: ISiStation<SiTargetMultiplexerTarget>,
		public bytesRead: number,
		public totalBytes: number,
		public recordsRead: number,
		public percentage: number
	) {
		super();
	}
}

export class SiStationBackupReadCompleteEvent extends utils.Event<'backupReadComplete'> {
	constructor(public siStation: ISiStation<SiTargetMultiplexerTarget>, public totalRecords: number) {
		super();
	}
}

export class SiStationBackupReadErrorEvent extends utils.Event<'backupReadError'> {
	constructor(public siStation: ISiStation<SiTargetMultiplexerTarget>, public error: Error) {
		super();
	}
}

export type SiStationBackupReadEvents = {
	backupReadStart: SiStationBackupReadStartEvent;
	backupReadProgress: SiStationBackupReadProgressEvent;
	backupReadComplete: SiStationBackupReadCompleteEvent;
	backupReadError: SiStationBackupReadErrorEvent;
};
