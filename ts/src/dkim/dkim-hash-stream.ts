// Port of MimeKit/Cryptography/DkimHashStream.cs.

import { Stream, type SeekOrigin } from '../io/stream.js';
import { DkimSignatureAlgorithm } from './dkim-signature-algorithm.js';
import { createSha1, createSha256, type IncrementalHash } from './crypto.js';

/**
 * A DKIM hash stream.
 *
 * Feeds body/header bytes incrementally into a synchronous digest (see
 * {@link IncrementalHash}); {@link generateHash} produces the final hash.
 */
export class DkimHashStream extends Stream {
  private readonly digest: IncrementalHash;
  private readonly max: number;
  private disposed = false;
  private lengthValue = 0;

  /**
   * Create a DKIM hash stream.
   *
   * @param algorithm The signature algorithm (selects SHA-256 or SHA-1).
   * @param maxLength The max length of data to hash, or `-1` for unbounded.
   */
  constructor(algorithm: DkimSignatureAlgorithm, maxLength = -1) {
    super();
    switch (algorithm) {
    case DkimSignatureAlgorithm.Ed25519Sha256:
    case DkimSignatureAlgorithm.RsaSha256:
      this.digest = createSha256();
      break;
    default:
      this.digest = createSha1();
      break;
    }
    this.max = maxLength;
  }

  /**
   * Generate the hash.
   *
   * @returns The hash.
   */
  generateHash(): Uint8Array {
    return this.digest.digest();
  }

  private checkDisposed(): void {
    if (this.disposed) throw new TypeError('DkimHashStream has been disposed');
  }

  /** Whether the stream supports reading (never). */
  override get canRead(): boolean { return false; }
  /** Whether the stream supports writing (always). */
  override get canWrite(): boolean { return true; }
  /** Whether the stream supports seeking (never). */
  override get canSeek(): boolean { return false; }
  /** Whether reading and writing can time out (never). */
  get canTimeout(): boolean { return false; }

  /** The number of bytes written to the stream. */
  override get length(): number {
    this.checkDisposed();
    return this.lengthValue;
  }

  /** The current position within the stream. */
  override get position(): number { return this.lengthValue; }
  /** Setting the position is not supported. */
  override set position(_value: number) {
    this.checkDisposed();
    throw new TypeError('The stream does not support seeking.');
  }

  /**
   * Reading from a hash stream is not supported.
   *
   * @param _buffer The buffer to read data into.
   * @param _offset The offset into the buffer.
   * @param _count The number of bytes to read.
   * @throws {TypeError} Always thrown.
   */
  override read(_buffer: Uint8Array, _offset: number, _count: number): number {
    this.checkDisposed();
    throw new TypeError('The stream does not support reading');
  }

  /**
   * Write a sequence of bytes to the stream, updating the running digest.
   *
   * @param buffer The buffer to write.
   * @param offset The offset of the first byte to write.
   * @param count The number of bytes to write.
   */
  override write(buffer: Uint8Array, offset: number, count: number): void {
    this.checkDisposed();
    if (buffer == null) throw new TypeError('buffer cannot be null or undefined');
    Stream.validateBufferArguments(buffer, offset, count);

    const n = this.max >= 0 && this.lengthValue + count > this.max ? this.max - this.lengthValue : count;

    if (n > 0) this.digest.update(buffer, offset, n);

    this.lengthValue += n;
  }

  /**
   * Seeking is not supported.
   *
   * @param _offset The offset relative to `_origin`.
   * @param _origin The reference point.
   * @throws {TypeError} Always thrown.
   */
  override seek(_offset: number, _origin: SeekOrigin): number {
    this.checkDisposed();
    throw new TypeError('The stream does not support seeking.');
  }

  /** Flush the stream (a no-op). */
  override flush(): void {
    this.checkDisposed();
  }

  /**
   * Setting the length is not supported.
   *
   * @param _value The requested length.
   * @throws {TypeError} Always thrown.
   */
  override setLength(_value: number): void {
    this.checkDisposed();
    throw new TypeError('The stream does not support setting the length.');
  }

  /** Dispose the stream. */
  override dispose(): void {
    this.disposed = true;
    super.dispose();
  }
}
