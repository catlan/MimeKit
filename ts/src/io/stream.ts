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

export type SeekOrigin = 'begin' | 'current' | 'end';

export abstract class Stream {
  abstract get canRead(): boolean;
  abstract get canWrite(): boolean;
  abstract get canSeek(): boolean;

  abstract get length(): number;
  abstract get position(): number;
  abstract set position(value: number);

  /**
   * Read up to `count` bytes into `buffer` at `offset`; returns bytes read
   * (0 only at end of stream).
   */
  abstract read(buffer: Uint8Array, offset: number, count: number): number;

  /** Write `count` bytes from `buffer` starting at `offset`. */
  abstract write(buffer: Uint8Array, offset: number, count: number): void;

  abstract seek(offset: number, origin: SeekOrigin): number;

  abstract flush(): void;

  abstract setLength(value: number): void;

  /** Read the remainder of the stream into a single buffer. */
  copyTo(destination: Stream, bufferSize = 4096): void {
    const buffer = new Uint8Array(bufferSize);
    let n: number;
    while ((n = this.read(buffer, 0, bufferSize)) > 0)
      destination.write(buffer, 0, n);
  }

  /** Release resources. Base implementation does nothing. */
  dispose(): void {}

  protected static validateBufferArguments(buffer: Uint8Array, offset: number, count: number): void {
    if (!Number.isInteger(offset) || offset < 0 || offset > buffer.length)
      throw new RangeError(`offset ${offset} out of range [0, ${buffer.length}]`);
    if (!Number.isInteger(count) || count < 0 || count > buffer.length - offset)
      throw new RangeError(`count ${count} out of range [0, ${buffer.length - offset}]`);
  }

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

  constructor(initial?: Uint8Array) {
    super();
    if (initial) {
      this.buffer = initial.slice();
      this.lengthValue = initial.length;
    } else {
      this.buffer = new Uint8Array(256);
    }
  }

  override get canRead(): boolean { return true; }
  override get canWrite(): boolean { return true; }
  override get canSeek(): boolean { return true; }

  override get length(): number { return this.lengthValue; }

  override get position(): number { return this.positionValue; }
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

  override seek(offset: number, origin: SeekOrigin): number {
    const base = origin === 'begin' ? 0 : origin === 'current' ? this.positionValue : this.lengthValue;
    const target = base + offset;
    if (!Number.isInteger(target) || target < 0)
      throw new RangeError(`seek target ${target} must be a non-negative integer`);
    this.positionValue = target;
    return target;
  }

  override flush(): void {}

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

  /** The stream's contents as a copy (C#: MemoryStream.ToArray). */
  toArray(): Uint8Array {
    return this.buffer.slice(0, this.lengthValue);
  }
}
