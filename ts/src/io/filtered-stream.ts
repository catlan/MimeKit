import { Stream, type SeekOrigin } from './stream.js';
import type { IMimeFilter } from './filters/mime-filter.js';

const READ_BUFFER_SIZE = 4096;

type IOOperation = 'read' | 'write';

export class FilteredStream extends Stream {
  private readonly filters: IMimeFilter[] = [];
  private lastOp: IOOperation = 'write';
  private filteredLength = 0;
  private filteredIndex = 0;
  private filtered?: Uint8Array;
  private readbuf: Uint8Array | undefined;
  private disposed = false;
  private flushed = false;

  constructor(readonly source: Stream) {
    super();
    if (!(source instanceof Stream))
      throw new TypeError('source must be a Stream');
  }

  add(filter: IMimeFilter): void {
    this.checkDisposed();
    this.validateFilter(filter);
    this.filters.push(filter);
  }

  contains(filter: IMimeFilter): boolean {
    this.checkDisposed();
    this.validateFilter(filter);
    return this.filters.includes(filter);
  }

  remove(filter: IMimeFilter): boolean {
    this.checkDisposed();
    this.validateFilter(filter);
    const index = this.filters.indexOf(filter);
    if (index === -1)
      return false;
    this.filters.splice(index, 1);
    return true;
  }

  private validateFilter(filter: IMimeFilter): void {
    if (!filter)
      throw new TypeError('filter must be an IMimeFilter');
  }

  private checkDisposed(): void {
    if (this.disposed)
      throw new TypeError('FilteredStream has been disposed');
  }

  private checkCanRead(): void {
    if (!this.source.canRead)
      throw new TypeError('The stream does not support reading');
  }

  private checkCanWrite(): void {
    if (!this.source.canWrite)
      throw new TypeError('The stream does not support writing');
  }

  override get canRead(): boolean { return this.source.canRead; }
  override get canWrite(): boolean { return this.source.canWrite; }
  override get canSeek(): boolean { return false; }

  override get length(): number {
    throw new TypeError('Cannot get the length of the stream');
  }

  override get position(): number {
    throw new TypeError('The stream does not support seeking');
  }

  override set position(_value: number) {
    throw new TypeError('The stream does not support seeking');
  }

  override read(buffer: Uint8Array, offset: number, count: number): number {
    this.checkDisposed();
    this.checkCanRead();
    Stream.validateBufferArguments(buffer, offset, count);

    this.lastOp = 'read';
    this.readbuf ??= new Uint8Array(READ_BUFFER_SIZE);

    let nread: number;

    if (this.filteredLength === 0) {
      nread = this.source.read(this.readbuf, 0, READ_BUFFER_SIZE);
      if (nread <= 0)
        return nread;

      this.filteredLength = nread;
      this.filteredIndex = 0;
      this.filtered = this.readbuf;

      for (const filter of this.filters) {
        const result = filter.filter(this.filtered, this.filteredIndex, this.filteredLength);
        this.filtered = result.buffer;
        this.filteredIndex = result.index;
        this.filteredLength = result.length;
      }
    }

    nread = Math.min(this.filteredLength, count);

    if (nread > 0) {
      buffer.set(this.filtered!.subarray(this.filteredIndex, this.filteredIndex + nread), offset);
      this.filteredLength -= nread;
      this.filteredIndex += nread;
    }

    return nread;
  }

  override write(buffer: Uint8Array, offset: number, count: number): void {
    this.checkDisposed();
    this.checkCanWrite();
    Stream.validateBufferArguments(buffer, offset, count);

    this.lastOp = 'write';
    this.flushed = false;

    this.filteredIndex = offset;
    this.filteredLength = count;
    this.filtered = buffer;

    for (const filter of this.filters) {
      const result = filter.filter(this.filtered, this.filteredIndex, this.filteredLength);
      this.filtered = result.buffer;
      this.filteredIndex = result.index;
      this.filteredLength = result.length;
    }

    if (this.filteredLength > 0)
      this.source.write(this.filtered, this.filteredIndex, this.filteredLength);
  }

  override seek(_offset: number, _origin: SeekOrigin): number {
    throw new TypeError('The stream does not support seeking');
  }

  override flush(): void {
    this.checkDisposed();
    this.checkCanWrite();

    if (this.lastOp === 'read')
      return;

    if (!this.flushed) {
      this.filtered = new Uint8Array(0);
      this.filteredIndex = 0;
      this.filteredLength = 0;

      for (const filter of this.filters) {
        const result = filter.flush(this.filtered, this.filteredIndex, this.filteredLength);
        this.filtered = result.buffer;
        this.filteredIndex = result.index;
        this.filteredLength = result.length;
      }

      this.flushed = true;
    }

    if (this.filteredLength > 0) {
      this.source.write(this.filtered!, this.filteredIndex, this.filteredLength);
      this.filteredIndex = 0;
      this.filteredLength = 0;
    }
  }

  override setLength(_value: number): void {
    this.checkDisposed();
    throw new TypeError('Cannot set a length on the stream');
  }

  override dispose(): void {
    if (!this.disposed) {
      this.filters.length = 0;
      this.readbuf = undefined;
    }

    super.dispose();
    this.disposed = true;
  }
}
