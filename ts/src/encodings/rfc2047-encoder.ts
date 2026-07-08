export interface Rfc2047Encoder {
  readonly encoding: 'b' | 'q';
  estimateOutputLength(inputLength: number): number;
  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number;
}
