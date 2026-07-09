// Port of UnitTests/Cryptography/DkimRelaxedBodyFilterTests.cs.

import { describe, expect, test } from 'vitest';
import { DkimRelaxedBodyFilter } from '../../src/dkim/dkim-relaxed-body-filter.js';

function ascii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

function decode(bytes: Uint8Array, index: number, length: number): string {
  let s = '';
  for (let i = index; i < index + length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

describe('DkimRelaxedBodyFilterTests', () => {
  test('TestWhiteSpaceBeforeNewLine', () => {
    const text = 'text\t \r\n\t \r\ntext\t \r\n';
    const expected = 'text\r\n\r\ntext\r\n';
    const input = ascii(text);
    const filter = new DkimRelaxedBodyFilter();

    const result = filter.flush(input, 0, input.length);
    const actual = decode(result.buffer, result.index, result.length);

    expect(actual).toBe(expected);

    filter.reset();
  });

  test('TestTrimmingEmptyLines', () => {
    const text = 'Hello!\r\n  \r\n\r\n';
    const expected = 'Hello!\r\n';
    const input = ascii(text);
    const filter = new DkimRelaxedBodyFilter();

    const result = filter.flush(input, 0, input.length);
    const actual = decode(result.buffer, result.index, result.length);

    expect(actual).toBe(expected);

    filter.reset();
  });

  test('TestMultipleWhiteSpacesPerLine', () => {
    const text = 'This is a test of the relaxed body filter with  \t multiple \t  spaces\n';
    const expected = 'This is a test of the relaxed body filter with multiple spaces\n';
    const input = ascii(text);
    const filter = new DkimRelaxedBodyFilter();

    const result = filter.flush(input, 0, input.length);
    const actual = decode(result.buffer, result.index, result.length);

    expect(actual).toBe(expected);

    filter.reset();
  });

  test('TestNonEmptyBodyEndingWithMultipleNewLines', () => {
    const text = 'This is a test of the relaxed body filter with a non-empty body ending with multiple new-lines\n\n\n';
    const expected = 'This is a test of the relaxed body filter with a non-empty body ending with multiple new-lines\n';
    const input = ascii(text);
    const filter = new DkimRelaxedBodyFilter();

    const result = filter.flush(input, 0, input.length);
    const actual = decode(result.buffer, result.index, result.length);

    expect(actual).toBe(expected);

    filter.reset();
  });
});
