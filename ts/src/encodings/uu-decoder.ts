/**
 * Port of MimeKit/Encodings/UUDecoder.cs.
 */
import { validateCodecArguments, type MimeDecoder } from './types.js';
import type { ContentEncoding } from '../content-encoding.js';

const enum UUDecoderState {
  ExpectBegin,
  B,
  Be,
  Beg,
  Begi,
  Begin,
  ExpectPayload,
  Payload,
  Ended,
}

function uudecodeRank(c: number): number {
  return (c - 0x20) & 0x3f;
}

/**
 * Incrementally decodes content encoded with Unix-to-Unix encoding.
 *
 * UUEncoding predates MIME and was used to encode binary content so data
 * remained intact over 7-bit transports such as SMTP. It is largely deprecated
 * in favor of base64, though some older mail clients still use it.
 */
export class UUDecoder implements MimeDecoder {
  private readonly initial: UUDecoderState;
  private state: UUDecoderState;
  private nsaved = 0;
  private uulen = 0;
  private saved = 0;

  /**
   * Creates a new Unix-to-Unix decoder.
   *
   * @param payloadOnly - If true, decoding begins immediately rather than after finding a `begin` line.
   */
  constructor(payloadOnly = false) {
    this.initial = payloadOnly ? UUDecoderState.Payload : UUDecoderState.ExpectBegin;
    this.state = this.initial;
  }

  /** The encoding that this decoder supports. */
  get encoding(): ContentEncoding {
    return 'uuencode';
  }

  /**
   * Creates a new UU decoder with exactly the same state as this decoder.
   *
   * @returns A new decoder with identical state.
   */
  clone(): MimeDecoder {
    const decoder = new UUDecoder(this.initial === UUDecoderState.Payload);
    decoder.state = this.state;
    decoder.nsaved = this.nsaved;
    decoder.uulen = this.uulen;
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
    return inputLength + 3;
  }

  private scanBeginMarker(input: Uint8Array, inptr: number, inend: number): number {
    while (inptr < inend) {
      if (this.state === UUDecoderState.ExpectBegin) {
        if (this.nsaved !== 0 && this.nsaved !== 0x0a) {
          while (inptr < inend && input[inptr] !== 0x0a)
            inptr++;

          if (inptr === inend) {
            this.nsaved = input[inptr - 1]!;
            return inptr;
          }

          this.nsaved = input[inptr++]!;
          if (inptr === inend)
            return inptr;
        }

        this.nsaved = input[inptr++]!;
        if (this.nsaved !== 0x62)
          continue;

        this.state = UUDecoderState.B;
        if (inptr === inend)
          return inptr;
      }

      if (this.state === UUDecoderState.B) {
        this.nsaved = input[inptr++]!;
        if (this.nsaved !== 0x65) {
          this.state = UUDecoderState.ExpectBegin;
          continue;
        }

        this.state = UUDecoderState.Be;
        if (inptr === inend)
          return inptr;
      }

      if (this.state === UUDecoderState.Be) {
        this.nsaved = input[inptr++]!;
        if (this.nsaved !== 0x67) {
          this.state = UUDecoderState.ExpectBegin;
          continue;
        }

        this.state = UUDecoderState.Beg;
        if (inptr === inend)
          return inptr;
      }

      if (this.state === UUDecoderState.Beg) {
        this.nsaved = input[inptr++]!;
        if (this.nsaved !== 0x69) {
          this.state = UUDecoderState.ExpectBegin;
          continue;
        }

        this.state = UUDecoderState.Begi;
        if (inptr === inend)
          return inptr;
      }

      if (this.state === UUDecoderState.Begi) {
        this.nsaved = input[inptr++]!;
        if (this.nsaved !== 0x6e) {
          this.state = UUDecoderState.ExpectBegin;
          continue;
        }

        this.state = UUDecoderState.Begin;
        if (inptr === inend)
          return inptr;
      }

      if (this.state === UUDecoderState.Begin) {
        this.nsaved = input[inptr++]!;
        if (this.nsaved !== 0x20) {
          this.state = UUDecoderState.ExpectBegin;
          continue;
        }

        this.state = UUDecoderState.ExpectPayload;
        if (inptr === inend)
          return inptr;
      }

      if (this.state === UUDecoderState.ExpectPayload) {
        while (inptr < inend && input[inptr] !== 0x0a)
          inptr++;

        if (inptr === inend)
          return inptr;

        this.state = UUDecoderState.Payload;
        this.nsaved = 0;

        return inptr + 1;
      }
    }

    return inptr;
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

    if (this.state === UUDecoderState.Ended)
      return 0;

    let lastWasEoln = this.uulen === 0;
    const inend = startIndex + length;
    let outptr = 0;
    let inptr = startIndex;

    if (this.state < UUDecoderState.Payload) {
      inptr = this.scanBeginMarker(input, inptr, inend);
      if (inptr === inend)
        return 0;
    }

    while (inptr < inend) {
      if (input[inptr] === 0x0d) {
        inptr++;
        continue;
      }

      if (input[inptr] === 0x0a) {
        lastWasEoln = true;
        inptr++;
        continue;
      }

      if (this.uulen === 0 || lastWasEoln) {
        this.uulen = uudecodeRank(input[inptr]!);
        lastWasEoln = false;
        if (this.uulen === 0) {
          this.state = UUDecoderState.Ended;
          break;
        }

        inptr++;
        continue;
      }

      const c = input[inptr++]!;

      if (this.uulen > 0) {
        this.saved = (((this.saved << 8) >>> 0) | c) >>> 0;
        this.nsaved++;

        if (this.nsaved === 4) {
          const b0 = (this.saved >>> 24) & 0xff;
          const b1 = (this.saved >>> 16) & 0xff;
          const b2 = (this.saved >>> 8) & 0xff;
          const b3 = this.saved & 0xff;

          if (this.uulen >= 3) {
            output[outptr++] = ((uudecodeRank(b0) << 2) | (uudecodeRank(b1) >> 4)) & 0xff;
            output[outptr++] = ((uudecodeRank(b1) << 4) | (uudecodeRank(b2) >> 2)) & 0xff;
            output[outptr++] = ((uudecodeRank(b2) << 6) | uudecodeRank(b3)) & 0xff;
            this.uulen -= 3;
          } else {
            if (this.uulen >= 1) {
              output[outptr++] = ((uudecodeRank(b0) << 2) | (uudecodeRank(b1) >> 4)) & 0xff;
              this.uulen--;
            }

            if (this.uulen >= 1) {
              output[outptr++] = ((uudecodeRank(b1) << 4) | (uudecodeRank(b2) >> 2)) & 0xff;
              this.uulen--;
            }
          }

          this.nsaved = 0;
          this.saved = 0;
        }
      } else {
        break;
      }
    }

    return outptr;
  }

  /** Resets the state of the decoder. */
  reset(): void {
    this.state = this.initial;
    this.nsaved = 0;
    this.saved = 0;
    this.uulen = 0;
  }
}
