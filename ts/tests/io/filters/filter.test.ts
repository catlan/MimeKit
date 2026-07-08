import { describe, expect, test } from 'vitest';
import { MemoryStream } from '../../../src/io/stream.js';
import { FilteredStream } from '../../../src/io/filtered-stream.js';
import type { IMimeFilter } from '../../../src/io/filters/mime-filter.js';
import { ArmoredFromFilter } from '../../../src/io/filters/armored-from-filter.js';
import { BestEncodingFilter } from '../../../src/io/filters/best-encoding-filter.js';
import { Dos2UnixFilter } from '../../../src/io/filters/dos2unix-filter.js';
import { MboxFromFilter } from '../../../src/io/filters/mbox-from-filter.js';
import { PassThroughFilter } from '../../../src/io/filters/pass-through-filter.js';
import { TrailingWhitespaceFilter } from '../../../src/io/filters/trailing-whitespace-filter.js';
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

function writeThroughChunks(filter: IMimeFilter, input: string, chunks: number[]): string {
  const stream = new MemoryStream();
  const filtered = new FilteredStream(stream);
  const buffer = bytes(input);
  let offset = 0;

  filtered.add(filter);

  for (const chunk of chunks) {
    const count = Math.min(chunk, buffer.length - offset);
    if (count <= 0)
      break;

    filtered.write(buffer, offset, count);
    offset += count;
  }

  if (offset < buffer.length)
    filtered.write(buffer, offset, buffer.length - offset);

  filtered.flush();

  return text(stream.toArray());
}

describe('FilterTests', () => {
  test('TestArmoredFromFilter', () => {
    const input = "This text is meant to test that the filter will armor lines beginning with\nFrom (like mbox). And let's add another\nFrom line for good measure, shall we?\n";
    const expected = "This text is meant to test that the filter will armor lines beginning with\n=46rom (like mbox). And let's add another\n=46rom line for good measure, shall we?\n";
    const filter = new ArmoredFromFilter();
    const fromIndex = input.indexOf('\nFrom ');

    testArgumentExceptions(filter);
    expect(writeThroughChunks(filter, input, [fromIndex + 3])).toBe(expected);
  });

  test.each([1, 8, 64, 1024])('TestArmoredFromFilterFromRussiaWithLove(%i)', (bufferSize) => {
    const fromRussiaWithLove = 'From Russia with love is one of my favorite James Bond files.\n';
    const iterations = 1000;
    let input = '';
    let expected = '';

    for (let i = 0; i < iterations; i++) {
      input += fromRussiaWithLove;
      expected += `=46${fromRussiaWithLove.substring(1)}`;
    }

    const chunks: number[] = [];
    for (let offset = 0; offset < bytes(input).length; offset += bufferSize)
      chunks.push(bufferSize);

    expect(writeThroughChunks(new ArmoredFromFilter(), input, chunks)).toBe(expected);
  });

  test('TestMboxFromFilter', () => {
    const input = "This text is meant to test that the filter will armor lines beginning with\nFrom (like mbox). And let's add another\nFrom line for good measure, shall we?\n";
    const expected = "This text is meant to test that the filter will armor lines beginning with\n>From (like mbox). And let's add another\n>From line for good measure, shall we?\n";
    const filter = new MboxFromFilter();
    const fromIndex = input.indexOf('\nFrom ');

    testArgumentExceptions(filter);
    expect(writeThroughChunks(filter, input, [fromIndex + 3])).toBe(expected);
  });

  test.each([1, 8, 64, 1024])('TestMboxFromFilterFromRussiaWithLove(%i)', (bufferSize) => {
    const fromRussiaWithLove = 'From Russia with love is one of my favorite James Bond files.\n';
    const iterations = 1000;
    let input = '';
    let expected = '';

    for (let i = 0; i < iterations; i++) {
      input += fromRussiaWithLove;
      expected += `>${fromRussiaWithLove}`;
    }

    const chunks: number[] = [];
    for (let offset = 0; offset < bytes(input).length; offset += bufferSize)
      chunks.push(bufferSize);

    expect(writeThroughChunks(new MboxFromFilter(), input, chunks)).toBe(expected);
  });

  test('TestBestEncodingFilter', () => {
    const fromLines = 'This text is meant to test that the filter will armor lines beginning with\nFrom (like mbox).\n';
    const ascii = 'This is some ascii text to make sure that\nthe filter returns 7bit encoding...\n';
    const french = "Wikipédia est un projet d’encyclopédie collective en ligne, universelle, multilingue et fonctionnant sur le principe du wiki. Wikipédia a pour objectif d’offrir un contenu librement réutilisable, objectif et vérifiable, que chacun peut modifier et améliorer.\n\nTous les rédacteurs des articles de Wikipédia sont bénévoles. Ils coordonnent leurs efforts au sein d'une communauté collaborative, sans dirigeant.";
    const filter = new BestEncodingFilter();

    testArgumentExceptions(filter);

    expect(() => filter.getBestEncoding('7bit', 10)).toThrow(RangeError);

    let stream = new MemoryStream();
    let filtered = new FilteredStream(stream);
    let buffer = bytes(ascii);

    expect(() => filtered.length).toThrow(TypeError);
    expect(() => filtered.setLength(100)).toThrow(TypeError);
    expect(() => filtered.position).toThrow(TypeError);
    expect(() => { filtered.position = 0; }).toThrow(TypeError);
    expect(() => filtered.add(undefined as unknown as IMimeFilter)).toThrow(TypeError);
    expect(() => filtered.contains(undefined as unknown as IMimeFilter)).toThrow(TypeError);
    expect(() => filtered.remove(undefined as unknown as IMimeFilter)).toThrow(TypeError);

    filtered.add(filter);
    expect(filtered.contains(filter)).toBe(true);
    filtered.write(buffer, 0, buffer.length);
    filtered.flush();

    expect(filter.getBestEncoding('7bit')).toBe('7bit');
    expect(filter.getBestEncoding('8bit')).toBe('7bit');
    expect(filter.getBestEncoding('none')).toBe('7bit');
    expect(filtered.remove(filter)).toBe(true);

    filter.reset();

    stream = new MemoryStream();
    filtered = new FilteredStream(stream);
    buffer = bytes(fromLines);
    filtered.add(filter);

    const fromIndex = fromLines.indexOf('\nFrom ');
    const endIndex = fromIndex + 3;
    filtered.write(buffer, 0, endIndex);
    filtered.write(buffer, endIndex, buffer.length - endIndex);
    filtered.flush();

    expect(filter.getBestEncoding('7bit')).toBe('quoted-printable');
    expect(filter.getBestEncoding('8bit')).toBe('quoted-printable');
    expect(filter.getBestEncoding('none')).toBe('quoted-printable');

    filter.reset();

    stream = new MemoryStream();
    filtered = new FilteredStream(stream);
    buffer = bytes(french);
    filtered.add(filter);

    filtered.write(buffer, 0, 60);
    filtered.flush();

    expect(filter.getBestEncoding('7bit')).toBe('quoted-printable');
    expect(filter.getBestEncoding('8bit')).toBe('8bit');
    expect(filter.getBestEncoding('none')).toBe('8bit');

    filter.reset();

    filtered.write(buffer, 0, buffer.length);
    filtered.flush();

    expect(filter.getBestEncoding('7bit')).toBe('quoted-printable');
    expect(filter.getBestEncoding('8bit')).toBe('quoted-printable');
    expect(filter.getBestEncoding('none')).toBe('quoted-printable');

    filter.reset();

    stream = new MemoryStream();
    filtered = new FilteredStream(stream);
    buffer = bytes('abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz\r\nabc\r\n');
    filtered.add(filter);
    filtered.write(buffer, 0, buffer.length);
    filtered.flush();

    expect(filter.getBestEncoding('7bit', 78)).toBe('7bit');
    expect(filter.getBestEncoding('8bit', 78)).toBe('7bit');
    expect(filter.getBestEncoding('none', 78)).toBe('7bit');
  });

  test('TestTrailingWhitespaceFilter', () => {
    const filter = new TrailingWhitespaceFilter();

    testArgumentExceptions(filter);
    expect(writeThrough(filter, 'line  \nline\t\r\nkept in middle \t text\ntrailing\t ')).toBe('line\nline\r\nkept in middle \t text\ntrailing');
  });

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
