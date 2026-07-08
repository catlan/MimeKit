import { describe, expect, test } from 'vitest';
import { QEncodeMode, Rfc2047QuotedPrintableEncoder } from '../../src/encodings/rfc2047-quoted-printable-encoder.js';

const ascii = (s: string): Uint8Array => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const asciiString = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

describe('Rfc2047QuotedPrintableEncoder', () => {
  test('TestArgumentExceptions', () => {
    const encoder = new Rfc2047QuotedPrintableEncoder(QEncodeMode.Text);
    const output = new Uint8Array(0);

    expect(() => encoder.encode(new Uint8Array(0), -1, 0, output)).toThrow(RangeError);
    expect(() => encoder.encode(new Uint8Array(1), 0, 10, output)).toThrow(RangeError);
    expect(() => encoder.encode(new Uint8Array(1), 0, 1, output)).toThrow(RangeError);
  });

  test('TestEncodeText', () => {
    const expected = "_=09=0D=0AABCabc123!=40#$%^&*=28=29=5F+`-=3D=5B=5D\\{}|=3B=3A'=22=2C=2E=2F=3C=3E=3F";
    const input = ' \t\r\nABCabc123!@#$%^&*()_+`-=[]\\{}|;:\'",./<>?';
    const encoder = new Rfc2047QuotedPrintableEncoder(QEncodeMode.Text);
    const output = new Uint8Array(256);

    expect(encoder.encoding).toBe('q');
    const buf = ascii(input);
    const n = encoder.encode(buf, 0, buf.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(expected);
  });

  test('TestEncodePhrase', () => {
    const expected = '_=09=0D=0AABCabc123!=40=23=24=25=5E=26*=28=29=5F+=60-=3D=5B=5D=5C=7B=7D=7C=3B=3A=27=22=2C=2E/=3C=3E=3F';
    const input = ' \t\r\nABCabc123!@#$%^&*()_+`-=[]\\{}|;:\'",./<>?';
    const encoder = new Rfc2047QuotedPrintableEncoder(QEncodeMode.Phrase);
    const output = new Uint8Array(256);

    expect(encoder.encoding).toBe('q');
    const buf = ascii(input);
    const n = encoder.encode(buf, 0, buf.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(expected);
  });
});
