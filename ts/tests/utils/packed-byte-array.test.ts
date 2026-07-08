import { describe, expect, test } from 'vitest';
import { PackedByteArray } from '../../src/utils/packed-byte-array.js';

describe('PackedByteArrayTests', () => {
  test('TestArgumentExceptions', () => {
    const packed = new PackedByteArray();

    expect(() => packed.copyTo(null as unknown as Uint8Array, 0)).toThrow(TypeError);
    expect(() => packed.copyTo(new Uint8Array(16), -1)).toThrow(RangeError);
  });

  test('TestBasicFunctionality', () => {
    const packed = new PackedByteArray();
    const expected = new Uint8Array(1024);
    const buffer = new Uint8Array(1024);
    let index = 0;

    for (let i = 0; i < 257; i++) {
      expected[index++] = 'A'.charCodeAt(0);
      packed.add('A'.charCodeAt(0));
    }

    for (let i = 1; i < 26; i++) {
      expected[index++] = 'A'.charCodeAt(0) + i;
      packed.add('A'.charCodeAt(0) + i);
    }

    for (let i = 0; i < 128; i++) {
      expected[index++] = 'B'.charCodeAt(0);
      packed.add('B'.charCodeAt(0));
    }

    for (let i = 0; i < 26; i++) {
      expected[index++] = 'A'.charCodeAt(0) + i;
      packed.add('A'.charCodeAt(0) + i);
    }

    for (let i = 0; i < 26; i++) {
      expected[index++] = 'A'.charCodeAt(0) + i;
      packed.add('A'.charCodeAt(0) + i);
    }

    expect(packed.count).toBe(index);

    packed.copyTo(buffer, 0);

    for (let i = 0; i < index; i++)
      expect(buffer[i], `buffer[${i}]`).toBe(expected[i]);
  });
});
