// Port of MimeKit/MessageIdList.cs.
//
// A list of Message-Ids used by MimeMessage.References. Values are stored
// without their surrounding angle brackets (ValidateMessageId strips a single
// <...> pair); ToString() re-wraps each in angle brackets.

export class MessageIdList implements Iterable<string> {
  /** C#: internal event Changed. */
  onChanged: (() => void) | null = null;

  private readonly references: string[] = [];

  clone(): MessageIdList {
    const clone = new MessageIdList();
    for (let i = 0; i < this.references.length; i++)
      clone.references.push(this.references[i]!);
    return clone;
  }

  get count(): number {
    return this.references.length;
  }

  get isReadOnly(): boolean {
    return false;
  }

  at(index: number): string {
    return this.references[this.validateExistingIndex(index)]!;
  }

  set(index: number, value: string): void {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    this.validateExistingIndex(index);
    if (this.references[index] === value)
      return;
    this.references[index] = validateMessageId(value);
    this.changed();
  }

  indexOf(messageId: string): number {
    if (messageId == null) throw new TypeError('messageId cannot be null or undefined');
    return this.references.indexOf(messageId);
  }

  insert(index: number, messageId: string): void {
    if (!Number.isInteger(index) || index < 0 || index > this.references.length)
      throw new RangeError('index out of range');
    if (messageId == null) throw new TypeError('messageId cannot be null or undefined');
    this.references.splice(index, 0, validateMessageId(messageId));
    this.changed();
  }

  removeAt(index: number): void {
    this.validateExistingIndex(index);
    this.references.splice(index, 1);
    this.changed();
  }

  add(messageId: string): void {
    if (messageId == null) throw new TypeError('messageId cannot be null or undefined');
    this.references.push(validateMessageId(messageId));
    this.changed();
  }

  addRange(items: Iterable<string>): void {
    if (items == null) throw new TypeError('items cannot be null or undefined');
    for (const msgid of items)
      this.references.push(validateMessageId(msgid));
    this.changed();
  }

  clear(): void {
    this.references.length = 0;
    this.changed();
  }

  contains(messageId: string): boolean {
    if (messageId == null) throw new TypeError('messageId cannot be null or undefined');
    return this.references.includes(messageId);
  }

  copyTo(array: string[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null or undefined');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > array.length)
      throw new RangeError('arrayIndex out of range');
    for (let i = 0; i < this.references.length; i++)
      array[arrayIndex + i] = this.references[i]!;
  }

  remove(messageId: string): boolean {
    if (messageId == null) throw new TypeError('messageId cannot be null or undefined');
    const index = this.references.indexOf(messageId);
    if (index === -1)
      return false;
    this.references.splice(index, 1);
    this.changed();
    return true;
  }

  toString(): string {
    let builder = '';
    for (let i = 0; i < this.references.length; i++) {
      if (builder.length > 0)
        builder += ' ';
      builder += `<${this.references[i]}>`;
    }
    return builder;
  }

  [Symbol.iterator](): Iterator<string> {
    return this.references[Symbol.iterator]();
  }

  private validateExistingIndex(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.references.length)
      throw new RangeError('index out of range');
    return index;
  }

  private changed(): void {
    this.onChanged?.();
  }
}

function validateMessageId(messageId: string): string {
  if (messageId.length < 2 || messageId[0] !== '<' || messageId[messageId.length - 1] !== '>')
    return messageId;
  return messageId.substring(1, messageId.length - 1);
}
