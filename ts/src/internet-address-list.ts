import { FormatOptions } from './format-options.js';
import { ParserOptions } from './parser-options.js';
import { err, ok, type Result } from './result.js';
import {
  AddressParserFlags,
  InternetAddress,
  tryParseAddressListInternal,
  type LineState,
} from './internet-address.js';
import { MailboxAddress } from './mailbox-address.js';
import { GroupAddress } from './group-address.js';

const utf8Encoder = new TextEncoder();

/**
 * Represents a list of internet addresses.
 */
export class InternetAddressList implements Iterable<InternetAddress> {
  /** Invoked when the address list changes. */
  onChanged: (() => void) | null = null;
  private readonly list: InternetAddress[] = [];

  /** Creates a new internet address list. */
  constructor(addresses?: Iterable<InternetAddress>) {
    if (addresses === null) throw new TypeError('addresses cannot be null');
    if (addresses !== undefined) {
      for (const address of addresses)
        this.add(address);
    }
  }

  /** The number of addresses in the list. */
  get count(): number {
    return this.list.length;
  }

  /** Whether this list is read-only. */
  get isReadOnly(): boolean {
    return false;
  }

  /** Enumerates all mailbox addresses, including members of group addresses. */
  get mailboxes(): Iterable<MailboxAddress> {
    const self = this;
    return (function* () {
      for (const address of self.list) {
        if (address instanceof GroupAddress) {
          for (const mailbox of address.members.mailboxes)
            yield mailbox;
        } else {
          yield address as MailboxAddress;
        }
      }
    })();
  }

  /** Gets the address at the specified index. */
  at(index: number): InternetAddress {
    this.validateExistingIndex(index);
    return this.list[index]!;
  }

  /** Sets the address at the specified index. */
  set(index: number, address: InternetAddress): void {
    if (address == null) throw new TypeError('address cannot be null');
    this.validateExistingIndex(index);
    if (this.list[index] === address) return;
    this.detach(this.list[index]!);
    this.attach(address);
    this.list[index] = address;
    this.changed();
  }

  /** Gets the index of the requested address, or `-1` if it is not found. */
  indexOf(address: InternetAddress): number {
    if (address == null) throw new TypeError('address cannot be null');
    return this.list.indexOf(address);
  }

  /** Inserts an address at the specified index. */
  insert(index: number, address: InternetAddress): void {
    if (address == null) throw new TypeError('address cannot be null');
    if (!Number.isInteger(index) || index < 0 || index > this.list.length)
      throw new RangeError('index out of range');
    this.attach(address);
    this.list.splice(index, 0, address);
    this.changed();
  }

  /** Removes the address at the specified index. */
  removeAt(index: number): void {
    this.validateExistingIndex(index);
    this.detach(this.list[index]!);
    this.list.splice(index, 1);
    this.changed();
  }

  /** Adds an address to the list. */
  add(address: InternetAddress): void {
    if (address == null) throw new TypeError('address cannot be null');
    this.attach(address);
    this.list.push(address);
    this.changed();
  }

  /** Adds a sequence of addresses to the list. */
  addRange(addresses: Iterable<InternetAddress>): void {
    if (addresses == null) throw new TypeError('addresses cannot be null');
    let changed = false;
    for (const address of addresses) {
      if (address == null) throw new TypeError('address cannot be null');
      this.attach(address);
      this.list.push(address);
      changed = true;
    }
    if (changed) this.changed();
  }

  /** Removes all addresses from the list. */
  clear(): void {
    if (this.list.length === 0) return;
    for (const address of this.list)
      this.detach(address);
    this.list.length = 0;
    this.changed();
  }

  /** Determines whether the list contains the specified address. */
  contains(address: InternetAddress): boolean {
    if (address == null) throw new TypeError('address cannot be null');
    return this.list.includes(address);
  }

  /** Copies the addresses to an array. */
  copyTo(array: InternetAddress[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > array.length)
      throw new RangeError('arrayIndex out of range');
    if (array.length - arrayIndex < this.list.length)
      throw new RangeError('array is too small');
    for (let i = 0; i < this.list.length; i++)
      array[arrayIndex + i] = this.list[i]!;
  }

  /** Removes an address from the list. */
  remove(address: InternetAddress): boolean {
    if (address == null) throw new TypeError('address cannot be null');
    const index = this.list.indexOf(address);
    if (index === -1) return false;
    this.detach(address);
    this.list.splice(index, 1);
    this.changed();
    return true;
  }

  /** Determines whether this list equals another address list. */
  equals(other: InternetAddressList | null | undefined): boolean {
    if (other == null || other.count !== this.count) return false;
    for (let i = 0; i < this.count; i++) {
      if (!this.at(i).equals(other.at(i))) return false;
    }
    return true;
  }

  /** Compares this address list with another address list. */
  compareTo(other: InternetAddressList): number {
    if (other == null) throw new TypeError('other cannot be null');
    const n = Math.min(this.count, other.count);
    for (let i = 0; i < n; i++) {
      const rv = this.at(i).compareTo(other.at(i));
      if (rv !== 0) return rv;
    }
    return this.count - other.count;
  }

  /** Encodes the address list. */
  encode(options: FormatOptions, firstToken: boolean, state: LineState): string {
    let output = '';
    for (let i = 0; i < this.list.length; i++) {
      if (i > 0) {
        output += ', ';
        state.lineLength += 2;
      }
      output += this.list[i]!.encode(options, firstToken && i === 0, state);
    }
    return output;
  }

  /** Serializes the address list. */
  toString(options: FormatOptions = FormatOptions.default, encode = false): string {
    if (encode) {
      const state = { lineLength: 0 };
      return this.encode(options, true, state);
    }
    return this.list.map((address) => address.toString(options, false)).join(', ');
  }

  [Symbol.iterator](): Iterator<InternetAddress> {
    return this.list[Symbol.iterator]();
  }

  /**
   * Parses an internet address list.
   *
   * @returns A {@link Result}; `{ ok: false }` with a `MimeError` on malformed input.
   */
  static parse(text: string | Uint8Array, options: ParserOptions = ParserOptions.default): Result<InternetAddressList> {
    if (text == null)
      throw new TypeError('text cannot be null or undefined');
    const buffer = typeof text === 'string' ? utf8Encoder.encode(text) : text;
    const cursor = { index: 0 };
    const parsed = tryParseAddressListInternal(AddressParserFlags.Parse, options, buffer, cursor, buffer.length, false, 0);
    if (!parsed.ok) return err(parsed.error);
    return ok(new InternetAddressList(parsed.value));
  }

  /**
   * Parses an address list from a byte range.
   *
   * @returns A {@link Result}; `{ ok: false }` with a `MimeError` on malformed input.
   */
  static parseInternal(text: Uint8Array, cursor: { index: number }, endIndex: number, options: ParserOptions, isGroup: boolean, groupDepth: number): Result<InternetAddress[]> {
    return tryParseAddressListInternal(AddressParserFlags.Parse, options, text, cursor, endIndex, isGroup, groupDepth);
  }

  private attach(address: InternetAddress): void {
    address.onChanged = () => this.changed();
  }

  private detach(address: InternetAddress): void {
    if (address.onChanged !== null)
      address.onChanged = null;
  }

  private changed(): void {
    this.onChanged?.();
  }

  private validateExistingIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.list.length)
      throw new RangeError('index out of range');
  }
}
