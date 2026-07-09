import { HeaderList } from './header-list.js';

/**
 * Represents a collection of header-list groups.
 */
export class HeaderListCollection implements Iterable<HeaderList> {
  /** Invoked when the collection changes. */
  onChanged: (() => void) | null = null;
  private readonly groups: HeaderList[] = [];

  /** The number of header groups. */
  get count(): number { return this.groups.length; }
  /** The number of header groups. */
  get Count(): number { return this.count; }
  /** Whether this collection is read-only. */
  get isReadOnly(): boolean { return false; }
  /** Whether this collection is read-only. */
  get IsReadOnly(): boolean { return this.isReadOnly; }

  /**
   * Gets the header group at the specified index.
   *
   * @param index The index.
   * @returns The header group.
   * @throws {RangeError} `index` is out of range.
   */
  at(index: number): HeaderList {
    this.validateExistingIndex(index);
    return this.groups[index]!;
  }

  /**
   * Replaces the header group at the specified index.
   *
   * @param index The index.
   * @param headers The replacement header group.
   * @throws {TypeError} `headers` is null or undefined.
   * @throws {RangeError} `index` is out of range.
   */
  set(index: number, headers: HeaderList): void {
    this.validateExistingIndex(index);
    if (headers == null) throw new TypeError('headers cannot be null or undefined');
    if (this.groups[index] === headers)
      return;
    this.groups[index]!.onChanged = null;
    headers.onChanged = () => this.onChanged?.();
    this.groups[index] = headers;
  }

  /**
   * Adds a header group.
   *
   * @param headers The header group to add.
   * @throws {TypeError} `headers` is null or undefined.
   */
  add(headers: HeaderList): void {
    if (headers == null) throw new TypeError('headers cannot be null or undefined');
    headers.onChanged = () => this.onChanged?.();
    this.groups.push(headers);
    this.onChanged?.();
  }

  /** Removes all header groups. */
  clear(): void {
    for (const group of this.groups)
      group.onChanged = null;
    this.groups.length = 0;
    this.onChanged?.();
  }

  /**
   * Determines whether the collection contains the specified header group.
   *
   * @param headers The header group.
   * @returns `true` if the group is contained; otherwise, `false`.
   * @throws {TypeError} `headers` is null or undefined.
   */
  contains(headers: HeaderList): boolean {
    if (headers == null) throw new TypeError('headers cannot be null or undefined');
    return this.groups.includes(headers);
  }

  /**
   * Copies the header groups to an array.
   *
   * @param array The destination array.
   * @param arrayIndex The index into the array.
   * @throws {TypeError} `array` is null or undefined.
   * @throws {RangeError} `arrayIndex` is out of range or the array is too small.
   */
  copyTo(array: HeaderList[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null or undefined');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > array.length)
      throw new RangeError('arrayIndex out of range');
    if (array.length - arrayIndex < this.groups.length)
      throw new RangeError('array is too small');
    for (let i = 0; i < this.groups.length; i++)
      array[arrayIndex + i] = this.groups[i]!;
  }

  /**
   * Removes a header group.
   *
   * @param headers The header group to remove.
   * @returns `true` if the group was removed; otherwise, `false`.
   * @throws {TypeError} `headers` is null or undefined.
   */
  remove(headers: HeaderList): boolean {
    if (headers == null) throw new TypeError('headers cannot be null or undefined');
    const index = this.groups.indexOf(headers);
    if (index === -1)
      return false;
    headers.onChanged = null;
    this.groups.splice(index, 1);
    this.onChanged?.();
    return true;
  }

  [Symbol.iterator](): Iterator<HeaderList> {
    return this.groups[Symbol.iterator]();
  }

  private validateExistingIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.groups.length)
      throw new RangeError('index out of range');
  }
}
