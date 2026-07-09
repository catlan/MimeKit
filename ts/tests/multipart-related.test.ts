import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { BodyBuilder, ContentDisposition, ContentType, Header, HeaderId, MimeEntity, MimePart, MultipartRelated, TextPart } from '../src/index.js';
import { testDataDir } from './gates/helpers.js';

describe('MultipartRelated', () => {
  test('TestArgumentExceptions', () => {
    const related = new MultipartRelated();
    expect(() => new MultipartRelated(null as never)).toThrow(TypeError);
    expect(() => related.open(null as never)).toThrow(TypeError);
    expect(() => related.indexOfUri(null as never)).toThrow(TypeError);
    expect(() => related.accept(null as never)).toThrow(TypeError);
    expect(() => { related.root = null; }).toThrow(TypeError);
    expect(() => related.open('http://www.xamarin.com/logo.png')).toThrow();
  });

  test('TestGenericArgsConstructor', () => {
    const multipart = new MultipartRelated(
      new Header(HeaderId.ContentDescription, 'This is a description of the multipart.'),
      new TextPart('plain', 'This is the message body.'),
      new MimePart('image', 'gif'),
    );
    (multipart.at(1) as MimePart).fileName = 'attachment.gif';
    expect(multipart.headers.contains(HeaderId.ContentDescription)).toBe(true);
    expect(multipart.count).toBe(2);
    expect(multipart.at(0).contentType.mimeType).toBe('text/plain');
    expect(multipart.at(1).contentType.mimeType).toBe('image/gif');
  });

  test('TestDocumentRoot', () => {
    const gif = new MimePart('image', 'gif'); gif.contentDisposition = new ContentDisposition(ContentDisposition.inline); gif.fileName = 'empty.gif'; gif.contentId = 'gif@example.com';
    const jpg = new MimePart('image', 'jpg'); jpg.contentDisposition = new ContentDisposition(ContentDisposition.inline); jpg.fileName = 'empty.jpg'; jpg.contentId = 'jpg@example.com';
    const html = new TextPart('html'); html.text = 'This is the html body...'; html.contentId = 'html@example.com';
    const related = new MultipartRelated(gif, jpg, html);
    related.contentType.parameters.set('type', 'text/html');
    related.contentType.parameters.set('start', '<html@example.com>');
    expect(related.root).toBe(html);
    const root = new TextPart('html'); root.text = 'replacement';
    related.root = root;
    expect(related.count).toBe(3);
    expect(related.at(2)).toBe(root);
    expect(root.contentId).toBeTruthy();
    expect(related.contentType.parameters.get('start')).toBe(`<${root.contentId}>`);
    related.clear();
    related.add(gif); related.add(jpg); related.root = html;
    expect(related.at(0)).toBe(html);
    expect(related.contentType.parameters.get('start')).toBeNull();
  });

  test('TestReferenceByContentId', () => {
    const builder = new BodyBuilder();
    builder.htmlBody = '<html>This is an <b>html</b> body.</html>';
    builder.linkedResources.add('empty.gif', new Uint8Array(), new ContentType('image', 'gif'));
    builder.linkedResources.add('empty.jpg', new Uint8Array(), new ContentType('image', 'jpg'));

    for (const attachment of builder.linkedResources)
      attachment.contentId = `resource-${builder.linkedResources.indexOf(attachment)}@example.com`;

    const body = builder.toMessageBody();

    expect(body).toBeInstanceOf(MultipartRelated);

    const related = body as MultipartRelated;

    expect(related.contentType.parameters.get('type')).toBe('text/html');

    const root = related.root;

    expect(root).not.toBeNull();
    expect(root!.contentType.isMimeType('text', 'html')).toBe(true);
    expect(related.contentType.parameters.get('start')).toBeNull();

    for (let i = 1; i < related.count; i++) {
      const cid = `cid:${related.at(i).contentId}`;

      expect(related.containsUri(cid)).toBe(true);
      expect(related.indexOfUri(cid)).toBe(i);

      const info = related.openWithInfo(cid);
      expect(info.mimeType).toBe(related.at(i).contentType.mimeType);
      info.stream.dispose();

      expect(() => related.open(cid).dispose()).not.toThrow();
    }
  });

  test('TestReferenceByContentLocation', () => {
    const builder = new BodyBuilder();
    builder.htmlBody = '<html>This is an <b>html</b> body.</html>';
    builder.linkedResources.add('empty.gif', new Uint8Array(), new ContentType('image', 'gif'));
    builder.linkedResources.add('empty.jpg', new Uint8Array(), new ContentType('image', 'jpg'));

    const body = builder.toMessageBody();

    expect(body).toBeInstanceOf(MultipartRelated);

    const related = body as MultipartRelated;

    expect(related.contentType.parameters.get('type')).toBe('text/html');

    const root = related.root;

    expect(root).not.toBeNull();
    expect(root!.contentType.isMimeType('text', 'html')).toBe(true);
    expect(related.contentType.parameters.get('start')).toBeNull();

    for (let i = 1; i < related.count; i++) {
      const location = related.at(i).contentLocation;

      expect(location).not.toBeNull();
      expect(related.containsUri(location!)).toBe(true);
      expect(related.indexOfUri(location!)).toBe(i);

      const info = related.openWithInfo(location!);
      expect(info.mimeType).toBe(related.at(i).contentType.mimeType);
      info.stream.dispose();

      expect(() => related.open(location!).dispose()).not.toThrow();
    }
  });

  test('TestDocumentRootByType', () => {
    const bytes = new Uint8Array(readFileSync(join(testDataDir, 'messages', 'multipart-related-mhtml.txt')));
    const result = MimeEntity.load(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value).toBeInstanceOf(MultipartRelated);
    const related = result.value as MultipartRelated;

    expect(related.count, 'Count').toBe(2);

    const image = related.at(0);

    expect(image.contentType.mimeType, 'related[0]').toBe('image/png');

    const html = related.at(1);

    expect(html.contentType.mimeType, 'related[1]').toBe('text/html');

    expect(related.root, 'Root').toBe(html);
  });
});
