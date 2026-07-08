import { describe, expect, test } from 'vitest';
import { MemoryBlockStream } from '../../src/io/memory-block-stream.js';
import { MemoryStream } from '../../src/io/stream.js';

class Random {
  private state = 0x12345678;

  next(maxExclusive?: number): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    const value = this.state & 0x7fffffff;
    return maxExclusive === undefined ? value : value % maxExclusive;
  }

  nextBytes(buffer: Uint8Array): void {
    for (let i = 0; i < buffer.length; i++)
      buffer[i] = this.next(256);
  }
}

function createFixture(): { blocks: MemoryBlockStream; master: MemoryStream; random: Random; buf: Uint8Array; mbuf: Uint8Array } {
  const bytes = new Uint8Array(9 * 1024);
  const random = new Random();
  let position = 0;

  random.nextBytes(bytes);

  const master = new MemoryStream(bytes);
  const blocks = new MemoryBlockStream();

  while (position < bytes.length) {
    const n = Math.min(bytes.length - position, random.next() % 4096);
    blocks.write(bytes, position, n);
    position += n;
  }

  blocks.seek(0, 'begin');

  return {
    blocks,
    master,
    random,
    buf: new Uint8Array(4096),
    mbuf: new Uint8Array(4096)
  };
}

describe('MemoryBlockStream', () => {
  test('TestObjectDisposedExceptions', () => {
    const block = new MemoryBlockStream();
    const buf = new Uint8Array(1024);
    block.dispose();

    expect(() => block.read(buf, 0, buf.length)).toThrow(TypeError);
    expect(() => block.write(buf, 0, buf.length)).toThrow(TypeError);
    expect(() => block.seek(0, 'begin')).toThrow(TypeError);
    expect(() => block.setLength(0)).toThrow(TypeError);
    expect(() => block.flush()).toThrow(TypeError);
    expect(() => block.toArray()).toThrow(TypeError);
  });

  test('TestCanReadWriteSeek', () => {
    const block = new MemoryBlockStream();

    expect(block.canRead).toBe(true);
    expect(block.canWrite).toBe(true);
    expect(block.canSeek).toBe(true);
    // canTimeout omitted: timeout surface is not ported (sync core only)
  });

  test('TestRead', () => {
    const { blocks, master, buf, mbuf } = createFixture();

    blocks.position = 0;
    master.position = 0;

    do {
      const nread = blocks.read(buf, 0, buf.length);
      const mread = master.read(mbuf, 0, mbuf.length);

      expect(nread).toBe(mread);
      expect(blocks.position).toBe(master.position);
      expect(buf.subarray(0, mread)).toEqual(mbuf.subarray(0, mread));
    } while (master.position < master.length);
  });

  test('TestReadLargeStream', () => {
    // Adaptation: C# writes past int.MaxValue (2GB) to cross the 2^31
    // boundary, which does not exist for JS numbers. 32MB preserves the
    // block-boundary and first/last-read assertions without 2GB of blocks.
    const n = 4096;
    const random = new Random();
    const bytes = new Uint8Array(n);
    random.nextBytes(bytes);

    const stream = new MemoryBlockStream();
    while (stream.position < 32 * 1024 * 1024)
      stream.write(bytes, 0, bytes.length);

    const buffer = new Uint8Array(n + 1);

    stream.position = 0;
    let nread = stream.read(buffer, 0, buffer.length);
    expect(nread).not.toBe(0);
    expect(buffer).toEqual(new Uint8Array([...bytes, bytes[0]]));

    stream.position = stream.length - buffer.length;
    nread = stream.read(buffer, 0, buffer.length);
    expect(nread).not.toBe(0);
    expect(buffer).toEqual(new Uint8Array([bytes[bytes.length - 1], ...bytes]));
  });

  test('TestWrite', () => {
    const { blocks, master, random } = createFixture();
    const bytes = new Uint8Array(9 * 1024);
    let position = 0;

    random.nextBytes(bytes);

    blocks.position = 0;
    master.position = 0;

    while (position < bytes.length) {
      const n = Math.min(bytes.length - position, random.next() % 4096);
      blocks.write(bytes, position, n);
      master.write(bytes, position, n);
      position += n;
    }

    blocks.flush();
    master.flush();
    expect(blocks.toArray()).toEqual(master.toArray());
  });

  test('TestSeek', () => {
    const { blocks, master, random, buf, mbuf } = createFixture();

    function assertSeekResults(): void {
      const n = Math.min(master.length - master.position, mbuf.length);
      const mread = master.read(mbuf, 0, n);
      const nread = blocks.read(buf, 0, n);

      expect(nread).toBe(mread);
      expect(blocks.position).toBe(master.position);
      expect(buf.subarray(0, n)).toEqual(mbuf.subarray(0, n));
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      let offset = random.next(master.length - 1) + 1;

      let expected = master.seek(offset, 'begin');
      let actual = blocks.seek(offset, 'begin');

      expect(actual).toBe(expected);

      assertSeekResults();
      master.seek(actual, 'begin');
      blocks.seek(actual, 'begin');

      offset = -1 * (random.next() % offset);

      expected = master.seek(offset, 'current');
      actual = blocks.seek(offset, 'current');

      expect(actual).toBe(expected);

      assertSeekResults();
      master.seek(actual, 'begin');
      blocks.seek(actual, 'begin');

      offset = random.next(master.length - actual);

      expected = master.seek(offset, 'current');
      actual = blocks.seek(offset, 'current');

      expect(actual).toBe(expected);

      assertSeekResults();

      offset = -1 * (random.next() % master.length);

      expected = master.seek(offset, 'end');
      actual = blocks.seek(offset, 'end');

      expect(actual).toBe(expected);

      assertSeekResults();
    }

    expect(() => blocks.seek(-1, 'begin')).toThrow(Error);
  });

  test('TestSetLength', () => {
    const { blocks } = createFixture();
    const length = blocks.length;

    expect(() => blocks.setLength(-1)).toThrow(RangeError);

    blocks.setLength(length + 10240);

    expect(blocks.length).toBe(length + 10240);

    blocks.setLength(length);

    expect(blocks.length).toBe(length);
  });

  test('TestToArray', () => {
    const { blocks, master } = createFixture();
    const masterArray = master.toArray();
    const array = blocks.toArray();

    expect(array.length).toBe(masterArray.length);
    expect(array).toEqual(masterArray);
  });
});
