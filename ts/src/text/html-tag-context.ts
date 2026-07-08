// Port of MimeKit/Text/HtmlTagContext.cs.

import type { HtmlAttributeCollection } from './html-attribute-collection.js';
import { HtmlTagId } from './html-tag-id.js';
import type { HtmlWriter } from './html-writer.js';

/** An HTML tag context used with the HtmlTagCallback delegate. */
export abstract class HtmlTagContext {
  readonly tagId: HtmlTagId;

  deleteEndTag = false;
  deleteTag = false;
  invokeCallbackForEndTag = false;
  suppressInnerContent = false;

  protected constructor(tagId: HtmlTagId) {
    this.tagId = tagId;
  }

  abstract get attributes(): HtmlAttributeCollection;
  abstract get isEmptyElementTag(): boolean;
  abstract get isEndTag(): boolean;
  abstract get tagName(): string;

  /** Write the HTML tag to the given HtmlWriter. */
  writeTag(htmlWriter: HtmlWriter, writeAttributes = false): void {
    if (htmlWriter === null || htmlWriter === undefined) throw new TypeError('htmlWriter');

    if (this.isEndTag) {
      htmlWriter.writeEndTag(this.tagName);
      return;
    }

    if (this.isEmptyElementTag) htmlWriter.writeEmptyElementTag(this.tagName);
    else htmlWriter.writeStartTag(this.tagName);

    if (writeAttributes) {
      for (let i = 0; i < this.attributes.count; i++) htmlWriter.writeAttribute(this.attributes.get(i));
    }
  }
}
