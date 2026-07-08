import { describe, expect, test } from 'vitest';
import { PassThroughDecoder } from '../../src/encodings/pass-through-decoder.js';
import {
  assertDecoderArgumentExceptions,
  cloneAndAssertDecoder,
  resetAndAssertDecoder,
} from './codec-test-helpers.js';

describe('PassThroughDecoder', () => {
  test('TestArgumentExceptions', () => {
    assertDecoderArgumentExceptions(new PassThroughDecoder('default'));
  });

  test('TestEncoding', () => {
    const decoder = new PassThroughDecoder('default');
    expect(decoder.encoding).toBe('default');
  });

  test('TestClone', () => {
    const sample = new Uint8Array([0, 1, 2, 3, 4, 5]);
    cloneAndAssertDecoder(new PassThroughDecoder('default'), sample);
  });

  test('TestReset', () => {
    const sample = new Uint8Array([0, 1, 2, 3, 4, 5]);
    resetAndAssertDecoder(new PassThroughDecoder('default'), sample);
  });

  test('TestDecode', () => {
    const bufferSize = 1024;
    const decoder = new PassThroughDecoder('default');
    const input = new Uint8Array(bufferSize);
    const output = new Uint8Array(bufferSize);
    for (let i = 0; i < input.length; i++)
      input[i] = i & 0xff;

    const n = decoder.decode(input, 0, input.length, output);

    expect(n).toBe(input.length);
    expect(output.subarray(0, n)).toEqual(input);
  });
});
