import { describe, test } from 'vitest';
import { Base64Decoder } from '../../src/encodings/base64-decoder.js';
import { Base64Encoder } from '../../src/encodings/base64-encoder.js';
import { corpusFile, expectParity, oracleOut } from './helpers.js';

const gate = 'encoders-base64';
const fuzzSizes = [0, 1, 2, 3, 4, 56, 57, 58, 76, 77, 1000, 65536];

function encodeFlush(input: Uint8Array): Uint8Array {
  const encoder = new Base64Encoder();
  const output = new Uint8Array(encoder.estimateOutputLength(input.length));
  const n = encoder.flush(input, 0, input.length, output);
  return output.slice(0, n);
}

function decode(input: Uint8Array): Uint8Array {
  const decoder = new Base64Decoder();
  const output = new Uint8Array(decoder.estimateOutputLength(input.length));
  const n = decoder.decode(input, 0, input.length, output);
  return output.slice(0, n);
}

describe('encoders/base64 differential gate', () => {
  test('photo.jpg encode matches oracle', () => {
    expectParity(gate, 'photo.jpg.b64', encodeFlush(corpusFile('encoders/photo.jpg')), oracleOut('encoders/photo.jpg.b64'));
  });

  test('photo.b64 decode matches oracle', () => {
    expectParity(gate, 'photo.b64.raw', decode(corpusFile('encoders/photo.b64')), oracleOut('encoders/photo.b64.raw'));
  });

  test.each(fuzzSizes)('fuzz raw-%i encode matches oracle', (size) => {
    const raw = oracleOut(`encoders/fuzz/raw-${size}.bin`);
    const expected = oracleOut(`encoders/fuzz/raw-${size}.base64`);
    expectParity(gate, `fuzz/raw-${size}.base64`, encodeFlush(raw), expected);
  });

  test.each(fuzzSizes)('fuzz raw-%i decode matches oracle', (size) => {
    const base64 = oracleOut(`encoders/fuzz/raw-${size}.base64`);
    const expected = oracleOut(`encoders/fuzz/raw-${size}.base64.redecoded`);
    expectParity(gate, `fuzz/raw-${size}.base64.redecoded`, decode(base64), expected);
  });
});
