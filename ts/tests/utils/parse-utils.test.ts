import { describe, expect, test } from 'vitest';
import {
  tryParseDomain,
  tryParseInt32,
  tryParseMsgId,
  skipQuoted,
  type ParseError,
} from '../../src/utils/parse-utils.js';

const encoder = new TextEncoder();
const utf8 = (value: string): Uint8Array => encoder.encode(value);
const ascii = (value: string): Uint8Array => new Uint8Array([...value].map((c) => c.charCodeAt(0) & 0xff));
const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
const comma = ascii(',');

describe('ParseUtilsTests', () => {
  test('TestTryParseInt32', () => {
    let buffer = ascii(String(2147483647));
    let cursor = { index: 0 };

    const max = tryParseInt32(buffer, cursor, buffer.length);
    expect(max.ok).toBe(true);
    expect(max.ok ? max.value : undefined).toBe(2147483647);

    buffer = ascii(String(2147483648));
    cursor = { index: 0 };

    expect(tryParseInt32(buffer, cursor, buffer.length).ok).toBe(false);

    buffer = ascii(String(2147483647 * 10));
    cursor = { index: 0 };

    expect(tryParseInt32(buffer, cursor, buffer.length).ok).toBe(false);
  });

  test('TestSkipBadlyQuoted', () => {
    const buffer = ascii('"This is missing the end quote.');
    let cursor = { index: 0 };

    const result = skipQuoted(buffer, cursor, buffer.length);
    expect(result.ok).toBe(false);
    expect(cursor.index).toBe(buffer.length);

    cursor = { index: 0 };
    const throwingEquivalent = skipQuoted(buffer, cursor, buffer.length);
    expect(throwingEquivalent.ok).toBe(false);
    expect((throwingEquivalent.ok ? undefined : throwingEquivalent.error as ParseError).tokenIndex).toBe(0);
    expect((throwingEquivalent.ok ? undefined : throwingEquivalent.error as ParseError).errorIndex).toBe(buffer.length);
  });

  const goodDomains = [
    ['[127.0.0.1]', '[127.0.0.1]'],
    ['amazon (comment) . (comment) com (comment)', 'amazon.com'],
    ['测试文本.cn', '测试文本.cn'],
  ] as const;

  test.each(goodDomains)('TestTryParseGoodDomains %#', (input, expected) => {
    const buffer = utf8(input);
    const cursor = { index: 0 };

    const result = tryParseDomain(buffer, cursor, buffer.length, comma);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toBe(expected);
  });

  const badDomains = [
    { input: '[127.0.0.1', buffer: utf8('[127.0.0.1'), tokenIndex: 0, errorIndex: 10 },
    { input: '[127\\.0.0.1]', buffer: utf8('[127\\.0.0.1]'), tokenIndex: 0, errorIndex: 4 },
    { input: 'amazon (comment) . (comment com', buffer: utf8('amazon (comment) . (comment com'), tokenIndex: 19, errorIndex: 31 },
    { input: '测试文本.cn', buffer: bytes(178, 226, 202, 212, 206, 196, 177, 190, 46, 99, 110), tokenIndex: 0, errorIndex: 0 },
  ];

  test.each(badDomains)('TestTryParseBadDomains $input', ({ buffer, tokenIndex, errorIndex }) => {
    let cursor = { index: 0 };
    expect(tryParseDomain(buffer, cursor, buffer.length, comma).ok).toBe(false);

    cursor = { index: 0 };
    const result = tryParseDomain(buffer, cursor, buffer.length, comma);
    expect(result.ok).toBe(false);
    const error = result.ok ? undefined : result.error as ParseError;
    expect(error?.tokenIndex).toBe(tokenIndex);
    expect(error?.errorIndex).toBe(errorIndex);
  });

  const msgIdTokens = [
    [' <Messe_Bauma_rz(1)_ae284449-6bdc-488f-8ec3-5be5e5b09efb.jpg>', 'Messe_Bauma_rz(1)_ae284449-6bdc-488f-8ec3-5be5e5b09efb.jpg'],
    [' Messe_Bauma_rz(1)_ae284449-6bdc-488f-8ec3-5be5e5b09efb.jpg', 'Messe_Bauma_rz(1)_ae284449-6bdc-488f-8ec3-5be5e5b09efb.jpg'],
    [' <15627601.388658.1676916781911.JavaMail."xxxxxx@united.com"@xxxxxxx.ual.com>', '15627601.388658.1676916781911.JavaMail."xxxxxx@united.com"@xxxxxxx.ual.com'],
    [' @0@', '@0@'],
  ] as const;

  test.each(msgIdTokens)('TestTryParseMsgIdTokens %#', (input, expected) => {
    const buffer = ascii(input);
    const cursor = { index: 0 };

    const result = tryParseMsgId(buffer, cursor, buffer.length, false);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toBe(expected);
  });

  const msgIdFailures = [
    { name: 'TestTryParseMsgIdEmptyString', input: ' ', tokenIndex: 1, errorIndex: 1 },
    { name: 'TestTryParseMsgIdLessThan', input: ' <', tokenIndex: 1, errorIndex: 2 },
    { name: 'TestTryParseMsgIdLessThanLocalPart', input: ' <local-part', tokenIndex: 1, errorIndex: 12 },
    { name: 'TestTryParseMsgIdLessThanLocalPartDot', input: ' <local-part.', tokenIndex: 1, errorIndex: 13 },
    { name: 'TestTryParseMsgIdLessThanLocalPartAt', input: ' <local-part@', tokenIndex: 1, errorIndex: 13 },
    { name: 'TestTryParseMsgIdLessThanLocalPartAtDomainMissingGreaterThan', input: ' <local-part@domain', tokenIndex: 1, errorIndex: 19 },
    { name: 'TestTryParseMsgIdInvalidQuotedLocalPart', input: ' <"quoted-string@domain>', tokenIndex: 2, errorIndex: 24 },
  ];

  test.each(msgIdFailures)('$name', ({ input, tokenIndex, errorIndex }) => {
    let buffer = ascii(input);
    let cursor = { index: 0 };

    expect(tryParseMsgId(buffer, cursor, buffer.length, false).ok).toBe(false);

    buffer = ascii(input);
    cursor = { index: 0 };
    const result = tryParseMsgId(buffer, cursor, buffer.length, false);
    expect(result.ok).toBe(false);
    const error = result.ok ? undefined : result.error as ParseError;
    expect(error?.tokenIndex).toBe(tokenIndex);
    expect(error?.errorIndex).toBe(errorIndex);
  });

  test('TestTryParseMsgIdLessThanLocalPartAtGreaterThan', () => {
    const buffer = ascii(' <local-part@>');
    const cursor = { index: 0 };

    const result = tryParseMsgId(buffer, cursor, buffer.length, false);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toBe('local-part@');
  });

  test('TestTryParseMsgIdInvalidInternationalLocalPart', () => {
    const buffer = bytes(0x20, 0x3c, 0xe6, 0xf8, 0xe5, 0x40, 0x64, 0x6f, 0x6d, 0x61, 0x69, 0x6e, 0x3e);
    let cursor = { index: 0 };

    expect(tryParseMsgId(buffer, cursor, buffer.length, false).ok).toBe(false);

    cursor = { index: 0 };
    const result = tryParseMsgId(buffer, cursor, buffer.length, false);
    expect(result.ok).toBe(false);
    const error = result.ok ? undefined : result.error as ParseError;
    expect(error?.tokenIndex).toBe(2);
    expect(error?.errorIndex).toBe(2);
  });

  test('TestTryParseMsgIdWithIdnDomain', () => {
    const buffer = ascii(' <id@xn--v8jxj3d1dzdz08w.com>');
    const expected = 'id@名がドメイン.com';
    let cursor = { index: 0 };

    let result = tryParseMsgId(buffer, cursor, buffer.length, false);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toBe(expected);

    cursor = { index: 0 };
    result = tryParseMsgId(buffer, cursor, buffer.length, false);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toBe(expected);
  });

  test('TestTryParseMsgIdWithDoubleDomains', () => {
    const buffer = ascii(' <id@domain1@domain2>');
    const cursor = { index: 0 };

    const result = tryParseMsgId(buffer, cursor, buffer.length, false);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toBe('id@domain1@domain2');
  });

  test('TestTryParseMsgIdWithAtAfterDomain', () => {
    const buffer = ascii(' <id@domain@>');
    const cursor = { index: 0 };

    expect(tryParseMsgId(buffer, cursor, buffer.length, false).ok).toBe(false);
  });
});
