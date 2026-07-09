import { FormatOptions } from './format-options.js';
import { ParserOptions } from './parser-options.js';
import { err, ok, type Result } from './result.js';
import { ParameterList } from './parameter-list.js';
import { utf8, convertToUnicode, type CharsetEncoding } from './utils/charset-utils.js';
import { isAsciiAtom } from './utils/byte-extensions.js';
import { skipAtom, skipCommentsAndWhiteSpace, skipQuoted, type ParseCursor } from './utils/parse-utils.js';
import { unquote } from './utils/mime-utils.js';
import { formatDate, parseDate, type DateTimeOffset } from './utils/date-utils.js';

const encoder = new TextEncoder();

/**
 * Represents a `Content-Disposition` header value.
 */
export class ContentDisposition {
  /** The `attachment` disposition token. */
  static readonly attachment = 'attachment';
  /** The `form-data` disposition token. */
  static readonly formData = 'form-data';
  /** The `inline` disposition token. */
  static readonly inline = 'inline';

  private dispositionValue!: string;
  /** The content disposition parameters. */
  parameters: ParameterList;
  /** Invoked when the content disposition changes. */
  onChanged: (() => void) | null = null;

  /**
   * Creates a new content disposition.
   *
   * @param disposition The disposition token.
   * @throws {TypeError} `disposition` is null, undefined, or invalid.
   */
  constructor(disposition = ContentDisposition.attachment) {
    this.parameters = new ParameterList();
    this.parameters.onChanged = () => this.changed();
    this.disposition = disposition;
  }

  /** The disposition token. */
  get disposition(): string { return this.dispositionValue; }
  set disposition(value: string) {
    validateDisposition(value);
    if (this.dispositionValue === value) return;
    this.dispositionValue = value;
    this.changed();
  }

  /** Whether this disposition represents an attachment. */
  get isAttachment(): boolean {
    return equalsIgnoreCase(this.dispositionValue, ContentDisposition.attachment);
  }
  set isAttachment(value: boolean) {
    this.dispositionValue = value ? ContentDisposition.attachment : ContentDisposition.inline;
  }

  /** The file name parameter, if available. */
  get fileName(): string | null { return this.parameters.get('filename') as string | null; }
  set fileName(value: string | null) { value !== null ? this.parameters.set('filename', value) : this.parameters.remove('filename'); }

  /** The creation date parameter, if available. */
  get creationDate(): DateTimeOffset | null { return getDate(this.parameters.get('creation-date') as string | null); }
  set creationDate(value: DateTimeOffset | null) { value ? this.parameters.set('creation-date', formatDate(value)) : this.parameters.remove('creation-date'); }

  /** The modification date parameter, if available. */
  get modificationDate(): DateTimeOffset | null { return getDate(this.parameters.get('modification-date') as string | null); }
  set modificationDate(value: DateTimeOffset | null) { value ? this.parameters.set('modification-date', formatDate(value)) : this.parameters.remove('modification-date'); }

  /** The read date parameter, if available. */
  get readDate(): DateTimeOffset | null { return getDate(this.parameters.get('read-date') as string | null); }
  set readDate(value: DateTimeOffset | null) { value ? this.parameters.set('read-date', formatDate(value)) : this.parameters.remove('read-date'); }

  /** The size parameter, if available. */
  get size(): number | null {
    const value = this.parameters.get('size') as string | null;
    if (value === null || value.trim() === '') return null;
    return /^[0-9]+$/.test(value) ? Number.parseInt(value, 10) : null;
  }
  set size(value: number | null) {
    value !== null ? this.parameters.set('size', String(value)) : this.parameters.remove('size');
  }

  /**
   * Clones this content disposition.
   *
   * @returns The cloned content disposition.
   */
  clone(): ContentDisposition {
    const clone = new ContentDisposition(this.dispositionValue);
    for (const parameter of this.parameters)
      clone.parameters.add(parameter.clone());
    return clone;
  }

  /**
   * Encodes this content disposition as a folded header value.
   *
   * @param options The formatting options.
   * @param charset The charset to use when encoding parameter values.
   * @returns The serialized header value.
   */
  encode(options = FormatOptions.default, charset: CharsetEncoding = utf8): string {
    const builder = [' ', this.dispositionValue];
    const lineLength = { value: 'Content-Disposition:'.length + builder.join('').length };
    this.parameters.encode(options, builder, lineLength, charset);
    builder.push(options.newLine);
    return builder.join('');
  }

  /**
   * Serializes this content disposition.
   *
   * @param options The formatting options.
   * @param charset The charset to use when encoding parameter values.
   * @param encode If `true`, parameter values will be encoded.
   * @returns The serialized string.
   */
  toString(options = FormatOptions.default, charset: CharsetEncoding = utf8, encode = false): string {
    const builder = ['Content-Disposition: ', this.dispositionValue];
    if (encode) {
      const lineLength = { value: builder.join('').length };
      this.parameters.encode(options, builder, lineLength, charset);
    } else {
      this.parameters.writeTo(builder);
    }
    return builder.join('');
  }

  /**
   * Parses a content disposition from text or bytes.
   *
   * @param input The input to parse.
   * @param options The parser options.
   * @returns A {@link Result}; `{ ok: false }` with a `MimeError` on malformed input.
   * @throws {TypeError} `input` is null or undefined.
   */
  static parse(input: string | Uint8Array, options = ParserOptions.default): Result<ContentDisposition> {
    if (input == null) throw new TypeError('input cannot be null or undefined');
    const text = typeof input === 'string' ? encoder.encode(input) : input;
    const cursor = { index: 0 };
    return ContentDisposition.tryParse(options, text, cursor, text.length);
  }

  /**
   * Attempts to parse a content disposition from a byte range.
   *
   * @param options The parser options.
   * @param text The input buffer.
   * @param cursor The current parse cursor.
   * @param endIndex The end index of the input range.
   * @returns A {@link Result}; `{ ok: false }` with a `MimeError` on malformed input.
   */
  static tryParse(options: ParserOptions, text: Uint8Array, cursor: ParseCursor, endIndex: number): Result<ContentDisposition> {
    let skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skip.ok) return skip;
    if (cursor.index >= endIndex)
      return err('expected-disposition', `Expected atom token at position ${cursor.index}`, { offset: cursor.index });

    const atom = cursor.index;
    let type: string;
    if (text[cursor.index] === 0x22) {
      const quoted = skipQuoted(text, cursor, endIndex);
      if (!quoted.ok) return quoted;
      type = unquote(convertToUnicode(text.subarray(atom, cursor.index), options.charsetEncoding));
      if (type.length === 0) type = ContentDisposition.attachment;
    } else if (!skipAtom(text, cursor, endIndex)) {
      if (cursor.index <= atom && text[cursor.index] === 0x3b) {
        type = ContentDisposition.attachment;
      } else {
        return err('invalid-disposition', `Invalid atom token at position ${atom}`, { offset: atom });
      }
    } else {
      type = asciiString(text, atom, cursor.index - atom);
    }

    const disposition = new ContentDisposition();
    disposition.dispositionValue = type;

    skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skip.ok) return skip;
    if (cursor.index >= endIndex)
      return ok(disposition);
    if (text[cursor.index] !== 0x3b)
      return err('expected-semicolon', `Expected ';' at position ${cursor.index}`, { offset: cursor.index });
    cursor.index++;

    skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skip.ok) return skip;
    if (cursor.index >= endIndex)
      return ok(disposition);
    const parsed = ParameterList.tryParse(options, text, cursor, endIndex);
    if (!parsed.ok)
      return parsed;
    disposition.parameters.onChanged = null;
    disposition.parameters = parsed.value;
    disposition.parameters.onChanged = () => disposition.changed();
    return ok(disposition);
  }

  private changed(): void {
    this.onChanged?.();
  }
}

function validateDisposition(value: string): void {
  if (value == null)
    throw new TypeError('value cannot be null or undefined');
  if (value.length === 0)
    throw new TypeError('The disposition is not allowed to be empty.');
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 127 || !isAsciiAtom(c))
      throw new TypeError('Illegal characters in disposition value.');
  }
}

function getDate(value: string | null): DateTimeOffset | null {
  if (value === null || value.trim() === '') return null;
  const parsed = parseDate(value);
  return parsed.ok ? parsed.value : null;
}

function asciiString(bytes: Uint8Array, start: number, length: number): string {
  let value = '';
  for (let i = start; i < start + length; i++) value += String.fromCharCode(bytes[i]!);
  return value;
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
