// Port of MimeKit/MessageIdList.cs.
//
// A list of Message-Ids used by MimeMessage.References. Values are stored
// without their surrounding angle brackets (ValidateMessageId strips a single
// <...> pair); ToString() re-wraps each in angle brackets.

/**
 * Represents a list of `Message-Id` values.
 */
export class MessageIdList implements Iterable<string> {
  /** C#: internal event Changed. */
  onChanged: (() => void) | null = null;

  private readonly references: string[] = [];

  /**
   * Clones this message-id list.
   *
   * @returns An exact copy of the message-id list.
   */
  clone(): MessageIdList {
    const clone = new MessageIdList();
    for (let i = 0; i < this.references.length; i++)
      clone.references.push(this.references[i]!);
    return clone;
  }

  /** The number of message ids. */
  get count(): number {
    return this.references.length;
  }

  /** Whether this list is read-only. */
  get isReadOnly(): boolean {
    return false;
  }

  /**
   * Gets the message id at the specified index.
   *
   * @param index The index.
   * @returns The message id.
   * @throws {RangeError} `index` is out of range.
   */
  at(index: number): string {
    return this.references[this.validateExistingIndex(index)]!;
  }

  /**
   * Sets the message id at the specified index.
   *
   * @param index The index.
   * @param value The message id.
   * @throws {TypeError} `value` is null or undefined.
   * @throws {RangeError} `index` is out of range.
   */
  set(index: number, value: string): void {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    this.validateExistingIndex(index);
    if (this.references[index] === value)
      return;
    this.references[index] = validateMessageId(value);
    this.changed();
  }

  /**
   * Gets the index of the requested message id.
   *
   * @param messageId The message id.
   * @returns The index of the message id, or `-1` if it is not found.
   * @throws {TypeError} `messageId` is null or undefined.
   */
  indexOf(messageId: string): number {
    if (messageId == null) throw new TypeError('messageId cannot be null or undefined');
    return this.references.indexOf(messageId);
  }

  /**
   * Inserts a message id at the specified index.
   *
   * @param index The insertion index.
   * @param messageId The message id to insert.
   * @throws {TypeError} `messageId` is null or undefined.
   * @throws {RangeError} `index` is out of range.
   */
  insert(index: number, messageId: string): void {
    if (!Number.isInteger(index) || index < 0 || index > this.references.length)
      throw new RangeError('index out of range');
    if (messageId == null) throw new TypeError('messageId cannot be null or undefined');
    this.references.splice(index, 0, validateMessageId(messageId));
    this.changed();
  }

  /**
   * Removes the message id at the specified index.
   *
   * @param index The index.
   * @throws {RangeError} `index` is out of range.
   */
  removeAt(index: number): void {
    this.validateExistingIndex(index);
    this.references.splice(index, 1);
    this.changed();
  }

  /**
   * Adds a message id.
   *
   * @param messageId The message id.
   * @throws {TypeError} `messageId` is null or undefined.
   */
  add(messageId: string): void {
    if (messageId == null) throw new TypeError('messageId cannot be null or undefined');
    this.references.push(validateMessageId(messageId));
    this.changed();
  }

  /**
   * Adds a sequence of message ids.
   *
   * @param items The message ids to add.
   * @throws {TypeError} `items` is null or undefined.
   */
  addRange(items: Iterable<string>): void {
    if (items == null) throw new TypeError('items cannot be null or undefined');
    for (const msgid of items)
      this.references.push(validateMessageId(msgid));
    this.changed();
  }

  /** Removes all message ids. */
  clear(): void {
    this.references.length = 0;
    this.changed();
  }

  /**
   * Determines whether the list contains the specified message id.
   *
   * @param messageId The message id.
   * @returns `true` if the message id is contained; otherwise, `false`.
   * @throws {TypeError} `messageId` is null or undefined.
   */
  contains(messageId: string): boolean {
    if (messageId == null) throw new TypeError('messageId cannot be null or undefined');
    return this.references.includes(messageId);
  }

  /**
   * Copies the message ids to an array.
   *
   * @param array The destination array.
   * @param arrayIndex The index into the array.
   * @throws {TypeError} `array` is null or undefined.
   * @throws {RangeError} `arrayIndex` is out of range.
   */
  copyTo(array: string[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null or undefined');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > array.length)
      throw new RangeError('arrayIndex out of range');
    for (let i = 0; i < this.references.length; i++)
      array[arrayIndex + i] = this.references[i]!;
  }

  /**
   * Removes a message id.
   *
   * @param messageId The message id.
   * @returns `true` if the message id was removed; otherwise, `false`.
   * @throws {TypeError} `messageId` is null or undefined.
   */
  remove(messageId: string): boolean {
    if (messageId == null) throw new TypeError('messageId cannot be null or undefined');
    const index = this.references.indexOf(messageId);
    if (index === -1)
      return false;
    this.references.splice(index, 1);
    this.changed();
    return true;
  }

  /**
   * Serializes this list as a space-separated `References` header value.
   *
   * @returns A string representing this message-id list.
   */
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
