import { Stream, type SeekOrigin } from './stream.js';

export class BoundStream extends Stream {
  private positionValue = 0;
  private disposed = false;
  private eos = false;

  readonly baseStream: Stream;
  readonly startBoundary: number;
  endBoundary: number;

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

  override get canRead(): boolean { return this.baseStream.canRead; }
  override get canWrite(): boolean { return this.baseStream.canWrite; }
  override get canSeek(): boolean { return this.baseStream.canSeek; }
  get canTimeout(): boolean { return false; }

  override get length(): number {
    this.checkDisposed();

    if (this.endBoundary !== -1)
      return this.endBoundary - this.startBoundary;
    if (this.eos)
      return this.positionValue;

    return this.baseStream.length - this.startBoundary;
  }

  override get position(): number { return this.positionValue; }
  override set position(value: number) { this.seek(value, 'begin'); }

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

  override flush(): void {
    this.checkDisposed();
    this.checkCanWrite();
    this.baseStream.flush();
  }

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

  override dispose(): void {
    if (!this.leaveOpen)
      this.baseStream.dispose();
    super.dispose();
    this.disposed = true;
  }
}
