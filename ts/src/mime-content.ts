import type { ContentEncoding } from './content-encoding.js';
import { FilteredStream } from './io/filtered-stream.js';
import { DecoderFilter } from './io/filters/decoder-filter.js';
import { Stream } from './io/stream.js';
import type { NewLineFormat } from './format-options.js';

const BUFFER_LENGTH = 4096;

/**
 * Represents MIME content backed by a readable, seekable stream.
 *
 * The content can be opened raw, copied as stored, or decoded according to its
 * transfer encoding.
 */
export class MimeContent {
  /** The content-transfer-encoding used by the stored stream. */
  readonly encoding: ContentEncoding;
  /** The detected newline format of the content, when known. */
  newLineFormat: NewLineFormat | 'mixed' | null = null;
  /** The backing stream, or `null` after disposal. */
  stream: Stream | null;

  /**
   * Initializes a new MIME content object.
   *
   * @param stream The readable, seekable stream containing the encoded content.
   * @param encoding The transfer encoding used by the stream.
   * @throws {TypeError} `stream` is null, unreadable, or not seekable.
   */
  constructor(stream: Stream, encoding: ContentEncoding = 'default') {
    if (stream == null) throw new TypeError('stream cannot be null or undefined');
    if (!stream.canRead) throw new TypeError('The stream does not support reading.');
    if (!stream.canSeek) throw new TypeError('The stream does not support seeking.');
    this.encoding = encoding;
    this.stream = stream;
  }

  /**
   * Opens a decoded stream over the content.
   *
   * @returns A filtered stream that decodes the content-transfer-encoding.
   */
  open(): Stream {
    const stream = this.checkDisposed();
    stream.seek(0, 'begin');
    const filtered = new FilteredStream(stream);
    filtered.add(DecoderFilter.create(this.encoding));
    return filtered;
  }

  /**
   * Writes the encoded content to another stream.
   *
   * @param stream The destination stream.
   * @throws {TypeError} `stream` is null or this content has been disposed.
   */
  writeTo(stream: Stream): void {
    if (stream == null) throw new TypeError('stream cannot be null or undefined');
    const source = this.checkDisposed();
    source.seek(0, 'begin');
    source.copyTo(stream, BUFFER_LENGTH);
    source.seek(0, 'begin');
  }

  /**
   * Decodes the content to another stream.
   *
   * @param stream The destination stream.
   * @throws {TypeError} `stream` is null or this content has been disposed.
   */
  decodeTo(stream: Stream): void {
    if (stream == null) throw new TypeError('stream cannot be null or undefined');
    this.checkDisposed();
    const filtered = new FilteredStream(stream);
    filtered.add(DecoderFilter.create(this.encoding));
    this.writeTo(filtered);
    filtered.flush();
  }

  /** Releases the backing stream. */
  dispose(): void {
    this.stream?.dispose();
    this.stream = null;
  }

  private checkDisposed(): Stream {
    if (this.stream == null)
      throw new TypeError('MimeContent has been disposed');
    return this.stream;
  }
}
