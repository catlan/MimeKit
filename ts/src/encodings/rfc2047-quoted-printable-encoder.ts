import { QEncoder, QEncodeMode } from './q-encoder.js';
import type { Rfc2047Encoder } from './rfc2047-encoder.js';

export { QEncodeMode };

export class Rfc2047QuotedPrintableEncoder implements Rfc2047Encoder {
  readonly encoding = 'q' as const;
  private readonly encoder: QEncoder;

  constructor(mode: QEncodeMode) {
    this.encoder = new QEncoder(mode);
  }

  estimateOutputLength(inputLength: number): number {
    return this.encoder.estimateOutputLength(inputLength);
  }

  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    return this.encoder.encode(input, startIndex, length, output);
  }
}
