import { isBlank } from '../../utils/byte-extensions.js';
import { MimeFilterBase } from './mime-filter-base.js';
import type { MimeFilterResult } from './mime-filter.js';

const CR = 0x0d;
const LF = 0x0a;

export class TrailingWhitespaceFilter extends MimeFilterBase {
  private lwsp: number[] = [];

  private convert(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    let outputIndex = 0;
    let count = 0;
    const endIndex = startIndex + length;

    for (let i = startIndex; i < endIndex; i++) {
      const c = input[i]!;

      if (isBlank(c)) {
        this.lwsp.push(c);
      } else if (c === CR) {
        output[outputIndex++] = c;
        this.lwsp.length = 0;
        count++;
      } else if (c === LF) {
        output[outputIndex++] = c;
        this.lwsp.length = 0;
        count++;
      } else {
        if (this.lwsp.length > 0) {
          output.set(this.lwsp, count);
          outputIndex += this.lwsp.length;
          count += this.lwsp.length;
          this.lwsp.length = 0;
        }

        output[outputIndex++] = c;
        count++;
      }
    }

    return count;
  }

  protected filterInternal(input: Uint8Array, startIndex: number, length: number, flush: boolean): MimeFilterResult {
    if (length === 0) {
      if (flush)
        this.lwsp.length = 0;

      return { buffer: input, index: startIndex, length };
    }

    const output = this.ensureOutputSize(length + this.lwsp.length, false);
    const outputLength = this.convert(input, startIndex, length, output);

    if (flush)
      this.lwsp.length = 0;

    return { buffer: output, index: 0, length: outputLength };
  }

  override reset(): void {
    this.lwsp.length = 0;
    super.reset();
  }
}
