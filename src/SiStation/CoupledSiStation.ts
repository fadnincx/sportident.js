import type { ISiDevice, ISiDeviceDriverData } from '../SiDevice/ISiDevice';
import type { ISiStation } from './ISiStation';
import { type ISiTargetMultiplexer, SiTargetMultiplexerTarget } from './ISiTargetMultiplexer';
import { BaseSiStation } from './BaseSiStation';
import { SiTargetMultiplexer } from './SiTargetMultiplexer';
import { proto } from '../constants';
import * as siProtocol from '../siProtocol';
import * as utils from '../utils';

const logger = utils.getLogger('CoupledSiStation');

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

		// Get backup pointer
		for(let tries = 0; tries<10 && (backupNextWritePointer == 0 || backupNextWritePointer == undefined); tries++){
			try{
				await this.sendMessage(
					{
						command: proto.cmd.GET_SYS_VAL,
						parameters: [0x1c,0x07]
					}, 
					1, 10000).then((d) => {
						backupNextWritePointer = (d[0][3]<<24) | (d[0][4]<<16) | (d[0][8]<<8) | d[0][9]
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
			return Promise.reject(new Error("Unable to access coupled si station!"))
		}
		await this.sendMessage(
			{
				command: proto.cmd.GET_SYS_VAL,
				parameters: [0x3d,0x01]
			}, 
			1, 10000).then((d) => {
				hasMemoryOverflow = d[0][0] != 0
			}).catch(async (_e) => {
				return Promise.reject(new Error("Unable to read if backup is overflowed or not!"))
			})
		
		let backupReadLocation = hasMemoryOverflow?backupNextWritePointer+1:0x0100
		const backupMaxLocation = 0x200000
		let backupStorageSize = 128
		while(backupReadLocation < backupNextWritePointer && backupReadLocation < backupMaxLocation){
			try{
				const actualReadLength = Math.min(backupStorageSize,backupNextWritePointer-backupReadLocation)
				await this.sendMessage(
					{
						command: proto.cmd.GET_BACKUP,
						parameters: [(backupReadLocation>>16)&0xff,(backupReadLocation>>8)&0xff,backupReadLocation&0xff,actualReadLength]
					}, 
					1, 10000)
					.then((d) => {
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

						// Rotate to start, if overflow
						if(hasMemoryOverflow && backupReadLocation>=backupMaxLocation){
							hasMemoryOverflow = false
							backupReadLocation=0x0100
						}

					})
			}catch{
				if(backupStorageSize >= 2*proto.REC_LEN){
					backupStorageSize/=2
					logger.info('Reducing backup block size', { newSize: backupStorageSize });
				}else{
					return Promise.reject("Unable to read backup data")
				}
			}

		}

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

		return backupData
	}
}
