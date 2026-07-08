// Port of MimeKit/Text/HtmlAttributeCollection.cs.

import { HtmlAttribute } from './html-attribute.js';
import { HtmlAttributeId, isHtmlAttributeId } from './html-attribute-id.js';

/** A readonly collection of HTML attributes. */
export class HtmlAttributeCollection implements Iterable<HtmlAttribute> {
  /** An empty attribute collection. */
  static readonly Empty = new HtmlAttributeCollection();

  private readonly attributes: HtmlAttribute[];

  /** Create a collection from an iterable of attributes (or empty when omitted). */
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

  /** Check if an attribute exists (by id or name). */
  contains(idOrName: HtmlAttributeId | string): boolean {
    return this.indexOf(idOrName) !== -1;
  }

  /** Get the index of a desired attribute (by id or name). */
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

  /** Get the attribute at the specified index. */
  get(index: number): HtmlAttribute {
    const attr = this.attributes[index];
    if (attr === undefined) throw new RangeError('index');
    return attr;
  }

  /** Get an attribute from the collection if it exists; otherwise null. */
  tryGetValue(idOrName: HtmlAttributeId | string): HtmlAttribute | null {
    const index = this.indexOf(idOrName);
    if (index === -1) return null;
    return this.attributes[index]!;
  }

  [Symbol.iterator](): Iterator<HtmlAttribute> {
    return this.attributes[Symbol.iterator]();
  }
}
