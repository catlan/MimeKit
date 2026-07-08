import { Stream, type SeekOrigin } from './stream.js';

export class ChainedStream extends Stream {
  private readonly streams: Stream[] = [];
  private readonly leaveOpen: boolean[] = [];
  private positionValue = 0;
  private disposed = false;
  private current = 0;
  private eos = false;

  add(stream: Stream, leaveOpen = false): void {
    if (!(stream instanceof Stream))
      throw new TypeError('stream must be a Stream');

    this.leaveOpen.push(leaveOpen);
    this.streams.push(stream);
    this.eos = false;
  }

  private checkDisposed(): void {
    if (this.disposed)
      throw new TypeError('ChainedStream has been disposed');
  }

  private checkCanSeek(): void {
    if (!this.canSeek)
      throw new TypeError('The stream does not support seeking');
  }

  private checkCanRead(): void {
    if (!this.canRead)
      throw new TypeError('The stream does not support reading');
  }

  private checkCanWrite(): void {
    if (!this.canWrite)
      throw new TypeError('The stream does not support writing');
  }

  override get canRead(): boolean { return this.streams.length > 0 && this.streams.every(stream => stream.canRead); }
  override get canWrite(): boolean { return this.streams.length > 0 && this.streams.every(stream => stream.canWrite); }
  override get canSeek(): boolean { return this.streams.length > 0 && this.streams.every(stream => stream.canSeek); }
  get canTimeout(): boolean { return false; }

  override get length(): number {
    this.checkDisposed();
    return this.streams.reduce((length, stream) => length + stream.length, 0);
  }

  override get position(): number { return this.positionValue; }
  override set position(value: number) { this.seek(value, 'begin'); }

  override read(buffer: Uint8Array, offset: number, count: number): number {
    this.checkDisposed();
    this.checkCanRead();
    Stream.validateBufferArguments(buffer, offset, count);

    if (count === 0 || this.eos)
      return 0;

    let nread = 0;

    while (this.current < this.streams.length) {
      let n: number;
      while (nread < count && (n = this.streams[this.current].read(buffer, offset + nread, count - nread)) > 0)
        nread += n;

      if (nread === count)
        break;

      this.current++;
    }

    if (nread > 0)
      this.positionValue += nread;
    else
      this.eos = true;

    return nread;
  }

  override write(buffer: Uint8Array, offset: number, count: number): void {
    this.checkDisposed();
    this.checkCanWrite();
    Stream.validateBufferArguments(buffer, offset, count);

    if (this.current >= this.streams.length)
      this.current = this.streams.length - 1;

    let nwritten = 0;

    while (this.current < this.streams.length && nwritten < count) {
      let n = count - nwritten;

      if (this.current + 1 < this.streams.length) {
        const left = this.streams[this.current].length - this.streams[this.current].position;
        if (left < n)
          n = left;
      }

      this.streams[this.current].write(buffer, offset + nwritten, n);
      this.positionValue += n;
      nwritten += n;

      if (nwritten < count) {
        this.streams[this.current].flush();
        this.current++;
      }
    }
  }

  override seek(offset: number, origin: SeekOrigin): number {
    this.checkDisposed();
    this.checkCanSeek();

    let length = -1;
    let real: number;

    switch (origin) {
      case 'begin':
        real = offset;
        break;
      case 'current':
        real = this.positionValue + offset;
        break;
      case 'end':
        length = this.length;
        real = length + offset;
        break;
      default:
        throw new RangeError('Invalid SeekOrigin specified');
    }

    if (!Number.isInteger(real) || real < 0)
      throw new Error('Cannot seek to a position before the beginning of the stream');
    if (real === this.positionValue)
      return this.positionValue;
    if (real > (length < 0 ? this.length : length))
      throw new Error('Cannot seek beyond the end of the stream');

    if (real > this.positionValue) {
      while (this.current < this.streams.length && this.positionValue < real) {
        const left = this.streams[this.current].length - this.streams[this.current].position;
        const n = Math.min(left, real - this.positionValue);

        this.streams[this.current].seek(n, 'current');
        this.positionValue += n;

        if (this.positionValue < real)
          this.current++;
      }

      this.eos = this.current >= this.streams.length;
    } else {
      const max = Math.min(this.streams.length - 1, this.current);
      let cur = 0;

      this.positionValue = 0;
      while (cur <= max) {
        length = this.streams[cur].length;

        if (real < this.positionValue + length) {
          this.streams[cur].seek(real - this.positionValue, 'begin');
          this.positionValue = real;
          break;
        }

        this.positionValue += length;
        cur++;
      }

      this.current = cur++;

      while (cur <= max)
        this.streams[cur++].seek(0, 'begin');

      this.eos = false;
    }

    return this.positionValue;
  }

  override flush(): void {
    this.checkDisposed();
    this.checkCanWrite();

    if (this.current < this.streams.length)
      this.streams[this.current].flush();
  }

  override setLength(_value: number): void {
    this.checkDisposed();
    throw new TypeError('Cannot set a length on the stream');
  }

  override dispose(): void {
    if (!this.disposed) {
      for (let i = 0; i < this.streams.length; i++) {
        if (!this.leaveOpen[i])
          this.streams[i].dispose();
      }
    }

    super.dispose();
    this.disposed = true;
  }
}
