import { Stream } from '../io/stream.js';
import type { TnefReader } from './tnef-reader.js';

/**
 * A stream for reading raw values from a {@link TnefReader} or property reader.
 */
export class TnefReaderStream extends Stream {
  private disposed = false;

  /**
   * Creates a stream for reading a raw value from the TNEF reader.
   *
   * @param reader the TNEF reader.
   * @param dataEndOffset the end offset of the data.
   * @param valueEndOffset the end offset of the container value.
   */
  constructor(
    private readonly reader: TnefReader,
    private readonly dataEndOffset: number,
    private readonly valueEndOffset: number,
  ) {
    super();
  }

  /**
   * Gets whether the stream supports reading.
   */
  override get canRead(): boolean { return true; }
  /**
   * Gets whether the stream supports writing.
   */
  override get canWrite(): boolean { return false; }
  /**
   * Gets whether the stream supports seeking.
   */
  override get canSeek(): boolean { return false; }
  /**
   * Gets the length of the stream.
   *
   * @throws {Error} seeking is not supported.
   */
  override get length(): number { return this.throwNotSupported('length'); }
  /**
   * Gets the current position within the stream.
   *
   * @throws {Error} seeking is not supported.
   */
  override get position(): number { return this.throwNotSupported('seeking'); }
  /**
   * Sets the current position within the stream.
   *
   * @throws {Error} seeking is not supported.
   */
  override set position(_value: number) { this.throwNotSupported('seeking'); }

  /**
   * Read a sequence of bytes from the stream and advance the position by the
   * number of bytes read.
   *
   * @param buffer the buffer to read data into.
   * @param offset the offset into the buffer to start reading data.
   * @param count the number of bytes to read.
   * @returns the number of bytes read into the buffer.
   * @throws {RangeError} `offset` or `count` is out of range.
   * @throws {TypeError} the stream has been disposed.
   */
  override read(buffer: Uint8Array, offset: number, count: number): number {
    Stream.validateBufferArguments(buffer, offset, count);
    if (this.disposed) throw new TypeError('TnefReaderStream has been disposed');
    const dataLeft = this.dataEndOffset - this.reader.streamOffset;
    const n = Math.min(dataLeft, count);
    const nread = n > 0 ? this.reader.readAttributeRawValue(buffer, offset, n) : 0;
    if (this.dataEndOffset - this.reader.streamOffset === 0 && this.valueEndOffset > this.reader.streamOffset)
      this.reader.skip(this.valueEndOffset - this.reader.streamOffset);
    return nread;
  }

  /**
   * Write a sequence of bytes to the stream.
   *
   * @throws {Error} writing is not supported.
   */
  override write(_buffer: Uint8Array, _offset: number, _count: number): void { this.throwNotSupported('writing'); }
  /**
   * Set the position within the current stream.
   *
   * @throws {Error} seeking is not supported.
   */
  override seek(_offset: number, _origin: 'begin' | 'current' | 'end'): number { this.throwNotSupported('seeking'); }
  /**
   * Clear all buffers for this stream.
   *
   * @throws {Error} writing is not supported.
   */
  override flush(): void { this.throwNotSupported('writing'); }
  /**
   * Set the length of the stream.
   *
   * @throws {Error} setting the length is not supported.
   */
  override setLength(_value: number): void { this.throwNotSupported('setLength'); }
  /**
   * Dispose this stream.
   *
   * The underlying {@link TnefReader} is not disposed.
   */
  override dispose(): void { this.disposed = true; }
}
