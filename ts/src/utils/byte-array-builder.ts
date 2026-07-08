export class ByteArrayBuilder {
  private buffer: Uint8Array;
  private _length = 0;
  private disposed = false;

  constructor(initialCapacity: number) {
    if (!Number.isInteger(initialCapacity) || initialCapacity < 0)
      throw new RangeError(`initialCapacity ${initialCapacity} out of range`);

    this.buffer = new Uint8Array(initialCapacity);
  }

  get length(): number {
    return this._length;
  }

  clear(): void {
    this.throwIfDisposed();
    this._length = 0;
  }

  append(c: number): void;
  append(text: Uint8Array, startIndex: number, count: number): void;
  append(value: number | Uint8Array, startIndex?: number, count?: number): void {
    this.throwIfDisposed();

    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < 0 || value > 255)
        throw new RangeError(`byte ${value} out of range [0, 255]`);

      this.ensureCapacity(this._length + 1);
      this.buffer[this._length++] = value;
      return;
    }

    if (!(value instanceof Uint8Array))
      throw new TypeError('text must be a Uint8Array');
    const index = startIndex;
    const length = count;

    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > value.length)
      throw new RangeError(`startIndex ${String(startIndex)} out of range [0, ${value.length}]`);
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 0 || length > value.length - index)
      throw new RangeError(`count ${String(count)} out of range [0, ${value.length - index}]`);

    this.ensureCapacity(this._length + length);
    this.buffer.set(value.subarray(index, index + length), this._length);
    this._length += length;
  }

  toArray(): Uint8Array {
    this.throwIfDisposed();
    return this.buffer.slice(0, this._length);
  }

  toString(encoding = 'utf-8'): string {
    this.throwIfDisposed();
    // TODO(wave-2): route through the real CharsetUtils/ParserOptions layer once charsets land.
    return new TextDecoder(encoding).decode(this.buffer.subarray(0, this._length));
  }

  equals(other: Uint8Array, comparisonType: 'ordinal' | 'ordinal-ignore-case' = 'ordinal'): boolean {
    this.throwIfDisposed();

    if (!(other instanceof Uint8Array))
      throw new TypeError('other must be a Uint8Array');
    if (other.length !== this._length)
      return false;

    for (let i = 0; i < this._length; i++) {
      let left = this.buffer[i];
      let right = other[i];

      if (comparisonType === 'ordinal-ignore-case') {
        left = toAsciiLower(left);
        right = toAsciiLower(right);
      } else if (comparisonType !== 'ordinal') {
        throw new TypeError(`unsupported comparisonType: ${comparisonType}`);
      }

      if (left !== right)
        return false;
    }

    return true;
  }

  dispose(): void {
    if (!this.disposed) {
      this.buffer = new Uint8Array(0);
      this._length = -1;
      this.disposed = true;
    }
  }

  private ensureCapacity(capacity: number): void {
    if (capacity <= this.buffer.length)
      return;

    const resized = new Uint8Array(capacity);
    resized.set(this.buffer.subarray(0, this._length), 0);
    this.buffer = resized;
  }

  private throwIfDisposed(): void {
    if (this.disposed)
      throw new TypeError('ByteArrayBuilder has been disposed');
  }
}

function toAsciiLower(c: number): number {
  if (c >= 0x41 && c <= 0x5a)
    return c + 0x20;

  return c;
}
