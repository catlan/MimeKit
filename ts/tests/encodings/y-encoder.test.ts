import { describe, expect, test } from 'vitest';
import { YEncoder } from '../../src/encodings/y-encoder.js';
import {
  assertEncoderArgumentExceptions,
  cloneAndAssertEncoder,
  resetAndAssertEncoder,
} from './codec-test-helpers.js';

describe('YEncoder', () => {
  test('TestArgumentExceptions', () => {
    expect(() => new YEncoder(59)).toThrow(RangeError);
    assertEncoderArgumentExceptions(new YEncoder());
  });

  test('TestEncoding', () => {
    const encoder = new YEncoder();
    expect(encoder.encoding).toBe('default');
  });

  test('TestClone', () => {
    cloneAndAssertEncoder(new YEncoder());
  });

  test('TestReset', () => {
    resetAndAssertEncoder(new YEncoder());
  });
});
