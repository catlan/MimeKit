import { FormatOptions, type ParameterEncodingMethod } from './format-options.js';
import { ParserOptions } from './parser-options.js';
import { err, ok, type Result } from './result.js';
import { Parameter } from './parameter.js';
import type { CharsetEncoding } from './utils/charset-utils.js';
import { convertToUnicode, getEncodingForCodePage, getTextDecoderLabel, tryGetEncoding, utf8 } from './utils/charset-utils.js';
import { isAttr, isWhitespace } from './utils/byte-extensions.js';
import { skipAtom, skipCommentsAndWhiteSpace, skipQuoted, skipToken, tryParseInt32, type ParseCursor } from './utils/parse-utils.js';
import { unquote } from './utils/mime-utils.js';
import { decodeTextWithCodePage } from './utils/rfc2047.js';
import { HexDecoder } from './encodings/hex-decoder.js';

interface NameValuePair {
  valueLength: number;
  valueStart: number;
  encoded: boolean;
  value: Uint8Array;
  name: string;
  id: number | null;
}

export class ParameterList implements Iterable<Parameter> {
  private readonly table = new Map<string, Parameter>();
  private readonly parameters: Parameter[] = [];
  onChanged: (() => void) | null = null;
  onBoundaryChanged: (() => void) | null = null;

  get count(): number {
    return this.parameters.length;
  }

  get length(): number {
    return this.parameters.length;
  }

  add(parameter: Parameter): void;
  add(name: string, value: string): void;
  add(charset: string | CharsetEncoding, name: string, value: string): void;
  add(a: Parameter | string | CharsetEncoding, b?: string, c?: string): void {
    let parameter: Parameter;
    if (a instanceof Parameter)
      parameter = a;
    else if (c === undefined)
      parameter = new Parameter(a as string, b!);
    else
      parameter = new Parameter(a as string | CharsetEncoding, b!, c);

    this.insert(this.parameters.length, parameter);
  }

  clear(): void {
    let hadBoundary = false;
    for (const parameter of this.parameters) {
      if (equalsIgnoreCase(parameter.name, 'boundary'))
        hadBoundary = true;
      parameter.onChanged = null;
    }
    this.parameters.length = 0;
    this.table.clear();
    if (hadBoundary)
      this.onBoundaryChanged?.();
    this.changed();
  }

  contains(nameOrParameter: string | Parameter): boolean {
    if (nameOrParameter == null)
      throw new TypeError('name cannot be null or undefined');
    if (nameOrParameter instanceof Parameter)
      return this.parameters.includes(nameOrParameter);
    return this.table.has(nameOrParameter.toLowerCase());
  }

  indexOf(nameOrParameter: string | Parameter): number {
    if (nameOrParameter == null)
      throw new TypeError('name cannot be null or undefined');
    if (nameOrParameter instanceof Parameter)
      return this.parameters.indexOf(nameOrParameter);
    for (let i = 0; i < this.parameters.length; i++) {
      if (equalsIgnoreCase(this.parameters[i]!.name, nameOrParameter))
        return i;
    }
    return -1;
  }

  insert(index: number, parameter: Parameter): void;
  insert(index: number, name: string, value: string): void;
  insert(index: number, a: Parameter | string, b?: string): void {
    if (!Number.isInteger(index) || index < 0 || index > this.parameters.length)
      throw new RangeError('index is out of range');
    const parameter = a instanceof Parameter ? a : new Parameter(a, b!);
    const key = parameter.name.toLowerCase();
    if (this.table.has(key))
      throw new TypeError('A parameter of that name already exists.');
    parameter.onChanged = () => this.onParamChanged(parameter);
    this.parameters.splice(index, 0, parameter);
    this.table.set(key, parameter);
    if (equalsIgnoreCase(parameter.name, 'boundary'))
      this.onBoundaryChanged?.();
    this.changed();
  }

  remove(nameOrParameter: string | Parameter): boolean {
    if (nameOrParameter == null)
      throw new TypeError('name cannot be null or undefined');
    const parameter = nameOrParameter instanceof Parameter ? nameOrParameter : this.table.get(nameOrParameter.toLowerCase());
    if (!parameter)
      return false;
    const index = this.parameters.indexOf(parameter);
    if (index === -1)
      return false;
    this.removeAt(index);
    return true;
  }

  removeAt(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.parameters.length)
      throw new RangeError('index is out of range');
    const parameter = this.parameters[index]!;
    parameter.onChanged = null;
    this.parameters.splice(index, 1);
    this.table.delete(parameter.name.toLowerCase());
    if (equalsIgnoreCase(parameter.name, 'boundary'))
      this.onBoundaryChanged?.();
    this.changed();
  }

  get(index: number): Parameter;
  get(name: string): string | null;
  get(indexOrName: number | string): Parameter | string | null {
    if (typeof indexOrName === 'number')
      return this.parameters[indexOrName]!;
    return this.table.get(indexOrName.toLowerCase())?.value ?? null;
  }

  set(index: number, parameter: Parameter): void;
  set(name: string, value: string): void;
  set(indexOrName: number | string, value: Parameter | string): void {
    if (typeof indexOrName === 'number') {
      const index = indexOrName;
      if (!Number.isInteger(index) || index < 0 || index >= this.parameters.length)
        throw new RangeError('index is out of range');
      if (!(value instanceof Parameter))
        throw new TypeError('value must be a Parameter');
      const old = this.parameters[index]!;
      if (old === value)
        return;
      const oldKey = old.name.toLowerCase();
      const newKey = value.name.toLowerCase();
      if (oldKey !== newKey && this.table.has(newKey))
        throw new TypeError('A parameter of that name already exists.');
      old.onChanged = null;
      value.onChanged = () => this.onParamChanged(value);
      this.parameters[index] = value;
      this.table.delete(oldKey);
      this.table.set(newKey, value);
      if (equalsIgnoreCase(old.name, 'boundary') || equalsIgnoreCase(value.name, 'boundary'))
        this.onBoundaryChanged?.();
      this.changed();
    } else {
      if (value == null)
        throw new TypeError('value cannot be null or undefined');
      const key = indexOrName.toLowerCase();
      const parameter = this.table.get(key);
      if (parameter)
        parameter.value = value as string;
      else
        this.add(indexOrName, value as string);
    }
  }

  tryGetValue(name: string): Parameter | null {
    if (name == null)
      throw new TypeError('name cannot be null or undefined');
    return this.table.get(name.toLowerCase()) ?? null;
  }

  [Symbol.iterator](): Iterator<Parameter> {
    return this.parameters[Symbol.iterator]();
  }

  encode(options: FormatOptions, builder: string[], lineLength: { value: number }, charset: CharsetEncoding = utf8): void {
    for (const parameter of this.parameters)
      parameter.encode(options, builder, lineLength, charset);
  }

  writeTo(builder: string[]): void {
    for (const parameter of this.parameters) {
      builder.push('; ');
      parameter.writeTo(builder);
    }
  }

  toString(): string {
    const builder: string[] = [];
    this.writeTo(builder);
    return builder.join('');
  }

  static parse(input: string | Uint8Array, options = ParserOptions.default): Result<ParameterList> {
    const text = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    const cursor = { index: 0 };
    return ParameterList.tryParse(options, text, cursor, text.length);
  }

  static tryParse(options: ParserOptions, text: Uint8Array, cursor: ParseCursor, endIndex: number): Result<ParameterList> {
    const rfc2231 = new Map<string, NameValuePair[]>();
    const params: NameValuePair[] = [];

    do {
      const skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
      if (!skip.ok) return skip;
      if (cursor.index >= endIndex) break;
      if (text[cursor.index] === 0x3b) {
        cursor.index++;
        continue;
      }

      const pair = tryParseNameValuePair(options, text, cursor, endIndex);
      if (!pair.ok) return pair;

      const skipAfter = skipCommentsAndWhiteSpace(text, cursor, endIndex);
      if (!skipAfter.ok) return skipAfter;

      if (pair.value.id !== null) {
        const key = pair.value.name.toLowerCase();
        let parts = rfc2231.get(key);
        if (!parts) {
          parts = [];
          rfc2231.set(key, parts);
          params.push(pair.value);
        }
        parts.push(pair.value);
      } else {
        params.push(pair.value);
      }

      if (cursor.index >= endIndex) break;
      if (text[cursor.index] !== 0x3b) {
        if (options.parameterComplianceMode === 'strict')
          return err('invalid-parameter-list-token', `Invalid parameter list token at offset ${cursor.index}`, { offset: cursor.index });
      } else {
        cursor.index++;
      }
    } while (true);

    const list = new ParameterList();
    const hex = new HexDecoder();

    for (const param of params) {
      let method: ParameterEncodingMethod = 'default';
      let startIndex = param.valueStart;
      let length = param.valueLength;
      let buffer = param.value;
      let encoding: CharsetEncoding | null = null;
      let value = '';

      if (param.id !== null) {
        method = 'rfc2231';
        const parts = rfc2231.get(param.name.toLowerCase())!;
        parts.sort(comparePairs);
        const decoded = decodeRfc2231Continuation(options, hex, parts);
        value = decoded.value;
        encoding = decoded.declaredEncoding;
        hex.reset();
      } else if (param.encoded) {
        if (length >= 2 && buffer[startIndex] === 0x22) {
          if (buffer[startIndex + length - 1] === 0x22)
            length--;
          startIndex++;
          length--;
        }
        const decoded = decodeRfc2231(null, hex, buffer, startIndex, length);
        value = decoded.value;
        encoding = decoded.declaredEncoding;
        method = 'rfc2231';
        hex.reset();
      } else if (!list.contains(param.name)) {
        if (length >= 2 && buffer[startIndex] === 0x22) {
          const unquoted = unquote(buffer, startIndex, length) as Uint8Array;
          const decoded = decodeTextWithCodePage(options, unquoted, 0, unquoted.length);
          value = decoded.value;
          if (decoded.codePage !== -1 && decoded.codePage !== 65001) {
            encoding = getEncodingForCodePage(decoded.codePage);
            method = 'rfc2047';
          }
        } else if (length > 0) {
          const decoded = decodeTextWithCodePage(options, buffer, startIndex, length);
          value = decoded.value;
          if (decoded.codePage !== -1 && decoded.codePage !== 65001) {
            encoding = getEncodingForCodePage(decoded.codePage);
            method = 'rfc2047';
          }
        }
      } else {
        continue;
      }

      const existing = list.tryGetValue(param.name);
      const parameter = existing ?? new Parameter(param.name, value);
      if (existing) {
        parameter.encoding = encoding;
        parameter.value = value;
      } else {
        if (encoding)
          parameter.encoding = encoding;
        list.add(parameter);
      }
      parameter.encodingMethod = method;
    }

    return ok(list);
  }

  private onParamChanged(parameter: Parameter): void {
    if (equalsIgnoreCase(parameter.name, 'boundary'))
      this.onBoundaryChanged?.();
    this.changed();
  }

  private changed(): void {
    this.onChanged?.();
  }
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function comparePairs(a: NameValuePair, b: NameValuePair): number {
  if (a.id === null) return b.id === null ? 0 : -1;
  if (b.id === null) return 1;
  return a.id - b.id;
}

function skipParamName(text: Uint8Array, cursor: ParseCursor, endIndex: number): boolean {
  const startIndex = cursor.index;
  while (cursor.index < endIndex && isAttr(text[cursor.index]!))
    cursor.index++;
  return cursor.index > startIndex;
}

function tryParseNameValuePair(options: ParserOptions, text: Uint8Array, cursor: ParseCursor, endIndex: number): Result<NameValuePair> {
  let encoded = false;
  let id: number | null = null;

  const skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
  if (!skip.ok) return skip;

  const startIndex = cursor.index;
  if (!skipParamName(text, cursor, endIndex))
    return err('invalid-parameter-name', `Invalid parameter name token at offset ${startIndex}`, { offset: startIndex });
  const name = asciiString(text, startIndex, cursor.index - startIndex);

  const skipAfterName = skipCommentsAndWhiteSpace(text, cursor, endIndex);
  if (!skipAfterName.ok) return skipAfterName;
  if (cursor.index >= endIndex)
    return err('incomplete-parameter', `Incomplete parameter at offset ${startIndex}`, { offset: cursor.index });

  if (text[cursor.index] === 0x2a) {
    cursor.index++;
    const skipAfterStar = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skipAfterStar.ok) return skipAfterStar;
    if (cursor.index >= endIndex)
      return err('incomplete-parameter', `Incomplete parameter at offset ${startIndex}`, { offset: cursor.index });
    const saved = cursor.index;
    const parsed = tryParseInt32(text, cursor, endIndex);
    if (parsed.ok) {
      const skipAfterId = skipCommentsAndWhiteSpace(text, cursor, endIndex);
      if (!skipAfterId.ok) return skipAfterId;
      if (cursor.index >= endIndex)
        return err('incomplete-parameter', `Incomplete parameter at offset ${startIndex}`, { offset: cursor.index });
      if (text[cursor.index] === 0x2a) {
        encoded = true;
        cursor.index++;
        const skipAfterIdStar = skipCommentsAndWhiteSpace(text, cursor, endIndex);
        if (!skipAfterIdStar.ok) return skipAfterIdStar;
        if (cursor.index >= endIndex)
          return err('incomplete-parameter', `Incomplete parameter at offset ${startIndex}`, { offset: cursor.index });
      }
      id = parsed.value;
    } else {
      cursor.index = saved;
      encoded = true;
    }
  }

  if (text[cursor.index] !== 0x3d)
    return err('incomplete-parameter', `Incomplete parameter at offset ${startIndex}`, { offset: cursor.index });
  cursor.index++;

  const skipBeforeValue = skipCommentsAndWhiteSpace(text, cursor, endIndex);
  if (!skipBeforeValue.ok) return skipBeforeValue;
  if (cursor.index >= endIndex)
    return err('incomplete-parameter', `Incomplete parameter at offset ${startIndex}`, { offset: cursor.index });

  let valueIndex = cursor.index;
  let value = text;
  let valueLength: number;

  if (text[cursor.index] === 0x22) {
    const quoted = skipQuoted(text, cursor, endIndex);
    if (!quoted.ok) return quoted;
    valueLength = cursor.index - valueIndex;
  } else if (options.parameterComplianceMode === 'strict') {
    skipToken(text, cursor, endIndex);
    valueLength = cursor.index - valueIndex;
  } else {
    while (cursor.index < endIndex && text[cursor.index] !== 0x3b && text[cursor.index] !== 0x0d && text[cursor.index] !== 0x0a)
      cursor.index++;
    valueLength = cursor.index - valueIndex;

    if (cursor.index < endIndex && text[cursor.index] !== 0x3b) {
      const parts: number[] = [];
      appendBytes(parts, text, valueIndex, valueLength);
      do {
        while (cursor.index < endIndex && (text[cursor.index] === 0x0d || text[cursor.index] === 0x0a))
          cursor.index++;
        valueIndex = cursor.index;
        while (cursor.index < endIndex && text[cursor.index] !== 0x3b && text[cursor.index] !== 0x0d && text[cursor.index] !== 0x0a)
          cursor.index++;
        appendBytes(parts, text, valueIndex, cursor.index - valueIndex);
      } while (cursor.index < endIndex && text[cursor.index] !== 0x3b);
      value = Uint8Array.from(parts);
      valueLength = value.length;
      valueIndex = 0;
    }

    while (valueLength > valueIndex && isWhitespace(value[valueLength - 1]!))
      valueLength--;
  }

  return ok({ valueLength, valueStart: valueIndex, encoded, value, name, id });
}

function decodeRfc2231(currentEncoding: CharsetEncoding | null, hex: HexDecoder, text: Uint8Array, startIndex: number, count: number): { value: string; encoding: CharsetEncoding; declaredEncoding: CharsetEncoding | null } {
  const endIndex = startIndex + count;
  let index = startIndex;
  let encoding = currentEncoding;
  let declaredEncoding: CharsetEncoding | null = null;

  if (encoding === null) {
    const charset = tryGetCharset(text, { index }, endIndex);
    if (charset.ok) {
      index = charset.value.index;
      encoding = tryGetEncoding(charset.value.charset) ?? getEncodingForCodePage(28591)!;
      declaredEncoding = encoding;
    } else {
      encoding = getEncodingForCodePage(28591)!;
    }
  }

  const length = endIndex - index;
  const decoded = new Uint8Array(hex.estimateOutputLength(length));
  const n = hex.decode(text, index, length, decoded);
  return { value: encoding.decode(decoded.subarray(0, n)), encoding, declaredEncoding };
}

function decodeRfc2231Continuation(options: ParserOptions, hex: HexDecoder, parts: NameValuePair[]): { value: string; declaredEncoding: CharsetEncoding | null } {
  const chunks: string[] = [];
  let encoding: CharsetEncoding | null = null;
  let declaredEncoding: CharsetEncoding | null = null;
  let decoder: TextDecoder | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    let startIndex = part.valueStart;
    let length = part.valueLength;
    const buffer = part.value;

    if (part.encoded) {
      if (length >= 2 && buffer[startIndex] === 0x22 && buffer[startIndex + length - 1] === 0x22) {
        startIndex++;
        length -= 2;
      }

      const endIndex = startIndex + length;
      let index = startIndex;

      if (encoding === null) {
        const charset = tryGetCharset(buffer, { index }, endIndex);
        if (charset.ok) {
          index = charset.value.index;
          encoding = tryGetEncoding(charset.value.charset) ?? getEncodingForCodePage(28591)!;
          declaredEncoding = encoding;
        } else {
          encoding = getEncodingForCodePage(28591)!;
        }
      }

      const bytes = new Uint8Array(hex.estimateOutputLength(endIndex - index));
      const n = hex.decode(buffer, index, endIndex - index, bytes);
      const decoded = bytes.subarray(0, n);
      const label = getTextDecoderLabel(encoding);

      if (label === null) {
        chunks.push(encoding.decode(decoded));
      } else {
        decoder ??= new TextDecoder(label);
        chunks.push(decoder.decode(decoded, { stream: i + 1 < parts.length && parts[i + 1]!.encoded }));
      }
    } else if (length >= 2 && buffer[startIndex] === 0x22) {
      chunks.push(bytesToString(unquote(buffer, startIndex, length) as Uint8Array, options));
      hex.reset();
    } else if (length > 0) {
      chunks.push(convertToUnicode(buffer.subarray(startIndex, startIndex + length), options.charsetEncoding));
      hex.reset();
    }
  }

  return { value: chunks.join(''), declaredEncoding };
}

function tryGetCharset(text: Uint8Array, cursor: ParseCursor, endIndex: number): Result<{ charset: string; index: number }> {
  const startIndex = cursor.index;
  let i = cursor.index;
  for (; i < endIndex; i++) if (text[i] === 0x27) break;
  if (i === startIndex || i === endIndex)
    return err('missing-rfc2231-charset', 'Missing RFC2231 charset.', { offset: startIndex });
  const charsetEnd = i;
  for (i++; i < endIndex; i++) if (text[i] === 0x27) break;
  if (i === endIndex)
    return err('missing-rfc2231-language', 'Missing RFC2231 language.', { offset: startIndex });
  return ok({ charset: asciiString(text, startIndex, charsetEnd - startIndex), index: i + 1 });
}

function bytesToString(bytes: Uint8Array, options: ParserOptions): string {
  return convertToUnicode(bytes, options.charsetEncoding);
}

function asciiString(bytes: Uint8Array, start: number, length: number): string {
  let value = '';
  for (let i = start; i < start + length; i++)
    value += String.fromCharCode(bytes[i]!);
  return value;
}

function appendBytes(output: number[], bytes: Uint8Array, start: number, length: number): void {
  for (let i = start; i < start + length; i++)
    output.push(bytes[i]!);
}
