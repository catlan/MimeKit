/**
 * Port of UnitTests/Encodings/PunycodeTests.cs.
 *
 * C# TestArgumentExceptions (new Punycode(null)) is inapplicable — the TS
 * class takes no IdnMapping argument.
 */
import { describe, expect, test } from 'vitest';
import { Punycode } from '../../src/encodings/punycode.js';

const punycode = new Punycode();

describe('Punycode', () => {
  test.each([
    ['abc.org', 'abc.org'],
    ['my_company.com', 'my_company.com'],
    ['bücher.com', 'xn--bcher-kva.com'],
    ['мойдомен.рф', 'xn--d1acklchcc.xn--p1ai'],
    ['παράδειγμα.δοκιμή', 'xn--hxajbheg2az3al.xn--jxalpdlp'],
    ['mycharity。org', 'mycharity.org'],
  ])('TestEncode(%s)', (value, expected) => {
    expect(punycode.encode(value)).toBe(expected);
  });

  test.each([
    ['user@abc.org', 5, 'abc.org'],
    ['user@my_company.com', 5, 'my_company.com'],
    ['user@bücher.com', 5, 'xn--bcher-kva.com'],
    ['user@мойдомен.рф', 5, 'xn--d1acklchcc.xn--p1ai'],
    ['user@παράδειγμα.δοκιμή', 5, 'xn--hxajbheg2az3al.xn--jxalpdlp'],
    ['user@mycharity。org', 5, 'mycharity.org'],
  ])('TestEncodeIndex(%s, %i)', (value, index, expected) => {
    expect(punycode.encode(value, index)).toBe(expected);
  });

  test.each([
    ['(user@abc.org)', 6, 7, 'abc.org'],
    ['(user@my_company.com)', 6, 14, 'my_company.com'],
    ['(user@bücher.com)', 6, 10, 'xn--bcher-kva.com'],
    ['(user@мойдомен.рф)', 6, 11, 'xn--d1acklchcc.xn--p1ai'],
    ['(user@παράδειγμα.δοκιμή)', 6, 17, 'xn--hxajbheg2az3al.xn--jxalpdlp'],
    ['(user@mycharity。org)', 6, 13, 'mycharity.org'],
  ])('TestEncodeIndexCount(%s, %i, %i)', (value, index, count, expected) => {
    expect(punycode.encode(value, index, count)).toBe(expected);
  });

  test.each([
    ['abc.org', 'abc.org'],
    ['my_company.com', 'my_company.com'],
    ['xn--bcher-kva.com', 'bücher.com'],
    ['xn--d1acklchcc.xn--p1ai', 'мойдомен.рф'],
    ['xn--hxajbheg2az3al.xn--jxalpdlp', 'παράδειγμα.δοκιμή'],
  ])('TestDecode(%s)', (value, expected) => {
    expect(punycode.decode(value)).toBe(expected);
  });

  test.each([
    ['user@abc.org', 5, 'abc.org'],
    ['user@my_company.com', 5, 'my_company.com'],
    ['user@xn--bcher-kva.com', 5, 'bücher.com'],
    ['user@xn--d1acklchcc.xn--p1ai', 5, 'мойдомен.рф'],
    ['user@xn--hxajbheg2az3al.xn--jxalpdlp', 5, 'παράδειγμα.δοκιμή'],
  ])('TestDecodeIndex(%s, %i)', (value, index, expected) => {
    expect(punycode.decode(value, index)).toBe(expected);
  });

  test.each([
    ['(user@abc.org)', 6, 7, 'abc.org'],
    ['(user@my_company.com)', 6, 14, 'my_company.com'],
    ['(user@xn--bcher-kva.com)', 6, 17, 'bücher.com'],
    ['(user@xn--d1acklchcc.xn--p1ai)', 6, 23, 'мойдомен.рф'],
    ['(user@xn--hxajbheg2az3al.xn--jxalpdlp)', 6, 31, 'παράδειγμα.δοκιμή'],
  ])('TestDecodeIndexCount(%s, %i, %i)', (value, index, count, expected) => {
    expect(punycode.decode(value, index, count)).toBe(expected);
  });

  test('invalid ranges throw RangeError', () => {
    expect(() => punycode.encode('abc.org', -1)).toThrow(RangeError);
    expect(() => punycode.encode('abc.org', 0, 99)).toThrow(RangeError);
    expect(() => punycode.decode('abc.org', 99)).toThrow(RangeError);
  });
});
