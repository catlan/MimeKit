/**
 * Port of MimeKit/FormatOptions.cs (partial) + NewLineFormat.
 *
 * The C# Default instance throws InvalidOperationException on mutation;
 * here `FormatOptions.default` is frozen so mutation throws a TypeError in
 * strict mode — same contract, host-native mechanism. CreateNewLineFilter
 * and the hidden-header set arrive with the writer work (wave 3/5).
 */
/**
 * New-line encoding to use when writing messages or entities.
 */
export type NewLineFormat = 'unix' | 'dos';

/**
 * Method used for encoding Content-Type and Content-Disposition parameter
 * values when a parameter's own encoding method is `default`.
 */
export type ParameterEncodingMethod = 'default' | 'rfc2231' | 'rfc2047';

import type { HeaderId } from './header-id.js';
import { Dos2UnixFilter } from './io/filters/dos2unix-filter.js';
import { Unix2DosFilter } from './io/filters/unix2dos-filter.js';

/** Maximum legal MIME header line length. */
export const MAXIMUM_LINE_LENGTH = 998;
/** Minimum line length accepted by MimeKit format options. */
export const MINIMUM_LINE_LENGTH = 60;
const DEFAULT_MAX_LINE_LENGTH = 78;

/**
 * Format options for serializing MimeKit objects.
 *
 * Represents the available options for formatting MIME messages and entities
 * when writing them.
 */
export class FormatOptions {
  /**
   * The default formatting options.
   *
   * If custom options are not supplied to formatting methods, these options
   * are used. The default instance is frozen in this port.
   */
  static readonly default: FormatOptions = Object.freeze(new FormatOptions()) as FormatOptions;

  /**
   * Maximum line length used by encoders when line-wrapping headers.
   */
  maxLineLength = DEFAULT_MAX_LINE_LENGTH;
  /**
   * C# derives the default from Environment.NewLine (unix on macOS/Linux,
   * dos on Windows). An isomorphic library has no host newline; the port
   * fixes the default to 'unix', matching the oracle host (plan Q8).
   */
  newLineFormat: NewLineFormat = 'unix';
  /**
   * Whether formatted messages should always end with a new-line sequence.
   */
  ensureNewLine = false;
  /**
   * Whether a signature is currently being verified.
   *
   * C#: FormatOptions.VerifyingSignature (internal). When set, a `MimePart`
   * whose content has mixed line endings is written verbatim rather than
   * canonicalized, so the bytes fed to the signature verifier match the exact
   * bytes that were signed (see MimeKit issue #569).
   */
  verifyingSignature = false;
  /**
   * Whether internationalized email formatting rules should be used.
   *
   * This corresponds to the RFC 6530/RFC 6532 formatting mode and is intended
   * for SMTPUTF8 or UTF8 APPEND scenarios.
   */
  international = false;
  /**
   * Whether encoded headers may use us-ascii or iso-8859-1 when that improves
   * readability instead of forcing every encoded-word to use one charset.
   */
  allowMixedHeaderCharsets = false;
  /**
   * Parameter value encoding method used when a parameter requests the default
   * encoding method.
   */
  parameterEncodingMethod: ParameterEncodingMethod = 'rfc2231';
  /**
   * Whether Content-Type and Content-Disposition parameter values should always
   * be quoted, even when quoting is not required by MIME syntax.
   */
  alwaysQuoteParameterValues = false;

  /**
   * C#: FormatOptions.HiddenHeaders. Header ids that are suppressed when a
   * message is serialized (used by MessagePartial.Split to strip everything but
   * the content headers). Empty by default.
   */
  readonly hiddenHeaders = new Set<HeaderId>();

  /** C#: FormatOptions.NewLine ("\n" or "\r\n"). */
  get newLine(): string {
    return this.newLineFormat === 'unix' ? '\n' : '\r\n';
  }

  /**
   * New-line sequence encoded as bytes.
   */
  get newLineBytes(): Uint8Array {
    return new TextEncoder().encode(this.newLine);
  }

  /**
   * Create a filter that normalizes new-line sequences to the configured
   * format.
   *
   * @param ensureNewLine - Whether the filter should ensure the output ends
   * with a new-line sequence.
   * @returns A DOS-to-Unix or Unix-to-DOS new-line filter.
   */
  createNewLineFilter(ensureNewLine = false): Dos2UnixFilter | Unix2DosFilter {
    return this.newLineFormat === 'dos'
      ? new Unix2DosFilter(ensureNewLine)
      : new Dos2UnixFilter(ensureNewLine);
  }

  /**
   * Clone these formatting options.
   *
   * @returns An exact copy of the current options.
   */
  clone(): FormatOptions {
    const options = new FormatOptions();
    options.maxLineLength = this.maxLineLength;
    options.newLineFormat = this.newLineFormat;
    options.ensureNewLine = this.ensureNewLine;
    options.verifyingSignature = this.verifyingSignature;
    options.international = this.international;
    options.allowMixedHeaderCharsets = this.allowMixedHeaderCharsets;
    options.parameterEncodingMethod = this.parameterEncodingMethod;
    options.alwaysQuoteParameterValues = this.alwaysQuoteParameterValues;
    for (const id of this.hiddenHeaders) options.hiddenHeaders.add(id);
    return options;
  }
}
