/**
 * @see https://gist.github.com/nesvet/04780b18351a6b9e348b5f679c900a76
 */

/* eslint-disable unicorn/prefer-code-point */


const enum CharCategory {
	Other = 0,
	Whitespace = 1,
	Digit = 2,
	Latin = 3,
	Cyrillic = 4,
	Arabic = 5,
	CJK = 6,
	Punctuation = 7
}

const CYRILLIC_CHARS_PER_TOKEN = 3.3;
const ARABIC_CHARS_PER_TOKEN = 2.7;
const LATIN_CHARS_PER_TOKEN = 4.7;

const CYR_START = 0x0400;
const CYR_END = 0x04FF;
const ARABIC_START = 0x0600;
const ARABIC_END = 0x06FF;
const CJK_MAIN_START = 0x4E00;
const CJK_MAIN_END = 0x9FFF;
const KANA_START = 0x3040;
const KANA_END = 0x30FF;
const SURROGATE_HIGH_START = 0xD800;
const SURROGATE_HIGH_END = 0xDBFF;

const LOWERCASE_MASK = 0x20;
const APOSTROPHE = 0x27;

const ASCII_MAP = new Uint8Array(128);

const COMMON_WORDS = new Set([
	"the", "be", "to", "of", "and", "a", "in", "that", "have", "I",
	"it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
	"this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
	"or", "an", "will", "my", "one", "all", "would", "there", "their",
	"if", "const", "let", "var", "function", "return", "while", "for",
	"async", "await", "class", "import", "export", "default", "new",
	"else", "case", "break", "continue", "switch", "typeof", "void"
]);

(function initializeAsciiMap() {
	ASCII_MAP[0x09] = CharCategory.Whitespace;
	ASCII_MAP[0x0A] = CharCategory.Whitespace;
	ASCII_MAP[0x0D] = CharCategory.Whitespace;
	ASCII_MAP[0x20] = CharCategory.Whitespace;
	
	for (let i = 0x30; i <= 0x39; i++)
		ASCII_MAP[i] = CharCategory.Digit;
	
	for (let i = 0x41; i <= 0x5A; i++)
		ASCII_MAP[i] = CharCategory.Latin;
	
	for (let i = 0x61; i <= 0x7A; i++)
		ASCII_MAP[i] = CharCategory.Latin;
	
	const punctuation = "!\"#$%&()*+,-./:;<=>?@[\\]^_`{|}~";
	for (let i = 0; i < punctuation.length; i++)
		ASCII_MAP[punctuation.charCodeAt(i)] = CharCategory.Punctuation;
})();


export function countTokens(text: string): number {
	if (!text)
		return 0;
	
	const { length } = text;
	let tokenCount = 0;
	let index = 0;
	
	while (index < length) {
		const code = text.charCodeAt(index);
		let category: CharCategory;
		
		if (code < 128)
			category = ASCII_MAP[code] as CharCategory;
		else
			if (code >= CYR_START && code <= CYR_END)
				category = CharCategory.Cyrillic;
			else if (code >= ARABIC_START && code <= ARABIC_END)
				category = CharCategory.Arabic;
			else if (
				(code >= CJK_MAIN_START && code <= CJK_MAIN_END) ||
				(code >= KANA_START && code <= KANA_END)
			)
				category = CharCategory.CJK;
			else {
				if (code >= SURROGATE_HIGH_START && code <= SURROGATE_HIGH_END) {
					index += 2;
					tokenCount++;
					continue;
				}
				category = CharCategory.Other;
			}
		
		switch (category) {
			case CharCategory.Latin: {
				let wordEnd = index + 1;
				let nextCode: number;
				
				while (
					wordEnd < length &&
					(
						((nextCode = text.charCodeAt(wordEnd)) >= 0x61 && nextCode <= 0x7A) ||
						(nextCode >= 0x41 && nextCode <= 0x5A)
					)
				)
					wordEnd++;
				
				let hasContraction = false;
				if (wordEnd < length && text.charCodeAt(wordEnd) === APOSTROPHE) {
					const suffixStart = wordEnd + 1;
					if (suffixStart < length) {
						const char1 = text.charCodeAt(suffixStart) | LOWERCASE_MASK;
						
						if (char1 === 0x73 || char1 === 0x74 || char1 === 0x6D || char1 === 0x64) {
							wordEnd = suffixStart + 1;
							hasContraction = true;
						} else if (suffixStart + 1 < length) {
							const char2 = text.charCodeAt(suffixStart + 1) | LOWERCASE_MASK;
							if (
								(char1 === 0x72 && char2 === 0x65) ||
								(char1 === 0x76 && char2 === 0x65) ||
								(char1 === 0x6C && char2 === 0x6C)
							) {
								wordEnd = suffixStart + 2;
								hasContraction = true;
							}
						}
					}
				}
				
				const wordLength = wordEnd - index;
				const word = text.slice(index, wordEnd).toLowerCase();
				
				if (COMMON_WORDS.has(word) || wordLength <= 3)
					tokenCount++;
				else
					tokenCount += Math.max(1, Math.round(wordLength / LATIN_CHARS_PER_TOKEN));
				
				if (hasContraction)
					tokenCount++;
				
				index = wordEnd;
				break;
			}
			
			case CharCategory.Whitespace: {
				index++;
				break;
			}
			
			case CharCategory.Digit: {
				let digitEnd = index + 1;
				let hasHexPrefix = false;
				
				if (index > 0 && text.charCodeAt(index - 1) === 0x78 && index > 1 && text.charCodeAt(index - 2) === 0x30) {
					hasHexPrefix = true;
					while (digitEnd < length) {
						const nextCode = text.charCodeAt(digitEnd);
						if (!((nextCode >= 0x30 && nextCode <= 0x39) || (nextCode >= 0x41 && nextCode <= 0x46) || (nextCode >= 0x61 && nextCode <= 0x66)))
							break;
						digitEnd++;
					}
				} else
					while (digitEnd < length) {
						const nextCode = text.charCodeAt(digitEnd);
						if (nextCode < 0x30 || nextCode > 0x39)
							break;
						digitEnd++;
					}
				
				
				const digitCount = digitEnd - index;
				
				if (hasHexPrefix || digitCount === 4)
					tokenCount++;
				else if (digitCount <= 2)
					tokenCount++;
				else
					tokenCount += Math.ceil(digitCount / 3);
				
				index = digitEnd;
				break;
			}
			
			case CharCategory.Cyrillic: {
				const start = index;
				do
					index++;
				while (index < length && text.charCodeAt(index) >= CYR_START && text.charCodeAt(index) <= CYR_END);
				
				const charCount = index - start;
				tokenCount += Math.max(1, Math.round(charCount / CYRILLIC_CHARS_PER_TOKEN));
				break;
			}
			
			case CharCategory.Arabic: {
				const start = index;
				do
					index++;
				while (index < length && text.charCodeAt(index) >= ARABIC_START && text.charCodeAt(index) <= ARABIC_END);
				
				const charCount = index - start;
				tokenCount += Math.max(1, Math.round(charCount / ARABIC_CHARS_PER_TOKEN));
				break;
			}
			
			case CharCategory.CJK: {
				tokenCount++;
				index++;
				break;
			}
			
			case CharCategory.Punctuation: {
				tokenCount++;
				index++;
				break;
			}
			
			default: {
				tokenCount++;
				index++;
				break;
			}
		}
	}
	
	return tokenCount;
}
