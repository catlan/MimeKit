/**
 * Port of MimeKit/FormatOptions.cs (partial) + NewLineFormat.
 *
 * The C# Default instance throws InvalidOperationException on mutation;
 * here `FormatOptions.default` is frozen so mutation throws a TypeError in
 * strict mode — same contract, host-native mechanism. CreateNewLineFilter
 * and the hidden-header set arrive with the writer work (wave 3/5).
 */
export type NewLineFormat = 'unix' | 'dos';

export type ParameterEncodingMethod = 'default' | 'rfc2231' | 'rfc2047';

import { Dos2UnixFilter } from './io/filters/dos2unix-filter.js';
import { Unix2DosFilter } from './io/filters/unix2dos-filter.js';

export const MAXIMUM_LINE_LENGTH = 998;
export const MINIMUM_LINE_LENGTH = 60;
const DEFAULT_MAX_LINE_LENGTH = 78;

export class FormatOptions {
  static readonly default: FormatOptions = Object.freeze(new FormatOptions()) as FormatOptions;

  maxLineLength = DEFAULT_MAX_LINE_LENGTH;
  /**
   * C# derives the default from Environment.NewLine (unix on macOS/Linux,
   * dos on Windows). An isomorphic library has no host newline; the port
   * fixes the default to 'unix', matching the oracle host (plan Q8).
   */
  newLineFormat: NewLineFormat = 'unix';
  ensureNewLine = false;
  international = false;
  allowMixedHeaderCharsets = false;
  parameterEncodingMethod: ParameterEncodingMethod = 'rfc2231';
  alwaysQuoteParameterValues = false;

  /** C#: FormatOptions.NewLine ("\n" or "\r\n"). */
  get newLine(): string {
    return this.newLineFormat === 'unix' ? '\n' : '\r\n';
  }

  get newLineBytes(): Uint8Array {
    return new TextEncoder().encode(this.newLine);
  }

  createNewLineFilter(ensureNewLine = this.ensureNewLine): Dos2UnixFilter | Unix2DosFilter {
    return this.newLineFormat === 'dos'
      ? new Unix2DosFilter(ensureNewLine)
      : new Dos2UnixFilter(ensureNewLine);
  }

  clone(): FormatOptions {
    const options = new FormatOptions();
    options.maxLineLength = this.maxLineLength;
    options.newLineFormat = this.newLineFormat;
    options.ensureNewLine = this.ensureNewLine;
    options.international = this.international;
    options.allowMixedHeaderCharsets = this.allowMixedHeaderCharsets;
    options.parameterEncodingMethod = this.parameterEncodingMethod;
    options.alwaysQuoteParameterValues = this.alwaysQuoteParameterValues;
    return options;
  }
}
