/**
 * Port of MimeKit/IO/Filters/EncoderFilter.cs.
 *
 * The static `Create(encoding)` factories are added at the end of wave 1
 * once the concrete codecs exist (they construct Base64Encoder etc.).
 */
import type { MimeEncoder } from '../../encodings/types.js';
import type { ContentEncoding } from '../../content-encoding.js';
import { MimeFilterBase } from './mime-filter-base.js';
import type { MimeFilterResult } from './mime-filter.js';

export class EncoderFilter extends MimeFilterBase {
  readonly encoder: MimeEncoder;

  get encoding(): ContentEncoding {
    return this.encoder.encoding;
  }

  constructor(encoder: MimeEncoder) {
    super();
    this.encoder = encoder;
  }

  protected filterInternal(input: Uint8Array, startIndex: number, length: number, flush: boolean): MimeFilterResult {
    const output = this.ensureOutputSize(this.encoder.estimateOutputLength(length), false);
    const outputLength = flush
      ? this.encoder.flush(input, startIndex, length, output)
      : this.encoder.encode(input, startIndex, length, output);

    return { buffer: output, index: 0, length: outputLength };
  }

  override reset(): void {
    this.encoder.reset();
    super.reset();
  }
}
