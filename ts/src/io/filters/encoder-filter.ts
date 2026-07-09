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

/**
 * A filter for encoding MIME content.
 *
 * Uses a {@link MimeEncoder} to incrementally encode data.
 */
export class EncoderFilter extends MimeFilterBase {
  /** The encoder used by this filter. */
  readonly encoder: MimeEncoder;

  /**
   * The encoding supported by the encoder.
   */
  get encoding(): ContentEncoding {
    return this.encoder.encoding;
  }

  /**
   * Create an encoder filter using the specified encoder.
   *
   * @param encoder A specific encoder for the filter to use.
   * @throws {TypeError} `encoder` is null or undefined.
   */
  constructor(encoder: MimeEncoder) {
    super();
    if (encoder == null)
      throw new TypeError('encoder cannot be null or undefined');

    this.encoder = encoder;
  }

  /**
   * Create a filter that will encode using the specified encoding.
   *
   * @param encoding The encoding to create a filter for.
   * @param maxLineLength The maximum number of octets allowed per line, not counting CRLF.
   * @returns A new encoder filter, or a pass-through filter for unsupported encodings.
   * @throws {RangeError} `maxLineLength` is outside the supported range for the selected encoder.
   */
  static create(encoding: ContentEncoding, maxLineLength?: number): IMimeFilter;
  /**
   * Create a filter that will encode using the specified encoding name.
   *
   * @param name The name of the encoding to create a filter for.
   * @param maxLineLength The maximum number of octets allowed per line, not counting CRLF.
   * @returns A new encoder filter, or a pass-through filter for unsupported encodings.
   * @throws {TypeError} `name` is null or undefined.
   * @throws {RangeError} `maxLineLength` is outside the supported range for the selected encoder.
   */
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
    const output = this.ensureOutputSize(this.encoder.estimateOutputLength(length), false);
    const outputLength = flush
      ? this.encoder.flush(input, startIndex, length, output)
      : this.encoder.encode(input, startIndex, length, output);

    return { buffer: output, index: 0, length: outputLength };
  }

  /**
   * Reset the filter.
   */
  override reset(): void {
    this.encoder.reset();
    super.reset();
  }
}
