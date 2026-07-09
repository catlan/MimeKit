import { validateCodecArguments, type MimeEncoder } from './types.js';
import type { ContentEncoding } from '../content-encoding.js';

const hexAlphabet = new Uint8Array([...'0123456789ABCDEF'].map((c) => c.charCodeAt(0)));
const minimumLineLength = 60;
const maximumLineLength = 998;

function isBlank(c: number): boolean {
  return c === 0x09 || c === 0x20;
}

function isQpSafe(c: number): boolean {
  return c === 0x09 || (c >= 0x20 && c < 0x7f && c !== 0x3d);
}

/**
 * Incrementally encodes content using the quoted-printable encoding.
 *
 * Quoted-printable is often used in MIME to encode textual content outside the
 * ASCII range so that text remains intact over 7-bit transports such as SMTP.
 */
export class QuotedPrintableEncoder implements MimeEncoder {
  /** The encoding that this encoder supports. */
  readonly encoding: ContentEncoding = 'quoted-printable';
  private readonly tripletsPerLine: number;
  private readonly maxLineLength: number;
  private currentLineLength = 0;
  private saved = -1;

  /**
   * Creates a new quoted-printable encoder.
   *
   * Values over 76 octets are capped at 76.
   *
   * @param maxLineLength - The maximum number of octets per line, not counting the line break.
   * @throws {RangeError} `maxLineLength` is outside the supported range.
   */
  constructor(maxLineLength = 76) {
    if (!Number.isInteger(maxLineLength) || maxLineLength < minimumLineLength || maxLineLength > maximumLineLength)
      throw new RangeError('maxLineLength must be between 60 and 998');

    maxLineLength = Math.min(maxLineLength, 76);
    this.tripletsPerLine = Math.floor(maxLineLength / 3);
    this.maxLineLength = maxLineLength;
    this.reset();
  }

  /**
   * Creates a new quoted-printable encoder with exactly the same state as this encoder.
   *
   * @returns A new encoder with identical state.
   */
  clone(): QuotedPrintableEncoder {
    const clone = new QuotedPrintableEncoder(this.maxLineLength);
    clone.currentLineLength = this.currentLineLength;
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
    if (this.saved !== -1)
      inputLength++;

    return (Math.floor(inputLength / this.tripletsPerLine) * (this.maxLineLength + 1)) +
      ((inputLength % this.tripletsPerLine) * 3) + 2;
  }

  private validateArguments(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): void {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));
  }

  private writeHex(output: Uint8Array, out: number, c: number): number {
    output[out++] = 0x3d;
    output[out++] = hexAlphabet[(c >> 4) & 0x0f]!;
    output[out++] = hexAlphabet[c & 0x0f]!;
    return out;
  }

  private encodeInternal(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    const inend = startIndex + length;
    let out = 0;

    for (let i = startIndex; i < inend; i++) {
      const c = input[i]!;

      if (c === 0x0d) {
        if (this.saved !== -1) {
          const b = this.saved;

          if (isBlank(b) || !isQpSafe(b)) {
            out = this.writeHex(output, out, b);
            this.currentLineLength += 3;
          } else {
            output[out++] = b;
            this.currentLineLength++;
          }
        }

        this.saved = c;
      } else if (c === 0x0a) {
        if (this.saved !== -1 && this.saved !== 0x0d) {
          const b = this.saved;

          if (isBlank(b) || !isQpSafe(b))
            out = this.writeHex(output, out, b);
          else
            output[out++] = b;
        }

        output[out++] = 0x0a;
        this.currentLineLength = 0;
        this.saved = -1;
      } else {
        if (this.saved !== -1) {
          const b = this.saved;

          if (isQpSafe(b)) {
            output[out++] = b;
            this.currentLineLength++;
          } else {
            out = this.writeHex(output, out, b);
            this.currentLineLength += 3;
          }

          if (this.currentLineLength + 1 >= this.maxLineLength) {
            output[out++] = 0x3d;
            output[out++] = 0x0a;
            this.currentLineLength = 0;
          }
        }

        this.saved = c;
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
    this.validateArguments(input, startIndex, length, output);
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
    this.validateArguments(input, startIndex, length, output);

    let out = 0;
    if (length > 0)
      out += this.encodeInternal(input, startIndex, length, output);

    if (this.saved !== -1) {
      const c = this.saved;

      if (isBlank(c) || !isQpSafe(c))
        out = this.writeHex(output, out, c);
      else
        output[out++] = c;

      output[out++] = 0x3d;
      output[out++] = 0x0a;
    }

    this.reset();
    return out;
  }

  /** Resets the state of the encoder. */
  reset(): void {
    this.currentLineLength = 0;
    this.saved = -1;
  }
}
