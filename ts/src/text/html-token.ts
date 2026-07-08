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
  readonly kind: HtmlTokenKind;

  protected constructor(kind: HtmlTokenKind) {
    this.kind = kind;
  }

  /** Write the HTML token to a TextWriter. */
  abstract writeTo(output: TextWriter): void;

  toString(): string {
    const output = new StringWriter();
    this.writeTo(output);
    return output.toString();
  }
}

/** An HTML comment token. */
export class HtmlCommentToken extends HtmlToken {
  readonly comment: string;
  readonly isBogusComment: boolean;
  /** internal */
  isBangComment = false;

  constructor(comment: string, bogus = false) {
    super(HtmlTokenKind.Comment);
    if (comment === null || comment === undefined) throw new TypeError('comment');
    this.isBogusComment = bogus;
    this.comment = comment;
  }

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
  readonly data: string;

  constructor(kind: HtmlTokenKind, data: string);
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
  constructor(data: string) {
    super(HtmlTokenKind.CData, data);
  }

  override writeTo(output: TextWriter): void {
    if (output === null || output === undefined) throw new TypeError('output');

    output.write('<![CDATA[');
    output.write(this.data);
    output.write(']]>');
  }
}

/** An HTML token consisting of script data. */
export class HtmlScriptDataToken extends HtmlDataToken {
  constructor(data: string) {
    super(HtmlTokenKind.ScriptData, data);
  }

  override writeTo(output: TextWriter): void {
    if (output === null || output === undefined) throw new TypeError('output');

    output.write(this.data);
  }
}

/** An HTML tag token. */
export class HtmlTagToken extends HtmlToken {
  private idCache: HtmlTagId | undefined;
  readonly attributes: HtmlAttributeCollection;
  /** internal set */
  isEmptyElement: boolean;
  readonly isEndTag: boolean;
  readonly name: string;

  constructor(name: string, attributes: Iterable<HtmlAttribute>, isEmptyElement: boolean);
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

  /** Get the HTML tag identifier. */
  get id(): HtmlTagId {
    if (this.idCache === undefined) this.idCache = toHtmlTagId(this.name);
    return this.idCache;
  }

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
  name: string | null = null;
  /** internal set */
  publicKeyword: string | null = null;
  /** internal set */
  systemKeyword: string | null = null;

  constructor() {
    super(HtmlTokenKind.DocType);
  }

  get publicIdentifier(): string | null {
    return this._publicIdentifier;
  }

  set publicIdentifier(value: string | null) {
    this._publicIdentifier = value;
    if (value !== null && value !== undefined) {
      if (this.publicKeyword === null) this.publicKeyword = 'PUBLIC';
    } else {
      if (this._systemIdentifier !== null) this.systemKeyword = 'SYSTEM';
    }
  }

  get systemIdentifier(): string | null {
    return this._systemIdentifier;
  }

  set systemIdentifier(value: string | null) {
    this._systemIdentifier = value;
    if (value !== null && value !== undefined) {
      if (this._publicIdentifier === null && this.systemKeyword === null) this.systemKeyword = 'SYSTEM';
    } else {
      this.systemKeyword = null;
    }
  }

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
