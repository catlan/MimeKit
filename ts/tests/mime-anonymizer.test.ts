import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  FormatOptions,
  Header,
  HeaderId,
  MailboxAddress,
  MemoryStream,
  MimeAnonymizer,
  MimeMessage,
  MimeParser,
  Multipart,
  ParserOptions,
  TextPart,
  createDateTimeOffset,
} from '../src/index.js';
import { testDataDir } from './gates/helpers.js';

const messagesDataDir = join(testDataDir, 'messages');
const textDataDir = join(testDataDir, 'text');

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// C#'s Stream.Null stand-in: a stream the anonymizer never actually writes to
// in the argument-validation cases (the null checks throw first).
function nullStream(): MemoryStream {
  return new MemoryStream();
}

describe('MimeAnonymizer', () => {
  test('TestArgumentExceptions', () => {
    const anonymizer = new MimeAnonymizer();
    const message = new MimeMessage();
    const entity = new TextPart();

    expect(() => anonymizer.anonymize(null as never, nullStream())).toThrow(TypeError);
    expect(() => anonymizer.anonymize(message, null as never)).toThrow(TypeError);
    expect(() => anonymizer.anonymize(null as never, message, nullStream())).toThrow(TypeError);
    expect(() =>
      anonymizer.anonymize(FormatOptions.default, null as never, nullStream())
    ).toThrow(TypeError);
    expect(() => anonymizer.anonymize(FormatOptions.default, message, null as never)).toThrow(TypeError);

    expect(() => anonymizer.anonymize(null as never, nullStream())).toThrow(TypeError);
    expect(() => anonymizer.anonymize(entity, null as never)).toThrow(TypeError);
    expect(() => anonymizer.anonymize(null as never, entity, nullStream())).toThrow(TypeError);
    expect(() =>
      anonymizer.anonymize(FormatOptions.default, null as never, nullStream())
    ).toThrow(TypeError);
    expect(() => anonymizer.anonymize(FormatOptions.default, entity, null as never)).toThrow(TypeError);
  });

  test.each([
    [
      ' (qmail 21619 invoked from network); 15 Nov 2017 14:16:18 -0000\r\n',
      ' (xxxxx xxxxx xxxxxxx xxxx xxxxxxx); 15 Nov 2017 14:16:18 -0000\r\n',
    ],
    [
      ' from unknown (HELO EUR01-HE1-obe.outbound.protection.outlook.com) (80.68.177.35)\r\n  by  with SMTP; 15 Nov 2017 14:16:18 -0000\r\n',
      ' from xxxxxxx (xxxx xxxxxxxxxxxxx.xxxxxxxx.xxxxxxxxxx.xxxxxxx.xxx) (xx.xx.xxx.xx)\r\n  by  with xxxx; 15 Nov 2017 14:16:18 -0000\r\n',
    ],
    [
      ' from mail-he1eur01on0133.outbound.protection.outlook.com\r\n\t([104.47.0.133] helo=EUR01-HE1-obe.outbound.protection.outlook.com) by\r\n\tmyassp01.mynet.it with SMTP (2.5.5); 15 Nov 2017 15:16:20 +0100\r\n',
      ' from xxxxxxxxxxxxxxxxxxx.xxxxxxxx.xxxxxxxxxx.xxxxxxx.xxx\r\n\t([xxx.xx.x.xxx] xxxxxxxxxxxxxxxxxx.xxxxxxxx.xxxxxxxxxx.xxxxxxx.xxx) by\r\n\txxxxxxxx.xxxxx.xx with xxxx (x.x.x); 15 Nov 2017 15:16:20 +0100\r\n',
    ],
    [
      ' from AM4PR01MB1444.eurprd01.prod.exchangelabs.com (10.164.76.26) by\r\n AM4PR01MB1442.eurprd01.prod.exchangelabs.com (10.164.76.24) with Microsoft\r\n SMTP Server (version=TLS1_2,\r\n cipher=TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384_P256) id 15.20.218.12; Wed, 15\r\n Nov 2017 14:16:14 +0000\r\n',
      ' from xxxxxxxxxxxxx.xxxxxxxx.xxxx.xxxxxxxxxxxx.xxx (xx.xxx.xx.xx) by\r\n xxxxxxxxxxxxx.xxxxxxxx.xxxx.xxxxxxxxxxxx.xxx (xx.xxx.xx.xx) with xxxxxxxxx\r\n xxxx xxxxxx (xxxxxxxxxxxxxx,\r\n xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx) id xx.xx.xxx.xx; Wed, 15\r\n Nov 2017 14:16:14 +0000\r\n',
    ],
    [
      ' from AM4PR01MB1444.eurprd01.prod.exchangelabs.com\r\n ([fe80::7830:c66f:eaa8:e3dd]) by AM4PR01MB1444.eurprd01.prod.exchangelabs.com\r\n ([fe80::7830:c66f:eaa8:e3dd%14]) with mapi id 15.20.0218.015; Wed, 15 Nov\r\n 2017 14:16:14 +0000\r\n',
      ' from xxxxxxxxxxxxx.xxxxxxxx.xxxx.xxxxxxxxxxxx.xxx\r\n ([xxxx::xxxx:xxxx:xxxx:xxxx]) by xxxxxxxxxxxxx.xxxxxxxx.xxxx.xxxxxxxxxxxx.xxx\r\n ([xxxx::xxxx:xxxx:xxxx:xxxxxxx]) with xxxx id xx.xx.xxxx.xxx; Wed, 15 Nov\r\n 2017 14:16:14 +0000\r\n',
    ],
    [
      ' from unknown (this is a (nested comment) with an \\"escaped quoted")\r\n by AM4PR01MB1442.eurprd01.prod.exchangelabs.com (10.164.76.24) \r\n',
      ' from xxxxxxx (xxxx xx x (xxxxxx xxxxxxx) xxxx xx \\xxxxxxxx xxxxxxx)\r\n by xxxxxxxxxxxxx.xxxxxxxx.xxxx.xxxxxxxxxxxx.xxx (xx.xxx.xx.xx) \r\n',
    ],
  ])('TestAnonymizeReceivedHeaderValue #%#', (value, expected) => {
    const anonymized = decoder.decode(MimeAnonymizer.anonymizeReceivedHeaderValue(bytes(value)));
    expect(anonymized).toBe(expected);
  });

  test.each([
    [
      ' ":sysmail"@  Some-Group. Some-Org,\r\n Muhammed.(I am  the greatest) Ali @(the)Vegas.WBA\r\n',
      ' "xxxxxxxx"@  xxxxxxxxxx. xxxxxxxx,\r\n xxxxxxxx.(x xx  xxx xxxxxxxx) xxx @(xxx)xxxxx.xxx\r\n',
    ],
    [
      ' Pete(A nice \\) chap) <pete(his account)@silly.test(his host)>\r\n',
      ' xxxx(x xxxx \\) xxxx) <xxxx(xxx xxxxxxx)@xxxxx.xxxx(xxx xxxx)>\r\n',
    ],
    [
      ' GNOME Hackers: Miguel de Icaza <miguel@gnome.org>, Havoc Pennington\r\n\t<hp@redhat.com>;, fejj@helixcode.com\r\n',
      ' xxxxx xxxxxxx: xxxxxx xx xxxxx <xxxxxx@xxxxx.xxx>, xxxxx xxxxxxxxxx\r\n\t<xx@xxxxxx.xxx>;, xxxx@xxxxxxxxx.xxx\r\n',
    ],
    [
      " A Group(Some people):Chris Jones <c@(Chris's host.)public.example>, joe@example.org,\r\n John <jdoe@one.test> (my dear friend); (the end of the group)\r\n",
      " x xxxxx(xxxx xxxxxx):xxxxx xxxxx <x@(xxxxxxx xxxx.)xxxxxx.xxxxxxx>, xxx@xxxxxxx.xxx,\r\n xxxx <xxxx@xxx.xxxx> (xx xxxx xxxxxx); (xxx xxx xx xxx xxxxx)\r\n",
    ],
    [
      ' "Nathaniel S. Borenstein" <nsb@thumper.bellcore.com>\r\n',
      ' "xxxxxxxxxxxxxxxxxxxxxxx" <xxx@xxxxxxx.xxxxxxxx.xxx>\r\n',
    ],
    [
      ' "Nathaniel\r\nS. Borenstein" <nsb@thumper.bellcore.com>\r\n',
      ' "xxxxxxxxx\r\nxxxxxxxxxxxxx" <xxx@xxxxxxx.xxxxxxxx.xxx>\r\n',
    ],
    [
      ' =?utf-8?b?2YfZhCDYqtiq2YPZhNmFINin2YTZhNi62Kkg2KfZhNil2YbYrNmE2YrYstmK2Kk=?=\r\n =?utf-8?b?IC/Yp9mE2LnYsdio2YrYqdif?= <do.you.speak@arabic.com>\r\n',
      ' =?utf-8?b?xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx?=\r\n =?utf-8?b?xxxxxxxxxxxxxxxxxxxxxxxx?= <xx.xxx.xxxxx@xxxxxx.xxx>\r\n',
    ],
    [
      ' =?utf-8?b?54uC44Gj44Gf44GT44Gu5LiW44Gn54u\r\nC44GG44Gq44KJ5rCX44Gv56K644GL44Gg?=\r\n =?utf-8?b?44CC?= <famous@quotes.ja>\r\n',
      ' =?utf-8?b?xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\r\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx?=\r\n =?utf-8?b?xxxx?= <xxxxxx@xxxxxx.xx>\r\n',
    ],
    [
      ' 伊昭傑@郵件.商務, राम@मोहन.ईन्फो,\r\n юзер@екзампл.ком, θσερ@εχαμπλε.ψομ\r\n',
      ' xxxxxxxxx@xxxxxx.xxxxxx, xxxxxxxxx@xxxxxxxxxxxx.xxxxxxxxxxxxxxx,\r\n xxxxxxxx@xxxxxxxxxxxxxx.xxxxxx, xxxxxxxx@xxxxxxxxxxxxxx.xxxxxx\r\n',
    ],
    [
      ' <<<user2@example.org>>>, <another@example.net, second@example.org>\r\n',
      ' <<<xxxxx@xxxxxxx.xxx>>>, <xxxxxxx@xxxxxxx.xxx, xxxxxx@xxxxxxx.xxx>\r\n',
    ],
    [
      ' <user@[domain.com\r\n <img src=x onerror=alert()>]>\r\n',
      ' <xxxx@[xxxxxx.xxx\r\n <xxx xxx=x xxxxxxx=xxxxx()>]>\r\n',
    ],
    [
      ' <user@[domain.com]\0\r\n]>\r\n',
      ' <xxxx@[xxxxxx.xxx]x\r\n]>\r\n',
    ],
    [
      ' "User Name" <user@example.com>, "Unterminated qstring token\r\n',
      ' "xxxxxxxxx" <xxxx@xxxxxxx.xxx>, "xxxxxxxxxxxxxxxxxxxxxxxxxx\r\n',
    ],
    [
      ' "User Name" <user@example.com>, (Unterminated comment\r\n',
      ' "xxxxxxxxx" <xxxx@xxxxxxx.xxx>, (xxxxxxxxxxxx xxxxxxx\r\n',
    ],
    [
      ' Display Name <escaped\\"quoted@example.com>\r\n',
      ' xxxxxxx xxxx <xxxxxxx\\"xxxxxx@xxxxxxx.xxx>\r\n',
    ],
  ])('TestAnonymizeAddressHeaderValue #%#', (value, expected) => {
    const anonymized = decoder.decode(MimeAnonymizer.anonymizeAddressHeaderValue(bytes(value)));
    expect(anonymized).toBe(expected);
  });

  test.each([
    [' attachment\r\n', ' attachment\r\n'],
    [' attachment; \r\n', ' attachment; \r\n'],
    [' attachment; filename=winmail.dat\r\n', ' attachment; filename=xxxxxxxxxxx\r\n'],
    [
      ' attachment; filename="escaped \\"quotes\\".doc";;\r\n',
      ' attachment; filename="xxxxxxxx\\"xxxxxx\\"xxxx";;\r\n',
    ],
    [
      ' attachment;\r\n filename*0*=UTF-8\'\'UnicodeFile;\n filename*1*=name.doc\r\n',
      ' attachment;\r\n filename*0*=xxxxxxxxxxxxxxxxxx;\n filename*1*=xxxxxxxx\r\n',
    ],
    [
      ' attachment;\r\n filename*0*=UTF-8\'\'UnicodeFile;\n filename*1="name.doc";\r\n',
      ' attachment;\r\n filename*0*=xxxxxxxxxxxxxxxxxx;\n filename*1="xxxxxxxx";\r\n',
    ],
    [' inline; filename; size=32767;\r\n', ' inline; filename; size=xxxxx;\r\n'],
    [
      ' inline; filename*; filename*0; filename*1*; filename*2*=;\r\n',
      ' inline; filename*; filename*0; filename*1*; filename*2*=;\r\n',
    ],
  ])('TestAnonymizeContentDispositionValue #%#', (value, expected) => {
    const anonymized = decoder.decode(MimeAnonymizer.anonymizeContentDispositionValue(bytes(value)));
    expect(anonymized).toBe(expected);
  });

  test.each([
    [' application/octet-stream\r\n', ' application/octet-stream\r\n'],
    [' application/octet-stream; \r\n', ' application/octet-stream; \r\n'],
    [' text/plain; charset=us-ascii\r\n', ' text/plain; charset=us-ascii\r\n'],
    [' text/plain; charset="us-ascii"\r\n', ' text/plain; charset="us-ascii"\r\n'],
    [
      ' text/plain; charset=us-ascii; format=flowed\r\n deslsp=yes; name=anonymize.txt\r\n',
      ' text/plain; charset=us-ascii; format=flowed\r\n deslsp=yes; name=xxxxxxxxxxxxx\r\n',
    ],
    [
      ' multipart/mixed;\r\n\tboundary="----=_NextPart_000_0031_01D36222.8A648550"\r\n',
      ' multipart/mixed;\r\n\tboundary="----=_NextPart_000_0031_01D36222.8A648550"\r\n',
    ],
    [
      ' multipart/mixed;\r\n\tboundary*="----=_NextPart_000_0031_01D36222.8A648550"\r\n',
      ' multipart/mixed;\r\n\tboundary*="----=_NextPart_000_0031_01D36222.8A648550"\r\n',
    ],
    [
      ' multipart/mixed;\r\n\tboundary*0*=US-ASCII\'\'----=3D_NextPart_000_;\r\n\tboundary*1*=0031_01D36222.8A648550;\r\n',
      ' multipart/mixed;\r\n\tboundary*0*=US-ASCII\'\'----=3D_NextPart_000_;\r\n\tboundary*1*=0031_01D36222.8A648550;\r\n',
    ],
    [
      ' application/octet-stream;\r\n name*0*=UTF-8\'\'anonymize;\n name*1*=this.doc\r\n',
      ' application/octet-stream;\r\n name*0*=xxxxxxxxxxxxxxxx;\n name*1*=xxxxxxxx\r\n',
    ],
    [
      ' application/octet-stream;\r\n name*0*=UTF-8\'\'UnicodeFile;\n name*1="name.doc";\r\n',
      ' application/octet-stream;\r\n name*0*=xxxxxxxxxxxxxxxxxx;\n name*1="xxxxxxxx";\r\n',
    ],
    [
      ' application/octet-stream;\r\n name="unterminated qstring value;\r\n',
      ' application/octet-stream;\r\n name="xxxxxxxxxxxxxxxxxxxxxxxxxxx\r\n',
    ],
  ])('TestAnonymizeContentTypeValue #%#', (value, expected) => {
    const anonymized = decoder.decode(MimeAnonymizer.anonymizeContentTypeValue(bytes(value)));
    expect(anonymized).toBe(expected);
  });

  test.each([
    [' This is a simple subject...', ' xxxx xx x xxxxxx xxxxxxxxxx'],
    [' blurdy bloop =??q?no_charset?= beep boop\r\n', ' xxxxxx xxxxx =??x?xxxxxxxxxx?= xxxx xxxx\r\n'],
    [
      ' blurdy bloop =?iso-8859-1?q?this_is_english?= beep boop\r\n',
      ' xxxxxx xxxxx =?iso-8859-1?q?xxxxxxxxxxxxxxx?= xxxx xxxx\r\n',
    ],
    [
      " I'm so happy! =?utf-8?b?8J+YgA==?= I love MIME so much =?utf-8?b?4p2k77iP4oCN8J+UpSE=?= Isn't it great?\r\n",
      " xxx xx xxxxxx =?utf-8?b?xxxxxxxx?= x xxxx xxxx xx xxxx =?utf-8?b?xxxxxxxxxxxxxxxxxxxx?= xxxxx xx xxxxx?\r\n",
    ],
    [
      ' blurdy bloop =?=?q?this_is_english?= beep boop\r\n',
      ' xxxxxx xxxxx =?=?x?xxxxxxxxxxxxxxx?= xxxx xxxx\r\n',
    ],
    [
      ' blurdy bloop =?iso-8859-1??this_is_english?= beep boop\r\n',
      ' xxxxxx xxxxx =?iso-8859-1??xxxxxxxxxxxxxxx?= xxxx xxxx\r\n',
    ],
    [
      ' blurdy bloop =?iso-8859-1?=?this_is_english?= beep boop\r\n',
      ' xxxxxx xxxxx =?iso-8859-1?=?xxxxxxxxxxxxxxx?= xxxx xxxx\r\n',
    ],
  ])('TestAnonymizeUnstructuredHeaderValue #%#', (value, expected) => {
    const anonymized = decoder.decode(MimeAnonymizer.anonymizeUnstructuredHeaderValue(bytes(value)));
    expect(anonymized).toBe(expected);
  });

  function assertAnonymizeMessage(fileName: string): void {
    const path = join(messagesDataDir, fileName);
    const anon = path.replace(/\.[^.]+$/, '.anonymized.eml');

    const parser = new MimeParser(new MemoryStream(new Uint8Array(readFileSync(path))), 'entity');
    const result = parser.parseMessage();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const anonymizer = new MimeAnonymizer();
    const memory = new MemoryStream();
    anonymizer.anonymize(result.value, memory);

    const anonymized = normalize(decoder.decode(memory.toArray()));
    const expected = normalize(readFileSync(anon, 'utf8'));

    expect(anonymized).toBe(expected);
  }

  function assertAnonymizeEntity(fileName: string): void {
    const path = join(messagesDataDir, fileName);
    const anon = path.replace(/\.[^.]+$/, '.anonymized.eml');

    const parser = new MimeParser(new MemoryStream(new Uint8Array(readFileSync(path))), 'entity');
    const result = parser.parseEntity();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const anonymizer = new MimeAnonymizer();
    const memory = new MemoryStream();
    anonymizer.anonymize(result.value, memory);

    const anonymized = normalize(decoder.decode(memory.toArray()));
    const expected = normalize(readFileSync(anon, 'utf8'));

    expect(anonymized).toBe(expected);
  }

  test('TestAnonymizeSimpleEmbeddedMessage', () => {
    assertAnonymizeMessage('simple-embedded-message.eml');
  });

  test('TestAnonymizeSimpleMultipartMessage', () => {
    assertAnonymizeMessage('simple-multipart.eml');
  });

  test('TestAnonymizeSimpleMultipartEntity', () => {
    assertAnonymizeEntity('simple-multipart.eml');
  });

  test('TestAnonymizeMessageDeliveryStatus', () => {
    assertAnonymizeMessage('delivery-status.txt');
  });

  test('TestAnonymizeMessageDispositionNotification', () => {
    assertAnonymizeMessage('disposition-notification.txt');
  });

  test('TestAnonymizeGeneratedMessage', () => {
    const expected = normalize(
      `Received: from xxxxxxxxxx.xxxxxxx.xxx by xxxxxxxxx via xxxx;
\tSun, 6 Nov 2025 13:22:23 -0400
From: "xxxxxxxxxxxxxxxxxxx" <xxxxxxxxxx@xxxxxxx.xxx>
Date: Sun, 06 Apr 2025 13:22:18 -0400
Subject: xxxx xx x xxxx xxxxxxx
Message-Id: <xx.x@xxxxxxx.xxx>
To: "xxxxxxxxxxxxxxxxxxx" <xxxxxxxxxx@xxxxxxx.xxx>
References: <xx.x@xxxxxxx.xxx>
In-Reply-To: <xx.x@xxxxxxx.xxx>
MIME-Version: 1.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"

------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

xxxx xx x xxxx xxxxxxx

------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; name=xxxxxxxxxxxxxxx; charset=utf-8
Content-Disposition: attachment; filename=xxxxxxxxxxxxxxx
Content-Transfer-Encoding: base64

`.concat(
        `${'x'.repeat(76)}\n`.repeat(45),
        'xxxx\n\n------=_NextPart_000_003F_01CE98CE.6E826F90--\n'
      )
    );

    const message = new MimeMessage();
    message.from.add(new MailboxAddress('LastName, FirstName', 'unit-tests@mimekit.net'));
    message.to.add(new MailboxAddress('LastName, FirstName', 'unit-tests@mimekit.net'));
    message.date = createDateTimeOffset(2025, 4, 6, 13, 22, 18, -4 * 60);
    message.subject = 'This is a test subject';
    message.references.add('id.1@mimekit.net');
    message.inReplyTo = 'id.1@mimekit.net';
    message.messageId = 'id.2@mimekit.net';

    message.headers.insert(
      0,
      'Received',
      'from unit-tests.mimekit.net by localhost via SMTP; Sun, 6 Nov 2025 13:22:23 -0400'
    );

    const multipart = new Multipart('mixed');
    multipart.boundary = '----=_NextPart_000_003F_01CE98CE.6E826F90';

    const first = new TextPart('plain');
    first.text = 'This is a test message\r\n';
    multipart.add(first);

    const second = new TextPart('plain');
    second.fileName = 'lorem-ipsum.txt';
    second.contentTransferEncoding = 'base64';
    second.text = readFileSync(join(textDataDir, 'lorem-ipsum.txt'), 'utf8').replace(/\r?\n/g, '\r\n');
    multipart.add(second);

    message.body = multipart;

    const anonymizer = new MimeAnonymizer();
    const memory = new MemoryStream();
    anonymizer.anonymize(message, memory);

    const anonymized = normalize(decoder.decode(memory.toArray()));
    expect(anonymized).toBe(expected);
  });

  test('TestAnonymizeGeneratedMessageWithoutBody', () => {
    const expected = normalize(
      `Received: from xxxxxxxxxx.xxxxxxx.xxx by xxxxxxxxx via xxxx;
\tSun, 6 Nov 2025 13:22:23 -0400
From: "xxxxxxxxxxxxxxxxxxx" <xxxxxxxxxx@xxxxxxx.xxx>
Date: Sun, 06 Apr 2025 13:22:18 -0400
Subject: xxxx xx x xxxx xxxxxxx
Message-Id: <xx.x@xxxxxxx.xxx>
To: "xxxxxxxxxxxxxxxxxxx" <xxxxxxxxxx@xxxxxxx.xxx>
References: <xx.x@xxxxxxx.xxx>
In-Reply-To: <xx.x@xxxxxxx.xxx>
xxxx xx xx xxxxxxx xxxxxxxxx

`
    );

    const message = new MimeMessage();
    message.from.add(new MailboxAddress('LastName, FirstName', 'unit-tests@mimekit.net'));
    message.to.add(new MailboxAddress('LastName, FirstName', 'unit-tests@mimekit.net'));
    message.date = createDateTimeOffset(2025, 4, 6, 13, 22, 18, -4 * 60);
    message.subject = 'This is a test subject';
    message.references.add('id.1@mimekit.net');
    message.inReplyTo = 'id.1@mimekit.net';
    message.messageId = 'id.2@mimekit.net';

    message.headers.insert(
      0,
      'Received',
      'from unit-tests.mimekit.net by localhost via SMTP; Sun, 6 Nov 2025 13:22:23 -0400'
    );

    // add an invalid header
    const rawInvalid = bytes('This is an invalid header...\r\n');
    message.headers.add(
      Header.fromRaw(
        ParserOptions.default,
        HeaderId.Unknown,
        'This is an invalid header...\r\n',
        new Uint8Array(0),
        true,
        rawInvalid
      )
    );

    const anonymizer = new MimeAnonymizer();
    const memory = new MemoryStream();
    anonymizer.anonymize(message, memory);

    const anonymized = normalize(decoder.decode(memory.toArray()));
    expect(anonymized).toBe(expected);
  });

  test('TestPreserveHeaders', () => {
    const expected = normalize(
      `Received: from unit-tests.mimekit.net by localhost via SMTP;
\tSun, 6 Nov 2025 13:22:23 -0400
From: "xxxxxxxxxxxxxxxxxxx" <xxxxxxxxxx@xxxxxxx.xxx>
Date: Sun, 06 Apr 2025 13:22:18 -0400
Subject: xxxx xx x xxxx xxxxxxx
Message-Id: <id.2@mimekit.net>
To: "xxxxxxxxxxxxxxxxxxx" <xxxxxxxxxx@xxxxxxx.xxx>
References: <xx.x@xxxxxxx.xxx>
In-Reply-To: <xx.x@xxxxxxx.xxx>

`
    );

    const message = new MimeMessage();
    message.from.add(new MailboxAddress('LastName, FirstName', 'unit-tests@mimekit.net'));
    message.to.add(new MailboxAddress('LastName, FirstName', 'unit-tests@mimekit.net'));
    message.date = createDateTimeOffset(2025, 4, 6, 13, 22, 18, -4 * 60);
    message.subject = 'This is a test subject';
    message.references.add('id.1@mimekit.net');
    message.inReplyTo = 'id.1@mimekit.net';
    message.messageId = 'id.2@mimekit.net';

    message.headers.insert(
      0,
      'Received',
      'from unit-tests.mimekit.net by localhost via SMTP; Sun, 6 Nov 2025 13:22:23 -0400'
    );

    const anonymizer = new MimeAnonymizer();

    // preserve some headers
    anonymizer.preserveHeaders.add('received');
    anonymizer.preserveHeaders.add('message-id');

    const memory = new MemoryStream();
    anonymizer.anonymize(message, memory);

    const anonymized = normalize(decoder.decode(memory.toArray()));
    expect(anonymized).toBe(expected);
  });
});
