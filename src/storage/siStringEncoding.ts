import { getLogger } from '../utils/logging';

const logger = getLogger('SiStringEncoding');

const encodingTable = [
	{
		dec: '0',
		hex: '0',
		description: 'Nothing',
		symbol: ''
	},
	{
		dec: '32',
		hex: '20',
		description: 'Space',
		symbol: ' '
	},
	{
		dec: '33',
		hex: '21',
		description: 'Exclamation mark',
		symbol: '!'
	},
	{
		dec: '34',
		hex: '22',
		symbol: '"',
		description: 'Quotation Mark'
	},
	{
		dec: '35',
		hex: '23',
		description: 'Hash',
		symbol: '#'
	},
	{
		dec: '36',
		hex: '24',
		description: 'Dollar',
		symbol: '$'
	},
	{
		dec: '37',
		hex: '25',
		description: 'Percent',
		symbol: '%'
	},
	{
		dec: '38',
		hex: '26',
		description: 'Ampersand',
		symbol: '&'
	},
	{
		dec: '39',
		hex: '27',
		description: 'Single quote(Apostrophe)',
		symbol: "'"
	},
	{
		dec: '40',
		hex: '28',
		description: 'Open parenthesis (or open bracket)',
		symbol: '('
	},
	{
		dec: '41',
		hex: '29',
		description: 'Close parenthesis (or close bracket)',
		symbol: ')'
	},
	{
		dec: '42',
		hex: '2A',
		description: 'Asterisk',
		symbol: '*'
	},
	{
		dec: '43',
		hex: '2B',
		description: 'Plus',
		symbol: '+'
	},
	{
		dec: '44',
		hex: '2C',
		description: 'Comma',
		symbol: ','
	},
	{
		dec: '45',
		hex: '2D',
		description: 'Dash',
		symbol: '–'
	},
	{
		dec: '46',
		hex: '2E',
		description: 'Dot, period or full stop',
		symbol: '.'
	},
	{
		dec: '47',
		hex: '2F',
		description: 'Slash or divide',
		symbol: '/'
	},
	{
		dec: '48',
		hex: '30',
		description: 'Zero',
		symbol: '0'
	},
	{
		dec: '49',
		hex: '31',
		description: 'One',
		symbol: '1'
	},
	{
		dec: '50',
		hex: '32',
		description: 'Two',
		symbol: '2'
	},
	{
		dec: '51',
		hex: '33',
		description: 'Three',
		symbol: '3'
	},
	{
		dec: '52',
		hex: '34',
		description: 'Four',
		symbol: '4'
	},
	{
		dec: '53',
		hex: '35',
		description: 'Five',
		symbol: '5'
	},
	{
		dec: '54',
		hex: '36',
		description: 'Six',
		symbol: '6'
	},
	{
		dec: '55',
		hex: '37',
		description: 'Seven',
		symbol: '7'
	},
	{
		dec: '56',
		hex: '38',
		description: 'Eight',
		symbol: '8'
	},
	{
		dec: '57',
		hex: '39',
		description: 'Nine',
		symbol: '9'
	},
	{
		dec: '58',
		hex: '3A',
		description: 'Colon',
		symbol: ':'
	},
	{
		dec: '59',
		hex: '3B',
		description: 'Semicolon',
		symbol: ';'
	},
	{
		dec: '60',
		hex: '3C',
		description: 'Less than (or open angled bracket)',
		symbol: '<'
	},
	{
		dec: '61',
		hex: '3D',
		description: 'Equals sign',
		symbol: '='
	},
	{
		dec: '62',
		hex: '3E',
		description: 'Greater than (or close angled bracket)',
		symbol: '>'
	},
	{
		dec: '63',
		hex: '3F',
		description: 'Question mark',
		symbol: '?'
	},
	{
		dec: '64',
		hex: '40',
		description: 'At symbol',
		symbol: '@'
	},
	{
		dec: '65',
		hex: '41',
		description: 'Upper case A',
		symbol: 'A'
	},
	{
		dec: '66',
		hex: '42',
		description: 'Upper case B',
		symbol: 'B'
	},
	{
		dec: '67',
		hex: '43',
		description: 'Upper case C',
		symbol: 'C'
	},
	{
		dec: '68',
		hex: '44',
		description: 'Upper case D',
		symbol: 'D'
	},
	{
		dec: '69',
		hex: '45',
		description: 'Upper case E',
		symbol: 'E'
	},
	{
		dec: '70',
		hex: '46',
		description: 'Upper case F',
		symbol: 'F'
	},
	{
		dec: '71',
		hex: '47',
		description: 'Upper case G',
		symbol: 'G'
	},
	{
		dec: '72',
		hex: '48',
		description: 'Upper case H',
		symbol: 'H'
	},
	{
		dec: '73',
		hex: '49',
		description: 'Upper case I',
		symbol: 'I'
	},
	{
		dec: '74',
		hex: '4A',
		description: 'Upper case J',
		symbol: 'J'
	},
	{
		dec: '75',
		hex: '4B',
		description: 'Upper case K',
		symbol: 'K'
	},
	{
		dec: '76',
		hex: '4C',
		description: 'Upper case L',
		symbol: 'L'
	},
	{
		dec: '77',
		hex: '4D',
		description: 'Upper case M',
		symbol: 'M'
	},
	{
		dec: '78',
		hex: '4E',
		description: 'Upper case N',
		symbol: 'N'
	},
	{
		dec: '79',
		hex: '4F',
		description: 'Upper case O',
		symbol: 'O'
	},
	{
		dec: '80',
		hex: '50',
		description: 'Upper case P',
		symbol: 'P'
	},
	{
		dec: '81',
		hex: '51',
		description: 'Upper case Q',
		symbol: 'Q'
	},
	{
		dec: '82',
		hex: '52',
		description: 'Upper case R',
		symbol: 'R'
	},
	{
		dec: '83',
		hex: '53',
		description: 'Upper case S',
		symbol: 'S'
	},
	{
		dec: '84',
		hex: '54',
		description: 'Upper case T',
		symbol: 'T'
	},
	{
		dec: '85',
		hex: '55',
		description: 'Upper case U',
		symbol: 'U'
	},
	{
		dec: '86',
		hex: '56',
		description: 'Upper case V',
		symbol: 'V'
	},
	{
		dec: '87',
		hex: '57',
		description: 'Upper case W',
		symbol: 'W'
	},
	{
		dec: '88',
		hex: '58',
		description: 'Upper case X',
		symbol: 'X'
	},
	{
		dec: '89',
		hex: '59',
		description: 'Upper case Y',
		symbol: 'Y'
	},
	{
		dec: '90',
		hex: '5A',
		description: 'Upper case Z',
		symbol: 'Z'
	},
	{
		dec: '91',
		hex: '5B',
		description: 'Open square bracket',
		symbol: '['
	},
	{
		dec: '92',
		hex: '5C',
		description: 'Backslash',
		symbol: '\\'
	},
	{
		dec: '93',
		hex: '5D',
		description: 'Close square bracket',
		symbol: ']'
	},
	{
		dec: '94',
		hex: '5E',
		description: 'Caret - circumflex',
		symbol: '^'
	},
	{
		dec: '95',
		hex: '5F',
		description: 'Underscore',
		symbol: '_'
	},
	{
		dec: '96',
		hex: '60',
		description: 'Grave accent',
		symbol: '`'
	},
	{
		dec: '97',
		hex: '61',
		description: 'Lower case a',
		symbol: 'a'
	},
	{
		dec: '98',
		hex: '62',
		description: 'Lower case b',
		symbol: 'b'
	},
	{
		dec: '99',
		hex: '63',
		description: 'Lower case c',
		symbol: 'c'
	},
	{
		dec: '100',
		hex: '64',
		description: 'Lower case d',
		symbol: 'd'
	},
	{
		dec: '101',
		hex: '65',
		description: 'Lower case e',
		symbol: 'e'
	},
	{
		dec: '102',
		hex: '66',
		description: 'Lower case f',
		symbol: 'f'
	},
	{
		dec: '103',
		hex: '67',
		description: 'Lower case g',
		symbol: 'g'
	},
	{
		dec: '104',
		hex: '68',
		description: 'Lower case h',
		symbol: 'h'
	},
	{
		dec: '105',
		hex: '69',
		description: 'Lower case i',
		symbol: 'i'
	},
	{
		dec: '106',
		hex: '6A',
		description: 'Lower case j',
		symbol: 'j'
	},
	{
		dec: '107',
		hex: '6B',
		description: 'Lower case k',
		symbol: 'k'
	},
	{
		dec: '108',
		hex: '6C',
		description: 'Lower case l',
		symbol: 'l'
	},
	{
		dec: '109',
		hex: '6D',
		description: 'Lower case m',
		symbol: 'm'
	},
	{
		dec: '110',
		hex: '6E',
		description: 'Lower case n',
		symbol: 'n'
	},
	{
		dec: '111',
		hex: '6F',
		description: 'Lower case o',
		symbol: 'o'
	},
	{
		dec: '112',
		hex: '70',
		description: 'Lower case p',
		symbol: 'p'
	},
	{
		dec: '113',
		hex: '71',
		description: 'Lower case q',
		symbol: 'q'
	},
	{
		dec: '114',
		hex: '72',
		description: 'Lower case r',
		symbol: 'r'
	},
	{
		dec: '115',
		hex: '73',
		description: 'Lower case s',
		symbol: 's'
	},
	{
		dec: '116',
		hex: '74',
		description: 'Lower case t',
		symbol: 't'
	},
	{
		dec: '117',
		hex: '75',
		description: 'Lower case u',
		symbol: 'u'
	},
	{
		dec: '118',
		hex: '76',
		description: 'Lower case v',
		symbol: 'v'
	},
	{
		dec: '119',
		hex: '77',
		description: 'Lower case w',
		symbol: 'w'
	},
	{
		dec: '120',
		hex: '78',
		description: 'Lower case x',
		symbol: 'x'
	},
	{
		dec: '121',
		hex: '79',
		description: 'Lower case y',
		symbol: 'y'
	},
	{
		dec: '122',
		hex: '7A',
		description: 'Lower case z',
		symbol: 'z'
	},
	{
		dec: '123',
		hex: '7B',
		description: 'Opening curly brace',
		symbol: '{'
	},
	{
		dec: '124',
		hex: '7C',
		description: 'Pipe',
		symbol: '|'
	},
	{
		dec: '125',
		hex: '7D',
		description: 'Closing curly brace',
		symbol: '}'
	},
	{
		dec: '126',
		hex: '7E',
		description: 'Equivalency sign - tilde',
		symbol: '~'
	},
	{
		dec: '127',
		hex: '7F',
		description: 'Delete',
		symbol: '⌂'
	},
	{
		dec: '128',
		hex: '80',
		description: 'Upper case C with cedilla',
		symbol: 'Ç'
	},
	{
		dec: '129',
		hex: '81',
		description: 'Lower case u with diaeresis',
		symbol: 'ü'
	},
	{
		dec: '130',
		hex: '82',
		description: 'Lower case e with acute',
		symbol: 'é'
	},
	{
		dec: '131',
		hex: '83',
		description: 'Lower case a with circumflex',
		symbol: 'â'
	},
	{
		dec: '132',
		hex: '84',
		description: 'Lower case a with diaeresis',
		symbol: 'ä'
	},
	{
		dec: '133',
		hex: '85',
		description: 'Lower case a with grave',
		symbol: 'à'
	},
	{
		dec: '134',
		hex: '86',
		description: 'Lower case a with ring above',
		symbol: 'å'
	},
	{
		dec: '135',
		hex: '87',
		description: 'Lower case c with cedilla',
		symbol: 'ç'
	},
	{
		dec: '136',
		hex: '88',
		description: 'Lower case e with circumflex',
		symbol: 'ê'
	},
	{
		dec: '137',
		hex: '89',
		description: 'Lower case e with diaeresis',
		symbol: 'ë'
	},
	{
		dec: '138',
		hex: '8A',
		description: 'Lower case e with grave',
		symbol: 'è'
	},
	{
		dec: '139',
		hex: '8B',
		description: 'Lower case i with diaeresis',
		symbol: 'ï'
	},
	{
		dec: '140',
		hex: '8C',
		description: 'Lower case i with circumflex',
		symbol: 'î'
	},
	{
		dec: '141',
		hex: '8D',
		description: 'Lower case i with grave',
		symbol: 'ì'
	},
	{
		dec: '142',
		hex: '8E',
		description: 'Upper case A with diaeresis',
		symbol: 'Ä'
	},
	{
		dec: '143',
		hex: '8F',
		description: 'Upper case A with ring above',
		symbol: 'Å'
	},
	{
		dec: '144',
		hex: '90',
		description: 'Upper case E with acute',
		symbol: 'É'
	},
	{
		dec: '145',
		hex: '91',
		description: 'Lower case ae',
		symbol: 'æ'
	},
	{
		dec: '146',
		hex: '92',
		description: 'Upper case AE',
		symbol: 'Æ'
	},
	{
		dec: '147',
		hex: '93',
		description: 'Lower case o with circumflex',
		symbol: 'ô'
	},
	{
		dec: '148',
		hex: '94',
		description: 'Lower case o with diaeresis',
		symbol: 'ö'
	},
	{
		dec: '149',
		hex: '95',
		description: 'Lower case o with grave',
		symbol: 'ò'
	},
	{
		dec: '150',
		hex: '96',
		description: 'Lower case u with circumflex',
		symbol: 'û'
	},
	{
		dec: '151',
		hex: '97',
		description: 'Lower case u with grave',
		symbol: 'ù'
	},
	{
		dec: '152',
		hex: '98',
		description: 'Lower case y with diaeresis',
		symbol: 'ÿ'
	},
	{
		dec: '153',
		hex: '99',
		description: 'Upper case O with diaeresis',
		symbol: 'Ö'
	},
	{
		dec: '154',
		hex: '9A',
		description: 'Upper case U with diaeresis',
		symbol: 'Ü'
	},
	{
		dec: '155',
		hex: '9B',
		description: 'Cent sign',
		symbol: '¢'
	},
	{
		dec: '156',
		hex: '9C',
		description: 'Pound sign',
		symbol: '£'
	},
	{
		dec: '157',
		hex: '9D',
		description: 'Yen sign',
		symbol: '¥'
	},
	{
		dec: '158',
		hex: '9E',
		symbol: '₧',
		description: 'Peseta sign'
	},
	{
		dec: '159',
		hex: '9F',
		description: 'Lower case f with hook',
		symbol: 'ƒ'
	},
	{
		dec: '160',
		hex: 'A0',
		description: 'Lower case a with acute',
		symbol: 'á'
	},
	{
		dec: '161',
		hex: 'A1',
		description: 'Lower case i with acute',
		symbol: 'í'
	},
	{
		dec: '162',
		hex: 'A2',
		description: 'Lower case o with acute',
		symbol: 'ó'
	},
	{
		dec: '163',
		hex: 'A3',
		description: 'Lower case u with acute',
		symbol: 'ú'
	},
	{
		dec: '164',
		hex: 'A4',
		description: 'Lower case n with tilde',
		symbol: 'ñ'
	},
	{
		dec: '165',
		hex: 'A5',
		description: 'Upper case N with tilde',
		symbol: 'Ñ'
	},
	{
		dec: '166',
		hex: 'A6',
		description: 'Feminine ordinal indicator',
		symbol: 'ª'
	},
	{
		dec: '167',
		hex: 'A7',
		description: 'Masculine ordinal indicator',
		symbol: 'º'
	},
	{
		dec: '168',
		hex: 'A8',
		description: 'Inverted question mark',
		symbol: '¿'
	},
	{
		dec: '169',
		hex: 'A9',
		symbol: '⌐',
		description: 'Reversed not sign'
	},
	{
		dec: '170',
		hex: 'AA',
		description: 'Not sign',
		symbol: '¬'
	},
	{
		dec: '171',
		hex: 'AB',
		description: 'Fraction one half',
		symbol: '½'
	},
	{
		dec: '172',
		hex: 'AC',
		description: 'Fraction one quarter',
		symbol: '¼'
	},
	{
		dec: '173',
		hex: 'AD',
		description: 'Inverted exclamation mark',
		symbol: '¡'
	},
	{
		dec: '174',
		hex: 'AE',
		description: 'Left double angle quotes',
		symbol: '«'
	},
	{
		dec: '175',
		hex: 'AF',
		description: 'Right double angle quotes',
		symbol: '»'
	},
	{
		dec: '176',
		hex: 'B0',
		symbol: '░',
		description: 'Light shade'
	},
	{
		dec: '177',
		hex: 'B1',
		symbol: '▒',
		description: 'Medium shade'
	},
	{
		dec: '178',
		hex: 'B2',
		symbol: '▓',
		description: 'Dark shade'
	},
	{
		dec: '179',
		hex: 'B3',
		symbol: '│',
		description: 'Box drawings light vertical'
	},
	{
		dec: '180',
		hex: 'B4',
		symbol: '┤',
		description: 'Box drawings light vertical and left'
	},
	{
		dec: '181',
		hex: 'B5',
		symbol: '╡',
		description: 'Box drawings vertical single and left double'
	},
	{
		dec: '182',
		hex: 'B6',
		symbol: '╢',
		description: 'Box drawings vertical double and left single'
	},
	{
		dec: '183',
		hex: 'B7',
		symbol: '╖',
		description: 'Box drawings down double and left single'
	},
	{
		dec: '184',
		hex: 'B8',
		symbol: '╕',
		description: 'Box drawings down single and left double'
	},
	{
		dec: '185',
		hex: 'B9',
		symbol: '╣',
		description: 'Box drawings double vertical and left'
	},
	{
		dec: '186',
		hex: 'BA',
		symbol: '║',
		description: 'Box drawings double vertical'
	},
	{
		dec: '187',
		hex: 'BB',
		symbol: '╗',
		description: 'Box drawings double down and left'
	},
	{
		dec: '188',
		hex: 'BC',
		symbol: '╝',
		description: 'Box drawings double up and left'
	},
	{
		dec: '189',
		hex: 'BD',
		symbol: '╜',
		description: 'Box drawings up double and left single'
	},
	{
		dec: '190',
		hex: 'BE',
		symbol: '╛',
		description: 'Box drawings up single and left double'
	},
	{
		dec: '191',
		hex: 'BF',
		symbol: '┐',
		description: 'Box drawings light down and left'
	},
	{
		dec: '192',
		hex: 'C0',
		symbol: '└',
		description: 'Box drawings light up and right'
	},
	{
		dec: '193',
		hex: 'C1',
		symbol: '┴',
		description: 'Box drawings light up and horizontal'
	},
	{
		dec: '194',
		hex: 'C2',
		symbol: '┬',
		description: 'Box drawings light down and horizontal'
	},
	{
		dec: '195',
		hex: 'C3',
		symbol: '├',
		description: 'Box drawings light vertical and right'
	},
	{
		dec: '196',
		hex: 'C4',
		symbol: '─',
		description: 'Box drawings light horizontal'
	},
	{
		dec: '197',
		hex: 'C5',
		symbol: '┼',
		description: 'Box drawings light vertical and horizontal'
	},
	{
		dec: '198',
		hex: 'C6',
		symbol: '╞',
		description: 'Box drawings vertical single and right double'
	},
	{
		dec: '199',
		hex: 'C7',
		symbol: '╟',
		description: 'Box drawings vertical double and right single'
	},
	{
		dec: '200',
		hex: 'C8',
		symbol: '╚',
		description: 'Box drawings double up and right'
	},
	{
		dec: '201',
		hex: 'C9',
		symbol: '╔',
		description: 'Box drawings double down and right'
	},
	{
		dec: '202',
		hex: 'CA',
		symbol: '╩',
		description: 'Box drawings double up and horizontal'
	},
	{
		dec: '203',
		hex: 'CB',
		symbol: '╦',
		description: 'Box drawings double down and horizontal'
	},
	{
		dec: '204',
		hex: 'CC',
		symbol: '╠',
		description: 'Box drawings double vertical and right'
	},
	{
		dec: '205',
		hex: 'CD',
		symbol: '═',
		description: 'Box drawings double horizontal'
	},
	{
		dec: '206',
		hex: 'CE',
		symbol: '╬',
		description: 'Box drawings double vertical and horizontal'
	},
	{
		dec: '207',
		hex: 'CF',
		symbol: '╧',
		description: 'Box drawings up single and horizontal double'
	},
	{
		dec: '208',
		hex: 'D0',
		symbol: '╨',
		description: 'Box drawings up double and horizontal single'
	},
	{
		dec: '209',
		hex: 'D1',
		symbol: '╤',
		description: 'Box drawings down single and horizontal double'
	},
	{
		dec: '210',
		hex: 'D2',
		symbol: '╥',
		description: 'Box drawings down double and horizontal single'
	},
	{
		dec: '211',
		hex: 'D3',
		symbol: '╙',
		description: 'Box drawings up double and right single'
	},
	{
		dec: '212',
		hex: 'D4',
		symbol: '╘',
		description: 'Box drawings up single and right double'
	},
	{
		dec: '213',
		hex: 'D5',
		symbol: '╒',
		description: 'Box drawings down single and right double'
	},
	{
		dec: '214',
		hex: 'D6',
		symbol: '╓',
		description: 'Box drawings down double and right single'
	},
	{
		dec: '215',
		hex: 'D7',
		symbol: '╫',
		description: 'Box drawings vertical double and horizontal single'
	},
	{
		dec: '216',
		hex: 'D8',
		symbol: '╪',
		description: 'Box drawings vertical single and horizontal double'
	},
	{
		dec: '217',
		hex: 'D9',
		symbol: '┘',
		description: 'Box drawings light up and left'
	},
	{
		dec: '218',
		hex: 'DA',
		symbol: '┌',
		description: 'Box drawings light down and right'
	},
	{
		dec: '219',
		hex: 'DB',
		symbol: '█',
		description: 'Full block'
	},
	{
		dec: '220',
		hex: 'DC',
		symbol: '▄',
		description: 'Lower half block'
	},
	{
		dec: '221',
		hex: 'DD',
		symbol: '▌',
		description: 'Left half block'
	},
	{
		dec: '222',
		hex: 'DE',
		symbol: '▐',
		description: 'Right half block'
	},
	{
		dec: '223',
		hex: 'DF',
		symbol: '▀',
		description: 'Upper half block'
	},
	{
		dec: '224',
		hex: 'E0',
		description: 'Greek lower case alpha',
		symbol: 'α'
	},
	{
		dec: '225',
		hex: 'E1',
		description: 'Lower case sharp s',
		symbol: 'ß'
	},
	{
		dec: '226',
		hex: 'E2',
		description: 'Greek upper case letter gamma',
		symbol: 'Γ'
	},
	{
		dec: '227',
		hex: 'E3',
		description: 'Greek lower case pi',
		symbol: 'π'
	},
	{
		dec: '228',
		hex: 'E4',
		description: 'Greek upper case letter sigma',
		symbol: 'Σ'
	},
	{
		dec: '229',
		hex: 'E5',
		description: 'Greek lower case sigma',
		symbol: 'σ'
	},
	{
		dec: '230',
		hex: 'E6',
		description: 'Micro sign',
		symbol: 'µ'
	},
	{
		dec: '231',
		hex: 'E7',
		description: 'Greek lower case tau',
		symbol: 'τ'
	},
	{
		dec: '232',
		hex: 'E8',
		description: 'Greek upper case letter phi',
		symbol: 'Φ'
	},
	{
		dec: '233',
		hex: 'E9',
		description: 'Greek upper case letter theta',
		symbol: 'Θ'
	},
	{
		dec: '234',
		hex: 'EA',
		description: 'Greek upper case letter omega',
		symbol: 'Ω'
	},
	{
		dec: '235',
		hex: 'EB',
		description: 'Greek lower case delta',
		symbol: 'δ'
	},
	{
		dec: '236',
		hex: 'EC',
		description: 'Infinity',
		symbol: '∞'
	},
	{
		dec: '237',
		hex: 'ED',
		description: 'Greek lower case phi',
		symbol: 'φ'
	},
	{
		dec: '238',
		hex: 'EE',
		description: 'Greek lower case epsilon',
		symbol: 'ε'
	},
	{
		dec: '239',
		hex: 'EF',
		description: 'Intersection',
		symbol: '∩'
	},
	{
		dec: '240',
		hex: 'F0',
		description: 'Identical to',
		symbol: '≡'
	},
	{
		dec: '241',
		hex: 'F1',
		description: 'Plus-or-minus sign',
		symbol: '±'
	},
	{
		dec: '242',
		hex: 'F2',
		description: 'Greater-than or equal to',
		symbol: '≥'
	},
	{
		dec: '243',
		hex: 'F3',
		description: 'Less-than or equal to',
		symbol: '≤'
	},
	{
		dec: '244',
		hex: 'F4',
		description: 'Top half integral',
		symbol: '⌠'
	},
	{
		dec: '245',
		hex: 'F5',
		description: 'Bottom half integral',
		symbol: '⌡'
	},
	{
		dec: '246',
		hex: 'F6',
		description: 'Division sign',
		symbol: '÷'
	},
	{
		dec: '247',
		hex: 'F7',
		description: 'Almost equal to',
		symbol: '≈'
	},
	{
		dec: '248',
		hex: 'F8',
		description: 'Degree sign',
		symbol: '°'
	},
	{
		dec: '249',
		hex: 'F9',
		description: 'Bullet operator',
		symbol: '•'
	},
	{
		dec: '250',
		hex: 'FA',
		description: 'Middle dot',
		symbol: '·'
	},
	{
		dec: '251',
		hex: 'FB',
		description: 'Square root',
		symbol: '√'
	},
	{
		dec: '252',
		hex: 'FC',
		description: 'Superscript lower case n',
		symbol: 'ⁿ'
	},
	{
		dec: '253',
		hex: 'FD',
		description: 'Superscript two',
		symbol: '²'
	},
	{
		dec: '254',
		hex: 'FE',
		description: 'Black square',
		symbol: '■'
	},
	{
		dec: '255',
		hex: 'FF',
		description: 'No-break space',
		symbol: 'nbsp'
	}
];

export const siStringToUtf8 = (char: number): string => {
	const codingEnry = encodingTable.find((el) => el.hex === char.toString(16).toUpperCase());
	if (codingEnry) {
		return codingEnry.symbol;
	}
	logger.warn(`Character not found in SI coding table`, { character: char.toString(16) });
	return '';
};
