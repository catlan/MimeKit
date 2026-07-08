import { describe, expect, test } from 'vitest';
import { FormatOptions, GroupAddress, MailboxAddress } from '../src/index.js';

function assertParse(text: string): GroupAddress {
  const parsed = GroupAddress.parse(text);
  expect(parsed.ok, text).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function assertParseFailure(text: string, tryParseResult = false): void {
  // Adapted from C# AssertParseFailure: TS parse() has TryParse-style Result semantics.
  expect(GroupAddress.parse(text).ok, text).toBe(tryParseResult);
}

describe('GroupAddress', () => {
  test('TestClone', () => {
    const options = FormatOptions.default.clone();
    options.newLineFormat = 'unix';
    options.international = true;

    const inner = new GroupAddress('Inner Group Name');
    inner.members.add(new MailboxAddress('First Inner Name', 'first-inner@address.com'));
    inner.members.add(new MailboxAddress('Second Inner Name', 'second-inner@address.com'));

    const group = new GroupAddress('Group Name');
    group.members.add(new MailboxAddress('First Name', 'first@address.com'));
    group.members.add(new MailboxAddress('Second Name', 'second@address.com'));
    group.members.add(inner);
    group.members.add(new MailboxAddress('Third Name', 'third@address.com'));

    const clone = group.clone();
    expect(group.compareTo(clone)).toBe(0);
    expect(clone).not.toBe(group);
    expect(clone.equals(group)).toBe(true);
    expect(clone.toString(options, true)).toBe('Group Name: First Name <first@address.com>, Second Name <second@address.com>, \n\tInner Group Name: First Inner Name <first-inner@address.com>, \n\tSecond Inner Name <second-inner@address.com>;, Third Name <third@address.com>;');
  });

  test('TestParseEmpty', () => assertParseFailure(''));
  test('TestParseWhiteSpace', () => assertParseFailure(' \t\r\n'));
  test('TestParseNameLessThan', () => assertParseFailure('Name <'));
  test('TestParseMailboxWithEmptyDomain', () => assertParseFailure('jeff@'));
  test('TestParseMailboxWithIncompleteLocalPart', () => assertParseFailure('jeff.'));
  test('TestParseIncompleteQuotedString', () => assertParseFailure('"This quoted string never ends... oh no!'));
  test('TestParseMailboxWithIncompleteCommentAfterName', () => assertParseFailure('Name (incomplete comment'));
  test('TestParseMailboxWithIncompleteCommentAfterAddrspec', () => assertParseFailure('jeff@xamarin.com (incomplete comment'));
  test('TestParseMailboxWithIncompleteCommentAfterAddress', () => assertParseFailure('<jeff@xamarin.com> (incomplete comment'));
  test('TestParseIncompleteAddrspec', () => assertParseFailure('jeff@ (comment)'));
  test('TestParseAddrspecNoAtDomain', () => assertParseFailure('jeff'));
  test('TestParseAddrspec', () => assertParseFailure('jeff@xamarin.com'));
  test('TestParseMailbox', () => assertParseFailure('Jeffrey Stedfast <jestedfa@microsoft.com>'));
  test('TestParseMailboxWithUnquotedCommaAndDotInName', () => assertParseFailure('Warren Worthington, Jr. <warren@worthington.com>'));
  test('TestParseMailboxWithOpenAngleSpace', () => assertParseFailure('Jeffrey Stedfast < jeff@xamarin.com>'));
  test('TestParseMailboxWithCloseAngleSpace', () => assertParseFailure('Jeffrey Stedfast <jeff@xamarin.com >'));
  test('TestParseMailboxWithIncompleteRoute', () => assertParseFailure('Skye <@'));
  test('TestParseMailboxWithoutColonAfterRoute', () => assertParseFailure('Skye <@hackers.com,@shield.gov'));

  test('TestParseGroup', () => {
    const group = assertParse('Agents of Shield: Skye <skye@shield.gov>, Leo Fitz <fitz@shield.gov>, Melinda May <may@shield.gov>;');
    expect(group.name).toBe('Agents of Shield');
    expect(group.members.count).toBe(3);
  });

  test('TestParseIncompleteGroup', () => {
    const group = assertParse('Agents of Shield: Skye <skye@shield.gov>, Leo Fitz <fitz@shield.gov>, Melinda May <may@shield.gov>');
    expect(group.name).toBe('Agents of Shield');
    expect(group.members.count).toBe(3);
  });

  test('TestParseGroupNameColon', () => {
    // Adapted: C# TryParse succeeds but Parse throws; TS parse() exposes the TryParse outcome.
    const group = assertParse('Agents of Shield:');
    expect(group.name).toBe('Agents of Shield');
    expect(group.members.count).toBe(0);
  });

  test('TestParseGroupAndMailbox', () => {
    assertParseFailure('Agents of Shield: Skye <skye@shield.gov>, Leo Fitz <fitz@shield.gov>, May <may@shield.gov>;, Fury <fury@shield.gov>');
  });

  test('TestDefaultMaxGroupDepthOverflow', () => {
    assertParse('group0: group1: group2: milbox@host.com;;;');
    assertParseFailure('group0: group1: group2: group3: milbox@host.com;;;;');
  });
});
