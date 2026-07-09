// Port of MimeKit/Cryptography/DkimRelaxedBodyFilter.cs.

import type { MimeFilterResult } from '../io/filters/mime-filter.js';
import { isBlank } from '../utils/byte-extensions.js';
import { DkimBodyFilter } from './dkim-body-filter.js';

const CR = 0x0d;
const LF = 0x0a;
const SPACE = 0x20;

/**
 * A filter for the DKIM relaxed body canonicalization.
 */
export class DkimRelaxedBodyFilter extends DkimBodyFilter {
  private lwsp = false;
  private cr = false;

  /**
   * Create a filter for the DKIM relaxed body canonicalization.
   */
  constructor() {
    super();
    this.lastWasNewLine = true;
    this.isEmptyLine = true;
  }

  private canonicalize(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    let count = 0;
    let outputIndex = 0;
    const endIndex = startIndex + length;

    for (let i = startIndex; i < endIndex; i++) {
      const c = input[i]!;

      if (c === LF) {
        if (this.isEmptyLine) {
          this.emptyLines++;
        } else {
          if (this.cr) {
            output[outputIndex++] = CR;
            count++;
          }

          output[outputIndex++] = LF;
          this.lastWasNewLine = true;
          this.isEmptyLine = true;
          count++;
        }

        this.lwsp = false;
        this.cr = false;
      } else {
        if (this.cr) {
          output[outputIndex++] = CR;
          this.cr = false;
          count++;
        }

        if (c === CR) {
          this.lwsp = false;
          this.cr = true;
        } else if (isBlank(c)) {
          this.lwsp = true;
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

          if (this.lwsp) {
            // collapse lwsp to a single space
            output[outputIndex++] = SPACE;
            this.lwsp = false;
            count++;
          }

          this.lastWasNewLine = false;
          this.isEmptyLine = false;

          output[outputIndex++] = c;
          count++;
        }
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
    const output = this.ensureOutputSize(length + (this.lwsp ? 1 : 0) + this.emptyLines * 2 + (this.cr ? 1 : 0) + 1, false);
    const outputLength = this.canonicalize(input, startIndex, length, output);
    return { buffer: output, index: 0, length: outputLength };
  }

  /**
   * Reset the filter.
   */
  override reset(): void {
    this.lastWasNewLine = true;
    this.isEmptyLine = true;
    this.emptyLines = 0;
    this.lwsp = false;
    this.cr = false;
    super.reset();
  }
}
