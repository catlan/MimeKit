import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { testDataDir } from '../gates/helpers.js';
import { HtmlEntityDecoder } from '../../src/index.js';

const htmlDir = join(testDataDir, 'html');

describe('HtmlEntityDecoder', () => {
  test('TestArgumentExceptions', () => {
    const decoder = new HtmlEntityDecoder();
    // C#: ArgumentOutOfRangeException when the first pushed char is not '&'.
    expect(() => decoder.push('a')).toThrow(RangeError);
  });

  test('TestDecodeNamedEntities', () => {
    const path = join(htmlDir, 'HtmlEntities.json');
    const entities = JSON.parse(readFileSync(path, 'utf8')) as Record<string, { codepoints: number[]; characters: string }>;
    const decoder = new HtmlEntityDecoder();

    for (const [name, entry] of Object.entries(entities)) {
      const value = entry.characters;
      for (let i = 0; i < name.length; i++) {
        expect(decoder.push(name[i]!), `Failed to push char #${i} of "${name}".`).toBe(true);
      }
      expect(decoder.getValue(), `Decoded entity did not match for "${name}".`).toBe(value);
      decoder.reset();
    }
  });

  const numericEntities: [string, string][] = [
    ['&#x00;', '�'],
    ['&#x80;', '€'],
    ['&#x82;', '‚'],
    ['&#x83;', 'ƒ'],
    ['&#x84;', '„'],
    ['&#x85;', '…'],
    ['&#x86;', '†'],
    ['&#x87;', '‡'],
    ['&#x88;', 'ˆ'],
    ['&#x89;', '‰'],
    ['&#x8A;', 'Š'],
    ['&#x8B;', '‹'],
    ['&#x8C;', 'Œ'],
    ['&#x8E;', 'Ž'],
    ['&#x91;', '‘'],
    ['&#x92;', '’'],
    ['&#x93;', '“'],
    ['&#x94;', '”'],
    ['&#x95;', '•'],
    ['&#x96;', '–'],
    ['&#x97;', '—'],
    ['&#x98;', '˜'],
    ['&#x99;', '™'],
    ['&#x9A;', 'š'],
    ['&#x9B;', '›'],
    ['&#x9C;', 'œ'],
    ['&#x9E;', 'ž'],
    ['&#x9F;', 'Ÿ'],
    ['&#X10FFFF;', '&#X10FFFF;'], // parse error
    ['&#xD800;', '�'],
    ['&#1;', '&#1;'],
    ['&#32;', ' '],
    ['&#x7a;', 'z'],
  ];

  test.each(numericEntities)('TestDecodeNumericEntities %s', (text, expected) => {
    const decoder = new HtmlEntityDecoder();
    for (let i = 0; i < text.length; i++) {
      expect(decoder.push(text[i]!), `Failed to push char #${i} of "${text}".`).toBe(true);
    }
    expect(decoder.getValue(), `Decoded entity did not match for "${text}".`).toBe(expected);
  });

  const INT_MAX = 2147483647;
  const invalidNumeric: string[] = [
    '&#a',
    '&#/',
    '&#x@',
    '&#xG',
    '&#xg',
    '&#xFFFFFFFF',
    '&#x7FFFFFFF0',
    `&#${Math.floor(INT_MAX / 10)}${(INT_MAX % 10) + 1}`,
  ];

  test.each(invalidNumeric)('TestPushInvalidNumericEntities %s', (text) => {
    const decoder = new HtmlEntityDecoder();
    for (let i = 0; i < text.length; i++) {
      if (i + 1 === text.length)
        expect(decoder.push(text[i]!), `Should have failed to push char #${i} of "${text}".`).toBe(false);
      else expect(decoder.push(text[i]!), `Failed to push char #${i} of "${text}".`).toBe(true);
    }
  });

  test('TestIncompleteNumericEntity', () => {
    const decoder = new HtmlEntityDecoder();

    expect(decoder.push('&')).toBe(true);
    expect(decoder.push('#')).toBe(true);
    expect(decoder.push('x')).toBe(true);
    expect(decoder.push('9')).toBe(true);
    expect(decoder.push('5')).toBe(true);

    expect(decoder.getValue()).toBe('&#x95');
  });
});
