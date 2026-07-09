/**
 * Port of MimeKit/Encodings/PassThroughEncoder.cs.
 */
import type { ContentEncoding } from '../content-encoding.js';
import type { MimeEncoder } from './types.js';
import { validateCodecArguments } from './types.js';

/**
 * A pass-through encoder.
 *
 * Simply copies data as-is from the input buffer into the output buffer.
 */
export class PassThroughEncoder implements MimeEncoder {
  /**
   * Creates a new pass-through encoder.
   *
   * @param encoding - The encoding to expose from this encoder.
   */
  constructor(readonly encoding: ContentEncoding) {
  }

  /**
   * Creates a new pass-through encoder with exactly the same state as this encoder.
   *
   * @returns A new encoder with identical state.
   */
  clone(): MimeEncoder {
    return new PassThroughEncoder(this.encoding);
  }

  /**
   * Estimates the number of bytes needed to encode the specified number of input bytes.
   *
   * @param inputLength - The input length.
   * @returns The estimated output length.
   */
  estimateOutputLength(inputLength: number): number {
    return inputLength;
  }

  /**
   * Copies the input buffer into the output buffer, verbatim.
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
    output.set(input.subarray(startIndex, startIndex + length), 0);
    return length;
  }

  /**
   * Copies the input buffer into the output buffer and flushes internal state.
   *
   * @param input - The input buffer.
   * @param startIndex - The starting index of the input buffer.
   * @param length - The length of the input range.
   * @param output - The output buffer.
   * @returns The number of bytes written to the output buffer.
   */
  flush(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    return this.encode(input, startIndex, length, output);
  }

  /** Resets the state of the encoder. */
  reset(): void {
  }
}
