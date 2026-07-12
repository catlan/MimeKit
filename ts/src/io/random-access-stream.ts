/**
 * Substrate shim: a read-only, seekable {@link Stream} over a
 * {@link SyncRandomAccessReader} (not a port of a MimeKit file).
 *
 * This is the bridge between the synchronous parser core and lazily-read
 * sources: hand `new MimeParser(new RandomAccessStream(reader), 'mbox')` a
 * multi-GB mailbox and it is parsed by seeking — bytes are pulled through a
 * fixed-size chunk cache, never materialized whole. The `start`/`length`
 * window makes positions relative to this stream, which lets a single mbox
 * entry located by a persistent listing pass be re-parsed later as its own
 * stream.
 */

import type { SyncRandomAccessReader } from './random-access-reader.js';
import { Stream, type SeekOrigin } from './stream.js';

const DEFAULT_CHUNK_SIZE = 256 * 1024;

/**
 * A read-only, seekable stream over a {@link SyncRandomAccessReader}, backed
 * by a fixed-size chunk cache.
 */
export class RandomAccessStream extends Stream {
  private readonly reader: SyncRandomAccessReader;
  private readonly start: number;
  private readonly lengthValue: number;
  private readonly chunkSize: number;
  private positionValue = 0;
  private cache: Uint8Array = new Uint8Array(0);
  private cacheStart = -1;

  /**
   * Create a stream over a window of a random-access reader.
   *
   * @param reader The synchronous source to read from.
   * @param start Byte offset in `reader` where this stream begins.
   * @param length Length of the window in bytes; defaults to the remainder of
   *   the reader from `start`.
   * @param chunkSize Size of the read-ahead cache in bytes.
   * @throws {RangeError} `start`, `length`, or `chunkSize` is out of range.
   */
  constructor(reader: SyncRandomAccessReader, start = 0, length?: number, chunkSize = DEFAULT_CHUNK_SIZE) {
    super();
    if (!Number.isInteger(start) || start < 0)
      throw new RangeError(`start ${start} must be a non-negative integer`);
    const remainder = Math.max(reader.size - start, 0);
    const window = length ?? remainder;
    if (!Number.isInteger(window) || window < 0)
      throw new RangeError(`length ${window} must be a non-negative integer`);
    if (!Number.isInteger(chunkSize) || chunkSize <= 0)
      throw new RangeError(`chunkSize ${chunkSize} must be a positive integer`);
    this.reader = reader;
    this.start = start;
    this.lengthValue = window;
    this.chunkSize = chunkSize;
  }

  /** Whether the stream supports reading. */
  override get canRead(): boolean { return true; }
  /** Whether the stream supports writing. */
  override get canWrite(): boolean { return false; }
  /** Whether the stream supports seeking. */
  override get canSeek(): boolean { return true; }

  /** The length of the stream, in bytes. */
  override get length(): number { return this.lengthValue; }

  /** The current position within the stream. */
  override get position(): number { return this.positionValue; }
  /** Set the current position within the stream. */
  override set position(value: number) {
    if (!Number.isInteger(value) || value < 0)
      throw new RangeError(`position ${value} must be a non-negative integer`);
    this.positionValue = value;
  }

  /**
   * Read bytes from the stream.
   *
   * @param buffer The buffer to read data into.
   * @param offset The offset into the buffer to start reading data.
   * @param count The number of bytes to read.
   * @returns The total number of bytes read into the buffer, or zero if the end of the stream has been reached.
   */
  override read(buffer: Uint8Array, offset: number, count: number): number {
    Stream.validateBufferArguments(buffer, offset, count);

    let copied = 0;
    while (copied < count && this.positionValue < this.lengthValue) {
      if (this.positionValue < this.cacheStart || this.positionValue >= this.cacheStart + this.cache.length) {
        this.cacheStart = this.positionValue;
        this.cache = this.reader.readAtSync(
          this.start + this.cacheStart,
          Math.min(this.chunkSize, this.lengthValue - this.cacheStart),
        );
        // A short read here means the underlying source ends inside the
        // window (e.g. the file shrank); report end of stream, don't spin.
        if (this.cache.length === 0)
          break;
      }
      const cacheOffset = this.positionValue - this.cacheStart;
      const n = Math.min(count - copied, this.cache.length - cacheOffset, this.lengthValue - this.positionValue);
      buffer.set(this.cache.subarray(cacheOffset, cacheOffset + n), offset + copied);
      this.positionValue += n;
      copied += n;
    }
    return copied;
  }

  /**
   * Write bytes to the stream. Not supported.
   */
  override write(_buffer: Uint8Array, _offset: number, _count: number): void {
    this.throwNotSupported('write');
  }

  /**
   * Set the position within the stream.
   *
   * @param offset The offset relative to `origin`.
   * @param origin The reference point used to obtain the new position.
   * @returns The new position within the stream.
   */
  override seek(offset: number, origin: SeekOrigin): number {
    const base = origin === 'begin' ? 0 : origin === 'current' ? this.positionValue : this.lengthValue;
    const target = base + offset;
    if (!Number.isInteger(target) || target < 0)
      throw new RangeError(`seek target ${target} must be a non-negative integer`);
    this.positionValue = target;
    return target;
  }

  /**
   * Flush the stream. A no-op for read-only streams.
   */
  override flush(): void {}

  /**
   * Set the length of the stream. Not supported.
   */
  override setLength(_value: number): void {
    this.throwNotSupported('setLength');
  }
}
