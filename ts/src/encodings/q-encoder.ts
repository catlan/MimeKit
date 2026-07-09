import { validateCodecArguments, type MimeEncoder } from './types.js';
import type { ContentEncoding } from '../content-encoding.js';

const hexAlphabet = new Uint8Array([...'0123456789ABCDEF'].map((c) => c.charCodeAt(0)));

/**
 * Q-encoding mode for RFC 2047 encoded-word tokens.
 */
export const enum QEncodeMode {
  /** A mode for encoding phrases, as defined by RFC 822. */
  Phrase = 'phrase',
  /** A mode for encoding text. */
  Text = 'text',
}

function isEncodedWordSafe(c: number): boolean {
  return c >= 0x20 && c < 0x7f && c !== 0x3d && !'()<>@,;:"/[]?.=_'.includes(String.fromCharCode(c));
}

function isEncodedPhraseSafe(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) ||
    (c >= 0x41 && c <= 0x5a) ||
    (c >= 0x61 && c <= 0x7a) ||
    c === 0x21 || c === 0x2a || c === 0x2b || c === 0x2d || c === 0x2f;
}

/**
 * Incrementally encodes content using the RFC 2047 variant of quoted-printable.
 *
 * Q-encoding is often used in MIME to encode textual content outside the ASCII
 * range within an RFC 2047 encoded-word token so the text remains intact over
 * 7-bit transports such as SMTP.
 */
export class QEncoder implements MimeEncoder {
  /** The encoding that this encoder supports. */
  readonly encoding: ContentEncoding = 'quoted-printable';
  private readonly mode: QEncodeMode;

  /**
   * Creates a new RFC 2047 quoted-printable encoder.
   *
   * @param mode - The RFC 2047 encoding mode.
   */
  constructor(mode: QEncodeMode) {
    this.mode = mode;
  }

  /**
   * Creates a new Q encoder with exactly the same state as this encoder.
   *
   * @returns A new encoder with identical state.
   */
  clone(): QEncoder {
    return new QEncoder(this.mode);
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

  private isSafe(c: number): boolean {
    return this.mode === QEncodeMode.Phrase ? isEncodedPhraseSafe(c) : isEncodedWordSafe(c);
  }

  private encodeInternal(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    const inend = startIndex + length;
    let out = 0;

    for (let i = startIndex; i < inend; i++) {
      const c = input[i]!;

      if (c === 0x20) {
        output[out++] = 0x5f;
      } else if (this.isSafe(c)) {
        output[out++] = c;
      } else {
        output[out++] = 0x3d;
        output[out++] = hexAlphabet[(c >> 4) & 0x0f]!;
        output[out++] = hexAlphabet[c & 0x0f]!;
      }
    }

    return out;
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
    return this.encodeInternal(input, startIndex, length, output);
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
    return this.encodeInternal(input, startIndex, length, output);
  }

  /** Resets the state of the encoder. */
  reset(): void {
  }
}
