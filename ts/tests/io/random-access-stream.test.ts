import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { isSyncReader, type SyncRandomAccessReader } from '../../src/io/random-access-reader.js';
import { RandomAccessStream } from '../../src/io/random-access-stream.js';
import { MemoryStream } from '../../src/io/stream.js';
import { MimeParser } from '../../src/mime-parser.js';
import type { MimeMessage } from '../../src/mime-message.js';
import { testDataDir } from '../gates/helpers.js';

const encoder = new TextEncoder();

/** An in-memory SyncRandomAccessReader that counts reads for cache assertions. */
class BytesReader implements SyncRandomAccessReader {
  readCount = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get size(): number {
    return this.bytes.length;
  }

  readAtSync(position: number, length: number): Uint8Array {
    if (!Number.isInteger(position) || position < 0)
      throw new RangeError(`position ${position} must be a non-negative integer`);
    if (!Number.isInteger(length) || length < 0)
      throw new RangeError(`length ${length} must be a non-negative integer`);
    this.readCount++;
    const start = Math.min(position, this.bytes.length);
    const end = Math.min(position + length, this.bytes.length);
    return this.bytes.slice(start, end);
  }

  readAt(position: number, length: number): Promise<Uint8Array> {
    return Promise.resolve(this.readAtSync(position, length));
  }
}

function parseMbox(stream: MemoryStream | RandomAccessStream, persistent = false): MimeMessage[] {
  const parser = new MimeParser(stream, 'mbox', persistent);
  const messages: MimeMessage[] = [];
  while (!parser.isEndOfStream) {
    const result = parser.parseMessage();
    if (!result.ok)
      throw new Error(result.error.message);
    messages.push(result.value);
  }
  return messages;
}

describe('RandomAccessStream', () => {
  test('capabilities and constructor validation', () => {
    const reader = new BytesReader(encoder.encode('0123456789'));
    const stream = new RandomAccessStream(reader);

    expect(stream.canRead).toBe(true);
    expect(stream.canWrite).toBe(false);
    expect(stream.canSeek).toBe(true);
    expect(stream.length).toBe(10);
    expect(stream.position).toBe(0);

    expect(() => new RandomAccessStream(reader, -1)).toThrow(RangeError);
    expect(() => new RandomAccessStream(reader, 0.5)).toThrow(RangeError);
    expect(() => new RandomAccessStream(reader, 0, -1)).toThrow(RangeError);
    expect(() => new RandomAccessStream(reader, 0, 10, 0)).toThrow(RangeError);
  });

  test('reads across chunk boundaries through the cache', () => {
    const source = encoder.encode('abcdefghijklmnopqrstuvwxyz');
    const reader = new BytesReader(source);
    const stream = new RandomAccessStream(reader, 0, undefined, 8);

    const buffer = new Uint8Array(source.length);
    expect(stream.read(buffer, 0, buffer.length)).toBe(source.length);
    expect(buffer).toEqual(source);
    // 26 bytes through an 8-byte cache: ceil(26 / 8) = 4 underlying reads.
    expect(reader.readCount).toBe(4);

    // Re-reading inside the cached chunk hits the cache, not the reader.
    stream.position = 24;
    const tail = new Uint8Array(2);
    expect(stream.read(tail, 0, 2)).toBe(2);
    expect(tail).toEqual(source.subarray(24));
    expect(reader.readCount).toBe(4);
  });

  test('start/length window makes positions stream-relative', () => {
    const reader = new BytesReader(encoder.encode('0123456789'));
    const stream = new RandomAccessStream(reader, 3, 4);

    expect(stream.length).toBe(4);
    const buffer = new Uint8Array(8);
    expect(stream.read(buffer, 0, 8)).toBe(4);
    expect(buffer.subarray(0, 4)).toEqual(encoder.encode('3456'));
    expect(stream.read(buffer, 0, 8)).toBe(0);
  });

  test('length defaults to the remainder of the reader from start', () => {
    const reader = new BytesReader(encoder.encode('0123456789'));
    expect(new RandomAccessStream(reader, 4).length).toBe(6);
    expect(new RandomAccessStream(reader, 15).length).toBe(0);
  });

  test('seek and position setter validate their targets', () => {
    const reader = new BytesReader(encoder.encode('0123456789'));
    const stream = new RandomAccessStream(reader);

    expect(stream.seek(4, 'begin')).toBe(4);
    expect(stream.seek(2, 'current')).toBe(6);
    expect(stream.seek(-1, 'end')).toBe(9);
    expect(() => stream.seek(-1, 'begin')).toThrow(RangeError);
    expect(() => { stream.position = -1; }).toThrow(RangeError);
    expect(() => { stream.position = 1.5; }).toThrow(RangeError);
  });

  test('read validates buffer arguments and clamps at end of stream', () => {
    const reader = new BytesReader(encoder.encode('0123456789'));
    const stream = new RandomAccessStream(reader);
    const buffer = new Uint8Array(4);

    expect(() => stream.read(buffer, -1, 1)).toThrow(RangeError);
    expect(() => stream.read(buffer, 0, 5)).toThrow(RangeError);

    stream.position = 8;
    expect(stream.read(buffer, 0, 4)).toBe(2);
    stream.position = 100;
    expect(stream.read(buffer, 0, 4)).toBe(0);
  });

  test('write and setLength are not supported', () => {
    const stream = new RandomAccessStream(new BytesReader(new Uint8Array(4)));
    expect(() => stream.write(new Uint8Array(1), 0, 1)).toThrow(TypeError);
    expect(() => stream.setLength(8)).toThrow(TypeError);
    stream.flush();
  });

  test('isSyncReader narrows readers by capability', () => {
    const sync = new BytesReader(new Uint8Array(1));
    expect(isSyncReader(sync)).toBe(true);
    expect(isSyncReader({ size: 1, readAt: () => Promise.resolve(new Uint8Array(0)) })).toBe(false);
  });

  test('mbox parses identically through RandomAccessStream and MemoryStream', () => {
    const bytes = new Uint8Array(readFileSync(join(testDataDir, 'mbox', 'simple.mbox.txt')));
    const expected = parseMbox(new MemoryStream(bytes));
    // A tiny chunk size forces the parser through many cache refills.
    const actual = parseMbox(new RandomAccessStream(new BytesReader(bytes), 0, undefined, 64));

    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++)
      expect(actual[i]!.subject).toBe(expected[i]!.subject);
  });

  test('a persistent mbox listing pass can re-parse one entry as its own stream', () => {
    const bytes = new Uint8Array(readFileSync(join(testDataDir, 'mbox', 'simple.mbox.txt')));
    const reader = new BytesReader(bytes);

    const parser = new MimeParser(new RandomAccessStream(reader), 'mbox', true);
    const entries: Array<{ offset: number; length: number; subject: string | null }> = [];
    while (!parser.isEndOfStream) {
      const result = parser.parseMessage();
      if (!result.ok)
        throw new Error(result.error.message);
      const offset = parser.mboxMarkerOffset;
      entries.push({ offset, length: parser.position - offset, subject: result.value.subject });
    }
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      const single = new MimeParser(new RandomAccessStream(reader, entry.offset, entry.length), 'mbox');
      const result = single.parseMessage();
      expect(result.ok).toBe(true);
      if (result.ok)
        expect(result.value.subject).toBe(entry.subject);
    }
  });
});
