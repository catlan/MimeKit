/**
 * Port of MimeKit/Encodings/PassThroughDecoder.cs.
 */
import type { ContentEncoding } from '../content-encoding.js';
import type { MimeDecoder } from './types.js';
import { validateCodecArguments } from './types.js';

export class PassThroughDecoder implements MimeDecoder {
  constructor(readonly encoding: ContentEncoding) {
  }

  clone(): MimeDecoder {
    return new PassThroughDecoder(this.encoding);
  }

  estimateOutputLength(inputLength: number): number {
    return inputLength;
  }

  decode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));
    output.set(input.subarray(startIndex, startIndex + length), 0);
    return length;
  }

  reset(): void {
  }
}
