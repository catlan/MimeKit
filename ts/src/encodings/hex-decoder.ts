/**
 * Port of MimeKit/Encodings/HexDecoder.cs.
 */
import type { ContentEncoding } from '../content-encoding.js';
import type { MimeDecoder } from './types.js';
import { validateCodecArguments } from './types.js';

const enum HexDecoderState {
  PassThrough,
  Percent,
  DecodeByte,
}

function isXDigit(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
}

function toXDigit(c: number): number {
  if (c >= 0x41)
    return c >= 0x61 ? c - (0x61 - 0x0a) : c - (0x41 - 0x0a);
  return c - 0x30;
}

/**
 * Incrementally decodes content encoded with URI-style hex encoding.
 *
 * This is mostly meant for decoding parameter values encoded using the rules
 * specified by RFC 2184 and RFC 2231.
 */
export class HexDecoder implements MimeDecoder {
  /** The encoding that this decoder supports. */
  readonly encoding: ContentEncoding = 'default';
  private state = HexDecoderState.PassThrough;
  private saved = 0;

  /**
   * Creates a new hex decoder with exactly the same state as this decoder.
   *
   * @returns A new decoder with identical state.
   */
  clone(): MimeDecoder {
    const decoder = new HexDecoder();
    decoder.state = this.state;
    decoder.saved = this.saved;
    return decoder;
  }

  /**
   * Estimates the number of bytes needed to decode the specified number of input bytes.
   *
   * @param inputLength - The input length.
   * @returns The estimated output length.
   */
  estimateOutputLength(inputLength: number): number {
    switch (this.state) {
      case HexDecoderState.PassThrough: return inputLength;
      case HexDecoderState.Percent: return inputLength + 1;
      default: return inputLength + 2;
    }
  }

  /**
   * Decodes the specified input into the output buffer.
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

    let out = 0;
    let i = startIndex;
    const end = startIndex + length;
    while (i < end) {
      switch (this.state) {
        case HexDecoderState.PassThrough:
          while (i < end) {
            const c = input[i++]!;
            if (c === 0x25) {
              this.state = HexDecoderState.Percent;
              break;
            }
            output[out++] = c;
          }
          break;
        case HexDecoderState.Percent:
          this.saved = input[i++]!;
          this.state = HexDecoderState.DecodeByte;
          break;
        case HexDecoderState.DecodeByte: {
          const c = input[i++]!;
          if (isXDigit(c) && isXDigit(this.saved)) {
            output[out++] = (toXDigit(this.saved) << 4) | toXDigit(c);
          } else {
            output[out++] = 0x25;
            output[out++] = this.saved;
            output[out++] = c;
          }
          this.state = HexDecoderState.PassThrough;
          break;
        }
      }
    }

    return out;
  }

  /** Resets the state of the decoder. */
  reset(): void {
    this.state = HexDecoderState.PassThrough;
    this.saved = 0;
  }
}
