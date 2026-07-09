import type { TnefComplianceStatus } from './tnef-compliance-status.js';

/**
 * An error raised for a TNEF compliance issue in strict mode.
 */
export class TnefError extends Error {
  /**
   * Gets the compliance issue that caused the error.
   */
  readonly error: TnefComplianceStatus;

  /**
   * Creates a new TNEF compliance error.
   *
   * @param error the compliance issue.
   * @param message the error message.
   * @param options optional error options.
   */
  constructor(error: TnefComplianceStatus, message?: string, options?: { cause?: unknown }) {
    super(message ?? 'TNEF compliance error', options);
    this.name = 'TnefError';
    this.error = error;
  }
}

/**
 * An error raised when the TNEF stream ends unexpectedly.
 */
export class EndOfStreamError extends Error {
  /**
   * Creates a new unexpected end-of-stream error.
   */
  constructor() {
    super('Unexpected end of TNEF stream');
    this.name = 'EndOfStreamError';
  }
}
