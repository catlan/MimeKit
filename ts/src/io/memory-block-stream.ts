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

export class MemoryBlockStream extends Stream {
  private readonly blocks: Uint8Array[] = [];
  private positionValue = 0;
  private lengthValue = 0;
  private disposed = false;

  constructor() {
    super();
    this.blocks.push(new Uint8Array(BLOCK_SIZE));
  }

  private checkDisposed(): void {
    if (this.disposed)
      throw new TypeError('MemoryBlockStream has been disposed');
  }

  /** Copy the stream data into a newly allocated, contiguous byte array. */
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

  override get canRead(): boolean { return true; }
  override get canWrite(): boolean { return true; }
  override get canSeek(): boolean { return true; }

  override get length(): number {
    this.checkDisposed();
    return this.lengthValue;
  }

  override get position(): number {
    this.checkDisposed();
    return this.positionValue;
  }

  override set position(value: number) {
    this.seek(value, 'begin');
  }

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

  override flush(): void {
    this.checkDisposed();
  }

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

  override dispose(): void {
    if (!this.disposed) {
      this.blocks.length = 0;
      this.disposed = true;
    }
  }
}
