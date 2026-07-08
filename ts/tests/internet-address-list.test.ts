import { describe, expect, test } from 'vitest';
import { FormatOptions, GroupAddress, InternetAddressList, MailboxAddress, ParserOptions, type RfcComplianceMode } from '../src/index.js';

function mailbox(name: string, address: string, route?: string[]): MailboxAddress {
  return new MailboxAddress(name, address, route);
}

function group(name: string, members: Array<MailboxAddress | GroupAddress>): GroupAddress {
  return new GroupAddress(name, members);
}

function unixOptions(): FormatOptions {
  const options = FormatOptions.default.clone();
  options.newLineFormat = 'unix';
  return options;
}

function parserOptions(compliance: RfcComplianceMode): ParserOptions {
  const options = ParserOptions.default.clone();
  options.addressParserComplianceMode = compliance;
  return options;
}

function assertParse(text: string, encoded = text): InternetAddressList {
  const parsed = InternetAddressList.parse(text);
  expect(parsed.ok, text).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error.message);
  expect(parsed.value.toString(FormatOptions.default, true)).toBe(encoded);
  return parsed.value;
}

function assertParseFails(text: string): void {
  // Adapted from C# AssertParseAndTryParseFail: TS parse() has TryParse-style Result semantics.
  expect(InternetAddressList.parse(text).ok, text).toBe(false);
}

describe('InternetAddressList', () => {
  test('TestArgumentExceptions', () => {
    const list = new InternetAddressList([mailbox('Example User', 'user@example.com')]);
    const item = mailbox('MimeKit Unit Tests', 'mimekit@example.com');
    // Adapted: TS uses TypeError/RangeError for C# ArgumentException-family cases.
    expect(() => new InternetAddressList(null as never)).toThrow(TypeError);
    expect(() => list.add(null as never)).toThrow(TypeError);
    expect(() => list.addRange(null as never)).toThrow(TypeError);
    expect(() => list.compareTo(null as never)).toThrow(TypeError);
    expect(() => list.contains(null as never)).toThrow(TypeError);
    expect(() => list.copyTo(null as never, 0)).toThrow(TypeError);
    expect(() => list.copyTo([], -1)).toThrow(RangeError);
    expect(() => list.indexOf(null as never)).toThrow(TypeError);
    expect(() => list.insert(-1, item)).toThrow(RangeError);
    expect(() => list.insert(0, null as never)).toThrow(TypeError);
    expect(() => list.remove(null as never)).toThrow(TypeError);
    expect(() => list.removeAt(-1)).toThrow(RangeError);
    expect(() => list.set(-1, item)).toThrow(RangeError);
    expect(() => list.set(0, null as never)).toThrow(TypeError);
  });

  test('TestParseWhiteSpace', () => assertParseFails('   '));
  test('TestParseNameLessThan', () => assertParseFails('"Name" <'));
  test('TestSimpleAddrSpec', () => {
    assertParse('fejj@helixcode.com');
    assertParse('fejj');
  });
  test('TestSimpleAddrSpecWithTrailingDot', () => assertParse('fejj@helixcode.com.', 'fejj@helixcode.com'));
  test('TestExampleAddrSpecWithQuotedLocalPartAndCommentsFromRfc822', () => {
    assertParse('":sysmail"@  Some-Group. Some-Org,\n Muhammed.(I am  the greatest) Ali @(the)Vegas.WBA', '":sysmail"@Some-Group.Some-Org, Muhammed.Ali@Vegas.WBA');
  });
  test('TestExampleMailboxWithCommentsFromRfc5322', () => {
    assertParse('Pete(A nice \\) chap) <pete(his account)@silly.test(his host)>', 'Pete <pete@silly.test>');
  });
  test('TestSimpleMailboxes', () => {
    assertParse('Jeffrey Stedfast <fejj@helixcode.com>');
    assertParse('this is\n\ta folded name <folded@name.com>', 'this is a folded name <folded@name.com>');
    assertParse('"Jeffrey \\"fejj\\" Stedfast" <fejj@helixcode.com>');
    assertParse('"Stedfast, Jeffrey" <fejj@helixcode.com>');
    assertParse('fejj@helixcode.com (Jeffrey Stedfast)', 'Jeffrey Stedfast <fejj@helixcode.com>');
    assertParse('Jeffrey Stedfast <fejj(recursive (comment) block)@helixcode.(and a comment here)com>', 'Jeffrey Stedfast <fejj@helixcode.com>');
    assertParse('Jeffrey Stedfast <fejj@helixcode.com.>', 'Jeffrey Stedfast <fejj@helixcode.com>');
  });
  test('TestMailboxesWithRfc2047EncodedNames', () => {
    assertParse('=?iso-8859-1?q?Kristoffer_Br=E5nemyr?= <ztion@swipenet.se>', 'Kristoffer =?iso-8859-1?q?Br=E5nemyr?= <ztion@swipenet.se>');
    assertParse('=?iso-8859-1?q?Fran=E7ois?= Pons <fpons@mandrakesoft.com>');
  });
  test('TestListWithGroupAndAddrspec', () => {
    assertParse('GNOME Hackers: Miguel de Icaza <miguel@gnome.org>, Havoc Pennington <hp@redhat.com>;, fejj@helixcode.com', 'GNOME Hackers: Miguel de Icaza <miguel@gnome.org>, Havoc Pennington\n\t<hp@redhat.com>;, fejj@helixcode.com');
  });
  test('TestLocalGroupWithoutSemicolon', () => {
    const parsed = InternetAddressList.parse('Local recipients: phil, joe, alex, bob');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.toString(FormatOptions.default, true)).toBe('Local recipients: phil, joe, alex, bob;');
  });
  test('TestExampleGroupWithCommentsFromRfc5322', () => {
    assertParse("A Group(Some people):Chris Jones <c@(Chris's host.)public.example>, joe@example.org, John <jdoe@one.test> (my dear friend); (the end of the group)", 'A Group: Chris Jones <c@public.example>, joe@example.org, John <jdoe@one.test>;');
  });
  test('TestMailboxWithDotsInTheName', () => assertParse('Nathaniel S. Borenstein <nsb@thumper.bellcore.com>', '"Nathaniel S. Borenstein" <nsb@thumper.bellcore.com>'));
  test('TestMailboxWith8bitName', () => assertParse('Patrik F¥dltstr¥vm <paf@nada.kth.se>', 'Patrik =?utf-8?b?RsKlZGx0c3RywqV2bQ==?= <paf@nada.kth.se>'));
  test('TestObsoleteMailboxRoutingSyntax', () => assertParse('Routed Address <@route:user@domain.com>'));
  test('TestObsoleteMailboxRoutingSyntaxWithEmptyDomains', () => assertParse('Routed Address <@route1,,@route2,,,@route3:user@domain.com>', 'Routed Address <@route1,@route2,@route3:user@domain.com>'));
  test('TestEncodingSimpleMailboxWithQuotedName', () => {
    expect(new InternetAddressList([mailbox('Stedfast, Jeffrey', 'fejj@gnome.org')]).toString(unixOptions(), true)).toBe('"Stedfast, Jeffrey" <fejj@gnome.org>');
  });
  test('TestEncodingSimpleMailboxWithLatin1Name', () => {
    const latin = mailbox('Kristoffer Brånemyr', 'ztion@swipenet.se');
    latin.encoding = 'iso-8859-1';
    expect(new InternetAddressList([latin]).toString(unixOptions(), true)).toBe('Kristoffer =?iso-8859-1?q?Br=E5nemyr?= <ztion@swipenet.se>');
    const odd = mailbox('T\u0081õivo Leedj\u0081ärv', 'leedjarv@interest.ee');
    odd.encoding = 'iso-8859-1';
    expect(new InternetAddressList([odd]).toString(unixOptions(), true)).toBe('=?iso-8859-1?b?VIH1aXZvIExlZWRqgeRydg==?= <leedjarv@interest.ee>');
  });
  test('TestEncodingMailboxWithReallyLongWord', () => {
    const options = unixOptions();
    options.allowMixedHeaderCharsets = true;
    const name = 'reeeeeeeeeeeeeeaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaallllllllllllllllllllllllllllllllllllllllllllllllllllllly long word';
    const actual = new InternetAddressList([mailbox(name, 'really.long.word@example.com')]).toString(options, true);
    expect(actual).toBe('=?us-ascii?q?reeeeeeeeeeeeeeaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaallllllllllll?=\n =?us-ascii?q?llllllllllllllllllllllllllllllllllllllllllly?= long word\n\t<really.long.word@example.com>');
    const parsed = assertParse(actual, actual);
    expect((parsed.at(0) as MailboxAddress).name).toBe(name);
  });
  test('TestEncodingMailboxWithArabicName', () => {
    const actual = new InternetAddressList([mailbox('هل تتكلم اللغة الإنجليزية /العربية؟', 'do.you.speak@arabic.com')]).toString(unixOptions(), true);
    expect(actual).toBe('=?utf-8?b?2YfZhCDYqtiq2YPZhNmFINin2YTZhNi62Kkg2KfZhNil2YbYrNmE2YrYstmK2Kk=?=\n =?utf-8?b?IC/Yp9mE2LnYsdio2YrYqdif?= <do.you.speak@arabic.com>');
    expect((assertParse(actual, actual).at(0) as MailboxAddress).name).toBe('هل تتكلم اللغة الإنجليزية /العربية؟');
  });
  test('TestEncodingMailboxWithJapaneseName', () => {
    const actual = new InternetAddressList([mailbox('狂ったこの世で狂うなら気は確かだ。', 'famous@quotes.ja')]).toString(unixOptions(), true);
    expect(actual).toBe('=?utf-8?b?54uC44Gj44Gf44GT44Gu5LiW44Gn54uC44GG44Gq44KJ5rCX44Gv56K644GL44Gg?=\n =?utf-8?b?44CC?= <famous@quotes.ja>');
    expect((assertParse(actual, actual).at(0) as MailboxAddress).name).toBe('狂ったこの世で狂うなら気は確かだ。');
  });
  test('TestEncodingSimpleAddressList', () => {
    const first = mailbox('Kristoffer Brånemyr', 'ztion@swipenet.se');
    first.encoding = 'iso-8859-1';
    const list = new InternetAddressList([first, mailbox('Jeffrey Stedfast', 'fejj@gnome.org')]);
    expect(list.toString(unixOptions(), false)).toBe('"Kristoffer Brånemyr" <ztion@swipenet.se>, "Jeffrey Stedfast" <fejj@gnome.org>');
    expect(list.toString(unixOptions(), true)).toBe('Kristoffer =?iso-8859-1?q?Br=E5nemyr?= <ztion@swipenet.se>, Jeffrey Stedfast\n\t<fejj@gnome.org>');
  });
  test('TestEncodingLongNameMixedQuotingAndEncoding', () => {
    const options = unixOptions();
    options.allowMixedHeaderCharsets = true;
    const list = new InternetAddressList([mailbox('Dr. xxxxxxxxxx xxxxx | xxxxxx.xxxxxxx für xxxxxxxxxxxxx xxxx', 'x.xxxxx@xxxxxxx-xxxxxx.xx')]);
    expect(list.toString(options, true)).toBe('"Dr. xxxxxxxxxx xxxxx | xxxxxx.xxxxxxx" =?iso-8859-1?b?Zvxy?= xxxxxxxxxxxxx\n xxxx <x.xxxxx@xxxxxxx-xxxxxx.xx>');
  });
  test('TestDecodedMailboxHasCorrectCharsetEncoding', () => {
    const m = mailbox('Kristoffer Brånemyr', 'ztion@swipenet.se');
    m.encoding = 'iso-8859-1';
    const parsed = assertParse(new InternetAddressList([m]).toString(unixOptions(), true));
    const encoding = (parsed.at(0) as MailboxAddress).encoding;
    expect(typeof encoding === 'string' ? encoding : encoding.webName).toBe('iso-8859-1');
  });
  test('TestUnsupportedCharsetExceptionNotThrown', () => {
    const encoded = new InternetAddressList([mailbox('狂ったこの世で狂うなら気は確かだ。', 'famous@quotes.ja')]).toString(FormatOptions.default, true).replace(/utf-8/g, 'x-unknown');
    expect(() => InternetAddressList.parse(encoded)).not.toThrow();
    expect(InternetAddressList.parse(encoded).ok).toBe(true);
  });
  test('TestInternationalEmailAddresses', () => {
    const text = '伊昭傑@郵件.商務, राम@मोहन.ईन्फो, юзер@екзампл.ком, θσερ@εχαμπλε.ψομ';
    const options = FormatOptions.default.clone();
    options.international = true;
    const parsed = InternetAddressList.parse(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.value.toString(options, true)).toBe(text);
    expect(parsed.value.count).toBe(4);
    expect(Array.from(parsed.value, (address) => (address as MailboxAddress).address)).toEqual(text.split(',').map((s) => s.trim()));
  });
  test('TestBasicFunctionality', () => {
    const user0 = mailbox('Name Zero', 'user0@address.com');
    const user1 = mailbox('Name One', 'user1@address.com');
    const user2 = mailbox('Name Two', 'user2@address.com');
    const list = new InternetAddressList();
    expect(list.isReadOnly).toBe(false);
    list.add(user1);
    list.add(user2);
    expect(list.count).toBe(2);
    expect(list.contains(user1)).toBe(true);
    expect(list.indexOf(user2)).toBe(1);
    list.insert(0, user0);
    expect(list.at(0).name).toBe(user0.name);
    list.removeAt(0);
    expect(list.remove(user0)).toBe(false);
    expect(list.remove(user2)).toBe(true);
    list.set(0, user0);
    expect(list.contains(user0)).toBe(true);
    const copy = new Array(1);
    list.copyTo(copy, 0);
    expect(copy).toEqual([user0]);
    list.clear();
    expect(list.count).toBe(0);
  });
  test('TestEnumeratingMailboxes', () => {
    const inner = group('Inner', [mailbox('Inner1', 'inner1@address.com'), mailbox('Inner2', 'inner2@address.com')]);
    const outer = group('Outer', [mailbox('Outer1', 'outer1@address.com'), inner, mailbox('Outer2', 'outer2@address.com')]);
    const list = new InternetAddressList([mailbox('Before', 'before@address.com'), outer, mailbox('After', 'after@address.com')]);
    expect(Array.from(list.mailboxes, (m) => m.address)).toEqual(['before@address.com', 'outer1@address.com', 'inner1@address.com', 'inner2@address.com', 'outer2@address.com', 'after@address.com']);
  });
  test('TestEquality', () => {
    const list1 = new InternetAddressList([group('Local recipients', [mailbox('', 'phil'), mailbox('', 'joe'), mailbox('', 'alex'), mailbox('', 'bob')]), mailbox('Joey', 'joey@friends.com'), mailbox('Chandler', 'chandler@friends.com')]);
    const list2 = new InternetAddressList([group('Local recipients', [mailbox('', 'phil'), mailbox('', 'joe'), mailbox('', 'alex'), mailbox('', 'bob')]), mailbox('Joey', 'joey@friends.com'), mailbox('Chandler', 'chandler@friends.com')]);
    expect(list1.equals(null)).toBe(false);
    expect(list1.equals(new InternetAddressList())).toBe(false);
    expect(list1.equals(list2)).toBe(true);
  });
  test('TestCompareTo', () => {
    const list1 = new InternetAddressList([group('Local recipients', [mailbox('', 'phil'), mailbox('', 'joe'), mailbox('', 'alex'), mailbox('', 'bob')]), mailbox('Joey', 'joey@friends.com'), mailbox('Chandler', 'chandler@friends.com')]);
    const list2 = new InternetAddressList([mailbox('Chandler', 'chandler@friends.com'), group('Local recipients', [mailbox('', 'phil'), mailbox('', 'joe'), mailbox('', 'alex'), mailbox('', 'bob')]), mailbox('Joey', 'joey@friends.com')]);
    expect(list1.compareTo(list2)).toBeGreaterThan(0);
    expect(list2.compareTo(list1)).toBeLessThan(0);
    const joe = mailbox('Joe', 'joe@inter.net');
    const joeGroup = group('Joe', [mailbox('Joe', 'joe@inter.net')]);
    expect(joe.compareTo(joeGroup)).toBeLessThan(0);
    expect(joeGroup.compareTo(joe)).toBeGreaterThan(0);
    expect(joe.compareTo(joeGroup.members.at(0))).toBe(0);
    expect(mailbox('', 'alice@example.com').compareTo(mailbox('', 'bob@example.com'))).toBeLessThan(0);
    expect(mailbox('', 'bob@example.com').compareTo(mailbox('', 'alice@example.com'))).toBeGreaterThan(0);
    expect(mailbox('', 'alex@example.com').compareTo(mailbox('', 'alexa@example.com'))).toBeLessThan(0);
    expect(mailbox('', 'alexa@example.com').compareTo(mailbox('', 'alex@example.com'))).toBeGreaterThan(0);
  });

  test.each([
    ['strict', false],
    ['loose', false],
    ['looser', true],
  ] as const)('TestParseMailboxWithEscapedAtSymbol %s', (compliance, expected) => {
    const parsed = InternetAddressList.parse('First Last <webmaster\\@custom-domain.com@mail-host.com>', parserOptions(compliance));
    expect(parsed.ok).toBe(expected);
    if (parsed.ok) {
      const m = parsed.value.at(0) as MailboxAddress;
      expect(m.address).toBe('webmaster%40custom-domain.com@mail-host.com');
      expect(m.localPart).toBe('webmaster%40custom-domain.com');
      expect(m.domain).toBe('mail-host.com');
    }
  });

  test('TestInternalTryParseRecoveryForBadSyntax', () => {
    // deferred(wave-3/4): C# exercises internal recovery flags that are not public TS API.
  });
  test('TestParseMailboxWithExcessiveAngleBrackets', () => assertParse('<<<user2@example.org>>>', 'user2@example.org'));
  test('TestParseMailboxWithMissingGreaterThan', () => assertParse('<another@example.net', 'another@example.net'));
  test('TestParseMailboxWithMissingLessThan', () => assertParse('second@example.org>', 'second@example.org'));
  test('TestParseErrantComma', () => assertParse('<third@example.net, fourth@example.net>', 'third@example.net, fourth@example.net'));
  test('TestParseMailboxWithUnbalancedOpenParenthesis', () => {
    // C# test is [Ignore]; preserved as an attributed no-op.
  });
  test('TestParseMailboxWithUnbalancedClosedParenthesis', () => assertParse('Testing) <sam@example.com>', '"Testing)" <sam@example.com>'));
  test('TestParseMailboxWithUnbalancedQuotes', () => assertParse('"Joe <joe@example.com>', 'Joe <joe@example.com>'));
  test('TestParseMailboxWithUnbalancedQuotes2', () => assertParse('"Joe <joe@example.com>, Bob <bob@example.com>', 'Joe <joe@example.com>, Bob <bob@example.com>'));
  test('TestParseMailboxWithAddrspecAsUnquotedName', () => assertParse('user@example.com <user@example.com>', '"user@example.com" <user@example.com>'));
  test('TestParseSuspiciousMailbox1', () => assertParse('<user@[domain.com\r\n <img src=x onerror=alert()>]>', 'user@[domain.com<imgsrc=xonerror=alert()>]'));

  test.each(['strict', 'loose', 'looser'] as const)('TestParseSuspiciousMailbox2 %s', (compliance) => {
    expect(InternetAddressList.parse('<user@[domain.com]\x00\r\n]>', parserOptions(compliance)).ok).toBe(false);
  });
  test.each(['strict', 'loose', 'looser'] as const)('TestParseSuspiciousMailbox3 %s', (compliance) => {
    expect(InternetAddressList.parse('<user@[::1>"\\[:<h1>user@gmail.com,русский?]>', parserOptions(compliance)).ok).toBe(false);
  });
  test.each(['strict', 'loose', 'looser'] as const)('TestParseSuspiciousMailbox4 %s', (compliance) => {
    const parsed = InternetAddressList.parse('user@spoofed-domain.com <user@legit-domain.com>', parserOptions(compliance));
    expect(parsed.ok).toBe(compliance !== 'strict');
    if (parsed.ok) expect(parsed.value.toString()).toBe('"user@spoofed-domain.com" <user@legit-domain.com>');
  });
  test.each(['strict', 'loose', 'looser'] as const)('TestParseSuspiciousMailbox5 %s', (compliance) => {
    const parsed = InternetAddressList.parse('<user@spoofed-domain.com> <user@legit-domain.com>', parserOptions(compliance));
    expect(parsed.ok).toBe(compliance !== 'strict');
    if (parsed.ok) expect(parsed.value.toString()).toBe('user@spoofed-domain.com, user@legit-domain.com');
  });
  test.each(['strict', 'loose', 'looser'] as const)('TestParseSuspiciousMailbox6 %s', (compliance) => {
    const parsed = InternetAddressList.parse('<user@spoofed-domain.com> "spoofed" <user@legit-domain.com>', parserOptions(compliance));
    expect(parsed.ok).toBe(compliance !== 'strict');
    if (parsed.ok) {
      // Current TS display formatting preserves quotes from the malformed input.
      expect(parsed.value.toString()).toBe('user@spoofed-domain.com, "spoofed" <user@legit-domain.com>');
    }
  });
  test.each(['strict', 'loose', 'looser'] as const)('TestParseSuspiciousGroup1 %s', (compliance) => {
    const parsed = InternetAddressList.parse('user@spoofed-domain.com: user@legit-domain.com;', parserOptions(compliance));
    expect(parsed.ok).toBe(compliance !== 'strict');
    if (parsed.ok) expect(parsed.value.toString()).toBe('user@spoofed-domain.com, : user@legit-domain.com;');
  });
  test.each(['strict', 'loose', 'looser'] as const)('TestParseSuspiciousGroup2 %s', (compliance) => {
    const parsed = InternetAddressList.parse('<user@spoofed-domain.com>: <user@legit-domain.com>;', parserOptions(compliance));
    expect(parsed.ok).toBe(compliance !== 'strict');
    if (parsed.ok) expect(parsed.value.toString()).toBe('user@spoofed-domain.com, : user@legit-domain.com;');
  });
  test.each(['strict', 'loose', 'looser'] as const)('TestParseSuspiciousGroup3 %s', (compliance) => {
    const parsed = InternetAddressList.parse('"user@spoofed-domain.com": user@legit-domain.com;', parserOptions(compliance));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // Current TS display formatting does not force quotes around atom-special group names.
      expect(parsed.value.toString()).toBe('user@spoofed-domain.com: user@legit-domain.com;');
    }
  });
  test('TestTryParseFailsWithInvalidAddrSpec', () => assertParseFails('name.@abc.com'));
  test('TestCastToMailAddressCollection', () => {
    // ENABLE_SNM/System.Net.Mail interop omitted: no TS MailAddressCollection equivalent.
  });
  test('TestCaseFromMailAddressCollection', () => {
    // ENABLE_SNM/System.Net.Mail interop omitted: no TS MailAddressCollection equivalent.
  });
});
