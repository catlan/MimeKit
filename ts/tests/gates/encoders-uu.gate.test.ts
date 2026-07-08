import { describe, test } from 'vitest';
import { UUDecoder } from '../../src/encodings/uu-decoder.js';
import { UUEncoder } from '../../src/encodings/uu-encoder.js';
import { corpusFile, expectParity, oracleOut } from './helpers.js';

const gate = 'encoders-uu';

function encode(input: Uint8Array): Uint8Array {
  const encoder = new UUEncoder();
  const output = new Uint8Array(encoder.estimateOutputLength(input.length));
  const n = encoder.flush(input, 0, input.length, output);
  return output.slice(0, n);
}

function decode(input: Uint8Array, payloadOnly: boolean): Uint8Array {
  const decoder = new UUDecoder(payloadOnly);
  const output = new Uint8Array(decoder.estimateOutputLength(input.length));
  const n = decoder.decode(input, 0, input.length, output);
  return output.slice(0, n);
}

describe('UU encoder parity gate', () => {
  test('photo.jpg flush encode matches oracle', () => {
    expectParity(gate, 'photo.jpg.uu', encode(corpusFile('encoders/photo.jpg')), oracleOut('encoders/photo.jpg.uu'));
  });

  test('photo.uu framed decode matches oracle', () => {
    expectParity(gate, 'photo.uu.raw', decode(corpusFile('encoders/photo.uu'), false), oracleOut('encoders/photo.uu.raw'));
  });

  test.each([0, 1, 2, 3, 4, 56, 57, 58, 76, 77, 1000, 65536])('fuzz payload mode size %i', (size) => {
    const raw = oracleOut(`encoders/fuzz/raw-${size}.bin`);
    const encoded = encode(raw);

    expectParity(gate, `raw-${size}.uu`, encoded, oracleOut(`encoders/fuzz/raw-${size}.uu`));
    expectParity(
      gate,
      `raw-${size}.uu.redecoded`,
      decode(encoded, true),
      oracleOut(`encoders/fuzz/raw-${size}.uu.redecoded`),
    );
  });
});
