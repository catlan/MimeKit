import { describe, expect, test } from 'vitest';
import {
  createDateTimeOffset,
  FormatOptions,
  formatDate,
  Received,
  ReceivedClause,
  ReceivedClauseId,
  unwrap,
} from '../src/index.js';

const utf8 = new TextEncoder();

interface ReceivedResults {
  headerValue: string;
  from?: string;
  fromTcpInfo?: string;
  by?: string;
  byTcpInfo?: string;
  via?: string;
  with?: string;
  id?: string;
  for?: string;
  dateTime?: string;
  reformatted?: string;
}

function assertReceived(received: Received, expected: ReceivedResults): void {
  expect(received.from ?? undefined).toBe(expected.from);
  expect(received.fromTcpInfo ?? undefined).toBe(expected.fromTcpInfo);
  expect(received.by ?? undefined).toBe(expected.by);
  expect(received.byTcpInfo ?? undefined).toBe(expected.byTcpInfo);
  expect(received.via ?? undefined).toBe(expected.via);
  expect(received.with ?? undefined).toBe(expected.with);
  expect(received.id ?? undefined).toBe(expected.id);
  expect(received.for ?? undefined).toBe(expected.for);
  expect(received.dateTime == null ? undefined : formatDate(received.dateTime)).toBe(expected.dateTime);
}

const validTestCases: ReceivedResults[] = [
  {
    "headerValue": " from bar.com by foo.com ; Thu, 21 May 1998\r\n\t05:33:29 -0700\r\n",
    "from": "bar.com",
    "by": "foo.com",
    "dateTime": "Thu, 21 May 1998 05:33:29 -0700",
    "reformatted": " from bar.com by foo.com; Thu, 21 May 1998 05:33:29 -0700\r\n"
  },
  {
    "headerValue": " from thumper.bellcore.com by greenbush.bellcore.com (4.1/4.7)\r\n\tid <AA01648> for nsb; Fri, 29 Nov 91 07:13:33 EST\r\n",
    "from": "thumper.bellcore.com",
    "by": "greenbush.bellcore.com",
    "byTcpInfo": "4.1/4.7",
    "id": "<AA01648>",
    "for": "nsb",
    "dateTime": "Fri, 29 Nov 1991 07:13:33 -0500",
    "reformatted": " from thumper.bellcore.com by greenbush.bellcore.com (4.1/4.7)\r\n\tid <AA01648> for nsb; Fri, 29 Nov 91 07:13:33 EST\r\n"
  },
  {
    "headerValue": " from joyce.cs.su.oz.au by thumper.bellcore.com (4.1/4.7)\r\n\tid <AA11898> for nsb@greenbush; Fri, 29 Nov 91 07:11:57 EST\r\n",
    "from": "joyce.cs.su.oz.au",
    "by": "thumper.bellcore.com",
    "byTcpInfo": "4.1/4.7",
    "id": "<AA11898>",
    "for": "nsb@greenbush",
    "dateTime": "Fri, 29 Nov 1991 07:11:57 -0500",
    "reformatted": " from joyce.cs.su.oz.au by thumper.bellcore.com (4.1/4.7)\r\n\tid <AA11898> for nsb@greenbush; Fri, 29 Nov 91 07:11:57 EST\r\n"
  },
  {
    "headerValue": " from Messages.8.5.N.CUILIB.3.45.SNAP.NOT.LINKED.greenbush.galaxy.sun4.41\r\n\tvia MS.5.6.greenbush.galaxy.sun4_41; Fri, 12 Jun 1992 13:29:05 -0400 (EDT)\r\n",
    "from": "Messages.8.5.N.CUILIB.3.45.SNAP.NOT.LINKED.greenbush.galaxy.sun4.41",
    "via": "MS.5.6.greenbush.galaxy.sun4_41",
    "dateTime": "Fri, 12 Jun 1992 13:29:05 -0400",
    "reformatted": "\r\n\tfrom Messages.8.5.N.CUILIB.3.45.SNAP.NOT.LINKED.greenbush.galaxy.sun4.41\r\n\tvia MS.5.6.greenbush.galaxy.sun4_41; Fri, 12 Jun 1992 13:29:05 -0400 (EDT)\r\n"
  },
  {
    "headerValue": " from sqhilton.pc.cs.cmu.edu by po3.andrew.cmu.edu (5.54/3.15)\r\n\tid <AA21478> for beatty@cosmos.vlsi.cs.cmu.edu; Wed, 26 Aug 92 22:14:07 EDT\r\n",
    "from": "sqhilton.pc.cs.cmu.edu",
    "by": "po3.andrew.cmu.edu",
    "byTcpInfo": "5.54/3.15",
    "id": "<AA21478>",
    "for": "beatty@cosmos.vlsi.cs.cmu.edu",
    "dateTime": "Wed, 26 Aug 1992 22:14:07 -0400"
  },
  {
    "headerValue": " from [127.0.0.1] by [127.0.0.1] id <AA21478> with sendmail (v1.8)\r\n\tfor <beatty@cosmos.vlsi.cs.cmu.edu>; Wed, 26 Aug 92 22:14:07 EDT\r\n",
    "from": "[127.0.0.1]",
    "by": "[127.0.0.1]",
    "id": "<AA21478>",
    "with": "sendmail",
    "for": "<beatty@cosmos.vlsi.cs.cmu.edu>",
    "dateTime": "Wed, 26 Aug 1992 22:14:07 -0400"
  },
  {
    "headerValue": " from smtp.domain.com (smtp.domain.com. [207.54.68.120])\r\n        by mx.google.com with ESMTPS id 4fb4d7f45d1cf-659329877a1si67605a12.45.2026.02.02.09.25.54\r\n        for <user@gmail.com>\r\n        (version=TLS1_2 cipher=ECDHE-ECDSA-CHACHA20-POLY1305 bits=256/256);\r\n        Mon, 02 Feb 2026 09:25:55 -0800 (PST)\r\n",
    "from": "smtp.domain.com",
    "fromTcpInfo": "smtp.domain.com. [207.54.68.120]",
    "by": "mx.google.com",
    "with": "ESMTPS",
    "id": "4fb4d7f45d1cf-659329877a1si67605a12.45.2026.02.02.09.25.54",
    "for": "<user@gmail.com>",
    "dateTime": "Mon, 02 Feb 2026 09:25:55 -0800",
    "reformatted": " from smtp.domain.com (smtp.domain.com. [207.54.68.120])\r\n\tby mx.google.com with ESMTPS\r\n\tid 4fb4d7f45d1cf-659329877a1si67605a12.45.2026.02.02.09.25.54\r\n\tfor <user@gmail.com>\r\n\t(version=TLS1_2 cipher=ECDHE-ECDSA-CHACHA20-POLY1305 bits=256/256);\r\n\tMon, 02 Feb 2026 09:25:55 -0800 (PST)\r\n"
  },
  {
    "headerValue": " from smtp.domain.com by mx.google.com with ESMTPS\r\n\tid 4fb4d7f45d1cf-659329877a1si67605a12.45.2026.02.02.09.25.54\r\n\tfor <user@gmail.com>\r\n\t(version=TLS1_2 cipher=ECDHE-ECDSA-CHACHA20-POLY1305 bits=256/256)\r\n",
    "from": "smtp.domain.com",
    "by": "mx.google.com",
    "with": "ESMTPS",
    "id": "4fb4d7f45d1cf-659329877a1si67605a12.45.2026.02.02.09.25.54",
    "for": "<user@gmail.com>"
  },
  {
    "headerValue": " from relay301.mycloudmailbox.com ([207.126.101.249])\r\n\tby SJ0PR20MB4463.namprd00.prod.outlook.com with ESMTPS id\r\n\t<SJ0PR20MB446393F2410E314E4704AE53C7202@SJ0PR20MB4463.namprd00.prod.outlook.com>\r\n\tfor <unit-tests@mimekit.net>; Sun, 19 Apr 2026 15:47:52 -0400 (EDT)\r\n",
    "from": "relay301.mycloudmailbox.com",
    "fromTcpInfo": "[207.126.101.249]",
    "by": "SJ0PR20MB4463.namprd00.prod.outlook.com",
    "with": "ESMTPS",
    "id": "<SJ0PR20MB446393F2410E314E4704AE53C7202@SJ0PR20MB4463.namprd00.prod.outlook.com>",
    "for": "<unit-tests@mimekit.net>",
    "dateTime": "Sun, 19 Apr 2026 15:47:52 -0400"
  },
  {
    "headerValue": " from relay301.mycloudmailbox.com ([207.126.101.249])\r\n\tby SJ0PR20MB4463.namprd00.prod.outlook.com ([127.0.0.1]) via TCP with ESMTPS\r\n\tid\r\n\t<SJ0PR20MB446393F2410E314E4704AE53C7202@SJ0PR20MB4463.namprd00.prod.outlook.com>\r\n\tfor <unit-tests@mimekit.net>; Sun, 19 Apr 2026 15:47:52 -0400 (EDT)\r\n",
    "from": "relay301.mycloudmailbox.com",
    "fromTcpInfo": "[207.126.101.249]",
    "by": "SJ0PR20MB4463.namprd00.prod.outlook.com",
    "byTcpInfo": "[127.0.0.1]",
    "via": "TCP",
    "with": "ESMTPS",
    "id": "<SJ0PR20MB446393F2410E314E4704AE53C7202@SJ0PR20MB4463.namprd00.prod.outlook.com>",
    "for": "<unit-tests@mimekit.net>",
    "dateTime": "Sun, 19 Apr 2026 15:47:52 -0400"
  },
  {
    "headerValue": " by 2002:aa6:d946:0:b0:32a:1941:595b with SMTP id w6csp1900485lkc;\r\n        Mon, 2 Feb 2026 09:25:55 -0800 (PST)\r\n",
    "by": "2002:aa6:d946:0:b0:32a:1941:595b",
    "with": "SMTP",
    "id": "w6csp1900485lkc",
    "dateTime": "Mon, 02 Feb 2026 09:25:55 -0800",
    "reformatted": " by 2002:aa6:d946:0:b0:32a:1941:595b with SMTP id w6csp1900485lkc;\r\n\tMon, 2 Feb 2026 09:25:55 -0800 (PST)\r\n"
  },
  {
    "headerValue": " from us-smtp-delivery-105.mimecast.com (216.205.24.105)\r\n\tby BN3NAM04FT018.mail.protection.outlook.com (10.152.92.162) with Microsoft\r\n\tSMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384)\r\n\tid 15.20.1835.13 via Frontend Transport; Tue, 30 Apr 2019 19:10:19 +0000\r\n",
    "from": "us-smtp-delivery-105.mimecast.com",
    "fromTcpInfo": "216.205.24.105",
    "by": "BN3NAM04FT018.mail.protection.outlook.com",
    "byTcpInfo": "10.152.92.162",
    "with": "Microsoft SMTP Server",
    "id": "15.20.1835.13",
    "via": "Frontend Transport",
    "dateTime": "Tue, 30 Apr 2019 19:10:19 +0000",
    "reformatted": " from us-smtp-delivery-105.mimecast.com (216.205.24.105)\r\n\tby BN3NAM04FT018.mail.protection.outlook.com (10.152.92.162)\r\n\twith Microsoft SMTP Server\r\n\t(version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384)\r\n\tid 15.20.1835.13 via Frontend Transport; Tue, 30 Apr 2019 19:10:19 +0000\r\n"
  },
  {
    "headerValue": " from [67.219.246.196] (using TLSv1.2 with cipher DHE-RSA-AES256-GCM-SHA384 (256 bits))\r\n\tby server-2.bemta.az-c.us-east-1.aws.symcld.net id 11/DD-19573-41C55BC5;\r\n\tTue, 16 Apr 2019 04:37:40 +0000\r\n",
    "from": "[67.219.246.196]",
    "fromTcpInfo": "using TLSv1.2 with cipher DHE-RSA-AES256-GCM-SHA384 (256 bits)",
    "by": "server-2.bemta.az-c.us-east-1.aws.symcld.net",
    "id": "11/DD-19573-41C55BC5",
    "dateTime": "Tue, 16 Apr 2019 04:37:40 +0000",
    "reformatted": " from [67.219.246.196]\r\n\t(using TLSv1.2 with cipher DHE-RSA-AES256-GCM-SHA384 (256 bits))\r\n\tby server-2.bemta.az-c.us-east-1.aws.symcld.net id 11/DD-19573-41C55BC5;\r\n\tTue, 16 Apr 2019 04:37:40 +0000\r\n"
  },
  {
    "headerValue": " (qmail 16244 invoked from network); 16 Apr 2019 04:37:38 -0000\r\n",
    "dateTime": "Tue, 16 Apr 2019 04:37:38 +0000"
  },
  {
    "headerValue": " from smtp.source.com (HELO localhost) ([160.46.252.39])\r\n\tby smtp.destination.com with ESMTP/TLS; 02 Feb 2026 18:25:54 +0100\r\n",
    "from": "smtp.source.com",
    "fromTcpInfo": "HELO localhost",
    "by": "smtp.destination.com",
    "with": "ESMTP/TLS",
    "dateTime": "Mon, 02 Feb 2026 18:25:54 +0100"
  },
  {
    "headerValue": " from relay301.mycloudmailbox.com (unknown [207.126.101.249])\r\n\t(using TLSv1.2 with cipher ECDHE-RSA-AES128-SHA256 (128/128 bits))\r\n\t(No client certificate requested)\r\n\tby S15-GW103.mycloudmailbox.com (Postfix) with ESMTPS id 44th580QHjz2SnDr\r\n\tfor <unit-tests@mimekit.net>; Tue, 30 Apr 2019 08:42:52 -0400 (EDT)\r\n",
    "from": "relay301.mycloudmailbox.com",
    "fromTcpInfo": "unknown [207.126.101.249]",
    "by": "S15-GW103.mycloudmailbox.com",
    "byTcpInfo": "Postfix",
    "with": "ESMTPS",
    "id": "44th580QHjz2SnDr",
    "for": "<unit-tests@mimekit.net>",
    "dateTime": "Tue, 30 Apr 2019 08:42:52 -0400",
    "reformatted": " from relay301.mycloudmailbox.com (unknown [207.126.101.249])\r\n\t(using TLSv1.2 with cipher ECDHE-RSA-AES128-SHA256 (128/128 bits))\r\n\t(No client certificate requested) by S15-GW103.mycloudmailbox.com (Postfix)\r\n\twith ESMTPS id 44th580QHjz2SnDr for <unit-tests@mimekit.net>;\r\n\tTue, 30 Apr 2019 08:42:52 -0400 (EDT)\r\n"
  },
  {
    "headerValue": " from  (this 'from' clause has no value) by smtp.destination.com\r\n\twith ESMTP/TLS; 02 Feb 2026 18:25:54 +0100\r\n",
    "from": "",
    "fromTcpInfo": "this 'from' clause has no value",
    "by": "smtp.destination.com",
    "with": "ESMTP/TLS",
    "dateTime": "Mon, 02 Feb 2026 18:25:54 +0100"
  },
  {
    "headerValue": " from ; 02 Feb 2026 18:25:54 +0100\r\n",
    "from": "",
    "dateTime": "Mon, 02 Feb 2026 18:25:54 +0100"
  },
  {
    "headerValue": " from smtp.domain.com by mx.google.com with ESMTPS;\r\n",
    "from": "smtp.domain.com",
    "by": "mx.google.com",
    "with": "ESMTPS",
    "reformatted": " from smtp.domain.com by mx.google.com with ESMTPS\r\n"
  }
];

const invalidHeaderValues: [string, string, number, number][] = [
  [
    " (this is an unterminated comment...",
    "Incomplete comment token at offset 1",
    1,
    -1
  ],
  [
    " from (this is an unterminated comment...",
    "Incomplete comment token at offset 6",
    6,
    -1
  ],
  [
    " from remote-host.com (this is an unterminated comment...",
    "Incomplete comment token at offset 22",
    22,
    -1
  ],
  [
    " from remote-host.com by smtp.local-host.com (this is an unterminated comment...",
    "Incomplete comment token at offset 45",
    45,
    -1
  ],
  [
    " from remote-host.com from remote-host.com",
    "Duplicate 'from' clause at offset 22",
    22,
    26
  ],
  [
    " from remote-host.com by smtp.local-host.com by duplicate-host.com",
    "Duplicate 'by' clause at offset 45",
    45,
    47
  ],
  [
    " from remote-host.com by smtp.local-host.com via Frontend Transport via Backend Transport",
    "Duplicate 'via' clause at offset 68",
    68,
    71
  ],
  [
    " from remote-host.com by smtp.local-host.com with SMTP with ESMTP",
    "Duplicate 'with' clause at offset 55",
    55,
    59
  ],
  [
    " from remote-host.com by smtp.local-host.com id <123@localhost> id <456@localhost>",
    "Duplicate 'id' clause at offset 64",
    64,
    66
  ],
  [
    " from remote-host.com by smtp.local-host.com for user@domain.com for user@domain.com",
    "Duplicate 'for' clause at offset 65",
    65,
    68
  ],
  [
    " from remote-host.com by smtp.local-host.com for user@domain.com; !^#&*^*@%@^*&#*&!*",
    "Invalid date-time format at offset 66",
    66,
    84
  ]
];

describe('Received', () => {
  test('TestArgumentExceptions', () => {
    const received = new Received();
    expect(() => new Received(null as never, '127.0.0.1', 'by.host.com', '127.0.0.1', createDateTimeOffset(2026, 4, 18, 20, 5, 38, -240))).toThrow(TypeError);
    expect(() => { received.from = ''; }).toThrow(TypeError);
    expect(() => { received.from = '[127.'; }).toThrow(TypeError);
    expect(() => { received.by = 'smtp	.gmail.com'; }).toThrow(TypeError);
    expect(() => { received.via = ''; }).toThrow(TypeError);
    expect(() => { received.with = 'illegalchar'; }).toThrow(TypeError);
    expect(() => { received.id = ''; }).toThrow(TypeError);
    expect(() => { received.for = 'this is invalid...'; }).toThrow(TypeError);
    expect(() => received.toString(null as never)).toThrow(TypeError);
    expect(Received.tryParse(null).ok).toBe(false);
    expect(Received.tryParse(new Uint8Array(), -1, 1).ok).toBe(false);
    expect(() => new ReceivedClause(null as never, 'value')).toThrow(TypeError);
    expect(() => new ReceivedClause('keyword', null as never)).toThrow(TypeError);
    expect(() => new ReceivedClause('keyword', '')).toThrow(TypeError);
  });

  test('TestConstructors', () => {
    const dateTime = createDateTimeOffset(2026, 4, 18, 20, 5, 38, -240);
    const received = new Received('smtp.source.com', '192.168.1.1', 'smtp.target.com', '127.0.0.1', dateTime);
    expect(received.clauses.length).toBe(2);
    expect(received.from).toBe('smtp.source.com');
    expect(received.fromTcpInfo).toBe('[192.168.1.1]');
    expect(received.by).toBe('smtp.target.com');
    expect(received.byTcpInfo).toBe('[127.0.0.1]');
    expect(received.dateTime).toEqual(dateTime);
    expect(received.toString()).toBe(' from smtp.source.com ([192.168.1.1])\n\tby smtp.target.com ([127.0.0.1]); Sat, 18 Apr 2026 20:05:38 -0400\n');
    expect(new ReceivedClause('from', 'value', 'comment').id).toBe(ReceivedClauseId.From);
    expect(new ReceivedClause('by', 'value', 'comment').id).toBe(ReceivedClauseId.By);
    expect(new ReceivedClause('via', 'value', 'comment').id).toBe(ReceivedClauseId.Via);
    expect(new ReceivedClause('with', 'value', 'comment').id).toBe(ReceivedClauseId.With);
    expect(new ReceivedClause('id', '<value@example.com>', 'comment').id).toBe(ReceivedClauseId.Id);
    expect(new ReceivedClause('for', 'value', 'comment').id).toBe(ReceivedClauseId.For);
  });

  test('TestCommentSpecials', () => {
    const input = ' from smtp.source.com (\\\\escaped\\\\) by smtp.target.com;\r\n\tSat, 18 Apr 2026 20:05:38 -0400\r\n';
    const received = unwrap(Received.parse(utf8.encode(input)));
    expect(received.fromTcpInfo).toBe('\\escaped\\');
    expect(received.toString()).toBe(input.replace(/\r\n/g, '\n'));
  });

  test('TestCommentsGetUnfolded', () => {
    const received = new Received();
    received.from = 'smtp.source.com';
    received.fromTcpInfo = 'HELO\t[192.\r\n168.1.1]';
    received.by = 'smtp.target.com';
    received.byTcpInfo = '[127.0.\r\n0.1]';
    received.dateTime = createDateTimeOffset(2026, 4, 18, 20, 5, 38, -240);
    expect(received.clauses.length).toBe(2);
    expect(received.fromTcpInfo).toBe('HELO [192.168.1.1]');
    expect(received.byTcpInfo).toBe('[127.0.0.1]');
    expect(received.toString()).toBe(' from smtp.source.com (HELO [192.168.1.1])\n\tby smtp.target.com ([127.0.0.1]); Sat, 18 Apr 2026 20:05:38 -0400\n');
  });

  test('TestParsedCommentsGetUnfolded', () => {
    const input = ' from smtp.source.com (HELO\r\n\t[192.168.1.1])\r\n\tby smtp.target.com (\r\n\t[127.0.0.1]\r\n\t); Sat, 18 Apr 2026 20:05:38 -0400\r\n';
    const expected = ' from smtp.source.com (HELO [192.168.1.1])\n\tby smtp.target.com ( [127.0.0.1] ); Sat, 18 Apr 2026 20:05:38 -0400\n';
    const received = unwrap(Received.parse(utf8.encode(input)));
    expect(received.clauses.length).toBe(2);
    expect(received.from).toBe('smtp.source.com');
    expect(received.fromTcpInfo).toBe('HELO [192.168.1.1]');
    expect(received.by).toBe('smtp.target.com');
    expect(received.byTcpInfo).toBe(' [127.0.0.1] ');
    expect(formatDate(received.dateTime!)).toBe('Sat, 18 Apr 2026 20:05:38 -0400');
    expect(received.toString()).toBe(expected);
  });

  test('TestRemoveComments', () => {
    const input = " from smtp.source.com (TcpInfo for 'from' clause)\r\n\tby smtp.target.com (TcpInfo for 'by' clause); Sat, 18 Apr 2026 20:05:38 -0400\r\n";
    const expected = ' from smtp.source.com by smtp.target.com;\n\tSat, 18 Apr 2026 20:05:38 -0400\n';
    const received = unwrap(Received.parse(utf8.encode(input)));
    expect(received.clauses.length).toBe(2);
    expect(received.from).toBe('smtp.source.com');
    expect(received.fromTcpInfo).toBe("TcpInfo for 'from' clause");
    expect(received.by).toBe('smtp.target.com');
    expect(received.byTcpInfo).toBe("TcpInfo for 'by' clause");
    expect(formatDate(received.dateTime!)).toBe('Sat, 18 Apr 2026 20:05:38 -0400');
    received.fromTcpInfo = null;
    expect(received.fromTcpInfo).toBeNull();
    received.byTcpInfo = null;
    expect(received.byTcpInfo).toBeNull();
    expect(received.toString()).toBe(expected);
  });

  test('TestRemoveClauses', () => {
    const expectedAll = ' from smtp.source.com ([192.168.1.1])\n\tby smtp.target.com ([127.0.0.1]) via TCP with ESMTPS\n\tid <VAD7UBNO1TU4.JCMO6CD121AX1@office365.com> for unit-tests@mimekit.net;\n\tSat, 18 Apr 2026 20:05:38 -0400\n';
    const expectedNoFrom = ' by smtp.target.com ([127.0.0.1]) via TCP with ESMTPS\n\tid <VAD7UBNO1TU4.JCMO6CD121AX1@office365.com> for unit-tests@mimekit.net;\n\tSat, 18 Apr 2026 20:05:38 -0400\n';
    const expectedNoBy = ' from smtp.source.com ([192.168.1.1]) via TCP with ESMTPS\n\tid <VAD7UBNO1TU4.JCMO6CD121AX1@office365.com> for unit-tests@mimekit.net;\n\tSat, 18 Apr 2026 20:05:38 -0400\n';
    const expectedNoVia = ' from smtp.source.com ([192.168.1.1])\n\tby smtp.target.com ([127.0.0.1]) with ESMTPS\n\tid <VAD7UBNO1TU4.JCMO6CD121AX1@office365.com> for unit-tests@mimekit.net;\n\tSat, 18 Apr 2026 20:05:38 -0400\n';
    const expectedNoWith = ' from smtp.source.com ([192.168.1.1])\n\tby smtp.target.com ([127.0.0.1]) via TCP\n\tid <VAD7UBNO1TU4.JCMO6CD121AX1@office365.com> for unit-tests@mimekit.net;\n\tSat, 18 Apr 2026 20:05:38 -0400\n';
    const expectedNoId = ' from smtp.source.com ([192.168.1.1])\n\tby smtp.target.com ([127.0.0.1]) via TCP with ESMTPS\n\tfor unit-tests@mimekit.net; Sat, 18 Apr 2026 20:05:38 -0400\n';
    const expectedNoFor = ' from smtp.source.com ([192.168.1.1])\n\tby smtp.target.com ([127.0.0.1]) via TCP with ESMTPS\n\tid <VAD7UBNO1TU4.JCMO6CD121AX1@office365.com>;\n\tSat, 18 Apr 2026 20:05:38 -0400\n';
    const expectedNoDateTime = ' from smtp.source.com ([192.168.1.1])\n\tby smtp.target.com ([127.0.0.1]) via TCP with ESMTPS\n\tid <VAD7UBNO1TU4.JCMO6CD121AX1@office365.com> for unit-tests@mimekit.net\n';
    const received = new Received();
    received.from = 'smtp.source.com';
    received.fromTcpInfo = '[192.168.1.1]';
    received.by = 'smtp.target.com';
    received.byTcpInfo = '[127.0.0.1]';
    received.via = 'TCP';
    received.with = 'ESMTPS';
    received.id = '<VAD7UBNO1TU4.JCMO6CD121AX1@office365.com>';
    received.for = 'unit-tests@mimekit.net';
    received.dateTime = createDateTimeOffset(2026, 4, 18, 20, 5, 38, -240);
    expect(received.toString()).toBe(expectedAll);
    received.from = null;
    expect(received.from).toBeNull();
    expect(received.fromTcpInfo).toBeNull();
    expect(received.toString()).toBe(expectedNoFrom);
    received.from = 'smtp.source.com';
    received.fromTcpInfo = '[192.168.1.1]';
    received.by = null;
    expect(received.by).toBeNull();
    expect(received.byTcpInfo).toBeNull();
    expect(received.toString()).toBe(expectedNoBy);
    received.by = 'smtp.target.com';
    received.byTcpInfo = '[127.0.0.1]';
    received.via = null;
    expect(received.via).toBeNull();
    expect(received.toString()).toBe(expectedNoVia);
    received.via = 'TCP';
    received.with = null;
    expect(received.with).toBeNull();
    expect(received.toString()).toBe(expectedNoWith);
    received.with = 'ESMTPS';
    received.id = null;
    expect(received.id).toBeNull();
    expect(received.toString()).toBe(expectedNoId);
    received.id = '<VAD7UBNO1TU4.JCMO6CD121AX1@office365.com>';
    received.for = null;
    expect(received.for).toBeNull();
    expect(received.toString()).toBe(expectedNoFor);
    received.for = 'unit-tests@mimekit.net';
    received.dateTime = null;
    expect(received.dateTime).toBeNull();
    expect(received.toString()).toBe(expectedNoDateTime);
  });

  test('TestSettingAllProperties', () => {
    const expected = ' from smtp.source.com ([192.168.1.1])\n\tby smtp.target.com ([127.0.0.1]) via TCP with ESMTPS\n\tid <VAD7UBNO1TU4.JCMO6CD121AX1@office365.com> for unit-tests@mimekit.net;\n\tSat, 18 Apr 2026 20:05:38 -0400\n';
    const received = new Received();
    received.from = 'smtp.source.com';
    received.fromTcpInfo = '[192.168.1.1]';
    received.by = 'smtp.target.com';
    received.byTcpInfo = '[127.0.0.1]';
    received.via = 'TCP';
    received.with = 'ESMTPS';
    received.id = '<VAD7UBNO1TU4.JCMO6CD121AX1@office365.com>';
    received.for = 'unit-tests@mimekit.net';
    received.dateTime = createDateTimeOffset(2026, 4, 18, 20, 5, 38, -240);
    expect(received.clauses.length).toBe(6);
    expect(received.toString()).toBe(expected);
    expect(Received.tryParse(utf8.encode(expected.replace(/\n/g, '\r\n'))).ok).toBe(true);
  });

  test('TestTcpInfoWithoutValue', () => {
    const received = new Received();
    received.fromTcpInfo = '[192.168.1.1]';
    received.by = 'smtp.target.com';
    expect(received.clauses.length).toBe(2);
    expect(received.toString()).toBe(' from  ([192.168.1.1]) by smtp.target.com\n');
  });

  test('TestUpdateValue', () => {
    const received = new Received();
    received.from = 'smtp.source.com';
    received.by = 'smtp.target.com';
    expect(received.toString()).toBe(' from smtp.source.com by smtp.target.com\n');
    received.from = 'smtp.gmail.com';
    expect(received.toString()).toBe(' from smtp.gmail.com by smtp.target.com\n');
  });

  test('TestParsingAllProperties', () => {
    const expected = ' from smtp.source.com ([192.168.1.1])\r\n\tby smtp.target.com ([127.0.0.1]) via TCP with ESMTPS\r\n\tid <VAD7UBNO1TU4.JCMO6CD121AX1@office365.com> for unit-tests@mimekit.net;\r\n\tSat, 18 Apr 2026 20:05:38 -0400\r\n';
    const received = unwrap(Received.tryParse(utf8.encode(expected)));
    expect(received.clauses.length).toBe(6);
    expect(received.from).toBe('smtp.source.com');
    expect(received.fromTcpInfo).toBe('[192.168.1.1]');
    expect(received.by).toBe('smtp.target.com');
    expect(received.byTcpInfo).toBe('[127.0.0.1]');
    expect(received.via).toBe('TCP');
    expect(received.with).toBe('ESMTPS');
    expect(received.id).toBe('<VAD7UBNO1TU4.JCMO6CD121AX1@office365.com>');
    expect(received.for).toBe('unit-tests@mimekit.net');
    expect(formatDate(received.dateTime!)).toBe('Sat, 18 Apr 2026 20:05:38 -0400');
    expect(received.toString()).toBe(expected.replace(/\r\n/g, '\n'));
  });

  test('TestParseValidHeaderValues', () => {
    for (const testCase of validTestCases) {
      const buffer = utf8.encode(testCase.headerValue);
      const received = unwrap(Received.parse(buffer));
      assertReceived(received, testCase);
      const received2 = unwrap(Received.parse(buffer, 0, buffer.length));
      assertReceived(received2, testCase);
      expect(received.toString()).toBe((testCase.reformatted ?? testCase.headerValue).replace(/\r\n/g, '\n'));
    }
  });

  test('TestTryParseValidHeaderValues', () => {
    for (const testCase of validTestCases) {
      const buffer = utf8.encode(testCase.headerValue);
      const received = unwrap(Received.tryParse(buffer));
      assertReceived(received, testCase);
      const received2 = unwrap(Received.tryParse(buffer, 0, buffer.length));
      assertReceived(received2, testCase);
      expect(received.toString()).toBe((testCase.reformatted ?? testCase.headerValue).replace(/\r\n/g, '\n'));
    }
  });

  test.each(invalidHeaderValues)('TestParseInvalidHeaderValues %#', (value, reason, tokenIndex, errorIndex) => {
    const buffer = utf8.encode(value);
    const expectedErrorIndex = errorIndex === -1 ? buffer.length : errorIndex;
    const parsed = Received.parse(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.message).toBe(reason);
      expect((parsed.error as any).tokenIndex ?? parsed.error.offset).toBe(tokenIndex);
      expect((parsed.error as any).errorIndex ?? parsed.error.offset).toBe(expectedErrorIndex);
    }
    const parsedWithRange = Received.parse(buffer, 0, buffer.length);
    expect(parsedWithRange.ok).toBe(false);
    if (!parsedWithRange.ok) {
      expect((parsedWithRange.error as any).tokenIndex ?? parsedWithRange.error.offset).toBe(tokenIndex);
      expect((parsedWithRange.error as any).errorIndex ?? parsedWithRange.error.offset).toBe(expectedErrorIndex);
    }
    expect(Received.tryParse(buffer).ok).toBe(false);
    expect(Received.tryParse(buffer, 0, buffer.length).ok).toBe(false);
  });

  test.each([
    ['smtp.gmail.com', '[192.168.1.1]', 'smtp.office365.com', '[10.3.0.1]', 'Frontend Transport', 'Microsoft SMTP Server', '<123@gmail.com>', 'user@office365.com', ' from smtp.gmail.com ([192.168.1.1])\r\n\tby smtp.office365.com ([10.3.0.1]) via Frontend Transport\r\n\twith Microsoft SMTP Server id <123@gmail.com> for user@office365.com;\r\n\tWed, 15 Apr 2026 20:39:57 -0400\r\n'],
    ['sender.com', 'This comment is to force the ; onto the next line.', null, null, null, null, null, null, ' from sender.com (This comment is to force the ; onto the next line.)\r\n\t; Wed, 15 Apr 2026 20:39:57 -0400\r\n'],
  ])('TestToString %#', (from, fromTcpInfo, by, byTcpInfo, via, withValue, id, forValue, expected) => {
    const received = new Received();
    received.from = from;
    received.fromTcpInfo = fromTcpInfo;
    received.by = by;
    received.byTcpInfo = byTcpInfo;
    received.via = via;
    received.with = withValue;
    received.id = id;
    received.for = forValue;
    received.dateTime = createDateTimeOffset(2026, 4, 15, 20, 39, 57, -240);
    const options = FormatOptions.default.clone();
    options.newLineFormat = 'dos';
    expect(received.toString(options)).toBe(expected);
  });
});
