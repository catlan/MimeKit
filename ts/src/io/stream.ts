/**
 * Substrate shim for System.IO.Stream (not a port of a MimeKit file).
 *
 * MimeKit's IO layer subclasses .NET's Stream; the port mirrors the subset
 * MimeKit actually uses, synchronously, so ported stream/filter code stays
 * line-diffable against the C#. Async/timeout/cancellation members of the
 * .NET API are intentionally omitted (see plan: sync core, Web Streams
 * adapters at the edges). Byte buffers are Uint8Array.
 *
 * Contract violations (bad offsets/counts, unsupported operations) throw
 * RangeError/TypeError, mirroring C#'s ArgumentException/NotSupportedException.
 */

/**
 * The reference point used for seeking within a stream.
 */
export type SeekOrigin = 'begin' | 'current' | 'end';

export abstract class Stream {
  /** Whether the stream supports reading. */
  abstract get canRead(): boolean;
  /** Whether the stream supports writing. */
  abstract get canWrite(): boolean;
  /** Whether the stream supports seeking. */
  abstract get canSeek(): boolean;

  /** The length of the stream, in bytes. */
  abstract get length(): number;
  /** The current position within the stream. */
  abstract get position(): number;
  /** Set the current position within the stream. */
  abstract set position(value: number);

  /**
   * Read up to `count` bytes into `buffer` at `offset`; returns bytes read
   * (0 only at end of stream).
   */
  abstract read(buffer: Uint8Array, offset: number, count: number): number;

  /** Write `count` bytes from `buffer` starting at `offset`. */
  abstract write(buffer: Uint8Array, offset: number, count: number): void;

  /**
   * Set the position within the stream.
   *
   * @param offset The offset relative to `origin`.
   * @param origin The reference point used to obtain the new position.
   * @returns The new position within the stream.
   */
  abstract seek(offset: number, origin: SeekOrigin): number;

  /**
   * Flush any buffered data.
   */
  abstract flush(): void;

  /**
   * Set the length of the stream.
   *
   * @param value The desired length in bytes.
   */
  abstract setLength(value: number): void;

  /**
   * Copy data from this stream to another stream.
   *
   * @param destination The stream that will receive the copied data.
   * @param bufferSize The temporary buffer size to use while copying.
   */
  copyTo(destination: Stream, bufferSize = 4096): void {
    const buffer = new Uint8Array(bufferSize);
    let n: number;
    while ((n = this.read(buffer, 0, bufferSize)) > 0)
      destination.write(buffer, 0, n);
  }

  /** Release resources. Base implementation does nothing. */
  dispose(): void {}

  /**
   * Validate buffer, offset, and count arguments for stream read/write operations.
   *
   * @param buffer The buffer supplied by the caller.
   * @param offset The starting offset in the buffer.
   * @param count The number of bytes to read or write.
   * @throws {RangeError} `offset` or `count` does not specify a valid range in `buffer`.
   */
  protected static validateBufferArguments(buffer: Uint8Array, offset: number, count: number): void {
    if (!Number.isInteger(offset) || offset < 0 || offset > buffer.length)
      throw new RangeError(`offset ${offset} out of range [0, ${buffer.length}]`);
    if (!Number.isInteger(count) || count < 0 || count > buffer.length - offset)
      throw new RangeError(`count ${count} out of range [0, ${buffer.length - offset}]`);
  }

  /**
   * Throw for an unsupported stream operation.
   *
   * @param operation The unsupported operation name.
   * @throws {TypeError} Always thrown because the operation is unsupported.
   */
  protected throwNotSupported(operation: string): never {
    throw new TypeError(`${this.constructor.name} does not support ${operation}`);
  }
}

/**
 * Substrate shim for System.IO.MemoryStream: a growable, seekable in-memory
 * stream used pervasively by tests and by ported code that buffers content.
 */
export class MemoryStream extends Stream {
  private buffer: Uint8Array;
  private lengthValue = 0;
  private positionValue = 0;

  /**
   * Create a growable memory stream.
   *
   * @param initial Optional initial contents to copy into the stream.
   */
  constructor(initial?: Uint8Array) {
    super();
    if (initial) {
      this.buffer = initial.slice();
      this.lengthValue = initial.length;
    } else {
      this.buffer = new Uint8Array(256);
    }
  }

  /** Whether the stream supports reading. */
  override get canRead(): boolean { return true; }
  /** Whether the stream supports writing. */
  override get canWrite(): boolean { return true; }
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

  private ensureCapacity(capacity: number): void {
    if (capacity <= this.buffer.length)
      return;
    let newCapacity = Math.max(this.buffer.length * 2, 256);
    while (newCapacity < capacity)
      newCapacity *= 2;
    const grown = new Uint8Array(newCapacity);
    grown.set(this.buffer.subarray(0, this.lengthValue));
    this.buffer = grown;
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
    const available = this.lengthValue - this.positionValue;
    if (available <= 0)
      return 0;
    const n = Math.min(count, available);
    buffer.set(this.buffer.subarray(this.positionValue, this.positionValue + n), offset);
    this.positionValue += n;
    return n;
  }

  /**
   * Write bytes to the stream.
   *
   * @param buffer The buffer to write.
   * @param offset The offset of the first byte to write.
   * @param count The number of bytes to write.
   */
  override write(buffer: Uint8Array, offset: number, count: number): void {
    Stream.validateBufferArguments(buffer, offset, count);
    const end = this.positionValue + count;
    this.ensureCapacity(end);
    // Writing past the current length zero-fills any gap left by seeking.
    if (this.positionValue > this.lengthValue)
      this.buffer.fill(0, this.lengthValue, this.positionValue);
    this.buffer.set(buffer.subarray(offset, offset + count), this.positionValue);
    this.positionValue = end;
    if (end > this.lengthValue)
      this.lengthValue = end;
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
   * Flush the stream.
   */
  override flush(): void {}

  /**
   * Set the length of the stream.
   *
   * @param value The desired length in bytes.
   */
  override setLength(value: number): void {
    if (!Number.isInteger(value) || value < 0)
      throw new RangeError(`length ${value} must be a non-negative integer`);
    this.ensureCapacity(value);
    if (value > this.lengthValue)
      this.buffer.fill(0, this.lengthValue, value);
    this.lengthValue = value;
    if (this.positionValue > value)
      this.positionValue = value;
  }

  /**
   * The stream's contents as a copy.
   *
   * @returns The copied stream contents.
   */
  toArray(): Uint8Array {
    return this.buffer.slice(0, this.lengthValue);
  }
}
