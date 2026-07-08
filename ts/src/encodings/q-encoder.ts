import { validateCodecArguments, type MimeEncoder } from './types.js';
import type { ContentEncoding } from '../content-encoding.js';

const hexAlphabet = new Uint8Array([...'0123456789ABCDEF'].map((c) => c.charCodeAt(0)));

export const enum QEncodeMode {
  Phrase = 'phrase',
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

export class QEncoder implements MimeEncoder {
  readonly encoding: ContentEncoding = 'quoted-printable';
  private readonly mode: QEncodeMode;

  constructor(mode: QEncodeMode) {
    this.mode = mode;
  }

  clone(): QEncoder {
    return new QEncoder(this.mode);
  }

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

  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));
    return this.encodeInternal(input, startIndex, length, output);
  }

  flush(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));
    return this.encodeInternal(input, startIndex, length, output);
  }

  reset(): void {
  }
}
