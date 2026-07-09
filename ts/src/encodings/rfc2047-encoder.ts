/** Encodes bytes for use inside RFC 2047 encoded-word tokens. */
export interface Rfc2047Encoder {
  /**
   * The RFC 2047 encoding method.
   *
   * RFC 2047 encoded-word tokens support base64 (`b`) and quoted-printable (`q`).
   */
  readonly encoding: 'b' | 'q';
  /**
   * Estimates the number of bytes needed to encode the specified number of input bytes.
   *
   * @param inputLength - The input length.
   * @returns The estimated output length.
   */
  estimateOutputLength(inputLength: number): number;
  /**
   * Encodes the specified input into the output buffer.
   *
   * @param input - The input buffer.
   * @param startIndex - The starting index of the input buffer.
   * @param length - The length of the input range.
   * @param output - The output buffer.
   * @returns The number of bytes written to the output buffer.
   */
  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number;
}
