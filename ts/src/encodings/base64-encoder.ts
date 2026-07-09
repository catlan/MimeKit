/**
 * Port of MimeKit/Encodings/Base64Encoder.cs.
 *
 * This is the scalar reference path only; upstream's unsafe/SIMD fast paths are
 * intentionally omitted for the isomorphic TypeScript core.
 */
import { validateCodecArguments, type MimeEncoder } from './types.js';
import type { ContentEncoding } from '../content-encoding.js';

const base64Alphabet = new Uint8Array([
  65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
  97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
  110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122,
  48, 49, 50, 51, 52, 53, 54, 55, 56, 57,
  43, 47,
]);

const minimumLineLength = 60;
const maximumLineLength = 998;

/**
 * Incrementally encodes content using the base64 encoding.
 *
 * Base64 is often used in MIME to encode binary content such as images and
 * other multimedia so that data remains intact over 7-bit transports such as
 * SMTP.
 */
export class Base64Encoder implements MimeEncoder {
  private readonly quartetsPerLine: number;
  private quartets = 0;
  private saved1 = 0;
  private saved2 = 0;
  private saved = 0;

  /**
   * Creates a new base64 encoder.
   *
   * Values over 76 octets are capped at 76 unless line length limits are
   * explicitly overridden.
   *
   * @param maxLineLength - The maximum number of octets per line, not counting the line break.
   * @param overrideMaxLineLengthLimits - Whether to bypass the normal MIME line-length limits.
   * @throws {RangeError} `maxLineLength` is outside the supported range.
   */
  constructor(maxLineLength = 76, overrideMaxLineLengthLimits = false) {
    if (!overrideMaxLineLengthLimits) {
      if (!Number.isInteger(maxLineLength) || maxLineLength < minimumLineLength || maxLineLength > maximumLineLength)
        throw new RangeError('maxLineLength out of range [60, 998]');

      // RFC 2045 requires base64 lines to be no longer than 76 octets.
      maxLineLength = Math.min(maxLineLength, 76);
    }

    this.quartetsPerLine = Math.trunc(maxLineLength / 4);
  }

  /** The encoding that this encoder supports. */
  get encoding(): ContentEncoding {
    return 'base64';
  }

  /**
   * Creates a new base64 encoder with exactly the same state as this encoder.
   *
   * @returns A new encoder with identical state.
   */
  clone(): MimeEncoder {
    // C# Clone() uses the PUBLIC validating constructor: an encoder built via
    // the internal override ctor re-clamps (or throws) on clone. Mirror that.
    const clone = new Base64Encoder(this.quartetsPerLine * 4);
    clone.quartets = this.quartets;
    clone.saved1 = this.saved1;
    clone.saved2 = this.saved2;
    clone.saved = this.saved;
    return clone;
  }

  /**
   * Estimates the number of bytes needed to encode the specified number of input bytes.
   *
   * @param inputLength - The input length.
   * @returns The estimated output length.
   */
  estimateOutputLength(inputLength: number): number {
    const maxLineLength = (this.quartetsPerLine * 4) + 1;
    const maxInputPerLine = this.quartetsPerLine * 3;
    return (Math.trunc((inputLength + 2) / maxInputPerLine) * maxLineLength) + maxLineLength;
  }

  /**
   * Encodes the specified input into the output buffer.
   *
   * The output buffer should be large enough to hold all encoded input. Use
   * {@link estimateOutputLength} to estimate the required size.
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

    let outIndex = 0;
    if (length > 0)
      outIndex += this.encodeInternal(input, startIndex, length, output, outIndex);

    if (this.saved >= 1) {
      const c1 = this.saved1;
      const c2 = this.saved2;

      output[outIndex++] = base64Alphabet[c1 >> 2]!;
      output[outIndex++] = base64Alphabet[(c2 >> 4) | ((c1 & 0x03) << 4)]!;
      output[outIndex++] = this.saved === 2 ? base64Alphabet[(c2 & 0x0f) << 2]! : 61;
      output[outIndex++] = 61;
      this.quartets++;
      this.saved = 0;
    }

    if (this.quartets > 0) {
      output[outIndex++] = 10;
      this.quartets = 0;
    }

    return outIndex;
  }

  /** Resets the state of the encoder. */
  reset(): void {
    this.quartets = 0;
    this.saved1 = 0;
    this.saved2 = 0;
    this.saved = 0;
  }

  private encodeInternal(input: Uint8Array, startIndex: number, length: number, output: Uint8Array, outputIndex: number): number {
    let inIndex = startIndex;
    const end = startIndex + length;
    let outIndex = outputIndex;

    if (length + this.saved > 2) {
      let c1 = this.saved < 1 ? input[inIndex++]! : this.saved1;
      let c2 = this.saved < 2 ? input[inIndex++]! : this.saved2;
      let c3 = input[inIndex++]!;

      do {
        output[outIndex++] = base64Alphabet[c1 >> 2]!;
        output[outIndex++] = base64Alphabet[(c2 >> 4) | ((c1 & 0x03) << 4)]!;
        output[outIndex++] = base64Alphabet[((c2 & 0x0f) << 2) | (c3 >> 6)]!;
        output[outIndex++] = base64Alphabet[c3 & 0x3f]!;

        if (++this.quartets >= this.quartetsPerLine) {
          output[outIndex++] = 10;
          this.quartets = 0;
        }

        if (inIndex + 2 >= end)
          break;

        c1 = input[inIndex++]!;
        c2 = input[inIndex++]!;
        c3 = input[inIndex++]!;
      } while (true);

      this.saved = 0;
    }

    const remaining = end - inIndex;
    if (remaining > 0) {
      if (this.saved === 0) {
        this.saved = remaining;
        this.saved1 = input[inIndex++]!;
        this.saved2 = remaining === 2 ? input[inIndex]! : 0;
      } else {
        this.saved2 = input[inIndex]!;
        this.saved = 2;
      }
    }

    return outIndex - outputIndex;
  }
}
