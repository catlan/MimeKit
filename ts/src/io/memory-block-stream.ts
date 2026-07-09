/**
 * Port of MimeKit/IO/MemoryBlockStream.cs.
 *
 * Chains fixed-size blocks of non-contiguous memory instead of resizing one
 * array. The C# BufferPool (a GC optimization with no observable semantics)
 * is replaced by plain block allocation; JS engines always zero new arrays,
 * which matches the pool's cleared-buffer path.
 *
 * Error mapping: ObjectDisposedException → TypeError, ArgumentOutOfRange →
 * RangeError, IOException-equivalent runtime conditions → Error.
 */
import { Stream, type SeekOrigin } from './stream.js';

const BLOCK_SIZE = 2048;
// C#: MaxCapacity = int.MaxValue * BlockSize (exact, within Number.MAX_SAFE_INTEGER)
const MAX_CAPACITY = 2147483647 * BLOCK_SIZE;

/**
 * An efficient memory stream implementation that sacrifices direct access to the internal byte buffer
 * in order to improve performance.
 *
 * Instead of resizing one internal byte array, the stream chains blocks of non-contiguous memory.
 * This avoids copying old data into newly allocated arrays.
 */
export class MemoryBlockStream extends Stream {
  private readonly blocks: Uint8Array[] = [];
  private positionValue = 0;
  private lengthValue = 0;
  private disposed = false;

  /**
   * Create a memory block stream with an initial memory block of 2048 bytes.
   */
  constructor() {
    super();
    this.blocks.push(new Uint8Array(BLOCK_SIZE));
  }

  private checkDisposed(): void {
    if (this.disposed)
      throw new TypeError('MemoryBlockStream has been disposed');
  }

  /**
   * Copy the stream data into a newly allocated, contiguous byte array.
   *
   * @returns The copied array.
   */
  toArray(): Uint8Array {
    this.checkDisposed();

    const array = new Uint8Array(this.lengthValue);
    let need = this.lengthValue;
    let arrayIndex = 0;
    let nread = 0;
    let block = 0;

    while (nread < this.lengthValue) {
      const n = Math.min(BLOCK_SIZE, need);
      array.set(this.blocks[block]!.subarray(0, n), arrayIndex);
      arrayIndex += n;
      nread += n;
      need -= n;
      block++;
    }

    return array;
  }

  /**
   * Whether the stream supports reading.
   *
   * The memory block stream is always readable.
   */
  override get canRead(): boolean { return true; }
  /**
   * Whether the stream supports writing.
   *
   * The memory block stream is always writable.
   */
  override get canWrite(): boolean { return true; }
  /**
   * Whether the stream supports seeking.
   *
   * The memory block stream is always seekable.
   */
  override get canSeek(): boolean { return true; }

  /**
   * The length of the stream, in bytes.
   */
  override get length(): number {
    this.checkDisposed();
    return this.lengthValue;
  }

  /**
   * The current position within the stream.
   */
  override get position(): number {
    this.checkDisposed();
    return this.positionValue;
  }

  /**
   * Set the current position within the stream.
   */
  override set position(value: number) {
    this.seek(value, 'begin');
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
    this.checkDisposed();
    Stream.validateBufferArguments(buffer, offset, count);

    if (this.positionValue === MAX_CAPACITY)
      return 0;

    const max = Math.min(this.lengthValue - this.positionValue, count);
    let startIndex = this.positionValue % BLOCK_SIZE;
    let block = Math.floor(this.positionValue / BLOCK_SIZE);
    let nread = 0;

    while (nread < max && block < this.blocks.length) {
      const n = Math.min(BLOCK_SIZE - startIndex, max - nread);
      buffer.set(this.blocks[block]!.subarray(startIndex, startIndex + n), offset + nread);
      startIndex = 0;
      nread += n;
      block++;
    }

    this.positionValue += nread;

    return nread;
  }

  /**
   * Write bytes to the stream.
   *
   * @param buffer The buffer to write.
   * @param offset The offset of the first byte to write.
   * @param count The number of bytes to write.
   */
  override write(buffer: Uint8Array, offset: number, count: number): void {
    this.checkDisposed();
    Stream.validateBufferArguments(buffer, offset, count);

    if (this.positionValue + count >= MAX_CAPACITY)
      throw new Error(`Cannot exceed ${MAX_CAPACITY} bytes`);

    let startIndex = this.positionValue % BLOCK_SIZE;
    let capacity = this.blocks.length * BLOCK_SIZE;
    let block = Math.floor(this.positionValue / BLOCK_SIZE);
    let nwritten = 0;

    while (capacity < this.positionValue + count) {
      this.blocks.push(new Uint8Array(BLOCK_SIZE));
      capacity += BLOCK_SIZE;
    }

    while (nwritten < count) {
      const n = Math.min(BLOCK_SIZE - startIndex, count - nwritten);
      this.blocks[block]!.set(buffer.subarray(offset + nwritten, offset + nwritten + n), startIndex);
      startIndex = 0;
      nwritten += n;
      block++;
    }

    this.positionValue += nwritten;

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
    let real: number;

    this.checkDisposed();

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

    if (real < 0)
      throw new Error('Cannot seek to a position before the beginning of the stream');

    if (real > MAX_CAPACITY)
      throw new Error(`Cannot exceed ${MAX_CAPACITY} bytes`);

    if (real === this.positionValue)
      return this.positionValue;

    // C# TODO note kept: MemoryStream allows seeking past the end — MemoryBlockStream does not.
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
   * If the length is reduced, blocks no longer needed are released and truncated bytes are cleared.
   *
   * @param value The desired length in bytes.
   * @throws {RangeError} `value` is outside the valid range.
   */
  override setLength(value: number): void {
    this.checkDisposed();

    if (!Number.isInteger(value) || value < 0 || value > MAX_CAPACITY)
      throw new RangeError(`length ${value} out of range [0, ${MAX_CAPACITY}]`);

    let capacity = this.blocks.length * BLOCK_SIZE;

    if (value > capacity) {
      do {
        this.blocks.push(new Uint8Array(BLOCK_SIZE));
        capacity += BLOCK_SIZE;
      } while (capacity < value);
    } else if (value < this.lengthValue) {
      // shed any blocks that are no longer needed
      while (capacity - value > BLOCK_SIZE) {
        this.blocks.pop();
        capacity -= BLOCK_SIZE;
      }

      // reset the range of bytes between the new length and the old length to 0
      const count = Math.min(this.lengthValue, capacity) - value;
      const startIndex = value % BLOCK_SIZE;
      const block = Math.floor(value / BLOCK_SIZE);

      this.blocks[block]!.fill(0, startIndex, startIndex + count);
    }

    this.positionValue = Math.min(this.positionValue, value);
    this.lengthValue = value;
  }

  /**
   * Dispose the stream and release its blocks.
   */
  override dispose(): void {
    if (!this.disposed) {
      this.blocks.length = 0;
      this.disposed = true;
    }
  }
}
