// Port of MimeKit/Cryptography/CmsRecipientCollection.cs.

import type { CmsRecipient } from './cms-recipient.js';

/**
 * A collection of {@link CmsRecipient} objects (C#: `ICollection<CmsRecipient>`).
 */
export class CmsRecipientCollection implements Iterable<CmsRecipient> {
  private readonly recipients: CmsRecipient[] = [];

  /** The number of recipients in the collection. */
  get count(): number {
    return this.recipients.length;
  }

  /** A recipient collection is never read-only. */
  get isReadOnly(): boolean {
    return false;
  }

  /** Adds a recipient. */
  add(recipient: CmsRecipient): void {
    if (recipient == null) throw new TypeError('recipient cannot be null or undefined');
    this.recipients.push(recipient);
  }

  /** Removes all recipients from the collection. */
  clear(): void {
    this.recipients.length = 0;
  }

  /** Determines whether the collection contains the specified recipient. */
  contains(recipient: CmsRecipient): boolean {
    if (recipient == null) throw new TypeError('recipient cannot be null or undefined');
    return this.recipients.includes(recipient);
  }

  /** Copies all recipients into the array starting at the specified index. */
  copyTo(array: CmsRecipient[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null or undefined');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex + this.count > array.length)
      throw new RangeError(`arrayIndex ${arrayIndex} is out of range`);
    for (let i = 0; i < this.recipients.length; i++) array[arrayIndex + i] = this.recipients[i]!;
  }

  /** Removes the specified recipient. Returns `true` if it was removed. */
  remove(recipient: CmsRecipient): boolean {
    if (recipient == null) throw new TypeError('recipient cannot be null or undefined');
    const index = this.recipients.indexOf(recipient);
    if (index < 0) return false;
    this.recipients.splice(index, 1);
    return true;
  }

  [Symbol.iterator](): Iterator<CmsRecipient> {
    return this.recipients[Symbol.iterator]();
  }
}
