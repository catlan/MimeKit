// Port of MimeKit/Text/HtmlAttribute.cs.

import { HtmlAttributeId, isHtmlAttributeId, toAttributeName, toHtmlAttributeId } from './html-attribute-id.js';
import { isValidAttributeName } from './html-utils.js';

/**
 * An HTML attribute.
 *
 * The C# (HtmlAttributeId, value) and (name, value) constructors collapse to a
 * single TS signature disambiguated by whether the first argument is an
 * HtmlAttributeId enum value. The internal name-only form (no validation) is
 * selected when `value` is omitted entirely.
 */
export class HtmlAttribute {
  private idCache: HtmlAttributeId | undefined;
  private readonly _name: string;
  /** Get the value of the attribute. */
  value: string | null;

  /**
   * Create an HTML attribute from an attribute identifier and value.
   * @param id The attribute identifier.
   * @param value The attribute value.
   * @throws {RangeError} `id` is not a valid HTML attribute identifier.
   */
  constructor(id: HtmlAttributeId, value: string | null);
  /**
   * Create an HTML attribute from an attribute name and value.
   * @param name The attribute name.
   * @param value The attribute value.
   * @throws {TypeError} `name` is null, undefined, empty, or invalid.
   */
  constructor(name: string, value: string | null);
  /** internal: name only, no validation (used by the tokenizer). */
  constructor(name: string);
  constructor(idOrName: HtmlAttributeId | string, value?: string | null) {
    if (arguments.length < 2) {
      // internal (name-only) constructor: no validation.
      this._name = idOrName as string;
      this.value = null;
      return;
    }

    if (isHtmlAttributeId(idOrName)) {
      if (idOrName === HtmlAttributeId.Unknown) throw new RangeError('id');

      this._name = toAttributeName(idOrName);
      this.value = value ?? null;
      this.idCache = idOrName;
      return;
    }

    const name = idOrName as string;
    if (name === null || name === undefined) throw new TypeError('name');
    if (name.length === 0) throw new TypeError('The attribute name cannot be empty.');
    if (!isValidAttributeName(name)) throw new TypeError('Invalid attribute name.');

    this.value = value ?? null;
    this._name = name;
  }

  /** Get the HTML attribute identifier. */
  get id(): HtmlAttributeId {
    if (this.idCache === undefined) this.idCache = toHtmlAttributeId(this._name);
    return this.idCache;
  }

  /** Get the name of the attribute. */
  get name(): string {
    return this._name;
  }
}
