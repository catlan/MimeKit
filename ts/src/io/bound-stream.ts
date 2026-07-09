import { Stream, type SeekOrigin } from './stream.js';

/**
 * A bounded stream confined to reading and writing data in a limited subset of an underlying stream.
 *
 * Wraps an arbitrary stream, limiting I/O operations to a subset of the source stream. If
 * {@link endBoundary} is `-1`, then the end of the stream is unbound.
 */
export class BoundStream extends Stream {
  private positionValue = 0;
  private disposed = false;
  private eos = false;

  /**
   * The underlying stream.
   *
   * All I/O is performed on the base stream.
   */
  readonly baseStream: Stream;
  /**
   * The byte offset into {@link baseStream} that marks the beginning of the substream.
   */
  readonly startBoundary: number;
  /**
   * The byte offset into {@link baseStream} that marks the end of the substream, or `-1` if unbound.
   */
  endBoundary: number;

  /**
   * Create a bounded stream.
   *
   * If `endBoundary` is less than `0`, then the end of the stream is unbounded.
   *
   * @param baseStream The underlying stream.
   * @param startBoundary The offset in the base stream that marks the start of this substream.
   * @param endBoundary The offset in the base stream that marks the end of this substream.
   * @param leaveOpen Whether to leave `baseStream` open after this stream is disposed.
   * @throws {TypeError} `baseStream` is not a stream.
   * @throws {RangeError} `startBoundary` is less than zero or `endBoundary` is before `startBoundary`.
   */
  constructor(baseStream: Stream, startBoundary: number, endBoundary: number, private readonly leaveOpen: boolean) {
    super();

    if (!(baseStream instanceof Stream))
      throw new TypeError('baseStream must be a Stream');
    if (!Number.isInteger(startBoundary) || startBoundary < 0)
      throw new RangeError('startBoundary must be a non-negative integer');
    if (!Number.isInteger(endBoundary))
      throw new RangeError('endBoundary must be an integer');
    if (endBoundary >= 0 && endBoundary < startBoundary)
      throw new RangeError('endBoundary must be greater than or equal to startBoundary');

    this.baseStream = baseStream;
    this.startBoundary = startBoundary;
    this.endBoundary = endBoundary < 0 ? -1 : endBoundary;
  }

  private checkDisposed(): void {
    if (this.disposed)
      throw new TypeError('BoundStream has been disposed');
  }

  private checkCanSeek(): void {
    if (!this.baseStream.canSeek)
      throw new TypeError('The stream does not support seeking');
  }

  private checkCanRead(): void {
    if (!this.baseStream.canRead)
      throw new TypeError('The stream does not support reading');
  }

  private checkCanWrite(): void {
    if (!this.baseStream.canWrite)
      throw new TypeError('The stream does not support writing');
  }

  /**
   * Whether the stream supports reading.
   *
   * The bounded stream only supports reading if the underlying stream supports it.
   */
  override get canRead(): boolean { return this.baseStream.canRead; }
  /**
   * Whether the stream supports writing.
   *
   * The bounded stream only supports writing if the underlying stream supports it.
   */
  override get canWrite(): boolean { return this.baseStream.canWrite; }
  /**
   * Whether the stream supports seeking.
   *
   * The bounded stream only supports seeking if the underlying stream supports it.
   */
  override get canSeek(): boolean { return this.baseStream.canSeek; }
  /**
   * Whether I/O operations can time out.
   */
  get canTimeout(): boolean { return false; }

  /**
   * The length of the bounded stream, in bytes.
   *
   * If {@link endBoundary} is non-negative, the length is `endBoundary - startBoundary`.
   * If the end is unbound, the length is based on the underlying stream length.
   */
  override get length(): number {
    this.checkDisposed();

    if (this.endBoundary !== -1)
      return this.endBoundary - this.startBoundary;
    if (this.eos)
      return this.positionValue;

    return this.baseStream.length - this.startBoundary;
  }

  /**
   * The current position within the bounded stream, relative to {@link startBoundary}.
   */
  override get position(): number { return this.positionValue; }
  /** Set the current position within the bounded stream. */
  override set position(value: number) { this.seek(value, 'begin'); }

  /**
   * Read bytes from the bounded stream.
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

    if (this.endBoundary !== -1 && this.startBoundary + this.positionValue >= this.endBoundary) {
      this.eos = true;
      return 0;
    }

    if (this.baseStream.canSeek && this.baseStream.position !== this.startBoundary + this.positionValue)
      this.baseStream.seek(this.startBoundary + this.positionValue, 'begin');

    const n = this.endBoundary !== -1
      ? Math.min(this.endBoundary - (this.startBoundary + this.positionValue), count)
      : count;
    const nread = this.baseStream.read(buffer, offset, n);

    if (nread > 0)
      this.positionValue += nread;
    else if (nread === 0)
      this.eos = true;

    return nread;
  }

  /**
   * Write bytes to the bounded stream.
   *
   * @param buffer The buffer to write.
   * @param offset The offset of the first byte to write.
   * @param count The number of bytes to write.
   */
  override write(buffer: Uint8Array, offset: number, count: number): void {
    this.checkDisposed();
    this.checkCanWrite();
    Stream.validateBufferArguments(buffer, offset, count);

    if (this.endBoundary !== -1 && this.startBoundary + this.positionValue + count > this.endBoundary) {
      this.eos = this.startBoundary + this.positionValue >= this.endBoundary;
      throw new Error('Cannot write beyond the end of the stream');
    }

    if (this.baseStream.canSeek && this.baseStream.position !== this.startBoundary + this.positionValue)
      this.baseStream.seek(this.startBoundary + this.positionValue, 'begin');

    this.baseStream.write(buffer, offset, count);
    this.positionValue += count;

    if (this.endBoundary !== -1 && this.startBoundary + this.positionValue >= this.endBoundary)
      this.eos = true;
  }

  /**
   * Set the position within the bounded stream.
   *
   * @param offset The offset relative to `origin`.
   * @param origin The reference point used to obtain the new position.
   * @returns The new position within the bounded stream.
   */
  override seek(offset: number, origin: SeekOrigin): number {
    this.checkDisposed();
    this.checkCanSeek();

    let real: number;
    switch (origin) {
      case 'begin':
        real = this.startBoundary + offset;
        break;
      case 'current':
        real = this.startBoundary + this.positionValue + offset;
        break;
      case 'end':
        if (offset >= 0 || (this.endBoundary === -1 && !this.eos)) {
          real = this.baseStream.seek(offset, origin);
        } else if (this.endBoundary === -1) {
          real = this.startBoundary + this.positionValue + offset;
        } else {
          real = this.endBoundary + offset;
        }
        break;
      default:
        throw new RangeError('Invalid SeekOrigin specified');
    }

    if (real < this.startBoundary)
      throw new Error('Cannot seek to a position before the beginning of the stream');
    if (real === this.startBoundary + this.positionValue)
      return this.positionValue;
    if (this.endBoundary !== -1 && real > this.endBoundary)
      throw new Error('Cannot seek beyond the end of the stream');

    real = this.baseStream.seek(real, 'begin');

    if ((this.endBoundary !== -1 && real < this.endBoundary) || (this.eos && real < this.startBoundary + this.positionValue))
      this.eos = false;

    this.positionValue = real - this.startBoundary;
    return this.positionValue;
  }

  /**
   * Flush writes to the underlying stream.
   */
  override flush(): void {
    this.checkDisposed();
    this.checkCanWrite();
    this.baseStream.flush();
  }

  /**
   * Set the length of the bounded stream.
   *
   * @param value The desired length in bytes.
   * @throws {RangeError} `value` is negative or not an integer.
   */
  override setLength(value: number): void {
    this.checkDisposed();
    if (!Number.isInteger(value) || value < 0)
      throw new RangeError(`length ${value} out of range`);

    if (this.endBoundary === -1 || this.startBoundary + value > this.endBoundary) {
      const end = this.baseStream.length;
      if (this.startBoundary + value > end)
        this.baseStream.setLength(this.startBoundary + value);
      this.endBoundary = this.startBoundary + value;
    } else {
      this.endBoundary = this.startBoundary + value;
    }
  }

  /**
   * Dispose the bounded stream, disposing the underlying stream unless `leaveOpen` was set.
   */
  override dispose(): void {
    if (!this.leaveOpen)
      this.baseStream.dispose();
    super.dispose();
    this.disposed = true;
  }
}
