/**
 * Port of MimeKit/IO/Filters/DecoderFilter.cs.
 */
import { Base64Decoder } from '../../encodings/base64-decoder.js';
import { QuotedPrintableDecoder } from '../../encodings/quoted-printable-decoder.js';
import { UUDecoder } from '../../encodings/uu-decoder.js';
import type { MimeDecoder } from '../../encodings/types.js';
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

export class DecoderFilter extends MimeFilterBase {
  readonly decoder: MimeDecoder;

  get encoding(): ContentEncoding {
    return this.decoder.encoding;
  }

  constructor(decoder: MimeDecoder) {
    super();
    if (decoder == null)
      throw new TypeError('decoder cannot be null or undefined');

    this.decoder = decoder;
  }

  static create(encoding: ContentEncoding): IMimeFilter;
  static create(name: string): IMimeFilter;
  static create(encodingOrName: ContentEncoding | string): IMimeFilter {
    if (encodingOrName == null)
      throw new TypeError('name cannot be null or undefined');

    const encoding = typeof encodingOrName === 'string'
      ? parseContentEncoding(encodingOrName)
      : encodingOrName;

    switch (encoding) {
      case 'base64': return new DecoderFilter(new Base64Decoder());
      case 'quoted-printable': return new DecoderFilter(new QuotedPrintableDecoder());
      case 'uuencode': return new DecoderFilter(new UUDecoder());
      default: return new PassThroughFilter();
    }
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
