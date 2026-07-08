// Port of MimeKit/Text/HtmlTagCallback.cs.

import type { HtmlTagContext } from './html-tag-context.js';
import type { HtmlWriter } from './html-writer.js';

/**
 * An HTML tag callback delegate. Called when a converter is ready to write a new
 * HTML tag, allowing callers to customize how the tag gets written.
 */
export type HtmlTagCallback = (tagContext: HtmlTagContext, htmlWriter: HtmlWriter) => void;
