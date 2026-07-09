import { MemoryStream, Stream } from '../io/stream.js';
import { TextFormat } from '../text-part.js';
import { tryGetEncoding, utf8, type CharsetEncoding } from '../utils/charset-utils.js';
import { StringWriter, StreamTextWriter, type TextWriter } from './text-io.js';
import { UrlPattern, UrlPatternType } from './url-scanner.js';

export const UrlPatterns: UrlPattern[] = [
  new UrlPattern(UrlPatternType.Addrspec, '@', 'mailto:'),
  new UrlPattern(UrlPatternType.MailTo, 'mailto:', ''),
  new UrlPattern(UrlPatternType.Web, 'www.', 'http://'),
  new UrlPattern(UrlPatternType.Web, 'ftp.', 'ftp://'),
  new UrlPattern(UrlPatternType.File, 'file://', ''),
  new UrlPattern(UrlPatternType.Web, 'ftp://', ''),
  new UrlPattern(UrlPatternType.Web, 'sftp://', ''),
  new UrlPattern(UrlPatternType.Web, 'http://', ''),
  new UrlPattern(UrlPatternType.Web, 'https://', ''),
  new UrlPattern(UrlPatternType.Web, 'news://', ''),
  new UrlPattern(UrlPatternType.Web, 'nntp://', ''),
  new UrlPattern(UrlPatternType.Web, 'telnet://', ''),
  new UrlPattern(UrlPatternType.Web, 'webcal://', ''),
  new UrlPattern(UrlPatternType.Web, 'callto:', ''),
  new UrlPattern(UrlPatternType.Web, 'h323:', ''),
  new UrlPattern(UrlPatternType.Web, 'sip:', ''),
];

function detectBom(bytes: Uint8Array): { encoding: CharsetEncoding; skip: number } | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: utf8, skip: 3 };
  const utf16le = tryGetEncoding('utf-16le');
  const utf16be = tryGetEncoding('utf-16be');
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe && utf16le !== null) return { encoding: utf16le, skip: 2 };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff && utf16be !== null) return { encoding: utf16be, skip: 2 };
  return null;
}

function readAll(stream: Stream): Uint8Array {
  if ('toArray' in stream && typeof stream.toArray === 'function') {
    return (stream as MemoryStream).toArray().subarray(stream.position);
  }
  const chunks: Uint8Array[] = [];
  const buffer = new Uint8Array(4096);
  let total = 0;
  let n: number;
  while ((n = stream.read(buffer, 0, buffer.length)) > 0) {
    chunks.push(buffer.slice(0, n));
    total += n;
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}

export abstract class TextConverter {
  detectEncodingFromByteOrderMark = false;
  header: string | null = null;
  footer: string | null = null;
  private inputEncodingValue: CharsetEncoding = utf8;
  private outputEncodingValue: CharsetEncoding = utf8;
  private inputStreamBufferSizeValue = 4096;
  private outputStreamBufferSizeValue = 4096;

  abstract get inputFormat(): TextFormat;
  abstract get outputFormat(): TextFormat;

  get inputEncoding(): CharsetEncoding { return this.inputEncodingValue; }
  set inputEncoding(value: CharsetEncoding) {
    if (value === null || value === undefined) throw new TypeError('value');
    this.inputEncodingValue = value;
  }

  get outputEncoding(): CharsetEncoding { return this.outputEncodingValue; }
  set outputEncoding(value: CharsetEncoding) {
    if (value === null || value === undefined) throw new TypeError('value');
    this.outputEncodingValue = value;
  }

  get inputStreamBufferSize(): number { return this.inputStreamBufferSizeValue; }
  set inputStreamBufferSize(value: number) {
    if (!Number.isInteger(value) || value <= 0) throw new RangeError('value');
    this.inputStreamBufferSizeValue = value;
  }

  get outputStreamBufferSize(): number { return this.outputStreamBufferSizeValue; }
  set outputStreamBufferSize(value: number) {
    if (!Number.isInteger(value) || value <= 0) throw new RangeError('value');
    this.outputStreamBufferSizeValue = value;
  }

  protected decode(bytes: Uint8Array): string {
    let encoding = this.inputEncodingValue;
    let body = bytes;
    if (this.detectEncodingFromByteOrderMark) {
      const bom = detectBom(bytes);
      if (bom !== null) {
        encoding = bom.encoding;
        body = bytes.subarray(bom.skip);
      }
    }
    return encoding.decode(body);
  }

  convertToWriter(source: string | Uint8Array | Stream, writer: TextWriter): void {
    if (source === null || source === undefined) throw new TypeError('source');
    if (writer === null || writer === undefined) throw new TypeError('writer');
    const text = typeof source === 'string'
      ? source
      : source instanceof Uint8Array
        ? this.decode(source)
        : this.decode(readAll(source));
    this.convertText(text, writer);
  }

  convertToStream(source: string | Uint8Array | Stream, destination: Stream): void {
    if (destination === null || destination === undefined) throw new TypeError('destination');
    const writer = new StreamTextWriter(destination, true);
    this.convertToWriter(source, writer);
    writer.flush();
  }

  convert(text: string | Uint8Array | Stream): string {
    if (text === null || text === undefined) throw new TypeError('text');
    const writer = new StringWriter();
    this.convertToWriter(text, writer);
    return writer.toString();
  }

  abstract convertText(text: string, writer: TextWriter): void;
}
