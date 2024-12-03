import { getLookup } from './utils';

export const proto = {
	// Protocol characters
	STX: 0x02,
	ETX: 0x03,
	ACK: 0x06, // when sent to BSx3..6, causes beep until SI-card taken out
	NAK: 0x15,
	DLE: 0x10,
	WAKEUP: 0xff,

	// Basic protocol commands, currently unused
	basicCmd: {
		SET_CARDNO: 0x30,
		GET_SI5: 0x31, // read out SI-card 5 data
		SI5_WRITE: 0x43, // 02 43 (block: 0x30 to 0x37) (16 bytes) 03
		SI5_DET: 0x46, // SI-card 5 inserted (46 49) or removed (46 4F)
		TRANS_REC: 0x53, // autosend timestamp (online control)
		TRANS_TIME: 0x54, // autosend timestamp (lightbeam trigger)
		GET_SI6: 0x61, // read out SI-card 6 data
		SI6_DET: 0x66, // SI-card 6 inserted
		SET_MS: 0x70, // \x4D="M"aster, \x53="S"lave
		GET_MS: 0x71,
		SET_SYS_VAL: 0x72,
		GET_SYS_VAL: 0x73,
		GET_BDATA: 0x74, // Note: response carries '\xC4'!
		ERASE_BDATA: 0x75,
		SET_TIME: 0x76,
		GET_TIME: 0x77,
		OFF: 0x78,
		GET_BDATA2: 0x7a, // Note: response carries '\xCA'!
		SET_BAUD: 0x7e // 0=4800 baud, 1=38400 baud
	},
	get basicCmdLookup(): { [value: number]: string } {
		return getLookup(proto.basicCmd);
	},

	// Extended protocol commands
	cmd: {
		GET_BACKUP: 0x81,
		SET_SYS_VAL: 0x82,
		GET_SYS_VAL: 0x83,
		SRR_WRITE: 0xa2, // ShortRangeRadio - SysData write
		SRR_READ: 0xa3, // ShortRangeRadio - SysData read
		SRR_QUERY: 0xa6, // ShortRangeRadio - network device query
		SRR_PING: 0xa7, // ShortRangeRadio - heartbeat from linked devices, every 50 seconds
		SRR_ADHOC: 0xa8, // ShortRangeRadio - ad-hoc message, f.ex. from SI-ActiveCard
		GET_SI5: 0xb1, // read out SI-card 5 data
		TRANS_REC: 0xd3, // autosend timestamp (online control)
		CLEAR_CARD: 0xe0, // found on SI-dev-forum: 02 E0 00 E0 00 03 (http://www.sportident.com/en/forum/8/56#59)
		GET_SI6: 0xe1, // read out SI-card 6 data block
		SET_SI6: 0xe2, // write SI-card 6 line (16 bytes)
		SET_SI6_SPECIAL: 0xe4, // write SI-card 6 special fields (e.g. start number)
		SI5_DET: 0xe5, // SI-card 5 inserted
		SI6_DET: 0xe6, // SI-card 6 inserted
		SI_REM: 0xe7, // SI-card removed
		SI8_DET: 0xe8, // SI-card 8/9/10/11/p/t inserted
		SET_SI8: 0xea, // write SI-card 8/9/10/11/p/t data word
		GET_SI8: 0xef, // read out SI-card 8/9/10/11/p/t data block
		SET_MS: 0xf0, // \x4D="M"aster, \x53="S"lave
		GET_MS: 0xf1,
		ERASE_BDATA: 0xf5,
		SET_TIME: 0xf6,
		GET_TIME: 0xf7,
		OFF: 0xf8,
		SIGNAL: 0xf9, // 02 F9 (number of signals) (CRC16) 03
		SET_BAUD: 0xfe // \x00=4800 baud, \x01=38400 baud
	},
	get cmdLookup(): { [value: number]: string } {
		return getLookup(proto.cmd);
	},

	// If a punch has explicitly no time (e.g. if the start hasn't been punched)
	NO_TIME: 0xeeee,

	// Protocol Parameters
	P_MS_DIRECT: 0x4d, // "M"aster
	P_MS_REMOTE: 0x53, // "S"lave
	P_SI6_CB: 0x08,

	// Backup memory record length
	REC_LEN: 8, // Only in extended protocol, otherwise 6!

	// punch trigger in control mode data structure
	T_OFFSET: 8,
	T_CN: 0,
	T_TIME: 5,

	// backup memory in control mode
	BC_CN: 3,
	BC_TIME: 8
};
