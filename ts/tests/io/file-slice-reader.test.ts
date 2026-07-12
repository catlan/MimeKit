import { afterEach, describe, expect, test, vi } from 'vitest';
import { FileSliceReader, SyncFileSliceReader, createFileSliceReader } from '../../src/io/file-slice-reader.js';
import { isSyncReader } from '../../src/io/random-access-reader.js';

const encoder = new TextEncoder();

/**
 * FileReaderSync only exists inside real Web Workers, so the sync paths are
 * exercised with a stand-in: a Blob-shaped object whose slices carry their
 * bytes, and a FileReaderSync whose readAsArrayBuffer returns them.
 */
class FakeBlob {
  constructor(readonly bytes: Uint8Array) {}

  get size(): number {
    return this.bytes.length;
  }

  slice(start: number, end: number): FakeBlob {
    return new FakeBlob(this.bytes.subarray(start, end));
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.resolve(this.bytes.slice().buffer);
  }
}

class FakeFileReaderSync {
  readAsArrayBuffer(blob: FakeBlob): ArrayBuffer {
    return blob.bytes.slice().buffer;
  }
}

function fakeBlob(text: string): Blob {
  return new FakeBlob(encoder.encode(text)) as unknown as Blob;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FileSliceReader', () => {
  test('reads bounded ranges from a real Blob', async () => {
    const reader = new FileSliceReader(new Blob([encoder.encode('0123456789')]));

    expect(reader.size).toBe(10);
    expect(await reader.readAt(0, 4)).toEqual(encoder.encode('0123'));
    expect(await reader.readAt(6, 4)).toEqual(encoder.encode('6789'));
  });

  test('clamps reads to the source and validates arguments', async () => {
    const reader = new FileSliceReader(new Blob([encoder.encode('0123456789')]));

    expect(await reader.readAt(8, 100)).toEqual(encoder.encode('89'));
    expect((await reader.readAt(10, 4)).length).toBe(0);
    expect((await reader.readAt(100, 4)).length).toBe(0);
    await expect(reader.readAt(-1, 4)).rejects.toThrow(RangeError);
    await expect(reader.readAt(0, -1)).rejects.toThrow(RangeError);
    await expect(reader.readAt(0.5, 4)).rejects.toThrow(RangeError);
  });
});

describe('SyncFileSliceReader', () => {
  test('readAtSync throws a helpful error outside a worker', () => {
    const reader = new SyncFileSliceReader(new Blob([encoder.encode('abc')]));
    expect(() => reader.readAtSync(0, 3)).toThrow(/FileReaderSync/);
  });

  test('readAtSync reads bounded ranges through FileReaderSync', () => {
    vi.stubGlobal('FileReaderSync', FakeFileReaderSync);
    const reader = new SyncFileSliceReader(fakeBlob('0123456789'));

    expect(reader.readAtSync(0, 4)).toEqual(encoder.encode('0123'));
    expect(reader.readAtSync(8, 100)).toEqual(encoder.encode('89'));
    expect(reader.readAtSync(100, 4).length).toBe(0);
    expect(() => reader.readAtSync(-1, 4)).toThrow(RangeError);
    expect(() => reader.readAtSync(0, -1)).toThrow(RangeError);
  });
});

describe('createFileSliceReader', () => {
  test('returns the async reader when FileReaderSync is unavailable', () => {
    const reader = createFileSliceReader(new Blob([encoder.encode('abc')]));
    expect(reader).toBeInstanceOf(FileSliceReader);
    expect(isSyncReader(reader)).toBe(false);
  });

  test('returns the sync reader inside a worker context', () => {
    vi.stubGlobal('FileReaderSync', FakeFileReaderSync);
    const reader = createFileSliceReader(fakeBlob('abc'));
    expect(reader).toBeInstanceOf(SyncFileSliceReader);
    expect(isSyncReader(reader)).toBe(true);
  });
});
