// Port of MimeKit/Text/HtmlTagCallback.cs.

import type { HtmlTagContext } from './html-tag-context.js';
import type { HtmlWriter } from './html-writer.js';
/**
 * An HTML tag callback.
 * Called when a converter is ready to write a new HTML tag, allowing callers to customize whether the tag is written, which attributes are written, and related behavior.
 * @param tagContext The HTML tag context.
 * @param htmlWriter The HTML writer.
 */
export type HtmlTagCallback = (tagContext: HtmlTagContext, htmlWriter: HtmlWriter) => void;
