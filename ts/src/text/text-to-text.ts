import { TextFormat } from '../text-part.js';
import type { TextWriter } from './text-io.js';
import { TextConverter } from './text-converter.js';

export class TextToText extends TextConverter {
  override get inputFormat(): TextFormat { return TextFormat.Plain; }
  override get outputFormat(): TextFormat { return TextFormat.Plain; }

  override convertText(text: string, writer: TextWriter): void {
    if (text === null || text === undefined) throw new TypeError('text');
    if (writer === null || writer === undefined) throw new TypeError('writer');
    if (this.header) writer.write(this.header);
    writer.write(text);
    if (this.footer) writer.write(this.footer);
  }
}
