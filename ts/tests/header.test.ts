import { describe, expect, test } from 'vitest';
import {
  FormatOptions,
  Header,
  InternetAddressList,
  MailboxAddress,
  ParserOptions,
  toHeaderId,
  toHeaderName,
  unwrap,
  utf8,
  headerIdNameTable,
} from '../src/index.js';

const ascii = new TextEncoder();
const utf8Decoder = new TextDecoder();

function byteArrayToString(text: Uint8Array): string {
  return utf8Decoder.decode(text);
}

function getMaxLineLength(text: string): number {
  let current = 0;
  let max = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\r' && text[i + 1] === '\n') i++;
    if (text[i] === '\n') {
      max = Math.max(max, current);
      current = 0;
    } else {
      current++;
    }
  }
  return max;
}

function dosOptions(international = false): FormatOptions {
  const options = FormatOptions.default.clone();
  options.newLineFormat = 'dos';
  options.international = international;
  return options;
}

function parseOk(text: string | Uint8Array): Header {
  return unwrap(Header.parse(text));
}

function encodeMailbox(options: FormatOptions, field: string, mailbox: MailboxAddress): string {
  const list = new InternetAddressList([mailbox]);
  const state = { lineLength: field.length };
  return ` ${list.encode(options, true, state)}${options.newLine}`;
}

function testReformatAddressHeader(options: FormatOptions, mailbox: MailboxAddress): void {
  const encoded = encodeMailbox(FormatOptions.default, 'From: ', mailbox);
  const header = Header.fromRaw(ParserOptions.default, 'From', 'From', utf8.encode(encoded));
  expect(byteArrayToString(header.getRawValue(options))).toBe(encodeMailbox(options, 'From: ', mailbox));
}

describe('Header', () => {
  test('TestArgumentExceptions', () => {
    const header = new Header('utf-8', 'Subject', 'This is a subject...');
    // Adapted: TS uses TypeError/RangeError for C# ArgumentException-family cases.
    expect(() => new Header('Illegal:char', 'value')).toThrow(TypeError);
    expect(() => new Header('测试文本', 'value')).toThrow(TypeError);
    expect(() => new Header('UTF-8', 'Illegal:char', 'value')).toThrow(TypeError);
    expect(() => new Header('UTF-8', '测试文本', 'value')).toThrow(TypeError);
    expect(() => new Header(utf8, 'Illegal:char', 'value')).toThrow(TypeError);
    expect(() => new Header(utf8, '测试文本', 'value')).toThrow(TypeError);
    expect(() => new Header('Unknown', 'value')).toThrow(RangeError);
    expect(() => new Header('Subject', null as never)).toThrow(TypeError);
    expect(() => new Header(null as never, 'value')).toThrow(TypeError);
    expect(() => new Header('', 'value')).toThrow(TypeError);
    expect(() => new Header('field', null as never)).toThrow(TypeError);
    expect(() => new Header(null as never, 'Subject', 'value')).toThrow(TypeError);
    expect(() => new Header(utf8, 'Unknown', 'value')).toThrow(RangeError);
    expect(() => new Header(utf8, 'Subject', null as never)).toThrow(TypeError);
    expect(() => new Header(null as never, 'field', 'value')).toThrow(TypeError);
    expect(() => new Header('utf-8', null as never, 'value')).toThrow(TypeError);
    expect(() => new Header('utf-8', '', 'value')).toThrow(TypeError);
    expect(() => new Header('utf-8', 'field', null as never)).toThrow(TypeError);
    expect(() => new Header(utf8, null as never, 'value')).toThrow(TypeError);
    expect(() => new Header(utf8, '', 'value')).toThrow(TypeError);
    expect(() => new Header(utf8, 'field', null as never)).toThrow(TypeError);
    expect(() => new Header(null as never, 'Subject', 'value')).toThrow(TypeError);
    expect(() => new Header('utf-8', 'Unknown', 'value')).toThrow(RangeError);
    expect(() => new Header('utf-8', 'Subject', null as never)).toThrow(TypeError);
    expect(() => header.getValue(null as never)).toThrow(TypeError);
    expect(() => header.setValue(null as never, utf8, 'value')).toThrow(TypeError);
    expect(() => header.setValue(FormatOptions.default, null as never, 'value')).toThrow(TypeError);
    expect(() => header.setValue(FormatOptions.default, utf8, null as never)).toThrow(TypeError);
    expect(() => header.setRawValue(null as never)).toThrow(TypeError);
    expect(() => header.setRawValue(new Uint8Array())).toThrow(TypeError);
    expect(() => header.setRawValue(ascii.encode('abc'))).toThrow(TypeError);
  });

  test('TestCloning', () => {
    const header = new Header('Comments', 'These are some comments.');
    const clone = header.clone();
    expect(clone.id).toBe(header.id);
    expect(clone.field).toBe(header.field);
    expect(clone.value).toBe(header.value);
    expect(clone.rawField).toEqual(header.rawField);
    expect(clone.rawValue).toEqual(header.rawValue);
  });

  test('TestToString', () => {
    expect(new Header('Subject', 'This is a subject...').toString()).toBe('Subject: This is a subject...');
    expect(new Header('SuBjEcT', 'This is a subject...').toString()).toBe('SuBjEcT: This is a subject...');
  });

  test('TestUnfoldNullValue', () => expect(Header.unfold(null)).toBe(''));

  test('TestAddressHeaderFolding', () => {
    const expected = ' Jeffrey Stedfast <jeff@xamarin.com>, "Jeffrey A. Stedfast"\n\t<jeff@xamarin.com>, "Dr. Gregory House, M.D."\n\t<house@princeton-plainsboro-hospital.com>\n';
    const header = new Header('To', 'Jeffrey Stedfast <jeff@xamarin.com>, "Jeffrey A. Stedfast" <jeff@xamarin.com>, "Dr. Gregory House, M.D." <house@princeton-plainsboro-hospital.com>');
    const raw = byteArrayToString(header.rawValue);
    expect(raw.endsWith('\n')).toBe(true);
    expect(getMaxLineLength(raw)).toBeLessThan(FormatOptions.default.maxLineLength);
    expect(raw).toBe(expected);
  });

  test.skip('TestArcAuthenticationResultsHeaderFolding', () => {
    // deferred(wave-8): requires AuthenticationResults parser/encoder.
  });

  test('TestMessageIdHeaderFolding', () => {
    const header = new Header('Message-Id', '<00000000-0000-0000-0000-000000000000@princeton-plainsboro-hospital.com>');
    expect(byteArrayToString(header.rawValue)).toBe(` ${header.value}\n`);
  });

  test('TestSubjectHeaderFolding', () => {
    const expected = ' =?utf-8?b?0KLQtdGB0YLQvtCy0YvQuSDQt9Cw0LPQvtC70L7QstC+0Log0L/QuNGB0YzQvNCw?=\n';
    expect(byteArrayToString(new Header('Subject', 'Тестовый заголовок письма').rawValue).replace(/\r/g, '')).toBe(expected);
  });

  const receivedHeaderValues = [
    ' from thumper.bellcore.com by greenbush.bellcore.com (4.1/4.7)\r\n\tid <AA01648> for nsb; Fri, 29 Nov 91 07:13:33 EST\r\n',
    ' from joyce.cs.su.oz.au by thumper.bellcore.com (4.1/4.7)\r\n\tid <AA11898> for nsb@greenbush; Fri, 29 Nov 91 07:11:57 EST\r\n',
    ' from Messages.8.5.N.CUILIB.3.45.SNAP.NOT.LINKED.greenbush.galaxy.sun4.41\r\n\tvia MS.5.6.greenbush.galaxy.sun4_41; Fri, 12 Jun 1992 13:29:05 -0400 (EDT)\r\n',
    ' from sqhilton.pc.cs.cmu.edu by po3.andrew.cmu.edu (5.54/3.15)\r\n\tid <AA21478> for beatty@cosmos.vlsi.cs.cmu.edu; Wed, 26 Aug 92 22:14:07 EDT\r\n',
    ' from [127.0.0.1] by [127.0.0.1] id <AA21478> with sendmail (v1.8)\r\n\tfor <beatty@cosmos.vlsi.cs.cmu.edu>; Wed, 26 Aug 92 22:14:07 EDT\r\n',
    ' from us-smtp-delivery-105.mimecast.com (216.205.24.105)\r\n\tby BN3NAM04FT018.mail.protection.outlook.com (10.152.92.162) with Microsoft\r\n\tSMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384)\r\n\tid 15.20.1835.13 via Frontend Transport; Tue, 30 Apr 2019 19:10:19 +0000\r\n',
    ' from [67.219.246.196] (using TLSv1.2 with cipher DHE-RSA-AES256-GCM-SHA384 (256 bits))\r\n\tby server-2.bemta.az-c.us-east-1.aws.symcld.net id 11/DD-19573-41C55BC5;\r\n\tTue, 16 Apr 2019 04:37:40 +0000\r\n',
    ' (qmail 16244 invoked from network); 16 Apr 2019 04:37:38 -0000\r\n',
    ' from relay301.mycloudmailbox.com (unknown [207.126.101.249]) (using TLSv1.2 with cipher ECDHE-RSA-AES128-SHA256 (128/128 bits)) (No client certificate requested)\r\n\tby S15-GW103.mycloudmailbox.com (Postfix) with ESMTPS id 44th580QHjz2SnDr\r\n\tfor <unit-tests@mimekit.net>; Tue, 30 Apr 2019 08:42:52 -0400 (EDT)\r\n',
    ' (incomplete comment\r\n',
    ' from (incomplete comment\r\n',
    ' by (incomplete comment\r\n',
    ' via (incomplete comment\r\n',
    ' with (incomplete comment\r\n',
    ' id (incomplete comment\r\n',
    ' for (incomplete comment\r\n',
    ' from thumper.bellcore.com\r\n\tby greenbush.bellcore.com (this is an incomplete comment that is really really long in order to enforce folding...\r\n',
  ];

  test('TestReceivedHeaderFolding', () => {
    const header = new Header('Received', '');
    const options = FormatOptions.default.clone();
    for (const received of receivedHeaderValues) {
      const unfolded = received.replace(/\r\n\t/g, ' ').trim();
      options.newLineFormat = 'dos';
      header.setValue(options, utf8, unfolded);
      expect(byteArrayToString(header.rawValue)).toBe(received);
      options.newLineFormat = 'unix';
      header.setValue(options, utf8, unfolded);
      expect(byteArrayToString(header.rawValue)).toBe(received.replace(/\r\n/g, '\n'));
    }
  });

  test('TestReferencesHeaderFolding', () => {
    const expected = ' <id0@princeton-plainsboro-hospital.com>\n\t<id1@princeton-plainsboro-hospital.com>\n\t<id2@princeton-plainsboro-hospital.com>\n\t<id3@princeton-plainsboro-hospital.com>\n\t<id4@princeton-plainsboro-hospital.com>\n\t<id5@princeton-plainsboro-hospital.com>\n';
    const header = new Header('References', expected);
    expect(byteArrayToString(header.rawValue)).toBe(expected);
  });

  test('TestDkimSignatureHeaderFolding', () => {
    const header = new Header('UTF-8', 'DKIM-Signature', 'v=1; a=rsa-sha256; c=simple/simple; d=maillist.codeproject.com; s=mail; t=1435835767; bh=tiafHSAvEg4GPJlbkR6e7qr1oydTj+ZXs392TcHwwvs=; h=MIME-Version:From:To:Date:Subject:Content-Type:Content-Transfer-Encoding:Message-Id; b=Qtgo0bWwT0H18CxD2+ey8/382791TBNYtZ8VOLlXxxsbw5fab8uEo53o5tPun6kNx4khmJx/yWowvrCOAcMoqgNO7Hb7JB8NR7eNyOvtLKCG34AfDZyHNcTZHR/QnBpRKHssu5w2CQDUAjKnuGKRW95LCMMX3r924dErZOJnGhs=');
    expect(byteArrayToString(header.rawValue)).toBe(' v=1; a=rsa-sha256; c=simple/simple;\n\td=maillist.codeproject.com; s=mail; t=1435835767;\n\tbh=tiafHSAvEg4GPJlbkR6e7qr1oydTj+ZXs392TcHwwvs=;\n\th=MIME-Version:From:To:Date:Subject:Content-Type:Content-Transfer-Encoding:\n\tMessage-Id;\n\tb=Qtgo0bWwT0H18CxD2+ey8/382791TBNYtZ8VOLlXxxsbw5fab8uEo53o5tPun6kNx4khmJx/yWo\n\twvrCOAcMoqgNO7Hb7JB8NR7eNyOvtLKCG34AfDZyHNcTZHR/QnBpRKHssu5w2CQDUAjKnuGKRW95L\n\tCMMX3r924dErZOJnGhs=\n');
  });

  test('TestDkimSignatureHeaderFoldingWithZ', () => {
    const header = new Header('UTF-8', 'DKIM-Signature', 'v=1; a=rsa-sha256; c=simple/simple; d=maillist.codeproject.com; s=mail; t=1435835767; bh=tiafHSAvEg4GPJlbkR6e7qr1oydTj+ZXs392TcHwwvs=; z=MIME-Version|From|To|Date|Subject|Content-Type|Content-Transfer-Encoding|Message-Id; b=Qtgo0bWwT0H18CxD2+ey8/382791TBNYtZ8VOLlXxxsbw5fab8uEo53o5tPun6kNx4khmJx/yWowvrCOAcMoqgNO7Hb7JB8NR7eNyOvtLKCG34AfDZyHNcTZHR/QnBpRKHssu5w2CQDUAjKnuGKRW95LCMMX3r924dErZOJnGhs=');
    expect(byteArrayToString(header.rawValue)).toContain('\n\tz=MIME-Version|From|To|Date|Subject|Content-Type|Content-Transfer-Encoding|\n\tMessage-Id;');
  });

  test('TestReformatDkimSignature', () => {
    const expected = ' v=1; a=rsa-sha256; c=simple/simple;\n\td=maillist.codeproject.com; s=mail; t=1435835767;\n\tbh=tiafHSAvEg4GPJlbkR6e7qr1oydTj+ZXs392TcHwwvs=;\n\th=MIME-Version:From:To:Date:Subject:Content-Type:Content-Transfer-Encoding:\n\tMessage-Id;\n\tb=Qtgo0bWwT0H18CxD2+ey8/382791TBNYtZ8VOLlXxxsbw5fab8uEo53o5tPun6kNx4khmJx/yWo\n\twvrCOAcMoqgNO7Hb7JB8NR7eNyOvtLKCG34AfDZyHNcTZHR/QnBpRKHssu5w2CQDUAjKnuGKRW95L\n\tCMMX3r924dErZOJnGhs=\n';
    const header = Header.fromRaw(ParserOptions.default, 'DkimSignature', 'DKIM-Signature', utf8.encode(expected));
    expect(byteArrayToString(header.getRawValue(dosOptions(true)))).toBe(expected);
  });

  test('TestUnstructuredHeaderFolding', () => {
    const header = new Header('Subject', 'This is a subject value that should be long enough to force line wrapping to keep the line length under the 78 character limit.');
    const raw = byteArrayToString(header.rawValue);
    expect(raw.endsWith('\n')).toBe(true);
    expect(getMaxLineLength(raw)).toBeLessThanOrEqual(FormatOptions.default.maxLineLength);
    expect(Header.unfold(raw)).toBe(header.value);
  });

  test('TestUnstructuredHeaderFoldingWithLongWhitespace', () => {
    const original = `This is a header value with a really long sequence of ${' '.repeat(78)} and such`;
    const folded = Header.fold(FormatOptions.default, 'Subject', original);
    expect(folded.endsWith('\n')).toBe(true);
    expect(getMaxLineLength(folded)).toBeLessThanOrEqual(FormatOptions.default.maxLineLength);
    expect(Header.unfold(folded)).toBe(original);
  });

  test('TestSimpleInternationalizedUnstructuredHeaderFolding', () => {
    const options = FormatOptions.default.clone(); options.international = true;
    const original = 'This is a subject value that should be long enough to force line wrapping to keep the line length under the 78 character limit.';
    const folded = Header.fold(options, 'Subject', original);
    expect(Header.unfold(folded)).toBe(original);
  });

  test('TestArabicInternationalizedUnstructuredHeaderFolding', () => {
    const options = FormatOptions.default.clone(); options.international = true;
    const original = 'هل تتكلم اللغة الإنجليزية /العربية؟'.repeat(5);
    const folded = Header.fold(options, 'Subject', original);
    expect(Header.unfold(folded)).toBe(original);
  });

  test('TestJapaneseInternationalizedUnstructuredHeaderFolding', () => {
    const options = FormatOptions.default.clone(); options.international = true;
    const original = '狂ったこの世で狂うなら気は確かだ。'.repeat(4);
    const folded = Header.fold(options, 'Subject', original);
    expect(Header.unfold(folded).replace(/ /g, '')).toBe(original);
  });

  test('TestReallyLongWordHeaderFolding', () => {
    const original = 'This is a header value with_a_really_really_really_long_word_that_will_need_to_be_broken_up_in_order_to_fold';
    const folded = Header.fold(FormatOptions.default, 'Subject', original);
    expect(Header.unfold(folded).replace(/ _/g, '_')).toBe(original);
  });

  test('TestJapaneseUTF8HeaderDecoding', () => {
    const header = parseOk('Subject: =?UTF-8?B?RndkOiDjgI7jg53jgrHjg6Ljg7Mgzqnjg6vjg5Pjg7zjg7vOseOCteODleOCoeOCpOOCog==?= =?UTF-8?B?44CP44KS44OX44Os44Kk44GV44KM44Gf55qG44GV44G+44G4IDcyMOeorumhnuOBruODneOCseODog==?= =?UTF-8?B?44Oz44GM5Yui44Ge44KN44GE77yBM0RT5pyA5paw44K944OV44OI44Gu44GK44GX44KJ44Gb44Gn44GZ?=');
    expect(header.id).toBe('Subject');
    expect(header.value).toBe('Fwd: 『ポケモン Ωルビー・αサファイア』をプレイされた皆さまへ 720種類のポケモンが勢ぞろい！3DS最新ソフトのおしらせです');
  });

  test('TestJapaneseISO2022JPHeaderDecoding', () => {
    const header = parseOk('Subject: =?ISO-2022-JP?B?GyRCRnxLXDhsJWEhPCVrJUYlOSVIGyhCICh0ZXN0aW5nIEph?=\n =?ISO-2022-JP?B?cGFuZXNlIGVtYWlscyk=?=');
    expect(header.value).toBe('日本語メールテスト (testing Japanese emails)');
  });

  test('TestRawUTF8HeaderDecoding', () => {
    const input = 'Subject: Fwd: 『ポケモン Ωルビー・αサファイア』をプレイされた皆さまへ 720種類のポケモンが勢ぞろい！3DS最新ソフトのおしらせです';
    const header = parseOk(utf8.encode(input));
    expect(header.value).toBe(input.slice('Subject: '.length));
  });

  test('TestParserCanonicalization', () => {
    const header = parseOk('Content-Type: text/plain');
    expect(header.field).toBe('Content-Type');
    expect(header.value).toBe('text/plain');
    expect(header.rawValue[header.rawValue.length - 1]).toBe(0x0a);
  });

  test('TestParseInvalidHeader', () => {
    expect(Header.parse('This is invalid').ok).toBe(false);
    expect(Header.parse(ascii.encode('This is invalid'), ParserOptions.default, 0, 'This is invalid'.length).ok).toBe(false);
  });

  test('TestToHeaderId', () => {
    for (const [id, name] of headerIdNameTable) {
      expect(toHeaderId(name.toUpperCase())).toBe(id);
      expect(toHeaderName(id)).toBe(name);
    }
    expect(toHeaderId('X-MadeUp-Header')).toBe('Unknown');
    expect(toHeaderName(1025)).toBe('Unknown');
  });

  test('TestSetRawValue', () => {
    const header = new Header('Subject', 'This is the subject');
    const rawValue = ascii.encode('This is the\n raw subject\n');
    const options = FormatOptions.default.clone(); options.international = true;
    header.setRawValue(rawValue);
    expect(header.getRawValue(options)).toEqual(rawValue);
  });

  test('TestReformatAddressHeaderWithInnerQuotedString', () => testReformatAddressHeader(dosOptions(true), new MailboxAddress('John "Jacob Jingle Heimer" Schmidt', 'example@example.com')));
  test('TestReformatAddressHeaderWithInnerUnicodeQuotedString1', () => testReformatAddressHeader(dosOptions(true), new MailboxAddress('John "點看@名がドメイン Jacob Jingle Heimer" Schmidt', 'example@example.com')));
  test('TestReformatAddressHeaderWithInnerUnicodeQuotedString2', () => testReformatAddressHeader(dosOptions(true), new MailboxAddress('John "Jacob Jingle 點看@名がドメイン Heimer" Schmidt', 'example@example.com')));
  test('TestReformatAddressHeaderWithInnerUnicodeQuotedString3', () => testReformatAddressHeader(dosOptions(true), new MailboxAddress('John "Jacob Jingle Heimer 點看@名がドメイン" Schmidt', 'example@example.com')));
  test('TestReformatAddressHeaderWithInnerUnicodeComment', () => testReformatAddressHeader(dosOptions(true), new MailboxAddress('John (Jacob Jingle Heimer) Schmidt', 'example@example.com')));
  test('TestReformatAddressHeaderWithInnerUnicodeComment1', () => testReformatAddressHeader(dosOptions(true), new MailboxAddress('John (點看@名がドメイン Jacob Jingle Heimer) Schmidt', 'example@example.com')));
  test('TestReformatAddressHeaderWithInnerUnicodeComment2', () => testReformatAddressHeader(dosOptions(true), new MailboxAddress('John (Jacob Jingle 點看@名がドメイン Heimer) Schmidt', 'example@example.com')));
  test('TestReformatAddressHeaderWithInnerUnicodeComment3', () => testReformatAddressHeader(dosOptions(true), new MailboxAddress('John (Jacob Jingle Heimer 點看@名がドメイン) Schmidt', 'example@example.com')));
  test('TestReformatAddressHeaderWithLongSentenceWithCommas', () => testReformatAddressHeader(dosOptions(true), new MailboxAddress('Once upon a time, back when things that are old now were new, there lived a man with a very particular set of skills.', 'example@example.com')));
  test('TestReformatAddressHeaderToInternational', () => testReformatAddressHeader(dosOptions(true), new MailboxAddress('點看@名がドメイン', 'example@example.com')));

  test('TestReformatAddressHeaderFromInternational', () => {
    const mailbox = new MailboxAddress('點看@名がドメイン', 'example@example.com');
    const options = dosOptions(true);
    const rawValue = utf8.encode(encodeMailbox(options, 'From: ', mailbox));
    options.international = false;
    expect(byteArrayToString(Header.reformatAddressHeader(ParserOptions.default, options, 'From', rawValue))).toBe(encodeMailbox(options, 'From: ', mailbox));
  });

  test('TestReformatInvalidAddressHeader', () => {
    const rawValue = utf8.encode('This is an invalid address header\r\n');
    expect(byteArrayToString(Header.fromRaw(ParserOptions.default, 'From', 'From', rawValue).getRawValue(dosOptions(true)))).toBe('This is an invalid address header\r\n');
  });

  test('TestReformatReceived', () => {
    const received = ' from Messages.8.5.N.CUILIB.3.45.SNAP.NOT.LINKED.greenbush.galaxy.sun4.41\r\n          via MS.5.6.greenbush.galaxy.sun4_41;\r\n          Fri, 12 Jun 1992 13:29:05 -0400 (EDT)';
    expect(byteArrayToString(Header.fromRaw(ParserOptions.default, 'Received', 'Received', utf8.encode(received)).getRawValue(dosOptions(true)))).toBe(received);
  });

  test('TestReformatContentId', () => {
    const value = '\r\n\t<id@example.com>\r\n';
    expect(byteArrayToString(Header.fromRaw(ParserOptions.default, 'ContentId', 'Content-Id', utf8.encode(value)).getRawValue(dosOptions(true)))).toBe(value);
  });

  test('TestReformatReferences', () => {
    const value = '\r\n\t<id1@example.com>\r\n\t<id2@example.com>\r\n\t<id3@example.com>\r\n';
    expect(byteArrayToString(Header.fromRaw(ParserOptions.default, 'References', 'References', utf8.encode(value)).getRawValue(dosOptions(true)))).toBe(value);
  });

  test('TestReformatContentDisposition', () => {
    const header = Header.fromRaw(ParserOptions.default, 'ContentDisposition', 'Content-Disposition', utf8.encode(" attachment; filename*=gb18030''%B2%E2%CA%D4%CE%C4%B1%BE.txt\r\n"));
    expect(byteArrayToString(header.getRawValue(dosOptions(true)))).toBe(' attachment; filename="测试文本.txt"\r\n');
  });

  test('TestReformatInvalidContentDisposition', () => {
    const value = ' @!^($@*$&( @*$&@*#@OE UF Jfdfadsf adfsd\r\n';
    expect(byteArrayToString(Header.fromRaw(ParserOptions.default, 'ContentDisposition', 'Content-Disposition', utf8.encode(value)).getRawValue(dosOptions(true)))).toBe(value);
  });

  test('TestReformatContentType', () => {
    const header = Header.fromRaw(ParserOptions.default, 'ContentType', 'Content-Type', utf8.encode(" text/plain; name*=gb18030''%B2%E2%CA%D4%CE%C4%B1%BE.txt\r\n"));
    expect(byteArrayToString(header.getRawValue(dosOptions(true)))).toBe(' text/plain; name="测试文本.txt"\r\n');
  });

  test('TestReformatInvalidContentType', () => {
    const value = ' @!^($@*$&( @*$&@*#@OE UF Jfdfadsf adfsd\r\n';
    expect(byteArrayToString(Header.fromRaw(ParserOptions.default, 'ContentType', 'Content-Type', utf8.encode(value)).getRawValue(dosOptions(true)))).toBe(value);
  });

  test('TestReformatAuthenticationResults', () => {
    const value = ' mx.google.com;\r\n       dkim=pass header.i=@example.com header.s=default header.b=sQFuh0qx;\r\n       spf=pass (google.com: domain of info@example.com designates 123.456.1.1 as permitted sender) smtp.mailfrom=info@example.com;\r\n       dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=example.com\r\n';
    expect(byteArrayToString(Header.fromRaw(ParserOptions.default, 'AuthenticationResults', 'Authentication-Results', utf8.encode(value)).getRawValue(dosOptions(true)))).toBe(value);
  });

  test('TestReformatSubject', () => {
    const subject = " I'm so happy! =?utf-8?b?5ZCN44GM44OJ44Oh44Kk44Oz?= I love MIME so\r\n much =?utf-8?b?4p2k77iP4oCN8J+UpSE=?= Isn't it great?\r\n";
    expect(byteArrayToString(Header.fromRaw(ParserOptions.default, 'Subject', 'Subject', utf8.encode(subject)).getRawValue(dosOptions(true)))).toBe(" I'm so happy! 名がドメイン I love MIME so much ❤️‍🔥! Isn't it great?\r\n");
  });

  const listCases: Array<[HeaderId, string, string, string?]> = [
    ['ListHelp', '<mailto:list@host.com?subject=help> (List Instructions)', ' <mailto:list@host.com?subject=help> (List Instructions)\r\n'],
    ['ListHelp', '<mailto:list-manager@host.com?body=info>', ' <mailto:list-manager@host.com?body=info>\r\n'],
    ['ListHelp', '<mailto:list-info@host.com> (Info about the list)', ' <mailto:list-info@host.com> (Info about the list)\r\n'],
    ['ListHelp', '<http://www.host.com/list/>, <mailto:list-info@host.com>', ' <http://www.host.com/list/>, <mailto:list-info@host.com>\r\n'],
    ['ListHelp', '<ftp://ftp.host.com/list.txt> (FTP), <mailto:list@host.com?subject=help>', ' <ftp://ftp.host.com/list.txt> (FTP),\r\n <mailto:list@host.com?subject=help>\r\n'],
    ['ListUnsubscribe', '<mailto:list@host.com?subject=unsubscribe>', ' <mailto:list@host.com?subject=unsubscribe>\r\n'],
    ['ListUnsubscribe', '(Use this command to get off the list) <mailto:list-manager@host.com?body=unsubscribe%20list>', ' (Use this command to get off the list)\r\n <mailto:list-manager@host.com?body=unsubscribe%20list>\r\n'],
    ['ListUnsubscribe', '<mailto:list-off@host.com>', ' <mailto:list-off@host.com>\r\n'],
    ['ListUnsubscribe', '<http://www.host.com/list.cgi?cmd=unsub&lst=list>, <mailto:list-request@host.com?subject=unsubscribe>', ' <http://www.host.com/list.cgi?cmd=unsub&lst=list>,\r\n <mailto:list-request@host.com?subject=unsubscribe>\r\n'],
    ['ListSubscribe', '<mailto:list@host.com?subject=subscribe>', ' <mailto:list@host.com?subject=subscribe>\r\n'],
    ['ListSubscribe', '<mailto:list-request@host.com?subject=subscribe>', ' <mailto:list-request@host.com?subject=subscribe>\r\n'],
    ['ListSubscribe', '(Use this command to join the list) <mailto:list-manager@host.com?body=subscribe%20list>', ' (Use this command to join the list)\r\n <mailto:list-manager@host.com?body=subscribe%20list>\r\n'],
    ['ListSubscribe', '<mailto:list-on@host.com>', ' <mailto:list-on@host.com>\r\n'],
    ['ListSubscribe', '<http://www.host.com/list.cgi?cmd=sub&lst=list>, <mailto:list-manager@host.com?body=subscribe%20list>', ' <http://www.host.com/list.cgi?cmd=sub&lst=list>,\r\n <mailto:list-manager@host.com?body=subscribe%20list>\r\n'],
    ['ListPost', '<mailto:list@host.com>', ' <mailto:list@host.com>\r\n'],
    ['ListPost', '<mailto:moderator@host.com> (Postings are Moderated)', ' <mailto:moderator@host.com> (Postings are Moderated)\r\n'],
    ['ListPost', '<mailto:moderator@host.com?subject=list%20posting>', ' <mailto:moderator@host.com?subject=list%20posting>\r\n'],
    ['ListPost', 'NO (posting not allowed on this list)', ' NO (posting not allowed on this list)\r\n'],
    ['ListOwner', '<mailto:listmom@host.com> (Contact Person for Help)', ' <mailto:listmom@host.com> (Contact Person for Help)\r\n'],
    ['ListOwner', '<mailto:grant@foo.bar> (Grant Neufeld)', ' <mailto:grant@foo.bar> (Grant Neufeld)\r\n'],
    ['ListOwner', '<mailto:josh@foo.bar?Subject=list>', ' <mailto:josh@foo.bar?Subject=list>\r\n'],
    ['ListArchive', '<mailto:archive@host.com?subject=index%20list>', ' <mailto:archive@host.com?subject=index%20list>\r\n'],
    ['ListArchive', '<ftp://ftp.host.com/pub/list/archive/>', ' <ftp://ftp.host.com/pub/list/archive/>\r\n'],
    ['ListArchive', '<http://www.host.com/list/archive/> (Web Archive)', ' <http://www.host.com/list/archive/> (Web Archive)\r\n'],
    ['ListHelp', '<mailto:list@host.com?subject=help> (목록 지침)', ' <mailto:list@host.com?subject=help>\r\n (=?utf-8?b?66qp66GdIOyngOy5qA==?=)\r\n', ' <mailto:list@host.com?subject=help> (목록 지침)\r\n'],
    ['ListUnsubscribe', '(이 명령을 사용하여 목록에서 구독을 취소합니다.) <mailto:list-manager@host.com?body=unsubscribe%20list>', '\r\n (=?utf-8?b?7J20IOuqheugueydhCDsgqzsmqntlZjsl6wg66qp66Gd7JeQ7ISc?=\r\n =?utf-8?b?IOq1rOuPheydhCDst6jshoztlanri4jri6Qu?=)\r\n <mailto:list-manager@host.com?body=unsubscribe%20list>\r\n', ' (이 명령을 사용하여 목록에서 구독을 취소합니다.)\r\n <mailto:list-manager@host.com?body=unsubscribe%20list>\r\n'],
    ['ListSubscribe', '(이 명령을 사용하여 목록에 조인합니다.) <mailto:list-manager@host.com?body=subscribe%20list>', ' (=?utf-8?b?7J20IOuqheugueydhCDsgqzsmqntlZjsl6wg66qp66Gd7JeQ?=\r\n =?utf-8?b?IOyhsOyduO2VqeuLiOuLpC4=?=)\r\n <mailto:list-manager@host.com?body=subscribe%20list>\r\n', ' (이 명령을 사용하여 목록에 조인합니다.)\r\n <mailto:list-manager@host.com?body=subscribe%20list>\r\n'],
    ['ListPost', 'NO (이 목록에 게시가 허용되지 않음)', ' NO\r\n (=?utf-8?b?7J20IOuqqeuhneyXkCDqsozsi5zqsIAg7ZeI7Jqp65CY7KeAIOyViuydjA==?=)\r\n', ' NO (이 목록에 게시가 허용되지 않음)\r\n'],
    ['ListPost', "(This long comment should force the 'NO' token onto the next line) NO <mailto:list-manager@host.com>", " (This long comment should force the 'NO' token onto the next line)\r\n NO <mailto:list-manager@host.com>\r\n", " (This long comment should force the 'NO' token onto the next line)\r\n NO <mailto:list-manager@host.com>\r\n"],
    ['ListHelp', 'This is a super-califragilistic-expialidociously-looooooooooooooooooooooooong-word-token that will need to be broken up <mailto:list-manager@host.com?subject=help>', ' This is a super-califragilistic-expialidociously-looooooooooooooooo\r\n oooooooong-word-token that will need to be broken up\r\n <mailto:list-manager@host.com?subject=help>\r\n'],
  ];

  test.each(listCases)('TestEncodeListCommandHeader %#', (id, value, expected, international) => {
    const header = new Header(id, value);
    expect(byteArrayToString(header.rawValue)).toBe(expected.replace(/\r\n/g, '\n'));
    const options = dosOptions(false);
    expect(byteArrayToString(header.getRawValue(options))).toBe(expected.replace(/\r\n/g, '\n'));
    options.international = true;
    expect(byteArrayToString(header.getRawValue(options))).toBe(international ?? expected);
  });

  test('TestEncodeListCommandHeaderWithExtremelyLongUrl', () => {
    const value = '<https://www.some-link.com/query-params?abcd=efgh&this=is-very-long-string-which-should-not-be-Rfc2047-encoded-and-should-be-kept-the-way-it-is-by-default>';
    expect(byteArrayToString(new Header('ListUnsubscribe', value).getRawValue(dosOptions(false)))).toBe('\n <https://www.some-link.com/query-params?abcd=efgh&this=is-very-long-string-which-should-not-be-Rfc2047-encoded-and-should-be-kept-the-way-it-is-by-default>\n');
  });

  test('TestEncodeDispositionNotificationOptions', () => {
    const value = '    signed-receipt-protocol=optional,pkcs7-signature;signed-receipt-micalg=optional,sha1,sha128,sha256';
    expect(byteArrayToString(new Header('DispositionNotificationOptions', value).getRawValue(dosOptions(false)))).toBe(' signed-receipt-protocol=optional,pkcs7-signature;\n\tsigned-receipt-micalg=optional,sha1,sha128,sha256\n');
  });

  test('TestReformatDispositionNotificationOptions', () => {
    const value = ' signed-receipt-protocol=optional,pkcs7-signature;signed-receipt-micalg=optional,sha1,sha128,sha256\r\n';
    expect(byteArrayToString(Header.fromRaw(ParserOptions.default, 'DispositionNotificationOptions', 'Disposition-Notification-Options', utf8.encode(value)).getRawValue(dosOptions(true)))).toBe(value);
  });

  test.skip('TestSetValueCharset', () => {
    // deferred(wave-8): CharsetUtils currently lacks outbound GB18030 encoding.
  });
});
