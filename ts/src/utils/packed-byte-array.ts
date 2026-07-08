const INITIAL_BUFFER_SIZE = 64;

export class PackedByteArray {
  private buffer = new Uint16Array(INITIAL_BUFFER_SIZE);
  private lengthValue = 0;
  private cursor = -1;

  get count(): number {
    return this.lengthValue;
  }

  add(item: number): void {
    if (!Number.isInteger(item) || item < 0 || item > 255)
      throw new RangeError(`byte ${item} out of range [0, 255]`);

    if (
      this.cursor < 0 ||
      item !== (this.buffer[this.cursor] & 0xff) ||
      (this.buffer[this.cursor] & 0xff00) === 0xff00
    ) {
      this.ensureBufferSize(this.cursor + 2);
      this.buffer[++this.cursor] = (1 << 8) | item;
    } else {
      this.buffer[this.cursor] += 1 << 8;
    }

    this.lengthValue++;
  }

  clear(): void {
    this.cursor = -1;
    this.lengthValue = 0;
  }

  copyTo(array: Uint8Array, arrayIndex: number): void {
    if (!(array instanceof Uint8Array))
      throw new TypeError('array must be a Uint8Array');

    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex + this.lengthValue > array.length)
      throw new RangeError(`arrayIndex ${arrayIndex} out of range`);

    let index = arrayIndex;

    for (let i = 0; i <= this.cursor; i++) {
      const count = (this.buffer[i] >> 8) & 0xff;
      const c = this.buffer[i] & 0xff;

      for (let n = 0; n < count; n++)
        array[index++] = c;
    }
  }

  private ensureBufferSize(size: number): void {
    if (this.buffer.length > size)
      return;

    const ideal = (size + 63) & ~63;
    const resized = new Uint16Array(ideal);
    resized.set(this.buffer, 0);
    this.buffer = resized;
  }
}
