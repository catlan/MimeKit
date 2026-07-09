import { MimeFilterBase } from './mime-filter-base.js';
import type { MimeFilterResult } from './mime-filter.js';

const LF = 0x0a;
const EQUALS = 0x3d;
const DIGIT_4 = 0x34;
const DIGIT_6 = 0x36;
const MBOX_FROM_MARKER = new Uint8Array([0x46, 0x72, 0x6f, 0x6d, 0x20]);

function indexOf(input: Uint8Array, value: number, startIndex: number, endIndex: number): number {
  for (let i = startIndex; i < endIndex; i++) {
    if (input[i] === value)
      return i - startIndex;
  }

  return -1;
}

function startsWith(input: Uint8Array, startIndex: number, endIndex: number, marker: Uint8Array): boolean {
  if (endIndex - startIndex < marker.length)
    return false;

  for (let i = 0; i < marker.length; i++) {
    if (input[startIndex + i] !== marker[i])
      return false;
  }

  return true;
}

function sequenceEqual(input: Uint8Array, startIndex: number, length: number, marker: Uint8Array): boolean {
  for (let i = 0; i < length; i++) {
    if (input[startIndex + i] !== marker[i])
      return false;
  }

  return true;
}

/**
 * A filter that armors lines beginning with `"From "` by encoding the `F` with quoted-printable encoding.
 *
 * From-armoring serves a similar purpose as {@link MboxFromFilter}, but replaces lines beginning
 * with `"From "` using `"=46rom "` instead of the irreversible `">From "` form. This requires the
 * content modified by this filter to use quoted-printable transfer encoding in order to work properly.
 *
 * This armoring technique preserves content so receiving clients can still verify PGP/MIME and
 * S/MIME signatures.
 */
export class ArmoredFromFilter extends MimeFilterBase {
  private midline = false;

  /**
   * Filter the specified input buffer.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the input buffer.
   * @param length The length of the input buffer, starting at `startIndex`.
   * @param flush Whether all internally buffered data should be flushed to the output buffer.
   * @returns The filtered output range.
   */
  protected filterInternal(input: Uint8Array, startIndex: number, length: number, flush: boolean): MimeFilterResult {
    const fromOffsets: number[] = [];
    const spanEnd = startIndex + length;
    let endIndex = length;
    let index = 0;

    if (this.midline) {
      const next = indexOf(input, LF, startIndex, spanEnd);

      if (next < 0) {
        index = length;
      } else {
        index = next + 1;
        this.midline = false;
      }
    }

    while (index < length) {
      const absoluteIndex = startIndex + index;
      const next = indexOf(input, LF, absoluteIndex, spanEnd);
      const sliceLength = length - index;

      if (next >= 0) {
        if (next >= MBOX_FROM_MARKER.length && startsWith(input, absoluteIndex, spanEnd, MBOX_FROM_MARKER))
          fromOffsets.push(index);
      } else {
        if (sliceLength >= MBOX_FROM_MARKER.length) {
          if (startsWith(input, absoluteIndex, spanEnd, MBOX_FROM_MARKER))
            fromOffsets.push(index);
        } else {
          if (!flush && sequenceEqual(input, absoluteIndex, sliceLength, MBOX_FROM_MARKER)) {
            this.saveRemainingInput(input, absoluteIndex, sliceLength);
            endIndex = index;
            break;
          }
        }

        this.midline = true;
        break;
      }

      index += next + 1;
    }

    if (fromOffsets.length > 0) {
      const need = endIndex + fromOffsets.length * 2;
      const output = this.ensureOutputSize(need, false);
      let outputLength = 0;
      index = 0;

      for (const offset of fromOffsets) {
        if (index < offset) {
          output.set(input.subarray(startIndex + index, startIndex + offset), outputLength);
          outputLength += offset - index;
          index = offset;
        }

        output[outputLength++] = EQUALS;
        output[outputLength++] = DIGIT_4;
        output[outputLength++] = DIGIT_6;
        index++;
      }

      output.set(input.subarray(startIndex + index, startIndex + endIndex), outputLength);
      outputLength += endIndex - index;

      return { buffer: output, index: 0, length: outputLength };
    }

    return { buffer: input, index: startIndex, length: endIndex };
  }

  /**
   * Reset the filter.
   */
  override reset(): void {
    this.midline = false;
    super.reset();
  }
}
