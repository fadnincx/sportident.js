import { getLogger } from '../utils/logging';
import { decodeCp850 } from '../utils/charset';

const logger = getLogger('SiStringEncoding');

// Decodes one byte of card text. Cards hold CP850 (see utils/charset.ts), the same
// codec the Reader BT and the personal data writers use; control characters and DEL
// carry no text.
export const siStringToUtf8 = (char: number): string => {
	if (char < 0x20 || char === 0x7f || char > 0xff) {
		if (char !== 0x00) {
			logger.warn(`Character not found in SI coding table`, { character: char.toString(16) });
		}
		return '';
	}
	return decodeCp850([char]);
};
