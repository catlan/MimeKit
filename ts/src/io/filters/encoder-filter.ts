/**
 * Port of MimeKit/IO/Filters/EncoderFilter.cs.
 */
import { Base64Encoder } from '../../encodings/base64-encoder.js';
import { QuotedPrintableEncoder } from '../../encodings/quoted-printable-encoder.js';
import { UUEncoder } from '../../encodings/uu-encoder.js';
import type { MimeEncoder } from '../../encodings/types.js';
import type { ContentEncoding } from '../../content-encoding.js';
import { MimeFilterBase } from './mime-filter-base.js';
import type { IMimeFilter, MimeFilterResult } from './mime-filter.js';
import { PassThroughFilter } from './pass-through-filter.js';

function parseContentEncoding(name: string): ContentEncoding {
  let startIndex = 0;

  while (startIndex < name.length && /\s/u.test(name[startIndex]!))
    startIndex++;

  let endIndex = startIndex;
  while (endIndex < name.length && name[endIndex] !== ';' && !/\s/u.test(name[endIndex]!))
    endIndex++;

  const encoding = name.slice(startIndex, endIndex).toLowerCase();

  // TODO(wave-2): replace with MimeUtils.tryParse once ported.
  switch (encoding) {
    case '7bit': return '7bit';
    case '8bit': return '8bit';
    case 'binary': return 'binary';
    case 'base64': return 'base64';
    case 'quoted-printable': return 'quoted-printable';
    case 'x-uuencode':
    case 'uuencode':
    case 'x-uue':
      return 'uuencode';
    default:
      return 'default';
  }
}

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

    const encoding = typeof encodingOrName === 'string'
      ? parseContentEncoding(encodingOrName)
      : encodingOrName;

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
