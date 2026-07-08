import { FormatOptions } from './format-options.js';
import { ParserOptions } from './parser-options.js';
import { err, ok, type Result } from './result.js';
import { ParameterList } from './parameter-list.js';
import type { CharsetEncoding } from './utils/charset-utils.js';
import { getMimeCharset, tryGetEncoding, utf8 } from './utils/charset-utils.js';
import { isAsciiAtom, isToken } from './utils/byte-extensions.js';
import { skipCommentsAndWhiteSpace, type ParseCursor } from './utils/parse-utils.js';

const encoder = new TextEncoder();

export class ContentType {
  private type: string;
  private subtype: string;
  parameters: ParameterList;
  onChanged: (() => void) | null = null;

  constructor(mediaType: string, mediaSubtype: string) {
    if (mediaType == null) throw new TypeError('mediaType cannot be null or undefined');
    if (mediaSubtype == null) throw new TypeError('mediaSubtype cannot be null or undefined');
    this.type = mediaType;
    this.subtype = mediaSubtype;
    this.parameters = new ParameterList();
    this.parameters.onChanged = () => this.changed();
  }

  get mediaType(): string { return this.type; }
  set mediaType(value: string) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (this.type === value) return;
    this.type = value;
    this.changed();
  }

  get mediaSubtype(): string { return this.subtype; }
  set mediaSubtype(value: string) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (this.subtype === value) return;
    this.subtype = value;
    this.changed();
  }

  get boundary(): string | null { return this.parameters.get('boundary') as string | null; }
  set boundary(value: string | null) { value !== null ? this.parameters.set('boundary', value) : this.parameters.remove('boundary'); }

  get charset(): string | null { return this.parameters.get('charset') as string | null; }
  set charset(value: string | null) { value !== null ? this.parameters.set('charset', value) : this.parameters.remove('charset'); }

  get charsetEncoding(): CharsetEncoding | null {
    return this.charset === null ? null : tryGetEncoding(this.charset);
  }
  set charsetEncoding(value: CharsetEncoding | null) {
    this.charset = value ? getMimeCharset(value) : null;
  }

  get format(): string | null { return this.parameters.get('format') as string | null; }
  set format(value: string | null) { value !== null ? this.parameters.set('format', value) : this.parameters.remove('format'); }

  get mimeType(): string { return `${this.mediaType}/${this.mediaSubtype}`; }

  get name(): string | null { return this.parameters.get('name') as string | null; }
  set name(value: string | null) { value !== null ? this.parameters.set('name', value) : this.parameters.remove('name'); }

  clone(): ContentType {
    const clone = new ContentType(this.type, this.subtype);
    for (const parameter of this.parameters)
      clone.parameters.add(parameter.clone());
    return clone;
  }

  isMimeType(mediaType: string, mediaSubtype: string): boolean {
    if (mediaType == null) throw new TypeError('mediaType cannot be null or undefined');
    if (mediaSubtype == null) throw new TypeError('mediaSubtype cannot be null or undefined');
    if (mediaType === '*' || equalsIgnoreCase(mediaType, this.type))
      return mediaSubtype === '*' || equalsIgnoreCase(mediaSubtype, this.subtype);
    return false;
  }

  encode(options = FormatOptions.default, charset: CharsetEncoding = utf8): string {
    const builder = [' ', this.mediaType, '/', this.mediaSubtype];
    const lineLength = { value: 'Content-Type:'.length + builder.join('').length };
    this.parameters.encode(options, builder, lineLength, charset);
    builder.push(options.newLine);
    return builder.join('');
  }

  toString(options = FormatOptions.default, charset: CharsetEncoding = utf8, encode = false): string {
    const builder = ['Content-Type: ', this.mediaType, '/', this.mediaSubtype];
    if (encode) {
      const lineLength = { value: builder.join('').length };
      this.parameters.encode(options, builder, lineLength, charset);
    } else {
      this.parameters.writeTo(builder);
    }
    return builder.join('');
  }

  static parse(input: string | Uint8Array, options = ParserOptions.default): Result<ContentType> {
    if (input == null) throw new TypeError('input cannot be null or undefined');
    const text = typeof input === 'string' ? encoder.encode(input) : input;
    const cursor = { index: 0 };
    return ContentType.tryParse(options, text, cursor, text.length);
  }

  static tryParse(options: ParserOptions, text: Uint8Array, cursor: ParseCursor, endIndex: number, partial?: { contentType: ContentType | null }): Result<ContentType> {
    let skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skip.ok) return skip;

    const typeStart = cursor.index;
    if (!skipType(text, cursor, endIndex))
      return err('invalid-content-type', `Invalid type token at position ${typeStart}`, { offset: typeStart });
    const type = asciiString(text, typeStart, cursor.index - typeStart);

    skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skip.ok) return skip;
    if (cursor.index >= endIndex || text[cursor.index] !== 0x2f)
      return err('expected-slash', `Expected '/' at position ${cursor.index}`, { offset: cursor.index });
    cursor.index++;

    skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skip.ok) return skip;
    const subtypeStart = cursor.index;
    if (!skipSubtype(text, cursor, endIndex))
      return err('invalid-content-subtype', `Invalid atom token at position ${subtypeStart}`, { offset: subtypeStart });
    const subtype = asciiString(text, subtypeStart, cursor.index - subtypeStart);

    skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skip.ok) return skip;
    const contentType = new ContentType(type, subtype);
    // C#'s internal TryParse(ref index) leaves `contentType` non-null once the
    // type/subtype have parsed, even when a later step fails; MimeReader relies
    // on this partial value (see UpdateHeaderState). Expose it via `partial`.
    if (partial) partial.contentType = contentType;
    if (cursor.index >= endIndex)
      return ok(contentType);
    if (text[cursor.index] !== 0x3b)
      return err('expected-semicolon', `Expected ';' at position ${cursor.index}`, { offset: cursor.index });
    cursor.index++;

    skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skip.ok) return skip;
    if (cursor.index >= endIndex)
      return ok(contentType);
    const parsed = ParameterList.tryParse(options, text, cursor, endIndex);
    if (!parsed.ok)
      return err(parsed.error);
    contentType.parameters.onChanged = null;
    contentType.parameters = parsed.value;
    contentType.parameters.onChanged = () => contentType.changed();
    return ok(contentType);
  }

  private changed(): void {
    this.onChanged?.();
  }
}

function skipType(text: Uint8Array, cursor: ParseCursor, endIndex: number): boolean {
  const start = cursor.index;
  while (cursor.index < endIndex && isAsciiAtom(text[cursor.index]!) && text[cursor.index] !== 0x2f)
    cursor.index++;
  return cursor.index > start;
}

function skipSubtype(text: Uint8Array, cursor: ParseCursor, endIndex: number): boolean {
  const start = cursor.index;
  while (cursor.index < endIndex && (isToken(text[cursor.index]!) || text[cursor.index] === 0x2f))
    cursor.index++;
  return cursor.index > start;
}

function asciiString(bytes: Uint8Array, start: number, length: number): string {
  let value = '';
  for (let i = start; i < start + length; i++) value += String.fromCharCode(bytes[i]!);
  return value;
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
