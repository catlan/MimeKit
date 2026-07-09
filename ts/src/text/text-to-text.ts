import { TextFormat } from '../text-part.js';
import type { TextWriter } from './text-io.js';
import { TextConverter } from './text-converter.js';

/** A text to text converter. */
export class TextToText extends TextConverter {
  /** The input format. */
  override get inputFormat(): TextFormat { return TextFormat.Plain; }
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
    writer.write(text);
    if (this.footer) writer.write(this.footer);
  }
}
