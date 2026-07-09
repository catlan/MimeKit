// Port of MimeKit/Text/HtmlToken.cs.

import { HtmlTokenKind } from './html-token-kind.js';
import { HtmlAttribute } from './html-attribute.js';
import { HtmlAttributeCollection } from './html-attribute-collection.js';
import { HtmlTagId, toHtmlTagId } from './html-tag-id.js';
import { htmlAttributeEncode, htmlEncode } from './html-utils.js';
import type { TextWriter } from './text-io.js';
import { StringWriter } from './text-io.js';

/** An abstract HTML token class. */
export abstract class HtmlToken {
  /** The kind of HTML token that this object represents. */
  readonly kind: HtmlTokenKind;

  /**
   * Creates a new HTML token.
   *
   * @param kind The kind of token.
   */
  protected constructor(kind: HtmlTokenKind) {
    this.kind = kind;
  }

  /** Write the HTML token to a TextWriter. */
  abstract writeTo(output: TextWriter): void;

  /**
   * Returns a string that represents the current HTML token.
   *
   * @returns The serialized HTML token.
   */
  toString(): string {
    const output = new StringWriter();
    this.writeTo(output);
    return output.toString();
  }
}

/** An HTML comment token. */
export class HtmlCommentToken extends HtmlToken {
  /** The comment text. */
  readonly comment: string;
  /** Whether the comment is a bogus comment. */
  readonly isBogusComment: boolean;
  /** internal */
  isBangComment = false;

  /**
   * Creates a new HTML comment token.
   *
   * @param comment The comment text.
   * @param bogus `true` if the comment is bogus; otherwise, `false`.
   * @throws {TypeError} `comment` is `null` or `undefined`.
   */
  constructor(comment: string, bogus = false) {
    super(HtmlTokenKind.Comment);
    if (comment === null || comment === undefined) throw new TypeError('comment');
    this.isBogusComment = bogus;
    this.comment = comment;
  }

  /**
   * Writes the HTML comment to a text writer.
   *
   * @param output The output writer.
   * @throws {TypeError} `output` is `null` or `undefined`.
   */
  override writeTo(output: TextWriter): void {
    if (output === null || output === undefined) throw new TypeError('output');

    if (!this.isBogusComment) {
      output.write('<!--');
      output.write(this.comment);
      output.write('-->');
    } else {
      output.write('<');
      if (this.isBangComment) output.write('!');
      output.write(this.comment);
      output.write('>');
    }
  }
}

/** An HTML token consisting of character data. */
export class HtmlDataToken extends HtmlToken {
  /** internal */
  encodeEntities = false;
  /** The character data. */
  readonly data: string;

  /**
   * Creates a new HTML data token.
   *
   * @param kind The kind of character data.
   * @param data The character data.
   * @throws {RangeError} `kind` is not a character-data token kind.
   * @throws {TypeError} `data` is `null` or `undefined`.
   */
  constructor(kind: HtmlTokenKind, data: string);
  /**
   * Creates a new HTML data token.
   *
   * @param data The character data.
   * @throws {TypeError} `data` is `null` or `undefined`.
   */
  constructor(data: string);
  constructor(a: HtmlTokenKind | string, b?: string) {
    const kindForm = arguments.length >= 2;
    super(kindForm ? (a as HtmlTokenKind) : HtmlTokenKind.Data);

    if (kindForm) {
      const kind = a as HtmlTokenKind;
      switch (kind) {
        case HtmlTokenKind.ScriptData:
        case HtmlTokenKind.CData:
        case HtmlTokenKind.Data:
          break;
        default:
          throw new RangeError('kind');
      }
      const data = b as string;
      if (data === null || data === undefined) throw new TypeError('data');
      this.data = data;
    } else {
      const data = a as string;
      if (data === null || data === undefined) throw new TypeError('data');
      this.data = data;
    }
  }

  /**
   * Writes the HTML character data to a text writer, encoding it if needed.
   *
   * @param output The output writer.
   * @throws {TypeError} `output` is `null` or `undefined`.
   */
  override writeTo(output: TextWriter): void {
    if (output === null || output === undefined) throw new TypeError('output');

    if (!this.encodeEntities) {
      output.write(this.data);
      return;
    }

    htmlEncode(output, this.data);
  }
}

/** An HTML token consisting of [CDATA[. */
export class HtmlCDataToken extends HtmlDataToken {
  /**
   * Creates a new HTML CDATA token.
   *
   * @param data The character data.
   * @throws {TypeError} `data` is `null` or `undefined`.
   */
  constructor(data: string) {
    super(HtmlTokenKind.CData, data);
  }

  /**
   * Writes the HTML character data to a text writer.
   *
   * @param output The output writer.
   * @throws {TypeError} `output` is `null` or `undefined`.
   */
  override writeTo(output: TextWriter): void {
    if (output === null || output === undefined) throw new TypeError('output');

    output.write('<![CDATA[');
    output.write(this.data);
    output.write(']]>');
  }
}

/** An HTML token consisting of script data. */
export class HtmlScriptDataToken extends HtmlDataToken {
  /**
   * Creates a new HTML script data token.
   *
   * @param data The script data.
   * @throws {TypeError} `data` is `null` or `undefined`.
   */
  constructor(data: string) {
    super(HtmlTokenKind.ScriptData, data);
  }

  /**
   * Writes the HTML script data to a text writer.
   *
   * @param output The output writer.
   * @throws {TypeError} `output` is `null` or `undefined`.
   */
  override writeTo(output: TextWriter): void {
    if (output === null || output === undefined) throw new TypeError('output');

    output.write(this.data);
  }
}

/** An HTML tag token. */
export class HtmlTagToken extends HtmlToken {
  private idCache: HtmlTagId | undefined;
  /** The tag attributes. */
  readonly attributes: HtmlAttributeCollection;
  /** Whether this tag is an empty element tag. */
  isEmptyElement: boolean;
  /** Whether this tag is an end tag. */
  readonly isEndTag: boolean;
  /** The tag name. */
  readonly name: string;

  /**
   * Creates a new HTML start tag token.
   *
   * @param name The tag name.
   * @param attributes The tag attributes.
   * @param isEmptyElement `true` if the tag is an empty element; otherwise, `false`.
   * @throws {TypeError} `name` or `attributes` is `null` or `undefined`.
   */
  constructor(name: string, attributes: Iterable<HtmlAttribute>, isEmptyElement: boolean);
  /**
   * Creates a new HTML tag token.
   *
   * @param name The tag name.
   * @param isEndTag `true` if the tag is an end tag; otherwise, `false`.
   * @throws {TypeError} `name` is `null` or `undefined`.
   */
  constructor(name: string, isEndTag: boolean);
  constructor(name: string, b: Iterable<HtmlAttribute> | boolean, isEmptyElement?: boolean) {
    super(HtmlTokenKind.Tag);

    if (typeof b === 'boolean') {
      // (name, isEndTag)
      if (name === null || name === undefined) throw new TypeError('name');
      this.attributes = new HtmlAttributeCollection();
      this.isEndTag = b;
      this.isEmptyElement = false;
      this.name = name;
    } else {
      // (name, attributes, isEmptyElement)
      if (name === null || name === undefined) throw new TypeError('name');
      if (b === null || b === undefined) throw new TypeError('attributes');
      this.attributes = new HtmlAttributeCollection(b);
      this.isEmptyElement = isEmptyElement ?? false;
      this.isEndTag = false;
      this.name = name;
    }
  }

  /** The HTML tag identifier. */
  get id(): HtmlTagId {
    if (this.idCache === undefined) this.idCache = toHtmlTagId(this.name);
    return this.idCache;
  }

  /**
   * Writes the HTML tag to a text writer.
   *
   * @param output The output writer.
   * @throws {TypeError} `output` is `null` or `undefined`.
   */
  override writeTo(output: TextWriter): void {
    if (output === null || output === undefined) throw new TypeError('output');

    output.write('<');
    if (this.isEndTag) output.write('/');
    output.write(this.name);
    for (let i = 0; i < this.attributes.count; i++) {
      output.write(' ');
      output.write(this.attributes.get(i).name);

      const value = this.attributes.get(i).value;
      if (value !== null && value !== undefined) {
        output.write('=');
        htmlAttributeEncode(output, value);
      }
    }
    if (this.isEmptyElement) output.write('/');
    output.write('>');
  }
}

/** An HTML DOCTYPE token. */
export class HtmlDocTypeToken extends HtmlToken {
  private _publicIdentifier: string | null = null;
  private _systemIdentifier: string | null = null;

  /** internal */
  rawTagName = 'DOCTYPE';
  forceQuirksMode = false;
  /** The DOCTYPE name. */
  name: string | null = null;
  /** internal set */
  publicKeyword: string | null = null;
  /** internal set */
  systemKeyword: string | null = null;

  /** Creates a new HTML DOCTYPE token. */
  constructor() {
    super(HtmlTokenKind.DocType);
  }

  /** The DOCTYPE public identifier. */
  get publicIdentifier(): string | null {
    return this._publicIdentifier;
  }

  /** The DOCTYPE public identifier. */
  set publicIdentifier(value: string | null) {
    this._publicIdentifier = value;
    if (value !== null && value !== undefined) {
      if (this.publicKeyword === null) this.publicKeyword = 'PUBLIC';
    } else {
      if (this._systemIdentifier !== null) this.systemKeyword = 'SYSTEM';
    }
  }

  /** The DOCTYPE system identifier. */
  get systemIdentifier(): string | null {
    return this._systemIdentifier;
  }

  /** The DOCTYPE system identifier. */
  set systemIdentifier(value: string | null) {
    this._systemIdentifier = value;
    if (value !== null && value !== undefined) {
      if (this._publicIdentifier === null && this.systemKeyword === null) this.systemKeyword = 'SYSTEM';
    } else {
      this.systemKeyword = null;
    }
  }

  /**
   * Writes the HTML DOCTYPE to a text writer.
   *
   * @param output The output writer.
   * @throws {TypeError} `output` is `null` or `undefined`.
   */
  override writeTo(output: TextWriter): void {
    if (output === null || output === undefined) throw new TypeError('output');

    output.write('<!');
    output.write(this.rawTagName);
    if (this.name !== null && this.name !== undefined) {
      output.write(' ');
      output.write(this.name);
    }
    if (this._publicIdentifier !== null && this._publicIdentifier !== undefined) {
      output.write(' ');
      output.write(this.publicKeyword!);
      output.write(' "');
      output.write(this._publicIdentifier);
      output.write('"');
      if (this._systemIdentifier !== null && this._systemIdentifier !== undefined) {
        output.write(' "');
        output.write(this._systemIdentifier);
        output.write('"');
      }
    } else if (this._systemIdentifier !== null && this._systemIdentifier !== undefined) {
      output.write(' ');
      output.write(this.systemKeyword!);
      output.write(' "');
      output.write(this._systemIdentifier);
      output.write('"');
    }
    output.write('>');
  }
}
