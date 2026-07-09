// Port of MimeKit/Text/CharBuffer.cs.
//
// A growable UTF-16 char buffer. The port stores chars as a plain array of
// single-character strings (matching C#'s char[] semantics: one entry per
// UTF-16 code unit). Kept as a small helper for the tokenizer.

/** A growable UTF-16 character buffer used by the HTML tokenizer. */
export class CharBuffer {
  private buffer: string[];
  /** Get or set the number of UTF-16 code units in the buffer. */
  length = 0;

  /**
   * Create a character buffer.
   * @param capacity The initial capacity.
   */
  constructor(capacity: number) {
    this.buffer = new Array<string>(capacity);
  }

  /**
   * Get the character at the specified index.
   * @param index The index.
   * @returns The character at the specified index.
   */
  get(index: number): string {
    return this.buffer[index]!;
  }

  /**
   * Set the character at the specified index.
   * @param index The index.
   * @param value The character value.
   */
  set(index: number, value: string): void {
    this.buffer[index] = value;
  }

  private ensureCapacity(length: number): void {
    if (length < this.buffer.length) return;

    let capacity = this.buffer.length << 1;
    while (capacity <= length) capacity <<= 1;

    // JS arrays grow automatically; this mirrors the C# doubling only to keep
    // parity with the reference (no observable effect).
    this.buffer.length = capacity;
  }

  /**
   * Append the value to the buffer.
   * @param value The string or character to append.
   */
  append(value: string): void {
    // value is either a single char or a string; append all its code units.
    this.ensureCapacity(this.length + value.length);
    for (let i = 0; i < value.length; i++) this.buffer[this.length++] = value[i]!;
  }

  /** Convert the buffer contents to a string. */
  toString(): string {
    let s = '';
    for (let i = 0; i < this.length; i++) s += this.buffer[i];
    return s;
  }
}
