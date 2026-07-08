import { describe, expect, test } from 'vitest';
import type { ContentEncoding } from '../../../src/content-encoding.js';
import { EncoderFilter } from '../../../src/io/filters/encoder-filter.js';
import { PassThroughFilter } from '../../../src/io/filters/pass-through-filter.js';

function assertIsEncoderFilter(encoding: ContentEncoding | string, expected: ContentEncoding): void {
  const filter = EncoderFilter.create(encoding);

  expect(filter, `Expected EncoderFilter for ${encoding}`).toBeInstanceOf(EncoderFilter);

  const encoder = filter as EncoderFilter;
  expect(encoder.encoding, `Expected encoder's Encoding to be ${expected}`).toBe(expected);
}

describe('EncoderFilterTests', () => {
  test('TestArgumentExceptions', () => {
    expect(() => EncoderFilter.create(null as unknown as string)).toThrow(TypeError);
  });

  test('TestCreate', () => {
    expect(() => EncoderFilter.create(null as unknown as string)).toThrow(TypeError);

    assertIsEncoderFilter('base64', 'base64');
    assertIsEncoderFilter('base64', 'base64');

    expect(EncoderFilter.create('binary')).toBeInstanceOf(PassThroughFilter);
    expect(EncoderFilter.create('binary')).toBeInstanceOf(PassThroughFilter);

    expect(EncoderFilter.create(-1 as unknown as ContentEncoding)).toBeInstanceOf(PassThroughFilter);
    expect(EncoderFilter.create('default')).toBeInstanceOf(PassThroughFilter);
    expect(EncoderFilter.create('x-invalid')).toBeInstanceOf(PassThroughFilter);

    expect(EncoderFilter.create('8bit')).toBeInstanceOf(PassThroughFilter);
    expect(EncoderFilter.create('8bit')).toBeInstanceOf(PassThroughFilter);

    assertIsEncoderFilter('quoted-printable', 'quoted-printable');
    assertIsEncoderFilter('quoted-printable', 'quoted-printable');

    expect(EncoderFilter.create('7bit')).toBeInstanceOf(PassThroughFilter);
    expect(EncoderFilter.create('7bit')).toBeInstanceOf(PassThroughFilter);

    assertIsEncoderFilter('uuencode', 'uuencode');
    assertIsEncoderFilter('x-uuencode', 'uuencode');
    assertIsEncoderFilter('uuencode', 'uuencode');
  });
});
