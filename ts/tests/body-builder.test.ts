import { describe, expect, test } from 'vitest';
import { BodyBuilder, MultipartAlternative, TextPart, latin1, utf8 } from '../src/index.js';

describe('BodyBuilder', () => {
  test('TestArgumentExceptions', () => {
    const bodyBuilder = new BodyBuilder();
    expect(() => { bodyBuilder.bodyEncoding = null as never; }).toThrow(TypeError);
  });

  test('TestToMessageBodyDefault', () => {
    const bodyBuilder = new BodyBuilder();

    expect(bodyBuilder.bodyEncoding).toBe(utf8);

    const body = bodyBuilder.toMessageBody();

    expect(body).toBeInstanceOf(TextPart);

    const textBody = body as TextPart;
    expect(textBody.contentType.mimeType).toBe('text/plain');
    expect(textBody.contentType.charset).toBe('utf-8');
    expect(textBody.text).toBe('');
  });

  test('TestBodyEncodingTextPlain', () => {
    const bodyBuilder = new BodyBuilder();
    bodyBuilder.bodyEncoding = latin1;
    bodyBuilder.textBody = 'This is the text body.';
    const body = bodyBuilder.toMessageBody();

    expect(body).toBeInstanceOf(TextPart);

    const textBody = body as TextPart;
    expect(textBody.contentType.mimeType).toBe('text/plain');
    expect(textBody.contentType.charset).toBe('iso-8859-1');
    expect(textBody.text).toBe(bodyBuilder.textBody);
  });

  test('TestBodyEncodingTextHtml', () => {
    const bodyBuilder = new BodyBuilder();
    bodyBuilder.bodyEncoding = latin1;
    bodyBuilder.htmlBody = 'This is the html body.';
    const body = bodyBuilder.toMessageBody();

    expect(body).toBeInstanceOf(TextPart);

    const textBody = body as TextPart;
    expect(textBody.contentType.mimeType).toBe('text/html');
    expect(textBody.contentType.charset).toBe('iso-8859-1');
    expect(textBody.text).toBe(bodyBuilder.htmlBody);
  });

  test('TestBodyEncodingMultipartAlternative', () => {
    const bodyBuilder = new BodyBuilder();
    bodyBuilder.bodyEncoding = latin1;
    bodyBuilder.textBody = 'This is the text body.';
    bodyBuilder.htmlBody = 'This is the html body.';
    const body = bodyBuilder.toMessageBody();

    expect(body).toBeInstanceOf(MultipartAlternative);

    const alternative = body as MultipartAlternative;
    expect(alternative.count).toBe(2);
    expect(alternative.at(0)).toBeInstanceOf(TextPart);
    expect(alternative.at(1)).toBeInstanceOf(TextPart);

    const textBody = alternative.at(0) as TextPart;
    expect(textBody.contentType.mimeType).toBe('text/plain');
    expect(textBody.contentType.charset).toBe('iso-8859-1');
    expect(textBody.text).toBe(bodyBuilder.textBody);

    const htmlBody = alternative.at(1) as TextPart;
    expect(htmlBody.contentType.mimeType).toBe('text/html');
    expect(htmlBody.contentType.charset).toBe('iso-8859-1');
    expect(htmlBody.text).toBe(bodyBuilder.htmlBody);
  });
});
