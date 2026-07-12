/**
 * Substrate shim: browser `File`/`Blob` edge readers (not a port of a MimeKit
 * file).
 *
 * Nothing is materialized up front — a multi-GB mailbox is read through
 * bounded `Blob.slice()` requests, so it is parsed by seeking and never fully
 * loaded into memory. On the window global only asynchronous reads exist
 * ({@link FileSliceReader}); inside a Web Worker, `FileReaderSync` provides
 * bounded synchronous reads ({@link SyncFileSliceReader}), which is what the
 * synchronous parser core needs via {@link RandomAccessStream}. Use
 * {@link createFileSliceReader} to get the best reader the current execution
 * context supports.
 */

import {
  validateReadRange,
  type RandomAccessReader,
  type SyncRandomAccessReader,
} from './random-access-reader.js';

/**
 * The subset of the worker-only `FileReaderSync` API used here; looked up on
 * `globalThis` at call time because the DOM type library does not declare it.
 */
interface FileReaderSyncLike {
  readAsArrayBuffer(blob: Blob): ArrayBuffer;
}

function getFileReaderSync(): (new () => FileReaderSyncLike) | undefined {
  return (globalThis as { FileReaderSync?: new () => FileReaderSyncLike }).FileReaderSync;
}

/**
 * A {@link RandomAccessReader} over a DOM `File`/`Blob` that reads through
 * `slice()` + `arrayBuffer()`.
 */
export class FileSliceReader implements RandomAccessReader {
  /** Total number of bytes in the source. */
  readonly size: number;

  /**
   * Create a reader over the given blob.
   *
   * @param blob The `File` or `Blob` to read from.
   */
  constructor(protected readonly blob: Blob) {
    this.size = blob.size;
  }

  /**
   * Read up to `length` bytes starting at `position`.
   *
   * @param position Zero-based byte offset to start reading from.
   * @param length Maximum number of bytes to read.
   * @returns A promise for the bytes read, clamped to the source.
   * @throws {RangeError} `position` or `length` is negative or not an integer.
   */
  async readAt(position: number, length: number): Promise<Uint8Array> {
    validateReadRange(position, length);
    const start = Math.min(position, this.size);
    const end = Math.min(position + length, this.size);
    if (end <= start)
      return new Uint8Array(0);
    return new Uint8Array(await this.blob.slice(start, end).arrayBuffer());
  }
}

/**
 * A {@link FileSliceReader} that uses the worker-only `FileReaderSync` API for
 * bounded synchronous reads. This is deliberately separate from
 * {@link FileSliceReader}: `FileReaderSync` is not available on the window
 * global, so synchronous reads only work inside a Web Worker.
 */
export class SyncFileSliceReader extends FileSliceReader implements SyncRandomAccessReader {
  /**
   * Read up to `length` bytes starting at `position`, synchronously.
   *
   * @param position Zero-based byte offset to start reading from.
   * @param length Maximum number of bytes to read.
   * @returns The bytes read, clamped to the source.
   * @throws {RangeError} `position` or `length` is negative or not an integer.
   * @throws {TypeError} `FileReaderSync` is not available (not running inside
   *   a Web Worker).
   */
  readAtSync(position: number, length: number): Uint8Array {
    validateReadRange(position, length);
    const FileReaderSyncClass = getFileReaderSync();
    if (FileReaderSyncClass === undefined) {
      throw new TypeError(
        'SyncFileSliceReader requires the worker-only FileReaderSync API; ' +
        'use it inside a Web Worker, or construct readers via createFileSliceReader()');
    }
    const start = Math.min(position, this.size);
    const end = Math.min(position + length, this.size);
    if (end <= start)
      return new Uint8Array(0);
    return new Uint8Array(new FileReaderSyncClass().readAsArrayBuffer(this.blob.slice(start, end)));
  }
}

/**
 * Create the best bounded reader available in the current execution context:
 * a {@link SyncFileSliceReader} inside a Web Worker (where `FileReaderSync`
 * exists), otherwise an async-only {@link FileSliceReader}.
 *
 * @param blob The `File` or `Blob` to read from.
 * @returns A reader over `blob`; test it with {@link isSyncReader}.
 */
export function createFileSliceReader(blob: Blob): RandomAccessReader {
  return getFileReaderSync() !== undefined ? new SyncFileSliceReader(blob) : new FileSliceReader(blob);
}
