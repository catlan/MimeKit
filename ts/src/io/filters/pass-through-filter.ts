import type { IMimeFilter, MimeFilterResult } from './mime-filter.js';

export class PassThroughFilter implements IMimeFilter {
  filter(input: Uint8Array, startIndex: number, length: number): MimeFilterResult {
    return { buffer: input, index: startIndex, length };
  }

  flush(input: Uint8Array, startIndex: number, length: number): MimeFilterResult {
    return { buffer: input, index: startIndex, length };
  }

  reset(): void {}
}
