// Port of MimeKit/Cryptography/DkimSignatureStream.cs.

import { Stream, type SeekOrigin } from '../io/stream.js';
import { base64Decode, type DigestSigner } from './crypto.js';

/**
 * A DKIM signature stream.
 *
 * Feeds header bytes into a {@link DigestSigner}; {@link generateSignature}
 * and {@link verifySignature} perform the (asynchronous) signature operation.
 */
export class DkimSignatureStream extends Stream {
  private disposed = false;
  private lengthValue = 0;

  /** The digest signer. */
  readonly signer: DigestSigner;

  /**
   * Create a DKIM signature stream.
   *
   * @param signer The digest signer.
   * @throws {TypeError} `signer` is null or undefined.
   */
  constructor(signer: DigestSigner) {
    super();
    if (signer == null) throw new TypeError('signer cannot be null or undefined');
    this.signer = signer;
  }

  /**
   * Generate the signature.
   *
   * @returns The signature.
   */
  generateSignature(): Promise<Uint8Array> {
    return this.signer.generateSignature();
  }

  /**
   * Verify the DKIM signature.
   *
   * @param signature The base64-encoded DKIM signature from the `b=` parameter.
   * @returns `true` if the signature is valid; otherwise, `false`.
   * @throws {TypeError} `signature` is null or undefined.
   */
  verifySignature(signature: string): Promise<boolean> {
    if (signature == null) throw new TypeError('signature cannot be null or undefined');
    const rawSignature = base64Decode(signature);
    return this.signer.verifySignature(rawSignature);
  }

  private checkDisposed(): void {
    if (this.disposed) throw new TypeError('DkimSignatureStream has been disposed');
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
   * Reading from a signature stream is not supported.
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
   * Write a sequence of bytes to the stream, feeding the digest signer.
   *
   * @param buffer The buffer to write.
   * @param offset The offset of the first byte to write.
   * @param count The number of bytes to write.
   */
  override write(buffer: Uint8Array, offset: number, count: number): void {
    this.checkDisposed();
    if (buffer == null) throw new TypeError('buffer cannot be null or undefined');
    Stream.validateBufferArguments(buffer, offset, count);

    this.signer.blockUpdate(buffer, offset, count);
    this.lengthValue += count;
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
