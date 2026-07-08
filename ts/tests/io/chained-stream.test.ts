import { describe, expect, test } from 'vitest';
import { BoundStream } from '../../src/io/bound-stream.js';
import { ChainedStream } from '../../src/io/chained-stream.js';
import { MemoryStream, Stream, type SeekOrigin } from '../../src/io/stream.js';

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

class CanReadWriteSeekStream extends Stream {
  constructor(
    private readonly readEnabled: boolean,
    private readonly writeEnabled: boolean,
    private readonly seekEnabled: boolean
  ) {
    super();
  }

  override get canRead(): boolean { return this.readEnabled; }
  override get canWrite(): boolean { return this.writeEnabled; }
  override get canSeek(): boolean { return this.seekEnabled; }
  override get length(): number { return 17; }
  override get position(): number { return 15; }
  override set position(value: number) { this.seek(value, 'begin'); }
  override read(_buffer: Uint8Array, _offset: number, _count: number): number { throw new Error('not implemented'); }
  override write(_buffer: Uint8Array, _offset: number, _count: number): void { throw new Error('not implemented'); }
  override seek(_offset: number, _origin: SeekOrigin): number { throw new Error('not implemented'); }
  override flush(): void { throw new Error('not implemented'); }
  override setLength(_value: number): void { throw new Error('not implemented'); }
}

class ReadOneByteStream extends Stream {
  constructor(private readonly source: Stream) {
    super();
  }

  override get canRead(): boolean { return this.source.canRead; }
  override get canWrite(): boolean { return this.source.canWrite; }
  override get canSeek(): boolean { return this.source.canSeek; }
  override get length(): number { return this.source.length; }
  override get position(): number { return this.source.position; }
  override set position(value: number) { this.source.position = value; }
  override read(buffer: Uint8Array, offset: number, _count: number): number { return this.source.read(buffer, offset, 1); }
  override write(buffer: Uint8Array, offset: number, count: number): void { this.source.write(buffer, offset, count); }
  override seek(offset: number, origin: SeekOrigin): number { return this.source.seek(offset, origin); }
  override flush(): void { this.source.flush(); }
  override setLength(value: number): void { this.source.setLength(value); }
}

function createFixture(): {
  lengths: number[];
  master: MemoryStream;
  backing: MemoryStream;
  chained: ChainedStream;
  random: Random;
  cbuf: Uint8Array;
  mbuf: Uint8Array;
} {
  const lengths: number[] = [];
  const bytes = new Uint8Array(10 * 1024);
  const random = new Random();
  let position = 0;

  random.nextBytes(bytes);

  const master = new MemoryStream(bytes);
  const backing = new MemoryStream(master.toArray());
  const chained = new ChainedStream();

  while (position < bytes.length) {
    const n = Math.min(bytes.length - position, random.next() % 4096);
    const stream = new BoundStream(backing, position, position + n, true);

    lengths.push(n);
    position += n;

    chained.add(new ReadOneByteStream(stream));
  }

  return {
    lengths,
    master,
    backing,
    chained,
    random,
    cbuf: new Uint8Array(4096),
    mbuf: new Uint8Array(4096)
  };
}

describe('ChainedStream', () => {
  test('TestCanReadWriteSeek', () => {
    const buffer = new Uint8Array(1024);

    let stream = new ChainedStream();
    stream.add(new CanReadWriteSeekStream(true, false, false));
    expect(stream.canRead).toBe(true);
    expect(stream.canWrite).toBe(false);
    expect(stream.canSeek).toBe(false);
    expect(stream.canTimeout).toBe(false);
    expect(() => stream.read(buffer, 0, buffer.length)).toThrow('not implemented');
    expect(() => stream.write(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => stream.seek(0, 'end')).toThrow(TypeError);

    stream = new ChainedStream();
    stream.add(new CanReadWriteSeekStream(false, true, false));
    expect(stream.canRead).toBe(false);
    expect(stream.canWrite).toBe(true);
    expect(stream.canSeek).toBe(false);
    expect(stream.canTimeout).toBe(false);
    expect(() => stream.read(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => stream.write(buffer, 0, buffer.length)).toThrow('not implemented');
    expect(() => stream.seek(0, 'end')).toThrow(TypeError);

    stream = new ChainedStream();
    stream.add(new CanReadWriteSeekStream(false, false, true));
    expect(stream.canRead).toBe(false);
    expect(stream.canWrite).toBe(false);
    expect(stream.canSeek).toBe(true);
    expect(stream.canTimeout).toBe(false);
    expect(() => stream.read(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => stream.write(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => stream.seek(0, 'end')).toThrow('not implemented');
  });

  test('TestRead', () => {
    const { chained, master, cbuf, mbuf } = createFixture();

    expect(chained.canRead).toBe(true);
    expect(chained.read(cbuf, 0, 0)).toBe(0);

    do {
      const n = Math.min(master.length - master.position, mbuf.length);
      const nread = chained.read(cbuf, 0, n);
      const mread = master.read(mbuf, 0, n);

      expect(nread).toBe(mread);
      expect(chained.position).toBe(master.position);
      expect(cbuf.subarray(0, n)).toEqual(mbuf.subarray(0, n));
    } while (master.position < master.length);
  });

  test('TestRandomSeeking', () => {
    const { chained, master, random, cbuf, mbuf } = createFixture();

    function assertSeekResults(): void {
      const n = Math.min(master.length - master.position, 256);
      const nread = chained.read(cbuf, 0, n);
      const mread = master.read(mbuf, 0, n);

      expect(nread).toBe(mread);
      expect(chained.position).toBe(master.position);
      expect(cbuf.subarray(0, n)).toEqual(mbuf.subarray(0, n));
    }

    expect(chained.canSeek).toBe(true);
    expect(() => chained.seek(-1, 'begin')).toThrow(Error);
    expect(() => chained.seek(0x7fffffff, 'begin')).toThrow(Error);

    for (let attempt = 0; attempt < 10; attempt++) {
      let offset = random.next() % master.length;
      const origin = attempt % 3 === 0 ? 'begin' : attempt % 3 === 1 ? 'current' : 'end';

      switch (origin) {
        case 'current':
          offset -= master.position;
          break;
        case 'end':
          offset -= master.length;
          break;
      }

      let expected: number;
      let actual: number;

      if (origin === 'begin') {
        chained.position = offset;
        master.position = offset;
        expected = master.position;
        actual = chained.position;
      } else {
        expected = master.seek(offset, origin);
        actual = chained.seek(offset, origin);
      }

      expect(actual).toBe(expected);
      assertSeekResults();
    }
  });

  test('TestSeekingToCurrentPosition', () => {
    const { chained, master, cbuf, mbuf } = createFixture();

    function assertSeekResults(): void {
      const n = Math.min(master.length - master.position, 256);
      const nread = chained.read(cbuf, 0, n);
      const mread = master.read(mbuf, 0, n);

      expect(nread).toBe(mread);
      expect(chained.position).toBe(master.position);
      expect(cbuf.subarray(0, n)).toEqual(mbuf.subarray(0, n));
    }

    let expected = master.seek(99, 'begin');
    let actual = chained.seek(99, 'begin');
    expect(actual).toBe(expected);
    assertSeekResults();

    expected = master.seek(master.position, 'begin');
    actual = chained.seek(chained.position, 'begin');
    expect(actual).toBe(expected);
    assertSeekResults();

    expected = master.seek(0, 'current');
    actual = chained.seek(0, 'current');
    expect(actual).toBe(expected);
    assertSeekResults();

    expected = master.seek(master.position - master.length, 'end');
    actual = chained.seek(chained.position - chained.length, 'end');
    expect(actual).toBe(expected);
    assertSeekResults();
  });

  test('TestSeekingToStreamBoundaries', () => {
    const { chained, master, lengths, cbuf, mbuf } = createFixture();

    function assertSeekResults(): void {
      const n = Math.min(master.length - master.position, 256);
      const nread = chained.read(cbuf, 0, n);
      const mread = master.read(mbuf, 0, n);

      expect(nread).toBe(mread);
      expect(chained.position).toBe(master.position);
      expect(cbuf.subarray(0, n)).toEqual(mbuf.subarray(0, n));
    }

    let expected = master.seek(0, 'begin');
    let actual = chained.seek(0, 'begin');
    expect(actual).toBe(expected);
    assertSeekResults();

    expected = master.seek(lengths[1], 'begin');
    actual = chained.seek(lengths[1], 'begin');
    expect(actual).toBe(expected);
    assertSeekResults();

    expected = master.seek(lengths[0], 'begin');
    actual = chained.seek(lengths[0], 'begin');
    expect(actual).toBe(expected);
    assertSeekResults();
  });

  test('TestWrite', () => {
    const { chained, backing } = createFixture();
    const buffer = new Uint8Array(chained.length);

    for (let i = 0; i < buffer.length; i++)
      buffer[i] = i & 0xff;

    chained.position = 0;
    chained.write(buffer, 0, buffer.length);
    chained.flush();

    expect(backing.toArray().subarray(0, buffer.length)).toEqual(buffer);
  });

  test('TestWriteOverflow', () => {
    const { chained } = createFixture();
    const buffer = new Uint8Array(chained.length + 1);

    for (let i = 0; i < buffer.length; i++)
      buffer[i] = i & 0xff;

    chained.position = 0;
    expect(() => chained.write(buffer, 0, buffer.length)).toThrow(Error);

    chained.position = 0;
    chained.write(buffer, 0, buffer.length - 1);
    expect(() => chained.write(buffer, buffer.length - 1, 1)).toThrow(Error);
  });

  test('TestSetLength', () => {
    const { chained } = createFixture();

    expect(() => chained.setLength(500)).toThrow(TypeError);
  });
});
