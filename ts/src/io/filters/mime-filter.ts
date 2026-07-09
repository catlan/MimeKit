/**
 * The output range produced by a MIME filter.
 */
export interface MimeFilterResult {
  /** The buffer containing the filtered output. */
  buffer: Uint8Array;
  /** The starting index of the filtered output in {@link buffer}. */
  index: number;
  /** The length of the filtered output. */
  length: number;
}

/**
 * An interface for incrementally filtering data.
 */
export interface IMimeFilter {
  /**
   * Filter the specified input buffer.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the input buffer.
   * @param length The number of bytes of input to filter.
   * @returns The filtered output range.
   */
  filter(input: Uint8Array, startIndex: number, length: number): MimeFilterResult;
  /**
   * Filter the specified input buffer, flushing all internally buffered data to the output.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the input buffer.
   * @param length The number of bytes of input to filter.
   * @returns The filtered output range.
   */
  flush(input: Uint8Array, startIndex: number, length: number): MimeFilterResult;
  /**
   * Reset the filter.
   */
  reset(): void;
}
