import { describe, expect, test } from 'vitest';
import { HexDecoder } from '../../src/encodings/hex-decoder.js';
import {
  assertDecoderArgumentExceptions,
  cloneAndAssertDecoder,
  resetAndAssertDecoder,
} from './codec-test-helpers.js';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const asciiString = (bytes: Uint8Array) => String.fromCharCode(...bytes);

function decode(decoder: HexDecoder, input: string): Uint8Array {
  const bytes = ascii(input);
  const output = new Uint8Array(1024);
  const n = decoder.decode(bytes, 0, bytes.length, output);
  return output.subarray(0, n);
}

describe('HexDecoder', () => {
  test('TestArgumentExceptions', () => {
    assertDecoderArgumentExceptions(new HexDecoder());
  });

  test('TestEncoding', () => {
    const decoder = new HexDecoder();
    expect(decoder.encoding).toBe('default');
  });

  test('TestClone', () => {
    cloneAndAssertDecoder(new HexDecoder(), ascii('before%20after%'));
  });

  test('TestReset', () => {
    resetAndAssertDecoder(new HexDecoder(), ascii('before%20after%'));
  });

  test('TestDecodeHebrew', () => {
    const input = 'This should decode: (%ED%E5%EC%F9 %EF%E1 %E9%EC%E8%F4%F0) while %X1%S1%Z1 should not';
    const expected = new Uint8Array([
      ...ascii('This should decode: ('),
      0xed, 0xe5, 0xec, 0xf9, 0x20, 0xef, 0xe1, 0x20, 0xe9, 0xec, 0xe8, 0xf4, 0xf0,
      ...ascii(') while %X1%S1%Z1 should not'),
    ]);

    expect(decode(new HexDecoder(), input)).toEqual(expected);
  });

  test('TestEncodeAttrSpecials', () => {
    const input = '%20%09%0D%0AABCabc123!%40#$%25^&%2A%28%29_+`-%3D%5B%5D%5C{}|%3B%3A%27%22%2C.%2F%3C%3E%3F';
    const expected = ' \t\r\nABCabc123!@#$%^&*()_+`-=[]\\{}|;:\'",./<>?';

    expect(asciiString(decode(new HexDecoder(), input))).toBe(expected);
  });
});
