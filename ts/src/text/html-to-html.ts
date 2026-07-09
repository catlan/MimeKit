import { TextFormat } from '../text-part.js';
import { HeaderFooterFormat } from './header-footer-format.js';
import { HtmlAttributeCollection } from './html-attribute-collection.js';
import type { HtmlTagCallback } from './html-tag-callback.js';
import { HtmlTagContext } from './html-tag-context.js';
import { HtmlTagId, isEmptyElement } from './html-tag-id.js';
import { HtmlTokenKind } from './html-token-kind.js';
import { HtmlTagToken } from './html-token.js';
import { HtmlTokenizer } from './html-tokenizer.js';
import { HtmlWriter } from './html-writer.js';
import type { TextWriter } from './text-io.js';
import { TextConverter } from './text-converter.js';
import { defaultHtmlTagCallback, suppressContent } from './html-converter-utils.js';
import { TextToHtml } from './text-to-html.js';

class HtmlToHtmlTagContext extends HtmlTagContext {
  constructor(private readonly tag: HtmlTagToken) {
    super(tag.id);
  }

  override get tagName(): string { return this.tag.name; }
  override get attributes(): HtmlAttributeCollection { return this.tag.attributes; }
  override get isEmptyElementTag(): boolean { return this.tag.isEmptyElement || isEmptyElement(this.tag.id); }
  override get isEndTag(): boolean { return this.tag.isEndTag; }
}

function pop(stack: HtmlToHtmlTagContext[], name: string): HtmlToHtmlTagContext | null {
  const lower = name.toLowerCase();
  for (let i = stack.length; i > 0; i--) {
    if (stack[i - 1]!.tagName.toLowerCase() === lower) return stack.splice(i - 1, 1)[0]!;
  }
  return null;
}

function isUnsafe(id: HtmlTagId): boolean {
  switch (id) {
  case HtmlTagId.Unknown:
  case HtmlTagId.Applet:
  case HtmlTagId.Audio:
  case HtmlTagId.Form:
  case HtmlTagId.Frame:
  case HtmlTagId.FrameSet:
  case HtmlTagId.IFrame:
  case HtmlTagId.Object:
  case HtmlTagId.Script:
  case HtmlTagId.Select:
  case HtmlTagId.Style:
  case HtmlTagId.TextArea:
  case HtmlTagId.Video:
    return true;
  default:
    return false;
  }
}

/**
 * An HTML to HTML converter.
 *
 * Used to convert HTML into HTML.
 */
export class HtmlToHtml extends TextConverter {
  /** Gets or sets whether the converter should remove HTML comments from the output. */
  filterComments = false;
  /**
   * Gets or sets whether undesirable tags should be stripped from the output.
   *
   * This is an incomplete solution for protecting against Cross-Site Scripting
   * (XSS) attacks and should not be relied upon as a comprehensive security
   * measure. It only removes certain known dangerous or undesirable HTML tags and
   * does not validate attribute values, filter event handler attributes, sanitize
   * inline CSS, or protect against newly discovered XSS techniques. For robust
   * XSS protection, pass the HTML output through a dedicated sanitizer library.
   */
  filterHtml = false;
  /** Gets or sets the footer format. */
  footerFormat = HeaderFooterFormat.Text;
  /** Gets or sets the header format. */
  headerFormat = HeaderFooterFormat.Text;
  /** Gets or sets the callback used for custom filtering of HTML tags and content. */
  htmlTagCallback: HtmlTagCallback | null = null;

  /** The input format. */
  override get inputFormat(): TextFormat { return TextFormat.Html; }
  /** The output format. */
  override get outputFormat(): TextFormat { return TextFormat.Html; }

  private writeHeaderFooter(value: string, format: HeaderFooterFormat, writer: TextWriter): void {
    if (format === HeaderFooterFormat.Text) {
      const converter = new TextToHtml();
      converter.outputHtmlFragment = true;
      converter.convertText(value, writer);
    } else {
      writer.write(value);
    }
  }

  /**
   * Converts the text from the input format to the output format and writes the result.
   *
   * @param text The text to convert.
   * @param writer The text writer.
   * @throws {TypeError} `text` or `writer` is `null` or `undefined`.
   */
  override convertText(text: string, writer: TextWriter): void {
    if (text === null || text === undefined) throw new TypeError('text');
    if (writer === null || writer === undefined) throw new TypeError('writer');
    if (this.header) this.writeHeaderFooter(this.header, this.headerFormat, writer);

    const htmlWriter = new HtmlWriter(writer, true);
    const callback = this.htmlTagCallback ?? defaultHtmlTagCallback;
    const stack: HtmlToHtmlTagContext[] = [];
    const tokenizer = new HtmlTokenizer(text);
    tokenizer.decodeCharacterReferencesEnabled = false;

    for (let token = tokenizer.readNextToken(); token !== null; token = tokenizer.readNextToken()) {
      switch (token.kind) {
      case HtmlTokenKind.Comment:
        if (!this.filterComments && !suppressContent(stack)) htmlWriter.writeToken(token);
        break;
      case HtmlTokenKind.Tag: {
        const tag = token as HtmlTagToken;
        let ctx: HtmlToHtmlTagContext | null;
        if (!tag.isEndTag) {
          if (!tag.isEmptyElement) {
            ctx = new HtmlToHtmlTagContext(tag);
            if (this.filterHtml && isUnsafe(ctx.tagId)) {
              ctx.suppressInnerContent = true;
              ctx.deleteEndTag = true;
              ctx.deleteTag = true;
            } else if (!suppressContent(stack)) {
              callback(ctx, htmlWriter);
            }
            stack.push(ctx);
          } else if (!suppressContent(stack)) {
            ctx = new HtmlToHtmlTagContext(tag);
            if (!this.filterHtml || !isUnsafe(ctx.tagId)) callback(ctx, htmlWriter);
          }
        } else if ((ctx = pop(stack, tag.name)) !== null) {
          if (!suppressContent(stack)) {
            if (ctx.invokeCallbackForEndTag) {
              const endCtx = new HtmlToHtmlTagContext(tag);
              endCtx.invokeCallbackForEndTag = ctx.invokeCallbackForEndTag;
              endCtx.suppressInnerContent = ctx.suppressInnerContent;
              endCtx.deleteEndTag = ctx.deleteEndTag;
              endCtx.deleteTag = ctx.deleteTag;
              callback(endCtx, htmlWriter);
            } else if (!ctx.deleteEndTag) {
              htmlWriter.writeEndTag(tag.name);
            }
          }
        } else if (!suppressContent(stack)) {
          callback(new HtmlToHtmlTagContext(tag), htmlWriter);
        }
        break;
      }
      default:
        if (!suppressContent(stack)) htmlWriter.writeToken(token);
        break;
      }
    }

    htmlWriter.flush();
    if (this.footer) this.writeHeaderFooter(this.footer, this.footerFormat, writer);
  }
}
