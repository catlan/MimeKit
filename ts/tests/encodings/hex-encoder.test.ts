import { describe, expect, test } from 'vitest';
import { HexEncoder } from '../../src/encodings/hex-encoder.js';
import {
  assertEncoderArgumentExceptions,
  cloneAndAssertEncoder,
  resetAndAssertEncoder,
} from './codec-test-helpers.js';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const asciiString = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const hebrewIso88598 = new Uint8Array([0xed, 0xe5, 0xec, 0xf9, 0x20, 0xef, 0xe1, 0x20, 0xe9, 0xec, 0xe8, 0xf4, 0xf0]);

function encodeString(encoder: HexEncoder, input: Uint8Array, flush: boolean): string {
  const output = new Uint8Array(1024);
  const n = flush ? encoder.flush(input, 0, input.length, output) : encoder.encode(input, 0, input.length, output);
  return asciiString(output.subarray(0, n));
}

describe('HexEncoder', () => {
  test('TestArgumentExceptions', () => {
    assertEncoderArgumentExceptions(new HexEncoder());
  });

  test('TestEncoding', () => {
    const encoder = new HexEncoder();
    expect(encoder.encoding).toBe('default');
  });

  test('TestClone', () => {
    cloneAndAssertEncoder(new HexEncoder());
  });

  test('TestReset', () => {
    resetAndAssertEncoder(new HexEncoder());
  });

  test('TestEncodeHebrew', () => {
    const expected = '%ED%E5%EC%F9%20%EF%E1%20%E9%EC%E8%F4%F0';
    const encoder = new HexEncoder();

    expect(encodeString(encoder, hebrewIso88598, false)).toBe(expected);
    encoder.reset();
    expect(encodeString(encoder, hebrewIso88598, true)).toBe(expected);
  });

  test('TestEncodeAttrSpecials', () => {
    const expected = '%20%09%0D%0AABCabc123!%40#$%25^&%2A%28%29_+`-%3D%5B%5D%5C{}|%3B%3A%27%22%2C.%2F%3C%3E%3F';
    const input = ascii(' \t\r\nABCabc123!@#$%^&*()_+`-=[]\\{}|;:\'",./<>?');
    const encoder = new HexEncoder();

    expect(encodeString(encoder, input, false)).toBe(expected);
    encoder.reset();
    expect(encodeString(encoder, input, true)).toBe(expected);
  });
});
