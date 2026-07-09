import { TextFormat } from '../text-part.js';
import { splitLines } from './html-converter-utils.js';
import type { TextWriter } from './text-io.js';
import { TextConverter } from './text-converter.js';

function unquote(line: string): { line: string; quoteDepth: number } {
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
 * A flowed text to text converter.
 *
 * Unwraps flowed text as described in RFC 3676.
 */
export class FlowedToText extends TextConverter {
  /**
   * Gets or sets whether the trailing space on a wrapped line should be deleted.
   *
   * The flowed text format defines a Content-Type parameter called `delsp` which
   * can have a value of `yes` or `no`. If the parameter exists and the value is
   * `yes`, set this property to `true`; otherwise set it to `false`.
   */
  deleteSpace = false;
  /** The input format. */
  override get inputFormat(): TextFormat { return TextFormat.Flowed; }
  /** The output format. */
  override get outputFormat(): TextFormat { return TextFormat.Plain; }

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
    if (this.header) writer.write(this.header);
    let para = '';
    let paraQuoteDepth = -1;
    for (const rawLine of splitLines(text)) {
      let { line, quoteDepth } = unquote(rawLine);
      if (quoteDepth === 0 && line.length > 0 && line[0] === ' ') line = line.substring(1);
      if (paraQuoteDepth === -1) {
        paraQuoteDepth = quoteDepth;
      } else if (quoteDepth !== paraQuoteDepth) {
        if (paraQuoteDepth > 0) writer.write('>'.repeat(paraQuoteDepth) + ' ');
        writer.write(para);
        writer.write('\n');
        paraQuoteDepth = quoteDepth;
        para = '';
      }
      para += line;
      if (line.length === 0 || line[line.length - 1] !== ' ') {
        if (paraQuoteDepth > 0) writer.write('>'.repeat(paraQuoteDepth) + ' ');
        writer.write(para);
        writer.write('\n');
        paraQuoteDepth = -1;
        para = '';
      } else if (this.deleteSpace) {
        para = para.substring(0, para.length - 1);
      }
    }
    if (para.length > 0) {
      if (paraQuoteDepth > 0) writer.write('>'.repeat(paraQuoteDepth) + ' ');
      writer.write(para);
    }
    if (this.footer) writer.write(this.footer);
  }
}
