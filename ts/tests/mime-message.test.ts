import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  FormatOptions,
  Header,
  HeaderId,
  HeaderList,
  InternetAddressList,
  MailboxAddress,
  MemoryStream,
  MessageImportance,
  MessagePriority,
  MimeContent,
  MimeMessage,
  MimeParser,
  TextFormat,
  TextPart,
  Version,
  XMessagePriority,
  createDateTimeOffset,
  dateTimeOffsetMinValue,
  formatDate,
  generateMessageId,
} from '../src/index.js';
import { testDataDir } from './gates/helpers.js';

function first<T>(iter: Iterable<T>): T {
  for (const item of iter) return item;
  throw new Error('empty');
}

function parseMessageText(text: string): MimeMessage {
  const parser = new MimeParser(new MemoryStream(new TextEncoder().encode(text)), 'entity');
  const result = parser.parseMessage();
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function serialize(message: MimeMessage, extra?: { ensureNewLine?: boolean; headersOnly?: boolean }): string {
  const options = FormatOptions.default.clone();
  options.newLineFormat = 'unix';
  if (extra?.ensureNewLine) options.ensureNewLine = true;

  const serialized = new MemoryStream();
  if (extra?.headersOnly) message.writeTo(options, serialized, true);
  else message.writeTo(options, serialized);

  return new TextDecoder().decode(serialized.toArray());
}

function loadMessageFile(rel: string): MimeMessage {
  const bytes = new Uint8Array(readFileSync(join(testDataDir, 'messages', rel)));
  const result = MimeMessage.load(bytes);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('MimeMessage', () => {
  test('TestArgumentExceptions', () => {
    const message = new MimeMessage();
    const body = new TextPart('plain');
    body.text = 'This is the message body.';

    expect(() => new MimeMessage(null as never)).toThrow(TypeError); // (IEnumerable<Header>) null
    expect(() => new MimeMessage(null, [], '', body)).toThrow(TypeError);
    expect(() => new MimeMessage([], null, '', body)).toThrow(TypeError);
    expect(() => new MimeMessage([], [], null, body)).toThrow(TypeError);

    expect(() => { message.importance = 500 as never; }).toThrow(RangeError);
    expect(() => { message.priority = 500 as never; }).toThrow(RangeError);
    expect(() => { message.xPriority = 500 as never; }).toThrow(RangeError);
    expect(() => { message.resentMessageId = 'this is some random text...'; }).toThrow(TypeError);
    expect(() => { message.messageId = 'this is some random text...'; }).toThrow(TypeError);
    expect(() => { message.inReplyTo = 'this is some random text...'; }).toThrow(TypeError);
    expect(() => { message.resentMessageId = null as never; }).toThrow(TypeError);
    expect(() => { message.messageId = null as never; }).toThrow(TypeError);
    expect(() => { message.subject = null as never; }).toThrow(TypeError);
    expect(() => { message.mimeVersion = null as never; }).toThrow(TypeError);

    // Load/LoadAsync overloads: deferred(wave-4) (parser).
    // Sign/Encrypt/SignAndEncrypt argument/state checks: omitted (crypto out of scope).
    // CreateFromMailMessage: omitted (System.Net.Mail interop).
    // WriteTo/WriteToAsync file (string) overloads: Node-only, omitted.

    expect(() => message.accept(null as never)).toThrow(TypeError);
    expect(() => message.prepare('none', 10)).toThrow(RangeError);
    expect(() => message.writeTo(null as never, new MemoryStream())).toThrow(TypeError);
    expect(() => message.writeTo(null as never)).toThrow(TypeError);
    expect(() => message.writeTo(FormatOptions.default, null as never)).toThrow(TypeError);
  });

  test('TestGetRecipients', () => {
    const message = new MimeMessage();
    message.sender = new MailboxAddress('Example Sender', 'sender@example.com');
    message.from.add(new MailboxAddress('Example From', 'from@example.com'));
    message.replyTo.add(new MailboxAddress('Example Reply-To', 'reply-to@example.com'));
    message.to.add(new MailboxAddress('Example To', 'to@example.com'));
    message.to.add(new MailboxAddress('Example To Duplicate', 'to@example.com'));
    message.cc.add(new MailboxAddress('Example Cc', 'cc@example.com'));
    message.cc.add(new MailboxAddress('Example Cc Duplicate', 'cc@example.com'));
    message.bcc.add(new MailboxAddress('Example Bcc', 'bcc@example.com'));
    message.bcc.add(new MailboxAddress('Example Bcc Duplicate', 'bcc@example.com'));

    let recipients = message.getRecipients(false);
    expect(recipients.length).toBe(6);
    expect(recipients[0]).toBe(message.to.at(0));
    expect(recipients[1]).toBe(message.to.at(1));
    expect(recipients[2]).toBe(message.cc.at(0));
    expect(recipients[3]).toBe(message.cc.at(1));
    expect(recipients[4]).toBe(message.bcc.at(0));
    expect(recipients[5]).toBe(message.bcc.at(1));

    recipients = message.getRecipients(true);
    expect(recipients.length).toBe(3);
    expect(recipients[0]).toBe(first(message.to.mailboxes));
    expect(recipients[1]).toBe(first(message.cc.mailboxes));
    expect(recipients[2]).toBe(first(message.bcc.mailboxes));

    message.resentSender = new MailboxAddress('Example Resent-Sender', 'resent-sender@example.com');
    message.resentFrom.add(new MailboxAddress('Example Resent-From', 'resent-from@example.com'));
    message.resentReplyTo.add(new MailboxAddress('Example Resent-Reply-To', 'resent-reply-to@example.com'));
    message.resentTo.add(new MailboxAddress('Example Resent-To', 'resent-to@example.com'));
    message.resentTo.add(new MailboxAddress('Example Resent-To Duplicate', 'resent-to@example.com'));
    message.resentCc.add(new MailboxAddress('Example Resent-Cc', 'resent-cc@example.com'));
    message.resentCc.add(new MailboxAddress('Example Resent-Cc Duplicate', 'resent-cc@example.com'));
    message.resentBcc.add(new MailboxAddress('Example Resent-Bcc', 'resent-bcc@example.com'));
    message.resentBcc.add(new MailboxAddress('Example Resent-Bcc Duplicate', 'resent-bcc@example.com'));

    recipients = message.getRecipients(false);
    expect(recipients.length).toBe(6);
    expect(recipients[0]).toBe(message.resentTo.at(0));
    expect(recipients[1]).toBe(message.resentTo.at(1));
    expect(recipients[2]).toBe(message.resentCc.at(0));
    expect(recipients[3]).toBe(message.resentCc.at(1));
    expect(recipients[4]).toBe(message.resentBcc.at(0));
    expect(recipients[5]).toBe(message.resentBcc.at(1));

    recipients = message.getRecipients(true);
    expect(recipients.length).toBe(3);
    expect(recipients[0]).toBe(first(message.resentTo.mailboxes));
    expect(recipients[1]).toBe(first(message.resentCc.mailboxes));
    expect(recipients[2]).toBe(first(message.resentBcc.mailboxes));
  });

  test('TestSettingCommonInvalidMessageIds', () => {
    const msgid = '[d7e8bc604f797c18ba8120250cbd8c04-JFBVALKQOJXWILKCJQZFA7CDNRQXE2LUPF6EIYLUMFGG643TPRCXQ32TNV2HA===@microsoft.com]';
    const message = new MimeMessage();

    expect(() => { message.messageId = msgid; }).not.toThrow();
    expect(message.messageId).toBe(msgid);

    expect(() => { message.resentMessageId = msgid; }).not.toThrow();
    expect(message.resentMessageId).toBe(msgid);

    expect(() => { message.inReplyTo = msgid; }).not.toThrow();
    expect(message.inReplyTo).toBe(msgid);
  });

  test('TestIssue135', () => {
    const message = new MimeMessage();
    const text = new TextPart('plain');
    text.contentTransferEncoding = 'base64';
    text.content = new MimeContent(new MemoryStream(new Uint8Array(1)));
    message.body = text;

    expect(() => message.toString()).not.toThrow();
  });

  test('TestImportance', () => {
    const message = new MimeMessage(
      [new MailboxAddress('Example Sender', 'sender@example.com')],
      [new MailboxAddress('Example Recipient', 'recipient@example.com')],
      'Yo dawg, what up?',
      textBody("Hey! What's happenin'?"),
    );

    expect(message.importance).toBe(MessageImportance.Normal);

    message.importance = MessageImportance.Normal;
    expect(message.headers.indexOf(HeaderId.Importance)).toBe(-1);

    message.importance = MessageImportance.Low;
    expect(message.importance).toBe(MessageImportance.Low);
    expect(message.headers.getValue(HeaderId.Importance)).toBe('low');

    message.importance = MessageImportance.High;
    expect(message.importance).toBe(MessageImportance.High);
    expect(message.headers.getValue(HeaderId.Importance)).toBe('high');

    message.importance = MessageImportance.Normal;
    expect(message.importance).toBe(MessageImportance.Normal);
    expect(message.headers.getValue(HeaderId.Importance)).toBe('normal');

    message.headers.setValue(HeaderId.Importance, 'high');
    expect(message.importance).toBe(MessageImportance.High);

    message.headers.setValue(HeaderId.Importance, 'low');
    expect(message.importance).toBe(MessageImportance.Low);

    message.headers.remove(HeaderId.Importance);
    expect(message.importance).toBe(MessageImportance.Normal);
  });

  test('TestPriority', () => {
    const message = new MimeMessage(
      [new MailboxAddress('Example Sender', 'sender@example.com')],
      [new MailboxAddress('Example Recipient', 'recipient@example.com')],
      'Yo dawg, what up?',
      textBody("Hey! What's happenin'?"),
    );

    expect(message.priority).toBe(MessagePriority.Normal);

    message.priority = MessagePriority.Normal;
    expect(message.headers.indexOf(HeaderId.Priority)).toBe(-1);

    message.priority = MessagePriority.NonUrgent;
    expect(message.priority).toBe(MessagePriority.NonUrgent);
    expect(message.headers.getValue(HeaderId.Priority)).toBe('non-urgent');

    message.priority = MessagePriority.Urgent;
    expect(message.priority).toBe(MessagePriority.Urgent);
    expect(message.headers.getValue(HeaderId.Priority)).toBe('urgent');

    message.priority = MessagePriority.Normal;
    expect(message.priority).toBe(MessagePriority.Normal);
    expect(message.headers.getValue(HeaderId.Priority)).toBe('normal');

    message.headers.setValue(HeaderId.Priority, 'non-urgent');
    expect(message.priority).toBe(MessagePriority.NonUrgent);

    message.headers.setValue(HeaderId.Priority, 'urgent');
    expect(message.priority).toBe(MessagePriority.Urgent);

    message.headers.remove(HeaderId.Priority);
    expect(message.priority).toBe(MessagePriority.Normal);
  });

  test('TestXPriority', () => {
    const message = new MimeMessage(
      [new MailboxAddress('Example Sender', 'sender@example.com')],
      [new MailboxAddress('Example Recipient', 'recipient@example.com')],
      'Yo dawg, what up?',
      textBody("Hey! What's happenin'?"),
    );

    expect(message.xPriority).toBe(XMessagePriority.Normal);

    message.xPriority = XMessagePriority.Normal;
    expect(message.headers.indexOf(HeaderId.XPriority)).toBe(-1);

    message.xPriority = XMessagePriority.Lowest;
    expect(message.xPriority).toBe(XMessagePriority.Lowest);
    expect(message.headers.getValue(HeaderId.XPriority)).toBe('5 (Lowest)');

    message.xPriority = XMessagePriority.Low;
    expect(message.xPriority).toBe(XMessagePriority.Low);
    expect(message.headers.getValue(HeaderId.XPriority)).toBe('4 (Low)');

    message.xPriority = XMessagePriority.Normal;
    expect(message.xPriority).toBe(XMessagePriority.Normal);
    expect(message.headers.getValue(HeaderId.XPriority)).toBe('3 (Normal)');

    message.xPriority = XMessagePriority.High;
    expect(message.xPriority).toBe(XMessagePriority.High);
    expect(message.headers.getValue(HeaderId.XPriority)).toBe('2 (High)');

    message.xPriority = XMessagePriority.Highest;
    expect(message.xPriority).toBe(XMessagePriority.Highest);
    expect(message.headers.getValue(HeaderId.XPriority)).toBe('1 (Highest)');

    message.headers.setValue(HeaderId.XPriority, '5');
    expect(message.xPriority).toBe(XMessagePriority.Lowest);

    message.headers.setValue(HeaderId.XPriority, '4');
    expect(message.xPriority).toBe(XMessagePriority.Low);

    message.headers.setValue(HeaderId.XPriority, '3');
    expect(message.xPriority).toBe(XMessagePriority.Normal);

    message.headers.setValue(HeaderId.XPriority, '2');
    expect(message.xPriority).toBe(XMessagePriority.High);

    message.headers.setValue(HeaderId.XPriority, '1');
    expect(message.xPriority).toBe(XMessagePriority.Highest);

    message.headers.remove(HeaderId.XPriority);
    expect(message.xPriority).toBe(XMessagePriority.Normal);

    message.headers.add(HeaderId.XPriority, 'garbage');
    expect(message.xPriority).toBe(XMessagePriority.Normal);
  });

  test('TestResend', () => {
    const message = new MimeMessage(
      [new MailboxAddress('Example From', 'from@example.com')],
      [new MailboxAddress('Example Recipient', 'recipient@example.com')],
      'Yo dawg, what up?',
      textBody("Hey! What's happenin'?"),
    );

    message.date = createDateTimeOffset(1997, 6, 28, 12, 47, 52, -5 * 60);
    message.replyTo.add(new MailboxAddress('Example Reply-To', 'reply-to@example.com'));
    message.sender = new MailboxAddress('Example Sender', 'sender@example.com');
    message.messageId = generateMessageId();

    message.resentSender = new MailboxAddress('Resent Sender', 'resent-sender@example.com');
    message.resentFrom.add(new MailboxAddress('Resent From', 'resent-from@example.com'));
    message.resentReplyTo.add(new MailboxAddress('Resent Reply-To', 'resent-reply-to@example.com'));
    message.resentTo.add(new MailboxAddress('Resent To', 'resent-to@example.com'));
    message.resentCc.add(new MailboxAddress('Resent Cc', 'resent-cc@example.com'));
    message.resentBcc.add(new MailboxAddress('Resent Bcc', 'resent-bcc@example.com'));
    message.resentDate = createDateTimeOffset(2007, 6, 28, 12, 47, 52, -5 * 60);
    const value = generateMessageId();
    message.resentMessageId = value;

    expect(message.headers.getValue(HeaderId.ResentSender)).toBe('Resent Sender <resent-sender@example.com>');
    expect(message.headers.getValue(HeaderId.ResentFrom)).toBe('Resent From <resent-from@example.com>');
    expect(message.headers.getValue(HeaderId.ResentReplyTo)).toBe('Resent Reply-To <resent-reply-to@example.com>');
    expect(message.headers.getValue(HeaderId.ResentTo)).toBe('Resent To <resent-to@example.com>');
    expect(message.headers.getValue(HeaderId.ResentCc)).toBe('Resent Cc <resent-cc@example.com>');
    expect(message.headers.getValue(HeaderId.ResentBcc)).toBe('Resent Bcc <resent-bcc@example.com>');
    expect(message.headers.getValue(HeaderId.ResentDate)).toBe('Thu, 28 Jun 2007 12:47:52 -0500');
    expect(message.headers.getValue(HeaderId.ResentMessageId)).toBe(`<${value}>`);
  });

  test('TestChangeHeaders', () => {
    // Adapted from the reflection-driven C# test: each MimeMessage property whose
    // name maps to a HeaderId is exercised through the raw Headers API.
    const addressList1 = '"Example 1" <example1@example.com>, "Example 2" <example2@example.com>';
    const addressList2 = '"Example 3" <example3@example.com>, "Example 4" <example4@example.com>';
    const references1 = '<id1@example.com> <id2@example.com>';
    const references2 = '<id3@example.com> <id4@example.com>';
    const mailbox1 = '"Example 1" <example1@example.com>';
    const mailbox2 = '"Example 2" <example2@example.com>';
    const date1 = 'Thu, 28 Jun 2007 12:47:52 -0500';
    const date2 = 'Fri, 29 Jun 2007 12:47:52 -0500';
    const msgid1 = 'message-id1@example.com';
    const msgid2 = 'message-id2@example.com';
    const version1 = '1.0';
    const version2 = '2.0';
    const message = new MimeMessage();

    const addressLists: [HeaderId, () => InternetAddressList][] = [
      [HeaderId.From, () => message.from],
      [HeaderId.ResentFrom, () => message.resentFrom],
      [HeaderId.ReplyTo, () => message.replyTo],
      [HeaderId.ResentReplyTo, () => message.resentReplyTo],
      [HeaderId.To, () => message.to],
      [HeaderId.ResentTo, () => message.resentTo],
      [HeaderId.Cc, () => message.cc],
      [HeaderId.ResentCc, () => message.resentCc],
      [HeaderId.Bcc, () => message.bcc],
      [HeaderId.ResentBcc, () => message.resentBcc],
    ];
    for (const [id, get] of addressLists) {
      message.headers.setValue(id, addressList1);
      expect(get().toString()).toBe(addressList1);
      message.headers.set(message.headers.indexOf(id), new Header(id, addressList2));
      expect(get().toString()).toBe(addressList2);
    }

    const mailboxes: [HeaderId, () => MailboxAddress | null, (v: MailboxAddress | null) => void][] = [
      [HeaderId.Sender, () => message.sender, (v) => { message.sender = v; }],
      [HeaderId.ResentSender, () => message.resentSender, (v) => { message.resentSender = v; }],
    ];
    for (const [id, get, set] of mailboxes) {
      message.headers.setValue(id, mailbox1);
      expect(get()!.toString()).toBe(mailbox1);
      message.headers.set(message.headers.indexOf(id), new Header(id, mailbox2));
      expect(get()!.toString()).toBe(mailbox2);
      set(null);
      expect(get()).toBeNull();
      expect(message.headers.indexOf(id)).toBe(-1);
    }

    // MessageIdList (References)
    message.headers.setValue(HeaderId.References, references1);
    expect(message.references.toString()).toBe(references1);
    message.headers.set(message.headers.indexOf(HeaderId.References), new Header(HeaderId.References, references2));
    expect(message.references.toString()).toBe(references2);

    // DateTimeOffset (Date, ResentDate)
    for (const [id, get, set] of [
      [HeaderId.Date, () => message.date, (v: import('../src/index.js').DateTimeOffset) => { message.date = v; }],
      [HeaderId.ResentDate, () => message.resentDate, (v: import('../src/index.js').DateTimeOffset) => { message.resentDate = v; }],
    ] as const) {
      message.headers.setValue(id, date1);
      expect(formatDate(get())).toBe(date1);
      message.headers.set(message.headers.indexOf(id), new Header(id, date2));
      expect(formatDate(get())).toBe(date2);
      set(get());
    }

    // Version (MimeVersion)
    message.headers.setValue(HeaderId.MimeVersion, version1);
    expect(message.mimeVersion!.toString()).toBe(version1);
    message.headers.set(message.headers.indexOf(HeaderId.MimeVersion), new Header(HeaderId.MimeVersion, version2));
    expect(message.mimeVersion!.toString()).toBe(version2);
    message.mimeVersion = message.mimeVersion!;

    // String message-ids (MessageId, ResentMessageId, InReplyTo)
    for (const [id, get, set] of [
      [HeaderId.MessageId, () => message.messageId, (v: string) => { message.messageId = v; }],
      [HeaderId.ResentMessageId, () => message.resentMessageId, (v: string) => { message.resentMessageId = v; }],
      [HeaderId.InReplyTo, () => message.inReplyTo, (v: string) => { message.inReplyTo = v; }],
    ] as const) {
      message.headers.setValue(id, `<${msgid1}>`);
      expect(get()).toBe(msgid1);
      message.headers.set(message.headers.indexOf(id), new Header(id, `<${msgid2}>`));
      expect(get()).toBe(msgid2);
      set(msgid1);
      set(`<${msgid1}>`);
      expect(get()).toBe(msgid1);
      if (id === HeaderId.InReplyTo) {
        message.inReplyTo = null;
        expect(message.inReplyTo).toBeNull();
        expect(message.headers.indexOf(id)).toBe(-1);
      }
    }

    // Subject
    message.headers.setValue(HeaderId.Subject, 'Subject #1');
    expect(message.subject).toBe('Subject #1');
    message.headers.set(message.headers.indexOf(HeaderId.Subject), new Header(HeaderId.Subject, 'Subject #2'));
    expect(message.subject).toBe('Subject #2');
  });

  test('TestImportanceChanged', () => {
    const message = new MimeMessage();

    message.headers.add(HeaderId.Importance, 'high');
    expect(message.importance).toBe(MessageImportance.High);

    message.headers.remove(HeaderId.Importance);
    expect(message.importance).toBe(MessageImportance.Normal);

    message.headers.add(HeaderId.Importance, 'low');
    expect(message.importance).toBe(MessageImportance.Low);

    message.headers.remove(HeaderId.Importance);
    expect(message.importance).toBe(MessageImportance.Normal);

    message.headers.add(HeaderId.Importance, 'normal');
    expect(message.importance).toBe(MessageImportance.Normal);

    message.headers.remove(HeaderId.Importance);
    expect(message.importance).toBe(MessageImportance.Normal);

    message.headers.add(HeaderId.Importance, 'invalid-value');
    expect(message.importance).toBe(MessageImportance.Normal);
  });

  test('TestPriorityChanged', () => {
    const message = new MimeMessage();

    message.headers.add(HeaderId.Priority, 'urgent');
    expect(message.priority).toBe(MessagePriority.Urgent);

    message.headers.remove(HeaderId.Priority);
    expect(message.priority).toBe(MessagePriority.Normal);

    message.headers.add(HeaderId.Priority, 'non-urgent');
    expect(message.priority).toBe(MessagePriority.NonUrgent);

    message.headers.remove(HeaderId.Priority);
    expect(message.priority).toBe(MessagePriority.Normal);

    message.headers.add(HeaderId.Priority, 'normal');
    expect(message.priority).toBe(MessagePriority.Normal);

    message.headers.remove(HeaderId.Priority);
    expect(message.priority).toBe(MessagePriority.Normal);

    message.headers.add(HeaderId.Priority, 'invalid-value');
    expect(message.priority).toBe(MessagePriority.Normal);
  });

  test('TestReferencesChanged', () => {
    const message = new MimeMessage();

    message.headers.add(HeaderId.References, '<id1@localhost> <id2@localhost>');
    expect(message.references.count).toBe(2);
    expect(message.references.at(0)).toBe('id1@localhost');
    expect(message.references.at(1)).toBe('id2@localhost');

    message.references.add('id3@localhost');

    const references = message.headers.tryGetHeader('References');
    expect(references).not.toBeNull();
    expect(references!.value).toBe('<id1@localhost> <id2@localhost> <id3@localhost>');

    message.references.clear();

    expect(message.headers.tryGetHeader('References')).toBeNull();
  });

  test('TestClearHeaders', () => {
    const message = new MimeMessage();

    message.subject = 'Clear the headers!';

    message.sender = new MailboxAddress('Sender', 'sender@sender.com');
    message.replyTo.add(new MailboxAddress('Reply-To', 'reply-to@reply-to.com'));
    message.from.add(new MailboxAddress('From', 'from@from.com'));
    message.to.add(new MailboxAddress('To', 'to@to.com'));
    message.cc.add(new MailboxAddress('Cc', 'cc@cc.com'));
    message.bcc.add(new MailboxAddress('Bcc', 'bcc@bcc.com'));
    message.messageId = generateMessageId();
    message.date = createDateTimeOffset(2007, 6, 28, 12, 47, 52, -5 * 60);

    message.resentSender = new MailboxAddress('Sender', 'sender@sender.com');
    message.resentReplyTo.add(new MailboxAddress('Reply-To', 'reply-to@reply-to.com'));
    message.resentFrom.add(new MailboxAddress('From', 'from@from.com'));
    message.resentTo.add(new MailboxAddress('To', 'to@to.com'));
    message.resentCc.add(new MailboxAddress('Cc', 'cc@cc.com'));
    message.resentBcc.add(new MailboxAddress('Bcc', 'bcc@bcc.com'));
    message.resentMessageId = generateMessageId();
    message.resentDate = createDateTimeOffset(2007, 6, 28, 12, 47, 52, -5 * 60);

    message.importance = MessageImportance.High;
    message.priority = MessagePriority.Urgent;

    message.references.add('<id1@localhost>');
    message.inReplyTo = '<id1@localhost>';

    message.mimeVersion = new Version(1, 0);

    message.headers.clear();

    expect(message.subject).toBeNull();

    expect(message.sender).toBeNull();
    expect(message.replyTo.count).toBe(0);
    expect(message.from.count).toBe(0);
    expect(message.to.count).toBe(0);
    expect(message.cc.count).toBe(0);
    expect(message.bcc.count).toBe(0);
    expect(message.messageId).toBeNull();
    expect(message.date).toEqual(dateTimeOffsetMinValue);

    expect(message.resentSender).toBeNull();
    expect(message.resentReplyTo.count).toBe(0);
    expect(message.resentFrom.count).toBe(0);
    expect(message.resentTo.count).toBe(0);
    expect(message.resentCc.count).toBe(0);
    expect(message.resentBcc.count).toBe(0);
    expect(message.resentMessageId).toBeNull();
    expect(message.resentDate).toEqual(dateTimeOffsetMinValue);

    expect(message.importance).toBe(MessageImportance.Normal);
    expect(message.priority).toBe(MessagePriority.Normal);

    expect(message.references.count).toBe(0);
    expect(message.inReplyTo).toBeNull();

    expect(message.mimeVersion).toBeNull();
  });

  // --- Parser-dependent cases (C#: UnitTests/MimeMessageTests.cs) ---
  test('TestPrependHeader', () => {
    const rawMessageText = `Date: Fri, 22 Jan 2016 8:44:05 -0500 (EST)
From: MimeKit Unit Tests <unit.tests@mimekit.org>
To: MimeKit Unit Tests <unit.tests@mimekit.org>
Subject: This is a test off prepending headers.
Message-Id: <id@localhost.com>
MIME-Version: 1.0
Content-Type: text/plain

This is the message body.
`;
    const expected = 'X-Prepended: This is the prepended header\n' + rawMessageText;

    const message = parseMessageText(rawMessageText);
    message.headers.insert(0, new Header('X-Prepended', 'This is the prepended header'));

    expect(serialize(message)).toBe(expected);
  });

  test('TestReserialization', () => {
    const rawMessageText = `X-Andrew-Authenticated-As: 4099;greenbush.galaxy;Nathaniel Borenstein
Received: from Messages.8.5.N.CUILIB.3.45.SNAP.NOT.LINKED.greenbush.galaxy.sun4.41
          via MS.5.6.greenbush.galaxy.sun4_41;
          Fri, 12 Jun 1992 13:29:05 -0400 (EDT)
Message-ID : <UeCBvVq0M2Yt4oUA83@thumper.bellcore.com>
Date: Fri, 12 Jun 1992 13:29:05 -0400 (EDT)
From: Nathaniel Borenstein <nsb>
X-Andrew-Message-Size: 152+1
MIME-Version: 1.0
Content-Type: multipart/alternative; 
	boundary="Multipart.Alternative.IeCBvV20M2YtEoUA0A"
To: Ned Freed <ned@innosoft.com>,
    ysato@etl.go.jp (Yutaka Sato =?ISO-2022-JP?B?GyRAOjRGI0stGyhK?= )
Subject: MIME & int'l mail

> THIS IS A MESSAGE IN 'MIME' FORMAT.  Your mail reader does not support MIME.
> Please read the first section, which is plain text, and ignore the rest.

--Multipart.Alternative.IeCBvV20M2YtEoUA0A
Content-type: text/plain; charset=US-ASCII

In honor of the Communications Week error about MIME's ability to handle
international character sets. a screen dump:

[An Andrew ToolKit view (mailobjv) was included here, but could not be
displayed.]
Just for fun....  -- Nathaniel

--Multipart.Alternative.IeCBvV20M2YtEoUA0A
Content-Type: multipart/mixed; 
	boundary="Multipart.Mixed.IeCBvV20M2Yt4oU=wd"

--Multipart.Mixed.IeCBvV20M2Yt4oU=wd
Content-type: text/richtext; charset=US-ASCII
Content-Transfer-Encoding: quoted-printable

In honor of the <italic>Communications Week</italic> error about MIME's abilit=
y to handle international character sets. a screen dump:<nl>
<nl>

--Multipart.Mixed.IeCBvV20M2Yt4oU=wd
Content-type: image/gif
Content-Transfer-Encoding: base64

R0lGODdhEgLiAKEAAAAAAP///wAA////4CwAAAAAEgLiAAAC/oSPqcvtD6OctNqLs968
...
R+mUIAiVUTmCU0mVJmiVV5mCfaiVQtaUXVlKXwmWZiSWY3lDZWmWIISWaalUWcmW+bWW
b9lAcSmXCUSXdWlKbomX7HWXe4llXOmXQAmYgTmUg0mYRmmYh5mUscGYjemYjwmZkSmZ
k0mZlWmZl4mZqVEAADs=

--Multipart.Mixed.IeCBvV20M2Yt4oU=wd
Content-type: message/rfc822
Content-Description: a message with an mbox marker

From mbox@localhost
Date: Fri, 22 Jan 2016 8:44:05 -0500 (EST)
From: MimeKit Unit Tests <unit.tests@mimekit.org>
To: MimeKit Unit Tests <unit.tests@mimekit.org>
MIME-Version: 1.0
Content-type: text/plain

This is an attached message.

--Multipart.Mixed.IeCBvV20M2Yt4oU=wd
Content-type: text/richtext; charset=US-ASCII
Content-Transfer-Encoding: quoted-printable

<nl>
<nl>
Just for fun....  -- Nathaniel<nl>

--Multipart.Alternative.IeCBvV20M2YtEoUA0A--
`;

    const message = parseMessageText(rawMessageText);

    expect(serialize(message)).toBe(rawMessageText);

    const index = rawMessageText.indexOf('\n\n');
    const headersOnly = rawMessageText.substring(0, index + 2);

    expect(serialize(message, { headersOnly: true })).toBe(headersOnly);
  });

  test('TestReserializationEmptyParts', () => {
    const rawMessageText = `Date: Fri, 22 Jan 2016 8:44:05 -0500 (EST)
From: MimeKit Unit Tests <unit.tests@mimekit.org>
To: MimeKit Unit Tests <unit.tests@mimekit.org>
MIME-Version: 1.0
Content-Type: multipart/mixed; 
	boundary="Interpart.Boundary.IeCBvV20M2YtEoUA0A"
Subject: Reserialization test of empty mime parts

THIS IS A MESSAGE IN 'MIME' FORMAT.  Your mail reader does not support MIME.
Please read the first section, which is plain text, and ignore the rest.

--Interpart.Boundary.IeCBvV20M2YtEoUA0A
Content-type: text/plain; charset=US-ASCII

This is the body.

--Interpart.Boundary.IeCBvV20M2YtEoUA0A
Content-type: text/plain; charset=US-ASCII; name=empty.txt
Content-Description: this part contains no content

--Interpart.Boundary.IeCBvV20M2YtEoUA0A
Content-type: text/plain; charset=US-ASCII; name=blank-line.txt
Content-Description: this part contains a single blank line


--Interpart.Boundary.IeCBvV20M2YtEoUA0A--
`;

    const message = parseMessageText(rawMessageText);

    expect(serialize(message)).toBe(rawMessageText);
  });

  test('TestReserializationMessageParts', () => {
    const rawMessageText = `Path: flop.mcom.com!news.Stanford.EDU!agate!tcsi.tcs.com!uunet!vixen.cso.uiuc.edu!gateway
From: Internet-Drafts@CNRI.Reston.VA.US
Subject: I-D ACTION:draft-smith-ipatm-bcast-00.txt
Date: 25 Apr 95 15:09:13 GMT
Organization: University of Illinois at Urbana
Lines: 96
Approved: Usenet@ux1.cso.uiuc.edu
Message-ID: <9504251109.aa04587@IETF.CNRI.Reston.VA.US>
Reply-To: Internet-Drafts@CNRI.Reston.VA.US
NNTP-Posting-Host: ux1.cso.uiuc.edu
Mime-Version: 1.0
Content-Type: Multipart/Mixed; Boundary="NextPart"
Originator: daemon@ux1.cso.uiuc.edu

--NextPart

here are a couple of external bodies:

--NextPart
Content-Type: Multipart/MIXED; Boundary="OtherAccess"

--OtherAccess
Content-Type:  Message/External-body;
        access-type="mail-server";
        server="mailserv@ds.internic.net"

Content-Type: text/plain
Content-ID: <19950424144009.I-D@CNRI.Reston.VA.US>

ENCODING mime
FILE /internet-drafts/draft-smith-ipatm-bcast-00.txt

--OtherAccess
Content-Type:   Message/External-body;
        name="draft-smith-ipatm-bcast-00.txt";
        site="ds.internic.net";
        access-type="anon-ftp";
        directory="internet-drafts"

Content-Type: text/plain
Content-ID: <19950424144009.I-D@CNRI.Reston.VA.US>

--OtherAccess
Content-Type: message/external-body;
        access-type="URL";
        url="http://home.netscape.com/
		people/
		jwz/
		index.html"

Content-Type: TEXT/HTML
Content-ID: <spankulate@hubba.hubba.hubba>

--OtherAccess
Content-Type: message/external-body;
        access-type="local-file";
        name="/some/directory/loser.gif"

Content-Type: image/gif
Content-ID: <spankulate3@hubba.hubba.hubba>

--OtherAccess
Content-Type: message/external-body;
        access-type="afs";
        name="/afs/directory/loser.gif"

Content-Type: image/gif
Content-ID: <spankulate4@hubba.hubba.hubba>

--OtherAccess--

--NextPart--
`;

    const message = parseMessageText(rawMessageText);

    expect(serialize(message)).toBe(rawMessageText);
  });

  test('TestReserializationEpilogue', () => {
    const rawMessageText = `From: Example Test <test@example.com>
MIME-Version: 1.0
Content-Type: multipart/mixed;
   boundary="simple boundary"

This is the preamble.

--simple boundary
Content-TypeS: text/plain

This is a test.

--simple boundary
Content-Type: text/plain
Content-Disposition: attachment
Content-Transfer-Encoding: 7bit

Another test.

--simple boundary--


This is the epilogue.`;

    const message = parseMessageText(rawMessageText);

    expect(serialize(message)).toBe(rawMessageText);
    expect(serialize(message, { ensureNewLine: true })).toBe(rawMessageText + '\n');
  });

  test('TestReserializationMultipartPreambleNoBoundary', () => {
    const rawMessageText = `From: Example Test <test@example.com>
Content-Type: multipart/mixed

This is the preamble.
.`;

    const message = parseMessageText(rawMessageText);

    expect(serialize(message)).toBe(rawMessageText);
    expect(serialize(message, { ensureNewLine: true })).toBe(rawMessageText + '\n');
  });

  test('TestReserializationInvalidHeaders', () => {
    const rawMessageText = `From: Example Test <test@example.com>
MIME-Version: 1.0
Content-Type: multipart/mixed;
   boundary="simple boundary"
Example: test
Test
Test Test
Test:
Test: 
Test: Test
Test Example:

This is the preamble.

--simple boundary
Content-TypeS: text/plain

This is a test.

--simple boundary
Content-Type: text/plain;
Content-Disposition: attachment;
Content-Transfer-Encoding: test;
Content-Transfer-Encoding: binary;
Test Test Test: Test Test
Te$t($)*$= Test Test: Abc def
test test = test
test test :: test
filename="test.txt"

Another test.

--simple boundary--


This is the epilogue.
`;

    const message = parseMessageText(rawMessageText);

    expect(serialize(message)).toBe(rawMessageText);
  });

  test('TestReserializationDeliveryStatusReportWithEnsureNewLine', () => {
    const rawMessageText = `From: est@somwhere.com
Date: Fri, 15 Feb 2019 16:00:08 +0000
Subject: report_with_no_body
To: tom@to.com
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="A41C7.838631588=_/mm1"


Processing your mail message caused the following errors:

error: err.nosuchuser: newsletter-request@imusic.com

--A41C7.838631588=_/mm1
Content-Type: message/delivery-status

Reporting-MTA: dns; mm1
Arrival-Date: Mon, 29 Jul 1996 02:12:50 -0700

Final-Recipient: RFC822; newsletter-request@imusic.com
Action: failed
Diagnostic-Code: X-LOCAL; 500 (err.nosuchuser)

--A41C7.838631588=_/mm1
Content-Type: message/rfc822

Received: from urchin.netscape.com ([198.95.250.59]) by mm1.sprynet.com with ESMTP id <148217-12799>; Mon, 29 Jul 1996 02:12:50 -0700
Received: from gruntle (gruntle.mcom.com [205.217.230.10]) by urchin.netscape.com (8.7.5/8.7.3) with SMTP id CAA24688 for <newsletter-request@imusic.com>; Mon, 29 Jul 1996 02:04:53 -0700 (PDT)
Sender: jwz@netscape.com
Message-ID: <31FC7EB4.41C6@netscape.com>
Date: Mon, 29 Jul 1996 02:04:52 -0700
From: Jamie Zawinski <jwz@netscape.com>
Organization: Netscape Communications Corporation, Mozilla Division
X-Mailer: Mozilla 3.0b6 (X11; U; IRIX 5.3 IP22)
MIME-Version: 1.0
To: newsletter-request@imusic.com
Subject: unsubscribe
References: <96Jul29.013736-0700pdt.148116-12799+675@mm1.sprynet.com>
Content-Type: text/plain; charset=us-ascii
Content-Transfer-Encoding: 7bit

unsubscribe
--A41C7.838631588=_/mm1--
`;

    const message = parseMessageText(rawMessageText);

    expect(serialize(message, { ensureNewLine: true })).toBe(rawMessageText);
  });

  test('TestReserializationNewFromHeaderList', () => {
    const rawRfc822Headers = `X-Andrew-Authenticated-As: 4099;greenbush.galaxy;Nathaniel Borenstein
Received: from Messages.8.5.N.CUILIB.3.45.SNAP.NOT.LINKED.greenbush.galaxy.sun4.41
          via MS.5.6.greenbush.galaxy.sun4_41;
          Fri, 12 Jun 1992 13:29:05 -0400 (EDT)
Message-ID : <UeCBvVq0M2Yt4oUA83@thumper.bellcore.com>
Date: Fri, 12 Jun 1992 13:29:05 -0400 (EDT)
From: Nathaniel Borenstein <nsb>
X-Andrew-Message-Size: 152+1
MIME-Version: 1.0
To: Ned Freed <ned@innosoft.com>,
    ysato@etl.go.jp (Yutaka Sato =?ISO-2022-JP?B?GyRAOjRGI0stGyhK?= )
Subject: MIME & int'l mail

`;

    const result = HeaderList.load(new TextEncoder().encode(rawRfc822Headers));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const message = new MimeMessage(result.value);

    expect(message.date).toEqual(createDateTimeOffset(1992, 6, 12, 13, 29, 5, -4 * 60));
    expect(message.from.count).toBe(1);
    const from = first(message.from.mailboxes);
    expect(from.name).toBe('Nathaniel Borenstein');
    expect(from.address).toBe('nsb');
    expect(message.to.count).toBe(2);
    const to = [...message.to.mailboxes];
    expect(to[0]!.name).toBe('Ned Freed');
    expect(to[0]!.address).toBe('ned@innosoft.com');
    expect(to[1]!.name).toBe('Yutaka Sato 佐藤豊');
    expect(to[1]!.address).toBe('ysato@etl.go.jp');
    expect(message.subject).toBe("MIME & int'l mail");

    // Test reserialization of the rfc822 headers
    expect(serialize(message)).toBe(rawRfc822Headers);
  });

  test('TestReserializationNewFromIEnumerableHeader', () => {
    const rawRfc822Headers = `X-Andrew-Authenticated-As: 4099;greenbush.galaxy;Nathaniel Borenstein
Received: from Messages.8.5.N.CUILIB.3.45.SNAP.NOT.LINKED.greenbush.galaxy.sun4.41
          via MS.5.6.greenbush.galaxy.sun4_41;
          Fri, 12 Jun 1992 13:29:05 -0400 (EDT)
Message-ID : <UeCBvVq0M2Yt4oUA83@thumper.bellcore.com>
Date: Fri, 12 Jun 1992 13:29:05 -0400 (EDT)
From: Nathaniel Borenstein <nsb>
X-Andrew-Message-Size: 152+1
MIME-Version: 1.0
To: Ned Freed <ned@innosoft.com>,
    ysato@etl.go.jp (Yutaka Sato =?ISO-2022-JP?B?GyRAOjRGI0stGyhK?= )
Subject: MIME & int'l mail

`;

    const result = HeaderList.load(new TextEncoder().encode(rawRfc822Headers));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const headers = [...result.value];

    const message = new MimeMessage(headers);

    expect(message.date).toEqual(createDateTimeOffset(1992, 6, 12, 13, 29, 5, -4 * 60));
    expect(message.from.count).toBe(1);
    const from = first(message.from.mailboxes);
    expect(from.name).toBe('Nathaniel Borenstein');
    expect(from.address).toBe('nsb');
    expect(message.to.count).toBe(2);
    const to = [...message.to.mailboxes];
    expect(to[0]!.name).toBe('Ned Freed');
    expect(to[0]!.address).toBe('ned@innosoft.com');
    expect(to[1]!.name).toBe('Yutaka Sato 佐藤豊');
    expect(to[1]!.address).toBe('ysato@etl.go.jp');
    expect(message.subject).toBe("MIME & int'l mail");

    // Test reserialization of the rfc822 headers
    expect(serialize(message)).toBe(rawRfc822Headers);
  });

  test('TestHtmlAndTextBodies', () => {
    const HtmlBody = '<html>This is an <b>html</b> body.</html>';
    const TextBody = 'This is the text body.';
    const cases: [string, string | null, string | null][] = [
      ['body.1.txt', TextBody, null],
      ['body.2.txt', null, HtmlBody],
      ['body.3.txt', TextBody, HtmlBody],
      ['body.4.txt', null, HtmlBody],
      ['body.5.txt', TextBody, HtmlBody],
      ['body.6.txt', TextBody, HtmlBody],
      ['body.7.txt', TextBody, HtmlBody],
      ['body.8.txt', TextBody, null],
      ['body.9.txt', null, HtmlBody],
    ];

    for (const [file, textBody, htmlBody] of cases) {
      const message = loadMessageFile(file);
      expect(message.textBody, `The text bodies do not match for ${file}.`).toBe(textBody);
      expect(message.htmlBody, `The HTML bodies do not match for ${file}.`).toBe(htmlBody);
    }
  });

  test('TestFlowedTextBodyIssue1130', () => {
    const TextBody = 'We should have access, and apparently did a few months ago, but now there isa "You do not currently have access to this content." at the bottom of therecord\n\nThe URL in question URL:\nhttps://example.com/';
    const message = loadMessageFile('issue1130.txt');

    const body = message.getTextBody(TextFormat.Flowed)!.replace(/\r\n/g, '\n');

    expect(body, 'The text bodies do not match for issue1130.txt.').toBe(TextBody);
  });

  test('TestNoBodyWithTextAttachment', () => {
    const rawMessageText = `From: sender@domain.com
Date: Tue, 29 Aug 2017 09:45:39 +1000
Subject: This has no body, just a text attachment
Message-Id: <75SXBEJJ72U4.5KFFZ6J56L2T2@localhost.localdomain>
MIME-Version: 1.0
Content-Type: text/plain; name="Plain Text.txt"
Content-Disposition: attachment; filename="Plain Text.txt"
Content-Transfer-Encoding: 7bit

This is the text attachment`;

    const message = parseMessageText(rawMessageText);

    expect(message.textBody, 'Message text should be blank, as no body defined').toBeNull();
    const textAttachments = [...message.attachments].filter((x) => x instanceof TextPart);
    expect(textAttachments.length, 'Message should contain one text attachment').toBe(1);
  });

  // omitted: TestMailMessageToMimeMessage (System.Net.Mail interop, not ported).
});

function textBody(text: string): TextPart {
  const part = new TextPart('plain');
  part.text = text;
  return part;
}
