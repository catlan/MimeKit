import { Stream } from '../io/stream.js';
import type { TnefReader } from './tnef-reader.js';

export class TnefReaderStream extends Stream {
  private disposed = false;

  constructor(
    private readonly reader: TnefReader,
    private readonly dataEndOffset: number,
    private readonly valueEndOffset: number,
  ) {
    super();
  }

  override get canRead(): boolean { return true; }
  override get canWrite(): boolean { return false; }
  override get canSeek(): boolean { return false; }
  override get length(): number { return this.throwNotSupported('length'); }
  override get position(): number { return this.throwNotSupported('seeking'); }
  override set position(_value: number) { this.throwNotSupported('seeking'); }

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

  override write(_buffer: Uint8Array, _offset: number, _count: number): void { this.throwNotSupported('writing'); }
  override seek(_offset: number, _origin: 'begin' | 'current' | 'end'): number { this.throwNotSupported('seeking'); }
  override flush(): void { this.throwNotSupported('writing'); }
  override setLength(_value: number): void { this.throwNotSupported('setLength'); }
  override dispose(): void { this.disposed = true; }
}
