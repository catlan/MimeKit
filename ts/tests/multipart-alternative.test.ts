import { describe, expect, test } from 'vitest';
import { Header, HeaderId, MimePart, Multipart, MultipartAlternative, MultipartRelated, TextFormat, TextPart } from '../src/index.js';

describe('MultipartAlternative', () => {
  test('TestArgumentExceptions', () => {
    const alternative = new MultipartAlternative();
    expect(() => alternative.accept(null as never)).toThrow(TypeError);
  });

  test('TestGenericArgsConstructor', () => {
    const multipart = new MultipartAlternative(
      new Header(HeaderId.ContentDescription, 'This is a description of the multipart.'),
      new TextPart(TextFormat.Plain, 'This is the message body.'),
      new MimePart('image', 'gif'),
    );
    (multipart.at(1) as MimePart).fileName = 'attachment.gif';
    expect(multipart.headers.contains(HeaderId.ContentDescription)).toBe(true);
    expect(multipart.count).toBe(2);
    expect(multipart.at(0).contentType.mimeType).toBe('text/plain');
    expect(multipart.at(1).contentType.mimeType).toBe('image/gif');
  });

  test('TestGetTextBody', () => {
    const alternative = new MultipartAlternative();
    const plain = new TextPart('plain'); plain.text = 'plain\n';
    const flowed = new TextPart(TextFormat.Flowed); flowed.text = 'flowed\n';
    const richtext = new TextPart('rtf'); richtext.text = 'rtf\n';
    const html = new TextPart('html'); html.text = 'html\n';
    alternative.add(plain);
    alternative.add(richtext);
    alternative.add(html);
    expect(alternative.textBody).toBe('plain\n');
    expect(alternative.htmlBody).toBe('html\n');
    alternative.insert(1, flowed);
    expect(alternative.getTextBody(TextFormat.Plain)).toBe('flowed\n');
    expect(alternative.getTextBody(TextFormat.Flowed)).toBe('flowed\n');
    expect(alternative.getTextBody(TextFormat.RichText)).toBe('rtf\n');
    expect(alternative.getTextBody(TextFormat.Html)).toBe('html\n');
    expect(alternative.getTextBody(TextFormat.Enriched)).toBeNull();
  });

  test('TestGetTextBodyNestedAlternativesAndRelated', () => {
    const alternative = new MultipartAlternative();
    const plain = new TextPart('plain'); plain.text = 'plain\n';
    const html = new TextPart('html'); html.text = 'html\n';
    alternative.add(plain);
    alternative.add(html);
    const related = new MultipartRelated(alternative);
    const outer = new MultipartAlternative(related);
    expect(outer.textBody).toBe('plain\n');
    expect(outer.htmlBody).toBe('html\n');
  });

  test('TestGetTextBodyMixedInsideAlternative', () => {
    const mixed = new Multipart('mixed');
    const plain = new TextPart('plain'); plain.text = 'plain\n';
    const html = new TextPart('html'); html.text = 'html\n';
    mixed.add(plain);
    mixed.add(html);
    const alternative = new MultipartAlternative(mixed);
    expect(alternative.getTextBody(TextFormat.Plain)).toBe('plain\n');
    expect(alternative.getTextBody(TextFormat.Html)).toBeNull();
  });
});
