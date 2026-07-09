import type { IMimeFilter, MimeFilterResult } from './mime-filter.js';

/**
 * A filter that simply passes data through without any processing.
 */
export class PassThroughFilter implements IMimeFilter {
  /**
   * Filter the specified input buffer.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the input buffer.
   * @param length The number of bytes of input to filter.
   * @returns The unmodified input range.
   */
  filter(input: Uint8Array, startIndex: number, length: number): MimeFilterResult {
    return { buffer: input, index: startIndex, length };
  }

  /**
   * Filter the specified input buffer, flushing all internally buffered data to the output.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the input buffer.
   * @param length The number of bytes of input to filter.
   * @returns The unmodified input range.
   */
  flush(input: Uint8Array, startIndex: number, length: number): MimeFilterResult {
    return { buffer: input, index: startIndex, length };
  }

  /**
   * Reset the filter.
   */
  reset(): void {}
}
