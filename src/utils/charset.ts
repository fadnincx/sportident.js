// Code page 850 (DOS Latin-1), the character set SportIdent cards store text in: the
// official tools write ü as 0x81 and ä as 0x84, not as the ISO 8859-1 0xFC and 0xE4.
// 0x00-0x7F is ASCII; this table covers 0x80-0xFF.
const CP850_HIGH =
	'ÇüéâäàåçêëèïîìÄÅ' +
	'ÉæÆôöòûùÿÖÜø£Ø×ƒ' +
	'áíóúñÑªº¿®¬½¼¡«»' +
	'░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐' +
	'└┴┬├─┼ãÃ╚╔╩╦╠═╬¤' +
	'ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀' +
	'ÓßÔÒõÕµþÞÚÛÙýÝ¯´' +
	'­±‗¾¶§÷¸°¨·¹³²■ ';

const CP850_BYTE_BY_CHAR: { [character: string]: number } = {};
CP850_HIGH.split('').forEach((character, index) => {
	CP850_BYTE_BY_CHAR[character] = 0x80 + index;
});

export const CP850_REPLACEMENT_BYTE = 0x3f; // '?'

export const decodeCp850 = (bytes: number[]): string => bytes.map((byte) => (byte < 0x80 ? String.fromCharCode(byte) : CP850_HIGH[byte - 0x80])).join('');

// Characters CP850 cannot represent become '?'.
export const encodeCp850 = (text: string): number[] =>
	text.split('').map((character) => {
		const code = character.charCodeAt(0);
		if (code < 0x80) {
			return code;
		}
		return CP850_BYTE_BY_CHAR[character] ?? CP850_REPLACEMENT_BYTE;
	});
