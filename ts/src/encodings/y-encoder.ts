/**
 * Port of MimeKit/Encodings/YEncoder.cs.
 */
import type { ContentEncoding } from '../content-encoding.js';
import { Crc32 } from '../utils/crc32.js';
import type { MimeEncoder } from './types.js';
import { validateCodecArguments } from './types.js';

/**
 * Incrementally encodes content using yEnc.
 *
 * yEnc is most commonly used with Usenet and is a binary encoding that includes
 * a 32-bit cyclic redundancy check. For more information, see www.yenc.org.
 */
export class YEncoder implements MimeEncoder {
  /** The encoding that this encoder supports. */
  readonly encoding: ContentEncoding = 'default';
  private octets = 0;
  private crc: Crc32;

  /**
   * Creates a new yEnc encoder.
   *
   * @param lineLength - The line length to use.
   * @throws {RangeError} `lineLength` is outside the supported range.
   */
  constructor(private readonly lineLength = 128) {
    if (lineLength < 60 || lineLength > 998)
      throw new RangeError('maxLineLength must be within the range of 60 to 998');
    this.crc = new Crc32(-1);
    this.reset();
  }

  /** The current checksum. */
  get checksum(): number {
    return this.crc.checksum;
  }

  /**
   * Creates a new yEnc encoder with exactly the same state as this encoder.
   *
   * @returns A new encoder with identical state.
   */
  clone(): MimeEncoder {
    const encoder = new YEncoder(this.lineLength);
    encoder.crc = this.crc.clone();
    encoder.octets = this.octets;
    return encoder;
  }

  /**
   * Estimates the number of bytes needed to encode the specified number of input bytes.
   *
   * @param inputLength - The input length.
   * @returns The estimated output length.
   */
  estimateOutputLength(inputLength: number): number {
    return (inputLength * 2) + Math.trunc(inputLength / this.lineLength) + 1;
  }

  /**
   * Encodes the specified input into the output buffer.
   *
   * @param input - The input buffer.
   * @param startIndex - The starting index of the input buffer.
   * @param length - The length of the input range.
   * @param output - The output buffer.
   * @returns The number of bytes written to the output buffer.
   * @throws {RangeError} The input range is invalid or the output buffer is too small.
   */
  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));
    return this.encodeInternal(input, startIndex, length, output, 0);
  }

  private encodeInternal(input: Uint8Array, startIndex: number, length: number, output: Uint8Array, out: number): number {
    const end = startIndex + length;
    for (let i = startIndex; i < end; i++) {
      let c = input[i]!;
      this.crc.update(c);
      c = (c + 42) & 0xff;

      if (c === 0 || c === 0x09 || c === 0x0d || c === 0x0a || c === 0x3d || c === 0x2e) {
        output[out++] = 0x3d;
        output[out++] = (c + 64) & 0xff;
        this.octets = (this.octets + 2) & 0xff;
      } else {
        output[out++] = c;
        this.octets = (this.octets + 1) & 0xff;
      }

      if (this.octets >= this.lineLength) {
        output[out++] = 0x0a;
        this.octets = 0;
      }
    }

    return out;
  }

  /**
   * Encodes the specified input into the output buffer and flushes internal state.
   *
   * @param input - The input buffer.
   * @param startIndex - The starting index of the input buffer.
   * @param length - The length of the input range.
   * @param output - The output buffer.
   * @returns The number of bytes written to the output buffer.
   * @throws {RangeError} The input range is invalid or the output buffer is too small.
   */
  flush(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));
    let out = 0;
    if (length > 0)
      out = this.encodeInternal(input, startIndex, length, output, out);
    if (this.octets > 0) {
      output[out++] = 0x0a;
      this.octets = 0;
    }
    return out;
  }

  /** Resets the state of the encoder. */
  reset(): void {
    this.crc.reset();
    this.octets = 0;
  }
}
