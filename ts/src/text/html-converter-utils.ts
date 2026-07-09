import { HtmlAttribute } from './html-attribute.js';
import { HtmlAttributeCollection } from './html-attribute-collection.js';
import { HtmlAttributeId } from './html-attribute-id.js';
import type { HtmlTagCallback } from './html-tag-callback.js';
import { HtmlTagContext } from './html-tag-context.js';
import { HtmlTagId, isEmptyElement, toHtmlTagName } from './html-tag-id.js';
import { HtmlWriter } from './html-writer.js';
import { UrlPatterns } from './text-converter.js';
import { UrlScanner } from './url-scanner.js';

export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').slice(0, text.endsWith('\n') || text.endsWith('\r') ? -1 : undefined);
}

export function defaultHtmlTagCallback(tagContext: HtmlTagContext, htmlWriter: HtmlWriter): void {
  tagContext.writeTag(htmlWriter, true);
}

export class SyntheticHtmlTagContext extends HtmlTagContext {
  private readonly attrs: HtmlAttributeCollection;
  private endTag = false;

  constructor(tagId: HtmlTagId, attr?: HtmlAttribute) {
    super(tagId);
    this.attrs = attr ? new HtmlAttributeCollection([attr]) : HtmlAttributeCollection.Empty;
  }

  override get tagName(): string { return toHtmlTagName(this.tagId); }
  override get attributes(): HtmlAttributeCollection { return this.attrs; }
  override get isEmptyElementTag(): boolean { return this.tagId === HtmlTagId.Br; }
  override get isEndTag(): boolean { return this.endTag; }

  setIsEndTag(value: boolean): void { this.endTag = value; }
}

export function buildUrlScanner(): UrlScanner {
  const scanner = new UrlScanner();
  for (const pattern of UrlPatterns) scanner.add(pattern);
  return scanner;
}

export function suppressContent(stack: Array<{ suppressInnerContent: boolean }>): boolean {
  for (let i = stack.length; i > 0; i--) if (stack[i - 1]!.suppressInnerContent) return true;
  return false;
}

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

export function isHtmlEmptyElement(id: HtmlTagId): boolean {
  return isEmptyElement(id);
}
