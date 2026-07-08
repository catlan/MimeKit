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

export interface MimeEncoder {
  /** The encoding that the encoder supports. */
  readonly encoding: ContentEncoding;

  /** Create a new encoder with exactly the same state as this one. */
  clone(): MimeEncoder;

  /** Estimate the output byte count for `inputLength` input bytes. */
  estimateOutputLength(inputLength: number): number;

  /**
   * Encode `length` bytes of `input` starting at `startIndex` into `output`.
   * Returns the number of bytes written. `output` must be at least
   * `estimateOutputLength(length)` bytes.
   */
  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number;

  /** Like `encode`, but also flushes any internal buffer state. */
  flush(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number;

  /** Reset the encoder to its initial state. */
  reset(): void;
}

export interface MimeDecoder {
  /** The encoding that the decoder supports. */
  readonly encoding: ContentEncoding;

  /** Create a new decoder with exactly the same state as this one. */
  clone(): MimeDecoder;

  /** Estimate the output byte count for `inputLength` input bytes. */
  estimateOutputLength(inputLength: number): number;

  /**
   * Decode `length` bytes of `input` starting at `startIndex` into `output`.
   * Returns the number of bytes written. `output` must be at least
   * `estimateOutputLength(length)` bytes.
   */
  decode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number;

  /** Reset the decoder to its initial state. */
  reset(): void;
}

/** Shared argument validation for codec implementations (C#: ValidateArguments). */
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
