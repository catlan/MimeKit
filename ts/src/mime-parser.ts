/**
 * Port of MimeKit/ExperimentalMimeParser.cs (sync paths only).
 *
 * Per the port plan (Q5), the MimeReader-based "Experimental" parser is THE
 * TypeScript parser: a DOM builder layered on the SAX-style MimeReader. It
 * overrides the reader's `on*` events to assemble a MimeMessage / MimeEntity
 * tree, mirroring the C# class field-for-field and event-for-event.
 *
 * Error model: the reader's internal FormatError (C#: FormatException) is
 * caught at the public parse* boundary and wrapped as a Result Err with
 * kind 'parse-error' (TryParse semantics — see PLAN.md decision #4). Any other
 * throw (programmer error) propagates. On failure the parser is Reset, as in
 * the C# try/catch.
 */
import { createEntity } from './create-entity.js';
import type { ContentType } from './content-type.js';
import type { Header } from './header.js';
import { HeaderList } from './header-list.js';
import { BoundStream } from './io/bound-stream.js';
import { MemoryBlockStream } from './io/memory-block-stream.js';
import { MemoryStream, Stream } from './io/stream.js';
import { MimeContent } from './mime-content.js';
import { MimeEntity } from './mime-entity.js';
import { FormatError, MimeReader, type MimeFormat, type ReaderNewLineFormat } from './mime-reader.js';
import { MimeMessage } from './mime-message.js';
import { MimePart } from './mime-part.js';
import { MessagePart } from './message-part.js';
import { Multipart } from './multipart.js';
import { setParserFactory } from './parser-hook.js';
import { ParserOptions } from './parser-options.js';
import { type Result, err, ok } from './result.js';

type StackItem = MimeMessage | MimeEntity;

export class MimeParser extends MimeReader {
  private readonly stack: StackItem[] = [];

  // Mbox state
  private mboxMarkerBuffer: Uint8Array | null = null;
  private mboxMarkerOffsetValue = -1;
  private mboxMarkerLength = 0;

  // Current MimeMessage/MimeEntity header state
  private readonly headers: Header[] = [];
  private preHeaderBuffer: Uint8Array | null = null;
  private preHeaderLength = 0;

  private rawBoundary: Uint8Array | null = null;

  // MimePart content and Multipart preamble/epilogue state
  private content: Stream | null = null;

  private parsingMessageHeaders = false;
  private hasBodySeparator = false;
  private depth = 0;

  private persistent = false;

  constructor(stream: Stream, format?: MimeFormat, persistent?: boolean);
  constructor(options: ParserOptions, stream: Stream, format?: MimeFormat, persistent?: boolean);
  constructor(a: Stream | ParserOptions, b?: Stream | MimeFormat, c?: MimeFormat | boolean, d?: boolean) {
    let options: ParserOptions;
    let stream: Stream;
    let format: MimeFormat;
    let persistent: boolean;
    if (a instanceof ParserOptions) {
      options = a;
      stream = b as Stream;
      format = (c as MimeFormat | undefined) ?? 'entity';
      persistent = d ?? false;
    } else {
      options = ParserOptions.default;
      stream = a;
      format = (b as MimeFormat | undefined) ?? 'entity';
      persistent = (c as boolean | undefined) ?? false;
    }
    super(options, stream, format);
    this.onSetStream(stream, format, persistent);
  }

  /** C#: MboxMarkerOffset. */
  get mboxMarkerOffset(): number {
    return this.mboxMarkerOffsetValue;
  }

  /** C#: MboxMarker. */
  get mboxMarker(): string | null {
    return this.mboxMarkerOffsetValue !== -1
      ? new TextDecoder().decode(this.mboxMarkerBuffer!.subarray(0, this.mboxMarkerLength))
      : null;
  }

  /** C#: Position (camelCase alias of the reader's Position). */
  get position(): number {
    return this.Position;
  }

  private onSetStream(stream: Stream, format: MimeFormat, persistent: boolean): void {
    this.persistent = persistent && stream.canSeek;
    this.mboxMarkerOffsetValue = -1;
    if (format === 'mbox' && this.mboxMarkerBuffer === null) this.mboxMarkerBuffer = new Uint8Array(64);
  }

  override setStream(stream: Stream, format: MimeFormat = 'entity', persistent = false): void {
    super.setStream(stream, format);
    this.onSetStream(stream, format, persistent);
  }

  private pushEntity(entity: MimeEntity): void {
    if (this.stack.length > 0) {
      const parent = this.stack[this.stack.length - 1]!;
      if (parent instanceof Multipart) {
        parent.addInternal(entity, this.rawBoundary);
        this.rawBoundary = null;
      } else if (parent instanceof MimeMessage) {
        parent.body = entity;
      }
    }
    this.stack.push(entity);
  }

  private popEntity(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  // #region Mbox Events ---------------------------------------------------------

  protected override onMboxMarkerBegin(beginOffset: number, _lineNumber: number): void {
    this.mboxMarkerOffsetValue = beginOffset;
    this.mboxMarkerLength = 0;
  }

  protected override onMboxMarkerRead(buffer: Uint8Array, startIndex: number, count: number): void {
    const needed = this.mboxMarkerLength + count;
    if (this.mboxMarkerBuffer!.length < needed) {
      const grown = new Uint8Array(needed);
      grown.set(this.mboxMarkerBuffer!);
      this.mboxMarkerBuffer = grown;
    }
    this.mboxMarkerBuffer!.set(buffer.subarray(startIndex, startIndex + count), this.mboxMarkerLength);
    this.mboxMarkerLength += count;
  }

  // #endregion

  // #region Header Events -------------------------------------------------------

  protected override onHeadersBegin(): void {
    this.headers.length = 0;
    this.preHeaderLength = 0;
    this.hasBodySeparator = false;
  }

  protected override onHeaderRead(header: Header): void {
    if (this.parsingMessageHeaders && header.isInvalid && this.headers.length === 0) {
      const field = header.rawField;
      if (this.preHeaderBuffer === null) {
        this.preHeaderBuffer = new Uint8Array(field.length);
      } else if (field.length + this.preHeaderLength > this.preHeaderBuffer.length) {
        const grown = new Uint8Array(field.length + this.preHeaderLength);
        grown.set(this.preHeaderBuffer);
        this.preHeaderBuffer = grown;
      }
      this.preHeaderBuffer.set(field, this.preHeaderLength);
      this.preHeaderLength += field.length;
    } else {
      this.headers.push(header);
    }
  }

  protected override onHeadersEnd(): void {
    this.parsingMessageHeaders = false;
  }

  protected override onBodySeparator(): void {
    this.hasBodySeparator = true;
  }

  // #endregion

  // #region MimeMessage Events --------------------------------------------------

  protected override onMimeMessageBegin(): void {
    const message = new MimeMessage(this.Options, this.headers, 'loose');

    if (this.preHeaderLength > 0) {
      message.mboxMarker = this.preHeaderBuffer!.slice(0, this.preHeaderLength);
    }

    if (this.stack.length > 0) {
      const rfc822 = this.stack[this.stack.length - 1] as MessagePart;
      rfc822.message = message;
    }

    this.stack.push(message);
  }

  protected override onMimeMessageEnd(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  // #endregion

  // #region MimePart Events -----------------------------------------------------

  protected override onMimePartBegin(contentType: ContentType): void {
    const toplevel = this.stack.length > 0 && this.stack[this.stack.length - 1] instanceof MimeMessage;
    const part = createEntity(this.Options, contentType, this.headers, this.hasBodySeparator, toplevel, this.depth);
    this.pushEntity(part);
  }

  protected override onMimePartContentBegin(): void {
    this.content = this.persistent ? null : new MemoryBlockStream();
  }

  protected override onMimePartContentRead(buffer: Uint8Array, startIndex: number, count: number): void {
    if (this.content !== null) this.content.write(buffer, startIndex, count);
  }

  protected override onMimePartContentEnd(
    beginOffset: number,
    _beginLineNumber: number,
    endOffset: number,
    _lines: number,
    newLineFormat: ReaderNewLineFormat | null,
  ): void {
    if (endOffset <= beginOffset && newLineFormat === null) {
      // Note: This is a hack that makes Multipart.WriteTo() work properly.
      this.content?.dispose();
      this.content = null;
      return;
    }

    const part = this.stack[this.stack.length - 1] as MimePart;

    let content: Stream;
    if (this.content === null /* aka 'persistent' */) {
      content = new BoundStream(this.stream, beginOffset, endOffset, true);
    } else {
      this.content.setLength(endOffset - beginOffset);
      this.content.position = 0;
      content = this.content;
    }

    const mimeContent = new MimeContent(content, part.contentTransferEncoding);
    mimeContent.newLineFormat = newLineFormat;
    part.content = mimeContent;
    this.content = null;
  }

  protected override onMimePartEnd(): void {
    this.popEntity();
  }

  // #endregion

  // #region MessagePart Events --------------------------------------------------

  protected override onMessagePartBegin(contentType: ContentType): void {
    const toplevel = this.stack.length > 0 && this.stack[this.stack.length - 1] instanceof MimeMessage;
    const rfc822 = createEntity(this.Options, contentType, this.headers, this.hasBodySeparator, toplevel, this.depth);
    this.parsingMessageHeaders = true;
    this.pushEntity(rfc822);
    this.depth++;
  }

  protected override onMessagePartEnd(): void {
    this.popEntity();
    this.depth--;
  }

  // #endregion

  // #region Multipart Events ----------------------------------------------------

  protected override onMultipartBegin(contentType: ContentType): void {
    const toplevel = this.stack.length > 0 && this.stack[this.stack.length - 1] instanceof MimeMessage;
    const multipart = createEntity(this.Options, contentType, this.headers, this.hasBodySeparator, toplevel, this.depth);
    this.pushEntity(multipart);
    this.depth++;
  }

  protected override onMultipartPreambleBegin(): void {
    this.content = new MemoryStream();
  }

  protected override onMultipartPreambleRead(buffer: Uint8Array, startIndex: number, count: number): void {
    this.content!.write(buffer, startIndex, count);
  }

  protected override onMultipartPreambleEnd(beginOffset: number, _beginLineNumber: number, endOffset: number): void {
    const multipart = this.stack[this.stack.length - 1] as Multipart;
    this.content!.setLength(endOffset - beginOffset);
    multipart.rawPreamble = (this.content as MemoryStream).toArray();
    this.content!.dispose();
    this.content = null;
  }

  protected override onMultipartBoundaryRead(buffer: Uint8Array, startIndex: number, count: number): void {
    // Each call contains a full boundary marker. If rawBoundary is not null we've
    // seen a "double boundary" — append the second (etc.) to the existing buffer.
    let rawIndex: number;
    if (this.rawBoundary !== null) {
      rawIndex = this.rawBoundary.length;
      const grown = new Uint8Array(rawIndex + count);
      grown.set(this.rawBoundary);
      this.rawBoundary = grown;
    } else {
      this.rawBoundary = new Uint8Array(count);
      rawIndex = 0;
    }
    this.rawBoundary.set(buffer.subarray(startIndex, startIndex + count), rawIndex);
  }

  protected override onMultipartEndBoundaryRead(buffer: Uint8Array, startIndex: number, count: number): void {
    const multipart = this.stack[this.stack.length - 1] as Multipart;
    multipart.rawEndBoundary = buffer.slice(startIndex, startIndex + count);
  }

  protected override onMultipartEpilogueBegin(): void {
    this.content = new MemoryStream();
  }

  protected override onMultipartEpilogueRead(buffer: Uint8Array, startIndex: number, count: number): void {
    this.content!.write(buffer, startIndex, count);
  }

  protected override onMultipartEpilogueEnd(beginOffset: number, _beginLineNumber: number, endOffset: number): void {
    const multipart = this.stack[this.stack.length - 1] as Multipart;
    this.content!.setLength(endOffset - beginOffset);
    multipart.rawEpilogue = (this.content as MemoryStream).toArray();
    this.content!.dispose();
    this.content = null;
  }

  protected override onMultipartEnd(): void {
    this.popEntity();
    this.depth--;
  }

  // #endregion

  private reset(): void {
    while (this.stack.length > 0) {
      const item = this.stack.pop()!;
      item.dispose();
    }
    this.content?.dispose();
    this.content = null;
  }

  private initializeState(parsingMessageHeaders: boolean): void {
    // Note: if a previously parsed MimePart's content has been read, then the
    // stream position will have moved and will need to be reset.
    if (this.persistent && this.stream.position !== this.streamPosition)
      this.stream.seek(this.streamPosition, 'begin');

    this.parsingMessageHeaders = parsingMessageHeaders;
    this.mboxMarkerOffsetValue = -1;
    this.stack.length = 0;
    this.depth = 0;
  }

  // #region Public API ----------------------------------------------------------

  /** C#: ParseHeaders. */
  parseHeaders(): Result<HeaderList> {
    this.initializeState(false);

    try {
      this.readHeaders();
    } catch (ex) {
      this.reset();
      return this.wrapError(ex);
    }

    const parsed = new HeaderList(this.Options);
    for (const header of this.headers) parsed.add(header);
    parsed.hasBodySeparator = this.hasBodySeparator;

    return ok(parsed);
  }

  /** C#: ParseEntity. */
  parseEntity(): Result<MimeEntity> {
    this.initializeState(false);

    try {
      this.readEntity();
    } catch (ex) {
      this.reset();
      return this.wrapError(ex);
    }

    return ok(this.stack.pop() as MimeEntity);
  }

  /** C#: ParseMessage. */
  parseMessage(): Result<MimeMessage> {
    this.initializeState(true);

    try {
      this.readMessage();
    } catch (ex) {
      this.reset();
      return this.wrapError(ex);
    }

    return ok(this.stack.pop() as MimeMessage);
  }

  private wrapError<T>(ex: unknown): Result<T> {
    if (ex instanceof FormatError) return err('parse-error', ex.message);
    throw ex;
  }

  // #endregion
}

// Register the concrete parser with the lazy hook so the model layer's `load`
// helpers can construct it without a module-eval import cycle.
setParserFactory((options, stream, format, persistent) => new MimeParser(options, stream, format, persistent));
