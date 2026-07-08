import { describe, expect, test } from 'vitest';
import { FilteredStream } from '../../src/io/filtered-stream.js';
import { Dos2UnixFilter } from '../../src/io/filters/dos2unix-filter.js';
import { PassThroughFilter } from '../../src/io/filters/pass-through-filter.js';
import { Unix2DosFilter } from '../../src/io/filters/unix2dos-filter.js';
import { MemoryStream, Stream, type SeekOrigin } from '../../src/io/stream.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

function text(data: Uint8Array): string {
  return decoder.decode(data);
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

describe('FilteredStream', () => {
  test('TestObjectDisposedExceptions', () => {
    const filtered = new FilteredStream(new MemoryStream());
    const filter = new PassThroughFilter();
    const buf = new Uint8Array(1024);

    filtered.dispose();

    expect(() => filtered.read(buf, 0, buf.length)).toThrow(TypeError);
    expect(() => filtered.write(buf, 0, buf.length)).toThrow(TypeError);
    expect(() => filtered.flush()).toThrow(TypeError);
    expect(() => filtered.add(filter)).toThrow(TypeError);
    expect(() => filtered.remove(filter)).toThrow(TypeError);
    expect(() => filtered.contains(filter)).toThrow(TypeError);
  });

  test('TestCanReadWriteSeek', () => {
    const buffer = new Uint8Array(1024);

    let filtered = new FilteredStream(new CanReadWriteSeekStream(true, false, false));
    expect(filtered.canRead).toBe(true);
    expect(filtered.canWrite).toBe(false);
    expect(filtered.canSeek).toBe(false);
    expect(() => filtered.read(buffer, 0, buffer.length)).toThrow('not implemented');
    expect(() => filtered.write(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => filtered.seek(0, 'end')).toThrow(TypeError);

    filtered = new FilteredStream(new CanReadWriteSeekStream(false, true, false));
    expect(filtered.canRead).toBe(false);
    expect(filtered.canWrite).toBe(true);
    expect(filtered.canSeek).toBe(false);
    expect(() => filtered.read(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => filtered.write(buffer, 0, buffer.length)).toThrow('not implemented');
    expect(() => filtered.seek(0, 'end')).toThrow(TypeError);

    filtered = new FilteredStream(new CanReadWriteSeekStream(false, false, true));
    expect(filtered.canRead).toBe(false);
    expect(filtered.canWrite).toBe(false);
    expect(filtered.canSeek).toBe(false);
    expect(() => filtered.read(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => filtered.write(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => filtered.seek(0, 'end')).toThrow(TypeError);
  });

  test('TestRead', () => {
    const input = bytes('one\r\ntwo\r\nthree');
    const source = new MemoryStream(input);
    const filtered = new FilteredStream(source);
    const decoded = new MemoryStream();

    filtered.add(new Dos2UnixFilter());
    filtered.copyTo(decoded, 4);

    expect(text(decoded.toArray())).toBe('one\ntwo\nthree');
  });

  test('TestWrite', () => {
    const output = new MemoryStream();
    const filtered = new FilteredStream(output);
    const input = bytes('one\ntwo\nthree');

    filtered.add(new Unix2DosFilter(true));
    filtered.write(input, 0, input.length);
    filtered.flush();

    expect(text(output.toArray())).toBe('one\r\ntwo\r\nthree\r\n');
  });

  test('TestSetLength', () => {
    const filtered = new FilteredStream(new MemoryStream());

    expect(() => filtered.setLength(500)).toThrow(TypeError);
  });
});
