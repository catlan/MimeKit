/**
 * Port of UnitTests/Utils/CharsetUtilsTests.cs.
 *
 * Adaptations: C# TestArgumentExceptions is null-argument checks that don't
 * apply to typed TS. TestNotSupportedExceptions maps to tryGetEncoding()
 * returning null (the port's non-throwing surface). TestConvertToUnicode's
 * gb2312.GetBytes() input is a pregenerated fixture (tests/fixtures/, CP936
 * via Python's gbk codec — identical to .NET codepage 936) because encoding
 * to legacy charsets is unsupported by design (plan Q3).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  convertToUnicode,
  getCodePage,
  getEncodingForCodePage,
  getMimeCharset,
  latin1,
  parseCodePage,
  tryGetEncoding,
} from '../../src/utils/charset-utils.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

describe('CharsetUtils', () => {
  test('TestNotSupportedExceptions', () => {
    expect(tryGetEncoding('x-undefined')).toBeNull();
    expect(getCodePage('x-undefined')).toBe(-1);
  });

  test('TestParseCodePage', () => {
    expect(parseCodePage('iso10646')).toBe(1201);
    expect(parseCodePage('iso-10646')).toBe(1201);
    expect(parseCodePage('iso10646-1')).toBe(1201);
    expect(parseCodePage('iso-10646-1')).toBe(1201);

    expect(parseCodePage('iso8859-1')).toBe(28591);
    expect(parseCodePage('iso8859_1')).toBe(28591);
    expect(parseCodePage('iso-8859-1')).toBe(28591);
    expect(parseCodePage('iso_8859_1')).toBe(28591);
    expect(parseCodePage('latin1')).toBe(28591);

    expect(parseCodePage('iso2022-jp')).toBe(50220);
    expect(parseCodePage('iso-2022-jp')).toBe(50220);
    expect(parseCodePage('iso_2022_jp')).toBe(50220);
    expect(parseCodePage('iso2022-kr')).toBe(50225);
    expect(parseCodePage('iso-2022-kr')).toBe(50225);
    expect(parseCodePage('iso_2022_kr')).toBe(50225);

    expect(parseCodePage('windows-cp1252')).toBe(1252);
    expect(parseCodePage('windows-1252')).toBe(1252);
    expect(parseCodePage('cp-1252')).toBe(1252);
    expect(parseCodePage('cp1252')).toBe(1252);

    expect(parseCodePage('cp')).toBe(-1);
    expect(parseCodePage('iso')).toBe(-1);
    expect(parseCodePage('ibm')).toBe(-1);
    expect(parseCodePage('windows')).toBe(-1);
    expect(parseCodePage('windows-')).toBe(-1);

    expect(parseCodePage('iso-8859')).toBe(-1);
    expect(parseCodePage('iso-BB59')).toBe(-1);
    expect(parseCodePage('iso-8859-')).toBe(-1);
    expect(parseCodePage('iso-8859-A')).toBe(-1);
    expect(parseCodePage('iso-2022-US')).toBe(-1);
    expect(parseCodePage('iso-4999-1')).toBe(-1);
    expect(parseCodePage('iso-abcd-1')).toBe(-1);
  });

  test('TestConvertToUnicode', () => {
    const expected = readFileSync(join(fixturesDir, 'convert-to-unicode.expected.txt'), 'utf8');
    const input = new Uint8Array(readFileSync(join(fixturesDir, 'convert-to-unicode.gb2312.bin')));
    const gb2312 = getEncodingForCodePage(936);
    expect(gb2312).not.toBeNull();

    expect(convertToUnicode(input, gb2312)).toBe(expected);
    expect(gb2312!.decode(input)).toBe(expected);
  });

  test('TestGetMimeCharset', () => {
    expect(getMimeCharset('latin1')).toBe('iso-8859-1');
    expect(getMimeCharset(latin1)).toBe('iso-8859-1');
    expect(getMimeCharset('gibberish')).toBe('gibberish');

    expect(getMimeCharset(getEncodingForCodePage(932)!)).toBe('shift_jis');
    expect(getMimeCharset(getEncodingForCodePage(50220)!)).toBe('iso-2022-jp');
    expect(getMimeCharset(getEncodingForCodePage(50221)!)).toBe('iso-2022-jp');
    expect(getMimeCharset(getEncodingForCodePage(50222)!)).toBe('iso-2022-jp');

    // C# guards 50225 with try/catch (may be unsupported) — same here.
    const iso2022kr = getEncodingForCodePage(50225);
    if (iso2022kr !== null)
      expect(getMimeCharset(iso2022kr)).toBe('euc-kr');

    expect(getMimeCharset(getEncodingForCodePage(949)!)).toBe('euc-kr');
  });

  test('convertToUnicode picks utf-8 over latin1 for valid utf-8', () => {
    const text = 'héllo wörld — ünïcode';
    const bytes = new TextEncoder().encode(text);
    expect(convertToUnicode(bytes)).toBe(text);
  });

  test('convertToUnicode falls back to latin1 for invalid utf-8', () => {
    const bytes = new Uint8Array([0x68, 0xe9, 0x6c, 0x6c, 0x6f]); // latin1 "héllo"
    expect(convertToUnicode(bytes)).toBe('héllo');
  });
});
