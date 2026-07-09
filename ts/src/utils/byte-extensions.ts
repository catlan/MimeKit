/**
 * Bit flags describing byte classes used by MIME lexical parsers.
 */
export const enum CharType {
  /** No character class flags. */
  None = 0,
  /** ASCII byte. */
  IsAscii = 1 << 0,
  /** RFC atom-safe byte. */
  IsAtom = 1 << 1,
  /** RFC 2231 attribute-safe byte. */
  IsAttrChar = 1 << 2,
  /** Space or horizontal tab. */
  IsBlank = 1 << 3,
  /** Control byte. */
  IsControl = 1 << 4,
  /** Domain-literal-safe byte. */
  IsDomainSafe = 1 << 5,
  /** RFC 2047 encoded-phrase-safe byte. */
  IsEncodedPhraseSafe = 1 << 6,
  /** RFC 2047 encoded-word-safe byte. */
  IsEncodedWordSafe = 1 << 7,
  /** Quoted-printable-safe byte. */
  IsQuotedPrintableSafe = 1 << 8,
  /** Space byte. */
  IsSpace = 1 << 9,
  /** RFC 5322 special byte. */
  IsSpecial = 1 << 10,
  /** RFC 2045 token-special byte. */
  IsTokenSpecial = 1 << 11,
  /** Linear whitespace byte. */
  IsWhitespace = 1 << 12,
  /** Hexadecimal digit byte. */
  IsXDigit = 1 << 13,
  /** Phrase atom byte. */
  IsPhraseAtom = 1 << 14,
  /** Header field text byte. */
  IsFieldText = 1 << 15,

  /** ASCII byte that is also atom-safe. */
  IsAsciiAtom = IsAscii | IsAtom,
}

const ATOM_SAFE = "!#$%&'*+-/=?^_`{|}~";
const ATTRIBUTE_SPECIALS = "*'%";
const ENCODED_WORD_SPECIALS = '()<>@,;:"/[]?.=_';
const ENCODED_PHRASE_SAFE = '!*+-/';
const SPECIALS = '()<>[]:;@\\,."';
/** RFC 2045 token-special characters. */
export const TOKEN_SPECIALS = '()<>@,;:\\"/[]?=';
/** Whitespace characters recognized by the byte parser helpers. */
export const WHITESPACE = ' \t\r\n';

const table = new Uint16Array(256);

function removeFlags(values: string, bit: CharType): void {
  for (let i = 0; i < values.length; i++)
    table[values.charCodeAt(i) & 0xff] &= ~bit;
}

function setFlags(values: string, bit: CharType): void {
  for (let i = 0; i < values.length; i++)
    table[values.charCodeAt(i) & 0xff] |= bit;
}

for (let i = 0; i < 256; i++) {
  if (i < 127) {
    if (i < 32)
      table[i] |= CharType.IsControl | CharType.IsTokenSpecial;
    if (i > 32)
      table[i] |= CharType.IsAttrChar;
    if (i >= 32 && i !== 61)
      table[i] |= CharType.IsQuotedPrintableSafe | CharType.IsEncodedWordSafe;
    if ((i >= 0x30 && i <= 0x39) || (i >= 0x61 && i <= 0x7a) || (i >= 0x41 && i <= 0x5a))
      table[i] |= CharType.IsEncodedPhraseSafe | CharType.IsAtom | CharType.IsPhraseAtom;
    if ((i >= 0x30 && i <= 0x39) || (i >= 0x61 && i <= 0x66) || (i >= 0x41 && i <= 0x46))
      table[i] |= CharType.IsXDigit;
    if (i >= 33 && i !== 58)
      table[i] |= CharType.IsFieldText;
    if ((i >= 33 && i <= 90) || i >= 94)
      table[i] |= CharType.IsDomainSafe;

    table[i] |= CharType.IsAscii;
  } else {
    if (i === 127)
      table[i] |= CharType.IsAscii;
    else
      table[i] |= CharType.IsAtom | CharType.IsPhraseAtom;

    table[i] |= CharType.IsControl | CharType.IsTokenSpecial;
  }
}

table[0x09] |= CharType.IsQuotedPrintableSafe | CharType.IsBlank;
table[0x20] |= CharType.IsSpace | CharType.IsBlank;

setFlags(WHITESPACE, CharType.IsWhitespace);
setFlags(ATOM_SAFE, CharType.IsAtom | CharType.IsPhraseAtom);
setFlags(TOKEN_SPECIALS, CharType.IsTokenSpecial);
setFlags(SPECIALS, CharType.IsSpecial);
removeFlags(SPECIALS, CharType.IsAtom | CharType.IsPhraseAtom);
removeFlags(ENCODED_WORD_SPECIALS, CharType.IsEncodedWordSafe);
removeFlags(ATTRIBUTE_SPECIALS + TOKEN_SPECIALS, CharType.IsAttrChar);
setFlags(ENCODED_PHRASE_SAFE, CharType.IsEncodedPhraseSafe);

table[0x5b] |= CharType.IsPhraseAtom;
table[0x5d] |= CharType.IsPhraseAtom;
table[0x29] |= CharType.IsPhraseAtom;

/**
 * Check whether a byte is ASCII.
 *
 * @param c - Byte to test.
 * @returns `true` if `c` is ASCII.
 * @throws {RangeError} `c` is outside the byte range.
 */
export function isAscii(c: number): boolean {
  return hasType(c, CharType.IsAscii);
}

/** Check whether a byte is both ASCII and atom-safe. */
export function isAsciiAtom(c: number): boolean {
  return getType(c, CharType.IsAsciiAtom) === CharType.IsAsciiAtom;
}

/** Check whether a byte is phrase-atom-safe. */
export function isPhraseAtom(c: number): boolean {
  return hasType(c, CharType.IsPhraseAtom);
}

/** Check whether a byte is atom-safe. */
export function isAtom(c: number): boolean {
  return hasType(c, CharType.IsAtom);
}

/** Check whether a byte is safe in an RFC 2231 attribute. */
export function isAttr(c: number): boolean {
  return hasType(c, CharType.IsAttrChar);
}

/** Check whether a byte is a blank character. */
export function isBlank(c: number): boolean {
  return hasType(c, CharType.IsBlank);
}

/** Check whether a byte is a control character. */
export function isCtrl(c: number): boolean {
  return hasType(c, CharType.IsControl);
}

/** Check whether a byte is safe inside a domain literal. */
export function isDomain(c: number): boolean {
  return hasType(c, CharType.IsDomainSafe);
}

/** Check whether a byte is valid header field text. */
export function isFieldText(c: number): boolean {
  return hasType(c, CharType.IsFieldText);
}

/** Check whether a byte is quoted-printable-safe. */
export function isQpSafe(c: number): boolean {
  return hasType(c, CharType.IsQuotedPrintableSafe);
}

/** Check whether a byte is valid in a MIME token. */
export function isToken(c: number): boolean {
  return getType(c, CharType.IsTokenSpecial | CharType.IsWhitespace | CharType.IsControl) === 0;
}

/** Check whether a byte is an RFC 2045 token-special. */
export function isTokenSpecial(c: number): boolean {
  return hasType(c, CharType.IsTokenSpecial);
}

/**
 * Check whether a byte has any of the specified character class flags.
 *
 * @param c - Byte to test.
 * @param type - Character class flags.
 * @returns `true` if any requested flags are present.
 * @throws {RangeError} `c` is outside the byte range.
 */
export function isType(c: number, type: CharType): boolean {
  return hasType(c, type);
}

/** Check whether a byte is whitespace. */
export function isWhitespace(c: number): boolean {
  return hasType(c, CharType.IsWhitespace);
}

/** Check whether a byte is a hexadecimal digit. */
export function isXDigit(c: number): boolean {
  return hasType(c, CharType.IsXDigit);
}

/**
 * Convert an ASCII uppercase byte to lowercase.
 *
 * @param c - Byte to convert.
 * @returns The lowercase byte, or `c` when no conversion is needed.
 * @throws {RangeError} `c` is outside the byte range.
 */
export function toLower(c: number): number {
  assertByte(c);

  if (c >= 0x41 && c <= 0x5a)
    return c + 0x20;

  return c;
}

/**
 * Convert an ASCII lowercase byte to uppercase.
 *
 * @param c - Byte to convert.
 * @returns The uppercase byte, or `c` when no conversion is needed.
 * @throws {RangeError} `c` is outside the byte range.
 */
export function toUpper(c: number): number {
  assertByte(c);

  if (c >= 0x61 && c <= 0x7a)
    return c - 0x20;

  return c;
}

/**
 * Convert an ASCII hexadecimal digit byte to its numeric value.
 *
 * @param c - ASCII hexadecimal digit byte.
 * @returns A value from 0 to 15.
 * @throws {RangeError} `c` is outside the byte range.
 */
export function toXDigit(c: number): number {
  assertByte(c);

  if (c >= 0x41) {
    if (c >= 0x61)
      return c - (0x61 - 0x0a);

    return c - (0x41 - 0x0a);
  }

  return c - 0x30;
}

function hasType(c: number, type: CharType): boolean {
  return getType(c, type) !== 0;
}

function getType(c: number, type: CharType): number {
  assertByte(c);
  return table[c] & type;
}

function assertByte(c: number): void {
  if (!Number.isInteger(c) || c < 0 || c > 255)
    throw new RangeError(`byte ${c} out of range [0, 255]`);
}
