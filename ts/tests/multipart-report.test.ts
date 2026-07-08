import { describe, expect, test } from 'vitest';
import { Header, HeaderId, MimePart, MultipartReport, TextPart, TextFormat } from '../src/index.js';

describe('MultipartReport', () => {
  test('TestArgumentExceptions', () => {
    const report = new MultipartReport('disposition-notification');
    expect(() => new MultipartReport(null as never)).toThrow(TypeError);
    expect(() => { report.reportType = null; }).toThrow(TypeError);
    expect(() => report.accept(null as never)).toThrow(TypeError);
  });

  test('TestGenericArgsConstructor', () => {
    const multipart = new MultipartReport('disposition-notification',
      new Header(HeaderId.ContentDescription, 'This is a description of the multipart.'),
      new TextPart(TextFormat.Plain, 'This is the message body.'),
      new MimePart('image', 'gif'),
    );
    expect(multipart.reportType).toBe('disposition-notification');
    expect(multipart.headers.contains(HeaderId.ContentDescription)).toBe(true);
    expect(multipart.count).toBe(2);
    expect(multipart.at(0).contentType.mimeType).toBe('text/plain');
    expect(multipart.at(1).contentType.mimeType).toBe('image/gif');
  });
});
