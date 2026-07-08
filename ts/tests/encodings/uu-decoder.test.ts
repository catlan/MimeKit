/**
 * Port of UnitTests/Encodings/UUDecoderTests.cs.
 */
import { describe, expect, test } from 'vitest';
import { UUDecoder } from '../../src/encodings/uu-decoder.js';
import { UUEncoder } from '../../src/encodings/uu-encoder.js';
import {
  assertDecoderArgumentExceptions,
  cloneAndAssertDecoder,
  deterministicBytes,
  readDataFile,
  resetAndAssertDecoder,
  testDecoder,
} from './codec-test-helpers.js';

function encodePayload(data: Uint8Array): Uint8Array {
  const encoder = new UUEncoder();
  const output = new Uint8Array(encoder.estimateOutputLength(data.length));
  const n = encoder.flush(data, 0, data.length, output);
  return output.slice(0, n);
}

describe('UUDecoder', () => {
  test('TestArgumentExceptions', () => {
    assertDecoderArgumentExceptions(new UUDecoder());
  });

  test('TestEncoding', () => {
    const decoder = new UUDecoder();

    expect(decoder.encoding).toBe('uuencode');
  });

  test('TestClone', () => {
    cloneAndAssertDecoder(new UUDecoder(true), encodePayload(deterministicBytes(0x1234, 128)));
    cloneAndAssertDecoder(new UUDecoder(false), readDataFile('photo.uu'));
  });

  test('TestReset', () => {
    resetAndAssertDecoder(new UUDecoder(true), encodePayload(deterministicBytes(0x5678, 128)));
    resetAndAssertDecoder(new UUDecoder(false), readDataFile('photo.uu'));
  });

  test.each([4096, 1024, 16, 1])('TestDecode(%i)', (bufferSize) => {
    testDecoder(new UUDecoder(), readDataFile('photo.jpg'), 'photo.uu', bufferSize);
  });

  test.each([4096, 1024, 16, 1])('TestDecodeBeginStateChanges(%i)', (bufferSize) => {
    testDecoder(new UUDecoder(), readDataFile('photo.jpg'), 'photo.uu-states', bufferSize);
  });
});
