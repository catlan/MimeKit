import { TextFormat } from '../text-part.js';
import { TextPreviewer } from './text-previewer.js';

function isWhiteSpace(c: string): boolean {
  const code = c.charCodeAt(0);
  return /\s/.test(c) || (code >= 0x200b && code <= 0x200d);
}

export class PlainTextPreviewer extends TextPreviewer {
  override get inputFormat(): TextFormat { return TextFormat.Plain; }

  protected override getPreviewTextCore(text: string): string {
    if (text.length === 0) return '';
    const max = Math.min(this.maximumPreviewLength, text.length);
    const preview: string[] = [];
    let lwsp = true;
    let i = 0;
    for (; i < text.length && preview.length < max; i++) {
      if (isWhiteSpace(text[i]!)) {
        if (!lwsp) {
          preview.push(' ');
          lwsp = true;
        }
      } else {
        preview.push(text[i]!);
        lwsp = false;
      }
    }
    if (lwsp && preview.length > 0) preview.pop();
    if (i < text.length && preview.length > 0) preview[preview.length - 1] = '\u2026';
    return preview.join('');
  }
}
