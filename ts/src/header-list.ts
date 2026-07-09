import { FormatOptions } from './format-options.js';
import { Header } from './header.js';
import { HeaderId, toHeaderName } from './header-id.js';
import { Dos2UnixFilter } from './io/filters/dos2unix-filter.js';
import { Unix2DosFilter } from './io/filters/unix2dos-filter.js';
import { FilteredStream } from './io/filtered-stream.js';
import { MemoryStream, Stream } from './io/stream.js';
import { newMimeParser } from './parser-hook.js';
import { ParserOptions } from './parser-options.js';
import { type Result } from './result.js';
import { type CharsetEncoding } from './utils/charset-utils.js';

const ascii = new TextEncoder();

/** Describes the kind of change made to a header list. */
export type HeaderListChangedAction = 'added' | 'changed' | 'cleared' | 'removed';
/** Receives notifications when a header list changes. */
export type HeaderListChangedCallback = (header: Header | null, action: HeaderListChangedAction) => void;

type HeaderListAddArgs =
  | [Header]
  | [HeaderId | string, string]
  | [HeaderId | string, string | CharsetEncoding, string];

type HeaderListInsertArgs =
  | [number, Header]
  | [number, HeaderId | string, string]
  | [number, HeaderId | string, string | CharsetEncoding, string];

/**
 * Represents a list of message headers.
 */
export class HeaderList implements Iterable<Header> {
  /** The parser options associated with headers in this list. */
  readonly options: ParserOptions;
  /** Invoked when the header list changes. */
  onChanged: HeaderListChangedCallback | null = null;
  /** Whether a body separator should be written after the headers. */
  hasBodySeparator = true;

  private readonly headers: Header[] = [];
  private readonly table = new Map<string, Header>();
  private readonly callbacks = new WeakMap<Header, () => void>();

  /**
   * Creates a new header list.
   *
   * @param options The parser options associated with headers in the list.
   * @throws {TypeError} `options` is null or undefined.
   */
  constructor(options: ParserOptions = ParserOptions.default.clone()) {
    if (options == null) throw new TypeError('options cannot be null or undefined');
    this.options = options.clone();
  }

  /** The number of headers. */
  get count(): number {
    return this.headers.length;
  }

  /** Whether this list is read-only. */
  get isReadOnly(): boolean {
    return false;
  }

  /**
   * Gets the header at the specified index.
   *
   * @param index The index.
   * @returns The header.
   * @throws {RangeError} `index` is out of range.
   */
  at(index: number): Header {
    this.validateExistingIndex(index);
    return this.headers[index]!;
  }

  /**
   * Replaces the header at the specified index.
   *
   * @param index The index.
   * @param value The replacement header.
   * @throws {TypeError} `value` is null or undefined.
   * @throws {RangeError} `index` is out of range.
   */
  set(index: number, value: Header): void {
    this.validateExistingIndex(index);
    if (value == null) throw new TypeError('value cannot be null or undefined');

    const header = this.headers[index]!;
    if (header === value) return;

    this.detach(header);
    this.attach(value);

    if (sameField(header, value)) {
      if (this.table.get(keyOf(header.field)) === header)
        this.table.set(keyOf(header.field), value);
    } else {
      this.removeTableHeaderAt(index, header);
      const oldValue = this.table.get(keyOf(value.field));
      if (oldValue !== undefined) {
        const idx = this.headers.indexOf(oldValue);
        if (idx > index)
          this.table.set(keyOf(oldValue.field), value);
      } else {
        this.table.set(keyOf(value.field), value);
      }
    }

    this.headers[index] = value;
    this.hasBodySeparator = true;

    if (sameField(header, value)) {
      this.changed(value, 'changed');
    } else {
      this.changed(header, 'removed');
      this.changed(value, 'added');
    }
  }

  /**
   * Gets the value of the first matching header.
   *
   * @param idOrField The header identifier or field name.
   * @returns The header value, or `null` if it does not exist.
   */
  getValue(idOrField: HeaderId | string): string | null {
    const field = normalizeFieldKey(idOrField, true);
    const header = this.table.get(field);
    return header?.value ?? null;
  }

  /**
   * Sets the value of the first matching header, adding it if it does not exist.
   *
   * @param idOrField The header identifier or field name.
   * @param value The header value.
   * @throws {TypeError} `value` is null or undefined.
   */
  setValue(idOrField: HeaderId | string, value: string): void {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    const header = this.table.get(normalizeFieldKey(idOrField, true));
    if (header !== undefined) {
      header.value = value;
      return;
    }
    this.add(idOrField, value);
  }

  /**
   * Adds a header to the list.
   *
   * @param args A header instance, or a field/id with value and optional charset.
   */
  add(...args: HeaderListAddArgs): void {
    const header = makeHeader(args);
    if (!this.table.has(keyOf(header.field)))
      this.table.set(keyOf(header.field), header);
    this.attach(header);
    this.headers.push(header);
    this.hasBodySeparator = true;
    this.changed(header, 'added');
  }

  /** Removes all headers from the list. */
  clear(): void {
    for (const header of this.headers)
      this.detach(header);
    this.hasBodySeparator = true;
    this.headers.length = 0;
    this.table.clear();
    this.changed(null, 'cleared');
  }

  /**
   * Determines whether the list contains the specified header or field.
   *
   * @param value The header, header identifier, or field name.
   * @returns `true` if the header is contained; otherwise, `false`.
   * @throws {TypeError} `value` is null or undefined.
   */
  contains(value: Header | HeaderId | string): boolean {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (value instanceof Header)
      return this.headers.includes(value);
    return this.table.has(normalizeFieldKey(value, true));
  }

  /**
   * Copies the headers to an array.
   *
   * @param array The destination array.
   * @param arrayIndex The index into the array.
   * @throws {TypeError} `array` is null or undefined.
   * @throws {RangeError} `arrayIndex` is out of range or the array is too small.
   */
  copyTo(array: Header[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null or undefined');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > array.length)
      throw new RangeError('arrayIndex out of range');
    if (array.length - arrayIndex < this.headers.length)
      throw new RangeError('array is too small');
    for (let i = 0; i < this.headers.length; i++)
      array[arrayIndex + i] = this.headers[i]!;
  }

  /**
   * Gets the index of the first matching header.
   *
   * @param value The header, header identifier, or field name.
   * @returns The header index, or `-1` if it is not found.
   * @throws {TypeError} `value` is null or undefined.
   */
  indexOf(value: Header | HeaderId | string): number {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (value instanceof Header)
      return this.headers.indexOf(value);
    const field = normalizeFieldName(value, true);
    for (let i = 0; i < this.headers.length; i++) {
      if (equalsIgnoreCase(this.headers[i]!.field, field))
        return i;
    }
    return -1;
  }

  /**
   * Inserts a header at the specified index.
   *
   * @param args The index and a header instance, or a field/id with value and optional charset.
   * @throws {RangeError} The index is out of range.
   */
  insert(...args: HeaderListInsertArgs): void {
    const index = args[0];
    // C# constructs the Header (which validates its own args) BEFORE
    // validating the index — keep that error precedence (review note).
    const header = makeHeader(args.slice(1) as HeaderListAddArgs);
    if (!Number.isInteger(index) || index < 0 || index > this.count)
      throw new RangeError('index out of range');

    const first = this.table.get(keyOf(header.field));
    if (first !== undefined) {
      const idx = this.headers.indexOf(first);
      if (idx >= index)
        this.table.set(keyOf(header.field), header);
    } else {
      this.table.set(keyOf(header.field), header);
    }

    this.headers.splice(index, 0, header);
    this.attach(header);
    this.hasBodySeparator = true;
    this.changed(header, 'added');
  }

  /**
   * Gets the index of the last matching header.
   *
   * @param value The header identifier or field name.
   * @returns The header index, or `-1` if it is not found.
   * @throws {TypeError} `value` is null or undefined.
   */
  lastIndexOf(value: HeaderId | string): number {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    const field = normalizeFieldName(value, true);
    for (let i = this.headers.length - 1; i >= 0; i--) {
      if (equalsIgnoreCase(this.headers[i]!.field, field))
        return i;
    }
    return -1;
  }

  /**
   * Removes the first matching header.
   *
   * @param value The header, header identifier, or field name.
   * @returns `true` if a header was removed; otherwise, `false`.
   * @throws {TypeError} `value` is null or undefined.
   */
  remove(value: Header | HeaderId | string): boolean {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (value instanceof Header) {
      const index = this.headers.indexOf(value);
      if (index === -1) return false;
      this.removeAt(index);
      return true;
    }

    const header = this.table.get(normalizeFieldKey(value, true));
    if (header === undefined) return false;
    return this.remove(header);
  }

  /**
   * Removes all headers matching the specified field.
   *
   * @param value The header identifier or field name.
   * @throws {TypeError} `value` is null or undefined.
   */
  removeAll(value: HeaderId | string): void {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    const field = normalizeFieldName(value, true);
    const key = keyOf(field);
    if (!this.table.delete(key))
      return;

    this.hasBodySeparator = true;
    for (let i = this.headers.length - 1; i >= 0; i--) {
      if (!equalsIgnoreCase(this.headers[i]!.field, field))
        continue;
      const header = this.headers[i]!;
      this.detach(header);
      this.headers.splice(i, 1);
      this.changed(header, 'removed');
    }
  }

  /**
   * Removes the header at the specified index.
   *
   * @param index The index.
   * @throws {RangeError} `index` is out of range.
   */
  removeAt(index: number): void {
    this.validateExistingIndex(index);
    const header = this.headers[index]!;
    this.detach(header);
    this.removeTableHeaderAt(index, header);
    this.headers.splice(index, 1);
    this.hasBodySeparator = true;
    this.changed(header, 'removed');
  }

  /**
   * Replaces all matching headers with a single header.
   *
   * @param args A header instance, or a field/id with value and optional charset.
   */
  replace(...args: HeaderListAddArgs): void {
    const header = makeHeader(args);
    const first = this.table.get(keyOf(header.field));
    if (first === undefined) {
      this.add(header);
      return;
    }

    let i: number;
    for (i = this.headers.length - 1; i >= 0; i--) {
      if (this.headers[i] === first)
        break;
      if (!equalsIgnoreCase(this.headers[i]!.field, header.field))
        continue;
      this.detach(this.headers[i]!);
      this.headers.splice(i, 1);
    }

    this.attach(header);
    this.detach(first);
    this.table.set(keyOf(header.field), header);
    this.headers[i] = header;
    this.hasBodySeparator = true;
    this.changed(first, 'removed');
    this.changed(header, 'added');
  }

  /**
   * Attempts to get the first matching header.
   *
   * @param value The header identifier or field name.
   * @returns The header, or `null` if it does not exist.
   */
  tryGetHeader(value: HeaderId | string): Header | null {
    return this.table.get(normalizeFieldKey(value, true)) ?? null;
  }

  /**
   * Writes the headers to a stream.
   *
   * @param stream The output stream.
   * @throws {TypeError} `stream` is null or undefined.
   */
  writeTo(stream: Stream): void;
  /**
   * Writes the headers to a stream using the specified formatting options.
   *
   * @param options The formatting options.
   * @param stream The output stream.
   * @throws {TypeError} `options` or `stream` is null or undefined.
   */
  writeTo(options: FormatOptions, stream: Stream): void;
  writeTo(a: FormatOptions | Stream, b?: Stream): void {
    const options = a instanceof FormatOptions ? a : FormatOptions.default;
    const stream = a instanceof FormatOptions ? b : a;
    if (options == null) throw new TypeError('options cannot be null or undefined');
    if (stream == null) throw new TypeError('stream cannot be null or undefined');

    const filtered = new FilteredStream(stream);
    if (options.newLineFormat === 'dos')
      filtered.add(new Unix2DosFilter());
    else
      filtered.add(new Dos2UnixFilter());

    for (const header of this.headers) {
      filtered.write(header.rawField, 0, header.rawField.length);
      if (!header.isInvalid) {
        const rawValue = header.getRawValue(options);
        const colon = ascii.encode(':');
        filtered.write(colon, 0, colon.length);
        filtered.write(rawValue, 0, rawValue.length);
      }
    }

    filtered.flush();

    if (this.hasBodySeparator) {
      const newline = ascii.encode(options.newLine);
      stream.write(newline, 0, newline.length);
    }
  }

  [Symbol.iterator](): Iterator<Header> {
    return this.headers[Symbol.iterator]();
  }

  /**
   * C#: HeaderList.Load. Parses a list of headers from a stream (or byte buffer)
   * using the MIME parser. Parse errors are returned as an Err (C#:
   * FormatException) per the port's Result convention.
   */
  /**
   * Parses a list of headers from a stream or byte buffer.
   *
   * @param source The source stream or buffer.
   * @param options The parser options.
   * @returns A {@link Result}; `{ ok: false }` with a `MimeError` on malformed input.
   * @throws {TypeError} `source` is null or undefined.
   */
  static load(source: Stream | Uint8Array, options: ParserOptions = ParserOptions.default): Result<HeaderList> {
    if (source == null) throw new TypeError('stream cannot be null or undefined');
    const stream = source instanceof Stream ? source : new MemoryStream(source);
    const parser = newMimeParser(options, stream, 'entity');
    return parser.parseHeaders();
  }

  private validateExistingIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.count)
      throw new RangeError('index out of range');
  }

  private attach(header: Header): void {
    const callback = () => this.changed(header, 'changed');
    this.callbacks.set(header, callback);
    header.onChanged = callback;
  }

  private detach(header: Header): void {
    const callback = this.callbacks.get(header);
    if (callback !== undefined && header.onChanged === callback)
      header.onChanged = null;
    this.callbacks.delete(header);
  }

  private removeTableHeaderAt(index: number, header: Header): void {
    if (this.table.get(keyOf(header.field)) !== header)
      return;

    this.table.delete(keyOf(header.field));
    for (let i = index + 1; i < this.headers.length; i++) {
      if (equalsIgnoreCase(this.headers[i]!.field, header.field)) {
        this.table.set(keyOf(this.headers[i]!.field), this.headers[i]!);
        break;
      }
    }
  }

  private changed(header: Header | null, action: HeaderListChangedAction): void {
    this.onChanged?.(header, action);
  }
}

function makeHeader(args: HeaderListAddArgs): Header {
  if (args.length === 1) {
    if (args[0] == null) throw new TypeError('header cannot be null or undefined');
    return args[0];
  }
  if (args.length === 2)
    return new Header(args[0], args[1]);
  if (args[1] == null) throw new TypeError('charset cannot be null or undefined');
  return new Header(args[1], args[0], args[2]);
}

function normalizeFieldKey(value: HeaderId | string, rejectUnknown: boolean): string {
  return keyOf(normalizeFieldName(value, rejectUnknown));
}

function normalizeFieldName(value: HeaderId | string, rejectUnknown: boolean): string {
  if (value == null) throw new TypeError('field cannot be null or undefined');
  if (value === HeaderId.Unknown) {
    if (rejectUnknown) throw new RangeError('id is not a valid HeaderId');
    return 'Unknown';
  }
  const name = toHeaderName(value);
  return name !== 'Unknown' ? name : value;
}

function keyOf(field: string): string {
  return field.toLowerCase();
}

function equalsIgnoreCase(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameField(left: Header, right: Header): boolean {
  return equalsIgnoreCase(left.field, right.field);
}
