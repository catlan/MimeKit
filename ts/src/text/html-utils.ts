// Port of MimeKit/Text/HtmlUtils.cs.
//
// Overload note: C# distinguishes string / char[] / ReadOnlySpan<char> overloads
// which are indistinguishable in TS (all become `string`). They are collapsed
// here; the observable validation and encoding behaviour is preserved. The
// TextWriter overloads are kept and disambiguated by the first argument.

import type { TextWriter } from './text-io.js';
import { StringWriter } from './text-io.js';
import { HtmlEntityDecoder } from './html-entity-decoder.js';

// https://dev.w3.org/html5/spec-LC/tokenization.html#attribute-name-state
const InvalidAttributeNameCharacters = "\0\t\r\n\f /=>\"'<";

// https://dev.w3.org/html5/spec-LC/tokenization.html#tag-name-state
const InvalidTagNameCharacters = '\0\t\r\n\f />';

function isSurrogate(c: number): boolean {
  return c >= 0xd800 && c <= 0xdfff;
}

function isSurrogatePair(hi: number, lo: number): boolean {
  return hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff;
}

function convertToUtf32(hi: number, lo: number): number {
  return (hi - 0xd800) * 0x400 + (lo - 0xdc00) + 0x10000;
}

function isTextWriter(value: unknown): value is TextWriter {
  return typeof value === 'object' && value !== null && typeof (value as TextWriter).write === 'function';
}

/**
 * Check whether a string is a valid HTML attribute name.
 * @param name The attribute name.
 * @returns `true` if the name is valid; otherwise, `false`.
 */
export function isValidAttributeName(name: string): boolean {
  if (name === null || name === undefined || name.length === 0) return false;

  for (let i = 0; i < name.length; i++) {
    if (InvalidAttributeNameCharacters.indexOf(name[i]!) !== -1) return false;
  }

  return true;
}

/**
 * Check whether a string is a valid HTML tag name.
 * @param name The tag name.
 * @returns `true` if the name is valid; otherwise, `false`.
 */
export function isValidTagName(name: string): boolean {
  if (name === null || name === undefined || name.length === 0) return false;

  for (let i = 0; i < name.length; i++) {
    if (InvalidTagNameCharacters.indexOf(name[i]!) !== -1) return false;
  }

  return true;
}

function indexOfHtmlEncodeAttributeChar(value: string, quote: number): number {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);

    switch (c) {
      case 0x09: case 0x0d: case 0x0a: case 0x0c: break; // \t \r \n \f
      case 0x26: case 0x3c: case 0x3e: // & < >
        return i;
      default:
        if (c === quote || c < 32 || c >= 127) return i;
        break;
    }
  }

  return value.length;
}

function encodeAttribute(output: TextWriter, value: string, quote: number): void {
  let index = indexOfHtmlEncodeAttributeChar(value, quote);

  output.write(String.fromCharCode(quote));

  if (index > 0) output.write(value.slice(0, index));

  while (index < value.length) {
    const c = value.charCodeAt(index++);
    let unichar: number;

    switch (c) {
      case 0x09: case 0x0d: case 0x0a: case 0x0c: output.write(String.fromCharCode(c)); break;
      case 0x27: output.write(c === quote ? '&#39;' : "'"); break; // '
      case 0x22: output.write(c === quote ? '&quot;' : '"'); break; // "
      case 0x26: output.write('&amp;'); break;
      case 0x3c: output.write('&lt;'); break;
      case 0x3e: output.write('&gt;'); break;
      default:
        if (c < 32 || (c >= 127 && c < 160)) {
          // illegal control character
          break;
        }

        if (c > 255 && isSurrogate(c)) {
          if (index < value.length && isSurrogatePair(c, value.charCodeAt(index))) {
            unichar = convertToUtf32(c, value.charCodeAt(index));
            index++;
          } else {
            unichar = c;
          }
        } else if (c >= 160) {
          // 160-255 and non-surrogates
          unichar = c;
        } else {
          // SPACE and other printable (safe) ASCII
          output.write(String.fromCharCode(c));
          break;
        }

        output.write(`&#${unichar};`);
        break;
    }
  }

  output.write(String.fromCharCode(quote));
}

function indexOfHtmlEncodeChar(data: string): number {
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);

    switch (c) {
      case 0x09: case 0x0d: case 0x0a: case 0x0c: break; // \t \r \n \f
      case 0x27: case 0x22: case 0x26: case 0x3c: case 0x3e: // ' " & < >
        return i;
      default:
        if (c < 32 || c >= 127) return i;
        break;
    }
  }

  return data.length;
}

function encodeData(output: TextWriter, data: string): void {
  let index = indexOfHtmlEncodeChar(data);

  if (index > 0) output.write(data.slice(0, index));

  while (index < data.length) {
    const c = data.charCodeAt(index++);
    let unichar: number;

    switch (c) {
      case 0x09: case 0x0d: case 0x0a: case 0x0c: output.write(String.fromCharCode(c)); break;
      case 0x27: output.write('&#39;'); break; // '
      case 0x22: output.write('&quot;'); break; // "
      case 0x26: output.write('&amp;'); break;
      case 0x3c: output.write('&lt;'); break;
      case 0x3e: output.write('&gt;'); break;
      default:
        if (c < 32 || (c >= 127 && c < 160)) {
          // illegal control character
          break;
        }

        if (c > 255 && isSurrogate(c)) {
          if (index < data.length && isSurrogatePair(c, data.charCodeAt(index))) {
            unichar = convertToUtf32(c, data.charCodeAt(index));
            index++;
          } else {
            unichar = c;
          }
        } else if (c >= 160) {
          unichar = c;
        } else {
          output.write(String.fromCharCode(c));
          break;
        }

        output.write(`&#${unichar};`);
        break;
    }
  }
}

function validateQuote(quote: string): number {
  if (quote !== '"' && quote !== "'")
    throw new TypeError("The quote character must either be '\"' or '\\''.");
  return quote.charCodeAt(0);
}

function validateNotNull(value: unknown, name: string): void {
  if (value === null || value === undefined) throw new TypeError(name);
}

function validateRange(length: number, startIndex: number, count: number): void {
  if (startIndex < 0 || startIndex >= length) throw new RangeError('startIndex');
  if (count < 0 || count > length - startIndex) throw new RangeError('count');
}

// --- HtmlAttributeEncode ---

/**
 * Encode an HTML attribute value.
 * @param output The text writer to output the result.
 * @param value The attribute value to encode.
 * @param quote The character to use for quoting the attribute value.
 * @throws {TypeError} `output`, `value`, or `quote` is invalid.
 */
export function htmlAttributeEncode(output: TextWriter, value: string, quote?: string): void;
/**
 * Encode a range of an HTML attribute value.
 * @param output The text writer to output the result.
 * @param value The attribute value to encode.
 * @param startIndex The starting index of the attribute value.
 * @param count The number of characters in the attribute value.
 * @param quote The character to use for quoting the attribute value.
 * @throws {TypeError} `output`, `value`, or `quote` is invalid.
 * @throws {RangeError} `startIndex` and `count` do not specify a valid range.
 */
export function htmlAttributeEncode(output: TextWriter, value: string, startIndex: number, count: number, quote?: string): void;
/**
 * Encode an HTML attribute value.
 * @param value The attribute value to encode.
 * @param quote The character to use for quoting the attribute value.
 * @returns The encoded attribute value.
 * @throws {TypeError} `value` or `quote` is invalid.
 */
export function htmlAttributeEncode(value: string, quote?: string): string;
/**
 * Encode a range of an HTML attribute value.
 * @param value The attribute value to encode.
 * @param startIndex The starting index of the attribute value.
 * @param count The number of characters in the attribute value.
 * @param quote The character to use for quoting the attribute value.
 * @returns The encoded attribute value.
 * @throws {TypeError} `value` or `quote` is invalid.
 * @throws {RangeError} `startIndex` and `count` do not specify a valid range.
 */
export function htmlAttributeEncode(value: string, startIndex: number, count: number, quote?: string): string;
/** Encode an HTML attribute value. */
export function htmlAttributeEncode(
  a: TextWriter | string,
  b?: string | number,
  c?: string | number,
  d?: string | number,
  e?: string,
): string | void {
  if (isTextWriter(a)) {
    const output = a;
    validateNotNull(output, 'output');
    const value = b as string;
    validateNotNull(value, 'value');
    if (typeof c === 'number') {
      const startIndex = c;
      const count = d as number;
      const quote = validateQuote((e ?? '"') as string);
      validateRange(value.length, startIndex, count);
      encodeAttribute(output, value.substr(startIndex, count), quote);
    } else {
      // signature (output, value, quote?): c holds the quote character
      const quote = validateQuote((c as string | undefined) ?? '"');
      encodeAttribute(output, value, quote);
    }
    return;
  }

  const value = a;
  validateNotNull(value, 'value');
  if (typeof b === 'number') {
    const startIndex = b;
    const count = c as number;
    const quote = validateQuote((d as string | undefined) ?? '"');
    validateRange(value.length, startIndex, count);
    const out = new StringWriter();
    encodeAttribute(out, value.substr(startIndex, count), quote);
    return out.toString();
  }
  const quote = validateQuote((b as string | undefined) ?? '"');
  const out = new StringWriter();
  encodeAttribute(out, value, quote);
  return out.toString();
}

// --- HtmlEncode ---

/**
 * Encode HTML character data.
 * @param output The text writer to output the result.
 * @param data The character data to encode.
 * @throws {TypeError} `output` or `data` is null or undefined.
 */
export function htmlEncode(output: TextWriter, data: string): void;
/**
 * Encode a range of HTML character data.
 * @param output The text writer to output the result.
 * @param data The character data to encode.
 * @param startIndex The starting index of the character data.
 * @param count The number of characters in the data.
 * @throws {TypeError} `output` or `data` is null or undefined.
 * @throws {RangeError} `startIndex` and `count` do not specify a valid range.
 */
export function htmlEncode(output: TextWriter, data: string, startIndex: number, count: number): void;
/**
 * Encode HTML character data.
 * @param data The character data to encode.
 * @returns The encoded character data.
 * @throws {TypeError} `data` is null or undefined.
 */
export function htmlEncode(data: string): string;
/**
 * Encode a range of HTML character data.
 * @param data The character data to encode.
 * @param startIndex The starting index of the character data.
 * @param count The number of characters in the data.
 * @returns The encoded character data.
 * @throws {TypeError} `data` is null or undefined.
 * @throws {RangeError} `startIndex` and `count` do not specify a valid range.
 */
export function htmlEncode(data: string, startIndex: number, count: number): string;
/** Encode HTML character data. */
export function htmlEncode(
  a: TextWriter | string,
  b?: string | number,
  c?: number,
  d?: number,
): string | void {
  if (isTextWriter(a)) {
    const output = a;
    validateNotNull(output, 'output');
    const data = b as string;
    validateNotNull(data, 'data');
    if (typeof c === 'number') {
      const startIndex = c;
      const count = d as number;
      validateRange(data.length, startIndex, count);
      encodeData(output, data.substr(startIndex, count));
    } else {
      encodeData(output, data);
    }
    return;
  }

  const data = a;
  validateNotNull(data, 'data');
  if (typeof b === 'number') {
    const startIndex = b;
    const count = c as number;
    validateRange(data.length, startIndex, count);
    const out = new StringWriter();
    encodeData(out, data.substr(startIndex, count));
    return out.toString();
  }
  const out = new StringWriter();
  encodeData(out, data);
  return out.toString();
}

// --- HtmlDecode ---

function decodeData(output: TextWriter, data: string, startIndex: number, count: number): void {
  const entity = new HtmlEntityDecoder();
  const endIndex = startIndex + count;
  let index = startIndex;

  while (index < endIndex) {
    if (data[index] === '&') {
      while (index < endIndex && entity.push(data[index]!)) index++;

      output.write(entity.getValue());
      entity.reset();
    } else {
      output.write(data[index++]!);
    }
  }
}

/**
 * Decode HTML character data.
 * @param output The text writer to output the result.
 * @param data The character data to decode.
 * @throws {TypeError} `output` or `data` is null or undefined.
 */
export function htmlDecode(output: TextWriter, data: string): void;
/**
 * Decode a range of HTML character data.
 * @param output The text writer to output the result.
 * @param data The character data to decode.
 * @param startIndex The starting index of the character data.
 * @param count The number of characters in the data.
 * @throws {TypeError} `output` or `data` is null or undefined.
 * @throws {RangeError} `startIndex` and `count` do not specify a valid range.
 */
export function htmlDecode(output: TextWriter, data: string, startIndex: number, count: number): void;
/**
 * Decode HTML character data.
 * @param data The character data to decode.
 * @returns The decoded character data.
 * @throws {TypeError} `data` is null or undefined.
 */
export function htmlDecode(data: string): string;
/**
 * Decode a range of HTML character data.
 * @param data The character data to decode.
 * @param startIndex The starting index of the character data.
 * @param count The number of characters in the data.
 * @returns The decoded character data.
 * @throws {TypeError} `data` is null or undefined.
 * @throws {RangeError} `startIndex` and `count` do not specify a valid range.
 */
export function htmlDecode(data: string, startIndex: number, count: number): string;
/** Decode HTML character data. */
export function htmlDecode(
  a: TextWriter | string,
  b?: string | number,
  c?: number,
  d?: number,
): string | void {
  if (isTextWriter(a)) {
    const output = a;
    validateNotNull(output, 'output');
    const data = b as string;
    validateNotNull(data, 'data');
    if (typeof c === 'number') {
      const startIndex = c;
      const count = d as number;
      validateRange(data.length, startIndex, count);
      decodeData(output, data, startIndex, count);
    } else {
      decodeData(output, data, 0, data.length);
    }
    return;
  }

  const data = a;
  validateNotNull(data, 'data');
  if (typeof b === 'number') {
    const startIndex = b;
    const count = c as number;
    validateRange(data.length, startIndex, count);
    const out = new StringWriter();
    decodeData(out, data, startIndex, count);
    return out.toString();
  }
  const out = new StringWriter();
  decodeData(out, data, 0, data.length);
  return out.toString();
}
