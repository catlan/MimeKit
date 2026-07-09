import type { ContentEncoding } from '../../content-encoding.js';
import { MimeFilterBase } from './mime-filter-base.js';
import type { MimeFilterResult } from './mime-filter.js';

/**
 * Constraints used when selecting the most efficient content-transfer-encoding.
 */
export type EncodingConstraint =
  | 'none'
  | '8bit'
  | '7bit';

const MINIMUM_LINE_LENGTH = 60;
const MAXIMUM_LINE_LENGTH = 998;
const CR = 0x0d;
const LF = 0x0a;
const NUL = 0x00;

/**
 * A filter that can be used to determine the most efficient content-transfer-encoding.
 *
 * Keeps track of the content that passes through the filter in order to determine
 * the most efficient {@link ContentEncoding} to use.
 */
export class BestEncodingFilter extends MimeFilterBase {
  private readonly marker = new Uint8Array(6);
  private maxline = 0;
  private linelen = 0;
  private count0 = 0;
  private count8 = 0;
  private markerLength = 0;
  private hasMarker = false;
  private total = 0;
  private pc = 0;

  /**
   * Get the best encoding given the specified constraints.
   *
   * @param constraint The encoding constraint.
   * @param maxLineLength The maximum allowable line length, not counting CRLF. Must be between 60 and 998 inclusive.
   * @returns The best encoding.
   * @throws {RangeError} `constraint` is invalid or `maxLineLength` is outside the supported range.
   */
  getBestEncoding(constraint: EncodingConstraint, maxLineLength = 78): ContentEncoding {
    if (!Number.isInteger(maxLineLength) || maxLineLength < MINIMUM_LINE_LENGTH || maxLineLength > MAXIMUM_LINE_LENGTH)
      throw new RangeError('maxLineLength must be between 60 and 998');

    switch (constraint) {
      case '7bit':
        if (this.count0 > 0)
          return 'base64';

        if (this.count8 > 0) {
          if (this.count8 >= Math.trunc(this.total * (17.0 / 100.0)))
            return 'base64';

          return 'quoted-printable';
        }

        if (this.hasMarker || this.maxline > maxLineLength)
          return 'quoted-printable';

        break;
      case '8bit':
        if (this.count0 > 0)
          return 'base64';

        if (this.hasMarker || this.maxline > maxLineLength)
          return 'quoted-printable';

        if (this.count8 > 0)
          return '8bit';

        break;
      case 'none':
        if (this.hasMarker || this.maxline > maxLineLength) {
          if (this.count0 > 0 || this.count8 > Math.trunc(this.total * (17.0 / 100.0)))
            return 'base64';

          return 'quoted-printable';
        }

        if (this.count0 > 0)
          return 'binary';

        if (this.count8 > 0)
          return '8bit';

        break;
      default:
        throw new RangeError('constraint is not a valid EncodingConstraint');
    }

    return '7bit';
  }

  private static isMboxMarker(marker: Uint8Array): boolean {
    return marker[0] === 0x46 && marker[1] === 0x72 && marker[2] === 0x6f && marker[3] === 0x6d && marker[4] === 0x20;
  }

  private scan(input: Uint8Array, startIndex: number, length: number): void {
    const endIndex = startIndex + length;
    let index = startIndex;

    while (index < endIndex) {
      let c = 0;

      while (index < endIndex && (c = input[index++]!) !== LF) {
        if (c === NUL)
          this.count0++;
        else if (c > 127)
          this.count8++;

        if (!this.hasMarker && this.markerLength < 5)
          this.marker[this.markerLength++] = c;

        this.linelen++;
        this.pc = c;
      }

      if (c === LF) {
        if (this.pc === CR)
          this.linelen--;

        this.maxline = Math.max(this.maxline, this.linelen);
        this.linelen = 0;

        if (!this.hasMarker && this.markerLength === 5 && BestEncodingFilter.isMboxMarker(this.marker))
          this.hasMarker = true;

        this.markerLength = 0;
      }
    }
  }

  /**
   * Filter the specified input buffer.
   *
   * @param input The input buffer.
   * @param startIndex The starting index of the input buffer.
   * @param length The length of the input buffer, starting at `startIndex`.
   * @param _flush Whether all internally buffered data should be flushed to the output buffer.
   * @returns The unmodified input range.
   */
  protected filterInternal(input: Uint8Array, startIndex: number, length: number, _flush: boolean): MimeFilterResult {
    this.scan(input, startIndex, length);
    this.maxline = Math.max(this.maxline, this.linelen);
    this.total += length;

    return { buffer: input, index: startIndex, length };
  }

  /**
   * Reset the filter.
   */
  override reset(): void {
    this.hasMarker = false;
    this.markerLength = 0;
    this.linelen = 0;
    this.maxline = 0;
    this.count0 = 0;
    this.count8 = 0;
    this.total = 0;
    this.pc = 0;
    super.reset();
  }
}
