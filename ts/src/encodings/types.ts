/**
 * Port of MimeKit/Encodings/IMimeEncoder.cs and IMimeDecoder.cs.
 *
 * Encoders/decoders are incremental: `encode`/`decode` may buffer partial
 * units (e.g. a base64 quartet) across calls; `flush` finalizes encoder
 * state. Buffer-and-index signatures are kept 1:1 with the C# so ported
 * algorithm code stays diffable against upstream.
 *
 * Contract violations (invalid ranges, undersized output buffers) throw
 * `RangeError` — these are programmer errors, not data errors, matching the
 * C# ArgumentException family per the port's error model.
 */
import type { ContentEncoding } from '../content-encoding.js';

/** An interface for incrementally encoding content. */
export interface MimeEncoder {
  /** The encoding that the encoder supports. */
  readonly encoding: ContentEncoding;

  /**
   * Creates a new encoder with exactly the same state as this encoder.
   *
   * @returns A new encoder with identical state.
   */
  clone(): MimeEncoder;

  /**
   * Estimates the number of bytes needed to encode the specified number of input bytes.
   *
   * @param inputLength - The input length.
   * @returns The estimated output length.
   */
  estimateOutputLength(inputLength: number): number;

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
  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number;

  /**
   * Encodes the specified input into the output buffer and flushes internal state.
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
  flush(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number;

  /** Resets the state of the encoder. */
  reset(): void;
}

/** An interface for incrementally decoding content. */
export interface MimeDecoder {
  /** The encoding that the decoder supports. */
  readonly encoding: ContentEncoding;

  /**
   * Creates a new decoder with exactly the same state as this decoder.
   *
   * @returns A new decoder with identical state.
   */
  clone(): MimeDecoder;

  /**
   * Estimates the number of bytes needed to decode the specified number of input bytes.
   *
   * @param inputLength - The input length.
   * @returns The estimated output length.
   */
  estimateOutputLength(inputLength: number): number;

  /**
   * Decodes the specified input into the output buffer.
   *
   * The output buffer should be large enough to hold all decoded input. Use
   * {@link estimateOutputLength} to estimate the required size.
   *
   * @param input - The input buffer.
   * @param startIndex - The starting index of the input buffer.
   * @param length - The length of the input range.
   * @param output - The output buffer.
   * @returns The number of bytes written to the output buffer.
   * @throws {RangeError} The input range is invalid or the output buffer is too small.
   */
  decode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number;

  /** Resets the state of the decoder. */
  reset(): void;
}

/**
 * Validates the shared buffer and range contract for codec implementations.
 *
 * @param input - The input buffer.
 * @param startIndex - The starting index of the input buffer.
 * @param length - The length of the input range.
 * @param output - The output buffer.
 * @param estimatedOutputLength - The required output buffer length.
 * @throws {RangeError} The input range is invalid or the output buffer is too small.
 */
export function validateCodecArguments(
  input: Uint8Array,
  startIndex: number,
  length: number,
  output: Uint8Array,
  estimatedOutputLength: number,
): void {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > input.length)
    throw new RangeError(`startIndex ${startIndex} out of range [0, ${input.length}]`);
  if (!Number.isInteger(length) || length < 0 || length > input.length - startIndex)
    throw new RangeError(`length ${length} out of range [0, ${input.length - startIndex}]`);
  if (output.length < estimatedOutputLength)
    throw new RangeError(`output buffer too small: ${output.length} < ${estimatedOutputLength} (use estimateOutputLength)`);
}
