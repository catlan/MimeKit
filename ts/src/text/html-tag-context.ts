// Port of MimeKit/Text/HtmlTagContext.cs.

import type { HtmlAttributeCollection } from './html-attribute-collection.js';
import { HtmlTagId } from './html-tag-id.js';
import type { HtmlWriter } from './html-writer.js';

/** An HTML tag context used with the HtmlTagCallback delegate. */
export abstract class HtmlTagContext {
  /** Get the HTML tag identifier. */
  readonly tagId: HtmlTagId;

  /** Get or set whether the end tag should be deleted. */
  deleteEndTag = false;
  /** Get or set whether the tag should be deleted. */
  deleteTag = false;
  /** Get or set whether the {@link HtmlTagCallback} should be invoked for the end tag. */
  invokeCallbackForEndTag = false;
  /** Get or set whether the inner content of the tag should be suppressed. */
  suppressInnerContent = false;

  /**
   * Create an HTML tag context.
   * @param tagId The HTML tag identifier.
   */
  protected constructor(tagId: HtmlTagId) {
    this.tagId = tagId;
  }

  /** Get the HTML tag attributes. */
  abstract get attributes(): HtmlAttributeCollection;
  /** Get whether the tag is an empty element tag. */
  abstract get isEmptyElementTag(): boolean;
  /** Get whether the tag is an end tag. */
  abstract get isEndTag(): boolean;
  /** Get the HTML tag name. */
  abstract get tagName(): string;

  /**
   * Write the HTML tag to the given HTML writer.
   * @param htmlWriter The HTML writer.
   * @param writeAttributes `true` to write attributes; otherwise, `false`.
   * @throws {TypeError} `htmlWriter` is null or undefined.
   */
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
