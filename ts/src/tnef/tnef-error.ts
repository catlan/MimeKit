import type { TnefComplianceStatus } from './tnef-compliance-status.js';

export class TnefError extends Error {
  readonly error: TnefComplianceStatus;

  constructor(error: TnefComplianceStatus, message?: string, options?: { cause?: unknown }) {
    super(message ?? 'TNEF compliance error', options);
    this.name = 'TnefError';
    this.error = error;
  }
}

export class EndOfStreamError extends Error {
  constructor() {
    super('Unexpected end of TNEF stream');
    this.name = 'EndOfStreamError';
  }
}
