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

export class CharsetFilter extends MimeFilterBase {
  private decoder: CharsetStreamDecoder;

  readonly sourceEncoding: CharsetEncoding;
  readonly targetEncoding: CharsetEncoding;

  constructor(sourceEncoding: string | number | CharsetEncoding, targetEncoding: string | number | CharsetEncoding) {
    super();

    this.sourceEncoding = getEncoding('sourceEncoding', sourceEncoding);
    this.targetEncoding = getEncoding('targetEncoding', targetEncoding);
    assertSupportedTarget(this.targetEncoding);

    this.decoder = createStreamDecoder(this.sourceEncoding);
  }

  protected filterInternal(input: Uint8Array, startIndex: number, length: number, flush: boolean): MimeFilterResult {
    const decoded = this.decoder.decode(input.subarray(startIndex, startIndex + length), flush);
    const encoded = this.targetEncoding.encode(decoded);
    const output = this.ensureOutputSize(encoded.length, false);

    output.set(encoded, 0);

    return { buffer: output, index: 0, length: encoded.length };
  }

  override reset(): void {
    this.decoder = createStreamDecoder(this.sourceEncoding);
    super.reset();
  }
}
