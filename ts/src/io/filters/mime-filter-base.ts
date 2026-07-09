import type { IMimeFilter, MimeFilterResult } from './mime-filter.js';

/**
 * A base implementation for MIME filters.
 */
export abstract class MimeFilterBase implements IMimeFilter {
  /** The reusable output buffer used by this filter. */
  protected outputBuffer?: Uint8Array;
  private preloadLength = 0;
  private preload?: Uint8Array;
  private inbuf?: Uint8Array;

  /**
   * Filter the specified input buffer.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the input buffer.
   * @param length The length of the input buffer, starting at `startIndex`.
   * @param flush Whether all internally buffered data should be flushed to the output buffer.
   * @returns The filtered output range.
   */
  protected abstract filterInternal(
    input: Uint8Array,
    startIndex: number,
    length: number,
    flush: boolean
  ): MimeFilterResult;

  private static getIdealBufferSize(need: number): number {
    return (need + 63) & ~63;
  }

  private preFilter(input: Uint8Array, range: { startIndex: number; length: number }): Uint8Array {
    if (this.preloadLength === 0)
      return input;

    const totalLength = range.length + this.preloadLength;

    if (!this.inbuf || this.inbuf.length < totalLength)
      this.inbuf = new Uint8Array(MimeFilterBase.getIdealBufferSize(totalLength));

    this.inbuf.set(this.preload!.subarray(0, this.preloadLength), 0);
    this.inbuf.set(input.subarray(range.startIndex, range.startIndex + range.length), this.preloadLength);

    range.length = totalLength;
    this.preloadLength = 0;
    range.startIndex = 0;

    return this.inbuf;
  }

  private static validateArguments(input: Uint8Array, startIndex: number, length: number): void {
    if (!(input instanceof Uint8Array))
      throw new TypeError('input must be a Uint8Array');
    if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > input.length)
      throw new RangeError(`startIndex ${startIndex} out of range [0, ${input.length}]`);
    if (!Number.isInteger(length) || length < 0 || length > input.length - startIndex)
      throw new RangeError(`length ${length} out of range [0, ${input.length - startIndex}]`);
  }

  /**
   * Filter the specified input buffer.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the input buffer.
   * @param length The number of bytes of input to filter.
   * @returns The filtered output range.
   * @throws {TypeError} `input` is not a `Uint8Array`.
   * @throws {RangeError} `startIndex` and `length` do not specify a valid range in `input`.
   */
  filter(input: Uint8Array, startIndex: number, length: number): MimeFilterResult {
    MimeFilterBase.validateArguments(input, startIndex, length);

    const range = { startIndex, length };
    const filteredInput = this.preFilter(input, range);

    return this.filterInternal(filteredInput, range.startIndex, range.length, false);
  }

  /**
   * Filter the specified input buffer, flushing all internally buffered data to the output.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the input buffer.
   * @param length The number of bytes of input to filter.
   * @returns The filtered output range.
   * @throws {TypeError} `input` is not a `Uint8Array`.
   * @throws {RangeError} `startIndex` and `length` do not specify a valid range in `input`.
   */
  flush(input: Uint8Array, startIndex: number, length: number): MimeFilterResult {
    MimeFilterBase.validateArguments(input, startIndex, length);

    const range = { startIndex, length };
    const filteredInput = this.preFilter(input, range);

    return this.filterInternal(filteredInput, range.startIndex, range.length, true);
  }

  /**
   * Reset the filter.
   */
  reset(): void {
    this.preloadLength = 0;
  }

  /**
   * Save the remaining input for the next round of processing.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the buffer to save.
   * @param length The length of the buffer to save, starting at `startIndex`.
   */
  protected saveRemainingInput(input: Uint8Array, startIndex: number, length: number): void {
    if (length === 0)
      return;

    if (!this.preload || this.preload.length < length)
      this.preload = new Uint8Array(MimeFilterBase.getIdealBufferSize(length));

    this.preload.set(input.subarray(startIndex, startIndex + length), 0);
    this.preloadLength = length;
  }

  /**
   * Ensure that the output buffer is at least the specified size.
   *
   * @param size The minimum size needed.
   * @param keep Whether the current output should be preserved.
   * @returns The output buffer.
   */
  protected ensureOutputSize(size: number, keep: boolean): Uint8Array {
    if (this.outputBuffer && this.outputBuffer.length >= size)
      return this.outputBuffer;

    const output = new Uint8Array(MimeFilterBase.getIdealBufferSize(size));
    if (keep && this.outputBuffer)
      output.set(this.outputBuffer);
    this.outputBuffer = output;
    return output;
  }
}
