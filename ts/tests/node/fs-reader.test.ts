import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { RandomAccessStream } from '../../src/io/random-access-stream.js';
import { MemoryStream } from '../../src/io/stream.js';
import { MimeParser } from '../../src/mime-parser.js';
import { NodeFileReader } from '../../src/node/fs-reader.js';
import { testDataDir } from '../gates/helpers.js';

const encoder = new TextEncoder();
const tempDir = mkdtempSync(join(tmpdir(), 'mimekit-fs-reader-'));

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function tempFile(name: string, contents: Uint8Array): string {
  const path = join(tempDir, name);
  writeFileSync(path, contents);
  return path;
}

describe('NodeFileReader', () => {
  test('reads bounded ranges synchronously and asynchronously', async () => {
    const reader = NodeFileReader.open(tempFile('basic.bin', encoder.encode('0123456789')));
    try {
      expect(reader.size).toBe(10);
      expect(reader.readAtSync(0, 4)).toEqual(encoder.encode('0123'));
      expect(reader.readAtSync(6, 4)).toEqual(encoder.encode('6789'));
      expect(await reader.readAt(2, 5)).toEqual(encoder.encode('23456'));
    } finally {
      reader.close();
    }
  });

  test('clamps reads to the file and validates arguments', async () => {
    const reader = NodeFileReader.open(tempFile('clamp.bin', encoder.encode('0123456789')));
    try {
      expect(reader.readAtSync(8, 100)).toEqual(encoder.encode('89'));
      expect(reader.readAtSync(10, 4).length).toBe(0);
      expect(reader.readAtSync(100, 4).length).toBe(0);
      expect((await reader.readAt(100, 4)).length).toBe(0);
      expect(() => reader.readAtSync(-1, 4)).toThrow(RangeError);
      expect(() => reader.readAtSync(0, -1)).toThrow(RangeError);
      await expect(reader.readAt(0.5, 4)).rejects.toThrow(RangeError);
    } finally {
      reader.close();
    }
  });

  test('open throws for a missing file; reads throw after close', () => {
    expect(() => NodeFileReader.open(join(tempDir, 'does-not-exist.bin'))).toThrow();

    const reader = NodeFileReader.open(tempFile('closed.bin', encoder.encode('abc')));
    reader.close();
    reader.close();
    expect(() => reader.readAtSync(0, 1)).toThrow(TypeError);
  });

  test('mbox parses identically through NodeFileReader and MemoryStream', () => {
    const path = join(testDataDir, 'mbox', 'simple.mbox.txt');
    const parseAll = (stream: MemoryStream | RandomAccessStream) => {
      const parser = new MimeParser(stream, 'mbox');
      const subjects: Array<string | null> = [];
      while (!parser.isEndOfStream) {
        const result = parser.parseMessage();
        if (!result.ok)
          throw new Error(result.error.message);
        subjects.push(result.value.subject);
      }
      return subjects;
    };

    const expected = parseAll(new MemoryStream(new Uint8Array(readFileSync(path))));
    const reader = NodeFileReader.open(path);
    try {
      // A tiny chunk size forces the parser through many bounded fd reads.
      const actual = parseAll(new RandomAccessStream(reader, 0, undefined, 64));
      expect(actual).toEqual(expected);
      expect(expected.length).toBeGreaterThan(0);
    } finally {
      reader.close();
    }
  });
});
