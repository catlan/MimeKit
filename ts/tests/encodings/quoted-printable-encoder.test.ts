import { describe, expect, test } from 'vitest';
import { QuotedPrintableEncoder } from '../../src/encodings/quoted-printable-encoder.js';
import { QuotedPrintableDecoder } from '../../src/encodings/quoted-printable-decoder.js';
import {
  assertEncoderArgumentExceptions,
  cloneAndAssertEncoder,
  readDataFile,
  readDataFileUnix,
  resetAndAssertEncoder,
  testEncoder,
  testEncoderFlush,
} from './codec-test-helpers.js';

const ascii = (s: string): Uint8Array => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const asciiString = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

describe('QuotedPrintableEncoder', () => {
  test('TestArgumentExceptions', () => {
    expect(() => new QuotedPrintableEncoder(0)).toThrow(RangeError);
    assertEncoderArgumentExceptions(new QuotedPrintableEncoder());
  });

  test('TestEncoding', () => {
    const encoder = new QuotedPrintableEncoder();
    expect(encoder.encoding).toBe('quoted-printable');
  });

  test('TestClone', () => {
    cloneAndAssertEncoder(new QuotedPrintableEncoder(76));
  });

  test('TestReset', () => {
    resetAndAssertEncoder(new QuotedPrintableEncoder());
  });

  test.each([4096, 1024, 16, 1])('TestEncodeDos(%i)', (bufferSize) => {
    testEncoder(new QuotedPrintableEncoder(), 'wikipedia.txt', readDataFile('wikipedia.txt'), 'wikipedia.qp', bufferSize);
  });

  test.each([4096, 1024, 16, 1])('TestEncodeUnix(%i)', (bufferSize) => {
    testEncoder(new QuotedPrintableEncoder(), 'wikipedia.txt', readDataFileUnix('wikipedia.txt'), 'wikipedia.qp', bufferSize);
  });

  test('TestFlushDos', () => {
    testEncoderFlush(new QuotedPrintableEncoder(), 'wikipedia.txt', readDataFile('wikipedia.txt'), 'wikipedia.qp');
  });

  test('TestFlushUnix', () => {
    testEncoderFlush(new QuotedPrintableEncoder(), 'wikipedia.txt', readDataFileUnix('wikipedia.txt'), 'wikipedia.qp');
  });

  test('TestEncodeSpaceDosLineBreak', () => {
    const input = 'This line ends with a space \r\nbefore a line break.';
    const expected = 'This line ends with a space=20\nbefore a line break.=\n';
    const output = new Uint8Array(1024);
    const encoder = new QuotedPrintableEncoder();
    const buf = ascii(input);

    const n = encoder.flush(buf, 0, buf.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(expected);
  });

  test('TestEncodeSpaceUnixLineBreak', () => {
    const input = 'This line ends with a space \nbefore a line break.';
    const expected = 'This line ends with a space=20\nbefore a line break.=\n';
    const output = new Uint8Array(1024);
    const encoder = new QuotedPrintableEncoder();
    const buf = ascii(input);

    const n = encoder.flush(buf, 0, buf.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(expected);
  });

  test('TestEncodeEqualSignAt76', () => {
    const expected = '<table style=3D"width:100%;" cellpadding=3D"0" cellspacing=3D"0" border=3D"=\n0"><tr><td style=3D"width:100%;text-align:center;background-color:;" bgcolo=\nr=3D"">Test</td></tr><table>=\n';
    const text = '<table style="width:100%;" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:100%;text-align:center;background-color:;" bgcolor="">Test</td></tr><table>';
    const input = ascii(text);
    const encoder = new QuotedPrintableEncoder(76);
    const output = new Uint8Array(encoder.estimateOutputLength(input.length));

    const n = encoder.flush(input, 0, input.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(expected);
  });

  test('TestFlush', () => {
    const input = 'This line ends with a space ';
    const expected = 'This line ends with a space=20=\n';
    const encoder = new QuotedPrintableEncoder();
    const decoder = new QuotedPrintableDecoder();
    const output = new Uint8Array(1024);

    let buf = ascii(input);
    let n = encoder.flush(buf, 0, buf.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(expected);

    buf = ascii(expected);
    n = decoder.decode(buf, 0, buf.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(input);
  });

  test('TestEncodeHebrew', () => {
    const expected = 'This is an ordinary text message in which my name (=ED=E5=EC=F9 =EF=E1 =\n=E9=EC=E8=F4=F0)\nis in Hebrew (=FA=E9=F8=E1=F2).\n';
    const input = new Uint8Array([
      ...ascii('This is an ordinary text message in which my name ('),
      0xed, 0xe5, 0xec, 0xf9, 0x20, 0xef, 0xe1, 0x20, 0xe9, 0xec, 0xe8, 0xf4, 0xf0,
      ...ascii(')\nis in Hebrew ('),
      0xfa, 0xe9, 0xf8, 0xe1, 0xf2,
      ...ascii(').\n'),
    ]);
    const encoder = new QuotedPrintableEncoder(72);
    const output = new Uint8Array(1024);

    const n = encoder.flush(input, 0, input.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(expected);
  });
});
