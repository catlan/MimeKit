/**
 * Substrate shim: Node filesystem edge reader (not a port of a MimeKit file).
 *
 * A {@link SyncRandomAccessReader} over a file descriptor: `fs.readSync` gives
 * the synchronous bounded reads the parser core needs (via
 * {@link RandomAccessStream}) and `fs.read` serves the async half, so a
 * multi-GB mailbox is parsed by seeking and never fully loaded into memory.
 * Lives behind the `mimekit/node` subpath export so the main entry stays free
 * of `node:` imports.
 */

import { closeSync, fstatSync, openSync, read, readSync } from 'node:fs';
import { validateReadRange, type SyncRandomAccessReader } from '../io/random-access-reader.js';

/**
 * A {@link SyncRandomAccessReader} over a file opened for reading.
 */
export class NodeFileReader implements SyncRandomAccessReader {
  /** Total number of bytes in the file at the time it was opened. */
  readonly size: number;
  private fd: number | null;

  private constructor(fd: number, size: number) {
    this.fd = fd;
    this.size = size;
  }

  /**
   * Open a file for random-access reading.
   *
   * @param path Path of the file to open.
   * @returns A reader over the file; call {@link close} when done.
   */
  static open(path: string): NodeFileReader {
    const fd = openSync(path, 'r');
    try {
      return new NodeFileReader(fd, fstatSync(fd).size);
    } catch (error) {
      closeSync(fd);
      throw error;
    }
  }

  /**
   * Close the underlying file descriptor. Safe to call more than once;
   * subsequent reads throw.
   */
  close(): void {
    if (this.fd !== null) {
      closeSync(this.fd);
      this.fd = null;
    }
  }

  private requireFd(): number {
    if (this.fd === null)
      throw new TypeError('NodeFileReader is closed');
    return this.fd;
  }

  /**
   * Read up to `length` bytes starting at `position`, synchronously.
   *
   * @param position Zero-based byte offset to start reading from.
   * @param length Maximum number of bytes to read.
   * @returns The bytes read, clamped to the source.
   * @throws {RangeError} `position` or `length` is negative or not an integer.
   * @throws {TypeError} The reader has been closed.
   */
  readAtSync(position: number, length: number): Uint8Array {
    validateReadRange(position, length);
    const start = Math.min(position, this.size);
    const end = Math.min(position + length, this.size);
    const buffer = new Uint8Array(end - start);
    let filled = 0;
    while (filled < buffer.length) {
      const n = readSync(this.requireFd(), buffer, filled, buffer.length - filled, start + filled);
      if (n === 0)
        break;
      filled += n;
    }
    return filled === buffer.length ? buffer : buffer.slice(0, filled);
  }

  /**
   * Read up to `length` bytes starting at `position`.
   *
   * @param position Zero-based byte offset to start reading from.
   * @param length Maximum number of bytes to read.
   * @returns A promise for the bytes read, clamped to the source.
   * @throws {RangeError} `position` or `length` is negative or not an integer.
   * @throws {TypeError} The reader has been closed.
   */
  async readAt(position: number, length: number): Promise<Uint8Array> {
    validateReadRange(position, length);
    const start = Math.min(position, this.size);
    const end = Math.min(position + length, this.size);
    const buffer = new Uint8Array(end - start);
    let filled = 0;
    while (filled < buffer.length) {
      const fd = this.requireFd();
      const offset = filled;
      const n = await new Promise<number>((resolve, reject) => {
        read(fd, buffer, offset, buffer.length - offset, start + offset, (error, bytesRead) => {
          if (error !== null) reject(error);
          else resolve(bytesRead);
        });
      });
      if (n === 0)
        break;
      filled += n;
    }
    return filled === buffer.length ? buffer : buffer.slice(0, filled);
  }
}
