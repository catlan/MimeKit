/**
 * Port of MimeKit/IO/Filters/CharsetFilter.cs.
 */
import {
  createStreamDecoder,
  getEncodingForCodePage,
  tryGetEncoding,
  type CharsetEncoding,
  type CharsetStreamDecoder,
} from '../../utils/charset-utils.js';
import { MimeFilterBase } from './mime-filter-base.js';
import type { MimeFilterResult } from './mime-filter.js';

const ALLOWED_TARGETS = 'utf-8, us-ascii, iso-8859-1/latin1';

function getEncoding(paramName: string, value: string | number | CharsetEncoding): CharsetEncoding {
  if (value == null)
    throw new TypeError(`${paramName} cannot be null or undefined`);

  if (typeof value === 'string') {
    const encoding = tryGetEncoding(value);
    if (encoding === null)
      throw new TypeError(`${paramName} '${value}' is not a supported charset`);
    return encoding;
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 65535)
      throw new RangeError(`${paramName} ${value} out of range [0, 65535]`);

    const encoding = getEncodingForCodePage(value);
    if (encoding === null)
      throw new TypeError(`${paramName} code page ${value} is not a supported charset`);
    return encoding;
  }

  if (typeof value.decode !== 'function' || typeof value.encode !== 'function')
    throw new TypeError(`${paramName} must be a charset name, code page, or CharsetEncoding`);

  return value;
}

function assertSupportedTarget(target: CharsetEncoding): void {
  if (target.codePage === 65001 || target.codePage === 20127 || target.codePage === 28591)
    return;

  throw new TypeError(
    `target charset '${target.webName}' is not supported for encoding; allowed targets: ${ALLOWED_TARGETS}`,
  );
}

/**
 * A charset filter for incrementally converting text streams from one charset encoding to another.
 */
export class CharsetFilter extends MimeFilterBase {
  private decoder: CharsetStreamDecoder;

  /** The source charset encoding. */
  readonly sourceEncoding: CharsetEncoding;
  /** The target charset encoding. */
  readonly targetEncoding: CharsetEncoding;

  /**
   * Create a charset filter to convert text from the source encoding into the target encoding.
   *
   * @param sourceEncoding The source encoding name, code page, or charset encoding.
   * @param targetEncoding The target encoding name, code page, or charset encoding.
   * @throws {TypeError} An encoding is null, unsupported, or not a charset encoding.
   * @throws {RangeError} A code page is outside the valid range.
   */
  constructor(sourceEncoding: string | number | CharsetEncoding, targetEncoding: string | number | CharsetEncoding) {
    super();

    this.sourceEncoding = getEncoding('sourceEncoding', sourceEncoding);
    this.targetEncoding = getEncoding('targetEncoding', targetEncoding);
    assertSupportedTarget(this.targetEncoding);

    this.decoder = createStreamDecoder(this.sourceEncoding);
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
    const decoded = this.decoder.decode(input.subarray(startIndex, startIndex + length), flush);
    const encoded = this.targetEncoding.encode(decoded);
    const output = this.ensureOutputSize(encoded.length, false);

    output.set(encoded, 0);

    return { buffer: output, index: 0, length: encoded.length };
  }

  /**
   * Reset the filter.
   */
  override reset(): void {
    this.decoder = createStreamDecoder(this.sourceEncoding);
    super.reset();
  }
}
