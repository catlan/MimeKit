// Port of MimeKit/Cryptography/DkimBodyFilter.cs.

import { MimeFilterBase } from '../io/filters/mime-filter-base.js';

/**
 * A base implementation for DKIM body filters.
 */
export abstract class DkimBodyFilter extends MimeFilterBase {
  /** Whether the last filtered character was a newline. */
  lastWasNewLine = false;

  /** Whether the current line is empty. */
  protected isEmptyLine = false;

  /** The number of consecutive empty lines encountered. */
  protected emptyLines = 0;
}
