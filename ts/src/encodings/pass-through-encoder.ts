/**
 * Port of MimeKit/Encodings/PassThroughEncoder.cs.
 */
import type { ContentEncoding } from '../content-encoding.js';
import type { MimeEncoder } from './types.js';
import { validateCodecArguments } from './types.js';

export class PassThroughEncoder implements MimeEncoder {
  constructor(readonly encoding: ContentEncoding) {
  }

  clone(): MimeEncoder {
    return new PassThroughEncoder(this.encoding);
  }

  estimateOutputLength(inputLength: number): number {
    return inputLength;
  }

  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));
    output.set(input.subarray(startIndex, startIndex + length), 0);
    return length;
  }

  flush(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    return this.encode(input, startIndex, length, output);
  }

  reset(): void {
  }
}
