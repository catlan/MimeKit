/**
 * Port of MimeKit/IO/Filters/AnonymizeFilter.cs
 *
 * A filter for anonymizing content: replaces all non-whitespace bytes with
 * an 'x'. The filter carries no held-back state, so each write produces its
 * full output immediately.
 */
import { MimeFilterBase } from './mime-filter-base.js';
import type { MimeFilterResult } from './mime-filter.js';
import { isWhitespace } from '../../utils/byte-extensions.js';

const X = 0x78; // 'x'

export class AnonymizeFilter extends MimeFilterBase {
  protected filterInternal(
    input: Uint8Array,
    startIndex: number,
    length: number,
    _flush: boolean
  ): MimeFilterResult {
    const endIndex = startIndex + length;
    let index = startIndex;

    const output = this.ensureOutputSize(length, false);
    let outputIndex = 0;

    while (index < endIndex) {
      const c = input[index]!;
      output[outputIndex++] = isWhitespace(c) ? c : X;
      index++;
    }

    return { buffer: output, index: 0, length };
  }
}
