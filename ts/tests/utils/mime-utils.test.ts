import { describe, expect, test } from 'vitest';
import {
  appendQuoted,
  enumerateReferences,
  generateMessageId,
  quote,
  tryParse,
  tryParseMessageId,
  tryParseVersion,
  unquote,
} from '../../src/utils/mime-utils.js';

const ascii = new TextEncoder();
const asciiDecoder = new TextDecoder('ascii');

describe('MimeUtilsTests', () => {
  test('TestArgumentExceptions', () => {
    const buffer = new Uint8Array(1024);

    expect(() => generateMessageId(null as unknown as string)).toThrow(TypeError);
    expect(() => generateMessageId('')).toThrow(TypeError);

    expect(() => Array.from(enumerateReferences(null))).toThrow(TypeError);
    expect(() => Array.from(enumerateReferences(null, 0, 0))).toThrow(TypeError);
    expect(() => Array.from(enumerateReferences(buffer, -1, 0))).toThrow(RangeError);
    expect(() => Array.from(enumerateReferences(buffer, buffer.length + 1, 0))).toThrow(RangeError);
    expect(() => Array.from(enumerateReferences(buffer, 0, -1))).toThrow(RangeError);
    expect(() => Array.from(enumerateReferences(buffer, 0, buffer.length + 1))).toThrow(RangeError);

    expect(() => tryParseMessageId(null)).toThrow(TypeError);
    expect(() => tryParseMessageId(null, 0, 0)).toThrow(TypeError);
    expect(() => tryParseMessageId(buffer, -1, 0)).toThrow(RangeError);
    expect(() => tryParseMessageId(buffer, buffer.length + 1, 0)).toThrow(RangeError);
    expect(() => tryParseMessageId(buffer, 0, -1)).toThrow(RangeError);
    expect(() => tryParseMessageId(buffer, 0, buffer.length + 1)).toThrow(RangeError);

    expect(() => appendQuoted(null as unknown as string[], 'text')).toThrow(TypeError);
    expect(() => appendQuoted([], null as unknown as string)).toThrow(TypeError);
    expect(() => quote(null as unknown as string)).toThrow(TypeError);
    expect(() => unquote(null as unknown as string)).toThrow(TypeError);
  });

  const goodReferences = [
    ['<local-part@domain1@domain2>', 'local-part@domain1@domain2'],
    ['<local-part@>', 'local-part@'],
    ['<local-part>', 'local-part'],
    ['<:invalid-local-part;@domain.com>', ':invalid-local-part;@domain.com'],
  ] as const;

  test('TestParseGoodReferences', () => {
    for (const [input, expected] of goodReferences) {
      const reference = Array.from(enumerateReferences(input))[0] ?? null;
      expect(reference, `Incorrectly parsed reference '${input}'.`).toBe(expected);

      const parsed = tryParseMessageId(input);
      expect(parsed.ok).toBe(true);
      if (parsed.ok)
        expect(parsed.value, `Incorrectly parsed message-id '${input}'.`).toBe(expected);
    }
  });

  const brokenReferences = [
    ' (this is an unterminated comment...',
    '(this is just a comment)',
    '<',
    '<local-part',
    '<local-part;',
    '<local-part@ (unterminated comment...',
    '<local-part@',
    '<local-part @ bad-domain (comment) . (comment com',
    '<local-part@[127.0',
  ] as const;

  test('TestParseBrokenReferences', () => {
    for (const input of brokenReferences) {
      const reference = Array.from(enumerateReferences(input))[0] ?? null;
      expect(reference, `MimeUtils.EnumerateReferences("${input}")`).toBeNull();

      const parsed = tryParseMessageId(input);
      expect(parsed.ok).toBe(true);
      if (parsed.ok)
        expect(parsed.value, `MimeUtils.ParseMessageId ("${input}")`).toBeNull();
    }
  });

  test('TestTryParseVersion', () => {
    let version = tryParseVersion(' 1 (comment) .\t0\r\n');
    expect(version.ok, '1.0').toBe(true);
    if (version.ok)
      expect(version.value.toString()).toBe('1.0');

    version = tryParseVersion(' 1 (comment) .\t0\r\n .0\r\n');
    expect(version.ok, '1.0.0').toBe(true);
    if (version.ok)
      expect(version.value.toString()).toBe('1.0.0');

    version = tryParseVersion(' 1 (comment) .\t0\r\n .0.0\r\n');
    expect(version.ok, '1.0.0.0').toBe(true);
    if (version.ok)
      expect(version.value.toString()).toBe('1.0.0.0');

    expect(tryParseVersion('1').ok, '1').toBe(false);
    expect(tryParseVersion('1.2.3.4.5').ok, '1.2.3.4.5').toBe(false);
    expect(tryParseVersion('1x2.3').ok, '1x2.3').toBe(false);
    expect(tryParseVersion('(unterminated comment').ok, 'unterminated comment').toBe(false);
    expect(tryParseVersion('1 (unterminated comment').ok, '1 + unterminated comment').toBe(false);
  });

  test('TestTryParseContentEncoding', () => {
    expect(tryParse(null).ok).toBe(false);
    expect(tryParse(' 7BIT ').ok && tryParse(' 7BIT ').value).toBe('7bit');
    expect(tryParse('8bit').ok && tryParse('8bit').value).toBe('8bit');
    expect(tryParse('binary;').ok && tryParse('binary;').value).toBe('binary');
    expect(tryParse('base64').ok && tryParse('base64').value).toBe('base64');
    expect(tryParse('quoted-printable').ok && tryParse('quoted-printable').value).toBe('quoted-printable');
    expect(tryParse('x-uuencode').ok && tryParse('x-uuencode').value).toBe('uuencode');
    expect(tryParse('uuencode').ok && tryParse('uuencode').value).toBe('uuencode');
    expect(tryParse('x-uue').ok && tryParse('x-uue').value).toBe('uuencode');
    expect(tryParse('x-invalid').ok).toBe(false);
  });

  test('TestGenerateMessageIdWithInternationalDomain', () => {
    const domain = 'Mjölnir';

    const msgid = generateMessageId(domain);
    const at = msgid.indexOf('@');
    const idn = msgid.slice(at + 1);

    expect(idn).toBe('xn--mjlnir-xxa');
  });

  test('TestAppendQuoted', () => {
    const expected = '"This is a multi-line quoted string with \\\\backslashes\\\\ and an escaped dquote (\\") inside of it."';
    const text = 'This is a multi-line quoted string with \\backslashes\\ and an escaped dquote (") inside of it.';
    const builder: string[] = [];

    appendQuoted(builder, text);

    expect(builder.join('')).toBe(expected);
  });

  test('TestUnquote', () => {
    const quoted = '"This is a multi-line quoted string with\r\n\t\\\\backslashes\\\\ and an escaped dquote (\\") inside of it."';
    const expected = 'This is a multi-line quoted string with \\backslashes\\ and an escaped dquote (") inside of it.';
    let result = unquote(quoted, true);

    expect(result, 'Unquote(string)').toBe(expected);

    const bytes = ascii.encode(quoted);
    const unquoted = unquote(bytes, 0, bytes.length, true);
    result = asciiDecoder.decode(unquoted);

    expect(result, 'Unquote(byte[])').toBe(expected);
  });
});
