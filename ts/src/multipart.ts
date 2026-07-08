import { ContentType } from './content-type.js';
import { convertToUnicode } from './utils/charset-utils.js';
import { FormatOptions, MAXIMUM_LINE_LENGTH, MINIMUM_LINE_LENGTH } from './format-options.js';
import type { EncodingConstraint } from './io/filters/best-encoding-filter.js';
import { Stream } from './io/stream.js';
import { MimeEntity, type MimeEntityConstructorArgs } from './mime-entity.js';
import { MessagePart } from './message-part.js';
import type { MimeVisitor } from './mime-visitor.js';
import { MimePart } from './mime-part.js';
import { TextPart, TextFormat } from './text-part.js';
import { Header } from './header.js';

const encoder = new TextEncoder();
let boundaryGenerator: () => string = defaultBoundaryGenerator;

export function setBoundaryGenerator(generator: (() => string) | null): void {
  boundaryGenerator = generator ?? defaultBoundaryGenerator;
}

export function generateBoundary(): string {
  return boundaryGenerator();
}

export class Multipart extends MimeEntity implements Iterable<MimeEntity> {
  rawBoundaries: Array<Uint8Array | null> | null = null;
  rawPreamble: Uint8Array | null = null;
  rawEndBoundary: Uint8Array | null = null;
  rawEpilogue: Uint8Array | null = null;
  private readonly children: MimeEntity[] = [];
  private preambleValue: string | null = null;
  private epilogueValue: string | null = null;

  constructor();
  constructor(subtype: string, ...args: unknown[]);
  constructor(args: MimeEntityConstructorArgs);
  constructor(subtype: string | MimeEntityConstructorArgs = 'mixed', ...args: unknown[]) {
    if (isConstructorArgs(subtype)) {
      super(subtype);
      this.contentType.parameters.onBoundaryChanged = () => this.boundaryChanged();
      this.rawBoundaries = [];
      this.rawEndBoundary = new Uint8Array(0);
      return;
    }
    if (subtype == null) throw new TypeError('subtype cannot be null or undefined');
    if (typeof subtype !== 'string') throw new TypeError('subtype must be a string');
    super('multipart', subtype);
    this.contentType.parameters.onBoundaryChanged = () => this.boundaryChanged();
    this.contentType.boundary = generateBoundary();

    for (const obj of args) {
      if (obj == null)
        throw new TypeError('initialization parameters cannot be null or undefined');
      if (this.tryInit(obj))
        continue;
      if (obj instanceof MimeEntity) {
        this.add(obj);
        continue;
      }
      throw new TypeError(`Unknown initialization parameter: ${String(obj)}`);
    }
  }

  get Boundary(): string | null { return this.boundary; }
  set Boundary(value: string | null) { this.boundary = value; }
  get boundary(): string | null { return this.contentType.boundary; }
  set boundary(value: string | null) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (this.boundary === value)
      return;
    this.contentType.boundary = value.trim();
  }

  get Preamble(): string | null { return this.preamble; }
  set Preamble(value: string | null) { this.preamble = value; }
  get preamble(): string | null {
    if (this.preambleValue == null && this.rawPreamble != null)
      this.preambleValue = new TextDecoder().decode(this.rawPreamble);
    return this.preambleValue;
  }
  set preamble(value: string | null) {
    if (this.preamble === value)
      return;
    if (value == null) {
      this.rawPreamble = null;
      this.preambleValue = null;
    } else {
      const folded = Multipart.foldPreambleOrEpilogue(FormatOptions.default, value, false);
      this.rawPreamble = encoder.encode(folded);
      this.preambleValue = folded;
    }
  }

  get Epilogue(): string | null { return this.epilogue; }
  set Epilogue(value: string | null) { this.epilogue = value; }
  get epilogue(): string | null {
    if (this.epilogueValue == null && this.rawEpilogue != null) {
      let index = 0;
      // C# quirk kept (Multipart.cs:296-300): BOTH branches require Length > 1,
      // so a 1-byte [0x0a] raw epilogue yields "\n", not "".
      if (this.rawEpilogue.length > 1 && this.rawEpilogue[0] === 0x0d && this.rawEpilogue[1] === 0x0a)
        index = 2;
      else if (this.rawEpilogue.length > 1 && this.rawEpilogue[0] === 0x0a)
        index = 1;
      this.epilogueValue = convertToUnicode(this.rawEpilogue.subarray(index), this.headers.options.charsetEncoding);
    }
    return this.epilogueValue;
  }
  set epilogue(value: string | null) {
    if (this.epilogue === value)
      return;
    if (value == null) {
      this.rawEpilogue = null;
      this.epilogueValue = null;
    } else {
      if (this.rawEndBoundary != null && this.rawEndBoundary.length === 0)
        this.rawEndBoundary = null;
      const folded = Multipart.foldPreambleOrEpilogue(FormatOptions.default, value, true);
      this.rawEpilogue = encoder.encode(folded);
      this.epilogueValue = null;
    }
  }

  get WriteEndBoundary(): boolean { return this.writeEndBoundary; }
  get writeEndBoundary(): boolean { return this.rawEndBoundary == null || this.rawEndBoundary.length > 0; }
  get Count(): number { return this.count; }
  get count(): number { return this.children.length; }
  get IsReadOnly(): boolean { return false; }
  get isReadOnly(): boolean { return false; }

  at(index: number): MimeEntity {
    this.validateExistingIndex(index);
    return this.children[index]!;
  }

  set(index: number, entity: MimeEntity): void {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    this.validateExistingIndex(index);
    this.children[index] = entity;
  }

  add(entity: MimeEntity): void {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    this.rawBoundaries?.push(null);
    this.children.push(entity);
  }

  addInternal(entity: MimeEntity, boundary: Uint8Array | null): void {
    this.rawBoundaries ??= [];
    this.rawBoundaries.push(boundary);
    this.children.push(entity);
  }

  clear(dispose = false): void {
    if (dispose) {
      for (const child of this.children)
        child.dispose();
    }
    this.rawEndBoundary = null;
    this.rawBoundaries = null;
    this.children.length = 0;
  }

  contains(entity: MimeEntity): boolean {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    return this.children.includes(entity);
  }

  copyTo(array: MimeEntity[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null or undefined');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > array.length)
      throw new RangeError('arrayIndex out of range');
    if (array.length - arrayIndex < this.children.length)
      throw new RangeError('array is too small');
    for (let i = 0; i < this.children.length; i++)
      array[arrayIndex + i] = this.children[i]!;
  }

  remove(entity: MimeEntity): boolean {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    const index = this.children.indexOf(entity);
    if (index === -1)
      return false;
    this.rawBoundaries?.splice(index, 1);
    this.children.splice(index, 1);
    return true;
  }

  indexOf(entity: MimeEntity): number {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    return this.children.indexOf(entity);
  }

  insert(index: number, entity: MimeEntity): void {
    if (!Number.isInteger(index) || index < 0 || index > this.children.length)
      throw new RangeError('index out of range');
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    this.rawBoundaries?.splice(index, 0, null);
    this.children.splice(index, 0, entity);
  }

  removeAt(index: number): void {
    this.validateExistingIndex(index);
    this.rawBoundaries?.splice(index, 1);
    this.children.splice(index, 1);
  }

  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('Multipart');
    visitor.visitMultipart(this);
  }

  tryGetValue(format: TextFormat): TextPart | null {
    for (let i = 0; i < this.count; i++) {
      const child = this.children[i]!;
      if (child instanceof Multipart) {
        const body = child.tryGetValue(format);
        if (body != null) return body;
        break;
      }
      if (child instanceof TextPart && !child.isAttachment) {
        return child.isFormat(format) ? child : null;
      }
    }
    return null;
  }

  static foldPreambleOrEpilogue(options: FormatOptions, text: string, isEpilogue: boolean): string {
    const builder: string[] = [];
    let lineLength = 0;
    let index = 0;
    if (isEpilogue)
      builder.push(options.newLine);
    while (index < text.length) {
      let startIndex = index;
      while (index < text.length) {
        if (!/\s/.test(text[index]!))
          break;
        if (text[index] === '\n') {
          builder.push(options.newLine);
          startIndex = index + 1;
          lineLength = 0;
        }
        index++;
      }
      const wordIndex = index;
      while (index < text.length && !/\s/.test(text[index]!))
        index++;
      let length = index - startIndex;
      if (lineLength > 0 && lineLength + length >= options.maxLineLength) {
        builder.push(options.newLine);
        length = index - wordIndex;
        startIndex = wordIndex;
        lineLength = 0;
      }
      if (length > 0) {
        builder.push(text.slice(startIndex, startIndex + length));
        lineLength += length;
      }
    }
    if (lineLength > 0)
      builder.push(options.newLine);
    return builder.join('');
  }

  override prepare(constraint: EncodingConstraint, maxLineLength = 78): void {
    if (maxLineLength < MINIMUM_LINE_LENGTH || maxLineLength > MAXIMUM_LINE_LENGTH)
      throw new RangeError('maxLineLength out of range');
    this.checkDisposed('Multipart');
    for (const child of this.children)
      child.prepare(constraint, maxLineLength);
  }

  override writeTo(a: FormatOptions | Stream, b?: Stream, contentOnly = false): void {
    let options = a instanceof FormatOptions ? a : FormatOptions.default;
    const stream = a instanceof FormatOptions ? b : a;
    super.writeTo(options, stream!, contentOnly);

    if (this.contentType.isMimeType('multipart', 'signed')) {
      // C# GetMultipartSignedFormatOptions: signed subparts write with
      // international disabled. // deferred(hidden-headers): cleared with
      // signature work when HiddenHeaders is ported.
      options = options.clone();
      options.international = false;
    }

    if (this.rawPreamble != null && this.rawPreamble.length > 0)
      writeBytes(stream!, this.rawPreamble, options, this.children.length > 0 || this.ensureNewLine);

    const defaultBoundary = encoder.encode(`--${this.boundary}${options.newLine}`);
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i]!;
      const boundary = this.rawBoundaries?.[i] ?? defaultBoundary;
      stream!.write(boundary, 0, boundary.length);
      child.writeTo(options, stream!, false);

      let multi = child instanceof Multipart ? child : null;
      let part = child instanceof MimePart ? child : null;
      const rfc822 = child instanceof MessagePart ? child : null;
      if (rfc822?.message?.body != null) {
        multi = rfc822.message.body instanceof Multipart ? rfc822.message.body : null;
        part = rfc822.message.body instanceof MimePart ? rfc822.message.body : null;
      }
      if ((part != null && part.content == null) || (rfc822 != null && (rfc822.message == null || rfc822.message.body == null)) || (multi != null && !multi.writeEndBoundary))
        continue;
      writeAscii(stream!, options.newLine);
    }

    if (this.rawEndBoundary != null) {
      if (this.rawEndBoundary.length === 0)
        return;
      stream!.write(this.rawEndBoundary, 0, this.rawEndBoundary.length);
    } else {
      writeAscii(stream!, `--${this.boundary}--${this.rawEpilogue == null ? options.newLine : ''}`);
    }

    if (this.rawEpilogue != null && this.rawEpilogue.length > 0)
      writeBytes(stream!, this.rawEpilogue, options, this.ensureNewLine);
  }

  [Symbol.iterator](): Iterator<MimeEntity> {
    return this.children[Symbol.iterator]();
  }

  override dispose(): void {
    for (const child of this.children)
      child.dispose();
    this.rawBoundaries = null;
    this.contentType.parameters.onBoundaryChanged = null;
    super.dispose();
  }

  private validateExistingIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.children.length)
      throw new RangeError('index out of range');
  }

  private boundaryChanged(): void {
    this.rawEndBoundary = null;
    this.rawBoundaries = null;
  }
}

function isConstructorArgs(value: unknown): value is MimeEntityConstructorArgs {
  return typeof value === 'object' && value !== null && 'parserOptions' in value && 'contentType' in value && 'headers' in value;
}

function writeBytes(stream: Stream, bytes: Uint8Array, options: FormatOptions, ensureNewLine: boolean): void {
  const filtered = options.createNewLineFilter(ensureNewLine);
  const output = filtered.flush(bytes, 0, bytes.length);
  stream.write(output.buffer, output.index, output.length);
}

function writeAscii(stream: Stream, text: string): void {
  const bytes = encoder.encode(text);
  stream.write(bytes, 0, bytes.length);
}

function defaultBoundaryGenerator(): string {
  const digest = new Uint8Array(16);
  crypto.getRandomValues(digest);
  let binary = '';
  for (const byte of digest)
    binary += String.fromCharCode(byte);
  return `=-${btoa(binary)}`;
}
