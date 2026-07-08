import { describe, expect, test } from 'vitest';
import { YDecoder } from '../../src/encodings/y-decoder.js';
import {
  assertDecoderArgumentExceptions,
  cloneAndAssertDecoder,
  resetAndAssertDecoder,
} from './codec-test-helpers.js';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const framedSample = ascii('=ybegin line=128 size=3 name=x\nKLM\n=yend size=3 crc32=00000000\n');
const payloadSample = ascii('KLM\n');

describe('YDecoder', () => {
  test('TestArgumentExceptions', () => {
    assertDecoderArgumentExceptions(new YDecoder());
  });

  test('TestEncoding', () => {
    const decoder = new YDecoder();
    expect(decoder.encoding).toBe('default');
  });

  test('TestClone', () => {
    cloneAndAssertDecoder(new YDecoder(true), payloadSample);
    cloneAndAssertDecoder(new YDecoder(false), framedSample);
  });

  test('TestReset', () => {
    resetAndAssertDecoder(new YDecoder(true), payloadSample);
    resetAndAssertDecoder(new YDecoder(false), framedSample);
  });
});
