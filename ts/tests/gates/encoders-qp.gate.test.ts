import { describe, test } from 'vitest';
import { QuotedPrintableDecoder } from '../../src/encodings/quoted-printable-decoder.js';
import { QuotedPrintableEncoder } from '../../src/encodings/quoted-printable-encoder.js';
import { corpusFile, expectParity, oracleOut } from './helpers.js';

function encode(input: Uint8Array): Uint8Array {
  const encoder = new QuotedPrintableEncoder();
  const output = new Uint8Array(encoder.estimateOutputLength(input.length));
  const n = encoder.flush(input, 0, input.length, output);
  return output.subarray(0, n);
}

function decode(input: Uint8Array): Uint8Array {
  const decoder = new QuotedPrintableDecoder();
  const output = new Uint8Array(decoder.estimateOutputLength(input.length));
  const n = decoder.decode(input, 0, input.length, output);
  return output.subarray(0, n);
}

describe('encoders qp gate', () => {
  test('TS encode of TestData/encoders/wikipedia.txt vs oracle', () => {
    expectParity('encoders-qp', 'wikipedia.txt.qp', encode(corpusFile('encoders/wikipedia.txt')), oracleOut('encoders/wikipedia.txt.qp'));
  });

  test('TS decode of wikipedia.qp vs oracle', () => {
    expectParity('encoders-qp', 'wikipedia.qp.raw', decode(corpusFile('encoders/wikipedia.qp')), oracleOut('encoders/wikipedia.qp.raw'));
  });

  test.each([0, 1, 2, 3, 4, 56, 57, 58, 76, 77, 1000, 65536])('fuzz text-%i', (size) => {
    const text = oracleOut(`encoders/fuzz/text-${size}.bin`);
    const qp = oracleOut(`encoders/fuzz/text-${size}.qp`);
    expectParity('encoders-qp', `fuzz/text-${size}.qp`, encode(text), qp);
    expectParity('encoders-qp', `fuzz/text-${size}.qp.redecoded`, decode(qp), oracleOut(`encoders/fuzz/text-${size}.qp.redecoded`));
  });
});
