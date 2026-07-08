import { MimeFilterBase } from './mime-filter-base.js';
import type { MimeFilterResult } from './mime-filter.js';

const CR = 0x0d;
const LF = 0x0a;

export class Dos2UnixFilter extends MimeFilterBase {
  private readonly ensureNewLine: boolean;
  private pc = 0;

  constructor(ensureNewLine = false) {
    super();
    this.ensureNewLine = ensureNewLine;
  }

  private convert(input: Uint8Array, startIndex: number, length: number, output: Uint8Array, flush: boolean): number {
    let outputIndex = 0;
    const endIndex = startIndex + length;

    for (let i = startIndex; i < endIndex; i++) {
      const c = input[i]!;

      if (c === LF) {
        output[outputIndex++] = c;
      } else {
        if (this.pc === CR)
          output[outputIndex++] = this.pc;

        if (c !== CR)
          output[outputIndex++] = c;
      }

      this.pc = c;
    }

    if (flush && this.ensureNewLine && this.pc !== LF) {
      output[outputIndex++] = LF;
      this.pc = LF;
    }

    return outputIndex;
  }

  protected filterInternal(input: Uint8Array, startIndex: number, length: number, flush: boolean): MimeFilterResult {
    const size = length + (this.pc === CR ? 1 : 0) + (flush && this.ensureNewLine ? 1 : 0);
    const output = this.ensureOutputSize(size, false);
    const outputLength = this.convert(input, startIndex, length, output, flush);

    return { buffer: output, index: 0, length: outputLength };
  }

  override reset(): void {
    this.pc = 0;
    super.reset();
  }
}
