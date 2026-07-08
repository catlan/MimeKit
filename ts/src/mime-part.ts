import type { ContentEncoding } from './content-encoding.js';
import type { MimeVisitor } from './mime-visitor.js';
import { ContentDisposition } from './content-disposition.js';
import { ContentType } from './content-type.js';
import { FormatOptions, MAXIMUM_LINE_LENGTH, MINIMUM_LINE_LENGTH } from './format-options.js';
import { Header } from './header.js';
import { HeaderId } from './header-id.js';
import { FilteredStream } from './io/filtered-stream.js';
import { BestEncodingFilter, type EncodingConstraint } from './io/filters/best-encoding-filter.js';
import { EncoderFilter } from './io/filters/encoder-filter.js';
import { Unix2DosFilter } from './io/filters/unix2dos-filter.js';
import { MeasuringStream } from './io/measuring-stream.js';
import { MemoryStream, Stream } from './io/stream.js';
import { MimeContent } from './mime-content.js';
import { MimeEntity, type MimeEntityConstructorArgs } from './mime-entity.js';
import { tryParse as tryParseContentEncoding } from './utils/mime-utils.js';

const DEFAULT_MAX_LINE_LENGTH = 78;
const encoder = new TextEncoder();

export class MimePart extends MimeEntity {
  private encoderMaxLineLength = DEFAULT_MAX_LINE_LENGTH;
  private encodingValue: ContentEncoding = 'default';
  private descriptionValue: string | null = null;
  private md5sumValue: string | null = null;
  private durationValue: number | null = null;
  content: MimeContent | null = null;

  constructor();
  constructor(contentType: ContentType);
  constructor(contentType: string);
  constructor(mediaType: string, mediaSubtype: string, ...args: unknown[]);
  constructor(args: MimeEntityConstructorArgs);
  constructor(a?: string | ContentType | MimeEntityConstructorArgs, b?: string, ...args: unknown[]) {
    if (a === undefined) {
      super('application', 'octet-stream');
      return;
    }
    if (a instanceof ContentType) {
      super(a);
      return;
    }
    if (isConstructorArgs(a)) {
      super(a);
      return;
    }
    if (b === undefined) {
      const parsed = ContentType.parse(a);
      if (!parsed.ok)
        throw new TypeError(parsed.error.message);
      super(parsed.value);
      return;
    }

    super(a, b);
    let content: MimeContent | null = null;
    for (const obj of args) {
      if (obj == null || this.tryInit(obj))
        continue;
      if (obj instanceof MimeContent) {
        if (content !== null)
          throw new TypeError('MimeContent should not be specified more than once.');
        content = obj;
        continue;
      }
      if (obj instanceof Stream) {
        if (content !== null)
          throw new TypeError('Stream (used as content) should not be specified more than once.');
        content = new MimeContent(obj);
        continue;
      }
      throw new TypeError(`Unknown initialization parameter: ${typeof obj}`);
    }
    if (content !== null)
      this.content = content;
  }

  get contentDescription(): string | null {
    this.checkDisposed('MimePart');
    if (!this.lazyLoaded.has('contentDescription')) {
      const header = this.headers.tryGetHeader(HeaderId.ContentDescription);
      if (header !== null)
        this.descriptionValue = header.value.trim();
      this.lazyLoaded.add('contentDescription');
    }
    return this.descriptionValue;
  }

  set contentDescription(value: string | null) {
    this.checkDisposed('MimePart');
    this.descriptionValue = value?.trim() ?? null;
    this.descriptionValue !== null ? this.setHeader('Content-Description', this.descriptionValue) : this.removeHeader('Content-Description');
    this.lazyLoaded.add('contentDescription');
  }

  get contentDuration(): number | null {
    this.checkDisposed('MimePart');
    if (!this.lazyLoaded.has('contentDuration')) {
      const header = this.headers.tryGetHeader(HeaderId.ContentDuration);
      const text = header?.value.trim();
      if (text && /^[+-]?[0-9]+$/.test(text))
        this.durationValue = Number.parseInt(text, 10);
      this.lazyLoaded.add('contentDuration');
    }
    return this.durationValue;
  }

  set contentDuration(value: number | null) {
    this.checkDisposed('MimePart');
    if (value !== null && (!Number.isInteger(value) || value < 0))
      throw new RangeError('value must be non-negative');
    this.durationValue = value;
    value !== null ? this.setHeader('Content-Duration', String(value)) : this.removeHeader('Content-Duration');
    this.lazyLoaded.add('contentDuration');
  }

  get contentMd5(): string | null {
    this.checkDisposed('MimePart');
    if (!this.lazyLoaded.has('contentMd5')) {
      const header = this.headers.tryGetHeader(HeaderId.ContentMd5);
      if (header !== null)
        this.md5sumValue = header.value.trim();
      this.lazyLoaded.add('contentMd5');
    }
    return this.md5sumValue;
  }

  set contentMd5(value: string | null) {
    this.checkDisposed('MimePart');
    this.md5sumValue = value?.trim() ?? null;
    this.md5sumValue !== null ? this.setHeader('Content-Md5', this.md5sumValue) : this.removeHeader('Content-Md5');
    this.lazyLoaded.add('contentMd5');
  }

  get contentTransferEncoding(): ContentEncoding {
    this.checkDisposed('MimePart');
    if (!this.lazyLoaded.has('contentTransferEncoding')) {
      const header = this.headers.tryGetHeader(HeaderId.ContentTransferEncoding);
      if (header !== null) {
        const parsed = tryParseContentEncoding(header.value);
        if (parsed.ok)
          this.encodingValue = parsed.value;
      }
      this.lazyLoaded.add('contentTransferEncoding');
    }
    return this.encodingValue;
  }

  set contentTransferEncoding(value: ContentEncoding) {
    this.checkDisposed('MimePart');
    validateContentEncoding(value);
    this.encodingValue = value;
    value === 'default' ? this.removeHeader('Content-Transfer-Encoding') : this.setHeader('Content-Transfer-Encoding', transferEncodingHeader(value));
    this.lazyLoaded.add('contentTransferEncoding');
  }

  get fileName(): string | null {
    return (this.contentDisposition?.fileName ?? this.contentType.name)?.trim() ?? null;
  }

  set fileName(value: string | null) {
    if (value !== null) {
      this.contentDisposition ??= new ContentDisposition(ContentDisposition.attachment);
      this.contentDisposition.fileName = value;
    } else if (this.contentDisposition !== null) {
      this.contentDisposition.fileName = null;
    }
    this.contentType.name = value;
  }

  getBestEncoding(constraint: EncodingConstraint, maxLineLength = DEFAULT_MAX_LINE_LENGTH): ContentEncoding {
    this.checkDisposed('MimePart');
    if (this.contentType.isMimeType('text', '*') || this.contentType.isMimeType('message', '*')) {
      if (this.content === null)
        return '7bit';
      const measure = new MeasuringStream();
      const filtered = new FilteredStream(measure);
      const filter = new BestEncodingFilter();
      filtered.add(filter);
      this.content.decodeTo(filtered);
      filtered.flush();
      return filter.getBestEncoding(constraint, maxLineLength);
    }
    return constraint === 'none' ? 'binary' : 'base64';
  }

  computeContentMd5(): string {
    this.checkDisposed('MimePart');
    if (this.content === null)
      throw new TypeError('Cannot compute Md5 checksum without a ContentObject.');

    const memory = new MemoryStream();
    const filtered = new FilteredStream(memory);
    if (this.contentType.isMimeType('text', '*'))
      filtered.add(new Unix2DosFilter());
    this.content.open().copyTo(filtered);
    filtered.flush();
    return base64(md5(memory.toArray()));
  }

  verifyContentMd5(): boolean {
    this.checkDisposed('MimePart');
    if (this.md5sumValue == null || this.md5sumValue.trim() === '' || this.content === null)
      return false;
    return this.md5sumValue === this.computeContentMd5();
  }


  override accept(visitor: MimeVisitor): void {
    if (visitor == null)
      throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MimePart');
    visitor.visitMimePart(this);
  }

  override prepare(constraint: EncodingConstraint, maxLineLength = DEFAULT_MAX_LINE_LENGTH): void {
    if (!Number.isInteger(maxLineLength) || maxLineLength < MINIMUM_LINE_LENGTH || maxLineLength > MAXIMUM_LINE_LENGTH)
      throw new RangeError('maxLineLength must be between 60 and 998');
    this.checkDisposed('MimePart');

    switch (this.contentTransferEncoding) {
    case 'quoted-printable':
    case 'uuencode':
    case 'base64':
      return;
    case 'binary':
      if (constraint === 'none')
        return;
      break;
    }

    const best = this.getBestEncoding(constraint, maxLineLength);
    if (this.contentTransferEncoding === 'default' && best === '7bit')
      return;

    this.encoderMaxLineLength = maxLineLength;
    this.contentTransferEncoding = best;
  }

  override writeTo(stream: Stream): void;
  override writeTo(options: FormatOptions, stream: Stream): void;
  override writeTo(options: FormatOptions, stream: Stream, contentOnly: boolean): void;
  override writeTo(a: FormatOptions | Stream, b?: Stream, contentOnly = false): void {
    const options = a instanceof FormatOptions ? a : FormatOptions.default;
    const stream = a instanceof FormatOptions ? b : a;
    super.writeTo(options, stream!, contentOnly);

    if (this.content === null)
      return;

    const transferEncoding = this.contentTransferEncoding;
    if (this.content.encoding !== transferEncoding) {
      if (transferEncoding === 'uuencode') {
        const begin = encoder.encode(`begin 0644 ${this.fileName ?? 'unknown'}`);
        stream!.write(begin, 0, begin.length);
        const newline = options.newLineBytes;
        stream!.write(newline, 0, newline.length);
      }

      const filtered = new FilteredStream(stream!);
      filtered.add(EncoderFilter.create(transferEncoding, this.encoderMaxLineLength));
      if (transferEncoding !== 'binary')
        filtered.add(options.createNewLineFilter(this.ensureNewLine));
      this.content.decodeTo(filtered);
      filtered.flush();

      if (transferEncoding === 'uuencode') {
        const end = encoder.encode('end');
        stream!.write(end, 0, end.length);
        const newline = options.newLineBytes;
        stream!.write(newline, 0, newline.length);
      }
    } else if (transferEncoding === 'binary') {
      this.content.writeTo(stream!);
    } else {
      const filtered = new FilteredStream(stream!);
      filtered.add(options.createNewLineFilter(this.ensureNewLine));
      this.content.writeTo(filtered);
      filtered.flush();
    }
  }

  protected override onHeadersChanged(action: 'added' | 'changed' | 'removed' | 'cleared', header: Header | null): void {
    super.onHeadersChanged(action, header);
    if (action === 'cleared') {
      this.lazyLoaded.clear();
      this.encodingValue = 'default';
      this.descriptionValue = null;
      this.durationValue = null;
      this.md5sumValue = null;
      return;
    }
    if (header == null)
      return;
    switch (header.id) {
    case HeaderId.ContentTransferEncoding:
      this.lazyLoaded.delete('contentTransferEncoding');
      this.encodingValue = 'default';
      break;
    case HeaderId.ContentDescription:
      this.lazyLoaded.delete('contentDescription');
      this.descriptionValue = null;
      break;
    case HeaderId.ContentDuration:
      this.lazyLoaded.delete('contentDuration');
      this.durationValue = null;
      break;
    case HeaderId.ContentMd5:
      this.lazyLoaded.delete('contentMd5');
      this.md5sumValue = null;
      break;
    }
  }

  override dispose(): void {
    this.content?.dispose();
    super.dispose();
  }
}

function isConstructorArgs(value: unknown): value is MimeEntityConstructorArgs {
  return typeof value === 'object' && value !== null && 'parserOptions' in value && 'contentType' in value && 'headers' in value;
}

function validateContentEncoding(value: ContentEncoding): void {
  switch (value) {
  case 'default':
  case '7bit':
  case '8bit':
  case 'binary':
  case 'base64':
  case 'quoted-printable':
  case 'uuencode':
    return;
  default:
    throw new RangeError('value is not a valid content encoding');
  }
}

function transferEncodingHeader(value: ContentEncoding): string {
  return value === 'uuencode' ? 'x-uuencode' : value;
}

function base64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += alphabet[a >> 2];
    out += alphabet[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? alphabet[c & 63] : '=';
  }
  return out;
}

function md5(input: Uint8Array): Uint8Array {
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const k = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
  const bitLength = input.length * 8;
  const paddedLength = (((input.length + 8) >>> 6) + 1) << 6;
  const data = new Uint8Array(paddedLength);
  data.set(input);
  data[input.length] = 0x80;
  for (let i = 0; i < 8; i++)
    data[paddedLength - 8 + i] = Math.floor(bitLength / 2 ** (8 * i)) & 0xff;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < data.length; offset += 64) {
    const m = new Array<number>(16);
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      m[i] = (data[j]! | (data[j + 1]! << 8) | (data[j + 2]! << 16) | (data[j + 3]! << 24)) >>> 0;
    }
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const tmp = d;
      d = c;
      c = b;
      b = (b + leftRotate((a + f + k[i]! + m[g]!) >>> 0, s[i]!)) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const words = [a0, b0, c0, d0];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    out[i * 4] = word & 0xff;
    out[i * 4 + 1] = (word >>> 8) & 0xff;
    out[i * 4 + 2] = (word >>> 16) & 0xff;
    out[i * 4 + 3] = (word >>> 24) & 0xff;
  }
  return out;
}

function leftRotate(value: number, amount: number): number {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}
