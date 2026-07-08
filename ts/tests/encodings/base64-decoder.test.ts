import { describe, expect, test } from 'vitest';
import { Base64Decoder } from '../../src/encodings/base64-decoder.js';
import {
  assertDecoderArgumentExceptions,
  cloneAndAssertDecoder,
  readDataFile,
  resetAndAssertDecoder,
  testDecoder,
} from './codec-test-helpers.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('ascii');
const photo = readDataFile('photo.jpg');
const photoB64 = readDataFile('photo.b64');

const base64EncodedPatterns = [
  'VGhpcyBpcyB0aGUgcGxhaW4gdGV4dCBtZXNzYWdlIQ==',
  'VGhpcyBpcyBhIHRleHQgd2hpY2ggaGFzIHRvIGJlIHBhZGRlZCBvbmNlLi4=',
  'VGhpcyBpcyBhIHRleHQgd2hpY2ggaGFzIHRvIGJlIHBhZGRlZCB0d2ljZQ==',
  'VGhpcyBpcyBhIHRleHQgd2hpY2ggd2lsbCBub3QgYmUgcGFkZGVk',
  ' &% VGhp\r\ncyBp\r\ncyB0aGUgcGxhaW4g  \tdGV4dCBtZ?!XNzY*WdlIQ==',
];

const base64DecodedPatterns = [
  'This is the plain text message!',
  'This is a text which has to be padded once..',
  'This is a text which has to be padded twice',
  'This is a text which will not be padded',
  'This is the plain text message!',
];

const base64EncodedLongPatterns = [
  'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCU' +
  'mJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0' +
  'xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3Bxc' +
  'nN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeY' +
  'mZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6' +
  '/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5O' +
  'Xm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==',

  'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSY' +
  'nKCkqKywtLi8wMTIzNDU2Nzg5Ojs8PT4/QEFCQ0RFRkdISUpLTE' +
  '1OT1BRUlNUVVZXWFlaW1xdXl9gYWJjZGVmZ2hpamtsbW5vcHFyc' +
  '3R1dnd4eXp7fH1+f4CBgoOEhYaHiImKi4yNjo+QkZKTlJWWl5iZ' +
  'mpucnZ6foKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr/' +
  'AwcLDxMXGx8jJysvMzc7P0NHS09TV1tfY2drb3N3e3+Dh4uPk5e' +
  'bn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f7/AA==',

  'AgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fICEiIyQlJic' +
  'oKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj9AQUJDREVGR0hJSktMTU' +
  '5PUFFSU1RVVldYWVpbXF1eX2BhYmNkZWZnaGlqa2xtbm9wcXJzd' +
  'HV2d3h5ent8fX5/gIGCg4SFhoeIiYqLjI2Oj5CRkpOUlZaXmJma' +
  'm5ydnp+goaKjpKWmp6ipqqusra6vsLGys7S1tre4ubq7vL2+v8D' +
  'BwsPExcbHyMnKy8zNzs/Q0dLT1NXW19jZ2tvc3d7f4OHi4+Tl5u' +
  'fo6err7O3u7/Dx8vP09fb3+Pn6+/z9/v8AAQ==',
];

const base64EncodedPatternsExtraPadding = [
  'VGhpcyBpcyB0aGUgcGxhaW4gdGV4dCBtZXNzYWdlIQ===',
  'VGhpcyBpcyB0aGUgcGxhaW4gdGV4dCBtZXNzYWdlIQ====',
  'VGhpcyBpcyB0aGUgcGxhaW4gdGV4dCBtZXNzYWdlIQ=====',
  'VGhpcyBpcyB0aGUgcGxhaW4gdGV4dCBtZXNzYWdlIQ======',
];

describe('Base64Decoder', () => {
  test('TestArgumentExceptions', () => {
    assertDecoderArgumentExceptions(new Base64Decoder());
  });

  test('TestEncoding', () => {
    const decoder = new Base64Decoder();
    expect(decoder.encoding).toBe('base64');
  });

  test('TestClone', () => {
    cloneAndAssertDecoder(new Base64Decoder(), photoB64);
  });

  test('TestReset', () => {
    resetAndAssertDecoder(new Base64Decoder(), photoB64);
  });

  test.each([[true], [false]])('TestDecodePatterns(%s)', (_enableHwAccel) => {
    const decoder = new Base64Decoder();
    const output = new Uint8Array(4096);

    expect(decoder.encoding).toBe('base64');

    for (let i = 0; i < base64EncodedPatterns.length; i++) {
      decoder.reset();
      const buf = textEncoder.encode(base64EncodedPatterns[i]);
      const n = decoder.decode(buf, 0, buf.length, output);
      const actual = textDecoder.decode(output.subarray(0, n));
      expect(actual, `Failed to decode base64EncodedPatterns[${i}]`).toBe(base64DecodedPatterns[i]);
    }

    for (let i = 0; i < base64EncodedLongPatterns.length; i++) {
      decoder.reset();
      const buf = textEncoder.encode(base64EncodedLongPatterns[i]);
      const n = decoder.decode(buf, 0, buf.length, output);

      for (let j = 0; j < n; j++)
        expect(output[j], `Failed to decode base64EncodedLongPatterns[${i}]`).toBe((j + i) & 0xff);
    }

    for (let i = 0; i < base64EncodedPatternsExtraPadding.length; i++) {
      decoder.reset();
      const buf = textEncoder.encode(base64EncodedPatternsExtraPadding[i]);
      const n = decoder.decode(buf, 0, buf.length, output);
      const actual = textDecoder.decode(output.subarray(0, n));
      expect(actual, `Failed to decode base64EncodedPatternsExtraPadding[${i}]`).toBe(base64DecodedPatterns[0]);
    }
  });

  test.each([[true], [false]])('TestDecodeTwoBlocks(%s)', (_enableHwAccel) => {
    const input = 'VGhpcyBpcyB0aGUgcGF5bG9hZCBvZiB0aGUgZmlyc3QgYmFzZTY0LWVuY29kZWQgYmxvY2sgb2Yg\r\ndGV4dC4=\r\nQW5kIHRoaXMgaXMgdGhlIHBheWxvYWQgb2YgdGhlIHNlY29uZCBiYXNlNjQtZW5jb2RlZCBibG9j\r\nayBvZiB0ZXh0Lg==\r\n';
    const expected = 'This is the payload of the first base64-encoded block of text.And this is the payload of the second base64-encoded block of text.';
    const data = textEncoder.encode(input);
    const decoder = new Base64Decoder();
    const output = new Uint8Array(decoder.estimateOutputLength(data.length));

    const n = decoder.decode(data, 0, data.length, output);
    const actual = textDecoder.decode(output.subarray(0, n));
    expect(actual, 'Failed to decode two blocks of base64-encoded text.').toBe(expected);
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
  ])('TestDecode(%s, %i)', (_enableHwAccel, bufferSize) => {
    testDecoder(new Base64Decoder(), photo, 'photo.b64', bufferSize);
  });
});
