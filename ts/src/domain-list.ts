import { FormatOptions } from './format-options.js';
import { mimeError, ok, err, type Result } from './result.js';
import { punycodeDefault } from './encodings/punycode.js';
import punycode from 'punycode/punycode.js';
import {
  skipCommentsAndWhiteSpace,
  tryParseDomain,
  isInternational,
  type ParseCursor,
} from './utils/parse-utils.js';

const DOMAIN_SENTINELS = new Uint8Array([0x2c, 0x3a]);

function encodeRouteDomain(domain: string): string {
  return domain.split('.').map((label) => {
    if (!isInternational(label)) return label;
    try {
      return `xn--${punycode.encode(label.normalize('NFKC').toLowerCase())}`;
    } catch {
      return label;
    }
  }).join('.');
}

/**
 * Represents a list of route domains.
 */
export class DomainList implements Iterable<string> {
  /** Invoked when the domain list changes. */
  onChanged: (() => void) | null = null;
  private domains: string[];

  /**
   * Creates a new domain list.
   *
   * @param domains The domains to initialize the list with.
   * @throws {TypeError} `domains` is null.
   */
  constructor(domains?: Iterable<string>) {
    if (domains === null) {
      throw new TypeError('domains cannot be null');
    } else if (domains === undefined) {
      this.domains = [];
    } else {
      this.domains = Array.from(domains);
    }
  }

  /** The number of domains. */
  get count(): number {
    return this.domains.length;
  }

  /** Whether this list is read-only. */
  get isReadOnly(): boolean {
    return false;
  }

  /** Gets the domain at the specified index. */
  at(index: number): string {
    this.validateExistingIndex(index);
    return this.domains[index]!;
  }

  /** Sets the domain at the specified index. */
  set(index: number, domain: string): void {
    if (domain == null) throw new TypeError('domain cannot be null');
    this.validateExistingIndex(index);
    if (this.domains[index] === domain) return;
    this.domains[index] = domain;
    this.changed();
  }

  /** Gets the index of the requested domain, or `-1` if it is not found. */
  indexOf(domain: string): number {
    if (domain == null) throw new TypeError('domain cannot be null');
    return this.domains.indexOf(domain);
  }

  /** Inserts a domain at the specified index. */
  insert(index: number, domain: string): void {
    if (domain == null) throw new TypeError('domain cannot be null');
    if (!Number.isInteger(index) || index < 0 || index > this.domains.length)
      throw new RangeError('index out of range');
    this.domains.splice(index, 0, domain);
    this.changed();
  }

  /** Removes the domain at the specified index. */
  removeAt(index: number): void {
    this.validateExistingIndex(index);
    this.domains.splice(index, 1);
    this.changed();
  }

  /** Adds a domain to the list. */
  add(domain: string): void {
    if (domain == null) throw new TypeError('domain cannot be null');
    this.domains.push(domain);
    this.changed();
  }

  /** Removes all domains from the list. */
  clear(): void {
    this.domains.length = 0;
    this.changed();
  }

  /** Determines whether the list contains the specified domain. */
  contains(domain: string): boolean {
    if (domain == null) throw new TypeError('domain cannot be null');
    return this.domains.includes(domain);
  }

  /** Copies the domains to an array. */
  copyTo(array: string[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > array.length)
      throw new RangeError('arrayIndex out of range');
    if (array.length - arrayIndex < this.domains.length)
      throw new RangeError('array is too small');
    for (let i = 0; i < this.domains.length; i++)
      array[arrayIndex + i] = this.domains[i]!;
  }

  /** Removes a domain from the list. */
  remove(domain: string): boolean {
    if (domain == null) throw new TypeError('domain cannot be null');
    const index = this.domains.indexOf(domain);
    if (index === -1) return false;
    this.domains.splice(index, 1);
    this.changed();
    return true;
  }

  /**
   * Encodes the domain list.
   *
   * @param options The formatting options.
   * @returns The encoded domain list.
   */
  encode(options: FormatOptions): string {
    const builder: string[] = [];
    for (const domain of this.domains) {
      if (domain.trim().length === 0) continue;
      if (builder.length > 0) builder.push(',');
      builder.push('@');
      builder.push(!options.international && isInternational(domain) ? encodeRouteDomain(domain) : domain);
    }
    return builder.join('');
  }

  /** Serializes the domain list. */
  toString(): string {
    const builder: string[] = [];
    for (const domain of this.domains) {
      if (domain.trim().length === 0) continue;
      if (builder.length > 0) builder.push(',');
      builder.push('@', domain);
    }
    return builder.join('');
  }

  [Symbol.iterator](): Iterator<string> {
    return this.domains[Symbol.iterator]();
  }

  /**
   * Parses a domain list.
   *
   * @param text The text to parse.
   * @returns A {@link Result}; `{ ok: false }` with a `MimeError` on malformed input.
   */
  static parse(text: string | Uint8Array): Result<DomainList> {
    if (text == null) return err('argument-null', 'text cannot be null');
    const buffer = typeof text === 'string' ? new TextEncoder().encode(text) : text;
    const cursor = { index: 0 };
    const parsed = DomainList.tryParseInternal(buffer, cursor, buffer.length);
    if (!parsed.ok) return parsed;
    return ok(parsed.value);
  }

  /**
   * Attempts to parse a domain list from a byte range.
   *
   * @param buffer The input buffer.
   * @param cursor The current parse cursor.
   * @param endIndex The end index of the input range.
   * @returns A {@link Result}; `{ ok: false }` with a `MimeError` on malformed input.
   */
  static tryParseInternal(buffer: Uint8Array, cursor: ParseCursor, endIndex: number): Result<DomainList> {
    const domains: string[] = [];
    const startIndex = cursor.index;

    do {
      cursor.index++;

      if (cursor.index >= endIndex)
        return err(mimeError('incomplete-domain-list', `Incomplete domain-list at offset: ${startIndex}`, { offset: cursor.index }));

      const domain = tryParseDomain(buffer, cursor, endIndex, DOMAIN_SENTINELS);
      if (!domain.ok) return err(domain.error);
      domains.push(domain.value);

      do {
        const skip = skipCommentsAndWhiteSpace(buffer, cursor, endIndex);
        if (!skip.ok) return err(skip.error);

        if (cursor.index >= endIndex || buffer[cursor.index] !== 0x2c)
          break;

        cursor.index++;
      } while (true);

      const skip = skipCommentsAndWhiteSpace(buffer, cursor, endIndex);
      if (!skip.ok) return err(skip.error);
    } while (cursor.index < buffer.length && buffer[cursor.index] === 0x40);

    return ok(new DomainList(domains));
  }

  private validateExistingIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.domains.length)
      throw new RangeError('index out of range');
  }

  private changed(): void {
    this.onChanged?.();
  }
}
