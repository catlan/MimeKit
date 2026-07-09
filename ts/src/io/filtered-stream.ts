import { Stream, type SeekOrigin } from './stream.js';
import type { IMimeFilter } from './filters/mime-filter.js';

const READ_BUFFER_SIZE = 4096;

type IOOperation = 'read' | 'write';

/**
 * A stream which filters data as it is read or written.
 *
 * Passes data through each {@link IMimeFilter} as the data is read or written.
 */
export class FilteredStream extends Stream {
  private readonly filters: IMimeFilter[] = [];
  private lastOp: IOOperation = 'write';
  private filteredLength = 0;
  private filteredIndex = 0;
  private filtered?: Uint8Array;
  private readbuf: Uint8Array | undefined;
  private disposed = false;
  private flushed = false;

  /**
   * Create a filtered stream using the specified source stream.
   *
   * The source stream is left open when this filtered stream is disposed.
   *
   * @param source The underlying stream to filter.
   * @throws {TypeError} `source` is not a stream.
   */
  constructor(readonly source: Stream) {
    super();
    if (!(source instanceof Stream))
      throw new TypeError('source must be a Stream');
  }

  /**
   * Add a filter to the end of the filter list.
   *
   * Data passes through filters as it is read from or written to the underlying source stream.
   *
   * @param filter The filter.
   * @throws {TypeError} `filter` is null or undefined.
   */
  add(filter: IMimeFilter): void {
    this.checkDisposed();
    this.validateFilter(filter);
    this.filters.push(filter);
  }

  /**
   * Check whether the filtered stream contains the specified filter.
   *
   * @param filter The filter.
   * @returns `true` if the specified filter exists; otherwise, `false`.
   * @throws {TypeError} `filter` is null or undefined.
   */
  contains(filter: IMimeFilter): boolean {
    this.checkDisposed();
    this.validateFilter(filter);
    return this.filters.includes(filter);
  }

  /**
   * Remove a filter.
   *
   * @param filter The filter.
   * @returns `true` if the filter was removed; otherwise, `false`.
   * @throws {TypeError} `filter` is null or undefined.
   */
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

  /**
   * Whether the filtered stream supports reading.
   *
   * The filtered stream only supports reading if the source stream supports it.
   */
  override get canRead(): boolean { return this.source.canRead; }
  /**
   * Whether the filtered stream supports writing.
   *
   * The filtered stream only supports writing if the source stream supports it.
   */
  override get canWrite(): boolean { return this.source.canWrite; }
  /**
   * Whether the filtered stream supports seeking.
   *
   * Seeking is not supported by filtered streams.
   */
  override get canSeek(): boolean { return false; }

  /**
   * Getting the length of a filtered stream is not supported.
   */
  override get length(): number {
    throw new TypeError('Cannot get the length of the stream');
  }

  /**
   * Getting the position of a filtered stream is not supported.
   */
  override get position(): number {
    throw new TypeError('The stream does not support seeking');
  }

  /**
   * Setting the position of a filtered stream is not supported.
   */
  override set position(_value: number) {
    throw new TypeError('The stream does not support seeking');
  }

  /**
   * Read bytes from the filtered stream.
   *
   * Data read from the source stream is passed through each filter before being copied to `buffer`.
   *
   * @param buffer The buffer to read data into.
   * @param offset The offset into the buffer to start reading data.
   * @param count The number of bytes to read.
   * @returns The total number of bytes read into the buffer, or zero if the end of the stream has been reached.
   */
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

  /**
   * Write bytes to the filtered stream.
   *
   * Data is passed through each filter before being written to the source stream.
   *
   * @param buffer The buffer to write.
   * @param offset The offset of the first byte to write.
   * @param count The number of bytes to write.
   */
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

  /**
   * Seeking is not supported by filtered streams.
   *
   * @param _offset The offset relative to `_origin`.
   * @param _origin The reference point used to obtain the new position.
   * @throws {TypeError} Always thrown because the operation is unsupported.
   */
  override seek(_offset: number, _origin: SeekOrigin): number {
    throw new TypeError('The stream does not support seeking');
  }

  /**
   * Flush filtered data to the source stream.
   */
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

  /**
   * Setting the length of a filtered stream is not supported.
   *
   * @param _value The requested length.
   * @throws {TypeError} Always thrown because the operation is unsupported.
   */
  override setLength(_value: number): void {
    this.checkDisposed();
    throw new TypeError('Cannot set a length on the stream');
  }

  /**
   * Dispose the filtered stream and clear its filter list.
   */
  override dispose(): void {
    if (!this.disposed) {
      this.filters.length = 0;
      this.readbuf = undefined;
    }

    super.dispose();
    this.disposed = true;
  }
}
