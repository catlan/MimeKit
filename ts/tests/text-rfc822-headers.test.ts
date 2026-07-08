import { describe, expect, test } from 'vitest';
import {
  Header,
  HeaderId,
  MailboxAddress,
  MemoryStream,
  MimeMessage,
  MimeVisitor,
  TextRfc822Headers,
} from '../src/index.js';

class TextRfc822HeadersVisitor extends MimeVisitor {
  rfc822Headers: TextRfc822Headers | null = null;

  override visitTextRfc822Headers(entity: TextRfc822Headers): void {
    this.rfc822Headers = entity;
  }
}

describe('TextRfc822Headers', () => {
  test('TestArgumentExceptions', () => {
    const entity = new TextRfc822Headers();
    expect(() => new TextRfc822Headers('unknown-parameter')).toThrow(TypeError);
    expect(() => entity.accept(null as never)).toThrow(TypeError);
  });

  test('TestSerializationAndDeserialization', () => {
    let message = new MimeMessage();
    message.from.add(new MailboxAddress('Sender Name', 'sender@example.com'));
    message.to.add(new MailboxAddress('Recipient Name', 'recipient@example.com'));
    message.subject = 'Content of a text/rfc822-headers part';

    const rfc822headers = new TextRfc822Headers(new Header(HeaderId.ContentId, '<id@localhost>'), message);

    message = new MimeMessage();
    message.from.add(new MailboxAddress('Postmaster', 'postmaster@example.com'));
    message.to.add(new MailboxAddress('Sender Name', 'sender@example.com.com'));
    message.subject = 'Sorry, but your message bounced';
    message.body = rfc822headers;

    const stream = new MemoryStream();
    message.writeTo(stream);
    stream.position = 0;

    const result = MimeMessage.load(stream);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    message = result.value;

    const visitor = new TextRfc822HeadersVisitor();
    message.accept(visitor);

    expect(visitor.rfc822Headers, 'Rfc822Headers').not.toBeNull();
    expect(visitor.rfc822Headers!.contentId, 'ContentId').toBe('id@localhost');
  });
});
