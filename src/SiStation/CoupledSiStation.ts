import type { ISiDevice, ISiDeviceDriverData } from '../SiDevice/ISiDevice';
import type { ISiStation } from './ISiStation';
import { type ISiTargetMultiplexer, SiTargetMultiplexerTarget } from './ISiTargetMultiplexer';
import { BaseSiStation } from './BaseSiStation';
import { SiTargetMultiplexer } from './SiTargetMultiplexer';
import { proto } from '../constants';
import * as siProtocol from '../siProtocol';
import * as utils from '../utils';
import {
	type SiStationBackupReadEvents,
	SiStationBackupReadStartEvent,
	SiStationBackupReadProgressEvent,
	SiStationBackupReadCompleteEvent,
	SiStationBackupReadErrorEvent
} from './ISiStationEvents';

const logger = utils.getLogger('CoupledSiStation');

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CoupledSiStation extends BaseSiStation<SiTargetMultiplexerTarget.Remote> implements ISiStation<SiTargetMultiplexerTarget.Remote> {
	static fromSiDevice(siDevice: ISiDevice<ISiDeviceDriverData<unknown>>): CoupledSiStation {
		const multiplexer = SiTargetMultiplexer.fromSiDevice(siDevice);
		return this.fromSiTargetMultiplexer(multiplexer);
	}

	static fromSiTargetMultiplexer(multiplexer: ISiTargetMultiplexer): CoupledSiStation {
		return this.fromSiTargetMultiplexerWithGivenTarget(multiplexer, SiTargetMultiplexerTarget.Remote, () => new this(multiplexer, SiTargetMultiplexerTarget.Remote)) as CoupledSiStation;
	}

	async getBackupData(turnOff:boolean=true): Promise<{ code: number, cardNumber: number|undefined ; date: Date | undefined}[]> {
		const backupData: { code: number, cardNumber: number|undefined ; date: Date | undefined}[] = []
		let backupNextWritePointer:number = 0
		let hasMemoryOverflow: boolean = false

		// Emit start event early (totalBytes unknown yet, will be updated)
		this.dispatchEvent('backupReadStart', new SiStationBackupReadStartEvent(this, 0))
		this.dispatchEvent('backupReadProgress', new SiStationBackupReadProgressEvent(this, 0, 0, 0, 0))

		// Get backup pointer
		for(let tries = 0; tries<10 && (backupNextWritePointer == 0 || backupNextWritePointer == undefined); tries++){
			try{
				await this.sendMessage(
					{
						command: proto.cmd.GET_SYS_VAL,
						parameters: [0x1c,0x07]
					},
					1, 10000).then((d) => {
						logger.debug('Backup pointer response', { rawBytes: d[0].map(b => b.toString(16).padStart(2, '0')).join(' ') });
						backupNextWritePointer = (d[0][3]<<24) | (d[0][4]<<16) | (d[0][8]<<8) | d[0][9]
						logger.debug('Parsed backup pointer', { pointer: '0x' + backupNextWritePointer.toString(16), decimal: backupNextWritePointer });
					}).catch(async (_e) => {
						await this.sendMessage(
							{
								command: proto.WAKEUP,
								parameters: []
							})
						await new Promise( resolve => setTimeout(resolve, 500) );
					})
			}catch{ // ignore, try again
			}
		}
		if(backupNextWritePointer == 0 || backupNextWritePointer == undefined){
			const error = new Error("Unable to access coupled si station!")
			this.dispatchEvent('backupReadError', new SiStationBackupReadErrorEvent(this, error))
			return Promise.reject(error)
		}
		// Pointer read successful - emit progress (1%)
		this.dispatchEvent('backupReadProgress', new SiStationBackupReadProgressEvent(this, 0, 0, 0, 1))

		// Read overflow flag with retries
		let overflowReadSuccess = false
		for(let overflowTries = 0; overflowTries < 5 && !overflowReadSuccess; overflowTries++){
			try {
				const overflowResponse = await this.sendMessage(
					{
						command: proto.cmd.GET_SYS_VAL,
						parameters: [0x3d,0x01]
					},
					1, 10000)
				// Response format: [CN1, CN0, ADR, data...] - overflow flag is at index 3
				logger.debug('Overflow flag response', { rawBytes: overflowResponse[0].map((b: number) => b.toString(16).padStart(2, '0')).join(' '), byteAtIndex3: overflowResponse[0][3] });
				hasMemoryOverflow = overflowResponse[0][3] != 0
				logger.debug('Overflow flag parsed', { hasMemoryOverflow });
				overflowReadSuccess = true
			} catch {
				logger.debug('Overflow flag read failed', { attempt: overflowTries + 1 });
				if(overflowTries < 4){
					await new Promise(resolve => setTimeout(resolve, 100));
				}else{
					// All retries failed - assume no overflow
					logger.warn('Unable to read overflow flag after retries, assuming no overflow')
					hasMemoryOverflow = false
				}
			}
		}
		// Overflow flag read complete - emit progress (2%)
		this.dispatchEvent('backupReadProgress', new SiStationBackupReadProgressEvent(this, 0, 0, 0, 2))

		const backupStartLocation = hasMemoryOverflow?backupNextWritePointer+1:0x0100
		let backupReadLocation = backupStartLocation
		const backupMaxLocation = 0x200000
		const totalBytes = hasMemoryOverflow
			? (backupMaxLocation - backupStartLocation) + (backupNextWritePointer - 0x0100)
			: backupNextWritePointer - backupStartLocation
		let backupStorageSize = 128
		let errorRetryCount = 0
		let bytesRead = 0
		const maxRetriesPerBlockSize = 5
		const expectedRecords = Math.floor(totalBytes / proto.REC_LEN)
		logger.debug('Backup read parameters', {
			backupNextWritePointer: '0x' + backupNextWritePointer.toString(16),
			backupStartLocation: '0x' + backupStartLocation.toString(16),
			totalBytes,
			expectedRecords,
			hasMemoryOverflow
		});
		// Emit progress showing we're ready to read data (3%)
		this.dispatchEvent('backupReadProgress', new SiStationBackupReadProgressEvent(this, 0, totalBytes, 0, 3))
		while((hasMemoryOverflow || backupReadLocation < backupNextWritePointer) && backupReadLocation < backupMaxLocation){
			try{
				const endLocation = hasMemoryOverflow ? backupMaxLocation : backupNextWritePointer
				const actualReadLength = Math.min(backupStorageSize, endLocation - backupReadLocation)
				logger.debug('Reading backup block', {
					address: '0x' + backupReadLocation.toString(16),
					length: actualReadLength,
					remaining: backupNextWritePointer - backupReadLocation,
					recordsSoFar: backupData.length
				});
				await this.sendMessage(
					{
						command: proto.cmd.GET_BACKUP,
						parameters: [(backupReadLocation>>16)&0xff,(backupReadLocation>>8)&0xff,backupReadLocation&0xff,actualReadLength]
					}, 
					1, 10000)
					.then((d) => {
						errorRetryCount = 0 // Reset retry counter on success
						const cn = (d[0][0]<<8)|d[0][1]
						const addr = (d[0][2]<<16)|(d[0][3]<<8)|d[0][4]
						let p = 5
						while (p<d[0].length){
							const sicard = siProtocol.arr2cardNumber([d[0][p+2],d[0][p+1],d[0][p+0]])
							const datedata = [
								d[0][p+3]>>2, // Year = bit 7-2 
								(((d[0][p+3]&0x3)<<2)|((d[0][p+4]>>6)&0x3)), // Month = bit 1-0 and 7-6
								((d[0][p+4]>>1)&0x1F), // day = bit 5-1
								(d[0][p+4]&0x1), // am/pm halfday = 0 bit
								d[0][p+5],
								d[0][p+6],
								d[0][p+7]
							]
							const date = siProtocol.arr2date(datedata)
							if(addr+p<=backupNextWritePointer||hasMemoryOverflow){
								backupData.push({code:cn,cardNumber:sicard,date:date})
							}else{
								break
							}
							p+=proto.REC_LEN
						}
						backupReadLocation += actualReadLength
						bytesRead += actualReadLength

						// Rotate to start, if overflow
						if(hasMemoryOverflow && backupReadLocation>=backupMaxLocation){
							hasMemoryOverflow = false
							backupReadLocation=0x0100
						}

						// Scale percentage from 3% (init done) to 100% (complete)
						const percentage = totalBytes > 0 ? Math.round(3 + (bytesRead / totalBytes) * 97) : 3
						this.dispatchEvent('backupReadProgress', new SiStationBackupReadProgressEvent(
							this, bytesRead, totalBytes, backupData.length, percentage
						))
					})
			}catch(e){
				// On error (NAK), retry with delay first, then reduce block size per SI protocol spec
				errorRetryCount++
				logger.debug('Backup read error', {
					address: '0x' + backupReadLocation.toString(16),
					blockSize: backupStorageSize,
					recordsSoFar: backupData.length,
					retryCount: errorRetryCount,
					error: e instanceof Error ? e.message : String(e)
				});

				if(errorRetryCount < maxRetriesPerBlockSize){
					// Retry at same block size with a small delay
					logger.debug('Retrying read', { attempt: errorRetryCount + 1, maxRetries: maxRetriesPerBlockSize });
					await new Promise(resolve => setTimeout(resolve, 100));
				}else if(backupStorageSize >= 2*proto.REC_LEN){
					// Max retries reached, reduce block size
					backupStorageSize/=2
					errorRetryCount = 0
					logger.info('Reducing backup block size', { newSize: backupStorageSize });
				}else{
					// At minimum block size and max retries exhausted
					if(backupData.length > 0){
						// We have some data - might have reached actual end of backup
						logger.info('Backup read stopped at minimum block size', { recordsRead: backupData.length, lastAddress: backupReadLocation });
						break;
					}
					const error = new Error("Unable to read backup data")
					this.dispatchEvent('backupReadError', new SiStationBackupReadErrorEvent(this, error))
					return Promise.reject(error)
				}
			}

		}
		logger.debug('Backup read loop exited', {
			finalAddress: '0x' + backupReadLocation.toString(16),
			targetPointer: '0x' + backupNextWritePointer.toString(16),
			reachedPointer: backupReadLocation >= backupNextWritePointer,
			reachedMaxLocation: backupReadLocation >= backupMaxLocation,
			totalRecords: backupData.length
		});

		// Confirm read end with signal
		await this.sendMessage(
			{
				command: proto.cmd.SIGNAL,
				parameters: [0x2]
			}
		)
		// Turn of unit if requested
		if(turnOff){
			await new Promise( resolve => setTimeout(resolve, 250) );
			for(let tries = 0, hasTurnedOff=false; tries<5&&!hasTurnedOff; tries++){
				await this.sendMessage(
					{
						command: proto.cmd.OFF,
						parameters: []
					}
					,1,10000
				).then(()=>{
					hasTurnedOff = true
				}).catch(_e=>{
					hasTurnedOff = false
				})
			}
		}

		this.dispatchEvent('backupReadComplete', new SiStationBackupReadCompleteEvent(this, backupData.length))
		return backupData
	}
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CoupledSiStation extends utils.EventTarget<SiStationBackupReadEvents> {}
utils.applyMixins(CoupledSiStation, [utils.EventTarget]);
