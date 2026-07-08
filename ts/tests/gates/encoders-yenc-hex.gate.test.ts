import { describe, test } from 'vitest';
import { HexDecoder } from '../../src/encodings/hex-decoder.js';
import { HexEncoder } from '../../src/encodings/hex-encoder.js';
import { YDecoder } from '../../src/encodings/y-decoder.js';
import { YEncoder } from '../../src/encodings/y-encoder.js';
import { corpusFile, expectParity, oracleOut } from './helpers.js';

const fuzzSizes = [0, 1, 2, 3, 4, 56, 57, 58, 76, 77, 1000, 65536];

function flushEncode(encoder: YEncoder | HexEncoder, input: Uint8Array): Uint8Array {
  const output = new Uint8Array(encoder.estimateOutputLength(input.length));
  const n = encoder.flush(input, 0, input.length, output);
  return output.subarray(0, n);
}

function decode(decoder: YDecoder | HexDecoder, input: Uint8Array): Uint8Array {
  const output = new Uint8Array(decoder.estimateOutputLength(input.length));
  const n = decoder.decode(input, 0, input.length, output);
  return output.subarray(0, n);
}

describe('encoders yEnc/hex gate', () => {
  test('photo.jpg yEnc and hex encode', () => {
    const photo = corpusFile('encoders/photo.jpg');
    expectParity('encoders-yenc-hex', 'photo.jpg.yenc', flushEncode(new YEncoder(), photo), oracleOut('encoders/photo.jpg.yenc'));
    expectParity('encoders-yenc-hex', 'photo.jpg.hex', flushEncode(new HexEncoder(), photo), oracleOut('encoders/photo.jpg.hex'));
  });

  test.each(fuzzSizes)('fuzz raw-%i yEnc encode/decode', (size) => {
    const raw = oracleOut(`encoders/fuzz/raw-${size}.bin`);
    const encoded = oracleOut(`encoders/fuzz/raw-${size}.yenc`);

    expectParity('encoders-yenc-hex', `fuzz/raw-${size}.yenc`, flushEncode(new YEncoder(), raw), encoded);
    expectParity('encoders-yenc-hex', `fuzz/raw-${size}.yenc.redecoded`, decode(new YDecoder(true), encoded), oracleOut(`encoders/fuzz/raw-${size}.yenc.redecoded`));
  });

  test.each(fuzzSizes)('fuzz raw-%i hex encode/decode', (size) => {
    const raw = oracleOut(`encoders/fuzz/raw-${size}.bin`);
    const encoded = oracleOut(`encoders/fuzz/raw-${size}.hex`);

    expectParity('encoders-yenc-hex', `fuzz/raw-${size}.hex`, flushEncode(new HexEncoder(), raw), encoded);
    expectParity('encoders-yenc-hex', `fuzz/raw-${size}.hex.redecoded`, decode(new HexDecoder(), encoded), oracleOut(`encoders/fuzz/raw-${size}.hex.redecoded`));
  });
});
