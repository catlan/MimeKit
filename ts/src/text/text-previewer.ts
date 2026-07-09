import { Stream } from '../io/stream.js';
import { TextPart, TextFormat } from '../text-part.js';
import { latin1, tryGetEncoding, utf8, type CharsetEncoding } from '../utils/charset-utils.js';

function readAll(stream: Stream, max = 16 * 1024): Uint8Array {
  const chunks: Uint8Array[] = [];
  const buffer = new Uint8Array(Math.min(4096, max));
  let total = 0;
  while (total < max) {
    const n = stream.read(buffer, 0, Math.min(buffer.length, max - total));
    if (n <= 0) break;
    chunks.push(buffer.slice(0, n));
    total += n;
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}

function collapsePreview(text: string, max: number): string {
  const preview: string[] = [];
  let lwsp = true;
  let i = 0;
  for (; i < text.length && preview.length < max; i++) {
    const c = text[i]!;
    if (/\s/.test(c)) {
      if (!lwsp) {
        preview.push(' ');
        lwsp = true;
      }
    } else {
      preview.push(c);
      lwsp = false;
    }
  }
  if (lwsp && preview.length > 0) preview.pop();
  if (i < text.length && preview.length > 0) preview[preview.length - 1] = '\u2026';
  return preview.join('');
}

function htmlBodyText(html: string): string {
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? '';
  return body.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
}

export abstract class TextPreviewer {
  private maximumPreviewLengthValue = 230;
  abstract get inputFormat(): TextFormat;

  get maximumPreviewLength(): number { return this.maximumPreviewLengthValue; }
  set maximumPreviewLength(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 1024) throw new RangeError('value');
    this.maximumPreviewLengthValue = value;
  }

  static getPreviewText(body: TextPart): string {
    if (body === null || body === undefined) throw new TypeError('body');
    if (body.content === null) return '';
    const stream = body.content.open();
    const bytes = readAll(stream);
    const isHtml = body.format === TextFormat.Html;
    const charset = body.contentType.charset;
    let encoding: CharsetEncoding = utf8;
    if (charset) {
      const result = tryGetEncoding(charset);
      if (result !== null) encoding = result;
    }
    try {
      const decoded = encoding.decode(bytes, true);
      return collapsePreview(isHtml ? htmlBodyText(decoded) : decoded, 230);
    } catch {
      const decoded = latin1.decode(bytes);
      return collapsePreview(isHtml ? htmlBodyText(decoded) : decoded, 230);
    }
  }

  getPreviewText(text: string): string;
  getPreviewText(stream: Stream, charset: string | CharsetEncoding): string;
  getPreviewText(input: string | Stream, charset?: string | CharsetEncoding): string {
    if (input === null || input === undefined) throw new TypeError('input');
    if (typeof input === 'string' && charset === undefined) return this.getPreviewTextCore(input);
    if (!(input instanceof Stream)) throw new TypeError('stream');
    if (charset === null || charset === undefined) throw new TypeError('charset');
    let encoding: CharsetEncoding = utf8;
    if (typeof charset === 'string') {
      const result = tryGetEncoding(charset);
      if (result !== null) encoding = result;
    } else {
      encoding = charset;
    }
    return this.getPreviewTextCore(encoding.decode(readAll(input)));
  }

  protected abstract getPreviewTextCore(text: string): string;
}
