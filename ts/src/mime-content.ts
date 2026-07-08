import type { ContentEncoding } from './content-encoding.js';
import { FilteredStream } from './io/filtered-stream.js';
import { DecoderFilter } from './io/filters/decoder-filter.js';
import { Stream } from './io/stream.js';
import type { NewLineFormat } from './format-options.js';

const BUFFER_LENGTH = 4096;

export class MimeContent {
  readonly encoding: ContentEncoding;
  newLineFormat: NewLineFormat | 'mixed' | null = null;
  stream: Stream | null;

  constructor(stream: Stream, encoding: ContentEncoding = 'default') {
    if (stream == null) throw new TypeError('stream cannot be null or undefined');
    if (!stream.canRead) throw new TypeError('The stream does not support reading.');
    if (!stream.canSeek) throw new TypeError('The stream does not support seeking.');
    this.encoding = encoding;
    this.stream = stream;
  }

  open(): Stream {
    const stream = this.checkDisposed();
    stream.seek(0, 'begin');
    const filtered = new FilteredStream(stream);
    filtered.add(DecoderFilter.create(this.encoding));
    return filtered;
  }

  writeTo(stream: Stream): void {
    if (stream == null) throw new TypeError('stream cannot be null or undefined');
    const source = this.checkDisposed();
    source.seek(0, 'begin');
    source.copyTo(stream, BUFFER_LENGTH);
    source.seek(0, 'begin');
  }

  decodeTo(stream: Stream): void {
    if (stream == null) throw new TypeError('stream cannot be null or undefined');
    this.checkDisposed();
    const filtered = new FilteredStream(stream);
    filtered.add(DecoderFilter.create(this.encoding));
    this.writeTo(filtered);
    filtered.flush();
  }

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
