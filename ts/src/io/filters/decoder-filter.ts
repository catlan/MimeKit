/**
 * Port of MimeKit/IO/Filters/DecoderFilter.cs.
 */
import { Base64Decoder } from '../../encodings/base64-decoder.js';
import { QuotedPrintableDecoder } from '../../encodings/quoted-printable-decoder.js';
import { UUDecoder } from '../../encodings/uu-decoder.js';
import type { MimeDecoder } from '../../encodings/types.js';
import type { ContentEncoding } from '../../content-encoding.js';
import { tryParse as tryParseContentEncoding } from '../../utils/mime-utils.js';
import { MimeFilterBase } from './mime-filter-base.js';
import type { IMimeFilter, MimeFilterResult } from './mime-filter.js';
import { PassThroughFilter } from './pass-through-filter.js';

/**
 * A filter for decoding MIME content.
 *
 * Uses a {@link MimeDecoder} to incrementally decode data.
 */
export class DecoderFilter extends MimeFilterBase {
  /** The decoder used by this filter. */
  readonly decoder: MimeDecoder;

  /**
   * The encoding supported by the decoder.
   */
  get encoding(): ContentEncoding {
    return this.decoder.encoding;
  }

  /**
   * Create a decoder filter using the specified decoder.
   *
   * @param decoder A specific decoder for the filter to use.
   * @throws {TypeError} `decoder` is null or undefined.
   */
  constructor(decoder: MimeDecoder) {
    super();
    if (decoder == null)
      throw new TypeError('decoder cannot be null or undefined');

    this.decoder = decoder;
  }

  /**
   * Create a filter that will decode the specified encoding.
   *
   * @param encoding The encoding to create a filter for.
   * @returns A new decoder filter, or a pass-through filter for unsupported encodings.
   */
  static create(encoding: ContentEncoding): IMimeFilter;
  /**
   * Create a filter that will decode the specified encoding name.
   *
   * @param name The name of the encoding to create a filter for.
   * @returns A new decoder filter, or a pass-through filter for unsupported encodings.
   * @throws {TypeError} `name` is null or undefined.
   */
  static create(name: string): IMimeFilter;
  static create(encodingOrName: ContentEncoding | string): IMimeFilter {
    if (encodingOrName == null)
      throw new TypeError('name cannot be null or undefined');

    const encoding = typeof encodingOrName === 'string'
      ? tryParseContentEncoding(encodingOrName)
      : undefined;
    const parsedEncoding = encoding === undefined ? encodingOrName : (encoding.ok ? encoding.value : 'default');

    switch (parsedEncoding) {
      case 'base64': return new DecoderFilter(new Base64Decoder());
      case 'quoted-printable': return new DecoderFilter(new QuotedPrintableDecoder());
      case 'uuencode': return new DecoderFilter(new UUDecoder());
      default: return new PassThroughFilter();
    }
  }

  /**
   * Filter the specified input buffer.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the input buffer.
   * @param length The length of the input buffer, starting at `startIndex`.
   * @param _flush Whether all internally buffered data should be flushed to the output buffer.
   * @returns The filtered output range.
   */
  protected filterInternal(input: Uint8Array, startIndex: number, length: number, _flush: boolean): MimeFilterResult {
    const output = this.ensureOutputSize(this.decoder.estimateOutputLength(length), false);
    const outputLength = this.decoder.decode(input, startIndex, length, output);

    return { buffer: output, index: 0, length: outputLength };
  }

  /**
   * Reset the filter.
   */
  override reset(): void {
    this.decoder.reset();
    super.reset();
  }
}
