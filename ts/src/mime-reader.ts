/**
 * Port of MimeKit/MimeReader.cs (sync paths only).
 *
 * A SAX-style, forward-only, event-driven MIME tokenizer over a `Stream`.
 * Subclasses override the `on*` event methods to build a DOM (the parser
 * slice) or to observe offsets. The async partial (AsyncMimeReader.cs) is out
 * of scope per the port plan.
 *
 * The C# original uses `unsafe`/`byte*` arithmetic over a fixed input buffer.
 * This port keeps the exact same buffer layout and offset math but operates on
 * integer indices into a `Uint8Array`; a `byte*` `inptr`/`start`/`inend` in the
 * C# becomes an integer index into `this.input`, so `(int)(inptr - inbuf)` is
 * just the index and `(int)(inptr - start)` is a difference of indices. The
 * padded-buffer sentinel trick (`*inend = '\n'`) is reproduced by writing
 * `this.input[this.inputEnd] = 0x0A` (PadSize bytes of slack guarantee room).
 */
import { ContentType } from './content-type.js';
import type { ContentEncoding } from './content-encoding.js';
import { Header } from './header.js';
import { HeaderId, toHeaderId } from './header-id.js';
import { ParameterList } from './parameter-list.js';
import { ParserOptions } from './parser-options.js';
import { Stream } from './io/stream.js';
import { isBlank, isCtrl, isWhitespace } from './utils/byte-extensions.js';
import { tryParse as tryParseContentEncoding } from './utils/mime-utils.js';
import { skipWhiteSpace, tryParseInt32 } from './utils/parse-utils.js';

/** Port of MimeKit/MimeFormat.cs (Default === Entity). */
export type MimeFormat = 'entity' | 'mbox';

/** Port of MimeKit/NewLineFormat.cs. */
export type ReaderNewLineFormat = 'unix' | 'dos' | 'mixed';

enum BoundaryType {
  None,
  Eos,
  ImmediateBoundary,
  ImmediateEndBoundary,
  ParentBoundary,
  ParentEndBoundary,
}

enum MimeParserState {
  Error = -1,
  Initialized,
  MboxMarker,
  MessageHeaders,
  Headers,
  Content,
  Boundary,
  Complete,
  Eos,
}

enum MimeEntityType {
  MimePart,
  MessagePart,
  Multipart,
}

const MboxFrom = Uint8Array.of(0x46, 0x72, 0x6f, 0x6d, 0x20); // "From "

/** Port of MimeKit's private Boundary class (in MimeParser.cs). */
class Boundary {
  next: Boundary | null;
  readonly marker: Uint8Array;
  readonly length: number;
  readonly maxLength: number;
  readonly isMboxMarker: boolean;

  get finalLength(): number {
    return this.marker.length;
  }

  private constructor(marker: Uint8Array, length: number, maxLength: number, isMbox: boolean, next: Boundary | null) {
    this.marker = marker;
    this.length = length;
    this.maxLength = maxLength;
    this.isMboxMarker = isMbox;
    this.next = next;
  }

  static create(boundary: string, parent: Boundary | null): Boundary {
    const marker = utf8Bytes('--' + boundary + '--');
    const length = marker.length - 2;
    const maxLength = parent !== null ? Math.max(parent.maxLength, marker.length) : marker.length;
    return new Boundary(marker, length, maxLength, false, parent);
  }

  static createMboxBoundary(): Boundary {
    return new Boundary(MboxFrom, 5, 5, true, null);
  }
}

const UTF8ByteOrderMark = Uint8Array.of(0xef, 0xbb, 0xbf);
const SmtpMaxLineLength = 1000;
const ReadAheadSize = 128;
const BlockSize = 4096;
const PadSize = 4;
const inputStart = ReadAheadSize;

// NewLineFormat numeric indices (C#: Unix=0, Dos=1, Mixed=2).
const NLF_UNIX = 0;
const NLF_DOS = 1;

class ScanContentResult {
  readonly format: ReaderNewLineFormat | null;
  readonly isEmpty: boolean;
  readonly contentLength: number;
  readonly lines: number;

  constructor(contentLength: number, lines: number, formats: boolean[], isEmpty: boolean) {
    this.contentLength = contentLength;
    if (formats[NLF_UNIX] && formats[NLF_DOS]) this.format = 'mixed';
    else if (formats[NLF_UNIX]) this.format = 'unix';
    else if (formats[NLF_DOS]) this.format = 'dos';
    else this.format = null;
    this.isEmpty = isEmpty;
    this.lines = lines;
  }
}

enum ScanContentType {
  MimeContent,
  MultipartPreamble,
  MultipartEpilogue,
}

export class MimeReader {
  // I/O buffering
  private readonly input = new Uint8Array(ReadAheadSize + BlockSize + PadSize);
  private inputIndex = ReadAheadSize;
  private inputEnd = ReadAheadSize;

  // header buffer
  private headerBuffer = new Uint8Array(512);
  private headerIndex = 0;
  private headerCount = 0;

  // boundary state
  private boundaries: Boundary | null = null;
  private currentBoundary: Boundary | null = null;
  private boundaryType: BoundaryType = BoundaryType.None;

  private currentEncoding: ContentEncoding | null = null;
  private currentContentType: ContentType | null = null;
  private currentContentLength: number | null = null;

  private state: MimeParserState = MimeParserState.Initialized;
  private format: MimeFormat = 'entity';
  private toplevel = false;
  private eos = false;

  private headerBlockBegin = 0;
  private headerBlockEnd = 0;
  private contentEnd = 0;

  private prevLineBeginOffset = 0;
  private lineBeginOffset = 0;
  private lineNumber = 1;

  private options!: ParserOptions;
  protected stream!: Stream;
  private position = 0;

  constructor(stream: Stream, format?: MimeFormat);
  constructor(options: ParserOptions, stream: Stream, format?: MimeFormat);
  constructor(a: Stream | ParserOptions, b?: Stream | MimeFormat, c?: MimeFormat) {
    let options: ParserOptions;
    let stream: Stream;
    let format: MimeFormat;
    if (a instanceof ParserOptions) {
      options = a;
      stream = b as Stream;
      format = c ?? 'entity';
    } else {
      options = ParserOptions.default;
      stream = a;
      format = (b as MimeFormat) ?? 'entity';
    }
    this.setOptions(options);
    this.initialize(stream, format);
  }

  get Options(): ParserOptions {
    return this.options;
  }
  set Options(value: ParserOptions) {
    this.setOptions(value);
  }

  private setOptions(value: ParserOptions): void {
    if (value == null) throw new TypeError('options cannot be null or undefined');
    this.options = value === ParserOptions.default ? value.clone() : value;
  }

  /** C#: IsEndOfStream. */
  get isEndOfStream(): boolean {
    return this.state === MimeParserState.Eos;
  }

  /** C#: Position. */
  get Position(): number {
    return this.getOffset(this.inputIndex);
  }

  private initialize(stream: Stream, format: MimeFormat): void {
    if (stream == null) throw new TypeError('stream cannot be null or undefined');

    this.format = format;
    this.stream = stream;

    this.inputIndex = inputStart;
    this.inputEnd = inputStart;

    this.headerBlockBegin = 0;
    this.headerBlockEnd = 0;
    this.lineNumber = 1;
    this.contentEnd = 0;

    this.position = stream.canSeek ? stream.position : 0;
    this.prevLineBeginOffset = this.position;
    this.lineBeginOffset = this.position;
    this.toplevel = false;
    this.eos = false;

    this.boundaries = format === 'mbox' ? Boundary.createMboxBoundary() : null;

    this.state = MimeParserState.Initialized;
    this.boundaryType = BoundaryType.None;
    this.currentBoundary = null;
  }

  setStream(stream: Stream, format: MimeFormat = 'entity'): void {
    this.initialize(stream, format);
  }

  // #region Event virtuals (subclasses override) --------------------------------

  protected onMboxMarkerBegin(_beginOffset: number, _lineNumber: number): void {}
  protected onMboxMarkerRead(_buffer: Uint8Array, _startIndex: number, _count: number, _beginOffset: number, _lineNumber: number): void {}
  protected onMboxMarkerEnd(_beginOffset: number, _lineNumber: number, _endOffset: number): void {}

  protected onHeadersBegin(_beginOffset: number, _beginLineNumber: number): void {}
  protected onHeaderRead(_header: Header, _beginLineNumber: number): void {}
  protected onHeadersEnd(_beginOffset: number, _beginLineNumber: number, _endOffset: number, _endLineNumber: number): void {}
  protected onBodySeparator(_beginOffset: number, _lineNumber: number, _endOffset: number): void {}

  protected onMimeMessageBegin(_beginOffset: number, _beginLineNumber: number): void {}
  protected onMimeMessageEnd(_beginOffset: number, _beginLineNumber: number, _headersEndOffset: number, _endOffset: number, _lines: number): void {}

  protected onMimePartBegin(_contentType: ContentType, _beginOffset: number, _beginLineNumber: number): void {}
  protected onMimePartContentBegin(_beginOffset: number, _beginLineNumber: number): void {}
  protected onMimePartContentRead(_buffer: Uint8Array, _startIndex: number, _count: number): void {}
  protected onMimePartContentEnd(_beginOffset: number, _beginLineNumber: number, _endOffset: number, _lines: number, _newLineFormat: ReaderNewLineFormat | null): void {}
  protected onMimePartEnd(_contentType: ContentType, _beginOffset: number, _beginLineNumber: number, _headersEndOffset: number, _endOffset: number, _lines: number): void {}

  protected onMessagePartBegin(_contentType: ContentType, _beginOffset: number, _beginLineNumber: number): void {}
  protected onMessagePartEnd(_contentType: ContentType, _beginOffset: number, _beginLineNumber: number, _headersEndOffset: number, _endOffset: number, _lines: number): void {}

  protected onMultipartBegin(_contentType: ContentType, _beginOffset: number, _beginLineNumber: number): void {}
  protected onMultipartBoundaryBegin(_beginOffset: number, _lineNumber: number): void {}
  protected onMultipartBoundaryRead(_buffer: Uint8Array, _startIndex: number, _count: number, _beginOffset: number, _lineNumber: number): void {}
  protected onMultipartBoundaryEnd(_beginOffset: number, _lineNumber: number, _endOffset: number): void {}
  protected onMultipartEndBoundaryBegin(_beginOffset: number, _lineNumber: number): void {}
  protected onMultipartEndBoundaryRead(_buffer: Uint8Array, _startIndex: number, _count: number, _beginOffset: number, _lineNumber: number): void {}
  protected onMultipartEndBoundaryEnd(_beginOffset: number, _lineNumber: number, _endOffset: number): void {}
  protected onMultipartPreambleBegin(_beginOffset: number, _beginLineNumber: number): void {}
  protected onMultipartPreambleRead(_buffer: Uint8Array, _startIndex: number, _count: number): void {}
  protected onMultipartPreambleEnd(_beginOffset: number, _beginLineNumber: number, _endOffset: number, _lines: number): void {}
  protected onMultipartEpilogueBegin(_beginOffset: number, _beginLineNumber: number): void {}
  protected onMultipartEpilogueRead(_buffer: Uint8Array, _startIndex: number, _count: number): void {}
  protected onMultipartEpilogueEnd(_beginOffset: number, _beginLineNumber: number, _endOffset: number, _lines: number): void {}
  protected onMultipartEnd(_contentType: ContentType, _beginOffset: number, _beginLineNumber: number, _headersEndOffset: number, _endOffset: number, _lines: number): void {}

  // #endregion ------------------------------------------------------------------

  private static nextAllocSize(need: number): number {
    return (need + 63) & ~63;
  }

  /** C#: AlignReadAheadBuffer. Returns whether a refill should be attempted. */
  private alignReadAheadBuffer(atleast: number, save: number): { refill: boolean; left: number; start: number; end: number } {
    let left = this.inputEnd - this.inputIndex;
    let start = inputStart;
    let end = this.inputEnd;

    if (left >= atleast || this.eos) return { refill: false, left, start, end };

    left += save;

    if (left > 0) {
      let index = this.inputIndex - save;

      // attempt to align the end of the remaining input with ReadAheadSize
      if (index >= start) {
        start -= Math.min(ReadAheadSize, left);
        this.input.copyWithin(start, index, index + left);
        index = start;
        start += left;
      } else if (index > 0) {
        const shift = Math.min(index, end - start);
        this.input.copyWithin(index - shift, index, index + left);
        index -= shift;
        start = index + left;
      } else {
        // we can't shift...
        start = end;
      }

      this.inputIndex = index + save;
      this.inputEnd = start;
    } else {
      this.inputIndex = start;
      this.inputEnd = start;
    }

    end = this.input.length - PadSize;

    return { refill: start < end, left, start, end };
  }

  private readAhead(atleast: number, save: number): number {
    const a = this.alignReadAheadBuffer(atleast, save);

    if (!a.refill) return a.left;

    const nread = this.stream.read(this.input, a.start, a.end - a.start);

    if (nread > 0) {
      this.inputEnd += nread;
      this.position += nread;
    } else {
      this.eos = true;
    }

    return this.inputEnd - this.inputIndex;
  }

  private getOffset(index: number): number {
    return this.position - (this.inputEnd - index);
  }

  private getEndOffset(index: number): number {
    if (this.boundaryType !== BoundaryType.Eos && index > 1 && this.input[index - 1] === 0x0a) {
      index--;

      if (index > 1 && this.input[index - 1] === 0x0d) index--;
    }

    return this.getOffset(index);
  }

  private getLineCount(beginLineNumber: number, beginOffset: number, endOffset: number): number {
    let lines = this.lineNumber - beginLineNumber;

    if (this.lineBeginOffset >= beginOffset && endOffset > this.lineBeginOffset) lines++;

    if (this.boundaryType !== BoundaryType.Eos && endOffset === this.prevLineBeginOffset) lines--;

    return lines;
  }

  private incrementLineNumber(index: number): void {
    this.prevLineBeginOffset = this.lineBeginOffset;
    this.lineBeginOffset = this.getOffset(index);
    this.lineNumber++;
  }

  private cStringsEqual(index1: number, marker: Uint8Array, length: number): boolean {
    for (let i = 0; i < length; i++) {
      if (this.input[index1 + i] !== marker[i]) return false;
    }
    return true;
  }

  /** C#: EndOfLine. Relies on a '\n' sentinel written at/after `inend`. */
  private endOfLine(inptr: number): number {
    while (this.input[inptr] !== 0x0a) inptr++;
    return inptr;
  }

  /** C#: IsMboxMarker(byte*). Reads from `this.input`. */
  private isMboxMarkerAt(index: number, allowMunged = false): boolean {
    let i = index;
    if (allowMunged && this.input[i] === 0x3e /* '>' */) i++;
    return (
      this.input[i++] === 0x46 && // F
      this.input[i++] === 0x72 && // r
      this.input[i++] === 0x6f && // o
      this.input[i++] === 0x6d && // m
      this.input[i] === 0x20 // ' '
    );
  }

  /** C#: IsMboxMarker(byte[]). Reads from an arbitrary buffer. */
  private static isMboxMarkerBuf(buf: Uint8Array, allowMunged = false): boolean {
    let i = 0;
    if (allowMunged && buf[i] === 0x3e) i++;
    return buf[i++] === 0x46 && buf[i++] === 0x72 && buf[i++] === 0x6f && buf[i++] === 0x6d && buf[i] === 0x20;
  }

  private stepByteOrderMarkChunk(bom: { index: number }): boolean {
    let inptr = this.inputIndex;
    const inend = this.inputEnd;

    while (inptr < inend && bom.index < UTF8ByteOrderMark.length && this.input[inptr] === UTF8ByteOrderMark[bom.index]) {
      bom.index++;
      inptr++;
    }

    this.inputIndex = inptr;

    return bom.index === 0 || bom.index === UTF8ByteOrderMark.length;
  }

  private stepByteOrderMark(): boolean {
    const bom = { index: 0 };
    let complete: boolean;

    do {
      const available = this.readAhead(ReadAheadSize, 0);

      if (available <= 0) {
        // failed to read any data... EOF
        this.inputIndex = this.inputEnd;
        return false;
      }

      complete = this.stepByteOrderMarkChunk(bom);
    } while (!complete && this.inputIndex === this.inputEnd);

    return complete;
  }

  private stepMboxMarkerStart(midline: { value: boolean }): boolean {
    let inptr = this.inputIndex;
    const inend = this.inputEnd;

    this.input[inend] = 0x0a;

    if (midline.value) {
      // we're in the middle of a line, so we need to scan for the end of the line
      inptr = this.endOfLine(inptr);

      if (inptr === inend) {
        // we don't have enough input data
        this.inputIndex = this.inputEnd;
        return false;
      }

      // consume the '\n'
      inptr++;
      this.inputIndex = inptr;
      this.incrementLineNumber(this.inputIndex);
      midline.value = false;
    }

    while (inptr + 5 <= inend) {
      if (this.isMboxMarkerAt(inptr)) {
        // we have found the start of the mbox marker
        return true;
      }

      // scan for the end of the line
      inptr = this.endOfLine(inptr);

      if (inptr === inend) {
        // we don't have enough data to check for a From line
        midline.value = true;
        break;
      }

      // consume the '\n'
      inptr++;
      this.inputIndex = inptr;
      this.incrementLineNumber(this.inputIndex);
    }

    this.inputIndex = inptr;

    return false;
  }

  private stepMboxMarkerChunk(): { complete: boolean; count: number } {
    let inptr = this.inputIndex;
    const inend = this.inputEnd;
    const start = inptr;

    this.input[inend] = 0x0a;

    // scan for the end of the line
    inptr = this.endOfLine(inptr);

    let count = inptr - start;

    // make sure not to consume the '\r' if it exists
    if (inptr > start && this.input[inptr - 1] === 0x0d) count--;

    if (inptr === inend) {
      // we've only consumed a partial mbox marker
      this.inputIndex += count;
      return { complete: false, count };
    }

    // consume the '\n'
    inptr++;

    const lineLength = inptr - start;

    this.inputIndex += lineLength;
    this.incrementLineNumber(this.inputIndex);

    return { complete: true, count };
  }

  private stepMboxMarker(): void {
    const midline = { value: false };
    let complete: boolean;

    // consume data until we find a line that begins with "From "
    do {
      const available = this.readAhead(5, 0);

      if (available < 5) {
        // failed to find the beginning of the mbox marker; EOF reached
        this.state = MimeParserState.Error;
        this.inputIndex = this.inputEnd;
        return;
      }

      complete = this.stepMboxMarkerStart(midline);
    } while (!complete);

    const mboxMarkerOffset = this.getOffset(this.inputIndex);
    const mboxMarkerLineNumber = this.lineNumber;

    this.onMboxMarkerBegin(mboxMarkerOffset, mboxMarkerLineNumber);

    do {
      if (this.readAhead(ReadAheadSize, 0) < 1) {
        // failed to find the end of the mbox marker; EOF reached
        this.state = MimeParserState.Error;
        return;
      }

      const startIndex = this.inputIndex;
      const { complete: done, count } = this.stepMboxMarkerChunk();
      complete = done;

      this.onMboxMarkerRead(this.input, startIndex, count, mboxMarkerOffset, mboxMarkerLineNumber);
    } while (!complete);

    this.onMboxMarkerEnd(mboxMarkerOffset, mboxMarkerLineNumber, this.getOffset(this.inputIndex));

    this.state = MimeParserState.MessageHeaders;
  }

  private updateHeaderState(header: Header): void {
    const rawValue = header.rawValue;
    const cursor = { index: 0 };

    switch (header.id) {
      case HeaderId.ContentTransferEncoding:
        if (this.currentEncoding === null) {
          const enc = tryParseContentEncoding(header.value);
          this.currentEncoding = enc.ok ? enc.value : 'default';
        }
        break;
      case HeaderId.ContentLength:
        if (this.currentContentLength === null) {
          if (skipWhiteSpace(rawValue, cursor, rawValue.length)) {
            const parsed = tryParseInt32(rawValue, cursor, rawValue.length);
            if (parsed.ok) this.currentContentLength = parsed.value;
          }
        }
        break;
      case HeaderId.ContentType:
        if (this.currentContentType === null) {
          const partial: { contentType: ContentType | null } = { contentType: null };
          const result = ContentType.tryParse(this.options, rawValue, cursor, rawValue.length, partial);
          let type = result.ok ? result.value : partial.contentType;

          if (!result.ok && type === null) {
            // if 'type' is null, then even the mime-type was unintelligible
            type = new ContentType('application', 'octet-stream');

            // attempt to recover any parameters...
            while (cursor.index < rawValue.length && rawValue[cursor.index] !== 0x3b /* ';' */) cursor.index++;

            if (++cursor.index < rawValue.length) {
              const parameters = ParameterList.tryParse(this.options, rawValue, cursor, rawValue.length);
              if (parameters.ok) type.parameters = parameters.value;
            }
          }

          this.currentContentType = type;
        }
        break;
    }
  }

  private ensureHeaderBufferSize(size: number): void {
    if (size >= this.headerBuffer.length) {
      const grown = new Uint8Array(MimeReader.nextAllocSize(size));
      grown.set(this.headerBuffer);
      this.headerBuffer = grown;
    }
  }

  /** C#: TryDetectInvalidHeader. */
  private tryDetectInvalidHeader(): { found: boolean; invalid: boolean; fieldNameLength: number; headerFieldLength: number } {
    let inptr = this.inputIndex;
    const inend = this.inputEnd;
    const start = inptr;
    let blanks = false;

    this.input[inend] = 0x3a; // ':'

    let fieldNameLength = 0;

    while (this.input[inptr] !== 0x3a) {
      // Blank spaces are allowed between the field name and the ':', but field names themselves are not allowed to contain spaces.
      if (isBlank(this.input[inptr]!)) {
        if (fieldNameLength === 0) fieldNameLength = inptr - start;
        blanks = true;
      } else if (blanks || isCtrl(this.input[inptr]!)) {
        return { found: true, invalid: true, fieldNameLength, headerFieldLength: inptr - start };
      }

      inptr++;
    }

    const headerFieldLength = inptr - start;

    if (fieldNameLength === 0) fieldNameLength = headerFieldLength;

    return { found: inptr < inend, invalid: false, fieldNameLength, headerFieldLength };
  }

  private stepHeaderField(headerFieldLength: number): void {
    this.headerIndex = headerFieldLength + 1;

    this.ensureHeaderBufferSize(this.headerIndex);
    this.headerBuffer.set(this.input.subarray(this.inputIndex, this.inputIndex + this.headerIndex), 0);

    // Save input buffer state.
    this.inputIndex += this.headerIndex;
  }

  private stepHeaderValue(midline: { value: boolean }): boolean {
    let inptr = this.inputIndex;
    const inend = this.inputEnd;

    this.input[inend] = 0x0a;

    while (inptr < inend && (midline.value || isBlank(this.input[inptr]!))) {
      inptr = this.endOfLine(inptr);

      if (inptr === inend) {
        // We've reached the end of the input buffer, and we are currently in the middle of a line.
        midline.value = true;
        break;
      }

      // Consume the newline and update our line number state.
      inptr++;

      this.incrementLineNumber(inptr);
      midline.value = false;
    }

    // Calculate the new inputIndex and the amount of input we've read.
    const index = inptr;
    const nread = index - this.inputIndex;

    // Blit the input data that we've processed into the headerBuffer.
    this.ensureHeaderBufferSize(this.headerIndex + nread);
    this.headerBuffer.set(this.input.subarray(this.inputIndex, this.inputIndex + nread), this.headerIndex);
    this.headerIndex += nread;
    this.inputIndex = index;

    // If inptr == inend, then our caller will re-fill the input buffer and call us again.
    return inptr < inend;
  }

  private isEndOfHeaderBlock(left: number): boolean {
    if (this.input[this.inputIndex] === 0x0a) {
      this.state = MimeParserState.Content;
      this.inputIndex++;
      this.incrementLineNumber(this.inputIndex);
      return true;
    }

    if (this.input[this.inputIndex] === 0x0d && (left === 1 || this.input[this.inputIndex + 1] === 0x0a)) {
      this.state = MimeParserState.Content;
      if (left > 1) this.inputIndex += 2;
      else this.inputIndex++;
      this.incrementLineNumber(this.inputIndex);
      return true;
    }

    return false;
  }

  private tryCheckBoundaryWithinHeaderBlock(): boolean {
    let inptr = this.inputIndex;
    const inend = this.inputEnd;
    const start = inptr;

    this.input[inend] = 0x0a;

    inptr = this.endOfLine(inptr);

    if (inptr === inend) return false;

    const length = inptr - start;

    if ((this.boundaryType = this.checkBoundary(this.inputIndex, start, length)) !== BoundaryType.None) this.state = MimeParserState.Boundary;

    return true;
  }

  private tryCheckMboxMarkerWithinHeaderBlock(): boolean {
    const inptr = this.inputIndex;
    const need = this.input[inptr] === 0x3e /* '>' */ ? 6 : 5;

    if (this.inputEnd - this.inputIndex < need) return false;

    const curOffset = this.contentEnd > 0 ? this.getOffset(this.inputIndex) : this.contentEnd;

    if (this.format === 'mbox' && curOffset >= this.contentEnd && this.isMboxMarkerAt(inptr)) {
      this.state = MimeParserState.Complete;
      return true;
    }

    if (this.headerCount === 0) {
      if (this.state === MimeParserState.MessageHeaders) {
        // Ignore (munged) From-lines that might appear at the start of a message.
        if (this.toplevel && !this.isMboxMarkerAt(inptr, true)) {
          // This line was not a (munged) mbox From-line.
          this.state = MimeParserState.Error;
          return true;
        }
      } else if (this.toplevel && this.state === MimeParserState.Headers) {
        this.state = MimeParserState.Error;
        return true;
      }
    }

    // At this point, it may still be what looks like a From-line, but we'll treat it as an invalid header.

    return true;
  }

  private createHeader(beginOffset: number, fieldNameLength: number, headerFieldLength: number, invalid: boolean): Header {
    let field: Uint8Array;
    let value: Uint8Array;
    let nameLength: number;

    if (invalid) {
      field = this.headerBuffer.slice(0, this.headerIndex);
      nameLength = this.headerIndex;
      value = new Uint8Array(0);
    } else {
      field = this.headerBuffer.slice(0, headerFieldLength);
      nameLength = fieldNameLength;
      value = this.headerBuffer.slice(headerFieldLength + 1, this.headerIndex);
    }

    const fieldName = latin1String(field, 0, nameLength);
    const header = Header.fromRaw(this.options, toHeaderId(fieldName), fieldName, value, invalid, field);
    header.offset = beginOffset;

    this.updateHeaderState(header);
    this.headerCount++;

    return header;
  }

  private stepHeaders(): void {
    const headersBeginLineNumber = this.lineNumber;
    let eof = false;

    this.headerBlockBegin = this.getOffset(this.inputIndex);
    this.boundaryType = BoundaryType.None;
    this.currentBoundary = null;
    this.headerCount = 0;

    this.currentContentLength = null;
    this.currentContentType = null;
    this.currentEncoding = null;

    this.onHeadersBegin(this.headerBlockBegin, headersBeginLineNumber);

    this.readAhead(ReadAheadSize, 0);

    do {
      const beginOffset = this.getOffset(this.inputIndex);
      const beginLineNumber = this.lineNumber;
      let left = this.inputEnd - this.inputIndex;
      let detected: { found: boolean; invalid: boolean; fieldNameLength: number; headerFieldLength: number };

      this.headerIndex = 0;

      if (left < 2) left = this.readAhead(2, 0);

      if (left === 0) {
        // The only way to get here is if this is the first-pass through this loop and we're at EOF.
        if (this.toplevel && this.headerCount === 0) {
          this.state = MimeParserState.Eos;
          return;
        }

        // This can happen if a message is truncated immediately after a boundary marker.
        this.state = MimeParserState.Content;
        break;
      }

      // Check for an empty line denoting the end of the header block.
      if (this.isEndOfHeaderBlock(left)) {
        this.onBodySeparator(beginOffset, beginLineNumber, this.getOffset(this.inputIndex));
        this.state = MimeParserState.Content;
        break;
      }

      // Scan ahead a bit to see if this looks like an invalid header.
      while (!(detected = this.tryDetectInvalidHeader()).found) {
        const atleast = this.inputEnd - this.inputIndex + 1;

        if (this.readAhead(atleast, 0) < atleast) {
          // Not enough input to even find the ':'... mark as invalid and continue?
          detected.invalid = true;
          break;
        }
      }

      let invalid = detected.invalid;
      const fieldNameLength = detected.fieldNameLength;
      const headerFieldLength = detected.headerFieldLength;

      if (invalid) {
        // Figure out why this is an invalid header.

        if (this.input[this.inputIndex] === 0x2d /* '-' */) {
          // Check for a boundary marker. If the message is properly formatted, this will NEVER happen.
          while (!this.tryCheckBoundaryWithinHeaderBlock()) {
            const atleast = this.inputEnd - this.inputIndex + 1;

            if (this.readAhead(atleast, 0) < atleast) break;
          }

          // If a boundary was discovered, then the state will be updated to Boundary.
          if (this.state === MimeParserState.Boundary) break;

          // Fall through and act as if we're consuming a header.
        } else if (this.input[this.inputIndex] === 0x46 /* 'F' */ || this.input[this.inputIndex] === 0x3e /* '>' */) {
          // Check for an mbox-style From-line.
          while (!this.tryCheckMboxMarkerWithinHeaderBlock()) {
            const atleast = this.inputEnd - this.inputIndex + 1;

            if (this.readAhead(atleast, 0) < atleast) break;
          }

          // state will be one of: Complete (real mbox marker), Error (invalid first header,
          // not a valid mbox marker), or MessageHeaders/Headers (treat as invalid header).
          if (this.state !== MimeParserState.MessageHeaders && this.state !== MimeParserState.Headers) break;

          // Fall through and act as if we're consuming a header.
        } else {
          // Fall through and act as if we're consuming a header.
        }

        if (this.toplevel && this.eos && this.inputIndex + headerFieldLength >= this.inputEnd) {
          this.state = MimeParserState.Error;
          return;
        }

        // Fall through and act as if we're consuming a header.
      } else {
        // Consume the header field name.
        this.stepHeaderField(headerFieldLength);
      }

      const midline = { value: true };

      // Consume the header value.
      while (!this.stepHeaderValue(midline)) {
        if (this.readAhead(1, 0) === 0) {
          this.state = MimeParserState.Content;
          eof = true;
          break;
        }
      }

      if (this.toplevel && this.headerCount === 0 && invalid && !MimeReader.isMboxMarkerBuf(this.headerBuffer)) {
        this.state = MimeParserState.Error;
        return;
      }

      const header = this.createHeader(beginOffset, fieldNameLength, headerFieldLength, invalid);

      this.onHeaderRead(header, beginLineNumber);
    } while (!eof);

    this.headerBlockEnd = this.getOffset(this.inputIndex);

    this.onHeadersEnd(this.headerBlockBegin, headersBeginLineNumber, this.headerBlockEnd, this.lineNumber);
  }

  private skipBoundaryMarkerInternal(endBoundary: boolean): boolean {
    // Don't consume the newline sequence for end boundaries (those are part of the epilogue).
    const consumeNewLine = !endBoundary;
    let inptr = this.inputIndex;
    const inend = this.inputEnd;

    this.input[inend] = 0x0a;

    // skip over the boundary marker
    if (endBoundary) inptr += this.currentBoundary!.finalLength;
    else inptr += this.currentBoundary!.length;

    // skip over any trailing whitespace
    inptr = this.endOfLine(inptr);

    if (inptr < inend) {
      this.inputIndex = inptr;

      if (consumeNewLine) {
        this.inputIndex++;
        this.incrementLineNumber(this.inputIndex);
      } else if (this.input[inptr - 1] === 0x0d) {
        this.inputIndex--;
      }

      return true;
    }

    this.inputIndex = this.inputEnd;

    return false;
  }

  private skipBoundaryMarker(_boundary: string | null, endBoundary: boolean): boolean {
    const beginOffset = this.getOffset(this.inputIndex);
    const beginLineNumber = this.lineNumber;
    const startIndex = this.inputIndex;

    if (endBoundary) this.onMultipartEndBoundaryBegin(beginOffset, beginLineNumber);
    else this.onMultipartBoundaryBegin(beginOffset, beginLineNumber);

    // skip over the boundary marker
    const result = this.skipBoundaryMarkerInternal(endBoundary);
    const count = this.inputIndex - startIndex;

    if (endBoundary) this.onMultipartEndBoundaryRead(this.input, startIndex, count, beginOffset, beginLineNumber);
    else this.onMultipartBoundaryRead(this.input, startIndex, count, beginOffset, beginLineNumber);

    const endOffset = this.getOffset(this.inputIndex);

    if (endBoundary) this.onMultipartEndBoundaryEnd(beginOffset, beginLineNumber, endOffset);
    else this.onMultipartBoundaryEnd(beginOffset, beginLineNumber, endOffset);

    return result;
  }

  private step(): MimeParserState {
    switch (this.state) {
      case MimeParserState.Initialized:
        if (!this.stepByteOrderMark()) {
          this.state = MimeParserState.Eos;
          break;
        }

        this.state = this.format === 'mbox' ? MimeParserState.MboxMarker : MimeParserState.MessageHeaders;
        break;
      case MimeParserState.MboxMarker:
        this.stepMboxMarker();
        break;
      case MimeParserState.MessageHeaders:
      case MimeParserState.Headers:
        this.stepHeaders();
        this.toplevel = false;
        break;
    }

    return this.state;
  }

  private getContentType(parent: ContentType | null): ContentType {
    if (this.currentContentType !== null) return this.currentContentType;

    if (parent === null || !parent.isMimeType('multipart', 'digest')) return new ContentType('text', 'plain');

    return new ContentType('message', 'rfc822');
  }

  private isPossibleBoundary(text: number, length: number): boolean {
    if (length < 2) return false;

    if (this.input[text] === 0x2d && this.input[text + 1] === 0x2d) return true;

    if (this.format === 'mbox' && length >= 5 && this.isMboxMarkerAt(text)) return true;

    return false;
  }

  private isBoundary(text: number, length: number, boundary: Boundary): { match: boolean; final: boolean } {
    let final = false;

    if (boundary.isMboxMarker) {
      // for mbox markers, we only care about the first 5 characters
      if (length < boundary.length) return { match: false, final };

      length = boundary.length;
    } else {
      // if the length isn't exactly equal to either the normal or final boundary lengths, no match
      if (boundary.length !== length && boundary.finalLength !== length) return { match: false, final };
    }

    // make sure that the text matches the boundary
    if (!this.cStringsEqual(text, boundary.marker, length)) return { match: false, final };

    final = length === boundary.finalLength;

    return { match: true, final };
  }

  private checkBoundary(startIndex: number, start: number, length: number): BoundaryType {
    if (!this.isPossibleBoundary(start, length)) return BoundaryType.None;

    if (this.boundaries !== null) {
      let end = start + length;

      // ignore trailing whitespace characters
      if (this.input[end - 1] === 0x0d) end--;

      while (end > start && isWhitespace(this.input[end - 1]!)) end--;

      const matchLength = end - start;

      this.currentBoundary = this.boundaries;

      if (!this.currentBoundary.isMboxMarker) {
        // check immediate boundary
        let r = this.isBoundary(start, matchLength, this.currentBoundary);
        if (r.match) return r.final ? BoundaryType.ImmediateEndBoundary : BoundaryType.ImmediateBoundary;

        this.currentBoundary = this.currentBoundary.next;

        // check parent boundaries
        while (this.currentBoundary !== null && !this.currentBoundary.isMboxMarker) {
          r = this.isBoundary(start, matchLength, this.currentBoundary);
          if (r.match) return r.final ? BoundaryType.ParentEndBoundary : BoundaryType.ParentBoundary;

          this.currentBoundary = this.currentBoundary.next;
        }
      }

      if (this.currentBoundary !== null) {
        // now it is time to check the mbox From-marker
        const curOffset = this.contentEnd > 0 ? this.getOffset(startIndex) : this.contentEnd;

        const r = this.isBoundary(start, matchLength, this.currentBoundary);
        if (curOffset >= this.contentEnd && r.match) return BoundaryType.ParentEndBoundary;
      }
    }

    return BoundaryType.None;
  }

  private isPartialBoundary(startIndex: number, start: number, length: number): boolean {
    if (this.boundaries !== null) {
      const boundary = this.boundaries;

      if (!boundary.isMboxMarker && this.input[start] === 0x2d /* '-' */) {
        return length < 2 || this.input[start + 1] === 0x2d;
      }

      if (this.format === 'mbox' && this.input[start] === MboxFrom[0]) {
        // now it is time to check the mbox From-marker
        const curOffset = this.contentEnd > 0 ? this.getOffset(startIndex) : this.contentEnd;
        const n = Math.min(length, MboxFrom.length);

        if (curOffset >= this.contentEnd) {
          let eq = true;
          for (let i = 0; i < n; i++) {
            if (this.input[startIndex + i] !== MboxFrom[i]) {
              eq = false;
              break;
            }
          }
          if (eq) return true;
        }
      }
    }

    return false;
  }

  private getMaxBoundaryLength(): number {
    return this.boundaries !== null ? this.boundaries.maxLength + 2 : 0;
  }

  private static isMultipart(contentType: ContentType): boolean {
    return contentType.mediaType.toLowerCase() === 'multipart';
  }

  private static readonly MessageMediaSubtypes = ['rfc822', 'news', 'global', 'global-headers', 'external-body', 'rfc2822'];

  private static isMessagePart(contentType: ContentType, encoding: ContentEncoding | null): boolean {
    if (encoding !== null && isEncoded(encoding)) return false;

    if (contentType.mediaType.toLowerCase() === 'message') {
      const subtype = contentType.mediaSubtype.toLowerCase();
      for (const s of MimeReader.MessageMediaSubtypes) {
        if (subtype === s) return true;
      }
    }

    return contentType.isMimeType('text', 'rfc822-headers');
  }

  /** C#: ScanContent(byte*, ref midline, ref formats). */
  private scanContentChunk(midline: { value: boolean }, formats: boolean[]): boolean {
    let inptr = this.inputIndex;
    const inend = this.inputEnd;
    let startIndex = this.inputIndex;
    let incomplete = false;

    this.input[inend] = 0x0a;

    while (inptr < inend) {
      const start = inptr;
      let length: number;

      inptr = this.endOfLine(inptr);
      length = inptr - start;

      if (inptr < inend) {
        if (!midline.value && (this.boundaryType = this.checkBoundary(startIndex, start, length)) !== BoundaryType.None) break;

        if (length > 0 && this.input[inptr - 1] === 0x0d) formats[NLF_DOS] = true;
        else formats[NLF_UNIX] = true;

        midline.value = false;
        length++;
        inptr++;

        this.incrementLineNumber(inptr);
      } else {
        // didn't find the end of the line...
        if (this.eos) {
          // Only consume this (incomplete) line of data if it *doesn't* match a boundary marker.
          if (!midline.value && (this.boundaryType = this.checkBoundary(startIndex, start, length)) !== BoundaryType.None) break;

          incomplete = false;
          midline.value = false;
        } else if (length >= SmtpMaxLineLength) {
          midline.value = true;
        } else if (!midline.value && this.isPartialBoundary(startIndex, start, length)) {
          // We have an incomplete line that looks like a partial boundary marker. Refill and retry.
          incomplete = true;
          break;
        } else {
          // It is not possible for this line to be a boundary marker. Consume the (incomplete) line data.
          midline.value = true;
        }

        startIndex += length;
        break;
      }

      startIndex += length;
    }

    this.inputIndex = startIndex;

    return incomplete;
  }

  private scanContent(type: ScanContentType, beginOffset: number, beginLineNumber: number, trimNewLine: boolean): ScanContentResult {
    const maxBoundaryLength = Math.max(ReadAheadSize, this.getMaxBoundaryLength());
    const formats = [false, false];
    let contentLength = 0;
    let incomplete = false;
    const midline = { value: false };

    do {
      const atleast = incomplete ? Math.max(maxBoundaryLength, this.inputEnd - this.inputIndex + 1) : maxBoundaryLength;

      if (this.readAhead(atleast, 2) <= 0) {
        this.boundaryType = BoundaryType.Eos;
        break;
      }

      const contentIndex = this.inputIndex;

      incomplete = this.scanContentChunk(midline, formats);

      if (contentIndex < this.inputIndex) {
        switch (type) {
          case ScanContentType.MultipartPreamble:
            this.onMultipartPreambleRead(this.input, contentIndex, this.inputIndex - contentIndex);
            break;
          case ScanContentType.MultipartEpilogue:
            this.onMultipartEpilogueRead(this.input, contentIndex, this.inputIndex - contentIndex);
            break;
          default:
            this.onMimePartContentRead(this.input, contentIndex, this.inputIndex - contentIndex);
            break;
        }

        contentLength += this.inputIndex - contentIndex;
      }
    } while (this.boundaryType === BoundaryType.None);

    const isEmpty = contentLength === 0;

    if (this.boundaryType !== BoundaryType.Eos && trimNewLine) {
      // the last \r\n belongs to the boundary
      if (contentLength > 0) {
        if (this.input[this.inputIndex - 2] === 0x0d) contentLength -= 2;
        else contentLength--;
      }
    }

    const endOffset = beginOffset + contentLength;
    const lines = this.getLineCount(beginLineNumber, beginOffset, endOffset);

    return new ScanContentResult(contentLength, lines, formats, isEmpty);
  }

  private constructMimePart(): number {
    const beginOffset = this.getOffset(this.inputIndex);
    const beginLineNumber = this.lineNumber;

    this.onMimePartContentBegin(beginOffset, beginLineNumber);
    const result = this.scanContent(ScanContentType.MimeContent, beginOffset, beginLineNumber, true);
    this.onMimePartContentEnd(beginOffset, beginLineNumber, beginOffset + result.contentLength, result.lines, result.format);

    return result.lines;
  }

  private constructMessagePart(depth: number): number {
    const beginOffset = this.getOffset(this.inputIndex);
    const beginLineNumber = this.lineNumber;

    if (this.boundaries !== null) {
      const atleast = Math.max(ReadAheadSize, this.getMaxBoundaryLength());

      if (this.readAhead(atleast, 0) <= 0) {
        this.boundaryType = BoundaryType.Eos;
        return 0;
      }

      const start = this.inputIndex;
      const inend = this.inputEnd;

      this.input[inend] = 0x0a;

      const inptr = this.endOfLine(start);

      // Note: if the "boundary" found is an Mbox "From " line, then either the current
      // stream offset is >= contentEnd -or- RespectContentLength is false.
      if ((this.boundaryType = this.checkBoundary(this.inputIndex, start, inptr - start)) !== BoundaryType.None)
        return this.getLineCount(beginLineNumber, beginOffset, this.getEndOffset(this.inputIndex));
    }

    // Note: When parsing non-toplevel parts, the header parser will never result in the Error state.
    this.state = MimeParserState.MessageHeaders;
    this.step();

    let currentHeadersEndOffset = this.headerBlockEnd;
    const currentBeginOffset = this.headerBlockBegin;

    this.onMimeMessageBegin(currentBeginOffset, beginLineNumber);

    const type = this.getContentType(null);
    let entityType: MimeEntityType;
    let lines: number;

    if (depth + 1 < this.options.maxMimeDepth && MimeReader.isMultipart(type)) {
      this.onMultipartBegin(type, currentBeginOffset, beginLineNumber);
      lines = this.constructMultipart(type, depth + 1);
      entityType = MimeEntityType.Multipart;
    } else if (depth + 1 < this.options.maxMimeDepth && MimeReader.isMessagePart(type, this.currentEncoding)) {
      this.onMessagePartBegin(type, currentBeginOffset, beginLineNumber);
      lines = this.constructMessagePart(depth + 1);
      entityType = MimeEntityType.MessagePart;
    } else {
      this.onMimePartBegin(type, currentBeginOffset, beginLineNumber);
      lines = this.constructMimePart();
      entityType = MimeEntityType.MimePart;
    }

    const endOffset = this.getEndOffset(this.inputIndex);
    currentHeadersEndOffset = Math.min(currentHeadersEndOffset, endOffset);

    switch (entityType) {
      case MimeEntityType.Multipart:
        this.onMultipartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
        break;
      case MimeEntityType.MessagePart:
        this.onMessagePartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
        break;
      default:
        this.onMimePartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
        break;
    }

    this.onMimeMessageEnd(currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);

    return this.getLineCount(beginLineNumber, beginOffset, endOffset);
  }

  private multipartScanPreamble(): void {
    const beginOffset = this.getOffset(this.inputIndex);
    const beginLineNumber = this.lineNumber;

    this.onMultipartPreambleBegin(beginOffset, beginLineNumber);
    const result = this.scanContent(ScanContentType.MultipartPreamble, beginOffset, beginLineNumber, false);
    this.onMultipartPreambleEnd(beginOffset, beginLineNumber, beginOffset + result.contentLength, result.lines);
  }

  private multipartScanEpilogue(): void {
    const beginOffset = this.getOffset(this.inputIndex);
    const beginLineNumber = this.lineNumber;

    this.onMultipartEpilogueBegin(beginOffset, beginLineNumber);
    const result = this.scanContent(ScanContentType.MultipartEpilogue, beginOffset, beginLineNumber, true);
    this.onMultipartEpilogueEnd(beginOffset, beginLineNumber, beginOffset + result.contentLength, result.lines);
  }

  private multipartScanSubparts(multipartContentType: ContentType, depth: number): void {
    do {
      // skip over the boundary marker
      if (!this.skipBoundaryMarker(multipartContentType.boundary, false)) {
        this.boundaryType = BoundaryType.Eos;
        return;
      }

      const beginLineNumber = this.lineNumber;

      // Note: When parsing non-toplevel parts, the header parser will never result in the Error state.
      this.state = MimeParserState.Headers;
      this.step();

      const type = this.getContentType(multipartContentType);
      let currentHeadersEndOffset = this.headerBlockEnd;
      const currentBeginOffset = this.headerBlockBegin;
      let entityType: MimeEntityType;
      let lines: number;

      if (depth + 1 < this.options.maxMimeDepth && MimeReader.isMultipart(type)) {
        this.onMultipartBegin(type, currentBeginOffset, beginLineNumber);
        lines = this.constructMultipart(type, depth + 1);
        entityType = MimeEntityType.Multipart;
      } else if (depth + 1 < this.options.maxMimeDepth && MimeReader.isMessagePart(type, this.currentEncoding)) {
        this.onMessagePartBegin(type, currentBeginOffset, beginLineNumber);
        lines = this.constructMessagePart(depth + 1);
        entityType = MimeEntityType.MessagePart;
      } else {
        this.onMimePartBegin(type, currentBeginOffset, beginLineNumber);
        lines = this.constructMimePart();
        entityType = MimeEntityType.MimePart;
      }

      const endOffset = this.getEndOffset(this.inputIndex);
      currentHeadersEndOffset = Math.min(currentHeadersEndOffset, endOffset);

      switch (entityType) {
        case MimeEntityType.Multipart:
          this.onMultipartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
          break;
        case MimeEntityType.MessagePart:
          this.onMessagePartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
          break;
        default:
          this.onMimePartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
          break;
      }
    } while (this.boundaryType === BoundaryType.ImmediateBoundary);
  }

  private pushBoundary(boundary: string): void {
    this.boundaries = Boundary.create(boundary, this.boundaries);
  }

  private popBoundary(): void {
    this.boundaries = this.boundaries!.next;

    switch (this.boundaryType) {
      case BoundaryType.ParentEndBoundary:
        if (this.currentBoundary === this.boundaries) this.boundaryType = BoundaryType.ImmediateEndBoundary;
        break;
      case BoundaryType.ParentBoundary:
        if (this.currentBoundary === this.boundaries) this.boundaryType = BoundaryType.ImmediateBoundary;
        break;
      case BoundaryType.ImmediateEndBoundary:
      case BoundaryType.ImmediateBoundary:
        this.boundaryType = BoundaryType.None;
        this.currentBoundary = null;
        break;
    }
  }

  private constructMultipart(contentType: ContentType, depth: number): number {
    const beginOffset = this.getOffset(this.inputIndex);
    const marker = contentType.boundary;
    const beginLineNumber = this.lineNumber;
    let endOffset: number;

    if (marker === null) {
      // Note: this will scan all content into the preamble...
      this.multipartScanPreamble();

      endOffset = this.getEndOffset(this.inputIndex);

      return this.getLineCount(beginLineNumber, beginOffset, endOffset);
    }

    this.pushBoundary(marker);

    this.multipartScanPreamble();
    if (this.boundaryType === BoundaryType.ImmediateBoundary) this.multipartScanSubparts(contentType, depth);

    if (this.boundaryType === BoundaryType.ImmediateEndBoundary) {
      // consume the end boundary and read the epilogue (if there is one)
      this.skipBoundaryMarker(marker, true);

      this.popBoundary();

      this.multipartScanEpilogue();

      endOffset = this.getEndOffset(this.inputIndex);

      return this.getLineCount(beginLineNumber, beginOffset, endOffset);
    }

    // We either found the end of the stream or we found a parent's boundary
    this.popBoundary();

    endOffset = this.getEndOffset(this.inputIndex);

    return this.getLineCount(beginLineNumber, beginOffset, endOffset);
  }

  /** C#: ReadHeaders. */
  readHeaders(): void {
    this.state = MimeParserState.Headers;
    this.toplevel = true;

    if (this.step() === MimeParserState.Error) throw new FormatError('Failed to parse headers.');

    this.state = this.eos && this.inputIndex === this.inputEnd ? MimeParserState.Eos : MimeParserState.Complete;
  }

  /** C#: ReadEntity. */
  readEntity(): void {
    const beginLineNumber = this.lineNumber;

    this.state = MimeParserState.Headers;
    this.toplevel = true;

    // parse the headers
    switch (this.step()) {
      case MimeParserState.Error:
        throw new FormatError('Failed to parse entity headers.');
      case MimeParserState.Eos:
        throw new FormatError('End of stream.');
    }

    const type = this.getContentType(null);
    let currentHeadersEndOffset = this.headerBlockEnd;
    const currentBeginOffset = this.headerBlockBegin;
    let entityType: MimeEntityType;
    let lines: number;

    if (MimeReader.isMultipart(type)) {
      this.onMultipartBegin(type, currentBeginOffset, beginLineNumber);
      lines = this.constructMultipart(type, 0);
      entityType = MimeEntityType.Multipart;
    } else if (MimeReader.isMessagePart(type, this.currentEncoding)) {
      this.onMessagePartBegin(type, currentBeginOffset, beginLineNumber);
      lines = this.constructMessagePart(0);
      entityType = MimeEntityType.MessagePart;
    } else {
      this.onMimePartBegin(type, currentBeginOffset, beginLineNumber);
      lines = this.constructMimePart();
      entityType = MimeEntityType.MimePart;
    }

    const endOffset = this.getEndOffset(this.inputIndex);
    currentHeadersEndOffset = Math.min(currentHeadersEndOffset, endOffset);

    switch (entityType) {
      case MimeEntityType.Multipart:
        this.onMultipartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
        break;
      case MimeEntityType.MessagePart:
        this.onMessagePartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
        break;
      default:
        this.onMimePartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
        break;
    }

    this.state = MimeParserState.Eos;
  }

  /** C#: ReadMessage. */
  readMessage(): void {
    // scan the from-line if we are parsing an mbox
    while (this.state !== MimeParserState.MessageHeaders) {
      switch (this.step()) {
        case MimeParserState.Error:
          throw new FormatError('Failed to find mbox From marker.');
        case MimeParserState.Eos:
          throw new FormatError('End of stream.');
      }
    }

    const beginLineNumber = this.lineNumber;
    this.toplevel = true;

    // parse the headers
    switch (this.step()) {
      case MimeParserState.Error:
        throw new FormatError('Failed to parse message headers.');
      case MimeParserState.Eos:
        throw new FormatError('End of stream.');
    }

    let currentHeadersEndOffset = this.headerBlockEnd;
    const currentBeginOffset = this.headerBlockBegin;

    this.onMimeMessageBegin(currentBeginOffset, beginLineNumber);

    if (this.format === 'mbox' && this.options.respectContentLength && this.currentContentLength !== null)
      this.contentEnd = this.getOffset(this.inputIndex) + this.currentContentLength;
    else this.contentEnd = 0;

    const type = this.getContentType(null);
    let entityType: MimeEntityType;
    let lines: number;

    if (MimeReader.isMultipart(type)) {
      this.onMultipartBegin(type, currentBeginOffset, beginLineNumber);
      lines = this.constructMultipart(type, 0);
      entityType = MimeEntityType.Multipart;
    } else if (MimeReader.isMessagePart(type, this.currentEncoding)) {
      this.onMessagePartBegin(type, currentBeginOffset, beginLineNumber);
      lines = this.constructMessagePart(0);
      entityType = MimeEntityType.MessagePart;
    } else {
      this.onMimePartBegin(type, currentBeginOffset, beginLineNumber);
      lines = this.constructMimePart();
      entityType = MimeEntityType.MimePart;
    }

    const endOffset = this.getEndOffset(this.inputIndex);
    currentHeadersEndOffset = Math.min(currentHeadersEndOffset, endOffset);

    switch (entityType) {
      case MimeEntityType.Multipart:
        this.onMultipartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
        break;
      case MimeEntityType.MessagePart:
        this.onMessagePartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
        break;
      default:
        this.onMimePartEnd(type, currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);
        break;
    }

    this.onMimeMessageEnd(currentBeginOffset, beginLineNumber, currentHeadersEndOffset, endOffset, lines);

    if (this.boundaryType !== BoundaryType.Eos) {
      if (this.format === 'mbox') this.state = MimeParserState.MboxMarker;
      else this.state = MimeParserState.Complete;
    } else {
      this.state = MimeParserState.Eos;
    }
  }
}

/** C#: ParserOptions.IsEncoded(ContentEncoding). */
function isEncoded(encoding: ContentEncoding): boolean {
  switch (encoding) {
    case '7bit':
    case '8bit':
    case 'binary':
    case 'default':
      return false;
    default:
      return true;
  }
}

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** C#: `(char) field[i]` — latin1 decode of raw header field bytes. */
function latin1String(bytes: Uint8Array, start: number, length: number): string {
  let value = '';
  for (let i = start; i < start + length; i++) value += String.fromCharCode(bytes[i]!);
  return value;
}

/**
 * Internal parse error raised by the Read* machinery (C#: FormatException).
 * The public parser layer wraps these into Result values (wave 5); this is
 * kept faithful to the C# TryStep-style FormatException sites.
 */
export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatError';
  }
}
