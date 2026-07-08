/**
 * Port of MimeKit/IO/Filters/EncoderFilter.cs.
 */
import { Base64Encoder } from '../../encodings/base64-encoder.js';
import { QuotedPrintableEncoder } from '../../encodings/quoted-printable-encoder.js';
import { UUEncoder } from '../../encodings/uu-encoder.js';
import type { MimeEncoder } from '../../encodings/types.js';
import type { ContentEncoding } from '../../content-encoding.js';
import { tryParse as tryParseContentEncoding } from '../../utils/mime-utils.js';
import { MimeFilterBase } from './mime-filter-base.js';
import type { IMimeFilter, MimeFilterResult } from './mime-filter.js';
import { PassThroughFilter } from './pass-through-filter.js';

export class EncoderFilter extends MimeFilterBase {
  readonly encoder: MimeEncoder;

  get encoding(): ContentEncoding {
    return this.encoder.encoding;
  }

  constructor(encoder: MimeEncoder) {
    super();
    if (encoder == null)
      throw new TypeError('encoder cannot be null or undefined');

    this.encoder = encoder;
  }

  static create(encoding: ContentEncoding, maxLineLength?: number): IMimeFilter;
  static create(name: string, maxLineLength?: number): IMimeFilter;
  static create(encodingOrName: ContentEncoding | string, maxLineLength = 78): IMimeFilter {
    if (encodingOrName == null)
      throw new TypeError('name cannot be null or undefined');

    const parsed = typeof encodingOrName === 'string' ? tryParseContentEncoding(encodingOrName) : undefined;
    const encoding = parsed === undefined ? encodingOrName : (parsed.ok ? parsed.value : 'default');

    switch (encoding) {
      case 'base64': return new EncoderFilter(new Base64Encoder(maxLineLength));
      case 'quoted-printable': return new EncoderFilter(new QuotedPrintableEncoder(maxLineLength));
      case 'uuencode': return new EncoderFilter(new UUEncoder());
      default: return new PassThroughFilter();
    }
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
