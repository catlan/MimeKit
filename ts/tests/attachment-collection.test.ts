import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  AttachmentCollection,
  ContentType,
  MemoryStream,
  MessagePart,
  MimePart,
  TextPart,
} from '../src/index.js';

// C# TestData lives next to the C# project (UnitTests/TestData); tests run in
// Node, so reading fixtures with fs is fine even though the core stays isomorphic.
const testData = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'UnitTests', 'TestData');
const girlPath = join(testData, 'images', 'girl.jpg');
const loremPath = join(testData, 'text', 'lorem-ipsum.txt');

function bytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

function streamOf(path: string): MemoryStream {
  return new MemoryStream(bytes(path));
}

describe('AttachmentCollection', () => {
  test('TestArgumentExceptions', () => {
    const contentType = new ContentType('application', 'octet-stream');
    const attachments = new AttachmentCollection();
    const items = new Array<MimePart>(10) as unknown as MimePart[];
    const data = new Uint8Array(1024);

    expect(attachments.isReadOnly).toBe(false);

    const stream = new MemoryStream();

    // add(attachment) null.
    expect(() => attachments.add(null as never)).toThrow(TypeError);

    // add(fileName, data|stream[, contentType]) fileName empty / null.
    expect(() => attachments.add('', data)).toThrow(TypeError);
    expect(() => attachments.add(null as never, data)).toThrow(TypeError);
    expect(() => attachments.add('', stream)).toThrow(TypeError);
    expect(() => attachments.add(null as never, stream)).toThrow(TypeError);
    expect(() => attachments.add('', data, contentType)).toThrow(TypeError);
    expect(() => attachments.add(null as never, data, contentType)).toThrow(TypeError);
    expect(() => attachments.add('', stream, contentType)).toThrow(TypeError);
    expect(() => attachments.add(null as never, stream, contentType)).toThrow(TypeError);

    // deferred/omitted: Add(fileName) and Add(fileName, contentType) are the
    // pure-filesystem overloads (Node-only) and are omitted from the core.

    // data/stream null.
    expect(() => attachments.add('file.dat', null as never)).toThrow(TypeError);
    expect(() => attachments.add('file.dat', null as never, contentType)).toThrow(TypeError);

    // contentType null.
    expect(() => attachments.add('file.dat', data, null as never)).toThrow(TypeError);
    expect(() => attachments.add('file.dat', stream, null as never)).toThrow(TypeError);

    // AddAsync overloads: omitted (sync core; async not ported).

    expect(() => attachments.contains(null as never)).toThrow(TypeError);

    expect(() => attachments.copyTo(null as never, 0)).toThrow(TypeError);
    expect(() => attachments.copyTo(items, -1)).toThrow(RangeError);

    expect(() => attachments.indexOf(null as never)).toThrow(TypeError);

    expect(() => attachments.remove(null as never)).toThrow(TypeError);
    expect(() => attachments.removeAt(0)).toThrow(RangeError);

    attachments.add(new TextPart('plain'));
    expect(() => attachments.at(10)).toThrow(RangeError);
    expect(() => attachments.set(10, new TextPart('plain'))).toThrow(RangeError);
    expect(() => attachments.set(0, null as never)).toThrow(TypeError);

    expect(() => attachments.insert(-1, new TextPart('plain'))).toThrow(RangeError);
    expect(() => attachments.insert(0, null as never)).toThrow(TypeError);
  });

  test('TestClear', () => {
    const attachments = new AttachmentCollection();

    let attachment = attachments.add(girlPath, bytes(girlPath)) as MimePart;
    attachments.clear();

    expect(attachments.count).toBe(0);
    expect(attachment.isDisposed).toBe(false);
    attachment.dispose();

    attachment = attachments.add(girlPath, bytes(girlPath)) as MimePart;
    attachments.clear(true);

    expect(attachments.count).toBe(0);
    expect(attachment.isDisposed).toBe(true);
  });

  test('TestAddFileName', () => {
    const attachments = new AttachmentCollection();

    const attachment = attachments.add(girlPath, bytes(girlPath)) as MimePart;
    assertGirl(attachment, 'image/jpeg', 'attachment');
    expect(attachments.count).toBe(1);

    expect(attachments.contains(attachment)).toBe(true);
    expect(attachments.indexOf(attachment)).toBe(0);
    expect(attachments.remove(attachment)).toBe(true);
    expect(attachments.count).toBe(0);
    attachments.clear(true);
  });

  test('TestAddInlineFileName', () => {
    const attachments = new AttachmentCollection(true);

    const attachment = attachments.add(girlPath, bytes(girlPath)) as MimePart;
    assertGirl(attachment, 'image/jpeg', 'inline');
    expect(attachments.count).toBe(1);

    expect(attachments.contains(attachment)).toBe(true);
    expect(attachments.indexOf(attachment)).toBe(0);
    expect(attachments.remove(attachment)).toBe(true);
    expect(attachments.count).toBe(0);
    attachments.clear(true);
  });

  test('TestAddFileNameContentType', () => {
    const contentType = new ContentType('image', 'gif');
    const attachments = new AttachmentCollection();

    const attachment = attachments.add(girlPath, bytes(girlPath), contentType) as MimePart;
    assertGirl(attachment, contentType.mimeType, 'attachment');
    expect(attachments.count).toBe(1);

    expect(attachments.contains(attachment)).toBe(true);
    expect(attachments.indexOf(attachment)).toBe(0);
    expect(attachments.remove(attachment)).toBe(true);
    expect(attachments.count).toBe(0);
    attachments.clear(true);
  });

  test('TestAddData', () => {
    const attachments = new AttachmentCollection();

    const attachment = attachments.add(girlPath, bytes(girlPath)) as MimePart;
    assertGirl(attachment, 'image/jpeg', 'attachment');
    expect(attachments.count).toBe(1);

    expect(attachments.contains(attachment)).toBe(true);
    expect(attachments.indexOf(attachment)).toBe(0);
    expect(attachments.remove(attachment)).toBe(true);
    expect(attachments.count).toBe(0);
    attachments.clear(true);
  });

  test('TestAddDataContentType', () => {
    const contentType = new ContentType('image', 'gif');
    const attachments = new AttachmentCollection();

    const attachment = attachments.add(girlPath, bytes(girlPath), contentType) as MimePart;
    assertGirl(attachment, contentType.mimeType, 'attachment');
    expect(attachments.count).toBe(1);

    expect(attachments.contains(attachment)).toBe(true);
    expect(attachments.indexOf(attachment)).toBe(0);
    expect(attachments.remove(attachment)).toBe(true);
    expect(attachments.count).toBe(0);
    attachments.clear(true);
  });

  test('TestAddStream', () => {
    const attachments = new AttachmentCollection();

    const attachment = attachments.add(girlPath, streamOf(girlPath)) as MimePart;
    assertGirl(attachment, 'image/jpeg', 'attachment');
    expect(attachments.count).toBe(1);

    expect(attachments.contains(attachment)).toBe(true);
    expect(attachments.indexOf(attachment)).toBe(0);
    expect(attachments.remove(attachment)).toBe(true);
    expect(attachments.count).toBe(0);
    attachments.clear(true);
  });

  test('TestAddStreamContentType', () => {
    const contentType = new ContentType('image', 'gif');
    const attachments = new AttachmentCollection();

    const attachment = attachments.add(girlPath, streamOf(girlPath), contentType) as MimePart;
    assertGirl(attachment, contentType.mimeType, 'attachment');
    expect(attachments.count).toBe(1);

    expect(attachments.contains(attachment)).toBe(true);
    expect(attachments.indexOf(attachment)).toBe(0);
    expect(attachments.remove(attachment)).toBe(true);
    expect(attachments.count).toBe(0);
    attachments.clear(true);
  });

  test('TestAddTextFileName', () => {
    const attachments = new AttachmentCollection();

    const attachment = attachments.add(loremPath, bytes(loremPath)) as MimePart;
    expect(attachment.contentType.mimeType).toBe('text/plain');
    expect(attachment.contentType.name).toBe('lorem-ipsum.txt');
    expect(attachment.contentDisposition).not.toBeNull();
    expect(attachment.contentDisposition!.disposition).toBe('attachment');
    expect(attachment.contentDisposition!.fileName).toBe('lorem-ipsum.txt');
    expect(attachment.fileName).toBe('lorem-ipsum.txt');
    expect(attachment.contentTransferEncoding).toBe('7bit');
    expect(attachments.count).toBe(1);

    expect(attachments.contains(attachment)).toBe(true);
    expect(attachments.indexOf(attachment)).toBe(0);
    expect(attachments.remove(attachment)).toBe(true);
    expect(attachments.count).toBe(0);
    attachments.clear(true);
  });

  test('TestListMethods', () => {
    const attachments = new AttachmentCollection();

    const plain = attachments.add(loremPath, bytes(loremPath)) as MimePart;
    const jpeg = attachments.add(girlPath, bytes(girlPath)) as MimePart;

    const copied = new Array<MimePart>(2) as unknown as MimePart[];
    attachments.copyTo(copied, 0);

    expect(copied[0]).toBe(plain);
    expect(copied[1]).toBe(jpeg);

    attachments.removeAt(0);
    expect(attachments.count).toBe(1);
    expect(attachments.at(0)).toBe(jpeg);

    attachments.set(0, plain);
    expect(attachments.count).toBe(1);
    expect(attachments.at(0)).toBe(plain);

    attachments.insert(0, jpeg);
    expect(attachments.count).toBe(2);
    expect(attachments.at(0)).toBe(jpeg);
    expect(attachments.at(1)).toBe(plain);

    let i = 0;
    for (const attachment of attachments)
      copied[i++] = attachment as MimePart;

    expect(copied[0]).toBe(jpeg);
    expect(copied[1]).toBe(plain);
  });

  // message/rfc822 auto-detection + the FormatException octet-stream fallback (parser).
  const bodyMessagePath = join(testData, 'messages', 'body.1.txt');

  test('TestAddEmailMessage', () => {
    const attachments = new AttachmentCollection();
    const attachment = attachments.add('message.eml', streamOf(bodyMessagePath));

    expect(attachment.contentType.mimeType).toBe('message/rfc822');
    expect(attachment.contentType.name).toBe('message.eml');
    expect(attachment.contentDisposition).not.toBeNull();
    expect(attachment.contentDisposition!.disposition).toBe('attachment');
    expect(attachment.contentDisposition!.fileName).toBe('message.eml');
    expect(attachment).toBeInstanceOf(MessagePart);
    expect(attachments.count).toBe(1);

    expect(attachments.contains(attachment)).toBe(true);
    expect(attachments.indexOf(attachment)).toBe(0);
    expect(attachments.remove(attachment)).toBe(true);
    expect(attachments.count).toBe(0);
    attachments.clear(true);
  });

  test('TestAddEmailMessageFallback', () => {
    // girl.jpg is not a parseable message → falls back to application/octet-stream.
    const attachments = new AttachmentCollection();
    const attachment = attachments.add('message.eml', streamOf(girlPath));

    expect(attachment.contentType.mimeType).toBe('application/octet-stream');
    expect(attachment.contentType.name).toBe('message.eml');
    expect(attachment.contentDisposition).not.toBeNull();
    expect(attachment.contentDisposition!.disposition).toBe('attachment');
    expect(attachment.contentDisposition!.fileName).toBe('message.eml');
    expect(attachments.count).toBe(1);

    expect(attachments.contains(attachment)).toBe(true);
    expect(attachments.indexOf(attachment)).toBe(0);
    expect(attachments.remove(attachment)).toBe(true);
    expect(attachments.count).toBe(0);
    attachments.clear(true);
  });

  test('TestAddInlineEmailMessage', () => {
    const attachments = new AttachmentCollection(true);
    const attachment = attachments.add('message.eml', streamOf(bodyMessagePath));

    expect(attachment.contentType.mimeType).toBe('message/rfc822');
    expect(attachment.contentType.name).toBe('message.eml');
    expect(attachment.contentDisposition).not.toBeNull();
    expect(attachment.contentDisposition!.disposition).toBe('inline');
    expect(attachment.contentDisposition!.fileName).toBe('message.eml');
    expect(attachments.count).toBe(1);

    expect(attachments.contains(attachment)).toBe(true);
    expect(attachments.indexOf(attachment)).toBe(0);
    expect(attachments.remove(attachment)).toBe(true);
    expect(attachments.count).toBe(0);
    attachments.clear(true);
  });
  // omitted: *Async tests (async API not ported per plan Q4).
});

function assertGirl(attachment: MimePart, mimeType: string, disposition: string): void {
  expect(attachment.contentType.mimeType).toBe(mimeType);
  expect(attachment.contentType.name).toBe('girl.jpg');
  expect(attachment.contentDisposition).not.toBeNull();
  expect(attachment.contentDisposition!.disposition).toBe(disposition);
  expect(attachment.contentDisposition!.fileName).toBe('girl.jpg');
  expect(attachment.fileName).toBe('girl.jpg');
  expect(attachment.contentTransferEncoding).toBe('base64');
}
