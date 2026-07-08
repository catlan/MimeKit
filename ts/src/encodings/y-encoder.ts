/**
 * Port of MimeKit/Encodings/YEncoder.cs.
 */
import type { ContentEncoding } from '../content-encoding.js';
import { Crc32 } from '../utils/crc32.js';
import type { MimeEncoder } from './types.js';
import { validateCodecArguments } from './types.js';

export class YEncoder implements MimeEncoder {
  readonly encoding: ContentEncoding = 'default';
  private octets = 0;
  private crc: Crc32;

  constructor(private readonly lineLength = 128) {
    if (lineLength < 60 || lineLength > 998)
      throw new RangeError('maxLineLength must be within the range of 60 to 998');
    this.crc = new Crc32(-1);
    this.reset();
  }

  get checksum(): number {
    return this.crc.checksum;
  }

  clone(): MimeEncoder {
    const encoder = new YEncoder(this.lineLength);
    encoder.crc = this.crc.clone();
    encoder.octets = this.octets;
    return encoder;
  }

  estimateOutputLength(inputLength: number): number {
    return (inputLength * 2) + Math.trunc(inputLength / this.lineLength) + 1;
  }

  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));
    return this.encodeInternal(input, startIndex, length, output, 0);
  }

  private encodeInternal(input: Uint8Array, startIndex: number, length: number, output: Uint8Array, out: number): number {
    const end = startIndex + length;
    for (let i = startIndex; i < end; i++) {
      let c = input[i]!;
      this.crc.update(c);
      c = (c + 42) & 0xff;

      if (c === 0 || c === 0x09 || c === 0x0d || c === 0x0a || c === 0x3d || c === 0x2e) {
        output[out++] = 0x3d;
        output[out++] = (c + 64) & 0xff;
        this.octets = (this.octets + 2) & 0xff;
      } else {
        output[out++] = c;
        this.octets = (this.octets + 1) & 0xff;
      }

      if (this.octets >= this.lineLength) {
        output[out++] = 0x0a;
        this.octets = 0;
      }
    }

    return out;
  }

  flush(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));
    let out = 0;
    if (length > 0)
      out = this.encodeInternal(input, startIndex, length, output, out);
    if (this.octets > 0) {
      output[out++] = 0x0a;
      this.octets = 0;
    }
    return out;
  }

  reset(): void {
    this.crc.reset();
    this.octets = 0;
  }
}
