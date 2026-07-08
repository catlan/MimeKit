import { describe, expect, test } from 'vitest';
import { Base64Decoder } from '../../src/encodings/base64-decoder.js';
import { Base64Encoder } from '../../src/encodings/base64-encoder.js';
import {
  assertEncoderArgumentExceptions,
  cloneAndAssertEncoder,
  readDataFile,
  resetAndAssertEncoder,
  testEncoder,
  testEncoderFlush,
} from './codec-test-helpers.js';

const textEncoder = new TextEncoder();
const photo = readDataFile('photo.jpg');

function decodeBase64(input: Uint8Array): Uint8Array {
  const decoder = new Base64Decoder();
  const output = new Uint8Array(decoder.estimateOutputLength(input.length));
  const n = decoder.decode(input, 0, input.length, output);
  return output.slice(0, n);
}

describe('Base64Encoder', () => {
  test('TestArgumentExceptions', () => {
    expect(() => new Base64Encoder(0)).toThrow(RangeError);
    assertEncoderArgumentExceptions(new Base64Encoder());
  });

  test('TestEncoding', () => {
    const encoder = new Base64Encoder();
    expect(encoder.encoding).toBe('base64');
  });

  test('TestClone', () => {
    cloneAndAssertEncoder(new Base64Encoder());
  });

  test('TestReset', () => {
    resetAndAssertEncoder(new Base64Encoder());
  });

  test.each([
    [true, 4096],
    [false, 4096],
    [true, 1024],
    [false, 1024],
    [true, 16],
    [false, 16],
    [true, 1],
    [false, 1],
  ])('TestEncode(%s, %i)', (_enableHwAccel, bufferSize) => {
    testEncoder(new Base64Encoder(), 'photo.jpg', photo, 'photo.b64', bufferSize);
  });

  test.each([[false], [true]])('TestFlush(%s)', (_enableHwAccel) => {
    testEncoderFlush(new Base64Encoder(), 'photo.jpg', photo, 'photo.b64');
  });

  test.each([[false], [true]])('TestSuperLongLineLengths(%s)', (_enableHwAccel) => {
    const loremIpsum = textEncoder.encode('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. ');
    const maxLineLength = 998;
    const payloadSize = 20649;
    const chunkSize = 4096;

    const payload = new Uint8Array(payloadSize);
    let payloadIndex = 0;
    while (payloadIndex < payloadSize) {
      const chunk = Math.min(loremIpsum.length, payloadSize - payloadIndex);
      payload.set(loremIpsum.subarray(0, chunk), payloadIndex);
      payloadIndex += chunk;
    }

    const encoder = new Base64Encoder(maxLineLength, true);
    let buffer = new Uint8Array(encoder.estimateOutputLength(chunkSize));
    const chunks: Uint8Array[] = [];
    let startIndex = 0;

    while (startIndex < payload.length) {
      const length = Math.min(chunkSize, payload.length - startIndex);
      const n = encoder.encode(payload, startIndex, length, buffer);
      chunks.push(buffer.slice(0, n));
      startIndex += length;
    }

    const flushed = encoder.flush(payload, startIndex, 0, buffer);
    chunks.push(buffer.slice(0, flushed));

    const base64Length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const base64 = new Uint8Array(base64Length);
    let offset = 0;
    for (const chunk of chunks) {
      base64.set(chunk, offset);
      offset += chunk.length;
    }

    buffer = decodeBase64(base64);
    expect(buffer.length, 'bytesWritten').toBe(payload.length);
    expect(buffer, 'decoded').toEqual(payload);
  });
});
