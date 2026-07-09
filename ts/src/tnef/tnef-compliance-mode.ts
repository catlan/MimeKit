/**
 * A TNEF compliance mode.
 */
export type TnefComplianceMode = 'loose' | 'strict';
/**
 * TNEF compliance mode values.
 */
export const TnefComplianceMode = { Loose: 'loose' as TnefComplianceMode, Strict: 'strict' as TnefComplianceMode } as const;
