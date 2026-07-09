import { validateCodecArguments, type MimeDecoder } from './types.js';
import type { ContentEncoding } from '../content-encoding.js';

const enum QpDecoderState {
  PassThrough,
  EqualSign,
  SoftBreak,
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
 * Incrementally decodes content encoded with the quoted-printable encoding.
 *
 * Quoted-printable is often used in MIME for textual content outside the ASCII
 * range so that text remains intact over 7-bit transports such as SMTP.
 */
export class QuotedPrintableDecoder implements MimeDecoder {
  /** The encoding that this decoder supports. */
  readonly encoding: ContentEncoding = 'quoted-printable';
  private readonly rfc2047: boolean;
  private state = QpDecoderState.PassThrough;
  private saved = 0;

  /**
   * Creates a new quoted-printable decoder.
   *
   * @param rfc2047 - Whether this decoder will decode RFC 2047 encoded-word tokens.
   */
  constructor(rfc2047 = false) {
    this.rfc2047 = rfc2047;
  }

  /**
   * Creates a new quoted-printable decoder with exactly the same state as this decoder.
   *
   * @returns A new decoder with identical state.
   */
  clone(): QuotedPrintableDecoder {
    const clone = new QuotedPrintableDecoder(this.rfc2047);
    clone.state = this.state;
    clone.saved = this.saved;
    return clone;
  }

  /**
   * Estimates the number of bytes needed to decode the specified number of input bytes.
   *
   * @param inputLength - The input length.
   * @returns The estimated output length.
   */
  estimateOutputLength(inputLength: number): number {
    switch (this.state) {
      case QpDecoderState.PassThrough: return inputLength;
      case QpDecoderState.EqualSign: return inputLength + 1;
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

    const inend = startIndex + length;
    let i = startIndex;
    let out = 0;

    while (i < inend) {
      switch (this.state) {
        case QpDecoderState.PassThrough:
          while (i < inend) {
            const c = input[i++]!;

            if (c === 0x3d) {
              this.state = QpDecoderState.EqualSign;
              break;
            } else if (this.rfc2047 && c === 0x5f) {
              output[out++] = 0x20;
            } else {
              output[out++] = c;
            }
          }
          break;
        case QpDecoderState.EqualSign: {
          const c = input[i++]!;

          if (isXDigit(c)) {
            this.state = QpDecoderState.DecodeByte;
            this.saved = c;
          } else if (c === 0x3d) {
            output[out++] = 0x3d;
          } else if (c === 0x0d) {
            this.state = QpDecoderState.SoftBreak;
          } else if (c === 0x0a) {
            this.state = QpDecoderState.PassThrough;
          } else {
            this.state = QpDecoderState.PassThrough;
            output[out++] = 0x3d;
            output[out++] = c;
          }
          break;
        }
        case QpDecoderState.SoftBreak: {
          this.state = QpDecoderState.PassThrough;
          const c = input[i++]!;

          if (c !== 0x0a) {
            output[out++] = 0x3d;
            output[out++] = 0x0d;
            output[out++] = c;
          }
          break;
        }
        case QpDecoderState.DecodeByte: {
          const c = input[i++]!;
          if (isXDigit(c)) {
            output[out++] = (toXDigit(this.saved) << 4) | toXDigit(c);
          } else {
            output[out++] = 0x3d;
            output[out++] = this.saved;
            output[out++] = c;
          }

          this.state = QpDecoderState.PassThrough;
          break;
        }
      }
    }

    return out;
  }

  /** Resets the state of the decoder. */
  reset(): void {
    this.state = QpDecoderState.PassThrough;
    this.saved = 0;
  }
}
