import { describe, expect, test } from 'vitest';
import { QEncoder, QEncodeMode } from '../../src/encodings/q-encoder.js';
import { assertEncoderArgumentExceptions, cloneAndAssertEncoder, resetAndAssertEncoder } from './codec-test-helpers.js';

const ascii = (s: string): Uint8Array => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const asciiString = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

describe('QEncoder', () => {
  test('TestArgumentExceptions', () => {
    assertEncoderArgumentExceptions(new QEncoder(QEncodeMode.Text));
  });

  test('TestEncoding', () => {
    const encoder = new QEncoder(QEncodeMode.Text);
    expect(encoder.encoding).toBe('quoted-printable');
  });

  test('TestClone', () => {
    cloneAndAssertEncoder(new QEncoder(QEncodeMode.Text));
    cloneAndAssertEncoder(new QEncoder(QEncodeMode.Phrase));
  });

  test('TestReset', () => {
    resetAndAssertEncoder(new QEncoder(QEncodeMode.Text));
    resetAndAssertEncoder(new QEncoder(QEncodeMode.Phrase));
  });

  test('TestEncodeText', () => {
    const expected = "_=09=0D=0AABCabc123!=40#$%^&*=28=29=5F+`-=3D=5B=5D\\{}|=3B=3A'=22=2C=2E=2F=3C=3E=3F";
    const input = ' \t\r\nABCabc123!@#$%^&*()_+`-=[]\\{}|;:\'",./<>?';
    const output = new Uint8Array(256);
    const encoder = new QEncoder(QEncodeMode.Text);

    expect(encoder.encoding).toBe('quoted-printable');
    const buf = ascii(input);
    let n = encoder.encode(buf, 0, buf.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(expected);

    encoder.reset();
    n = encoder.flush(buf, 0, buf.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(expected);
  });

  test('TestEncodePhrase', () => {
    const expected = '_=09=0D=0AABCabc123!=40=23=24=25=5E=26*=28=29=5F+=60-=3D=5B=5D=5C=7B=7D=7C=3B=3A=27=22=2C=2E/=3C=3E=3F';
    const input = ' \t\r\nABCabc123!@#$%^&*()_+`-=[]\\{}|;:\'",./<>?';
    const output = new Uint8Array(256);
    const encoder = new QEncoder(QEncodeMode.Phrase);

    expect(encoder.encoding).toBe('quoted-printable');
    const buf = ascii(input);
    let n = encoder.encode(buf, 0, buf.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(expected);

    encoder.reset();
    n = encoder.flush(buf, 0, buf.length, output);
    expect(asciiString(output.subarray(0, n))).toBe(expected);
  });
});
