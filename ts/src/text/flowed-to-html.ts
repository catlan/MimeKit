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
  unquoteFlowed,
  writeLinkedText,
} from './html-converter-utils.js';
import { TextToHtml } from './text-to-html.js';

export class FlowedToHtml extends TextConverter {
  deleteSpace = false;
  footerFormat = HeaderFooterFormat.Text;
  headerFormat = HeaderFooterFormat.Text;
  htmlTagCallback: HtmlTagCallback | null = null;
  outputHtmlFragment = false;
  private readonly scanner = buildUrlScanner();

  override get inputFormat(): TextFormat { return TextFormat.Flowed; }
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

  private writeParagraph(
    htmlWriter: HtmlWriter,
    stack: SyntheticHtmlTagContext[],
    currentQuoteDepth: { value: number },
    para: string,
    quoteDepth: number,
  ): void {
    const callback = this.htmlTagCallback ?? defaultHtmlTagCallback;
    while (currentQuoteDepth.value < quoteDepth) {
      const ctx = new SyntheticHtmlTagContext(HtmlTagId.BlockQuote);
      callback(ctx, htmlWriter);
      currentQuoteDepth.value++;
      stack.push(ctx);
    }
    while (quoteDepth < currentQuoteDepth.value) {
      const ctx = stack.pop()!;
      if (!suppressContent(stack) && !ctx.deleteEndTag) {
        ctx.setIsEndTag(true);
        if (ctx.invokeCallbackForEndTag) callback(ctx, htmlWriter);
        else ctx.writeTag(htmlWriter);
      }
      if (ctx.tagId === HtmlTagId.BlockQuote) currentQuoteDepth.value--;
    }
    if (suppressContent(stack)) return;
    const ctx = new SyntheticHtmlTagContext(para.length === 0 ? HtmlTagId.Br : HtmlTagId.P);
    callback(ctx, htmlWriter);
    if (para.length > 0) {
      if (!ctx.suppressInnerContent) writeLinkedText(htmlWriter, this.scanner, para, callback);
      if (!ctx.deleteEndTag) {
        ctx.setIsEndTag(true);
        if (ctx.invokeCallbackForEndTag) callback(ctx, htmlWriter);
        else ctx.writeTag(htmlWriter);
      }
    }
    if (!ctx.deleteTag) htmlWriter.writeMarkupText('\n');
  }

  override convertText(text: string, writer: TextWriter): void {
    if (text === null || text === undefined) throw new TypeError('text');
    if (writer === null || writer === undefined) throw new TypeError('writer');
    if (!this.outputHtmlFragment) writer.write('<html><body>');
    if (this.header) this.writeHeaderFooter(this.header, this.headerFormat, writer);

    const htmlWriter = new HtmlWriter(writer, true);
    const callback = this.htmlTagCallback ?? defaultHtmlTagCallback;
    const stack: SyntheticHtmlTagContext[] = [];
    const currentQuoteDepth = { value: 0 };
    let para = '';
    let paraQuoteDepth = -1;

    for (const rawLine of splitLines(text)) {
      let { line, quoteDepth } = unquoteFlowed(rawLine);
      if (quoteDepth === 0 && line.length > 0 && line[0] === ' ') line = line.substring(1);
      if (para.length === 0) paraQuoteDepth = quoteDepth;
      else if (quoteDepth !== paraQuoteDepth) {
        this.writeParagraph(htmlWriter, stack, currentQuoteDepth, para, paraQuoteDepth);
        paraQuoteDepth = quoteDepth;
        para = '';
      }
      para += line;
      if (line.length === 0 || line[line.length - 1] !== ' ') {
        this.writeParagraph(htmlWriter, stack, currentQuoteDepth, para, paraQuoteDepth);
        paraQuoteDepth = 0;
        para = '';
      } else if (this.deleteSpace) {
        para = para.substring(0, para.length - 1);
      }
    }

    if (para.length > 0) this.writeParagraph(htmlWriter, stack, currentQuoteDepth, para, paraQuoteDepth);
    closeSyntheticStack(stack, htmlWriter, callback);
    htmlWriter.flush();

    if (this.footer) this.writeHeaderFooter(this.footer, this.footerFormat, writer);
    if (!this.outputHtmlFragment) writer.write('</body></html>');
  }
}
