/**
 * Port of MimeKit/Utils/MimeUtils.cs.
 *
 * generateMessageId deviation: the C# parameterless overload uses the local
 * machine host name. The TypeScript core is isomorphic and cannot use Node-only
 * host APIs, so generateMessageId accepts an optional domain parameter that
 * defaults to "localhost".
 */
import type { ContentEncoding } from '../content-encoding.js';
import { err, ok, type Result } from '../result.js';
import { punycodeDefault } from '../encodings/punycode.js';
import { isWhitespace } from './byte-extensions.js';
import {
  skipCommentsAndWhiteSpace,
  skipQuoted,
  skipWhiteSpace,
  skipWord,
  tryParseInt32,
  tryParseDomain,
  isIdnEncoded,
  type ParseCursor,
} from './parse-utils.js';

const base36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const unquoteChars = new Set(['\r', '\n', '\t', '\\', '"']);
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export interface MimeVersion {
  readonly major: number;
  readonly minor: number;
  readonly build: number | undefined;
  readonly revision: number | undefined;
  toString(): string;
}

class VersionValue implements MimeVersion {
  constructor(
    readonly major: number,
    readonly minor: number,
    readonly build: number | undefined = undefined,
    readonly revision: number | undefined = undefined,
  ) {}

  toString(): string {
    const values = [this.major, this.minor];
    if (this.build !== undefined)
      values.push(this.build);
    if (this.revision !== undefined)
      values.push(this.revision);
    return values.join('.');
  }
}

function idnEncode(domain: string): string {
  return punycodeDefault.encode(domain);
}

function idnDecode(domain: string): string {
  return punycodeDefault.decode(domain);
}

// Kept local because parse-utils.ts keeps decodeUtf8 private and returns
// Result<string> using an end-index argument; this parser preserves the old
// mime-utils.ts helper contract of string | undefined using start + length.
function decodeUtf8(text: Uint8Array, start: number, length: number): string | undefined {
  try {
    return utf8Decoder.decode(text.subarray(start, start + length));
  } catch {
    return undefined;
  }
}

const greaterThanOrAt = new Uint8Array([0x3e, 0x40]);

// Kept local because parse-utils.tryParseMsgId decodes IDN domains with its
// private punycode decoder, which can return decoded control/empty labels for
// malformed xn-- input. MimeUtils has historically used punycodeDefault.decode,
// which preserves the original domain when IdnMapping-style validation fails.
function tryParseMimeMsgId(
  text: Uint8Array,
  index: ParseCursor,
  endIndex: number,
  requireAngleAddr: boolean,
): string | undefined {
  let squareBrackets = false;
  let angleAddr = false;

  if (!skipCommentsAndWhiteSpace(text, index, endIndex).ok)
    return undefined;

  if (index.index >= endIndex || (requireAngleAddr && text[index.index] !== 0x3c))
    return undefined;

  if (text[index.index] === 0x3c) {
    angleAddr = true;
    index.index++;
  }

  skipWhiteSpace(text, index, endIndex);

  if (index.index >= endIndex)
    return undefined;

  const token: string[] = [];

  if (text[index.index] === 0x5b)
    squareBrackets = true;

  do {
    const start = index.index;

    if (text[index.index] === 0x22) {
      if (!skipQuoted(text, index, endIndex).ok)
        return undefined;
    } else {
      while (
        index.index < endIndex &&
        text[index.index] !== 0x2e &&
        text[index.index] !== 0x40 &&
        text[index.index] !== 0x3e &&
        !isWhitespace(text[index.index]!)
      ) {
        index.index++;
      }
    }

    const part = decodeUtf8(text, start, index.index - start);
    if (part === undefined)
      return undefined;
    token.push(part);

    skipWhiteSpace(text, index, endIndex);

    if (index.index >= endIndex) {
      if (angleAddr)
        return undefined;

      break;
    }

    if (text[index.index] === 0x40 || text[index.index] === 0x3e)
      break;

    if (text[index.index] === 0x2e) {
      token.push('.');
      index.index++;

      skipWhiteSpace(text, index, endIndex);
    }

    if (index.index >= endIndex)
      return undefined;
  } while (true);

  if (index.index < endIndex && text[index.index] === 0x40) {
    token.push('@');
    index.index++;

    while (index.index < endIndex && text[index.index] === 0x40)
      index.index++;

    if (!skipCommentsAndWhiteSpace(text, index, endIndex).ok)
      return undefined;

    if (index.index < endIndex && text[index.index] !== 0x3e) {
      do {
        const parsedDomain = tryParseDomain(text, index, endIndex, greaterThanOrAt);
        if (!parsedDomain.ok)
          return undefined;

        const domain = isIdnEncoded(parsedDomain.value) ? idnDecode(parsedDomain.value) : parsedDomain.value;

        token.push(domain);

        if (index.index >= endIndex || text[index.index] !== 0x40)
          break;

        token.push('@');
        index.index++;
      } while (index.index < endIndex);

      if (!skipCommentsAndWhiteSpace(text, index, endIndex).ok)
        return undefined;
    }
  }

  if (squareBrackets && index.index < endIndex && text[index.index] === 0x5d) {
    token.push(']');
    index.index++;
  }

  if (angleAddr && (index.index >= endIndex || text[index.index] !== 0x3e))
    return undefined;

  if (index.index < endIndex && text[index.index] === 0x3e)
    index.index++;

  return token.join('');
}

function validateRange(buffer: Uint8Array, startIndex: number, length: number): void {
  if (startIndex < 0 || startIndex > buffer.length)
    throw new RangeError('startIndex is out of range');
  if (length < 0 || length > buffer.length - startIndex)
    throw new RangeError('length is out of range');
}

function toBuffer(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? utf8Encoder.encode(input) : input;
}

export function tryParseVersion(
  input: string | Uint8Array | null | undefined,
  startIndex = 0,
  length?: number,
): Result<MimeVersion> {
  if (input == null)
    return err('invalid-version', 'The version could not be parsed.');

  const buffer = toBuffer(input);
  const count = length ?? buffer.length - startIndex;

  if (startIndex < 0 || startIndex > buffer.length || count < 0 || count > buffer.length - startIndex)
    return err('invalid-version', 'The version could not be parsed.');

  const values: number[] = [];
  const endIndex = startIndex + count;
  const index: ParseCursor = { index: startIndex };

  do {
    const skipped = skipCommentsAndWhiteSpace(buffer, index, endIndex);
    if (!skipped.ok || index.index >= endIndex)
      return err('invalid-version', 'The version could not be parsed.', { offset: index.index });

    const value = tryParseInt32(buffer, index, endIndex);
    if (!value.ok)
      return err('invalid-version', 'The version could not be parsed.', { offset: index.index });

    values.push(value.value);

    const skippedAfterValue = skipCommentsAndWhiteSpace(buffer, index, endIndex);
    if (!skippedAfterValue.ok)
      return err('invalid-version', 'The version could not be parsed.', { offset: index.index });

    if (index.index >= endIndex)
      break;

    if (buffer[index.index++] !== 0x2e)
      return err('invalid-version', 'The version could not be parsed.', { offset: index.index - 1 });
  } while (index.index < endIndex);

  switch (values.length) {
    case 4: return ok(new VersionValue(values[0]!, values[1]!, values[2]!, values[3]!));
    case 3: return ok(new VersionValue(values[0]!, values[1]!, values[2]!));
    case 2: return ok(new VersionValue(values[0]!, values[1]!));
    default: return err('invalid-version', 'The version could not be parsed.', { offset: index.index });
  }
}

export function tryParse(text: string | null | undefined): Result<ContentEncoding> {
  if (text == null)
    return err('invalid-content-encoding', 'The content encoding could not be parsed.');

  let i = 0;

  while (i < text.length && /\s/u.test(text[i]!))
    i++;

  const startIndex = i;
  let n = 0;

  while (i < text.length && text[i] !== ';' && !/\s/u.test(text[i]!)) {
    i++;
    n++;
  }

  const value = text.slice(startIndex, startIndex + n).toLowerCase();
  let encoding: ContentEncoding;

  switch (value) {
    case '7bit': encoding = '7bit'; break;
    case '8bit': encoding = '8bit'; break;
    case 'binary': encoding = 'binary'; break;
    case 'base64': encoding = 'base64'; break;
    case 'quoted-printable': encoding = 'quoted-printable'; break;
    case 'x-uuencode':
    case 'uuencode':
    case 'x-uue':
      encoding = 'uuencode';
      break;
    default:
      encoding = 'default';
      break;
  }

  return encoding !== 'default'
    ? ok(encoding)
    : err('invalid-content-encoding', 'The content encoding could not be parsed.', { offset: startIndex });
}

export function appendQuoted(builder: string[], text: string): string[];
export function appendQuoted(builder: { append(value: string): unknown }, text: string): { append(value: string): unknown };
export function appendQuoted(
  builder: string[] | { append(value: string): unknown } | null | undefined,
  text: string | null | undefined,
): string[] | { append(value: string): unknown } {
  if (builder == null)
    throw new TypeError('builder cannot be null or undefined');
  if (text == null)
    throw new TypeError('text cannot be null or undefined');

  const append = Array.isArray(builder)
    ? (value: string): void => { builder.push(value); }
    : (value: string): void => { builder.append(value); };

  append('"');
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' || text[i] === '"')
      append('\\');
    append(text[i]!);
  }
  append('"');

  return builder;
}

export function quote(text: string | null | undefined): string {
  if (text == null)
    throw new TypeError('text cannot be null or undefined');

  const builder: string[] = [];
  appendQuoted(builder, text);
  return builder.join('');
}

function unquoteString(text: string, convertTabsToSpaces: boolean): string {
  let escaped = false;
  const output: string[] = [];

  for (let i = 0; i < text.length; i++) {
    switch (text[i]) {
      case '\r':
      case '\n':
        escaped = false;
        break;
      case '\t':
        output.push(convertTabsToSpaces ? ' ' : '\t');
        escaped = false;
        break;
      case '\\':
        if (escaped)
          output.push('\\');
        escaped = !escaped;
        break;
      case '"':
        if (escaped) {
          output.push('"');
          escaped = false;
        }
        break;
      default:
        output.push(text[i]!);
        escaped = false;
        break;
    }
  }

  return output.join('');
}

function unquoteBytes(text: Uint8Array, startIndex: number, length: number, convertTabsToSpaces: boolean): Uint8Array {
  validateRange(text, startIndex, length);

  let escaped = false;
  const output: number[] = [];

  for (let i = startIndex; i < startIndex + length; i++) {
    switch (text[i]) {
      case 0x0d:
      case 0x0a:
        escaped = false;
        break;
      case 0x09:
        output.push(convertTabsToSpaces ? 0x20 : 0x09);
        escaped = false;
        break;
      case 0x5c:
        if (escaped)
          output.push(0x5c);
        escaped = !escaped;
        break;
      case 0x22:
        if (escaped) {
          output.push(0x22);
          escaped = false;
        }
        break;
      default:
        output.push(text[i]!);
        escaped = false;
        break;
    }
  }

  return Uint8Array.from(output);
}

export function unquote(text: string, convertTabsToSpaces?: boolean): string;
export function unquote(text: Uint8Array, startIndex?: number, length?: number, convertTabsToSpaces?: boolean): Uint8Array;
export function unquote(
  text: string | Uint8Array | null | undefined,
  startIndexOrConvertTabsToSpaces: number | boolean = 0,
  length?: number,
  convertTabsToSpaces = false,
): string | Uint8Array {
  if (text == null)
    throw new TypeError('text cannot be null or undefined');

  if (typeof text === 'string') {
    const tabs = typeof startIndexOrConvertTabsToSpaces === 'boolean'
      ? startIndexOrConvertTabsToSpaces
      : false;

    for (let i = 0; i < text.length; i++) {
      if (unquoteChars.has(text[i]!))
        return unquoteString(text, tabs);
    }

    return text;
  }

  const startIndex = typeof startIndexOrConvertTabsToSpaces === 'number' ? startIndexOrConvertTabsToSpaces : 0;
  const count = length ?? text.length - startIndex;
  return unquoteBytes(text, startIndex, count, convertTabsToSpaces);
}

export function tryParseMessageId(
  input: string | Uint8Array | null | undefined,
  startIndex = 0,
  length?: number,
): Result<string | null> {
  if (input == null)
    throw new TypeError('text cannot be null or undefined');

  const buffer = toBuffer(input);
  const count = length ?? buffer.length - startIndex;
  validateRange(buffer, startIndex, count);

  const index: ParseCursor = { index: startIndex };
  const msgid = tryParseMimeMsgId(buffer, index, startIndex + count, false);

  return ok(msgid ?? null);
}

export function* enumerateReferences(
  input: string | Uint8Array | null | undefined,
  startIndex = 0,
  length?: number,
): IterableIterator<string> {
  if (input == null)
    throw new TypeError('text cannot be null or undefined');

  const buffer = toBuffer(input);
  const count = length ?? buffer.length - startIndex;
  validateRange(buffer, startIndex, count);

  const endIndex = startIndex + count;
  const index: ParseCursor = { index: startIndex };

  do {
    const skipped = skipCommentsAndWhiteSpace(buffer, index, endIndex);
    if (!skipped.ok)
      break;

    if (index.index >= endIndex)
      break;

    if (buffer[index.index] === 0x3c) {
      const msgid = tryParseMimeMsgId(buffer, index, endIndex, true);
      if (msgid !== undefined)
        yield msgid;
    } else {
      const word = skipWord(buffer, index, endIndex);
      if (!word.ok || !word.value)
        index.index++;
    }
  } while (index.index < endIndex);
}

function appendBase36(value: bigint, output: string[]): void {
  do {
    output.push(base36[Number(value % 36n)]!);
    value /= 36n;
  } while (value !== 0n);
}

export function generateMessageId(domain = 'localhost'): string {
  if (domain == null)
    throw new TypeError('domain cannot be null or undefined');

  if (domain.length === 0)
    throw new TypeError('The domain is invalid.');

  const id: string[] = [];
  const nowTicks = (BigInt(Date.now()) * 10000n) + 621355968000000000n;
  const block = new Uint8Array(8);

  globalThis.crypto.getRandomValues(block);

  appendBase36(nowTicks, id);

  id.push('.');

  let value = 0n;
  for (let i = 0; i < 8; i++)
    value = (value << 8n) | BigInt(block[i]!);

  appendBase36(value, id);

  id.push('@');
  id.push(idnEncode(domain));

  return id.join('');
}
