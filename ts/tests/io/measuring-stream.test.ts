import { describe, expect, test } from 'vitest';
import { MeasuringStream } from '../../src/io/measuring-stream.js';

class Random {
  private state = 0x12345678;

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state & 0x7fffffff;
  }

  nextBytes(buffer: Uint8Array): void {
    for (let i = 0; i < buffer.length; i++)
      buffer[i] = this.next() % 256;
  }
}

describe('MeasuringStream', () => {
  const random = new Random();

  test('TestCanReadWriteSeek', () => {
    const block = new MeasuringStream();

    expect(block.canRead).toBe(false);
    expect(block.canWrite).toBe(true);
    expect(block.canSeek).toBe(true);
    expect(block.canTimeout).toBe(false);
  });

  test('TestWrite', () => {
    const buffer = new Uint8Array(1099);
    random.nextBytes(buffer);

    const stream = new MeasuringStream();
    stream.write(buffer, 0, buffer.length);
    stream.flush();

    expect(stream.length).toBe(buffer.length);
  });

  test('TestSeek', () => {
    const stream = new MeasuringStream();
    stream.setLength(1024);

    for (let attempt = 0; attempt < 10; attempt++) {
      let offset = random.next() % stream.length;

      stream.position = offset;

      let actual = stream.position;
      let expected = offset;

      expect(actual).toBe(expected);
      expect(stream.position).toBe(expected);

      if (offset > 0) {
        offset = -1 * (random.next() % offset);
        expected += offset;

        actual = stream.seek(offset, 'current');

        expect(actual).toBe(expected);
        expect(stream.position).toBe(expected);
      }

      if (actual < stream.length) {
        offset = random.next() % (stream.length - actual);
        expected += offset;

        actual = stream.seek(offset, 'current');

        expect(actual).toBe(expected);
        expect(stream.position).toBe(expected);
      }

      offset = -1 * (random.next() % stream.length);
      expected = stream.length + offset;

      actual = stream.seek(offset, 'end');

      expect(actual).toBe(expected);
      expect(stream.position).toBe(expected);
    }

    expect(() => stream.seek(-1, 'begin')).toThrow(Error);
  });

  test('TestSetLength', () => {
    const stream = new MeasuringStream();

    expect(() => stream.setLength(-1)).toThrow(RangeError);

    stream.setLength(1024);

    expect(stream.length).toBe(1024);
  });
});
