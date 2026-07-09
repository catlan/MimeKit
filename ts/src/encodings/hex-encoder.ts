/**
 * Port of MimeKit/Encodings/HexEncoder.cs.
 *
 * Upstream marks this obsolete, but ParameterList still uses it in this port
 * plan's scope.
 */
import type { ContentEncoding } from '../content-encoding.js';
import type { MimeEncoder } from './types.js';
import { validateCodecArguments } from './types.js';

const hexAlphabet = new Uint8Array([0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46]);
const tokenSpecials = new Set([...`()<>@,;:\\"/[]?=`].map((c) => c.charCodeAt(0)));
const attrSpecials = new Set([0x2a, 0x27, 0x25]);

function isAttr(c: number): boolean {
  return c > 32 && c < 127 && !tokenSpecials.has(c) && !attrSpecials.has(c);
}

/**
 * Incrementally encodes content using URI-style hex encoding.
 *
 * This is mostly meant for encoding parameter values using the rules specified
 * by RFC 2184 and RFC 2231.
 */
export class HexEncoder implements MimeEncoder {
  /** The encoding that this encoder supports. */
  readonly encoding: ContentEncoding = 'default';

  /**
   * Creates a new hex encoder with exactly the same state as this encoder.
   *
   * @returns A new encoder with identical state.
   */
  clone(): MimeEncoder {
    return new HexEncoder();
  }

  /**
   * Estimates the number of bytes needed to encode the specified number of input bytes.
   *
   * @param inputLength - The input length.
   * @returns The estimated output length.
   */
  estimateOutputLength(inputLength: number): number {
    return inputLength * 3;
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

    let out = 0;
    const end = startIndex + length;
    for (let i = startIndex; i < end; i++) {
      const c = input[i]!;
      if (isAttr(c)) {
        output[out++] = c;
      } else {
        output[out++] = 0x25;
        output[out++] = hexAlphabet[(c >> 4) & 0x0f]!;
        output[out++] = hexAlphabet[c & 0x0f]!;
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
   */
  flush(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    return this.encode(input, startIndex, length, output);
  }

  /** Resets the state of the encoder. */
  reset(): void {
  }
}
