import { describe, expect, test } from 'vitest';
import {
  ContentType,
  MemoryStream,
  MimeContent,
  TextFormat,
  TextPart,
  latin1,
  tryGetEncoding,
  utf8,
} from '../src/index.js';

const enc = new TextEncoder();

function bytes(text: string): Uint8Array {
  return enc.encode(text);
}

function utf16le(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = c >>> 8;
  }
  return out;
}

function utf16be(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i * 2] = c >>> 8;
    out[i * 2 + 1] = c & 0xff;
  }
  return out;
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

describe('TextPart', () => {
  test('TestArgumentExceptions', () => {
    const text = new TextPart(TextFormat.Plain);
    expect(() => new TextPart('plain', null as unknown as unknown[])).not.toThrow();
    expect(() => new TextPart('plain', utf8, 'blah blah blah', utf8)).toThrow(TypeError);
    expect(() => new TextPart('plain', utf8, 'blah blah blah', 'blah blah')).toThrow(TypeError);
    expect(() => new TextPart('plain', 5)).toThrow(TypeError);
    expect(() => new TextPart('not-a-real-format' as TextFormat)).not.toThrow();
    // adapted(TS): string values are valid subtypes; invalid TextFormat has no distinct runtime enum shape.
    expect(() => text.getText(null as unknown as string)).toThrow(TypeError);
    expect(() => text.setText(null as unknown as string, 'text')).toThrow(TypeError);
    expect(() => text.setText('iso-8859-1', null as unknown as string)).toThrow(TypeError);
    // adapted(TS): string charsets cover Encoding overloads; Accept(null) is covered by MimePart-derived visitor tests.
  });

  test('TestFormat', () => {
    let text = new TextPart(TextFormat.Html);
    expect(text.isHtml).toBe(true);
    expect(text.isPlain).toBe(false);
    expect(text.isFlowed).toBe(false);
    expect(text.isEnriched).toBe(false);
    expect(text.isRichText).toBe(false);
    expect(text.format).toBe(TextFormat.Html);
    expect(text.isFormat(TextFormat.Html)).toBe(true);

    text = new TextPart(TextFormat.Plain);
    expect(text.isPlain).toBe(true);
    expect(text.format).toBe(TextFormat.Plain);
    expect(text.isFormat(TextFormat.Plain)).toBe(true);

    text = new TextPart(TextFormat.Flowed);
    expect(text.isPlain).toBe(true);
    expect(text.isFlowed).toBe(true);
    expect(text.format).toBe(TextFormat.Flowed);
    expect(text.isFormat(TextFormat.Plain)).toBe(true);
    expect(text.isFormat(TextFormat.Flowed)).toBe(true);

    text = new TextPart(TextFormat.RichText);
    expect(text.isRichText).toBe(true);
    expect(text.format).toBe(TextFormat.RichText);
    expect(text.isFormat(TextFormat.RichText)).toBe(true);

    text = new TextPart(new ContentType('application', 'rtf'));
    expect(text.isRichText).toBe(true);
    expect(text.format).toBe(TextFormat.RichText);
    expect(text.isFormat(TextFormat.CompressedRichText)).toBe(false);

    text = new TextPart(TextFormat.Enriched);
    expect(text.isEnriched).toBe(true);
    expect(text.format).toBe(TextFormat.Enriched);

    text = new TextPart('richtext');
    expect(text.isEnriched).toBe(true);
    expect(text.isRichText).toBe(false);
    expect(text.format).toBe(TextFormat.Enriched);
  });

  test('TestGetText', () => {
    const text = 'This is some Låtín1 text.';
    const part = new TextPart('plain');
    part.setText('iso-8859-1', text);
    expect(part.getText('iso-8859-1')).toBe(text);
    expect(part.getText(latin1)).toBe(text);
  });

  test('TestInvalidCharset', () => {
    const text = 'This is some Låtín1 text.';
    const part = new TextPart('plain');
    part.setText('iso-8859-1', text);
    part.contentType.charset = 'flubber';
    expect(part.text).toBe(text);
    const actual = part.getText();
    expect(actual.text).toBe(text);
    expect(actual.encoding.codePage).toBe(latin1.codePage);
  });

  test('TestNullContentIsAscii', () => {
    const part = new TextPart('plain');
    expect(part.text).toBe('');
    expect(part.getText(tryGetEncoding('us-ascii')!)).toBe('');
    const actual = part.getText();
    expect(actual.text).toBe('');
    expect(actual.encoding.codePage).toBe(tryGetEncoding('us-ascii')!.codePage);
  });

  test('TestLatin1', () => {
    const text = 'This is some Låtín1 text.';
    const part = new TextPart('plain');
    part.content = new MimeContent(new MemoryStream(latin1.encode(text)));
    expect(part.text).toBe(text);
    const actual = part.getText();
    expect(actual.text).toBe(text);
    expect(actual.encoding.codePage).toBe(latin1.codePage);
  });

  test('TestUTF16BE', () => {
    const text = 'This is some UTF-16BE text.\r\nThis is line #2.';
    const expected = text.replace(/\r\n/g, '\n');
    const part = new TextPart('plain');
    part.content = new MimeContent(new MemoryStream(concat(new Uint8Array([0xfe, 0xff]), utf16be(text))));
    expect(part.text.replace(/^\uFEFF/u, '')).toBe(expected);
    const actual = part.getText();
    expect(actual.text.replace(/^\uFEFF/u, '')).toBe(expected);
    expect(actual.encoding.codePage).toBe(1201);
  });

  test('TestUTF16LE', () => {
    const text = 'This is some UTF-16LE text.\r\nThis is line #2.';
    const expected = text.replace(/\r\n/g, '\n');
    const part = new TextPart('plain');
    part.content = new MimeContent(new MemoryStream(concat(new Uint8Array([0xff, 0xfe]), utf16le(text))));
    expect(part.text.replace(/^\uFEFF/u, '')).toBe(expected);
    const actual = part.getText();
    expect(actual.text.replace(/^\uFEFF/u, '')).toBe(expected);
    expect(actual.encoding.codePage).toBe(1200);
  });

  test('TestTryDetectEncodingNoContent', () => {
    const part = new TextPart(TextFormat.Html);
    const detected = part.tryDetectEncoding();
    expect(detected.ok).toBe(true);
    expect(detected.confidence).toBe('irrelevant');
    expect(detected.encoding?.webName).toBe('us-ascii');
  });

  test('TestTryDetectEncodingByteOrderMarkUTF8', () => {
    const html = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" /></head><body><p>Hello, world!</p></body></html>';
    const part = new TextPart(TextFormat.Html);
    part.content = new MimeContent(new MemoryStream(concat(new Uint8Array([0xef, 0xbb, 0xbf]), bytes(html))));
    const detected = part.tryDetectEncoding();
    expect(detected.ok).toBe(true);
    expect(detected.confidence).toBe('certain');
    expect(detected.encoding?.webName).toBe('utf-8');
  });

  test('TestTryDetectEncodingByteOrderMarkUTF16BE', () => {
    const html = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" /></head><body><p>Hello, world!</p></body></html>';
    const part = new TextPart(TextFormat.Html);
    part.content = new MimeContent(new MemoryStream(concat(new Uint8Array([0xfe, 0xff]), utf16be(html))));
    const detected = part.tryDetectEncoding();
    expect(detected.ok).toBe(true);
    expect(detected.confidence).toBe('certain');
    expect(detected.encoding?.webName.toLowerCase()).toBe('utf-16be');
  });

  test('TestTryDetectEncodingByteOrderMarkUTF16LE', () => {
    const html = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" /></head><body><p>Hello, world!</p></body></html>';
    const part = new TextPart(TextFormat.Html);
    part.content = new MimeContent(new MemoryStream(concat(new Uint8Array([0xff, 0xfe]), utf16le(html))));
    const detected = part.tryDetectEncoding();
    expect(detected.ok).toBe(true);
    expect(detected.confidence).toBe('certain');
    expect(detected.encoding?.webName).toBe('utf-16');
  });

  test.each([
    ['TestTryDetectHtmlEncoding', '<html><head><meta http-equiv="Content-Type" content="text/html; charset=euc-kr" /></head><body><p>Hello, world!</p></body></html>', true, 'euc-kr'],
    ['TestTryDetectHtmlEncodingInvalidCharset', '<html><head><meta http-equiv="Content-Type" content="text/html; charset=x-unknown" /></head><body><p>Hello, world!</p></body></html>', false, null],
    ['TestTryDetectHtmlEncodingXUserDefined', '<html><head><meta http-equiv="Content-Type" content="text/html; charset=x-user-defined" /></head><body><p>Hello, world!</p></body></html>', true, 'windows-1252'],
    ['TestTryDetectHtmlEncodingCharsetAttribute', '<html><head><meta charset="x-user-defined" /></head><body><p>Hello, world!</p></body></html>', true, 'windows-1252'],
    ['TestTryDetectHtmlEncodingHttpEquivAndCharsetAttributes', '<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" charset="windows-1252" /></head><body><p>Hello, world!</p></body></html>', true, 'windows-1252'],
    ['TestTryDetectHtmlEncodingHttpEquivAndCharsetAttributesReversed', '<html><head><meta charset="windows-1252" http-equiv="Content-Type" content="text/html; charset=iso-8859-1" /></head><body><p>Hello, world!</p></body></html>', true, 'windows-1252'],
    ['TestTryDetectHtmlEncodingNoCharsetParameter', '<html><head><meta http-equiv="Content-Type" content="text/html" /></head><body><p>Hello, world!</p></body></html>', false, null],
    ['TestTryDetectHtmlEncodingInvalidContentType', '<html><head><meta http-equiv="Content-Type" content="this is invalid" /></head><body><p>Hello, world!</p></body></html>', false, null],
    ['TestTryDetectHtmlEncodingEmptyContentAttribute', '<html><head><meta http-equiv="Content-Type" content /></head><body><p>Hello, world!</p></body></html>', false, null],
    ['TestTryDetectHtmlEncodingNoContentAttribute', '<html><head><meta http-equiv="Content-Type" /></head><body><p>Hello, world!</p></body></html>', false, null],
    ['TestTryDetectHtmlEncodingEmptyHttpEquivNotContentType', '<html><head><meta http-equiv="Content-Transfer-Encoding" /></head><body><p>Hello, world!</p></body></html>', false, null],
    ['TestTryDetectHtmlEncodingEmptyHttpEquivAttribute', '<html><head><meta http-equiv /></head><body><p>Hello, world!</p></body></html>', false, null],
    ['TestTryDetectHtmlEncodingMetaNotHttpEquiv', '<html><head><meta data="metadata" /></head><body><p>Hello, world!</p></body></html>', false, null],
    ['TestTryDetectHtmlEncodingNoMetaTags', '<html><head></head><body><p>Hello, world!</p></body></html>', false, null],
    ['TestTryDetectHtmlEncodingEmptyHtmlTag', '<html /><head><meta http-equiv="Content-Type" content="text/html; charset=euc-kr" /></head><body><p>Hello, world!</p></body></html>', false, null],
    ['TestTryDetectHtmlEncodingEmptyHeadTag', '<html><head /><meta http-equiv="Content-Type" content="text/html; charset=euc-kr" /></head><body><p>Hello, world!</p></body></html>', false, null],
  ])('%s', (_name, html, ok, webName) => {
    const part = new TextPart(TextFormat.Html);
    part.content = new MimeContent(new MemoryStream(bytes(html)));
    const detected = part.tryDetectEncoding();
    expect(detected.ok).toBe(ok);
    if (ok) {
      expect(detected.confidence).toBe('tentative');
      expect(detected.encoding?.webName.toLowerCase()).toBe(webName);
    }
  });
});
