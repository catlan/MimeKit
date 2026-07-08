import { describe, expect, test } from 'vitest';
import { Rfc2047Base64Encoder } from '../../src/encodings/rfc2047-base64-encoder.js';

describe('Rfc2047Base64Encoder', () => {
  test('TestArgumentExceptions', () => {
    const encoder = new Rfc2047Base64Encoder();
    const output = new Uint8Array(0);

    expect(() => encoder.encode(new Uint8Array(0), -1, 0, output)).toThrow(RangeError);
    expect(() => encoder.encode(new Uint8Array(1), 0, 10, output)).toThrow(RangeError);
    expect(() => encoder.encode(new Uint8Array(1), 0, 1, output)).toThrow(RangeError);
  });
});
