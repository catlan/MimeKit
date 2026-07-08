import { HeaderList } from './header-list.js';

export class HeaderListCollection implements Iterable<HeaderList> {
  onChanged: (() => void) | null = null;
  private readonly groups: HeaderList[] = [];

  get count(): number { return this.groups.length; }
  get Count(): number { return this.count; }
  get isReadOnly(): boolean { return false; }
  get IsReadOnly(): boolean { return this.isReadOnly; }

  at(index: number): HeaderList {
    this.validateExistingIndex(index);
    return this.groups[index]!;
  }

  set(index: number, headers: HeaderList): void {
    this.validateExistingIndex(index);
    if (headers == null) throw new TypeError('headers cannot be null or undefined');
    if (this.groups[index] === headers)
      return;
    this.groups[index]!.onChanged = null;
    headers.onChanged = () => this.onChanged?.();
    this.groups[index] = headers;
  }

  add(headers: HeaderList): void {
    if (headers == null) throw new TypeError('headers cannot be null or undefined');
    headers.onChanged = () => this.onChanged?.();
    this.groups.push(headers);
    this.onChanged?.();
  }

  clear(): void {
    for (const group of this.groups)
      group.onChanged = null;
    this.groups.length = 0;
    this.onChanged?.();
  }

  contains(headers: HeaderList): boolean {
    if (headers == null) throw new TypeError('headers cannot be null or undefined');
    return this.groups.includes(headers);
  }

  copyTo(array: HeaderList[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null or undefined');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > array.length)
      throw new RangeError('arrayIndex out of range');
    if (array.length - arrayIndex < this.groups.length)
      throw new RangeError('array is too small');
    for (let i = 0; i < this.groups.length; i++)
      array[arrayIndex + i] = this.groups[i]!;
  }

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
