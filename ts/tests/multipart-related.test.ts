import { describe, expect, test } from 'vitest';
import { ContentDisposition, MimeContent, MimePart, MultipartRelated, TextPart, MemoryStream } from '../src/index.js';

describe('MultipartRelated', () => {
  test('TestArgumentExceptions', () => {
    const related = new MultipartRelated();
    expect(() => related.open(null as never)).toThrow(TypeError);
    expect(() => related.indexOfUri(null as never)).toThrow(TypeError);
    expect(() => related.accept(null as never)).toThrow(TypeError);
    expect(() => { related.root = null; }).toThrow(TypeError);
    expect(() => related.open('http://www.xamarin.com/logo.png')).toThrow();
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

  test('TestReferenceByContentIdAndLocation', () => {
    const part = new MimePart('image', 'gif');
    part.contentId = 'img@example.com';
    part.contentLocation = 'empty.gif';
    part.content = new MimeContent(new MemoryStream(new Uint8Array([1, 2, 3])));
    const related = new MultipartRelated(new TextPart('html'), part);
    expect(related.containsUri('cid:img@example.com')).toBe(true);
    expect(related.indexOfUri('cid:img@example.com')).toBe(1);
    expect(related.containsUri('empty.gif')).toBe(true);
    expect(related.openWithInfo('cid:img@example.com').mimeType).toBe('image/gif');
  });

  test.skip('TestDocumentRootByType', () => {
    // deferred(wave-4): requires MimeEntity.Load/parser.
  });
});
