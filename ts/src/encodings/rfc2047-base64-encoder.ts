import { validateCodecArguments } from './types.js';
import type { Rfc2047Encoder } from './rfc2047-encoder.js';

const base64Alphabet = new Uint8Array([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c) => c.charCodeAt(0)));

export class Rfc2047Base64Encoder implements Rfc2047Encoder {
  readonly encoding = 'b' as const;

  estimateOutputLength(inputLength: number): number {
    return Math.floor((inputLength + 2) / 3) * 4;
  }

  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));

    const inend = startIndex + length;
    let i = startIndex;
    let out = 0;

    while (i + 2 < inend) {
      const c1 = input[i++]!;
      const c2 = input[i++]!;
      const c3 = input[i++]!;

      output[out++] = base64Alphabet[c1 >> 2]!;
      output[out++] = base64Alphabet[(c2 >> 4) | ((c1 & 0x03) << 4)]!;
      output[out++] = base64Alphabet[((c2 & 0x0f) << 2) | (c3 >> 6)]!;
      output[out++] = base64Alphabet[c3 & 0x3f]!;
    }

    const remaining = inend - i;
    if (remaining === 2) {
      const c1 = input[i++]!;
      const c2 = input[i]!;

      output[out++] = base64Alphabet[c1 >> 2]!;
      output[out++] = base64Alphabet[(c2 >> 4) | ((c1 & 0x03) << 4)]!;
      output[out++] = base64Alphabet[(c2 & 0x0f) << 2]!;
      output[out++] = 0x3d;
    } else if (remaining === 1) {
      const c1 = input[i]!;

      output[out++] = base64Alphabet[c1 >> 2]!;
      output[out++] = base64Alphabet[(c1 & 0x03) << 4]!;
      output[out++] = 0x3d;
      output[out++] = 0x3d;
    }

    return out;
  }
}
