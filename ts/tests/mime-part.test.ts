import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  ContentDisposition,
  ContentType,
  FormatOptions,
  Header,
  HeaderId,
  MemoryStream,
  MimeContent,
  MimeEntity,
  MimePart,
  TextPart,
  generateMessageId,
} from '../src/index.js';
import { testDataDir } from './gates/helpers.js';

const enc = new TextEncoder();

function textBytes(text: string): Uint8Array {
  return enc.encode(text);
}

function readText(stream: MemoryStream): string {
  return new TextDecoder('latin1').decode(stream.toArray());
}

function reload(stream: MemoryStream): MimePart {
  const result = MimeEntity.load(stream);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  expect(result.value).toBeInstanceOf(MimePart);
  return result.value as MimePart;
}

describe('MimePart', () => {
  test('TestArgumentExceptions', () => {
    const part = new MimePart();
    expect(() => new MimePart(null as unknown as string)).toThrow(TypeError);
    expect(() => new MimePart(null as unknown as ContentType)).toThrow(TypeError);
    expect(() => new MimePart(null as unknown as string, 'octet-stream')).toThrow(TypeError);
    expect(() => new MimePart('application', null as unknown as string)).toThrow(TypeError);
    expect(() => { part.contentDuration = -1; }).toThrow(RangeError);
    expect(() => part.prepare('7bit', 1)).toThrow(RangeError);
    expect(() => part.writeTo(null as unknown as MemoryStream)).toThrow(TypeError);
    expect(() => part.writeTo(null as unknown as FormatOptions, new MemoryStream())).toThrow(TypeError);
    expect(() => part.writeTo(FormatOptions.default, null as unknown as MemoryStream)).toThrow(TypeError);
    expect(() => { part.contentId = '<image.jpg'; }).toThrow(TypeError);
    // deferred(wave-4): MimeEntity.Load overloads need MimeReader/MimeParser.
    // deferred(sync-only): WriteToAsync/LoadAsync overloads are omitted per PLAN.
    // deferred(node-entry): file path WriteTo overloads belong in the future node facade, not core.
    // deferred(wave-3): Accept needs MimeVisitor.
  });

  test('TestParameterizedCtor', () => {
    const expected = 'Content-Type: text/plain\nContent-Transfer-Encoding: base64\nContent-Id: <id@localhost.com>\n\n';
    const headers = [new Header('Content-Id', '<id@localhost.com>')];
    const part = new MimePart('text', 'plain', new Header('Content-Transfer-Encoding', 'base64'), headers);
    part.content = new MimeContent(new MemoryStream());
    expect(part.contentId).toBe('id@localhost.com');
    expect(part.contentTransferEncoding).toBe('base64');
    const stream = new MemoryStream();
    const options = FormatOptions.default.clone();
    options.newLineFormat = 'unix';
    part.writeTo(options, stream);
    expect(readText(stream)).toBe(expected);
  });

  test('TestContentDisposition', () => {
    const part = new MimePart();
    expect(part.contentDisposition).toBeNull();
    part.contentDisposition = new ContentDisposition(ContentDisposition.attachment);
    expect(part.contentDisposition).not.toBeNull();
    expect(part.headers.contains(HeaderId.ContentDisposition)).toBe(true);
    part.contentDisposition = null;
    expect(part.contentDisposition).toBeNull();
    expect(part.headers.contains(HeaderId.ContentDisposition)).toBe(false);
    part.headers.add(HeaderId.ContentDisposition, 'attachment');
    expect(part.contentDisposition).not.toBeNull();
    part.headers.remove(HeaderId.ContentDisposition);
    expect(part.contentDisposition).toBeNull();
    part.contentDisposition = new ContentDisposition();
    part.fileName = 'fileName';
    part.headers.clear();
    expect(part.contentDisposition).toBeNull();
  });

  test('TestIsAttachment', () => {
    const part = new MimePart();
    expect(part.contentDisposition).toBeNull();
    part.isAttachment = true;
    expect(part.contentDisposition?.disposition).toBe(ContentDisposition.attachment);
    expect(part.headers.contains(HeaderId.ContentDisposition)).toBe(true);
    part.isAttachment = false;
    expect(part.contentDisposition?.disposition).toBe(ContentDisposition.inline);
    part.isAttachment = true;
    expect(part.contentDisposition?.disposition).toBe(ContentDisposition.attachment);
    part.contentDisposition = null;
    part.isAttachment = false;
    expect(part.contentDisposition).toBeNull();
  });

  test('TestContentBase', () => {
    const part = new MimePart();
    const uri = 'http://www.google.com/';
    expect(part.contentBase).toBeNull();
    expect(() => { part.contentBase = 'relative'; }).toThrow(TypeError);
    part.contentBase = uri;
    expect(part.contentBase).toBe(uri);
    expect(part.headers.contains(HeaderId.ContentBase)).toBe(true);
    part.contentBase = null;
    expect(part.contentBase).toBeNull();
    part.headers.add(HeaderId.ContentBase, uri);
    expect(part.contentBase).toBe(uri);
    part.headers.remove(HeaderId.ContentBase);
    expect(part.contentBase).toBeNull();
    part.contentBase = uri;
    part.headers.clear();
    expect(part.contentBase).toBeNull();
  });

  test('TestContentLocation', () => {
    const part = new MimePart();
    const uri = 'http://www.google.com/';
    expect(part.contentLocation).toBeNull();
    part.contentLocation = uri;
    expect(part.contentLocation).toBe(uri);
    expect(part.headers.contains(HeaderId.ContentLocation)).toBe(true);
    part.contentLocation = null;
    expect(part.contentLocation).toBeNull();
    part.headers.add(HeaderId.ContentLocation, uri);
    expect(part.contentLocation).toBe(uri);
    part.headers.remove(HeaderId.ContentLocation);
    expect(part.contentLocation).toBeNull();
    part.contentLocation = uri;
    part.headers.clear();
    expect(part.contentLocation).toBeNull();
  });

  test('TestContentDescription', () => {
    const description = 'This is a sample description.';
    const part = new MimePart();
    expect(part.contentDescription).toBeNull();
    part.contentDescription = description;
    expect(part.contentDescription).toBe(description);
    expect(part.headers.contains(HeaderId.ContentDescription)).toBe(true);
    part.contentDescription = null;
    expect(part.contentDescription).toBeNull();
    part.headers.add(HeaderId.ContentDescription, description);
    expect(part.contentDescription).toBe(description);
    part.headers.remove(HeaderId.ContentDescription);
    expect(part.contentDescription).toBeNull();
    part.contentDescription = description;
    part.headers.clear();
    expect(part.contentDescription).toBeNull();
  });

  test('TestContentDuration', () => {
    const part = new MimePart();
    expect(part.contentDuration).toBeNull();
    part.contentDuration = 500;
    expect(part.contentDuration).toBe(500);
    expect(part.headers.contains(HeaderId.ContentDuration)).toBe(true);
    part.contentDuration = null;
    expect(part.contentDuration).toBeNull();
    part.headers.add(HeaderId.ContentDuration, '500');
    expect(part.contentDuration).toBe(500);
    part.headers.remove(HeaderId.ContentDuration);
    expect(part.contentDuration).toBeNull();
    part.contentDuration = 500;
    part.headers.clear();
    expect(part.contentDuration).toBeNull();
  });

  test('TestContentId', () => {
    const id = generateMessageId('localhost.com');
    const part = new MimePart();
    expect(part.contentId).toBeNull();
    part.contentId = id;
    expect(part.contentId).toBe(id);
    expect(part.headers.contains(HeaderId.ContentId)).toBe(true);
    part.contentId = null;
    expect(part.contentId).toBeNull();
    part.headers.add(HeaderId.ContentId, `<${id}>`);
    expect(part.contentId).toBe(id);
    part.headers.remove(HeaderId.ContentId);
    expect(part.contentId).toBeNull();
    part.contentId = id;
    part.headers.clear();
    expect(part.contentId).toBeNull();
  });

  test('TestContentMd5', () => {
    let part: MimePart = new MimePart();
    expect(part.contentMd5).toBeNull();
    part.contentMd5 = 'XYZ';
    expect(part.contentMd5).toBe('XYZ');
    expect(part.headers.contains(HeaderId.ContentMd5)).toBe(true);
    part.contentMd5 = null;
    expect(part.contentMd5).toBeNull();
    part.headers.add(HeaderId.ContentMd5, 'XYZ');
    expect(part.contentMd5).toBe('XYZ');
    part.headers.remove(HeaderId.ContentMd5);
    expect(part.contentMd5).toBeNull();
    part.contentMd5 = 'XYZ';
    part.headers.clear();
    expect(part.contentMd5).toBeNull();
    expect(() => part.computeContentMd5()).toThrow(TypeError);
    expect(part.verifyContentMd5()).toBe(false);

    part = new TextPart('plain');
    (part as TextPart).text = "Hello, World.\n\nLet's check the MD5 sum of this text!\n";
    const md5sum = part.computeContentMd5();
    expect(md5sum).toBe('8criUiOQmpfifOuOmYFtEQ==');
    part.contentMd5 = md5sum;
    expect(part.verifyContentMd5()).toBe(true);
  });

  test('TestContentTransferEncoding', () => {
    const part = new MimePart();
    expect(part.contentTransferEncoding).toBe('default');
    part.contentTransferEncoding = '8bit';
    expect(part.contentTransferEncoding).toBe('8bit');
    expect(part.headers.contains(HeaderId.ContentTransferEncoding)).toBe(true);
    expect(() => { part.contentTransferEncoding = 'bogus' as never; }).toThrow(RangeError);
    part.contentTransferEncoding = 'default';
    expect(part.headers.contains(HeaderId.ContentTransferEncoding)).toBe(false);
    part.headers.add(HeaderId.ContentTransferEncoding, 'base64');
    expect(part.contentTransferEncoding).toBe('base64');
    part.headers.remove(HeaderId.ContentTransferEncoding);
    expect(part.contentTransferEncoding).toBe('default');
    part.contentTransferEncoding = 'uuencode';
    part.headers.clear();
    expect(part.contentTransferEncoding).toBe('default');
  });

  test('TestPrepare', () => {
    const part = new MimePart('application/octet-stream');
    part.content = new MimeContent(new MemoryStream(new Uint8Array(64)));
    expect(part.getBestEncoding('7bit')).toBe('base64');
    part.prepare('7bit');
    expect(part.contentTransferEncoding).toBe('base64');
    part.prepare('7bit');
    expect(part.contentTransferEncoding).toBe('base64');
    part.contentTransferEncoding = 'binary';
    part.prepare('none');
    expect(part.contentTransferEncoding).toBe('binary');
    part.prepare('7bit');
    expect(part.contentTransferEncoding).toBe('base64');
  });

  test('TestTranscoding', () => {
    const path = join(testDataDir, 'images', 'girl.jpg');
    const expected = new Uint8Array(readFileSync(path));

    let part = new MimePart('image', 'jpeg');
    part.content = new MimeContent(new MemoryStream(expected));
    part.contentTransferEncoding = 'base64';
    part.fileName = 'girl.jpg';

    // encode in base64
    {
      const output = new MemoryStream();
      part.writeTo(output);
      output.position = 0;

      part = reload(output);
    }

    // transcode to uuencode
    part.contentTransferEncoding = 'uuencode';
    {
      const output = new MemoryStream();
      part.writeTo(output);
      output.position = 0;

      part = reload(output);
    }

    // verify decoded content
    const output = new MemoryStream();
    part.content!.decodeTo(output);
    const actual = output.toArray();

    expect(actual.length).toBe(expected.length);
    expect(Buffer.from(actual).equals(Buffer.from(expected)), 'Image content differs').toBe(true);
  });

  test.skip('TestTranscodingAsync', () => {
    // deferred(sync-only + wave-4): async API pairs omitted; parser not ported yet.
  });

  test.each([
    ['TestWriteTo_NoNewLine', 'content', 'content'],
    ['TestWriteTo_NewLine', 'content\r\n', 'content\r\n'],
  ])('%s', (_name, text, expected) => {
    // adapted(wave-3): C# exercises BodyBuilder/Multipart round-trip; this directly verifies MimePart newline handling.
    const part = new TextPart('plain');
    part.text = text;
    const options = FormatOptions.default.clone();
    options.newLineFormat = 'dos';
    const stream = new MemoryStream();
    part.writeTo(options, stream);
    expect(readText(stream).endsWith(expected)).toBe(true);
  });

  test.skip('TestWriteToAsync_NoNewLine', () => {
    // deferred(sync-only): async API pairs omitted per PLAN.
  });
  test.skip('TestWriteToAsync_NewLine', () => {
    // deferred(sync-only): async API pairs omitted per PLAN.
  });

  test.each([
    ['TestWriteToFile_NoNewLine', 'content', 'content'],
    ['TestWriteToFile_NewLine', 'content\r\n', 'content\n'],
  ])('%s', (_name, text, unixExpected) => {
    // adapted(node-entry): core omits file path overloads; memory stream verifies the same NewLineFormat conversion.
    const part = new TextPart('plain');
    part.text = text;
    const options = FormatOptions.default.clone();
    options.newLineFormat = 'unix';
    const stream = new MemoryStream();
    part.writeTo(options, stream);
    expect(readText(stream).endsWith(unixExpected)).toBe(true);
  });

  test.skip('TestWriteToFileAsync_NoNewLine', () => {
    // deferred(sync-only + node-entry): async and file path overloads omitted per PLAN.
  });
  test.skip('TestWriteToFileAsync_NewLine', () => {
    // deferred(sync-only + node-entry): async and file path overloads omitted per PLAN.
  });
  test('TestLoadHttpWebResponse', () => {
    const text = 'This is some text and stuff.\n';
    const contentType = new ContentType('text', 'plain');

    const content = new MemoryStream(textBytes(text));
    const result = MimeEntity.load(contentType, content);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const entity = result.value;

    expect(entity).toBeInstanceOf(TextPart);

    const part = entity as TextPart;

    expect(part.text).toBe(text);
  });
  test.skip('TestLoadHttpWebResponseAsync', () => {
    // deferred(sync-only + wave-4): async API pairs omitted; parser not ported yet.
  });

  test('TestToString', () => {
    const part = new MimePart('application', 'octet-stream');
    part.contentTransferEncoding = 'base64';
    part.content = new MimeContent(new MemoryStream(new Uint8Array(1)));
    expect(() => part.toString()).not.toThrow();
  });

  test('MimeContentDecodeAndWriteTo', () => {
    const raw = textBytes('SGVsbG8=\n');
    const content = new MimeContent(new MemoryStream(raw), 'base64');
    const decoded = new MemoryStream();
    content.decodeTo(decoded);
    expect(new TextDecoder().decode(decoded.toArray())).toBe('Hello');
    const copied = new MemoryStream();
    content.writeTo(copied);
    expect(copied.toArray()).toEqual(raw);
  });
});
