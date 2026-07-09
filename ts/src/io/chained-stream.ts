import { Stream, type SeekOrigin } from './stream.js';

/**
 * A chained stream.
 *
 * Chains multiple streams together such that reading or writing beyond the end of one stream
 * spills over into the next stream in the chain, making the chain appear as one continuous stream.
 */
export class ChainedStream extends Stream {
  private readonly streams: Stream[] = [];
  private readonly leaveOpen: boolean[] = [];
  private positionValue = 0;
  private disposed = false;
  private current = 0;
  private eos = false;

  /**
   * Add a stream to the end of the chain.
   *
   * @param stream The stream.
   * @param leaveOpen Whether the stream should remain open after the chained stream is disposed.
   * @throws {TypeError} `stream` is not a stream.
   */
  add(stream: Stream, leaveOpen = false): void {
    if (!(stream instanceof Stream))
      throw new TypeError('stream must be a Stream');

    this.leaveOpen.push(leaveOpen);
    this.streams.push(stream);
    this.eos = false;
  }

  private checkDisposed(): void {
    if (this.disposed)
      throw new TypeError('ChainedStream has been disposed');
  }

  private checkCanSeek(): void {
    if (!this.canSeek)
      throw new TypeError('The stream does not support seeking');
  }

  private checkCanRead(): void {
    if (!this.canRead)
      throw new TypeError('The stream does not support reading');
  }

  private checkCanWrite(): void {
    if (!this.canWrite)
      throw new TypeError('The stream does not support writing');
  }

  /**
   * Whether the chained stream supports reading.
   *
   * The chained stream only supports reading if all of its streams support it.
   */
  override get canRead(): boolean { return this.streams.length > 0 && this.streams.every(stream => stream.canRead); }
  /**
   * Whether the chained stream supports writing.
   *
   * The chained stream only supports writing if all of its streams support it.
   */
  override get canWrite(): boolean { return this.streams.length > 0 && this.streams.every(stream => stream.canWrite); }
  /**
   * Whether the chained stream supports seeking.
   *
   * The chained stream only supports seeking if all of its streams support it.
   */
  override get canSeek(): boolean { return this.streams.length > 0 && this.streams.every(stream => stream.canSeek); }
  /**
   * Whether I/O operations can time out.
   */
  get canTimeout(): boolean { return false; }

  /**
   * The combined length, in bytes, of all chained streams.
   */
  override get length(): number {
    this.checkDisposed();
    return this.streams.reduce((length, stream) => length + stream.length, 0);
  }

  /**
   * The current position within the chained stream.
   *
   * Getting the position is always possible, but setting the position requires all streams to be seekable.
   */
  override get position(): number { return this.positionValue; }
  /** Set the current position within the chained stream. */
  override set position(value: number) { this.seek(value, 'begin'); }

  /**
   * Read bytes from the chained stream.
   *
   * If the current child stream does not have enough remaining data to complete the read,
   * the read progresses into the next stream in the chain.
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

    if (count === 0 || this.eos)
      return 0;

    let nread = 0;

    while (this.current < this.streams.length) {
      let n: number;
      while (nread < count && (n = this.streams[this.current].read(buffer, offset + nread, count - nread)) > 0)
        nread += n;

      if (nread === count)
        break;

      this.current++;
    }

    if (nread > 0)
      this.positionValue += nread;
    else
      this.eos = true;

    return nread;
  }

  /**
   * Write bytes to the chained stream.
   *
   * If the current child stream does not have enough remaining space before the next stream boundary,
   * the write progresses into the next stream in the chain.
   *
   * @param buffer The buffer to write.
   * @param offset The offset of the first byte to write.
   * @param count The number of bytes to write.
   */
  override write(buffer: Uint8Array, offset: number, count: number): void {
    this.checkDisposed();
    this.checkCanWrite();
    Stream.validateBufferArguments(buffer, offset, count);

    if (this.current >= this.streams.length)
      this.current = this.streams.length - 1;

    let nwritten = 0;

    while (this.current < this.streams.length && nwritten < count) {
      let n = count - nwritten;

      if (this.current + 1 < this.streams.length) {
        const left = this.streams[this.current].length - this.streams[this.current].position;
        if (left < n)
          n = left;
      }

      this.streams[this.current].write(buffer, offset + nwritten, n);
      this.positionValue += n;
      nwritten += n;

      if (nwritten < count) {
        this.streams[this.current].flush();
        this.current++;
      }
    }
  }

  /**
   * Set the position within the chained stream.
   *
   * @param offset The offset relative to `origin`.
   * @param origin The reference point used to obtain the new position.
   * @returns The new position within the chained stream.
   */
  override seek(offset: number, origin: SeekOrigin): number {
    this.checkDisposed();
    this.checkCanSeek();

    let length = -1;
    let real: number;

    switch (origin) {
      case 'begin':
        real = offset;
        break;
      case 'current':
        real = this.positionValue + offset;
        break;
      case 'end':
        length = this.length;
        real = length + offset;
        break;
      default:
        throw new RangeError('Invalid SeekOrigin specified');
    }

    if (!Number.isInteger(real) || real < 0)
      throw new Error('Cannot seek to a position before the beginning of the stream');
    if (real === this.positionValue)
      return this.positionValue;
    if (real > (length < 0 ? this.length : length))
      throw new Error('Cannot seek beyond the end of the stream');

    if (real > this.positionValue) {
      while (this.current < this.streams.length && this.positionValue < real) {
        const left = this.streams[this.current].length - this.streams[this.current].position;
        const n = Math.min(left, real - this.positionValue);

        this.streams[this.current].seek(n, 'current');
        this.positionValue += n;

        if (this.positionValue < real)
          this.current++;
      }

      this.eos = this.current >= this.streams.length;
    } else {
      const max = Math.min(this.streams.length - 1, this.current);
      let cur = 0;

      this.positionValue = 0;
      while (cur <= max) {
        length = this.streams[cur].length;

        if (real < this.positionValue + length) {
          this.streams[cur].seek(real - this.positionValue, 'begin');
          this.positionValue = real;
          break;
        }

        this.positionValue += length;
        cur++;
      }

      this.current = cur++;

      while (cur <= max)
        this.streams[cur++].seek(0, 'begin');

      this.eos = false;
    }

    return this.positionValue;
  }

  /**
   * Flush the current child stream.
   */
  override flush(): void {
    this.checkDisposed();
    this.checkCanWrite();

    if (this.current < this.streams.length)
      this.streams[this.current].flush();
  }

  /**
   * Setting the length of a chained stream is not supported.
   *
   * @param _value The requested length.
   * @throws {TypeError} Always thrown because the operation is unsupported.
   */
  override setLength(_value: number): void {
    this.checkDisposed();
    throw new TypeError('Cannot set a length on the stream');
  }

  /**
   * Dispose the chained stream and any child stream not added with `leaveOpen`.
   */
  override dispose(): void {
    if (!this.disposed) {
      for (let i = 0; i < this.streams.length; i++) {
        if (!this.leaveOpen[i])
          this.streams[i].dispose();
      }
    }

    super.dispose();
    this.disposed = true;
  }
}
