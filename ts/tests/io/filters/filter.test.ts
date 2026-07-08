import { describe, expect, test } from 'vitest';
import { MemoryStream } from '../../../src/io/stream.js';
import { FilteredStream } from '../../../src/io/filtered-stream.js';
import type { IMimeFilter } from '../../../src/io/filters/mime-filter.js';
import { Dos2UnixFilter } from '../../../src/io/filters/dos2unix-filter.js';
import { PassThroughFilter } from '../../../src/io/filters/pass-through-filter.js';
import { Unix2DosFilter } from '../../../src/io/filters/unix2dos-filter.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

function text(data: Uint8Array): string {
  return decoder.decode(data);
}

function testArgumentExceptions(filter: IMimeFilter): void {
  const buffer = new Uint8Array(10);

  expect(() => filter.filter(undefined as unknown as Uint8Array, 0, 0)).toThrow(TypeError);
  expect(() => filter.filter(buffer, -1, 0)).toThrow(RangeError);
  expect(() => filter.filter(buffer, 0, 20)).toThrow(RangeError);

  expect(() => filter.flush(undefined as unknown as Uint8Array, 0, 0)).toThrow(TypeError);
  expect(() => filter.flush(buffer, -1, 0)).toThrow(RangeError);
  expect(() => filter.flush(buffer, 0, 20)).toThrow(RangeError);
}

function writeThrough(filter: IMimeFilter, input: string): string {
  const stream = new MemoryStream();
  const filtered = new FilteredStream(stream);
  const buffer = bytes(input);

  filtered.add(filter);
  filtered.write(buffer, 0, buffer.length);
  filtered.flush();
  filtered.flush();

  return text(stream.toArray());
}

describe('FilterTests', () => {
  test('TestPassThroughFilter', () => {
    const filter = new PassThroughFilter();
    const buffer = new Uint8Array(10);

    let result = filter.filter(buffer, 1, buffer.length - 2);
    expect(result.buffer).toBe(buffer);
    expect(result.index).toBe(1);
    expect(result.length).toBe(buffer.length - 2);

    result = filter.flush(buffer, 1, buffer.length - 2);
    expect(result.buffer).toBe(buffer);
    expect(result.index).toBe(1);
    expect(result.length).toBe(buffer.length - 2);

    filter.reset();
  });

  function testUnix2DosFilter(input: string, expected: string, ensureNewLine: boolean): void {
    const filter = new Unix2DosFilter(ensureNewLine);

    testArgumentExceptions(filter);

    expect(writeThrough(filter, input)).toBe(expected);
  }

  test('TestUnix2DosFilterSimple', () => {
    const input = "This text is meant to test that the filter will convert unix line endings to dos.\nHere's a second line of text.\nAnd one more line for good measure, shall we?";
    const expected = "This text is meant to test that the filter will convert unix line endings to dos.\r\nHere's a second line of text.\r\nAnd one more line for good measure, shall we?";

    testUnix2DosFilter(input, expected, false);
    testUnix2DosFilter(input, `${expected}\r\n`, true);
  });

  test('TestUnix2DosFilterMixedLineEndings', () => {
    const input = "This text is meant to test that the filter will convert unix line endings to dos.\nHere's a second line of text.\r\nAnd one more line for good measure, shall we?\r";
    const expected = "This text is meant to test that the filter will convert unix line endings to dos.\r\nHere's a second line of text.\r\nAnd one more line for good measure, shall we?\r";

    testUnix2DosFilter(input, expected, false);
    testUnix2DosFilter(input, `${expected}\n`, true);
  });

  function testDos2UnixFilter(input: string, expected: string, ensureNewLine: boolean): void {
    const filter = new Dos2UnixFilter(ensureNewLine);

    testArgumentExceptions(filter);

    expect(writeThrough(filter, input)).toBe(expected);
  }

  test('TestDos2UnixFilterSimple', () => {
    const input = "This text is meant to test that the filter will convert dos line endings to unix.\r\nHere's a second line of text.\r\nAnd one more line for good measure, shall we?";
    const expected = "This text is meant to test that the filter will convert dos line endings to unix.\nHere's a second line of text.\nAnd one more line for good measure, shall we?";

    testDos2UnixFilter(input, expected, false);
    testDos2UnixFilter(input, `${expected}\n`, true);
  });

  test('TestDos2UnixFilterMixedLineEndings', () => {
    const input = "This text is meant to test that the filter will convert dos line endings to unix.\nHere's a second line of text.\r\nAnd one more line for good measure, shall we?\n";
    const expected = "This text is meant to test that the filter will convert dos line endings to unix.\nHere's a second line of text.\nAnd one more line for good measure, shall we?\n";

    testDos2UnixFilter(input, expected, false);
    testDos2UnixFilter(input, expected, true);
  });
});
