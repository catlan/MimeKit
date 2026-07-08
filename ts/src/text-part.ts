import { ContentType } from './content-type.js';
import type { MimeVisitor } from './mime-visitor.js';
import { FormatOptions } from './format-options.js';
import { CharsetFilter } from './io/filters/charset-filter.js';
import { FilteredStream } from './io/filtered-stream.js';
import { MemoryStream } from './io/stream.js';
import { MimeContent } from './mime-content.js';
import { MimePart } from './mime-part.js';
import type { MimeEntityConstructorArgs } from './mime-entity.js';
import {
  latin1,
  tryGetBomEncoding,
  tryGetEncoding,
  utf8,
  type CharsetEncoding,
} from './utils/charset-utils.js';

export const TextFormat = {
  Text: 'text',
  Plain: 'plain',
  Flowed: 'flowed',
  Html: 'html',
  Enriched: 'enriched',
  RichText: 'richText',
  CompressedRichText: 'compressedRichText',
} as const;

export type TextFormat = typeof TextFormat[keyof typeof TextFormat];

export type TextEncodingConfidence = 'irrelevant' | 'certain' | 'tentative' | 'undefined';

const ascii = tryGetEncoding('us-ascii')!;
const encoder = new TextEncoder();

export class TextPart extends MimePart {
  constructor();
  constructor(subtype: string, ...args: unknown[]);
  constructor(format: TextFormat);
  constructor(contentType: ContentType);
  constructor(args: MimeEntityConstructorArgs);
  constructor(a?: string | ContentType | MimeEntityConstructorArgs, ...args: unknown[]) {
    if (a === undefined) {
      super('text', 'plain');
      return;
    }
    if (a instanceof ContentType) {
      super(a);
      return;
    }
    if (isConstructorArgs(a)) {
      super(a);
      return;
    }

    if (isTextFormat(a) && args.length === 0) {
      super('text', getMediaSubtype(a));
      if (a === TextFormat.Flowed)
        this.contentType.format = 'flowed';
      return;
    }

    super('text', a);
    let encoding: CharsetEncoding | null = null;
    let text: string | null = null;
    for (const obj of args) {
      if (obj == null || this.tryInit(obj))
        continue;
      if (isCharsetEncoding(obj)) {
        if (encoding !== null)
          throw new TypeError('An encoding should not be specified more than once.');
        encoding = obj;
        continue;
      }
      if (typeof obj === 'string') {
        if (text !== null)
          throw new TypeError('The text should not be specified more than once.');
        text = obj;
        continue;
      }
      throw new TypeError(`Unknown initialization parameter: ${typeof obj}`);
    }
    if (text !== null)
      this.setText(encoding ?? utf8, text);
  }

  get format(): TextFormat {
    this.checkDisposed('TextPart');
    if (this.contentType.mediaType.toLowerCase() === 'text') {
      const subtype = this.contentType.mediaSubtype.toLowerCase();
      if (subtype === 'plain') {
        if (this.contentType.format?.trim().toLowerCase() === 'flowed')
          return TextFormat.Flowed;
      } else if (subtype === 'html') {
        return TextFormat.Html;
      } else if (subtype === 'rtf') {
        return TextFormat.RichText;
      } else if (subtype === 'enriched' || subtype === 'richtext') {
        return TextFormat.Enriched;
      }
    } else if (this.contentType.isMimeType('application', 'rtf')) {
      return TextFormat.RichText;
    }
    return TextFormat.Plain;
  }

  get isEnriched(): boolean {
    this.checkDisposed('TextPart');
    return this.contentType.isMimeType('text', 'enriched') || this.contentType.isMimeType('text', 'richtext');
  }

  get isFlowed(): boolean {
    return this.isPlain && this.contentType.format?.trim().toLowerCase() === 'flowed';
  }

  get isHtml(): boolean {
    this.checkDisposed('TextPart');
    return this.contentType.isMimeType('text', 'html');
  }

  get isPlain(): boolean {
    this.checkDisposed('TextPart');
    return this.contentType.isMimeType('text', 'plain');
  }

  get isRichText(): boolean {
    this.checkDisposed('TextPart');
    return this.contentType.isMimeType('text', 'rtf') || this.contentType.isMimeType('application', 'rtf');
  }

  override accept(visitor: MimeVisitor): void {
    if (visitor == null)
      throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('TextPart');
    visitor.visitTextPart(this);
  }

  get text(): string {
    return this.getText().text;
  }

  set text(value: string) {
    this.setText(utf8, value);
  }

  isFormat(format: TextFormat): boolean {
    switch (format) {
    case TextFormat.Plain: return this.isPlain;
    case TextFormat.Flowed: return this.isFlowed;
    case TextFormat.Html: return this.isHtml;
    case TextFormat.Enriched: return this.isEnriched;
    case TextFormat.RichText: return this.isRichText;
    default: return false;
    }
  }

  tryDetectEncoding(): { ok: true; encoding: CharsetEncoding; confidence: TextEncodingConfidence } | { ok: false; encoding: null; confidence: TextEncodingConfidence } {
    this.checkDisposed('TextPart');
    if (this.content === null)
      return { ok: true, encoding: ascii, confidence: 'irrelevant' };

    const declared = this.contentType.charsetEncoding;
    if (declared !== null)
      return { ok: true, encoding: declared, confidence: 'certain' };

    const bytes = this.decodedBytes();
    const bom = tryGetBomEncoding(bytes);
    if (bom !== null)
      return { ok: true, encoding: bom, confidence: 'certain' };

    if (this.isHtml) {
      const detected = tryDetectHtmlEncoding(latin1.decode(bytes.subarray(0, 1024)));
      if (detected !== null)
        return { ok: true, encoding: detected, confidence: 'tentative' };
    }

    return { ok: false, encoding: null, confidence: 'undefined' };
  }

  getText(): { text: string; encoding: CharsetEncoding };
  getText(encoding: CharsetEncoding): string;
  getText(charset: string): string;
  getText(arg?: CharsetEncoding | string): string | { text: string; encoding: CharsetEncoding } {
    this.checkDisposed('TextPart');
    if (arg !== undefined) {
      const encoding = typeof arg === 'string' ? tryGetEncoding(arg) : arg;
      if (encoding == null)
        throw new TypeError(`The charset '${String(arg)}' is not supported.`);
      return this.decodeText(encoding);
    }

    const detected = this.tryDetectEncoding();
    let encoding = detected.ok ? detected.encoding : utf8;
    try {
      return { text: this.decodeText(encoding, true), encoding };
    } catch {
      encoding = latin1;
      return { text: this.decodeText(encoding), encoding };
    }
  }

  setText(charset: string | CharsetEncoding, text: string): void {
    if (charset == null) throw new TypeError('charset cannot be null or undefined');
    if (text == null) throw new TypeError('text cannot be null or undefined');
    this.checkDisposed('TextPart');
    const encoding = typeof charset === 'string' ? tryGetEncoding(charset) : charset;
    if (encoding == null)
      throw new TypeError(`The charset '${String(charset)}' is not supported.`);
    const bytes = encoding.encode(text);
    this.contentType.charsetEncoding = encoding;
    this.content = new MimeContent(new MemoryStream(bytes));
  }

  private decodeText(encoding: CharsetEncoding, fatal = false): string {
    if (this.content === null)
      return '';
    if (fatal) {
      // Strict charset probe first (C#: ExceptionFallback decoder).
      encoding.decode(this.decodedBytes(), true);
    }
    // C# GetText pipes content through CharsetFilter(charset -> utf-8) THEN
    // CreateNewLineFilter — so newline conversion runs on utf-8 bytes, and a
    // BARE CR is preserved (review fix: the previous regex converted lone
    // CRs; filtering raw bytes instead would corrupt UTF-16).
    const memory = new MemoryStream();
    const filtered = new FilteredStream(memory);
    filtered.add(new CharsetFilter(encoding, utf8));
    filtered.add(FormatOptions.default.createNewLineFilter());
    this.content.decodeTo(filtered);
    filtered.flush();
    return utf8.decode(memory.toArray());
  }

  private decodedBytes(): Uint8Array {
    if (this.content === null)
      return new Uint8Array(0);
    const memory = new MemoryStream();
    this.content.decodeTo(memory);
    return memory.toArray();
  }

}

function getMediaSubtype(format: TextFormat): string {
  switch (format) {
  case TextFormat.CompressedRichText:
  case TextFormat.RichText:
    return 'rtf';
  case TextFormat.Enriched:
    return 'enriched';
  case TextFormat.Flowed:
  case TextFormat.Plain:
    return 'plain';
  case TextFormat.Html:
    return 'html';
  default:
    throw new RangeError('format is out of range');
  }
}

function isTextFormat(value: string): value is TextFormat {
  return Object.values(TextFormat).includes(value as TextFormat);
}

function isConstructorArgs(value: unknown): value is MimeEntityConstructorArgs {
  return typeof value === 'object' && value !== null && 'parserOptions' in value && 'contentType' in value && 'headers' in value;
}

function isCharsetEncoding(value: unknown): value is CharsetEncoding {
  return typeof value === 'object' && value !== null && 'webName' in value && 'decode' in value && 'encode' in value;
}

function tryDetectHtmlEncoding(html: string): CharsetEncoding | null {
  const head = extractHead(html);
  if (head === null)
    return null;
  const metaRegex = /<meta\b([^>]*)>/giu;
  let match: RegExpExecArray | null;
  while ((match = metaRegex.exec(head)) !== null) {
    const attrs = parseAttributes(match[1]!);
    let charset = attrs.get('charset')?.trim() ?? null;
    let needPragma = false;
    if (charset === null) {
      const content = attrs.get('content');
      if (content) {
        const parsed = ContentType.parse(content);
        if (parsed.ok && parsed.value.charset) {
          charset = parsed.value.charset.trim();
          needPragma = true;
        }
      }
    }
    if (charset !== null && (!needPragma || attrs.get('http-equiv')?.toLowerCase() === 'content-type')) {
      if (charset.toLowerCase() === 'x-user-defined')
        charset = 'windows-1252';
      const encoding = tryGetEncoding(charset);
      if (encoding !== null && encoding.codePage !== 1200 && encoding.codePage !== 1201)
        return encoding;
      if (encoding !== null)
        return utf8;
    }
  }
  return null;
}

function extractHead(html: string): string | null {
  const htmlTag = /<html\b([^>]*)>/iu.exec(html);
  if (htmlTag !== null && /\/\s*$/u.test(htmlTag[1]!))
    return null;
  const headTag = /<head\b([^>]*)>/iu.exec(html);
  if (headTag === null || /\/\s*$/u.test(headTag[1]!))
    return null;
  const start = headTag.index + headTag[0].length;
  const body = /<body\b/iu.exec(html.slice(start));
  const endHead = /<\/head\s*>/iu.exec(html.slice(start));
  const end = body ? start + body.index : endHead ? start + endHead.index : html.length;
  return html.slice(start, end);
}

function parseAttributes(text: string): Map<string, string | null> {
  const attrs = new Map<string, string | null>();
  const regex = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>/]+))?/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1]!.toLowerCase();
    if (attrs.has(name))
      continue;
    let value = match[2] ?? null;
    if (value !== null && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))))
      value = value.slice(1, -1);
    attrs.set(name, value);
  }
  return attrs;
}
