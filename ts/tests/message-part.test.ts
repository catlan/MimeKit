import { describe, expect, test } from 'vitest';
import { FormatOptions, MemoryStream, MessagePart, MimeContent, MimePart, type EncodingConstraint } from '../src/index.js';

describe('MessagePart', () => {
  test('TestPrepare', () => {
    const part = new MimePart('application', 'octet-stream');
    part.Content = new MimeContent(new MemoryStream(new Uint8Array(64)));
    const message = {
      body: part,
      prepare(constraint: EncodingConstraint, maxLineLength = 78): void { this.body.prepare(constraint, maxLineLength); },
      writeTo(_options: FormatOptions, _stream: MemoryStream): void {},
    };
    const rfc822 = new MessagePart();
    rfc822.Message = message;
    expect(part.getBestEncoding('7bit')).toBe('base64');
    rfc822.prepare('7bit');
    expect(part.contentTransferEncoding).toBe('base64');
    rfc822.prepare('7bit');
    expect(part.contentTransferEncoding).toBe('base64');
    part.contentTransferEncoding = 'binary';
    rfc822.prepare('none');
    expect(part.contentTransferEncoding).toBe('binary');
    rfc822.prepare('7bit');
    expect(part.contentTransferEncoding).toBe('base64');
  });
});
