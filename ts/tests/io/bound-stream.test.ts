import { describe, expect, test } from 'vitest';
import { BoundStream } from '../../src/io/bound-stream.js';
import { MemoryStream, Stream, type SeekOrigin } from '../../src/io/stream.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

function text(data: Uint8Array, length: number): string {
  return decoder.decode(data.subarray(0, length));
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

describe('BoundStream', () => {
  test('TestCanReadWriteSeek', () => {
    const buffer = new Uint8Array(1024);

    let bounded = new BoundStream(new CanReadWriteSeekStream(true, false, false), 0, -1, false);
    expect(bounded.canRead).toBe(true);
    expect(bounded.canWrite).toBe(false);
    expect(bounded.canSeek).toBe(false);
    expect(bounded.canTimeout).toBe(false);
    expect(() => bounded.read(buffer, 0, buffer.length)).toThrow('not implemented');
    expect(() => bounded.write(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => bounded.seek(0, 'end')).toThrow(TypeError);

    bounded = new BoundStream(new CanReadWriteSeekStream(false, true, false), 0, -1, false);
    expect(bounded.canRead).toBe(false);
    expect(bounded.canWrite).toBe(true);
    expect(bounded.canSeek).toBe(false);
    expect(bounded.canTimeout).toBe(false);
    expect(() => bounded.read(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => bounded.write(buffer, 0, buffer.length)).toThrow('not implemented');
    expect(() => bounded.seek(0, 'end')).toThrow(TypeError);

    bounded = new BoundStream(new CanReadWriteSeekStream(false, false, true), 0, -1, false);
    expect(bounded.canRead).toBe(false);
    expect(bounded.canWrite).toBe(false);
    expect(bounded.canSeek).toBe(true);
    expect(bounded.canTimeout).toBe(false);
    expect(() => bounded.read(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => bounded.write(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => bounded.seek(0, 'end')).toThrow('not implemented');
  });

  test('TestSeek', () => {
    let memory = new MemoryStream();
    let buffer = bytes('This is some text...');
    memory.write(buffer, 0, buffer.length);

    let bounded = new BoundStream(memory, 5, -1, true);
    expect(bounded.position).toBe(0);
    let n = bounded.read(buffer, 0, buffer.length);
    expect(text(buffer, n)).toBe('is some text...');

    bounded.read(buffer, 0, buffer.length);

    let position = bounded.seek(-1 * n, 'end');
    expect(position).toBe(0);
    n = bounded.read(buffer, 0, buffer.length);
    expect(text(buffer, n)).toBe('is some text...');

    position = bounded.seek(0, 'begin');
    expect(position).toBe(0);
    n = bounded.read(buffer, 0, buffer.length);
    expect(text(buffer, n)).toBe('is some text...');

    position = bounded.seek(-1 * n, 'current');
    expect(position).toBe(0);
    n = bounded.read(buffer, 0, buffer.length);
    expect(text(buffer, n)).toBe('is some text...');

    expect(() => bounded.seek(-1, 'begin')).toThrow(Error);
    expect(() => bounded.seek(-1 * buffer.length, 'end')).toThrow(Error);

    memory = new MemoryStream();
    buffer = bytes('This is some text...');
    memory.write(buffer, 0, buffer.length);

    bounded = new BoundStream(memory, 5, buffer.length, true);
    expect(bounded.position).toBe(0);
    n = bounded.read(buffer, 0, buffer.length);
    expect(text(buffer, n)).toBe('is some text...');

    position = bounded.seek(0, 'begin');
    expect(position).toBe(0);
    n = bounded.read(buffer, 0, buffer.length);
    expect(text(buffer, n)).toBe('is some text...');

    position = bounded.seek(-1 * n, 'current');
    expect(position).toBe(0);
    n = bounded.read(buffer, 0, buffer.length);
    expect(text(buffer, n)).toBe('is some text...');

    position = bounded.seek(-1 * n, 'end');
    expect(position).toBe(0);
    n = bounded.read(buffer, 0, buffer.length);
    expect(text(buffer, n)).toBe('is some text...');

    expect(() => bounded.seek(-1, 'begin')).toThrow(Error);
    expect(() => bounded.seek(-1 * buffer.length, 'end')).toThrow(Error);
    expect(() => bounded.seek(5, 'end')).toThrow(Error);
  });

  test('TestSetLength', () => {
    let memory = new MemoryStream();
    let buffer = bytes('This is some text...');
    memory.write(buffer, 0, buffer.length);
    let bounded = new BoundStream(memory, 0, -1, true);
    const buf = new Uint8Array(1024);

    expect(bounded.length).toBe(buffer.length);
    bounded.read(buf, 0, buf.length);
    bounded.read(buf, 0, buf.length);
    expect(bounded.length).toBe(buffer.length);

    bounded.setLength(500);

    expect(bounded.length).toBe(500);
    expect(memory.length).toBe(500);

    memory = new MemoryStream();
    buffer = bytes('This is some text...');
    memory.write(buffer, 0, buffer.length);
    bounded = new BoundStream(memory, 0, buffer.length, true);

    expect(bounded.length).toBe(buffer.length);
    bounded.setLength(500);
    expect(bounded.length).toBe(500);
    expect(memory.length).toBe(500);

    memory = new MemoryStream();
    buffer = bytes('This is some text...');
    memory.write(buffer, 0, buffer.length);
    bounded = new BoundStream(memory, 0, buffer.length, true);

    expect(bounded.length).toBe(buffer.length);
    bounded.setLength(5);
    expect(bounded.length).toBe(5);
    expect(memory.length).toBe(buffer.length);
  });

  test('TestSetPosition', () => {
    const memory = new MemoryStream();
    const buffer = bytes('This is some text...');

    memory.write(buffer, 0, buffer.length);
    memory.position = 0;

    const bounded = new BoundStream(memory, 0, -1, true);
    bounded.position = 10;

    expect(bounded.position).toBe(10);
    expect(memory.position).toBe(10);
  });

  test('TestWritingBeyondEndBoundary', () => {
    const memory = new MemoryStream();
    let buffer = new Uint8Array([65]);

    memory.write(buffer, 0, buffer.length);
    memory.position = 0;

    const bounded = new BoundStream(memory, 0, 2, true);
    buffer = new Uint8Array([98, 99, 100]);

    expect(() => bounded.write(buffer, 0, buffer.length)).toThrow(Error);
  });
});
