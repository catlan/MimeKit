import { describe, expect, test } from 'vitest';
import { QuotedPrintableDecoder } from '../../src/encodings/quoted-printable-decoder.js';
import {
  assertDecoderArgumentExceptions,
  cloneAndAssertDecoder,
  readDataFileUnix,
  resetAndAssertDecoder,
  testDecoder,
} from './codec-test-helpers.js';

const binary = (s: string): Uint8Array => new Uint8Array([...s].map((c) => c.charCodeAt(0) & 0xff));
const ascii = binary;
const binaryString = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

const qpEncodedPatterns = [
  '=e1=e2=E3=E4\r\n',
  '=e1=g2=E3=E4\r\n',
  '=e1=eg=E3=E4\r\n',
  '   =e1 =e2  =E3\t=E4  \t \t    \r\n',
  'Soft line=\r\n\tHard line\r\n',
  'width==\r\n340 height=3d200\r\n',
];

const qpDecodedPatterns = [
  '\u00e1\u00e2\u00e3\u00e4\r\n',
  '\u00e1=g2\u00e3\u00e4\r\n',
  '\u00e1=eg\u00e3\u00e4\r\n',
  '   \u00e1 \u00e2  \u00e3\t\u00e4  \t \t    \r\n',
  'Soft line\tHard line\r\n',
  'width=340 height=200\r\n',
];

describe('QuotedPrintableDecoder', () => {
  test('TestArgumentExceptions', () => {
    assertDecoderArgumentExceptions(new QuotedPrintableDecoder());
  });

  test('TestEncoding', () => {
    const decoder = new QuotedPrintableDecoder();
    expect(decoder.encoding).toBe('quoted-printable');
  });

  test('TestClone', () => {
    cloneAndAssertDecoder(new QuotedPrintableDecoder(true), ascii('a=3Db=0Ac'));
    cloneAndAssertDecoder(new QuotedPrintableDecoder(false), ascii('a=3Db=0Ac'));
  });

  test('TestReset', () => {
    resetAndAssertDecoder(new QuotedPrintableDecoder(true), ascii('a=3Db=0Ac'));
    resetAndAssertDecoder(new QuotedPrintableDecoder(false), ascii('a=3Db=0Ac'));
  });

  test('TestDecodePatterns', () => {
    const output = new Uint8Array(4096);
    const decoder = new QuotedPrintableDecoder();

    for (let i = 0; i < qpEncodedPatterns.length; i++) {
      decoder.reset();
      const buf = binary(qpEncodedPatterns[i]!);
      const n = decoder.decode(buf, 0, buf.length, output);
      expect(binaryString(output.subarray(0, n)), `Failed to decode qpEncodedPatterns[${i}]`).toBe(qpDecodedPatterns[i]);
    }
  });

  test.each([4096, 1024, 16, 1])('TestDecode(%i)', (bufferSize) => {
    testDecoder(new QuotedPrintableDecoder(), readDataFileUnix('wikipedia.txt'), 'wikipedia.qp', bufferSize, true);
  });

  test('TestDecodeEqualSignAt76', () => {
    const encoded = '<table style=3D"width:100%;" cellpadding=3D"0" cellspacing=3D"0" border=3D"=\n0"><tr><td style=3D"width:100%;text-align:center;background-color:;" bgcolo=\nr=3D"">Test</td></tr><table>=\n';
    const expected = '<table style="width:100%;" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:100%;text-align:center;background-color:;" bgcolor="">Test</td></tr><table>';
    const input = ascii(encoded);
    const decoder = new QuotedPrintableDecoder();
    const output = new Uint8Array(decoder.estimateOutputLength(input.length));

    const n = decoder.decode(input, 0, input.length, output);
    expect(binaryString(output.subarray(0, n))).toBe(expected);
  });

  test('TestDecodeInvalidSoftBreak', () => {
    const input = 'This is an invalid=\rsoft break.';
    const expected = 'This is an invalid=\rsoft break.';
    const output = new Uint8Array(1024);
    const decoder = new QuotedPrintableDecoder();

    expect(decoder.encoding).toBe('quoted-printable');
    const buf = ascii(input);
    const n = decoder.decode(buf, 0, buf.length, output);
    expect(binaryString(output.subarray(0, n))).toBe(expected);
  });

  test('TestDecodeHebrew', () => {
    const input = 'This is an ordinary text message in which my name (=ED=E5=EC=F9 =EF=E1 =E9=EC=E8=F4=F0)\nis in Hebrew (=FA=E9=F8=E1=F2).';
    const expected = new Uint8Array([
      ...ascii('This is an ordinary text message in which my name ('),
      0xed, 0xe5, 0xec, 0xf9, 0x20, 0xef, 0xe1, 0x20, 0xe9, 0xec, 0xe8, 0xf4, 0xf0,
      ...ascii(')\nis in Hebrew ('),
      0xfa, 0xe9, 0xf8, 0xe1, 0xf2,
      ...ascii(').'),
    ]);
    const output = new Uint8Array(4096);
    const decoder = new QuotedPrintableDecoder();

    expect(decoder.encoding).toBe('quoted-printable');
    const buf = ascii(input);
    const n = decoder.decode(buf, 0, buf.length, output);
    expect(output.subarray(0, n)).toEqual(expected);
  });
});
