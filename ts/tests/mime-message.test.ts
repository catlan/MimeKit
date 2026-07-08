import { describe, expect, test } from 'vitest';
import {
  FormatOptions,
  Header,
  HeaderId,
  InternetAddressList,
  MailboxAddress,
  MemoryStream,
  MessageImportance,
  MessagePriority,
  MimeContent,
  MimeMessage,
  TextPart,
  Version,
  XMessagePriority,
  createDateTimeOffset,
  dateTimeOffsetMinValue,
  formatDate,
  generateMessageId,
} from '../src/index.js';

function first<T>(iter: Iterable<T>): T {
  for (const item of iter) return item;
  throw new Error('empty');
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

  // --- Parser-dependent cases: deferred(wave-4) (need MimeParser.ParseMessage / MimeMessage.Load) ---
  test.skip('TestPrependHeader', () => {
    // deferred(wave-4): parses a raw message with MimeParser then reserializes.
  });
  test.skip('TestReserialization', () => {
    // deferred(wave-4): round-trip byte parity via the parser (also a wave-5 surface).
  });
  test.skip('TestReserializationEmptyParts', () => {
    // deferred(wave-4): parser round-trip.
  });
  test.skip('TestReserializationMessageParts', () => {
    // deferred(wave-4): parser round-trip.
  });
  test.skip('TestReserializationEpilogue', () => {
    // deferred(wave-4): parser round-trip.
  });
  test.skip('TestReserializationMultipartPreambleNoBoundary', () => {
    // deferred(wave-4): parser round-trip.
  });
  test.skip('TestReserializationInvalidHeaders', () => {
    // deferred(wave-4): parser round-trip.
  });
  test.skip('TestReserializationDeliveryStatusReportWithEnsureNewLine', () => {
    // deferred(wave-4): parser round-trip.
  });
  test.skip('TestReserializationNewFromHeaderList', () => {
    // deferred(wave-4): parser round-trip.
  });
  test.skip('TestReserializationNewFromIEnumerableHeader', () => {
    // deferred(wave-4): parser round-trip.
  });
  test.skip('TestHtmlAndTextBodies', () => {
    // deferred(wave-4): loads TestData/messages/body.*.txt via MimeMessage.Load.
  });
  test.skip('TestFlowedTextBodyIssue1130', () => {
    // deferred(wave-4): loads TestData/messages/issue1130.txt via MimeMessage.Load.
  });
  test.skip('TestNoBodyWithTextAttachment', () => {
    // deferred(wave-4): parses a raw message with MimeParser.
  });
  // omitted: TestMailMessageToMimeMessage (System.Net.Mail interop, not ported).
});

function textBody(text: string): TextPart {
  const part = new TextPart('plain');
  part.text = text;
  return part;
}
