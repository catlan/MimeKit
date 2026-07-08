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

export class HexDecoder implements MimeDecoder {
  readonly encoding: ContentEncoding = 'default';
  private state = HexDecoderState.PassThrough;
  private saved = 0;

  clone(): MimeDecoder {
    const decoder = new HexDecoder();
    decoder.state = this.state;
    decoder.saved = this.saved;
    return decoder;
  }

  estimateOutputLength(inputLength: number): number {
    switch (this.state) {
      case HexDecoderState.PassThrough: return inputLength;
      case HexDecoderState.Percent: return inputLength + 1;
      default: return inputLength + 2;
    }
  }

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

  reset(): void {
    this.state = HexDecoderState.PassThrough;
    this.saved = 0;
  }
}
