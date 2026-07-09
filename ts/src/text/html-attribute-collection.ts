// Port of MimeKit/Text/HtmlAttributeCollection.cs.

import { HtmlAttribute } from './html-attribute.js';
import { HtmlAttributeId, isHtmlAttributeId } from './html-attribute-id.js';

/** A readonly collection of HTML attributes. */
export class HtmlAttributeCollection implements Iterable<HtmlAttribute> {
  /** An empty attribute collection. */
  static readonly Empty = new HtmlAttributeCollection();

  private readonly attributes: HtmlAttribute[];

  /**
   * Create a collection from an iterable of attributes, or an empty collection when omitted.
   * @param collection A collection of attributes.
   * @throws {TypeError} `collection` is null or undefined.
   */
  constructor(collection?: Iterable<HtmlAttribute>) {
    if (arguments.length >= 1) {
      if (collection === null || collection === undefined) throw new TypeError('collection');
      this.attributes = [...collection];
    } else {
      this.attributes = [];
    }
  }

  /** Get the number of attributes in the collection. */
  get count(): number {
    return this.attributes.length;
  }

  /** internal */
  add(attribute: HtmlAttribute): void {
    if (attribute === null || attribute === undefined) throw new TypeError('attribute');
    this.attributes.push(attribute);
  }

  /**
   * Check if an attribute exists by id or name.
   * @param idOrName The attribute identifier or name.
   * @returns `true` if the attribute exists within the collection; otherwise, `false`.
   * @throws {TypeError} `idOrName` is null or undefined when treated as a name.
   */
  contains(idOrName: HtmlAttributeId | string): boolean {
    return this.indexOf(idOrName) !== -1;
  }

  /**
   * Get the index of a desired attribute by id or name.
   * @param idOrName The attribute identifier or name.
   * @returns The attribute index, or `-1` if the attribute is not found.
   * @throws {TypeError} `idOrName` is null or undefined when treated as a name.
   */
  indexOf(idOrName: HtmlAttributeId | string): number {
    if (isHtmlAttributeId(idOrName)) {
      for (let i = 0; i < this.attributes.length; i++) {
        if (this.attributes[i]!.id === idOrName) return i;
      }
      return -1;
    }

    const name = idOrName;
    if (name === null || name === undefined) throw new TypeError('name');
    const lower = name.toLowerCase();
    for (let i = 0; i < this.attributes.length; i++) {
      if (this.attributes[i]!.name.toLowerCase() === lower) return i;
    }
    return -1;
  }

  /**
   * Get the attribute at the specified index.
   * @param index The index.
   * @returns The HTML attribute at the specified index.
   * @throws {RangeError} `index` is out of range.
   */
  get(index: number): HtmlAttribute {
    const attr = this.attributes[index];
    if (attr === undefined) throw new RangeError('index');
    return attr;
  }

  /**
   * Get an attribute from the collection if it exists.
   * @param idOrName The attribute identifier or name.
   * @returns The attribute if found; otherwise, `null`.
   * @throws {TypeError} `idOrName` is null or undefined when treated as a name.
   */
  tryGetValue(idOrName: HtmlAttributeId | string): HtmlAttribute | null {
    const index = this.indexOf(idOrName);
    if (index === -1) return null;
    return this.attributes[index]!;
  }

  /** Get an iterator for the attribute collection. */
  [Symbol.iterator](): Iterator<HtmlAttribute> {
    return this.attributes[Symbol.iterator]();
  }
}
