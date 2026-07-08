/**
 * Byte-level parser helpers ported from MimeKit.Utils.ParseUtils.
 *
 * C# passes parse positions as `ref int index`. This TypeScript port uses a
 * mutable cursor object, always named `cursor`, with the shape `{ index:
 * number }`. Helpers advance `cursor.index` in place so later parser ports can
 * share one convention for byte-position state.
 */

import { err, ok, type MimeError, type Result } from '../result.js';
import { isAtom, isDomain, isPhraseAtom, isToken, isWhitespace } from './byte-extensions.js';

export interface ParseCursor {
  index: number;
}

export interface ParseError extends MimeError {
  readonly kind: string;
  readonly message: string;
  readonly tokenIndex?: number;
  readonly errorIndex?: number;
}

const INT32_MAX = 2147483647;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const greaterThanOrAt = asciiBytes('>@');

function parseError(kind: string, message: string, tokenIndex: number, errorIndex: number): ParseError {
  return { kind, message, offset: errorIndex, tokenIndex, errorIndex };
}

function validateRange(text: Uint8Array, cursor: ParseCursor, endIndex: number, allowAtEnd = true): void {
  if (!(text instanceof Uint8Array))
    throw new TypeError('text must be a Uint8Array');
  if (cursor === null || typeof cursor !== 'object' || !Number.isInteger(cursor.index))
    throw new TypeError('cursor must be an object with an integer index');
  if (!Number.isInteger(endIndex))
    throw new TypeError('endIndex must be an integer');
  if (endIndex < 0 || endIndex > text.length)
    throw new RangeError(`endIndex ${endIndex} out of range [0, ${text.length}]`);
  const maxIndex = allowAtEnd ? endIndex : endIndex - 1;
  if (cursor.index < 0 || cursor.index > maxIndex)
    throw new RangeError(`cursor.index ${cursor.index} out of range [0, ${maxIndex}]`);
}

function decodeUtf8(text: Uint8Array, start: number, end: number): Result<string> {
  try {
    return ok(utf8Decoder.decode(text.subarray(start, end)));
  } catch {
    return err('invalid-utf8', 'Invalid UTF-8 text.', { offset: start });
  }
}

function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++)
    bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

export function tryParseInt32(text: Uint8Array, cursor: ParseCursor, endIndex: number): Result<number> {
  validateRange(text, cursor, endIndex);
  const startIndex = cursor.index;
  let value = 0;

  while (cursor.index < endIndex && text[cursor.index] >= 0x30 && text[cursor.index] <= 0x39) {
    const digit = text[cursor.index] - 0x30;

    if (value > Math.trunc(INT32_MAX / 10))
      return err('integer-overflow', 'Integer overflow.', { offset: cursor.index });

    if (value === Math.trunc(INT32_MAX / 10) && digit > INT32_MAX % 10)
      return err('integer-overflow', 'Integer overflow.', { offset: cursor.index });

    value = (value * 10) + digit;
    cursor.index++;
  }

  if (cursor.index === startIndex)
    return err('invalid-integer', 'No integer token found.', { offset: startIndex });

  return ok(value);
}

export function skipWhiteSpace(text: Uint8Array, cursor: ParseCursor, endIndex: number): boolean {
  validateRange(text, cursor, endIndex);
  const startIndex = cursor.index;

  while (cursor.index < endIndex && isWhitespace(text[cursor.index]))
    cursor.index++;

  return cursor.index > startIndex;
}

export function skipComment(text: Uint8Array, cursor: ParseCursor, endIndex: number): boolean {
  validateRange(text, cursor, endIndex, false);
  let escaped = false;
  let depth = 1;

  cursor.index++;

  while (cursor.index < endIndex && depth > 0) {
    if (text[cursor.index] === 0x5c) {
      escaped = !escaped;
    } else if (!escaped) {
      if (text[cursor.index] === 0x28)
        depth++;
      else if (text[cursor.index] === 0x29)
        depth--;
    } else {
      escaped = false;
    }

    cursor.index++;
  }

  return depth === 0;
}

export function skipCommentsAndWhiteSpace(text: Uint8Array, cursor: ParseCursor, endIndex: number): Result<true> {
  validateRange(text, cursor, endIndex);
  skipWhiteSpace(text, cursor, endIndex);

  while (cursor.index < endIndex && text[cursor.index] === 0x28) {
    const startIndex = cursor.index;

    if (!skipComment(text, cursor, endIndex))
      return err(parseError('incomplete-comment', `Incomplete comment token at offset ${startIndex}`, startIndex, cursor.index));

    skipWhiteSpace(text, cursor, endIndex);
  }

  return ok(true);
}

export function skipQuoted(text: Uint8Array, cursor: ParseCursor, endIndex: number): Result<true> {
  validateRange(text, cursor, endIndex, false);
  const startIndex = cursor.index;
  let escaped = false;

  cursor.index++;

  while (cursor.index < endIndex) {
    if (text[cursor.index] === 0x5c) {
      escaped = !escaped;
    } else if (!escaped) {
      if (text[cursor.index] === 0x22)
        break;
    } else {
      escaped = false;
    }

    cursor.index++;
  }

  if (cursor.index >= endIndex)
    return err(parseError('incomplete-quoted-string', `Incomplete quoted-string token at offset ${startIndex}`, startIndex, cursor.index));

  cursor.index++;

  return ok(true);
}

export function skipAtom(text: Uint8Array, cursor: ParseCursor, endIndex: number): boolean {
  validateRange(text, cursor, endIndex);
  const start = cursor.index;

  while (cursor.index < endIndex && isAtom(text[cursor.index]))
    cursor.index++;

  return cursor.index > start;
}

export function skipPhraseAtom(text: Uint8Array, cursor: ParseCursor, endIndex: number): boolean {
  validateRange(text, cursor, endIndex);
  const start = cursor.index;

  while (cursor.index < endIndex && isPhraseAtom(text[cursor.index]))
    cursor.index++;

  return cursor.index > start;
}

export function skipToken(text: Uint8Array, cursor: ParseCursor, endIndex: number): boolean {
  validateRange(text, cursor, endIndex);
  const start = cursor.index;

  while (cursor.index < endIndex && isToken(text[cursor.index]))
    cursor.index++;

  return cursor.index > start;
}

export function skipWord(text: Uint8Array, cursor: ParseCursor, endIndex: number): Result<boolean> {
  validateRange(text, cursor, endIndex, false);

  if (text[cursor.index] === 0x22) {
    const result = skipQuoted(text, cursor, endIndex);
    return result.ok ? ok(true) : result;
  }

  if (isAtom(text[cursor.index]))
    return ok(skipAtom(text, cursor, endIndex));

  return ok(false);
}

export function isSentinel(c: number, sentinels: Uint8Array): boolean {
  for (let i = 0; i < sentinels.length; i++) {
    if (c === sentinels[i])
      return true;
  }

  return false;
}

function tryParseDotAtom(
  text: Uint8Array,
  cursor: ParseCursor,
  endIndex: number,
  sentinels: Uint8Array,
  tokenType: string,
): Result<string> {
  const token: string[] = [];
  const startIndex = cursor.index;
  let comment: number;

  do {
    if (!isAtom(text[cursor.index]))
      return err(parseError(`invalid-${tokenType}`, `Invalid ${tokenType} token at offset ${startIndex}`, startIndex, cursor.index));

    const start = cursor.index;
    while (cursor.index < endIndex && isAtom(text[cursor.index]))
      cursor.index++;

    const decoded = decodeUtf8(text, start, cursor.index);
    if (!decoded.ok)
      return err(parseError('invalid-utf8', 'Internationalized domains may only contain UTF-8 characters.', start, start));
    token.push(decoded.value);

    comment = cursor.index;
    const skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skip.ok)
      return skip;

    if (cursor.index >= endIndex || text[cursor.index] !== 0x2e) {
      cursor.index = comment;
      break;
    }

    cursor.index++;

    const skipAfterDot = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skipAfterDot.ok)
      return skipAfterDot;

    if (cursor.index >= endIndex || isSentinel(text[cursor.index], sentinels))
      break;

    token.push('.');
  } while (true);

  return ok(token.join(''));
}

function tryParseDomainLiteral(text: Uint8Array, cursor: ParseCursor, endIndex: number): Result<string> {
  const token: string[] = [];
  const startIndex = cursor.index++;

  token.push('[');

  skipWhiteSpace(text, cursor, endIndex);

  do {
    while (cursor.index < endIndex && isDomain(text[cursor.index])) {
      token.push(String.fromCharCode(text[cursor.index]));
      cursor.index++;
    }

    skipWhiteSpace(text, cursor, endIndex);

    if (cursor.index >= endIndex)
      return err(parseError('incomplete-domain-literal', `Incomplete domain literal token at offset ${startIndex}`, startIndex, cursor.index));

    if (text[cursor.index] === 0x5d)
      break;

    if (!isDomain(text[cursor.index]))
      return err(parseError('invalid-domain-literal', `Invalid domain literal token at offset ${startIndex}`, startIndex, cursor.index));
  } while (true);

  token.push(']');
  cursor.index++;

  return ok(token.join(''));
}

export function tryParseDomain(text: Uint8Array, cursor: ParseCursor, endIndex: number, sentinels: Uint8Array): Result<string> {
  validateRange(text, cursor, endIndex, false);

  if (text[cursor.index] === 0x5b)
    return tryParseDomainLiteral(text, cursor, endIndex);

  return tryParseDotAtom(text, cursor, endIndex, sentinels, 'domain');
}

export function tryParseMsgId(text: Uint8Array, cursor: ParseCursor, endIndex: number, requireAngleAddr: boolean): Result<string> {
  validateRange(text, cursor, endIndex);
  let squareBrackets = false;
  let angleAddr = false;

  const skipped = skipCommentsAndWhiteSpace(text, cursor, endIndex);
  if (!skipped.ok)
    return skipped;

  if (cursor.index >= endIndex || (requireAngleAddr && text[cursor.index] !== 0x3c))
    return err(parseError('no-msg-id', 'No msg-id token found.', cursor.index, cursor.index));

  const tokenIndex = cursor.index;

  if (text[cursor.index] === 0x3c) {
    angleAddr = true;
    cursor.index++;
  }

  skipWhiteSpace(text, cursor, endIndex);

  if (cursor.index >= endIndex)
    return err(parseError('incomplete-msg-id', `Incomplete msg-id token at offset ${tokenIndex}`, tokenIndex, cursor.index));

  const token: string[] = [];

  if (text[cursor.index] === 0x5b)
    squareBrackets = true;

  do {
    const start = cursor.index;

    if (text[cursor.index] === 0x22) {
      const quoted = skipQuoted(text, cursor, endIndex);
      if (!quoted.ok)
        return quoted;
    } else {
      while (
        cursor.index < endIndex &&
        text[cursor.index] !== 0x2e &&
        text[cursor.index] !== 0x40 &&
        text[cursor.index] !== 0x3e &&
        !isWhitespace(text[cursor.index])
      ) {
        cursor.index++;
      }
    }

    const decoded = decodeUtf8(text, start, cursor.index);
    if (!decoded.ok)
      return err(parseError('invalid-utf8', 'Internationalized local-part tokens may only contain UTF-8 characters.', start, start));
    token.push(decoded.value);

    skipWhiteSpace(text, cursor, endIndex);

    if (cursor.index >= endIndex) {
      if (angleAddr)
        return err(parseError('incomplete-msg-id', `Incomplete msg-id at offset ${tokenIndex}`, tokenIndex, cursor.index));
      break;
    }

    if (text[cursor.index] === 0x40 || text[cursor.index] === 0x3e)
      break;

    if (text[cursor.index] === 0x2e) {
      token.push('.');
      cursor.index++;

      skipWhiteSpace(text, cursor, endIndex);
    }

    if (cursor.index >= endIndex)
      return err(parseError('incomplete-msg-id', `Incomplete msg-id at offset ${tokenIndex}`, tokenIndex, cursor.index));
  } while (true);

  if (cursor.index < endIndex && text[cursor.index] === 0x40) {
    token.push('@');
    cursor.index++;

    while (cursor.index < endIndex && text[cursor.index] === 0x40)
      cursor.index++;

    const skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skip.ok)
      return skip;

    if (cursor.index < endIndex && text[cursor.index] !== 0x3e) {
      do {
        const domain = tryParseDomain(text, cursor, endIndex, greaterThanOrAt);
        if (!domain.ok)
          return domain;

        token.push(isIdnEncoded(domain.value) ? decodeIdnDomain(domain.value) : domain.value);

        if (cursor.index >= endIndex || text[cursor.index] !== 0x40)
          break;

        token.push('@');
        cursor.index++;
      } while (cursor.index < endIndex);

      const skipAfterDomain = skipCommentsAndWhiteSpace(text, cursor, endIndex);
      if (!skipAfterDomain.ok)
        return skipAfterDomain;
    }
  }

  if (squareBrackets && cursor.index < endIndex && text[cursor.index] === 0x5d) {
    token.push(']');
    cursor.index++;
  }

  if (angleAddr && (cursor.index >= endIndex || text[cursor.index] !== 0x3e))
    return err(parseError('incomplete-msg-id-token', `Incomplete msg-id token at offset ${tokenIndex}`, tokenIndex, cursor.index));

  if (cursor.index < endIndex && text[cursor.index] === 0x3e)
    cursor.index++;

  return ok(token.join(''));
}

export function isInternational(value: string, startIndex = 0, count = value.length - startIndex): boolean {
  const endIndex = startIndex + count;

  if (!Number.isInteger(startIndex) || !Number.isInteger(count))
    throw new TypeError('startIndex and count must be integers');
  if (startIndex < 0 || count < 0 || endIndex > value.length)
    throw new RangeError('startIndex/count out of range');

  for (let i = startIndex; i < endIndex; i++) {
    if (value.charCodeAt(i) > 127)
      return true;
  }

  return false;
}

export function isIdnEncoded(value: string): boolean {
  return value.startsWith('xn--') || value.includes('.xn--');
}

function decodeIdnDomain(value: string): string {
  return value.split('.').map((label) => label.startsWith('xn--') ? punycodeDecode(label.slice(4)) : label).join('.');
}

function punycodeDecode(input: string): string {
  let n = 128;
  let i = 0;
  let bias = 72;
  const output: number[] = [];
  const delimiter = input.lastIndexOf('-');

  if (delimiter >= 0) {
    for (let j = 0; j < delimiter; j++)
      output.push(input.charCodeAt(j));
  }

  let inIndex = delimiter >= 0 ? delimiter + 1 : 0;
  while (inIndex < input.length) {
    const oldi = i;
    let w = 1;

    for (let k = 36; ; k += 36) {
      if (inIndex >= input.length)
        return input;

      const digit = punycodeDigit(input.charCodeAt(inIndex++));
      if (digit >= 36)
        return input;

      i += digit * w;
      const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
      if (digit < t)
        break;

      w *= 36 - t;
    }

    const outLength = output.length + 1;
    bias = adaptPunycodeBias(i - oldi, outLength, oldi === 0);
    n += Math.trunc(i / outLength);
    i %= outLength;
    output.splice(i, 0, n);
    i++;
  }

  return String.fromCodePoint(...output);
}

function punycodeDigit(c: number): number {
  if (c >= 0x30 && c <= 0x39)
    return c - 0x30 + 26;
  if (c >= 0x41 && c <= 0x5a)
    return c - 0x41;
  if (c >= 0x61 && c <= 0x7a)
    return c - 0x61;
  return 36;
}

function adaptPunycodeBias(delta: number, numPoints: number, firstTime: boolean): number {
  delta = firstTime ? Math.trunc(delta / 700) : delta >> 1;
  delta += Math.trunc(delta / numPoints);

  let k = 0;
  while (delta > Math.trunc(((36 - 1) * 26) / 2)) {
    delta = Math.trunc(delta / (36 - 1));
    k += 36;
  }

  return k + Math.trunc(((36 - 1 + 1) * delta) / (delta + 38));
}
