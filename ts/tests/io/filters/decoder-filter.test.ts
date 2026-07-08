import { describe, expect, test } from 'vitest';
import type { ContentEncoding } from '../../../src/content-encoding.js';
import { DecoderFilter } from '../../../src/io/filters/decoder-filter.js';
import { PassThroughFilter } from '../../../src/io/filters/pass-through-filter.js';

function assertIsDecoderFilter(encoding: ContentEncoding | string, expected: ContentEncoding): void {
  const filter = DecoderFilter.create(encoding);

  expect(filter, `Expected DecoderFilter for ${encoding}`).toBeInstanceOf(DecoderFilter);

  const decoder = filter as DecoderFilter;
  expect(decoder.encoding, `Expected decoder's Encoding to be ${expected}`).toBe(expected);
}

describe('DecoderFilterTests', () => {
  test('TestCreate', () => {
    expect(() => DecoderFilter.create(null as unknown as string)).toThrow(TypeError);

    assertIsDecoderFilter('base64', 'base64');
    assertIsDecoderFilter('base64', 'base64');

    expect(DecoderFilter.create('binary')).toBeInstanceOf(PassThroughFilter);
    expect(DecoderFilter.create('binary')).toBeInstanceOf(PassThroughFilter);

    expect(DecoderFilter.create(-1 as unknown as ContentEncoding)).toBeInstanceOf(PassThroughFilter);
    expect(DecoderFilter.create('default')).toBeInstanceOf(PassThroughFilter);
    expect(DecoderFilter.create('x-invalid')).toBeInstanceOf(PassThroughFilter);

    expect(DecoderFilter.create('8bit')).toBeInstanceOf(PassThroughFilter);
    expect(DecoderFilter.create('8bit')).toBeInstanceOf(PassThroughFilter);

    assertIsDecoderFilter('quoted-printable', 'quoted-printable');
    assertIsDecoderFilter('quoted-printable', 'quoted-printable');

    expect(DecoderFilter.create('7bit')).toBeInstanceOf(PassThroughFilter);
    expect(DecoderFilter.create('7bit')).toBeInstanceOf(PassThroughFilter);

    assertIsDecoderFilter('uuencode', 'uuencode');
    assertIsDecoderFilter('x-uuencode', 'uuencode');
    assertIsDecoderFilter('uuencode', 'uuencode');
  });
});
