/**
 * Port of UnitTests/Encodings/UUEncoderTests.cs.
 */
import { describe, expect, test } from 'vitest';
import { UUEncoder } from '../../src/encodings/uu-encoder.js';
import {
  assertEncoderArgumentExceptions,
  cloneAndAssertEncoder,
  readDataFile,
  resetAndAssertEncoder,
  testEncoder,
  testEncoderFlush,
} from './codec-test-helpers.js';

describe('UUEncoder', () => {
  test('TestArgumentExceptions', () => {
    assertEncoderArgumentExceptions(new UUEncoder());
  });

  test('TestEncoding', () => {
    const encoder = new UUEncoder();

    expect(encoder.encoding).toBe('uuencode');
  });

  test('TestClone', () => {
    cloneAndAssertEncoder(new UUEncoder());
  });

  test('TestReset', () => {
    resetAndAssertEncoder(new UUEncoder());
  });

  test.each([4096, 1024, 16, 1])('TestEncode(%i)', (bufferSize) => {
    testEncoder(new UUEncoder(), 'photo.jpg', readDataFile('photo.jpg'), 'photo.uu', bufferSize);
  });

  test('TestFlush', () => {
    testEncoderFlush(new UUEncoder(), 'photo.jpg', readDataFile('photo.jpg'), 'photo.uu');
  });
});
