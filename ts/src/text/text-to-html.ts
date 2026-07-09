import { TextFormat } from '../text-part.js';
import { HeaderFooterFormat } from './header-footer-format.js';
import type { HtmlTagCallback } from './html-tag-callback.js';
import { HtmlTagId } from './html-tag-id.js';
import { HtmlWriter } from './html-writer.js';
import type { TextWriter } from './text-io.js';
import { TextConverter } from './text-converter.js';
import {
  buildUrlScanner,
  closeSyntheticStack,
  defaultHtmlTagCallback,
  splitLines,
  suppressContent,
  SyntheticHtmlTagContext,
  unquotePlain,
  writeLinkedText,
} from './html-converter-utils.js';

/**
 * A text to HTML converter.
 *
 * Used to convert plain text into HTML.
 */
export class TextToHtml extends TextConverter {
  /** Gets or sets the footer format. */
  footerFormat = HeaderFooterFormat.Text;
  /** Gets or sets the header format. */
  headerFormat = HeaderFooterFormat.Text;
  /** Gets or sets the callback used for custom filtering of HTML tags and content. */
  htmlTagCallback: HtmlTagCallback | null = null;
  /**
   * Gets or sets whether the converter should output only an HTML fragment.
   *
   * When `false`, the converter outputs an entire HTML document; when `true`,
   * it outputs only the HTML body content.
   */
  outputHtmlFragment = false;
  private readonly scanner = buildUrlScanner();

  /** The input format. */
  override get inputFormat(): TextFormat { return TextFormat.Plain; }
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
    if (!this.outputHtmlFragment) writer.write('<html><body>');
    if (this.header) this.writeHeaderFooter(this.header, this.headerFormat, writer);

    const htmlWriter = new HtmlWriter(writer, true);
    const callback = this.htmlTagCallback ?? defaultHtmlTagCallback;
    const stack: SyntheticHtmlTagContext[] = [];
    let currentQuoteDepth = 0;

    for (let line of splitLines(text)) {
      const uq = unquotePlain(line);
      line = uq.line;
      const quoteDepth = uq.quoteDepth;

      while (currentQuoteDepth < quoteDepth) {
        const ctx = new SyntheticHtmlTagContext(HtmlTagId.BlockQuote);
        callback(ctx, htmlWriter);
        currentQuoteDepth++;
        stack.push(ctx);
      }

      while (quoteDepth < currentQuoteDepth) {
        const ctx = stack.pop()!;
        if (!suppressContent(stack) && !ctx.deleteEndTag) {
          ctx.setIsEndTag(true);
          if (ctx.invokeCallbackForEndTag) callback(ctx, htmlWriter);
          else ctx.writeTag(htmlWriter);
        }
        if (ctx.tagId === HtmlTagId.BlockQuote) currentQuoteDepth--;
      }

      if (!suppressContent(stack)) {
        writeLinkedText(htmlWriter, this.scanner, line, callback);
        callback(new SyntheticHtmlTagContext(HtmlTagId.Br), htmlWriter);
      }
    }

    closeSyntheticStack(stack, htmlWriter, callback);
    htmlWriter.flush();

    if (this.footer) this.writeHeaderFooter(this.footer, this.footerFormat, writer);
    if (!this.outputHtmlFragment) writer.write('</body></html>');
  }
}
