import { Stream, type SeekOrigin } from './stream.js';

export class MeasuringStream extends Stream {
  private disposed = false;
  private positionValue = 0;
  private lengthValue = 0;

  private checkDisposed(): void {
    if (this.disposed)
      throw new TypeError('MeasuringStream has been disposed');
  }

  override get canRead(): boolean { return false; }
  override get canWrite(): boolean { return true; }
  override get canSeek(): boolean { return true; }
  get canTimeout(): boolean { return false; }

  override get length(): number {
    this.checkDisposed();
    return this.lengthValue;
  }

  override get position(): number { return this.positionValue; }
  override set position(value: number) { this.seek(value, 'begin'); }

  override read(_buffer: Uint8Array, _offset: number, _count: number): number {
    this.checkDisposed();
    throw new TypeError('The stream does not support reading');
  }

  override write(buffer: Uint8Array, offset: number, count: number): void {
    this.checkDisposed();
    Stream.validateBufferArguments(buffer, offset, count);

    this.positionValue += count;
    this.lengthValue = Math.max(this.lengthValue, this.positionValue);
  }

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

  override flush(): void {
    this.checkDisposed();
  }

  override setLength(value: number): void {
    this.checkDisposed();

    if (!Number.isInteger(value) || value < 0)
      throw new RangeError(`length ${value} out of range`);

    this.positionValue = Math.min(this.positionValue, value);
    this.lengthValue = value;
  }

  override dispose(): void {
    super.dispose();
    this.disposed = true;
  }
}
