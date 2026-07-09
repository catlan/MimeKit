/**
 * Port of MimeKit/Encodings/PassThroughDecoder.cs.
 */
import type { ContentEncoding } from '../content-encoding.js';
import type { MimeDecoder } from './types.js';
import { validateCodecArguments } from './types.js';

/**
 * A pass-through decoder.
 *
 * Simply copies data as-is from the input buffer into the output buffer.
 */
export class PassThroughDecoder implements MimeDecoder {
  /**
   * Creates a new pass-through decoder.
   *
   * @param encoding - The encoding to expose from this decoder.
   */
  constructor(readonly encoding: ContentEncoding) {
  }

  /**
   * Creates a new pass-through decoder with exactly the same state as this decoder.
   *
   * @returns A new decoder with identical state.
   */
  clone(): MimeDecoder {
    return new PassThroughDecoder(this.encoding);
  }

  /**
   * Estimates the number of bytes needed to decode the specified number of input bytes.
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
  decode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));
    output.set(input.subarray(startIndex, startIndex + length), 0);
    return length;
  }

  /** Resets the state of the decoder. */
  reset(): void {
  }
}
