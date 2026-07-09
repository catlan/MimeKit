import { QEncoder, QEncodeMode } from './q-encoder.js';
import type { Rfc2047Encoder } from './rfc2047-encoder.js';

export { QEncodeMode };

/**
 * Encodes content using the RFC 2047 variant of quoted-printable.
 *
 * The RFC 2047 "Q" encoding is often used in MIME to encode textual content
 * outside the ASCII range within an encoded-word token so the text remains
 * intact over 7-bit transports such as SMTP.
 */
export class Rfc2047QuotedPrintableEncoder implements Rfc2047Encoder {
  /**
   * The RFC 2047 encoding method.
   *
   * RFC 2047 encoded-word tokens support base64 (`b`) and quoted-printable (`q`).
   */
  readonly encoding = 'q' as const;
  private readonly encoder: QEncoder;

  /**
   * Creates a new RFC 2047 quoted-printable encoder.
   *
   * @param mode - The RFC 2047 encoding mode.
   */
  constructor(mode: QEncodeMode) {
    this.encoder = new QEncoder(mode);
  }

  /**
   * Estimates the number of bytes needed to encode the specified number of input bytes.
   *
   * @param inputLength - The input length.
   * @returns The estimated output length.
   */
  estimateOutputLength(inputLength: number): number {
    return this.encoder.estimateOutputLength(inputLength);
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
    return this.encoder.encode(input, startIndex, length, output);
  }
}
