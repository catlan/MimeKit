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

/**
 * Sets the boundary generator used when creating new multipart entities.
 *
 * @param generator The generator to use, or `null` to restore the default.
 */
export function setBoundaryGenerator(generator: (() => string) | null): void {
  boundaryGenerator = generator ?? defaultBoundaryGenerator;
}

/**
 * Generates a MIME multipart boundary string.
 *
 * @returns A boundary suitable for a multipart Content-Type parameter.
 */
export function generateBoundary(): string {
  return boundaryGenerator();
}

/**
 * A multipart MIME entity containing child MIME entities.
 *
 * Multipart entities include a preamble, zero or more body parts, and an
 * optional epilogue separated by a boundary.
 */
export class Multipart extends MimeEntity implements Iterable<MimeEntity> {
  /** Raw boundary bytes preserved from parsing, one entry per child. */
  rawBoundaries: Array<Uint8Array | null> | null = null;
  /** Raw preamble bytes preserved from parsing. */
  rawPreamble: Uint8Array | null = null;
  /** Raw closing boundary bytes preserved from parsing. */
  rawEndBoundary: Uint8Array | null = null;
  /** Raw epilogue bytes preserved from parsing. */
  rawEpilogue: Uint8Array | null = null;
  private readonly children: MimeEntity[] = [];
  private preambleValue: string | null = null;
  private epilogueValue: string | null = null;

  /**
   * Initializes a new multipart entity.
   *
   * @param subtype The multipart media subtype.
   * @throws {TypeError} `subtype` or an initialization argument is invalid.
   */
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

  /** Gets or sets the boundary parameter. */
  get Boundary(): string | null { return this.boundary; }
  /** Sets the boundary parameter. */
  set Boundary(value: string | null) { this.boundary = value; }
  /** Gets or sets the boundary parameter. */
  get boundary(): string | null { return this.contentType.boundary; }
  /** Sets the boundary parameter. */
  set boundary(value: string | null) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (this.boundary === value)
      return;
    this.contentType.boundary = value.trim();
  }

  /** Gets or sets the multipart preamble. */
  get Preamble(): string | null { return this.preamble; }
  /** Sets the multipart preamble. */
  set Preamble(value: string | null) { this.preamble = value; }
  /** Gets or sets the multipart preamble. */
  get preamble(): string | null {
    if (this.preambleValue == null && this.rawPreamble != null)
      this.preambleValue = new TextDecoder().decode(this.rawPreamble);
    return this.preambleValue;
  }
  /** Sets the multipart preamble. */
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

  /** Gets or sets the multipart epilogue. */
  get Epilogue(): string | null { return this.epilogue; }
  /** Sets the multipart epilogue. */
  set Epilogue(value: string | null) { this.epilogue = value; }
  /** Gets or sets the multipart epilogue. */
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
  /** Sets the multipart epilogue. */
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

  /** Gets whether an end boundary should be written. */
  get WriteEndBoundary(): boolean { return this.writeEndBoundary; }
  /** Gets whether an end boundary should be written. */
  get writeEndBoundary(): boolean { return this.rawEndBoundary == null || this.rawEndBoundary.length > 0; }
  /** Gets the number of child MIME entities. */
  get Count(): number { return this.count; }
  /** Gets the number of child MIME entities. */
  get count(): number { return this.children.length; }
  /** Gets whether the collection is read-only. */
  get IsReadOnly(): boolean { return false; }
  /** Gets whether the collection is read-only. */
  get isReadOnly(): boolean { return false; }

  /**
   * Gets the child entity at the specified index.
   *
   * @param index The zero-based child index.
   * @returns The child entity.
   * @throws {RangeError} `index` is out of range.
   */
  at(index: number): MimeEntity {
    this.validateExistingIndex(index);
    return this.children[index]!;
  }

  /**
   * Replaces the child entity at the specified index.
   *
   * @param index The zero-based child index.
   * @param entity The replacement entity.
   */
  set(index: number, entity: MimeEntity): void {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    this.validateExistingIndex(index);
    this.children[index] = entity;
  }

  /**
   * Adds a child MIME entity.
   *
   * @param entity The entity to add.
   */
  add(entity: MimeEntity): void {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    this.rawBoundaries?.push(null);
    this.children.push(entity);
  }

  /**
   * Adds a child entity with its raw boundary as parsed.
   *
   * @param entity The entity to add.
   * @param boundary The raw boundary bytes.
   */
  addInternal(entity: MimeEntity, boundary: Uint8Array | null): void {
    this.rawBoundaries ??= [];
    this.rawBoundaries.push(boundary);
    this.children.push(entity);
  }

  /**
   * Removes all child entities.
   *
   * @param dispose Whether to dispose removed children.
   */
  clear(dispose = false): void {
    if (dispose) {
      for (const child of this.children)
        child.dispose();
    }
    this.rawEndBoundary = null;
    this.rawBoundaries = null;
    this.children.length = 0;
  }

  /**
   * Tests whether a child entity is present.
   *
   * @param entity The entity to locate.
   * @returns `true` if the entity is present; otherwise `false`.
   */
  contains(entity: MimeEntity): boolean {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    return this.children.includes(entity);
  }

  /**
   * Copies child entities into an array.
   *
   * @param array The destination array.
   * @param arrayIndex The starting index in `array`.
   */
  copyTo(array: MimeEntity[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null or undefined');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > array.length)
      throw new RangeError('arrayIndex out of range');
    if (array.length - arrayIndex < this.children.length)
      throw new RangeError('array is too small');
    for (let i = 0; i < this.children.length; i++)
      array[arrayIndex + i] = this.children[i]!;
  }

  /**
   * Removes a child MIME entity.
   *
   * @param entity The entity to remove.
   * @returns `true` if the entity was removed; otherwise `false`.
   */
  remove(entity: MimeEntity): boolean {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    const index = this.children.indexOf(entity);
    if (index === -1)
      return false;
    this.rawBoundaries?.splice(index, 1);
    this.children.splice(index, 1);
    return true;
  }

  /**
   * Gets the index of a child entity.
   *
   * @param entity The entity to locate.
   * @returns The zero-based index, or `-1` if not found.
   */
  indexOf(entity: MimeEntity): number {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    return this.children.indexOf(entity);
  }

  /**
   * Inserts a child entity at the specified index.
   *
   * @param index The insertion index.
   * @param entity The entity to insert.
   */
  insert(index: number, entity: MimeEntity): void {
    if (!Number.isInteger(index) || index < 0 || index > this.children.length)
      throw new RangeError('index out of range');
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    this.rawBoundaries?.splice(index, 0, null);
    this.children.splice(index, 0, entity);
  }

  /**
   * Removes the child entity at the specified index.
   *
   * @param index The zero-based child index.
   */
  removeAt(index: number): void {
    this.validateExistingIndex(index);
    this.rawBoundaries?.splice(index, 1);
    this.children.splice(index, 1);
  }

  /**
   * Dispatches to the visitor method for multipart entities.
   *
   * @param visitor The visitor.
   */
  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('Multipart');
    visitor.visitMultipart(this);
  }

  /**
   * Finds the preferred text part for the requested format.
   *
   * @param format The text format to find.
   * @returns The matching text part, or `null`.
   */
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

  /**
   * Folds preamble or epilogue text for serialization.
   *
   * @param options Formatting options.
   * @param text The text to fold.
   * @param isEpilogue Whether the text is an epilogue.
   * @returns Folded text.
   */
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

  /**
   * Prepares each child entity for transport.
   *
   * @param constraint The encoding constraint.
   * @param maxLineLength The maximum encoded line length.
   */
  override prepare(constraint: EncodingConstraint, maxLineLength = 78): void {
    if (maxLineLength < MINIMUM_LINE_LENGTH || maxLineLength > MAXIMUM_LINE_LENGTH)
      throw new RangeError('maxLineLength out of range');
    this.checkDisposed('Multipart');
    for (const child of this.children)
      child.prepare(constraint, maxLineLength);
  }

  /**
   * Writes the multipart entity to a stream.
   *
   * @param options Formatting options.
   * @param stream The destination stream.
   * @param contentOnly Whether to omit the multipart headers.
   */
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

  /** Returns an iterator over the child MIME entities. */
  [Symbol.iterator](): Iterator<MimeEntity> {
    return this.children[Symbol.iterator]();
  }

  /** Disposes the multipart and all child entities. */
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
