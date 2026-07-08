import { describe, expect, test } from 'vitest';
import { InternetAddress, MailboxAddress, GroupAddress, ParserOptions } from '../src/index.js';

function expectParse(text: string): void {
  const parsed = InternetAddress.parse(text);
  expect(parsed.ok, text).toBe(true);
}

function expectFailure(text: string): void {
  const parsed = InternetAddress.parse(text);
  expect(parsed.ok, text).toBe(false);
}

describe('InternetAddress', () => {
  test.each([
    '',
    ' \t\r\n',
    'Name <',
    'jeff@',
    'jeff.',
    '"invalid\r\nquoted"@domain.com',
    '"invalid\\\rquoted"@domain.com',
    '"incomplete quoted string',
    'Name (incomplete comment <user@domain.com>',
    'Name <user@domain.com (incomplete comment>',
    'Name <user@[127.0.0.1] (incomplete comment>',
    'Name <user@domain.com> (incomplete comment',
    'user@',
    '<@',
    '<@domain.com',
    '<@domain.com ',
    '<@(incomplete comment',
    '<@domain.com:>',
    'Name <@domain.com>',
    'user@domain.com, user2@domain.com',
  ])('parse failure: %j', expectFailure);

  test.each([
    '"\t !\\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\\\]^_`abcdefghijklmnopqrstuvwxyz{|}~"@domain.com',
    '"名がドメイン"@domain.com',
    'user',
    'user>',
    'user (User Name)',
    'user@domain.com',
    'User Name <user@domain.com>',
    'Last, First <user@domain.com>',
    'Last, First. <user@domain.com>',
    '< user@domain.com>',
    '<user@domain.com >',
    'Group: user@domain.com;',
    'Group: user@domain.com',
    'Group:',
    '<<user@domain.com>>',
    'Name <user@domain.com',
    'user@domain.com>',
    '"Name <user@domain.com',
    'user@domain.com <user@domain.com>',
    'Name [x] <user@domain.com>',
  ])('parse success: %j', expectParse);

  test('strict disallows unquoted commas in names', () => {
    const options = ParserOptions.default.clone();
    options.addressParserComplianceMode = 'strict';
    options.allowUnquotedCommasInAddresses = false;
    expect(InternetAddress.parse('Last, First <user@domain.com>', options).ok).toBe(false);
  });

  test('parses concrete types', () => {
    const mailbox = InternetAddress.parse('User <user@example.com>');
    expect(mailbox.ok && mailbox.value instanceof MailboxAddress).toBe(true);
    const group = InternetAddress.parse('Team: User <user@example.com>;');
    expect(group.ok && group.value instanceof GroupAddress).toBe(true);
  });

  test.each([
    'Group: a@b.com (unterminated',
    'a:b:c:d:e@f.com;',
  ])('propagates group member-list parse errors: %j', (text) => {
    expect(InternetAddress.parse(text).ok).toBe(false);
  });

  test('compareTo matches ordinal-ignore-case domain prefix rules', () => {
    const shortDomain = new MailboxAddress(null, 'user@example.com');
    const longDomain = new MailboxAddress(null, 'user@example.com.au');
    expect(shortDomain.compareTo(longDomain)).toBe(0);

    const bracketName = new MailboxAddress('[', 'user@example.com');
    const lowerName = new MailboxAddress('a', 'user@example.com');
    expect(bracketName.compareTo(lowerName)).toBeGreaterThan(0);
  });

  test('preserves decoded group display-name charset encoding', () => {
    const parsed = InternetAddress.parse('=?iso-8859-1?q?Keld_J=F8rn_Simonsen?=:;');
    expect(parsed.ok && parsed.value instanceof GroupAddress).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.name).toBe('Keld Jørn Simonsen');
      expect(typeof parsed.value.encoding === 'string' ? parsed.value.encoding : parsed.value.encoding.webName).toBe('iso-8859-1');
    }
  });
});
