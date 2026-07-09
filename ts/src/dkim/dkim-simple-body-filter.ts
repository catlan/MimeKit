// Port of MimeKit/Cryptography/DkimSimpleBodyFilter.cs.

import type { MimeFilterResult } from '../io/filters/mime-filter.js';
import { DkimBodyFilter } from './dkim-body-filter.js';

const CR = 0x0d;
const LF = 0x0a;

/**
 * A filter for the DKIM simple body canonicalization.
 */
export class DkimSimpleBodyFilter extends DkimBodyFilter {
  /**
   * Create a filter for the DKIM simple body canonicalization.
   */
  constructor() {
    super();
    this.lastWasNewLine = false;
    this.isEmptyLine = true;
    this.emptyLines = 0;
  }

  private canonicalize(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    let count = 0;
    let outputIndex = 0;
    const endIndex = startIndex + length;

    for (let i = startIndex; i < endIndex; i++) {
      const c = input[i]!;

      if (c === CR) {
        if (!this.isEmptyLine) {
          output[outputIndex++] = c;
          count++;
        }
      } else if (c === LF) {
        if (!this.isEmptyLine) {
          output[outputIndex++] = c;
          this.lastWasNewLine = true;
          this.isEmptyLine = true;
          this.emptyLines = 0;
          count++;
        } else {
          this.emptyLines++;
        }
      } else {
        if (this.emptyLines > 0) {
          // unwind our collection of empty lines
          while (this.emptyLines > 0) {
            output[outputIndex++] = CR;
            output[outputIndex++] = LF;
            this.emptyLines--;
            count += 2;
          }
        }

        this.lastWasNewLine = false;
        this.isEmptyLine = false;

        output[outputIndex++] = c;
        count++;
      }
    }

    return count;
  }

  /**
   * Filter the specified input.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the input buffer.
   * @param length The length of the input buffer, starting at `startIndex`.
   * @param _flush Whether all internally buffered data should be flushed.
   * @returns The filtered output range.
   */
  protected filterInternal(input: Uint8Array, startIndex: number, length: number, _flush: boolean): MimeFilterResult {
    const output = this.ensureOutputSize(length + this.emptyLines * 2 + 1, false);
    const outputLength = this.canonicalize(input, startIndex, length, output);
    return { buffer: output, index: 0, length: outputLength };
  }

  /**
   * Reset the filter.
   */
  override reset(): void {
    this.lastWasNewLine = false;
    this.isEmptyLine = true;
    this.emptyLines = 0;
    super.reset();
  }
}
