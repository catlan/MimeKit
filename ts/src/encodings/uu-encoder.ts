/**
 * Port of MimeKit/Encodings/UUEncoder.cs.
 */
import { validateCodecArguments, type MimeEncoder } from './types.js';
import type { ContentEncoding } from '../content-encoding.js';

const maxInputPerLine = 45;
const maxOutputPerLine = ((maxInputPerLine / 3) * 4) + 2;

function encodeChar(c: number): number {
  return c !== 0 ? c + 0x20 : 0x60;
}

function encodeLine(input: Uint8Array, length: number, output: Uint8Array, offset: number): number {
  let outptr = offset;

  output[outptr++] = encodeChar(length);

  for (let i = 0; i < length; i += 3) {
    const b0 = input[i] ?? 0;
    const b1 = i + 1 < length ? input[i + 1]! : 0;
    const b2 = i + 2 < length ? input[i + 2]! : 0;

    output[outptr++] = encodeChar((b0 >> 2) & 0x3f);
    output[outptr++] = encodeChar(((b0 << 4) | ((b1 >> 4) & 0x0f)) & 0x3f);
    output[outptr++] = encodeChar(((b1 << 2) | ((b2 >> 6) & 0x03)) & 0x3f);
    output[outptr++] = encodeChar(b2 & 0x3f);
  }

  output[outptr++] = 0x0a;

  return outptr - offset;
}

export class UUEncoder implements MimeEncoder {
  private readonly linebuf = new Uint8Array(maxInputPerLine);
  private uulen = 0;

  get encoding(): ContentEncoding {
    return 'uuencode';
  }

  clone(): MimeEncoder {
    const encoder = new UUEncoder();
    encoder.linebuf.set(this.linebuf);
    encoder.uulen = this.uulen;
    return encoder;
  }

  estimateOutputLength(inputLength: number): number {
    return (Math.trunc((inputLength + 2) / maxInputPerLine) * maxOutputPerLine) + maxOutputPerLine + 2;
  }

  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));

    let inptr = startIndex;
    const inend = startIndex + length;
    let outptr = 0;

    while (inptr < inend) {
      const n = Math.min(maxInputPerLine - this.uulen, inend - inptr);
      this.linebuf.set(input.subarray(inptr, inptr + n), this.uulen);
      this.uulen += n;
      inptr += n;

      if (this.uulen === maxInputPerLine) {
        outptr += encodeLine(this.linebuf, this.uulen, output, outptr);
        this.uulen = 0;
      }
    }

    return outptr;
  }

  flush(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));

    let outptr = 0;

    if (length > 0)
      outptr += this.encode(input, startIndex, length, output);

    if (this.uulen > 0) {
      outptr += encodeLine(this.linebuf, this.uulen, output, outptr);
      this.uulen = 0;
    }

    output[outptr++] = encodeChar(0);
    output[outptr++] = 0x0a;

    this.reset();

    return outptr;
  }

  reset(): void {
    this.uulen = 0;
  }
}
