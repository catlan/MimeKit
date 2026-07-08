import { describe, expect, test } from 'vitest';
import { MemoryStream } from '../../src/io/stream.js';

describe('MemoryStream (System.IO shim)', () => {
  test('write then read round-trips', () => {
    const s = new MemoryStream();
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    s.write(data, 0, 5);
    expect(s.length).toBe(5);
    s.position = 0;
    const out = new Uint8Array(5);
    expect(s.read(out, 0, 5)).toBe(5);
    expect(out).toEqual(data);
    expect(s.read(out, 0, 5)).toBe(0);
  });

  test('partial reads honor offset/count', () => {
    const s = new MemoryStream(new Uint8Array([10, 20, 30]));
    const out = new Uint8Array(4).fill(0xff);
    expect(s.read(out, 1, 2)).toBe(2);
    expect(Array.from(out)).toEqual([0xff, 10, 20, 0xff]);
  });

  test('seek beyond length zero-fills on subsequent write', () => {
    const s = new MemoryStream();
    s.write(new Uint8Array([1]), 0, 1);
    s.seek(3, 'begin');
    s.write(new Uint8Array([9]), 0, 1);
    expect(Array.from(s.toArray())).toEqual([1, 0, 0, 9]);
  });

  test('setLength truncates and clamps position', () => {
    const s = new MemoryStream(new Uint8Array([1, 2, 3, 4]));
    s.position = 4;
    s.setLength(2);
    expect(s.length).toBe(2);
    expect(s.position).toBe(2);
    s.setLength(4);
    expect(Array.from(s.toArray())).toEqual([1, 2, 0, 0]);
  });

  test('growth across the initial capacity boundary', () => {
    const s = new MemoryStream();
    const chunk = new Uint8Array(300).fill(7);
    s.write(chunk, 0, 300);
    s.write(chunk, 0, 300);
    expect(s.length).toBe(600);
    expect(s.toArray()[599]).toBe(7);
  });

  test('copyTo drains from the current position', () => {
    const src = new MemoryStream(new Uint8Array([1, 2, 3, 4]));
    src.position = 2;
    const dst = new MemoryStream();
    src.copyTo(dst, 1);
    expect(Array.from(dst.toArray())).toEqual([3, 4]);
  });

  test('invalid buffer ranges throw RangeError', () => {
    const s = new MemoryStream();
    const buf = new Uint8Array(4);
    expect(() => s.read(buf, 5, 1)).toThrow(RangeError);
    expect(() => s.write(buf, 0, 5)).toThrow(RangeError);
    expect(() => s.seek(-1, 'begin')).toThrow(RangeError);
  });
});
