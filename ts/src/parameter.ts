import { FormatOptions, type ParameterEncodingMethod } from './format-options.js';
import type { CharsetEncoding } from './utils/charset-utils.js';
import { getMimeCharset, latin1, tryGetEncoding, utf8 } from './utils/charset-utils.js';
import { isAttr, isCtrl } from './utils/byte-extensions.js';
import { quote } from './utils/mime-utils.js';
import { HexEncoder } from './encodings/hex-encoder.js';
import { appendEncodedWordAsString } from './utils/rfc2047.js';
import { QEncodeMode } from './encodings/rfc2047-quoted-printable-encoder.js';

const ascii = new TextDecoder('ascii');

const enum EncodeMethod {
  None,
  Quote,
  Rfc2047,
  Rfc2231,
}

export class Parameter {
  private encodingValue: CharsetEncoding | null = null;
  private encodingMethodValue: ParameterEncodingMethod = 'default';
  private alwaysQuoteValue = false;
  private text: string;
  readonly name: string;
  onChanged: (() => void) | null = null;

  constructor(name: string, value: string);
  constructor(charset: string | CharsetEncoding, name: string, value: string);
  constructor(a: string | CharsetEncoding, b: string, c?: string) {
    let name: string;
    let value: string;

    if (c === undefined) {
      name = a as string;
      value = b;
    } else {
      if (typeof a === 'string') {
        const encoding = tryGetEncoding(a);
        if (encoding === null)
          throw new TypeError(`unsupported charset: ${a}`);
        this.encodingValue = encoding;
      } else {
        if (a == null)
          throw new TypeError('charset cannot be null or undefined');
        this.encodingValue = a;
      }
      name = b;
      value = c;
    }

    validateName(name);
    if (value == null)
      throw new TypeError('value cannot be null or undefined');

    this.name = name;
    this.text = value;
  }

  get encoding(): CharsetEncoding {
    return this.encodingValue ?? utf8;
  }

  set encoding(value: CharsetEncoding | null) {
    if (this.encodingValue === value)
      return;
    this.encodingValue = value;
    this.changed();
  }

  get encodingMethod(): ParameterEncodingMethod {
    return this.encodingMethodValue;
  }

  set encodingMethod(value: ParameterEncodingMethod) {
    if (value !== 'default' && value !== 'rfc2047' && value !== 'rfc2231')
      throw new RangeError('value is not a valid ParameterEncodingMethod');
    if (this.encodingMethodValue === value)
      return;
    this.encodingMethodValue = value;
    this.changed();
  }

  get alwaysQuote(): boolean {
    return this.alwaysQuoteValue;
  }

  set alwaysQuote(value: boolean) {
    if (this.alwaysQuoteValue === value)
      return;
    this.alwaysQuoteValue = value;
    this.changed();
  }

  get value(): string {
    return this.text;
  }

  set value(value: string) {
    if (value == null)
      throw new TypeError('value cannot be null or undefined');
    if (this.text === value)
      return;
    this.text = value;
    this.changed();
  }

  clone(): Parameter {
    const parameter = new Parameter(this.name, this.value);
    parameter.encodingValue = this.encodingValue;
    parameter.encodingMethodValue = this.encodingMethodValue;
    parameter.alwaysQuoteValue = this.alwaysQuoteValue;
    return parameter;
  }

  encode(options: FormatOptions, builder: string[], lineLength: { value: number }, headerEncoding: CharsetEncoding = utf8): void {
    switch (this.getEncodeMethod(options, this.name, this.value)) {
    case EncodeMethod.Rfc2231:
      this.encodeRfc2231(options, builder, lineLength, headerEncoding);
      break;
    case EncodeMethod.Rfc2047:
      this.encodeRfc2047(options, builder, lineLength, headerEncoding);
      break;
    case EncodeMethod.None:
      this.encodeSimple(options, builder, lineLength, this.value);
      break;
    case EncodeMethod.Quote:
      this.encodeSimple(options, builder, lineLength, quote(this.value));
      break;
    }
  }

  writeTo(builder: string[]): void {
    builder.push(this.name, '=', quote(this.value));
  }

  toString(): string {
    return `${this.name}=${quote(this.value)}`;
  }

  private changed(): void {
    this.onChanged?.();
  }

  private getEncodeMethod(options: FormatOptions, name: string, value: string): EncodeMethod {
    let method = this.alwaysQuote || options.alwaysQuoteParameterValues ? EncodeMethod.Quote : EncodeMethod.None;
    const encode = this.encodingMethodValue === 'rfc2231' || (this.encodingMethodValue === 'default' && options.parameterEncodingMethod === 'rfc2231')
      ? EncodeMethod.Rfc2231 : EncodeMethod.Rfc2047;

    if (name.length + 1 + value.length >= options.maxLineLength)
      return encode;

    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c < 128) {
        if (isCtrl(c))
          return encode;
        if (!isAttr(c))
          method = EncodeMethod.Quote;
      } else if (options.international) {
        method = EncodeMethod.Quote;
      } else {
        return encode;
      }
    }

    if (method === EncodeMethod.Quote && name.length + 1 + quote(value).length >= options.maxLineLength)
      return encode;

    return method;
  }

  private getBestEncoding(value: string, defaultEncoding: CharsetEncoding): CharsetEncoding {
    let encoding = 0;
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c < 127) {
        if (isCtrl(c))
          encoding = Math.max(encoding, 1);
      } else if (c < 256) {
        encoding = Math.max(encoding, 1);
      } else {
        encoding = 2;
      }
    }
    if (encoding === 0) return tryGetEncoding('us-ascii') ?? utf8;
    if (encoding === 1) return latin1;
    return this.encodingValue ?? defaultEncoding;
  }

  private encodeSimple(options: FormatOptions, builder: string[], lineLength: { value: number }, value: string): void {
    builder.push(';');
    lineLength.value++;
    if (lineLength.value + 1 + this.name.length + 1 + value.length >= options.maxLineLength) {
      builder.push(options.newLine, '\t');
      lineLength.value = 1;
    } else {
      builder.push(' ');
      lineLength.value++;
    }
    builder.push(this.name, '=', value);
    lineLength.value += this.name.length + 1 + value.length;
  }

  private getBytes(encoding: CharsetEncoding, text: string): Uint8Array {
    return encoding.encode(text);
  }

  private getEncodeMethodForBytes(options: FormatOptions, bytes: Uint8Array): EncodeMethod {
    let method = EncodeMethod.None;
    for (const c of bytes) {
      if (c < 128) {
        if (isCtrl(c)) return EncodeMethod.Rfc2231;
        if (!isAttr(c)) method = EncodeMethod.Quote;
      } else if (options.international) {
        method = EncodeMethod.Quote;
      } else {
        return EncodeMethod.Rfc2231;
      }
    }
    return method;
  }

  private encodeRfc2231(options: FormatOptions, builder: string[], lineLength: { value: number }, headerEncoding: CharsetEncoding): void {
    const bestEncoding = this.getBestEncoding(this.value, headerEncoding);
    const charset = getMimeCharset(bestEncoding);
    const maxLength = Math.max(options.maxLineLength - (this.name.length + 6), 3);
    const hex = new HexEncoder();
    let index = 0;
    let part = 0;
    let first = true;

    while (index < this.value.length || (first && this.value.length === 0)) {
      builder.push(';');
      lineLength.value++;
      const next = this.rfc2231GetNextValue(options, bestEncoding, charset, hex, first, index, maxLength);
      first = false;
      index = next.index;
      const encoded = next.encoded;
      const value = next.value;
      let length = this.name.length + (encoded ? 1 : 0) + 1 + value.length;

      if (part === 0 && index === this.value.length) {
        if (lineLength.value + 1 + length >= options.maxLineLength) {
          builder.push(options.newLine, '\t');
          lineLength.value = 1;
        } else {
          builder.push(' ');
          lineLength.value++;
        }
        builder.push(this.name);
        if (encoded) builder.push('*');
        builder.push('=', value);
        lineLength.value += length;
        return;
      }

      builder.push(options.newLine, '\t');
      lineLength.value = 1;
      const id = String(part++);
      length += id.length + 1;
      builder.push(this.name, '*', id);
      if (encoded) builder.push('*');
      builder.push('=', value);
      lineLength.value += length;
    }
  }

  private rfc2231GetNextValue(options: FormatOptions, encoding: CharsetEncoding, charset: string, hex: HexEncoder, first: boolean, index: number, maxLength: number): { value: string; encoded: boolean; index: number } {
    let requiresCharset = false;
    if (first) {
      const bytes = this.getBytes(encoding, this.value);
      requiresCharset = this.getEncodeMethodForBytes(options, bytes) === EncodeMethod.Rfc2231;
      if (requiresCharset) {
        const charsetLength = charset.length + 2;
        if (charsetLength >= maxLength)
          return { value: `${charset}''`, encoded: true, index };
        maxLength -= charsetLength;
      }
    }

    let length = Math.min(maxLength, this.value.length - index);
    do {
      const slice = this.value.slice(index, index + length);
      const bytes = this.getBytes(encoding, slice);
      if (bytes.length > maxLength && length > 1) {
        const ratio = Math.round(bytes.length / length);
        length -= ratio > 1 ? Math.max(Math.trunc((bytes.length - maxLength) / ratio), 1) : 1;
        continue;
      }

      if (!requiresCharset) {
        const method = this.getEncodeMethodForBytes(options, bytes);
        if (method === EncodeMethod.Quote)
          return { value: quote(encoding.decode(bytes)), encoded: false, index: index + length };
        if (method === EncodeMethod.None)
          return { value: encoding.decode(bytes), encoded: false, index: index + length };
      }

      const encodedBytes = new Uint8Array(hex.estimateOutputLength(bytes.length));
      const n = hex.encode(bytes, 0, bytes.length, encodedBytes);
      if (length > 1 && n > 3 && n > maxLength) {
        let x = 0;
        for (let i = n - 1; i >= 0 && i >= maxLength; i--)
          x += encodedBytes[i] === 0x25 ? -1 : 1;
        const ratio = Math.round(bytes.length / length);
        length -= ratio > 1 ? Math.max(Math.trunc(x / ratio), 1) : 1;
        continue;
      }

      const value = ascii.decode(encodedBytes.subarray(0, n));
      return { value: requiresCharset ? `${charset}''${value}` : value, encoded: true, index: index + length };
    } while (true);
  }

  private encodeRfc2047(options: FormatOptions, builder: string[], lineLength: { value: number }, headerEncoding: CharsetEncoding): void {
    const bestEncoding = this.getBestEncoding(this.value, headerEncoding);
    const charset = getMimeCharset(bestEncoding);
    let index = 0;

    builder.push(';');
    lineLength.value++;
    if (lineLength.value + this.name.length + charset.length + 10 + Math.min(this.value.length, 10) >= options.maxLineLength) {
      builder.push(options.newLine, '\t');
      lineLength.value = 1;
    } else {
      builder.push(' ');
      lineLength.value++;
    }

    builder.push(this.name, '="');
    lineLength.value += this.name.length + 2;

    do {
      const chunk = this.rfc2047NextChunk(bestEncoding, charset, index, (options.maxLineLength - lineLength.value) - 1);
      builder.push(chunk.value);
      lineLength.value += chunk.value.length;
      index = chunk.index;
      if (index >= this.value.length)
        break;
      builder.push(options.newLine, '\t');
      lineLength.value = 1;
    } while (true);

    builder.push('"');
    lineLength.value++;
  }

  private rfc2047NextChunk(encoding: CharsetEncoding, charset: string, start: number, maxLength: number): { value: string; index: number } {
    let index = start;
    let byteCount = 0;
    let charCount = 0;
    let encodeCount = 0;
    let nchars = 1;

    while (index < this.value.length) {
      const c = this.value.charCodeAt(index++);
      if (c < 127) {
        if (isCtrl(c) || c === 0x22 || c === 0x5c) encodeCount++;
        byteCount++;
        charCount++;
        nchars = 1;
      } else if (c < 256) {
        encodeCount++;
        byteCount++;
        charCount++;
        nchars = 1;
      } else {
        if (c >= 0xd800 && c <= 0xdbff && index < this.value.length) {
          index++;
          nchars = 2;
        } else {
          nchars = 1;
        }
        const n = encoding.encode(this.value.slice(index - nchars, index)).length;
        charCount += nchars;
        encodeCount += n;
        byteCount += n;
      }
      if (estimateEncodedWordLength(charset, byteCount, encodeCount) + 1 >= maxLength) {
        charCount -= nchars;
        index -= nchars;
        break;
      }
    }

    const value = appendEncodedWordAsString(encoding, this.value, start, charCount, QEncodeMode.Text);
    return { value, index };
  }
}

function estimateEncodedWordLength(charset: string, byteCount: number, encodeCount: number): number {
  const length = charset.length + 7;
  if (encodeCount < byteCount * 0.17)
    return length + (byteCount - encodeCount) + (encodeCount * 3);
  return length + Math.trunc((byteCount + 2) / 3) * 4;
}

function validateName(name: string): void {
  if (name == null)
    throw new TypeError('name cannot be null or undefined');
  if (name.length === 0)
    throw new TypeError('Parameter names are not allowed to be empty.');
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c > 127 || !isAttr(c))
      throw new TypeError('Illegal characters in parameter name.');
  }
}
