/**
 * Substrate shim: the random-access byte-source abstraction the edge adapters
 * read through (not a port of a MimeKit file).
 *
 * The parser core consumes the synchronous {@link Stream} contract; these
 * interfaces describe the *sources* the edge adapters bridge from — a browser
 * `File`/`Blob`, a Node file descriptor, an in-memory buffer — as
 * `readAt(position, length)` plus a known `size`. A source that can serve
 * bytes without awaiting (an in-memory buffer, `FileReaderSync` in a worker,
 * `fs.readSync`) additionally implements {@link SyncRandomAccessReader}, which
 * is what {@link RandomAccessStream} needs to feed the parser. The interfaces
 * are structural, so any host object with the same shape (e.g. another
 * library's reader) works without importing this module.
 *
 * ### Short-read contract
 * `readAt`/`readAtSync` return the requested byte range **clamped to
 * `[0, size]`**: a request past the end of the source yields fewer bytes than
 * asked for (possibly zero), never a throw — callers detect truncation by
 * checking the returned `length`. Results are independent copies, safe to
 * retain across further reads. Negative or non-integer `position`/`length`
 * are programmer errors and throw `RangeError`.
 */

/**
 * A seekable, length-known byte source read asynchronously.
 */
export interface RandomAccessReader {
  /**
   * Total number of bytes in the source. Known up front for every backing
   * store the adapters target (`Blob.size`, `fstat`, `byteLength`), so it is
   * a synchronous property rather than a promise.
   */
  readonly size: number;

  /**
   * Read up to `length` bytes starting at `position`.
   *
   * @param position Zero-based byte offset to start reading from.
   * @param length Maximum number of bytes to read.
   * @returns A promise for an independent copy of the bytes read, clamped to
   *   the source: its `.length` is at most `min(length, size - position)` and
   *   may be `0` at or past the end.
   * @throws {RangeError} `position` or `length` is negative or not an integer.
   */
  readAt(position: number, length: number): Promise<Uint8Array>;
}

/**
 * A {@link RandomAccessReader} that can additionally serve bytes synchronously.
 */
export interface SyncRandomAccessReader extends RandomAccessReader {
  /**
   * Read up to `length` bytes starting at `position`, synchronously. Obeys
   * the same short-read contract as {@link RandomAccessReader.readAt}.
   *
   * @param position Zero-based byte offset to start reading from.
   * @param length Maximum number of bytes to read.
   * @returns An independent copy of the bytes read, clamped to the source.
   * @throws {RangeError} `position` or `length` is negative or not an integer.
   */
  readAtSync(position: number, length: number): Uint8Array;
}

/**
 * Narrow a {@link RandomAccessReader} to {@link SyncRandomAccessReader} when
 * the source can serve bytes synchronously.
 *
 * @param reader The reader to test.
 * @returns `true` if `reader` implements `readAtSync`.
 */
export function isSyncReader(reader: RandomAccessReader): reader is SyncRandomAccessReader {
  return typeof (reader as Partial<SyncRandomAccessReader>).readAtSync === 'function';
}

/**
 * Validate a `readAt`/`readAtSync` argument pair.
 *
 * @param position Zero-based byte offset to start reading from.
 * @param length Maximum number of bytes to read.
 * @throws {RangeError} `position` or `length` is negative or not an integer.
 */
export function validateReadRange(position: number, length: number): void {
  if (!Number.isInteger(position) || position < 0)
    throw new RangeError(`position ${position} must be a non-negative integer`);
  if (!Number.isInteger(length) || length < 0)
    throw new RangeError(`length ${length} must be a non-negative integer`);
}
