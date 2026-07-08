/**
 * Port of UnitTests/Encodings/MimeEncoderTestsBase.cs and
 * MimeDecoderTestsBase.cs — the shared harness for all codec test files.
 *
 * Adaptation from the C#: SetRandomState/AssertState use reflection over
 * private fields, which TS can't (and shouldn't) do. CloneAndAssert /
 * ResetAndAssert are ported BEHAVIORALLY instead: state is established by
 * feeding real data, then clone/reset equivalence is asserted by comparing
 * the bytes produced from identical subsequent input. This is strictly
 * weaker per-field but covers the same contract end-to-end.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { FilteredStream } from '../../src/io/filtered-stream.js';
import { Dos2UnixFilter } from '../../src/io/filters/dos2unix-filter.js';
import { EncoderFilter } from '../../src/io/filters/encoder-filter.js';
import { DecoderFilter } from '../../src/io/filters/decoder-filter.js';
import { MemoryStream } from '../../src/io/stream.js';
import type { MimeDecoder, MimeEncoder } from '../../src/encodings/types.js';
import { testDataDir } from '../gates/helpers.js';

export const encodersDataDir = join(testDataDir, 'encoders');

export function readDataFile(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(encodersDataDir, name)));
}

/** Read a data file with CRLF → LF normalization (C#: Dos2UnixFilter copy). */
export function readDataFileUnix(name: string): Uint8Array {
  const memory = new MemoryStream();
  const filtered = new FilteredStream(memory);
  filtered.add(new Dos2UnixFilter());
  const data = readDataFile(name);
  filtered.write(data, 0, data.length);
  filtered.flush();
  return memory.toArray();
}

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

/** C#: AssertArgumentExceptions (null-argument cases don't apply in TS). */
export function assertEncoderArgumentExceptions(encoder: MimeEncoder): void {
  const output = new Uint8Array(0);
  expect(() => encoder.encode(new Uint8Array(0), -1, 0, output)).toThrow(RangeError);
  expect(() => encoder.encode(new Uint8Array(1), 0, 10, output)).toThrow(RangeError);
  expect(() => encoder.encode(new Uint8Array(1), 0, 1, output)).toThrow(RangeError);
  expect(() => encoder.flush(new Uint8Array(0), -1, 0, output)).toThrow(RangeError);
  expect(() => encoder.flush(new Uint8Array(1), 0, 10, output)).toThrow(RangeError);
  expect(() => encoder.flush(new Uint8Array(1), 0, 1, output)).toThrow(RangeError);
}

export function assertDecoderArgumentExceptions(decoder: MimeDecoder): void {
  const output = new Uint8Array(0);
  expect(() => decoder.decode(new Uint8Array(0), -1, 0, output)).toThrow(RangeError);
  expect(() => decoder.decode(new Uint8Array(1), 0, 10, output)).toThrow(RangeError);
  expect(() => decoder.decode(new Uint8Array(1), 0, 1, output)).toThrow(RangeError);
}

/** Deterministic pseudo-random bytes (xorshift32) for state-establishing input. */
export function deterministicBytes(seed: number, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    out[i] = s & 0xff;
  }
  return out;
}

function encodeRemainder(encoder: MimeEncoder, tail: Uint8Array): Uint8Array {
  const output = new Uint8Array(Math.max(encoder.estimateOutputLength(tail.length), 64));
  const n = encoder.flush(tail, 0, tail.length, output);
  return output.slice(0, n);
}

function decodeRemainder(decoder: MimeDecoder, tail: Uint8Array): Uint8Array {
  const output = new Uint8Array(Math.max(decoder.estimateOutputLength(tail.length), 64));
  const n = decoder.decode(tail, 0, tail.length, output);
  return output.slice(0, n);
}

/**
 * C#: CloneAndAssert — behavioral: establish mid-stream state (odd byte
 * count so block codecs buffer), clone, then both must produce identical
 * bytes for the identical remaining input.
 */
export function cloneAndAssertEncoder(encoder: MimeEncoder): void {
  const head = deterministicBytes(0xbeef, 61);
  const scratch = new Uint8Array(Math.max(encoder.estimateOutputLength(head.length), 64));
  encoder.encode(head, 0, head.length, scratch);

  const clone = encoder.clone();
  expect(clone.encoding).toBe(encoder.encoding);

  const tail = deterministicBytes(0xf00d, 47);
  expect(encodeRemainder(clone, tail)).toEqual(encodeRemainder(encoder, tail));
}

export function cloneAndAssertDecoder(decoder: MimeDecoder, encodedSample: Uint8Array): void {
  const cut = Math.floor(encodedSample.length / 2) || 1;
  const scratch = new Uint8Array(Math.max(decoder.estimateOutputLength(cut), 64));
  decoder.decode(encodedSample.subarray(0, cut), 0, cut, scratch);

  const clone = decoder.clone();
  expect(clone.encoding).toBe(decoder.encoding);

  const tail = encodedSample.slice(cut);
  expect(decodeRemainder(clone, tail)).toEqual(decodeRemainder(decoder, tail));
}

/**
 * C#: ResetAndAssert — behavioral: dirty the state, reset, and the codec
 * must produce the same bytes as a fresh clone taken at initial state.
 */
export function resetAndAssertEncoder(encoder: MimeEncoder): void {
  const fresh = encoder.clone();
  const head = deterministicBytes(0xdead, 53);
  const scratch = new Uint8Array(Math.max(encoder.estimateOutputLength(head.length), 64));
  encoder.encode(head, 0, head.length, scratch);
  encoder.reset();

  const tail = deterministicBytes(0xcafe, 47);
  expect(encodeRemainder(encoder, tail)).toEqual(encodeRemainder(fresh, tail));
}

export function resetAndAssertDecoder(decoder: MimeDecoder, encodedSample: Uint8Array): void {
  const fresh = decoder.clone();
  const cut = Math.floor(encodedSample.length / 2) || 1;
  const scratch = new Uint8Array(Math.max(decoder.estimateOutputLength(cut), 64));
  decoder.decode(encodedSample.subarray(0, cut), 0, cut, scratch);
  decoder.reset();

  expect(decodeRemainder(decoder, encodedSample)).toEqual(decodeRemainder(fresh, encodedSample));
}

/**
 * C#: TestEncoder — chunked encode through FilteredStream+EncoderFilter,
 * compared byte-for-byte against the dos2unix'd expected file.
 */
export function testEncoder(
  encoder: MimeEncoder,
  fileName: string,
  rawData: Uint8Array,
  encodedFile: string,
  bufferSize: number,
): void {
  const expected = readDataFileUnix(encodedFile);

  const encoded = new MemoryStream();
  if (encoder.encoding === 'uuencode') {
    const begin = ascii(`begin 644 ${fileName}\n`);
    encoded.write(begin, 0, begin.length);
  }

  const filtered = new FilteredStream(encoded);
  filtered.add(new EncoderFilter(encoder));

  const source = new MemoryStream(rawData);
  const buffer = new Uint8Array(bufferSize);
  let n: number;
  while ((n = source.read(buffer, 0, bufferSize)) > 0)
    filtered.write(buffer, 0, n);
  filtered.flush();

  if (encoder.encoding === 'uuencode') {
    const end = ascii('end\n');
    encoded.write(end, 0, end.length);
  }

  const actual = encoded.toArray();
  expect(actual.length, 'Encoded length is incorrect.').toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i])
      throw new Error(`The byte at offset ${i} does not match: 0x${actual[i]!.toString(16)} != 0x${expected[i]!.toString(16)}`);
  }
}

/** C#: TestEncoderFlush — single-shot flush() of the whole input. */
export function testEncoderFlush(
  encoder: MimeEncoder,
  fileName: string,
  rawData: Uint8Array,
  encodedFile: string,
): void {
  const expected = readDataFileUnix(encodedFile);

  let outputLength = encoder.estimateOutputLength(rawData.length);
  const begin = encoder.encoding === 'uuencode' ? ascii(`begin 644 ${fileName}\n`) : new Uint8Array(0);
  const end = encoder.encoding === 'uuencode' ? ascii('end\n') : new Uint8Array(0);
  outputLength += begin.length + end.length;

  const encoded = new Uint8Array(outputLength);
  let encodedLength = encoder.flush(rawData, 0, rawData.length, encoded);

  if (begin.length > 0) {
    encoded.copyWithin(begin.length, 0, encodedLength);
    encoded.set(begin, 0);
    encodedLength += begin.length;
  }
  if (end.length > 0) {
    encoded.set(end, encodedLength);
    encodedLength += end.length;
  }

  const actual = encoded.subarray(0, encodedLength);
  expect(actual.length, 'Encoded length is incorrect.').toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i])
      throw new Error(`The byte at offset ${i} does not match: 0x${actual[i]!.toString(16)} != 0x${expected[i]!.toString(16)}`);
  }
}

/** C#: TestDecoder — chunked decode through FilteredStream+DecoderFilter. */
export function testDecoder(
  decoder: MimeDecoder,
  rawData: Uint8Array,
  encodedFile: string,
  bufferSize: number,
  unix = false,
): void {
  const decoded = new MemoryStream();
  const filtered = new FilteredStream(decoded);
  filtered.add(new DecoderFilter(decoder));
  if (unix)
    filtered.add(new Dos2UnixFilter());

  const file = readDataFile(encodedFile);
  const source = new MemoryStream(file);
  const buffer = new Uint8Array(bufferSize);
  let n: number;
  while ((n = source.read(buffer, 0, bufferSize)) > 0)
    filtered.write(buffer, 0, n);
  filtered.flush();

  const actual = decoded.toArray();
  expect(actual.length, 'Decoded length is incorrect.').toBe(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    if (actual[i] !== rawData[i])
      throw new Error(`The byte at offset ${i} does not match: 0x${actual[i]!.toString(16)} != 0x${rawData[i]!.toString(16)}`);
  }
}
