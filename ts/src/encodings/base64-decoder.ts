/**
 * Port of MimeKit/Encodings/Base64Decoder.cs.
 *
 * This preserves MimeKit's permissive scalar decoder: non-base64 bytes are
 * ignored, and '=' participates in quartets with rank 0.
 */
import { validateCodecArguments, type MimeDecoder } from './types.js';
import type { ContentEncoding } from '../content-encoding.js';

const base64Rank = new Uint8Array([
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 62, 255, 255, 255, 63,
  52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 255, 255, 255, 0, 255, 255,
  255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 255, 255, 255, 255, 255,
  255, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
]);

export class Base64Decoder implements MimeDecoder {
  private previous = 0;
  private saved = 0;
  private bytes = 0;

  get encoding(): ContentEncoding {
    return 'base64';
  }

  clone(): MimeDecoder {
    const clone = new Base64Decoder();
    clone.previous = this.previous;
    clone.saved = this.saved;
    clone.bytes = this.bytes;
    return clone;
  }

  estimateOutputLength(inputLength: number): number {
    return (Math.trunc(inputLength / 4) * 3) + 3;
  }

  decode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));
    return this.decodeInternal(input, startIndex, startIndex + length, output);
  }

  reset(): void {
    this.previous = 0;
    this.saved = 0;
    this.bytes = 0;
  }

  private decodeInternal(input: Uint8Array, startIndex: number, end: number, output: Uint8Array): number {
    let outIndex = 0;

    for (let inIndex = startIndex; inIndex < end; inIndex++) {
      const c = input[inIndex]!;
      const rank = base64Rank[c]!;

      if (rank !== 0xff) {
        this.previous = ((this.previous << 8) | c) >>> 0;
        this.saved = ((this.saved << 6) | rank) >>> 0;
        this.bytes++;

        if (this.bytes === 4) {
          if ((this.previous & 0xff0000) !== (61 << 16)) {
            output[outIndex++] = (this.saved >> 16) & 0xff;
            if ((this.previous & 0xff00) !== (61 << 8)) {
              output[outIndex++] = (this.saved >> 8) & 0xff;
              if ((this.previous & 0xff) !== 61)
                output[outIndex++] = this.saved & 0xff;
            }
          }
          this.saved = 0;
          this.bytes = 0;
        }
      }
    }

    return outIndex;
  }
}
