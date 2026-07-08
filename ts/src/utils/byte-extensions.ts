export const enum CharType {
  None = 0,
  IsAscii = 1 << 0,
  IsAtom = 1 << 1,
  IsAttrChar = 1 << 2,
  IsBlank = 1 << 3,
  IsControl = 1 << 4,
  IsDomainSafe = 1 << 5,
  IsEncodedPhraseSafe = 1 << 6,
  IsEncodedWordSafe = 1 << 7,
  IsQuotedPrintableSafe = 1 << 8,
  IsSpace = 1 << 9,
  IsSpecial = 1 << 10,
  IsTokenSpecial = 1 << 11,
  IsWhitespace = 1 << 12,
  IsXDigit = 1 << 13,
  IsPhraseAtom = 1 << 14,
  IsFieldText = 1 << 15,

  IsAsciiAtom = IsAscii | IsAtom,
}

const ATOM_SAFE = "!#$%&'*+-/=?^_`{|}~";
const ATTRIBUTE_SPECIALS = "*'%";
const ENCODED_WORD_SPECIALS = '()<>@,;:"/[]?.=_';
const ENCODED_PHRASE_SAFE = '!*+-/';
const SPECIALS = '()<>[]:;@\\,."';
export const TOKEN_SPECIALS = '()<>@,;:\\"/[]?=';
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

export function isAscii(c: number): boolean {
  return hasType(c, CharType.IsAscii);
}

export function isAsciiAtom(c: number): boolean {
  return getType(c, CharType.IsAsciiAtom) === CharType.IsAsciiAtom;
}

export function isPhraseAtom(c: number): boolean {
  return hasType(c, CharType.IsPhraseAtom);
}

export function isAtom(c: number): boolean {
  return hasType(c, CharType.IsAtom);
}

export function isAttr(c: number): boolean {
  return hasType(c, CharType.IsAttrChar);
}

export function isBlank(c: number): boolean {
  return hasType(c, CharType.IsBlank);
}

export function isCtrl(c: number): boolean {
  return hasType(c, CharType.IsControl);
}

export function isDomain(c: number): boolean {
  return hasType(c, CharType.IsDomainSafe);
}

export function isFieldText(c: number): boolean {
  return hasType(c, CharType.IsFieldText);
}

export function isQpSafe(c: number): boolean {
  return hasType(c, CharType.IsQuotedPrintableSafe);
}

export function isToken(c: number): boolean {
  return getType(c, CharType.IsTokenSpecial | CharType.IsWhitespace | CharType.IsControl) === 0;
}

export function isTokenSpecial(c: number): boolean {
  return hasType(c, CharType.IsTokenSpecial);
}

export function isType(c: number, type: CharType): boolean {
  return hasType(c, type);
}

export function isWhitespace(c: number): boolean {
  return hasType(c, CharType.IsWhitespace);
}

export function isXDigit(c: number): boolean {
  return hasType(c, CharType.IsXDigit);
}

export function toLower(c: number): number {
  assertByte(c);

  if (c >= 0x41 && c <= 0x5a)
    return c + 0x20;

  return c;
}

export function toUpper(c: number): number {
  assertByte(c);

  if (c >= 0x61 && c <= 0x7a)
    return c - 0x20;

  return c;
}

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
