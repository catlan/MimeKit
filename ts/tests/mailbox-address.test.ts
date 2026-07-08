import { describe, expect, test } from 'vitest';
import { FormatOptions, MailboxAddress, ParserOptions } from '../src/index.js';

const latin1Bytes = (text: string): Uint8Array => Uint8Array.from(Array.from(text, (ch) => ch.charCodeAt(0) & 0xff));

function optionsFor(mode: 'strict' | 'loose' | 'looser') {
  const options = ParserOptions.default.clone();
  options.addressParserComplianceMode = mode;
  return options;
}

function assertParse(text: string | Uint8Array, mode?: 'strict' | 'loose' | 'looser'): MailboxAddress {
  const parsed = MailboxAddress.parse(text, mode ? optionsFor(mode) : ParserOptions.default);
  expect(parsed.ok, typeof text === 'string' ? text : Array.from(text).join(',')).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function assertParseFailure(text: string | Uint8Array, mode?: 'strict' | 'loose' | 'looser'): void {
  // Adapted from C# AssertParseFailure: TS parse() has TryParse-style Result semantics.
  expect(MailboxAddress.parse(text, mode ? optionsFor(mode) : ParserOptions.default).ok).toBe(false);
}

describe('MailboxAddress', () => {
  test('ArgumentExceptionTests', () => {
    const mailbox = new MailboxAddress('Johnny Appleseed', 'johnny@example.com');
    // Adapted: TS has fewer constructor overloads and uses TypeError for ArgumentNullException.
    expect(() => new MailboxAddress('name', null as unknown as string)).toThrow(TypeError);
    expect(() => { mailbox.address = null as unknown as string; }).toThrow(TypeError);
    expect(() => mailbox.compareTo(null as never)).toThrow(TypeError);
    expect(() => MailboxAddress.encodeAddrspec(null as unknown as string)).toThrow(TypeError);
    expect(() => MailboxAddress.decodeAddrspec(null as unknown as string)).toThrow(TypeError);
    // ENABLE_SNM/System.Net.Mail SecureMailboxAddress interop cases omitted: no TS cryptography/mail interop surface.
  });

  test('TestLocalPartAndDomain', () => {
    let mailbox = new MailboxAddress('User Name', 'user@domain.com');
    expect(mailbox.localPart).toBe('user');
    expect(mailbox.domain).toBe('domain.com');
    mailbox = new MailboxAddress('User Name', 'user');
    expect(mailbox.localPart).toBe('user');
    expect(mailbox.domain).toBe('');
  });

  test('TestSetEmptyAddress', () => {
    const mailbox = new MailboxAddress('Postmaster', '');
    expect(mailbox.isInternational).toBe(false);
    expect(mailbox.address).toBe('');
  });

  test('TestGarbageAfterAddress', () => {
    expect(() => new MailboxAddress('Name', 'fejj@helixcode.com garbage')).toThrow(TypeError);
  });

  test('TestCastToMailAddress', () => {
    // ENABLE_SNM/System.Net.Mail interop omitted: no TS MailAddress equivalent.
  });

  test('TestParseEmpty', () => assertParseFailure(''));
  test('TestParseWhiteSpace', () => assertParseFailure(' \t\r\n'));
  test('TestParseNameLessThan', () => assertParseFailure('Name <'));
  test('TestParseMailboxWithEmptyDomain', () => assertParseFailure('jeff@'));
  test('TestParseMailboxWithIncompleteLocalPart', () => assertParseFailure('jeff.'));
  test('TestParseMailboxWithInvalidQuotedLocalPart', () => {
    const text = '"invalid\r\nquoted"@domain.com';
    assertParseFailure(text);
    expect(() => new MailboxAddress('Name', text)).toThrow(TypeError);
  });
  test('TestParseMailboxWithInvalidQuotedPairLocalPart', () => {
    const text = '"invalid\\\rquoted"@domain.com';
    assertParseFailure(text);
    expect(() => new MailboxAddress('Name', text)).toThrow(TypeError);
  });
  test('TestParseMailboxWithValidQuotedLocalPart', () => {
    const text = '"\t !\\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\\\]^_`abcdefghijklmnopqrstuvwxyz{|}~"@domain.com';
    assertParse(text);
    expect(() => new MailboxAddress('Name', text)).not.toThrow();
  });
  test('TestParseMailboxWithValidUTF8QuotedLocalPart', () => {
    const text = '"名がドメイン"@domain.com';
    assertParse(text);
    expect(() => new MailboxAddress('Name', text)).not.toThrow();
  });
  test('TestParseIncompleteQuotedString', () => assertParseFailure('"This quoted string never ends... oh no!'));
  test('TestParseMailboxWithIncompleteCommentAfterName', () => assertParseFailure('Name (incomplete comment'));
  test('TestParseMailboxWithIncompleteCommentAfterAddrspec', () => assertParseFailure('jeff@xamarin.com (incomplete comment'));
  test('TestParseMailboxWithIncompleteCommentAfterDomainLiteralAddrspec', () => assertParseFailure('jeff@[127.0.0.1] (incomplete comment'));
  test('TestParseMailboxWithIncompleteCommentAfterAddress', () => assertParseFailure('<jeff@xamarin.com> (incomplete comment'));
  test('TestParseIncompleteAddrspec', () => assertParseFailure('jeff@ (comment)'));
  test('TestParseIncompleteRoutedMailboxAt', () => assertParseFailure('Name <@'));
  test('TestParseIncompleteRoutedMailbox', () => assertParseFailure('Name <@route:'));
  test('TestParseIncompleteRoutedMailboxSpace', () => assertParseFailure('Name <@route: '));
  test('TestParseIncompleteCommentInRoute', () => assertParseFailure('Name <@route,(comment'));
  test('TestParseInvalidRouteInMailbox', () => assertParseFailure('Name <@route,invalid:user@example.com>'));
  test('TestParseMailboxWithInternationalRoute', () => assertParse('User Name <@route,@伊昭傑@郵件.商務:user@domain.com>'));
  test('TestParseIdnAddress', () => expect(assertParse('user@xn--v8jxj3d1dzdz08w.com').address).toBe('user@名がドメイン.com'));
  test('TestParseAddrspecNoAtDomain', () => assertParse('jeff'));
  test('TestParseAddrspecNoAtDomainGreaterThan', () => {
    assertParseFailure('jeff>', 'strict');
    assertParse('jeff>');
  });
  test('TestParseAddrspecNoAtDomainWithIncompleteComment', () => assertParseFailure('jeff (Jeffrey Stedfast'));
  test('TestParseAddrspecNoAtDomainWithComment', () => {
    const mailbox = assertParse('jeff (Jeffrey Stedfast)');
    expect(mailbox.name).toBe('Jeffrey Stedfast');
    expect(mailbox.address).toBe('jeff');
  });
  test('TestParseAddrspec', () => assertParse('jeff@xamarin.com'));
  test('TestParseMailbox', () => assertParse('Jeffrey Stedfast <jestedfa@microsoft.com>'));
  test('TestParseMailboxWithUnquotedCommaAndDotInName', () => assertParse('Warren Worthington, Jr. <warren@worthington.com>'));
  test('TestParseMailboxWithUnquotedCommaInName', () => {
    const text = 'Worthington, Warren <warren@worthington.com>';
    expect(assertParse(text).name).toBe('Worthington, Warren');
    const options = ParserOptions.default.clone();
    options.allowUnquotedCommasInAddresses = false;
    options.allowAddressesWithoutDomain = false;
    expect(MailboxAddress.parse(text, options).ok).toBe(false);
  });
  test('TestParseMailboxWithOpenAngleSpace', () => assertParse('Jeffrey Stedfast < jeff@xamarin.com>'));
  test('TestParseMailboxWithCloseAngleSpace', () => assertParse('Jeffrey Stedfast <jeff@xamarin.com >'));
  test('TestParseMailboxWithIncompleteRoute', () => assertParseFailure('Skye <@'));
  test('TestParseMailboxWithoutColonAfterRoute', () => assertParseFailure('Skye <@hackers.com,@shield.gov'));
  test('TestParseMultipleMailboxes', () => assertParseFailure('Skye <skye@shield.gov>, Leo Fitz <fitz@shield.gov>, Melinda May <may@shield.gov>'));
  test('TestParseGroup', () => assertParseFailure('Agents of Shield: Skye <skye@shield.gov>, Leo Fitz <fitz@shield.gov>, Melinda May <may@shield.gov>;'));
  test('TestParseIncompleteGroup', () => assertParseFailure('Agents of Shield: Skye <skye@shield.gov>, Leo Fitz <fitz@shield.gov>, Melinda May <may@shield.gov>'));
  test('TestParseGroupNameColon', () => assertParseFailure('Agents of Shield:'));

  test('TestGetAddress', () => {
    let mailbox = new MailboxAddress('Unit Test', '點看@domain.com');
    expect(mailbox.getAddress(false)).toBe('點看@domain.com');
    expect(mailbox.getAddress(true)).toBe('點看@domain.com');
    mailbox = new MailboxAddress('Unit Test', 'user@名がドメイン.com');
    expect(mailbox.getAddress(false)).toBe('user@名がドメイン.com');
    expect(mailbox.getAddress(true)).toBe('user@xn--v8jxj3d1dzdz08w.com');
    mailbox = new MailboxAddress('Unit Test', 'user@xn--v8jxj3d1dzdz08w.com');
    expect(mailbox.getAddress(false)).toBe('user@名がドメイン.com');
    expect(mailbox.getAddress(true)).toBe('user@xn--v8jxj3d1dzdz08w.com');
    mailbox = new MailboxAddress('Unit Test', '點看@名がドメイン.com');
    expect(mailbox.getAddress(false)).toBe('點看@名がドメイン.com');
    expect(mailbox.getAddress(true)).toBe('點看@xn--v8jxj3d1dzdz08w.com');
    mailbox = new MailboxAddress('Unit Test', '點看@xn--v8jxj3d1dzdz08w.com');
    expect(mailbox.getAddress(false)).toBe('點看@名がドメイン.com');
    expect(mailbox.getAddress(true)).toBe('點看@xn--v8jxj3d1dzdz08w.com');
  });

  test('TestIsInternational', () => {
    const options = FormatOptions.default.clone();
    options.international = true;
    let mailbox = new MailboxAddress('Unit Test', '點看@domain.com');
    expect(mailbox.isInternational).toBe(true);
    expect(mailbox.toString(options, true)).toBe('Unit Test <點看@domain.com>');
    mailbox = new MailboxAddress('Unit Test', 'user@名がドメイン.com');
    expect(mailbox.isInternational).toBe(true);
    expect(mailbox.toString(options, true)).toBe('Unit Test <user@名がドメイン.com>');
    mailbox = new MailboxAddress('Unit Test', 'user@xn--v8jxj3d1dzdz08w.com');
    expect(mailbox.isInternational).toBe(true);
    expect(mailbox.toString(options, true)).toBe('Unit Test <user@名がドメイン.com>');
    mailbox = new MailboxAddress('Unit Test', 'user@domain.com');
    mailbox.route.add('route1');
    mailbox.route.add('名がドメイン.com');
    expect(mailbox.isInternational).toBe(true);
    expect(mailbox.toString(options, true)).toBe('Unit Test <@route1,@名がドメイン.com:user@domain.com>');
  });

  test('TestIdnEncoding', () => {
    const domainAscii = 'user@xn--v8jxj3d1dzdz08w.com';
    const domainUnicode = 'user@名がドメイン.com';
    expect(MailboxAddress.encodeAddrspec('')).toBe('');
    expect(MailboxAddress.decodeAddrspec('')).toBe('');
    expect(MailboxAddress.encodeAddrspec(domainUnicode)).toBe(domainAscii);
    expect(MailboxAddress.decodeAddrspec(domainAscii)).toBe(domainUnicode);
    let mailbox = new MailboxAddress('', domainAscii);
    expect(mailbox.getAddress(true)).toBe(domainAscii);
    expect(mailbox.getAddress(false)).toBe(domainUnicode);
    mailbox = new MailboxAddress('', domainUnicode);
    expect(mailbox.getAddress(true)).toBe(domainAscii);
    expect(mailbox.getAddress(false)).toBe(domainUnicode);
  });

  test('TestRoutedMailbox', () => {
    const mailbox = new MailboxAddress('Rusty McRouterson', 'rusty@final-destination.com');
    mailbox.route.add('comcast.net');
    mailbox.route.add('forward.com');
    mailbox.route.add('geek.net');
    const expected = 'Rusty McRouterson\n\t<@comcast.net,@forward.com,@geek.net:rusty@final-destination.com>';
    expect(mailbox.toString(FormatOptions.default, true)).toBe(expected);
    assertParse(expected);
    mailbox.name = null;
    expect(mailbox.toString(FormatOptions.default, true)).toBe('<@comcast.net,@forward.com,@geek.net:rusty@final-destination.com>');
    expect(mailbox.toString(FormatOptions.default, false)).toBe('<@comcast.net,@forward.com,@geek.net:rusty@final-destination.com>');
  });

  test('TestInternationalRoutedMailbox', () => {
    const mailbox = new MailboxAddress('User Name', 'user@domain.com', ['route', '伊昭傑@郵件.商務']);
    const options = FormatOptions.default.clone();
    expect(mailbox.toString(options, true)).toBe('User Name <@route,@xn--@-216a8b89fj88ctw7c.xn--lhr59c:user@domain.com>');
    options.international = true;
    expect(mailbox.toString(options, true)).toBe('User Name <@route,@伊昭傑@郵件.商務:user@domain.com>');
  });

  test('TestParseMailboxWithExcessiveAngleBrackets', () => {
    assertParse('<<<user2@example.org>>>');
    assertParseFailure('User 2 <<<user2@example.org>', 'strict');
    assertParseFailure('User 2 <user2@example.org>>>', 'strict');
  });
  test('TestParseMailboxWithMissingGreaterThan', () => {
    assertParse('<another@example.net');
    assertParseFailure('<another@example.net', 'strict');
  });
  test('TestParseMailboxWithMissingLessThan', () => {
    assertParse('second@example.org>');
    assertParseFailure('second@example.org>', 'strict');
  });
  test('TestParseMailboxWithUnbalancedQuotes', () => {
    assertParse('"Joe <joe@example.com>');
    assertParseFailure('"Joe <joe@example.com>', 'strict');
    assertParseFailure(' "', 'loose');
  });
  test('TestParseMailboxWithAddrspecAsUnquotedName', () => {
    assertParse('user@example.com <user@example.com>');
    assertParseFailure('user@example.com <user@example.com>', 'strict');
  });
  test('TestParseMailboxWithLatin1EncodedAddrspecLoose', () => assertParse(latin1Bytes('Name <æøå@example.com>')));
  test('TestParseMailboxWithLatin1EncodedAddrspecStrict', () => assertParseFailure(latin1Bytes('Name <æøå@example.com>'), 'strict'));
  test('TestParseMailboxWithSquareBracketsInDisplayName', () => {
    assertParse('[Invalid Sender] <sender@tk2-201-10422.vs.sakura.ne.jp>');
    assertParseFailure('[Invalid Sender] <sender@tk2-201-10422.vs.sakura.ne.jp>', 'strict');
  });
  test('TestParseMailboxWithSquareBracketsAnd8BitTextInDisplayName', () => {
    assertParse('Tom Doe [Cörp Öne] <tom.doe@corpone.com>');
    assertParseFailure('Tom Doe [Cörp Öne] <tom.doe@corpone.com>', 'strict');
  });
  test('TestParseAddrspecWithUnicodeLocalPart', () => assertParse('test.täst@test.net'));
  test('TestParseAddrspecWithZeroWidthSpace', () => assertParse('\u200Btest@test.co.uk'));
  test('TestParseAddrspecEndingWithDot', () => {
    assertParse('test.@gmail.com', 'looser');
    assertParseFailure('test.@gmail.com', 'loose');
    assertParseFailure('test.@gmail.com', 'strict');
  });
  test('TestParseAddrspecEndingWithDotDot', () => {
    assertParse('test..@gmail.com', 'looser');
    assertParseFailure('test..@gmail.com', 'loose');
    assertParseFailure('test..@gmail.com', 'strict');
  });
  test('TestParseAddrspecWithDotDot', () => {
    assertParse('test..test@gmail.com', 'looser');
    assertParseFailure('test..test@gmail.com', 'loose');
    assertParseFailure('test..test@gmail.com', 'strict');
  });
});
