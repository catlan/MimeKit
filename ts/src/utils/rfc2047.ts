import { FormatOptions } from '../format-options.js';
import { ParserOptions } from '../parser-options.js';
import { Base64Decoder } from '../encodings/base64-decoder.js';
import { QuotedPrintableDecoder } from '../encodings/quoted-printable-decoder.js';
import { Rfc2047Base64Encoder } from '../encodings/rfc2047-base64-encoder.js';
import { QEncodeMode, Rfc2047QuotedPrintableEncoder } from '../encodings/rfc2047-quoted-printable-encoder.js';
import type { MimeDecoder } from '../encodings/types.js';
import type { Rfc2047Encoder } from '../encodings/rfc2047-encoder.js';
import type { CharsetEncoding } from './charset-utils.js';
import {
  convertToUnicode,
  getCodePage,
  getEncodingForCodePage,
  getMimeCharset,
  latin1,
  tryGetEncoding,
  utf8,
} from './charset-utils.js';
import { isAsciiAtom as byteIsAsciiAtom, isAtom as byteIsAtom, isCtrl as byteIsCtrl, isWhitespace } from './byte-extensions.js';

const quotedPrintablePhraseEncoder = new Rfc2047QuotedPrintableEncoder(QEncodeMode.Phrase);
const quotedPrintableTextEncoder = new Rfc2047QuotedPrintableEncoder(QEncodeMode.Text);
const base64Encoder = new Rfc2047Base64Encoder();
const asciiDecoder = new TextDecoder('ascii');

const enum TokenEncoding {
  SevenBit = 0x37,
  EightBit = 0x38,
}

class Token {
  readonly charsetCulture: string | null;
  readonly startIndex: number;
  readonly length: number;
  readonly encoding: number;
  readonly codePage: number;

  constructor(startIndex: number, length: number, is8bit?: boolean);
  constructor(charset: string, culture: string | null, encoding: number, startIndex: number, length: number);
  constructor(a: string | number, b: string | number | null, c?: number | boolean | null, d?: number, e?: number) {
    if (typeof a === 'string') {
      const charset = a;
      const culture = b as string | null;
      this.charsetCulture = culture === null || culture.length === 0 ? charset : `${charset}*${culture}`;
      this.codePage = getCodePage(charset);
      this.encoding = c as number;
      this.startIndex = d!;
      this.length = e!;
    } else {
      this.encoding = c === true ? TokenEncoding.EightBit : TokenEncoding.SevenBit;
      this.charsetCulture = null;
      this.startIndex = a;
      this.length = b as number;
      this.codePage = 0;
    }
  }

  get is8bit(): boolean {
    return this.codePage === 0 && this.encoding === TokenEncoding.EightBit;
  }

  get isEncoded(): boolean {
    return this.codePage !== 0;
  }
}

interface CodePageCount {
  codePage: number;
  count: number;
}

interface TokenWriter {
  readonly ignoreWhitespaceBetweenEncodedWords: boolean;
  write(output: StringBuilder, token: Token): void;
  flush(output: StringBuilder): void;
}

class StringBuilder {
  private value = '';

  get length(): number {
    return this.value.length;
  }

  charAt(index: number): string {
    return this.value[index]!;
  }

  append(value: string): void {
    this.value += value;
  }

  insert(index: number, value: string): void {
    this.value = this.value.slice(0, index) + value + this.value.slice(index);
  }

  toString(): string {
    return this.value;
  }
}

class TokenDecoder implements TokenWriter {
  readonly ignoreWhitespaceBetweenEncodedWords = true;
  private readonly codePages: CodePageCount[] = [];
  private readonly scratch: number[] = [];
  private qp: QuotedPrintableDecoder | null = null;
  private base64: Base64Decoder | null = null;
  private decoder: MimeDecoder | null = null;
  private curCodePage = 0;
  private encoding = 0;

  constructor(
    private readonly options: ParserOptions,
    private readonly input: Uint8Array,
  ) {}

  private addCodePage(codePage: number): void {
    for (let i = 0; i < this.codePages.length; i++) {
      if (this.codePages[i]!.codePage === codePage) {
        this.codePages[i]!.count++;
        return;
      }
    }

    this.codePages.push({ codePage, count: 1 });
  }

  write(output: StringBuilder, token: Token): void {
    const tokenEncoding = toUpper(token.encoding);
    if (this.decoder !== null && (token.codePage !== this.curCodePage || tokenEncoding !== this.encoding))
      this.flush(output);

    if (token.isEncoded) {
      this.encoding = tokenEncoding;
      this.curCodePage = token.codePage;
      if (this.encoding === 0x51)
        this.decoder = this.qp ??= new QuotedPrintableDecoder(true);
      else
        this.decoder = this.base64 ??= new Base64Decoder();

      this.addCodePage(this.curCodePage);

      const estimated = this.decoder.estimateOutputLength(token.length);
      const decoded = new Uint8Array(estimated);
      const n = this.decoder.decode(this.input, token.startIndex, token.length, decoded);
      for (let i = 0; i < n; i++) this.scratch.push(decoded[i]!);
    } else if (token.is8bit) {
      output.append(convertToUnicode(this.input.subarray(token.startIndex, token.startIndex + token.length), this.options.charsetEncoding));
    } else {
      const endIndex = token.startIndex + token.length;
      for (let i = token.startIndex; i < endIndex; i++)
        output.append(String.fromCharCode(this.input[i]!));
    }
  }

  flush(output: StringBuilder): void {
    this.decoder?.reset();
    this.decoder = null;

    if (this.scratch.length > 0) {
      // C#: CharsetUtils.ConvertToUnicode(options, codepage, ...) — an
      // unknown/unsupported codepage falls back to the utf-8 -> user-charset
      // -> latin1 probe, NOT to a single lossy decode (review blocker).
      const bytes = Uint8Array.from(this.scratch);
      const encoding = this.curCodePage !== -1 ? getEncodingForCodePage(this.curCodePage) : null;
      if (encoding !== null)
        output.append(encoding.decode(bytes));
      else
        output.append(convertToUnicode(bytes, this.options.charsetEncoding));
      this.scratch.length = 0;
    }
  }

  getMostCommonCodePage(): number {
    let codePage = 65001;
    let max = 0;

    for (let i = 0; i < this.codePages.length; i++) {
      if (this.codePages[i]!.count > max) {
        codePage = this.codePages[i]!.codePage;
        max = this.codePages[i]!.count;
      }
    }

    return codePage;
  }
}

class TokenFolder implements TokenWriter {
  readonly ignoreWhitespaceBetweenEncodedWords = false;
  private firstToken = true;
  private lineLength: number;
  private lwsp = 0;
  private tab = 0;

  constructor(
    private readonly options: FormatOptions,
    field: string,
    private readonly input: Uint8Array,
  ) {
    this.lineLength = field.length + 1;
  }

  write(output: StringBuilder, token: Token): void {
    if (this.firstToken) {
      output.append(' ');
      this.lineLength++;
    } else if (this.lineLength === 0) {
      output.append(' ');
      this.lineLength = 1;
    }

    if (isWhitespace(this.input[token.startIndex]!)) {
      for (let n = token.startIndex; n < token.startIndex + token.length; n++) {
        if (this.input[n] === 0x0d)
          continue;

        this.lwsp = output.length;
        if (this.input[n] === 0x09)
          this.tab = output.length;

        if (this.input[n] === 0x0a) {
          output.append(this.options.newLine);
          this.lwsp = this.tab = 0;
          this.lineLength = 0;
        } else {
          output.append(String.fromCharCode(this.input[n]!));
          this.lineLength++;
        }
      }

      this.firstToken = false;
    } else if (token.isEncoded) {
      const charset = token.charsetCulture!;

      if (this.lineLength + token.length + charset.length + 7 > this.options.maxLineLength) {
        if (this.tab !== 0) {
          output.insert(this.tab, this.options.newLine);
          this.lineLength = (this.lwsp - this.tab) + 1;
        } else if (this.lwsp !== 0) {
          output.insert(this.lwsp, this.options.newLine);
          this.lineLength = 1;
        } else if (this.lineLength > 1 && !this.firstToken) {
          output.append(this.options.newLine);
          output.append(' ');
          this.lineLength = 1;
        }
      }

      output.append('=?');
      output.append(charset);
      output.append('?');
      output.append(String.fromCharCode(token.encoding));
      output.append('?');

      for (let n = token.startIndex; n < token.startIndex + token.length; n++)
        output.append(String.fromCharCode(this.input[n]!));
      output.append('?=');

      this.lineLength += token.length + charset.length + 7;
      this.firstToken = false;
      this.lwsp = 0;
      this.tab = 0;
    } else if (this.lineLength + token.length > this.options.maxLineLength) {
      if (this.tab !== 0) {
        output.insert(this.tab, this.options.newLine);
        this.lineLength = (this.lwsp - this.tab) + 1;
      } else if (this.lwsp !== 0) {
        output.insert(this.lwsp, this.options.newLine);
        this.lineLength = 1;
      } else if (this.lineLength > 1 && !this.firstToken) {
        output.append(this.options.newLine);
        output.append(' ');
        this.lineLength = 1;
      }

      if (token.length >= this.options.maxLineLength) {
        for (let n = token.startIndex; n < token.startIndex + token.length; n++) {
          if (this.lineLength >= this.options.maxLineLength) {
            output.append(this.options.newLine);
            output.append(' ');
            this.lineLength = 1;
          }

          output.append(String.fromCharCode(this.input[n]!));
          this.lineLength++;
        }
      } else {
        for (let n = token.startIndex; n < token.startIndex + token.length; n++)
          output.append(String.fromCharCode(this.input[n]!));

        this.lineLength += token.length;
      }

      this.firstToken = false;
      this.lwsp = 0;
      this.tab = 0;
    } else {
      for (let n = token.startIndex; n < token.startIndex + token.length; n++)
        output.append(String.fromCharCode(this.input[n]!));

      this.lineLength += token.length;
      this.firstToken = false;
      this.lwsp = 0;
      this.tab = 0;
    }
  }

  flush(output: StringBuilder): void {
    if (output.length === 0 || output.charAt(output.length - 1) !== '\n')
      output.append(this.options.newLine);
  }
}

function isAscii(c: number): boolean {
  return c < 128;
}

function isAsciiAtom(c: number): boolean {
  return byteIsAsciiAtom(c);
}

function isAtomByte(c: number): boolean {
  return byteIsAtom(c);
}

function isBbQq(c: number): boolean {
  return c === 0x42 || c === 0x62 || c === 0x51 || c === 0x71;
}

function isLwsp(c: number): boolean {
  return isWhitespace(c);
}

function toUpper(c: number): number {
  return c >= 0x61 && c <= 0x7a ? c - 0x20 : c;
}

function tryGetEncodedWordToken(input: Uint8Array, word: number, length: number): Token | null {
  if (length < 7)
    return null;

  let inend = word + length - 2;
  let inptr = word;

  if (input[inptr++] !== 0x3d || input[inptr++] !== 0x3f || input[inend++] !== 0x3f || input[inend++] !== 0x3d)
    return null;

  inend -= 2;

  if (input[inptr] === 0x3f || input[inptr] === 0x2a)
    return null;

  let charset = '';
  let culture: string | null;

  while (input[inptr] !== 0x3f && input[inptr] !== 0x2a) {
    if (!isAsciiAtom(input[inptr]!))
      return null;

    charset += String.fromCharCode(input[inptr]!);
    inptr++;
  }

  if (input[inptr] === 0x2a) {
    inptr++;
    culture = '';

    while (input[inptr] !== 0x3f) {
      if (!isAsciiAtom(input[inptr]!))
        return null;

      culture += String.fromCharCode(input[inptr]!);
      inptr++;
    }
  } else {
    culture = null;
  }

  inptr++;

  let encoding: number;
  if (input[inptr] === 0x42 || input[inptr] === 0x62 || input[inptr] === 0x51 || input[inptr] === 0x71) {
    encoding = input[inptr++]!;
  } else {
    return null;
  }

  if (input[inptr] !== 0x3f || inptr === inend)
    return null;

  inptr++;

  const start = inptr;
  const len = inend - inptr;

  return new Token(charset, culture, encoding, start, len);
}

function tokenizePhrase(options: ParserOptions, writer: TokenWriter, decoded: StringBuilder, inbuf: Uint8Array, startIndex: number, length: number): void {
  let inptr = startIndex;
  const inend = inptr + length;
  let encoded = false;
  let ascii: boolean;
  let n: number;

  while (inptr < inend) {
    const text = inptr;
    while (inptr < inend && isLwsp(inbuf[inptr]!))
      inptr++;

    const lwsp = new Token(text, inptr - text);

    const word = inptr;
    ascii = true;
    if (inptr < inend && isAsciiAtom(inbuf[inptr]!)) {
      if (options.rfc2047ComplianceMode === 'loose') {
        let isRfc2047 = false;

        if (inptr + 2 < inend && inbuf[inptr] === 0x3d && inbuf[inptr + 1] === 0x3f) {
          inptr += 2;

          while (inptr < inend && inbuf[inptr] !== 0x3f) {
            ascii = ascii && isAscii(inbuf[inptr]!);
            inptr++;
          }

          if (inptr + 3 >= inend || inbuf[inptr] !== 0x3f || !isBbQq(inbuf[inptr + 1]!) || inbuf[inptr + 2] !== 0x3f) {
            ascii = true;
          } else {
            inptr += 3;

            while (inptr + 2 < inend && !(inbuf[inptr] === 0x3f && inbuf[inptr + 1] === 0x3d)) {
              ascii = ascii && isAscii(inbuf[inptr]!);
              inptr++;
            }

            if (inptr + 2 > inend || inbuf[inptr] !== 0x3f || inbuf[inptr + 1] !== 0x3d) {
              inptr = word + 2;
              ascii = true;
            } else {
              isRfc2047 = true;
              inptr += 2;
            }
          }
        }

        if (!isRfc2047) {
          while (inptr < inend && isAtomByte(inbuf[inptr]!)) {
            if (inptr + 2 < inend && inbuf[inptr] === 0x3d && inbuf[inptr + 1] === 0x3f)
              break;
            ascii = ascii && isAscii(inbuf[inptr]!);
            inptr++;
          }
        }
      } else {
        while (inptr < inend && isAsciiAtom(inbuf[inptr]!))
          inptr++;
      }

      n = inptr - word;
      const maybeToken = tryGetEncodedWordToken(inbuf, word, n);
      if (maybeToken !== null) {
        if ((!encoded || !writer.ignoreWhitespaceBetweenEncodedWords) && lwsp.length > 0)
          writer.write(decoded, lwsp);

        writer.write(decoded, maybeToken);
        encoded = true;
      } else {
        if (lwsp.length > 0)
          writer.write(decoded, lwsp);

        const token = new Token(word, n, !ascii);
        writer.write(decoded, token);

        encoded = false;
      }
    } else {
      if (lwsp.length > 0)
        writer.write(decoded, lwsp);

      ascii = true;
      while (inptr < inend && !isLwsp(inbuf[inptr]!) && !isAsciiAtom(inbuf[inptr]!)) {
        ascii = ascii && isAscii(inbuf[inptr]!);
        inptr++;
      }

      const token = new Token(word, inptr - word, !ascii);
      writer.write(decoded, token);

      encoded = false;
    }
  }

  writer.flush(decoded);
}

function tokenizeText(options: ParserOptions, writer: TokenWriter, output: StringBuilder, inbuf: Uint8Array, startIndex: number, length: number): void {
  let inptr = startIndex;
  const inend = inptr + length;
  let encoded = false;
  let ascii: boolean;
  let n: number;

  while (inptr < inend) {
    const text = inptr;
    while (inptr < inend && isLwsp(inbuf[inptr]!))
      inptr++;

    const lwsp = new Token(text, inptr - text);

    if (inptr < inend) {
      const word = inptr;
      ascii = true;

      if (options.rfc2047ComplianceMode === 'loose') {
        let isRfc2047 = false;

        if (inptr + 2 < inend && inbuf[inptr] === 0x3d && inbuf[inptr + 1] === 0x3f) {
          inptr += 2;

          while (inptr < inend && inbuf[inptr] !== 0x3f) {
            ascii = ascii && isAscii(inbuf[inptr]!);
            inptr++;
          }

          if (inptr + 3 >= inend || inbuf[inptr] !== 0x3f || !isBbQq(inbuf[inptr + 1]!) || inbuf[inptr + 2] !== 0x3f) {
            ascii = true;
          } else {
            inptr += 3;

            while (inptr + 2 < inend && !(inbuf[inptr] === 0x3f && inbuf[inptr + 1] === 0x3d)) {
              ascii = ascii && isAscii(inbuf[inptr]!);
              inptr++;
            }

            if (inptr + 2 > inend || inbuf[inptr] !== 0x3f || inbuf[inptr + 1] !== 0x3d) {
              inptr = word + 2;
              ascii = true;
            } else {
              isRfc2047 = true;
              inptr += 2;
            }
          }
        }

        if (!isRfc2047) {
          while (inptr < inend && !isLwsp(inbuf[inptr]!)) {
            if (inptr + 2 < inend && inbuf[inptr] === 0x3d && inbuf[inptr + 1] === 0x3f)
              break;

            ascii = ascii && isAscii(inbuf[inptr]!);
            inptr++;
          }
        }
      } else {
        while (inptr < inend && !isLwsp(inbuf[inptr]!)) {
          ascii = ascii && isAscii(inbuf[inptr]!);
          inptr++;
        }
      }

      n = inptr - word;
      const maybeToken = tryGetEncodedWordToken(inbuf, word, n);
      if (maybeToken !== null) {
        if ((!encoded || !writer.ignoreWhitespaceBetweenEncodedWords) && lwsp.length > 0)
          writer.write(output, lwsp);

        writer.write(output, maybeToken);
        encoded = true;
      } else {
        if (lwsp.length > 0)
          writer.write(output, lwsp);

        const token = new Token(word, n, !ascii);
        writer.write(output, token);

        encoded = false;
      }
    } else {
      if (lwsp.length > 0)
        writer.write(output, lwsp);

      break;
    }
  }

  writer.flush(output);
}

function validateByteRange(input: Uint8Array, startIndex: number, count: number): void {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > input.length)
    throw new RangeError(`startIndex ${startIndex} out of range [0, ${input.length}]`);
  if (!Number.isInteger(count) || count < 0 || startIndex + count > input.length)
    throw new RangeError(`count ${count} out of range [0, ${input.length - startIndex}]`);
}

export interface DecodedHeaderValue {
  readonly value: string;
  readonly codePage: number;
}

export function decodePhrase(options: ParserOptions, phrase: Uint8Array, startIndex: number, count: number): string;
export function decodePhrase(options: ParserOptions, phrase: Uint8Array): string;
export function decodePhrase(phrase: Uint8Array, startIndex?: number, count?: number): string;
export function decodePhrase(a: ParserOptions | Uint8Array, b?: Uint8Array | number, c?: number, d?: number): string {
  let options: ParserOptions;
  let phrase: Uint8Array;
  let startIndex: number;
  let count: number;

  if (a instanceof ParserOptions) {
    options = a;
    phrase = b as Uint8Array;
    startIndex = c ?? 0;
    count = d ?? phrase.length - startIndex;
  } else {
    options = ParserOptions.default;
    phrase = a;
    startIndex = typeof b === 'number' ? b : 0;
    count = c ?? phrase.length - startIndex;
  }

  return decodePhraseWithCodePage(options, phrase, startIndex, count).value;
}

export function decodePhraseWithCodePage(options: ParserOptions, phrase: Uint8Array, startIndex = 0, count = phrase.length - startIndex): DecodedHeaderValue {
  validateByteRange(phrase, startIndex, count);
  if (count === 0)
    return { value: '', codePage: 65001 };

  const decoder = new TokenDecoder(options, phrase);
  const decoded = new StringBuilder();

  tokenizePhrase(options, decoder, decoded, phrase, startIndex, count);
  return { value: decoded.toString(), codePage: decoder.getMostCommonCodePage() };
}

export function decodeText(options: ParserOptions, text: Uint8Array, startIndex: number, count: number): string;
export function decodeText(options: ParserOptions, text: Uint8Array): string;
export function decodeText(text: Uint8Array, startIndex?: number, count?: number): string;
export function decodeText(a: ParserOptions | Uint8Array, b?: Uint8Array | number, c?: number, d?: number): string {
  let options: ParserOptions;
  let text: Uint8Array;
  let startIndex: number;
  let count: number;

  if (a instanceof ParserOptions) {
    options = a;
    text = b as Uint8Array;
    startIndex = c ?? 0;
    count = d ?? text.length - startIndex;
  } else {
    options = ParserOptions.default;
    text = a;
    startIndex = typeof b === 'number' ? b : 0;
    count = c ?? text.length - startIndex;
  }

  return decodeTextWithCodePage(options, text, startIndex, count).value;
}

export function decodeTextWithCodePage(options: ParserOptions, text: Uint8Array, startIndex = 0, count = text.length - startIndex): DecodedHeaderValue {
  validateByteRange(text, startIndex, count);
  if (count === 0)
    return { value: '', codePage: 65001 };

  const decoder = new TokenDecoder(options, text);
  const decoded = new StringBuilder();

  tokenizeText(options, decoder, decoded, text, startIndex, count);
  return { value: decoded.toString(), codePage: decoder.getMostCommonCodePage() };
}

export function foldUnstructuredHeader(options: FormatOptions, field: string, text: Uint8Array): Uint8Array {
  const output = new StringBuilder();
  const folder = new TokenFolder(options, field, text);
  tokenizeText(ParserOptions.default, folder, output, text, 0, text.length);
  return asciiBytes(output.toString());
}

function charsetConvert(charset: CharsetEncoding, text: string, startIndex: number, length: number): Uint8Array {
  return charset.encode(text.slice(startIndex, startIndex + length));
}

function getBestContentEncoding(text: Uint8Array, startIndex: number, length: number): 'quoted-printable' | 'base64' {
  let count = 0;

  for (let i = startIndex; i < startIndex + length; i++) {
    if (text[i]! > 127)
      count++;
  }

  if (count < length * 0.17)
    return 'quoted-printable';

  return 'base64';
}

function charsetRequiresBase64(encoding: CharsetEncoding): boolean {
  return encoding.codePage === 50220 || encoding.codePage === 50222;
}

function appendEncodedWord(builder: StringBuilder, charset: CharsetEncoding, text: string, startIndex: number, length: number, mode: QEncodeMode): number {
  const startLength = builder.length;
  let encoder: Rfc2047Encoder;
  let word: Uint8Array;

  try {
    word = charsetConvert(charset, text, startIndex, length);
  } catch {
    charset = utf8;
    word = charsetConvert(charset, text, startIndex, length);
  }

  if (charsetRequiresBase64(charset) || getBestContentEncoding(word, 0, word.length) === 'base64') {
    encoder = base64Encoder;
  } else if (mode === QEncodeMode.Phrase) {
    encoder = quotedPrintablePhraseEncoder;
  } else {
    encoder = quotedPrintableTextEncoder;
  }

  const encoded = new Uint8Array(encoder.estimateOutputLength(word.length));
  const len = encoder.encode(word, 0, word.length, encoded);

  builder.append('=?');
  builder.append(getMimeCharset(charset));
  builder.append('?');
  builder.append(encoder.encoding);
  builder.append('?');

  for (let i = 0; i < len; i++)
    builder.append(String.fromCharCode(encoded[i]!));
  builder.append('?=');

  return builder.length - startLength;
}

function appendQuoted(str: StringBuilder, text: string, startIndex: number, length: number): void {
  const lastIndex = startIndex + length;

  str.append('"');

  for (let i = startIndex; i < lastIndex; i++) {
    const c = text[i]!;

    if (c === '"' || c === '\\')
      str.append('\\');

    str.append(c);
  }

  str.append('"');
}

const enum WordType {
  Atom,
  QuotedString,
  EncodedWord,
}

const enum WordEncoding {
  Ascii,
  Latin1,
  UserSpecified,
}

class Word {
  type = WordType.Atom;
  startIndex: number;
  charCount = 0;
  encoding = WordEncoding.Ascii;
  byteCount = 0;
  encodeCount = 0;
  quotedPairs = 0;
  isQuotedStart = false;
  isQuotedEnd = false;
  isCommentStart = false;
  isCommentEnd = false;

  constructor(startIndex: number) {
    this.startIndex = startIndex;
  }

  copyTo(word: Word): void {
    word.isQuotedStart = this.isQuotedStart;
    word.isQuotedEnd = this.isQuotedEnd;
    word.isCommentStart = this.isCommentStart;
    word.isCommentEnd = this.isCommentEnd;
    word.encodeCount = this.encodeCount;
    word.quotedPairs = this.quotedPairs;
    word.startIndex = this.startIndex;
    word.charCount = this.charCount;
    word.byteCount = this.byteCount;
    word.encoding = this.encoding;
    word.type = this.type;
  }
}

function isAtom(c: string): boolean {
  return byteIsAtom(c.charCodeAt(0) & 0xff);
}

function isBlank(c: string): boolean {
  return c === ' ' || c === '\t';
}

function isCtrl(c: string): boolean {
  return byteIsCtrl(c.charCodeAt(0) & 0xff);
}

function estimateEncodedWordLength(charset: string | CharsetEncoding, byteCount: number, encodeCount: number): number {
  const charsetName = typeof charset === 'string' ? charset : getMimeCharset(charset);
  const length = charsetName.length + 7;

  if (encodeCount < byteCount * 0.17)
    return length + (byteCount - encodeCount) + (encodeCount * 3);

  return length + Math.floor((byteCount + 2) / 3) * 4;
}

function exceedsMaxLineLength(options: FormatOptions, charset: CharsetEncoding, word: Word): boolean {
  let length: number;

  switch (word.type) {
  case WordType.EncodedWord:
    switch (word.encoding) {
    case WordEncoding.Latin1:
      length = estimateEncodedWordLength('iso-8859-1', word.byteCount, word.encodeCount);
      break;
    case WordEncoding.Ascii:
      length = estimateEncodedWordLength('us-ascii', word.byteCount, word.encodeCount);
      break;
    default:
      length = estimateEncodedWordLength(charset, word.byteCount, word.encodeCount);
      break;
    }
    break;
  case WordType.QuotedString:
    length = word.byteCount + word.quotedPairs + 2;
    break;
  default:
    length = word.byteCount;
    break;
  }

  return length + 1 >= options.maxLineLength;
}

function getRfc822Words(options: FormatOptions, charset: CharsetEncoding, text: string, startIndex: number, count: number, phrase: boolean): Word[] {
  const saved = new Word(startIndex);
  let word = new Word(startIndex);
  const words: Word[] = [];
  let nchars: number;
  let n: number;
  let commentDepth = 0;
  let escaped = false;
  let quoted = false;
  let c: string;

  const endIndex = startIndex + count;
  let i = startIndex;

  while (i < endIndex) {
    c = text[i++]!;

    if (!quoted && commentDepth === 0 && isBlank(c)) {
      if (word.byteCount > 0) {
        words.push(word);
        word = new Word(i);
      } else {
        word.startIndex = i;
      }
    } else {
      word.copyTo(saved);

      if (c.charCodeAt(0) < 127) {
        if (isCtrl(c)) {
          word.encoding = Math.max(word.encoding, WordEncoding.Latin1);
          word.type = WordType.EncodedWord;
          word.encodeCount++;
        } else if (phrase && !isAtom(c)) {
          if (word.type === WordType.Atom)
            word.type = WordType.QuotedString;

          if (c === '\\') {
            word.quotedPairs++;
            escaped = !escaped;
          } else if (c === '"') {
            if (!escaped) {
              quoted = !quoted;
              if (quoted) {
                word.isQuotedStart = true;
              } else {
                word.isQuotedEnd = true;
              }
            }
            word.quotedPairs++;
            escaped = false;
          } else if (!quoted) {
            if (c === '(') {
              word.isCommentStart = commentDepth === 0;
              commentDepth++;
            } else if (c === ')' && commentDepth > 0) {
              commentDepth--;
              word.isCommentEnd = commentDepth === 0;
            }
          } else {
            escaped = false;
          }
        }

        word.byteCount++;
        word.charCount++;
        nchars = 1;
      } else if (c.charCodeAt(0) < 256) {
        word.encoding = Math.max(word.encoding, WordEncoding.Latin1);
        word.type = WordType.EncodedWord;
        word.encodeCount++;
        word.byteCount++;
        word.charCount++;
        nchars = 1;
      } else {
        const first = c.charCodeAt(0);
        const second = i < endIndex ? text.charCodeAt(i) : 0;
        if (first >= 0xd800 && first <= 0xdbff && second >= 0xdc00 && second <= 0xdfff) {
          i++;
          nchars = 2;
        } else {
          nchars = 1;
        }

        try {
          n = charset.encode(text.slice(i - nchars, i)).length;
        } catch {
          n = 3 * nchars;
        }

        word.encoding = WordEncoding.UserSpecified;
        word.type = WordType.EncodedWord;
        word.charCount += nchars;
        word.encodeCount += n;
        word.byteCount += n;
      }

      if (exceedsMaxLineLength(options, charset, word)) {
        saved.copyTo(word);
        i -= nchars;

        if (word.type === WordType.Atom) {
          word.type = WordType.EncodedWord;
          n = 'us-ascii'.length + 7;
          word.charCount -= n;
          word.byteCount -= n;
          i -= n;
        }

        words.push(word);

        saved.type = word.type;
        word = new Word(i);
        word.type = saved.type;
      } else if (word.isQuotedEnd || word.isCommentEnd) {
        if (word.type === WordType.EncodedWord) {
          if (word.isQuotedEnd && !word.isQuotedStart) {
            for (let j = words.length - 1; j >= 0; j--) {
              words[j]!.type = WordType.EncodedWord;
              if (words[j]!.isQuotedStart)
                break;
            }
          } else if (word.isCommentEnd && !word.isCommentStart) {
            for (let j = words.length - 1; j >= 0; j--) {
              words[j]!.type = WordType.EncodedWord;
              if (words[j]!.isCommentStart)
                break;
            }
          }
        }

        words.push(word);

        word = new Word(i);
      }
    }
  }

  if (word.byteCount > 0)
    words.push(word);

  return words;
}

function shouldMergeWords(options: FormatOptions, charset: CharsetEncoding, words: Word[], word: Word, i: number): boolean {
  const next = words[i]!;

  const lwspCount = next.startIndex - (word.startIndex + word.charCount);
  let length = word.byteCount + lwspCount + next.byteCount;
  const encoded = word.encodeCount + next.encodeCount;

  switch (word.type) {
  case WordType.Atom:
    if (next.type === WordType.EncodedWord)
      return false;

    return length + 1 < options.maxLineLength;
  case WordType.QuotedString:
    if (next.type === WordType.EncodedWord)
      return false;

    return true;
  case WordType.EncodedWord:
    if (next.type === WordType.Atom) {
      let merge = false;
      let natoms = 0;

      for (let j = i + 1; j < words.length && natoms < 3; j++) {
        if (words[j]!.type !== WordType.Atom) {
          merge = true;
          break;
        }

        natoms++;
      }

      if (!merge)
        return false;
    }

    if (next.type === WordType.QuotedString)
      return false;

    switch (Math.max(word.encoding, next.encoding)) {
    case WordEncoding.Latin1:
      length = estimateEncodedWordLength('iso-8859-1', length, encoded);
      break;
    case WordEncoding.Ascii:
      length = estimateEncodedWordLength('us-ascii', length, encoded);
      break;
    default:
      length = estimateEncodedWordLength(charset, length, encoded);
      break;
    }

    return length + 1 < options.maxLineLength;
  default:
    return false;
  }
}

function mergeWord(word: Word, next: Word): void {
  const lwspCount = next.startIndex - (word.startIndex + word.charCount);

  word.type = Math.max(word.type, next.type);
  word.charCount = (next.startIndex + next.charCount) - word.startIndex;
  word.byteCount = word.byteCount + lwspCount + next.byteCount;
  word.encoding = Math.max(word.encoding, next.encoding);
  word.encodeCount += next.encodeCount;
  word.quotedPairs += next.quotedPairs;
}

function mergeAdjacent(options: FormatOptions, charset: CharsetEncoding, words: Word[]): Word[] {
  const merged: Word[] = [];
  let word: Word;
  let next: Word;

  word = words[0]!;
  merged.push(word);

  for (let i = 1; i < words.length; i++) {
    next = words[i]!;

    if (word.type !== WordType.Atom && word.type === next.type) {
      const encoding = Math.max(word.encoding, next.encoding);
      const lwspCount = next.startIndex - (word.startIndex + word.charCount);
      const byteCount = word.byteCount + lwspCount + next.byteCount;
      const encoded = word.encodeCount + next.encodeCount;
      const quoted = word.quotedPairs + next.quotedPairs;
      let length: number;

      if (word.type === WordType.EncodedWord) {
        switch (encoding) {
        case WordEncoding.Latin1:
          length = estimateEncodedWordLength('iso-8859-1', byteCount, encoded);
          break;
        case WordEncoding.Ascii:
          length = estimateEncodedWordLength('us-ascii', byteCount, encoded);
          break;
        default:
          length = estimateEncodedWordLength(charset, byteCount, encoded);
          break;
        }
      } else {
        length = byteCount + quoted + 2;
      }

      if (length + 1 < options.maxLineLength) {
        word.charCount = (next.startIndex + next.charCount) - word.startIndex;
        word.byteCount = byteCount;
        word.encodeCount = encoded;
        word.quotedPairs = quoted;
        word.encoding = encoding;
        continue;
      }
    }

    merged.push(next);
    word = next;
  }

  return merged;
}

function merge(options: FormatOptions, charset: CharsetEncoding, words: Word[]): Word[] {
  if (words.length < 2)
    return words;

  let merged: Word[];
  let word: Word;
  let next: Word;

  merged = mergeAdjacent(options, charset, words);
  words = merged;

  merged = [];
  word = words[0]!;
  merged.push(word);

  for (let i = 1; i < words.length; i++) {
    next = words[i]!;

    if (shouldMergeWords(options, charset, words, word, i)) {
      mergeWord(word, next);
    } else {
      merged.push(next);
      word = next;
    }
  }

  return merged;
}

const enum EncodeType {
  Phrase,
  Text,
  Comment,
}

function encode(builder: StringBuilder, options: FormatOptions, charset: CharsetEncoding, text: string, startIndex: number, count: number, type: EncodeType): void {
  const mode = type === EncodeType.Phrase ? QEncodeMode.Phrase : QEncodeMode.Text;
  let words = getRfc822Words(options, charset, text, startIndex, count, type === EncodeType.Phrase);
  let start: number;
  let length: number;
  let prev: Word | null = null;

  words = merge(options, charset, words);

  if (!options.allowMixedHeaderCharsets) {
    for (let i = 0; i < words.length; i++) {
      if (words[i]!.type === WordType.EncodedWord)
        words[i]!.encoding = WordEncoding.UserSpecified;
    }
  }

  if (type === EncodeType.Comment)
    builder.append('(');

  for (const word of words) {
    if (prev !== null && !(prev.type === WordType.EncodedWord && word.type === WordType.EncodedWord)) {
      start = prev.startIndex + prev.charCount;
      length = word.startIndex - start;
      builder.append(text.slice(start, start + length));
    }

    switch (word.type) {
    case WordType.Atom:
      builder.append(text.slice(word.startIndex, word.startIndex + word.charCount));
      break;
    case WordType.QuotedString:
      appendQuoted(builder, text, word.startIndex, word.charCount);
      break;
    case WordType.EncodedWord:
      if (prev !== null && prev.type === WordType.EncodedWord) {
        start = prev.startIndex + prev.charCount;
        length = (word.startIndex + word.charCount) - start;

        builder.append(type === EncodeType.Phrase ? '\t' : ' ');
      } else {
        start = word.startIndex;
        length = word.charCount;
      }

      switch (word.encoding) {
      case WordEncoding.Ascii:
        appendEncodedWord(builder, getEncodingForCodePage(20127)!, text, start, length, mode);
        break;
      case WordEncoding.Latin1:
        appendEncodedWord(builder, latin1, text, start, length, mode);
        break;
      default:
        appendEncodedWord(builder, charset, text, start, length, mode);
        break;
      }
      break;
    }

    prev = word;
  }

  if (type === EncodeType.Comment)
    builder.append(')');
}

function encodeAsString(options: FormatOptions, charset: CharsetEncoding, text: string, startIndex: number, count: number, type: EncodeType): string {
  const builder = new StringBuilder();
  encode(builder, options, charset, text, startIndex, count, type);
  return builder.toString();
}

function encodeAsBytes(options: FormatOptions, charset: CharsetEncoding, text: string, startIndex: number, count: number, type: EncodeType): Uint8Array {
  return asciiBytes(encodeAsString(options, charset, text, startIndex, count, type));
}

function validateEncodeArguments(options: FormatOptions, charset: CharsetEncoding, text: string, startIndex: number, count: number): void {
  if (!(options instanceof FormatOptions))
    throw new TypeError('options must be a FormatOptions');
  if (charset === null || charset === undefined)
    throw new TypeError('charset must be a CharsetEncoding');
  if (typeof text !== 'string')
    throw new TypeError('text must be a string');
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > text.length)
    throw new RangeError(`startIndex ${startIndex} out of range [0, ${text.length}]`);
  if (!Number.isInteger(count) || count < 0 || count > text.length - startIndex)
    throw new RangeError(`count ${count} out of range [0, ${text.length - startIndex}]`);
}

function normalizeCharset(charset: CharsetEncoding | string): CharsetEncoding {
  if (typeof charset === 'string')
    return tryGetEncoding(charset) ?? utf8;
  return charset;
}

export function encodeComment(options: FormatOptions, charset: CharsetEncoding | string, text: string, startIndex = 0, count = text.length - startIndex): string {
  const encoding = normalizeCharset(charset);
  validateEncodeArguments(options, encoding, text, startIndex, count);
  return encodeAsString(options, encoding, text, startIndex, count, EncodeType.Comment);
}

export function encodePhraseAsString(options: FormatOptions, charset: CharsetEncoding | string, phrase: string): string {
  const encoding = normalizeCharset(charset);
  validateEncodeArguments(options, encoding, phrase, 0, phrase.length);
  return encodeAsString(options, encoding, phrase, 0, phrase.length, EncodeType.Phrase);
}

export function encodePhrase(options: FormatOptions, charset: CharsetEncoding | string, phrase: string, startIndex: number, count: number): Uint8Array;
export function encodePhrase(options: FormatOptions, charset: CharsetEncoding | string, phrase: string): Uint8Array;
export function encodePhrase(charset: CharsetEncoding | string, phrase: string, startIndex?: number, count?: number): Uint8Array;
export function encodePhrase(a: FormatOptions | CharsetEncoding | string, b: CharsetEncoding | string, c?: string | number, d?: number, e?: number): Uint8Array {
  const hasOptions = a instanceof FormatOptions;
  const options = hasOptions ? a : FormatOptions.default;
  const charset = normalizeCharset(hasOptions ? b as CharsetEncoding | string : a as CharsetEncoding | string);
  const phrase = hasOptions ? c as string : b as string;
  const startIndex = hasOptions ? d ?? 0 : c as number | undefined ?? 0;
  const count = hasOptions ? e ?? phrase.length - startIndex : d ?? phrase.length - startIndex;
  validateEncodeArguments(options, charset, phrase, startIndex, count);
  return encodeAsBytes(options, charset, phrase, startIndex, count, EncodeType.Phrase);
}

export function encodeText(options: FormatOptions, charset: CharsetEncoding | string, text: string, startIndex: number, count: number): Uint8Array;
export function encodeText(options: FormatOptions, charset: CharsetEncoding | string, text: string): Uint8Array;
export function encodeText(charset: CharsetEncoding | string, text: string, startIndex?: number, count?: number): Uint8Array;
export function encodeText(a: FormatOptions | CharsetEncoding | string, b: CharsetEncoding | string, c?: string | number, d?: number, e?: number): Uint8Array {
  const hasOptions = a instanceof FormatOptions;
  const options = hasOptions ? a : FormatOptions.default;
  const charset = normalizeCharset(hasOptions ? b as CharsetEncoding | string : a as CharsetEncoding | string);
  const text = hasOptions ? c as string : b as string;
  const startIndex = hasOptions ? d ?? 0 : c as number | undefined ?? 0;
  const count = hasOptions ? e ?? text.length - startIndex : d ?? text.length - startIndex;
  validateEncodeArguments(options, charset, text, startIndex, count);
  return encodeAsBytes(options, charset, text, startIndex, count, EncodeType.Text);
}

function asciiBytes(text: string): Uint8Array {
  // C#: Encoding.ASCII.GetBytes — non-ASCII chars become '?'.
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    bytes[i] = c > 0x7f ? 0x3f : c;
  }
  return bytes;
}

export function asciiString(bytes: Uint8Array): string {
  return asciiDecoder.decode(bytes);
}
