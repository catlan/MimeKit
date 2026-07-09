/** The kind of TNEF name identifier. */
export const TnefNameIdKind = {
  /** The property name is an integer. */
  Id: 0,
  /** The property name is a string. */
  Name: 1,
} as const;
/** Numeric value of a TnefNameIdKind. */
export type TnefNameIdKind = typeof TnefNameIdKind[keyof typeof TnefNameIdKind];
/** Get a display name for a TnefNameIdKind value. */
export function tnefNameIdKindName(value: number): string {
  return TnefNameIdKindNames.get(value) ?? `0x${value.toString(16)}`;
}
const TnefNameIdKindNames = new Map<number, string>([
  [0, 'Id'],
  [1, 'Name'],
]);
