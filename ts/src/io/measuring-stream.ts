import { Stream, type SeekOrigin } from './stream.js';

/**
 * A stream useful for measuring the amount of data written.
 *
 * A measuring stream tracks the number of bytes written to it. This is useful when
 * you need to know how large a message is without writing it to disk or a memory buffer.
 */
export class MeasuringStream extends Stream {
  private disposed = false;
  private positionValue = 0;
  private lengthValue = 0;

  private checkDisposed(): void {
    if (this.disposed)
      throw new TypeError('MeasuringStream has been disposed');
  }

  /**
   * Whether the stream supports reading.
   *
   * A measuring stream is not readable.
   */
  override get canRead(): boolean { return false; }
  /**
   * Whether the stream supports writing.
   *
   * A measuring stream is always writable.
   */
  override get canWrite(): boolean { return true; }
  /**
   * Whether the stream supports seeking.
   *
   * A measuring stream is always seekable.
   */
  override get canSeek(): boolean { return true; }
  /**
   * Whether I/O operations can time out.
   */
  get canTimeout(): boolean { return false; }

  /**
   * The number of bytes that have been written to the stream.
   */
  override get length(): number {
    this.checkDisposed();
    return this.lengthValue;
  }

  /**
   * The current position within the stream.
   *
   * Since seeking is possible, the position may differ from the length, although typically it is the same.
   */
  override get position(): number { return this.positionValue; }
  /** Set the current position within the stream. */
  override set position(value: number) { this.seek(value, 'begin'); }

  /**
   * Reading from a measuring stream is not supported.
   *
   * @param _buffer The buffer to read data into.
   * @param _offset The offset into the buffer to start reading data.
   * @param _count The number of bytes to read.
   * @throws {TypeError} Always thrown because reading is unsupported.
   */
  override read(_buffer: Uint8Array, _offset: number, _count: number): number {
    this.checkDisposed();
    throw new TypeError('The stream does not support reading');
  }

  /**
   * Write bytes to the measuring stream.
   *
   * Increments the position by the number of bytes written. If the updated position is
   * greater than the current length, the length is updated to match the position.
   *
   * @param buffer The buffer to write.
   * @param offset The offset of the first byte to write.
   * @param count The number of bytes to write.
   */
  override write(buffer: Uint8Array, offset: number, count: number): void {
    this.checkDisposed();
    Stream.validateBufferArguments(buffer, offset, count);

    this.positionValue += count;
    this.lengthValue = Math.max(this.lengthValue, this.positionValue);
  }

  /**
   * Set the position within the stream.
   *
   * @param offset The offset relative to `origin`.
   * @param origin The reference point used to obtain the new position.
   * @returns The new position within the stream.
   */
  override seek(offset: number, origin: SeekOrigin): number {
    this.checkDisposed();

    let real: number;
    switch (origin) {
      case 'begin':
        real = offset;
        break;
      case 'current':
        real = this.positionValue + offset;
        break;
      case 'end':
        real = this.lengthValue + offset;
        break;
      default:
        throw new RangeError('Invalid SeekOrigin specified');
    }

    if (!Number.isInteger(real) || real < 0)
      throw new Error('Cannot seek to a position before the beginning of the stream');
    if (real > this.lengthValue)
      throw new Error('Cannot seek beyond the end of the stream');

    this.positionValue = real;
    return this.positionValue;
  }

  /**
   * Flush the stream.
   */
  override flush(): void {
    this.checkDisposed();
  }

  /**
   * Set the length of the stream.
   *
   * @param value The desired length in bytes.
   * @throws {RangeError} `value` is negative or not an integer.
   */
  override setLength(value: number): void {
    this.checkDisposed();

    if (!Number.isInteger(value) || value < 0)
      throw new RangeError(`length ${value} out of range`);

    this.positionValue = Math.min(this.positionValue, value);
    this.lengthValue = value;
  }

  /**
   * Dispose the stream.
   */
  override dispose(): void {
    super.dispose();
    this.disposed = true;
  }
}
