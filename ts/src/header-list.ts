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

export type HeaderListChangedAction = 'added' | 'changed' | 'cleared' | 'removed';
export type HeaderListChangedCallback = (header: Header | null, action: HeaderListChangedAction) => void;

type HeaderListAddArgs =
  | [Header]
  | [HeaderId | string, string]
  | [HeaderId | string, string | CharsetEncoding, string];

type HeaderListInsertArgs =
  | [number, Header]
  | [number, HeaderId | string, string]
  | [number, HeaderId | string, string | CharsetEncoding, string];

export class HeaderList implements Iterable<Header> {
  readonly options: ParserOptions;
  onChanged: HeaderListChangedCallback | null = null;
  hasBodySeparator = true;

  private readonly headers: Header[] = [];
  private readonly table = new Map<string, Header>();
  private readonly callbacks = new WeakMap<Header, () => void>();

  constructor(options: ParserOptions = ParserOptions.default.clone()) {
    if (options == null) throw new TypeError('options cannot be null or undefined');
    this.options = options.clone();
  }

  get count(): number {
    return this.headers.length;
  }

  get isReadOnly(): boolean {
    return false;
  }

  at(index: number): Header {
    this.validateExistingIndex(index);
    return this.headers[index]!;
  }

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

  getValue(idOrField: HeaderId | string): string | null {
    const field = normalizeFieldKey(idOrField, true);
    const header = this.table.get(field);
    return header?.value ?? null;
  }

  setValue(idOrField: HeaderId | string, value: string): void {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    const header = this.table.get(normalizeFieldKey(idOrField, true));
    if (header !== undefined) {
      header.value = value;
      return;
    }
    this.add(idOrField, value);
  }

  add(...args: HeaderListAddArgs): void {
    const header = makeHeader(args);
    if (!this.table.has(keyOf(header.field)))
      this.table.set(keyOf(header.field), header);
    this.attach(header);
    this.headers.push(header);
    this.hasBodySeparator = true;
    this.changed(header, 'added');
  }

  clear(): void {
    for (const header of this.headers)
      this.detach(header);
    this.hasBodySeparator = true;
    this.headers.length = 0;
    this.table.clear();
    this.changed(null, 'cleared');
  }

  contains(value: Header | HeaderId | string): boolean {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (value instanceof Header)
      return this.headers.includes(value);
    return this.table.has(normalizeFieldKey(value, true));
  }

  copyTo(array: Header[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null or undefined');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > array.length)
      throw new RangeError('arrayIndex out of range');
    if (array.length - arrayIndex < this.headers.length)
      throw new RangeError('array is too small');
    for (let i = 0; i < this.headers.length; i++)
      array[arrayIndex + i] = this.headers[i]!;
  }

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

  lastIndexOf(value: HeaderId | string): number {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    const field = normalizeFieldName(value, true);
    for (let i = this.headers.length - 1; i >= 0; i--) {
      if (equalsIgnoreCase(this.headers[i]!.field, field))
        return i;
    }
    return -1;
  }

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

  removeAt(index: number): void {
    this.validateExistingIndex(index);
    const header = this.headers[index]!;
    this.detach(header);
    this.removeTableHeaderAt(index, header);
    this.headers.splice(index, 1);
    this.hasBodySeparator = true;
    this.changed(header, 'removed');
  }

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

  tryGetHeader(value: HeaderId | string): Header | null {
    return this.table.get(normalizeFieldKey(value, true)) ?? null;
  }

  writeTo(stream: Stream): void;
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
