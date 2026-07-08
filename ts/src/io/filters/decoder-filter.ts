/**
 * Port of MimeKit/IO/Filters/DecoderFilter.cs.
 *
 * The static `Create(encoding)` factories are added at the end of wave 1
 * once the concrete codecs exist (they construct Base64Decoder etc.).
 */
import type { MimeDecoder } from '../../encodings/types.js';
import type { ContentEncoding } from '../../content-encoding.js';
import { MimeFilterBase } from './mime-filter-base.js';
import type { MimeFilterResult } from './mime-filter.js';

export class DecoderFilter extends MimeFilterBase {
  readonly decoder: MimeDecoder;

  get encoding(): ContentEncoding {
    return this.decoder.encoding;
  }

  constructor(decoder: MimeDecoder) {
    super();
    this.decoder = decoder;
  }

  protected filterInternal(input: Uint8Array, startIndex: number, length: number, _flush: boolean): MimeFilterResult {
    const output = this.ensureOutputSize(this.decoder.estimateOutputLength(length), false);
    const outputLength = this.decoder.decode(input, startIndex, length, output);

    return { buffer: output, index: 0, length: outputLength };
  }

  override reset(): void {
    this.decoder.reset();
    super.reset();
  }
}
