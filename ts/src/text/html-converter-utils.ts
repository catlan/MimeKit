import { HtmlAttribute } from './html-attribute.js';
import { HtmlAttributeCollection } from './html-attribute-collection.js';
import { HtmlAttributeId } from './html-attribute-id.js';
import type { HtmlTagCallback } from './html-tag-callback.js';
import { HtmlTagContext } from './html-tag-context.js';
import { HtmlTagId, isEmptyElement, toHtmlTagName } from './html-tag-id.js';
import { HtmlWriter } from './html-writer.js';
import { UrlPatterns } from './text-converter.js';
import { UrlScanner } from './url-scanner.js';

/**
 * Splits text into normalized LF-delimited lines.
 * @param text The text to split.
 * @returns The normalized lines.
 */
export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').slice(0, text.endsWith('\n') || text.endsWith('\r') ? -1 : undefined);
}

/**
 * Writes the current tag and its attributes to the HTML writer.
 * @param tagContext The HTML tag context.
 * @param htmlWriter The HTML writer.
 */
export function defaultHtmlTagCallback(tagContext: HtmlTagContext, htmlWriter: HtmlWriter): void {
  tagContext.writeTag(htmlWriter, true);
}

/** Synthetic HTML tag context used by text converters when creating generated tags. */
export class SyntheticHtmlTagContext extends HtmlTagContext {
  private readonly attrs: HtmlAttributeCollection;
  private endTag = false;

  /**
   * Creates a synthetic HTML tag context.
   *
   * @param tagId The generated tag identifier.
   * @param attr An optional generated attribute.
   */
  constructor(tagId: HtmlTagId, attr?: HtmlAttribute) {
    super(tagId);
    this.attrs = attr ? new HtmlAttributeCollection([attr]) : HtmlAttributeCollection.Empty;
  }

  /** The tag name. */
  override get tagName(): string { return toHtmlTagName(this.tagId); }
  /** The tag attributes. */
  override get attributes(): HtmlAttributeCollection { return this.attrs; }
  /** Whether this tag is an empty element tag. */
  override get isEmptyElementTag(): boolean { return this.tagId === HtmlTagId.Br; }
  /** Whether this tag context represents an end tag. */
  override get isEndTag(): boolean { return this.endTag; }

  /** Sets whether this context represents an end tag. */
  setIsEndTag(value: boolean): void { this.endTag = value; }
}

/**
 * Builds a URL scanner configured with the default text converter URL patterns.
 * @returns The configured URL scanner.
 */
export function buildUrlScanner(): UrlScanner {
  const scanner = new UrlScanner();
  for (const pattern of UrlPatterns) scanner.add(pattern);
  return scanner;
}

/**
 * Determines whether any context in the stack suppresses inner content.
 * @param stack The tag context stack.
 * @returns `true` if content should be suppressed; otherwise, `false`.
 */
export function suppressContent(stack: Array<{ suppressInnerContent: boolean }>): boolean {
  for (let i = stack.length; i > 0; i--) if (stack[i - 1]!.suppressInnerContent) return true;
  return false;
}

/**
 * Writes text to an HTML writer, converting detected URLs into links.
 * @param htmlWriter The HTML writer.
 * @param scanner The URL scanner.
 * @param text The text to write.
 * @param callback The tag callback used for generated link tags.
 */
export function writeLinkedText(
  htmlWriter: HtmlWriter,
  scanner: UrlScanner,
  text: string,
  callback: HtmlTagCallback,
): void {
  let startIndex = 0;
  const endIndex = text.length;
  do {
    const match = scanner.scan(text, startIndex, endIndex - startIndex);
    if (match !== null) {
      const count = match.endIndex - match.startIndex;
      if (match.startIndex > startIndex)
        htmlWriter.writeTextRange(text, startIndex, match.startIndex - startIndex);

      const href = match.prefix + text.substring(match.startIndex, match.endIndex);
      const ctx = new SyntheticHtmlTagContext(HtmlTagId.A, new HtmlAttribute(HtmlAttributeId.Href, href));
      callback(ctx, htmlWriter);
      if (!ctx.suppressInnerContent)
        htmlWriter.writeTextRange(text, match.startIndex, count);
      if (!ctx.deleteEndTag) {
        ctx.setIsEndTag(true);
        if (ctx.invokeCallbackForEndTag) callback(ctx, htmlWriter);
        else ctx.writeTag(htmlWriter);
      }
      startIndex = match.endIndex;
    } else {
      htmlWriter.writeTextRange(text, startIndex, endIndex - startIndex);
      break;
    }
  } while (startIndex < endIndex);
}

/**
 * Removes RFC 3676-style quote markers from a plain text line.
 * @param line The line to unquote.
 * @returns The unquoted line and quote depth.
 */
export function unquotePlain(line: string): { line: string; quoteDepth: number } {
  let index = 0;
  let quoteDepth = 0;
  if (line.length === 0 || line[0] !== '>') return { line, quoteDepth };
  do {
    quoteDepth++;
    index++;
    if (index < line.length && line[index] === ' ') index++;
  } while (index < line.length && line[index] === '>');
  return { line: line.substring(index), quoteDepth };
}

/**
 * Removes flowed-text quote markers from a line.
 * @param line The line to unquote.
 * @returns The unquoted line and quote depth.
 */
export function unquoteFlowed(line: string): { line: string; quoteDepth: number } {
  let index = 0;
  let quoteDepth = 0;
  while (index < line.length && line[index] === '>') {
    quoteDepth++;
    index++;
  }
  if (index > 0 && index < line.length && line[index] === ' ') index++;
  return index > 0 ? { line: line.substring(index), quoteDepth } : { line, quoteDepth };
}

/**
 * Writes closing tags for all synthetic tag contexts in the stack.
 * @param stack The synthetic tag context stack.
 * @param htmlWriter The HTML writer.
 * @param callback The tag callback.
 */
export function closeSyntheticStack(
  stack: SyntheticHtmlTagContext[],
  htmlWriter: HtmlWriter,
  callback: HtmlTagCallback,
): void {
  for (let i = stack.length; i > 0; i--) {
    const ctx = stack[i - 1]!;
    ctx.setIsEndTag(true);
    if (ctx.invokeCallbackForEndTag) callback(ctx, htmlWriter);
    else ctx.writeTag(htmlWriter);
  }
}

/**
 * Determines whether an HTML tag is an empty element.
 * @param id The HTML tag identifier.
 * @returns `true` if the tag is an empty element; otherwise, `false`.
 */
export function isHtmlEmptyElement(id: HtmlTagId): boolean {
  return isEmptyElement(id);
}
