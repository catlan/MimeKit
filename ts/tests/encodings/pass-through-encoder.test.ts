import { describe, expect, test } from 'vitest';
import { PassThroughEncoder } from '../../src/encodings/pass-through-encoder.js';
import {
  assertEncoderArgumentExceptions,
  cloneAndAssertEncoder,
  resetAndAssertEncoder,
} from './codec-test-helpers.js';

describe('PassThroughEncoder', () => {
  test('TestArgumentExceptions', () => {
    assertEncoderArgumentExceptions(new PassThroughEncoder('default'));
  });

  test('TestEncoding', () => {
    const encoder = new PassThroughEncoder('default');
    expect(encoder.encoding).toBe('default');
  });

  test('TestClone', () => {
    cloneAndAssertEncoder(new PassThroughEncoder('default'));
  });

  test('TestReset', () => {
    resetAndAssertEncoder(new PassThroughEncoder('default'));
  });

  test('TestEncode', () => {
    const bufferSize = 1024;
    const encoder = new PassThroughEncoder('default');
    const input = new Uint8Array(bufferSize);
    const output = new Uint8Array(bufferSize);
    for (let i = 0; i < bufferSize; i++)
      input[i] = i & 0xff;

    const n = encoder.encode(input, 0, bufferSize, output);

    expect(n).toBe(bufferSize);
    expect(output.subarray(0, n)).toEqual(input);
  });

  test('TestFlush', () => {
    const bufferSize = 1024;
    const encoder = new PassThroughEncoder('default');
    const input = new Uint8Array(bufferSize);
    const output = new Uint8Array(bufferSize);
    for (let i = 0; i < bufferSize; i++)
      input[i] = i & 0xff;

    const n = encoder.flush(input, 0, bufferSize, output);

    expect(n).toBe(bufferSize);
    expect(output.subarray(0, n)).toEqual(input);
  });
});
