export const TnefNameIdKind = {
  Id: 0,
  Name: 1,
} as const;
export type TnefNameIdKind = typeof TnefNameIdKind[keyof typeof TnefNameIdKind];
export function tnefNameIdKindName(value: number): string {
  return TnefNameIdKindNames.get(value) ?? `0x${value.toString(16)}`;
}
const TnefNameIdKindNames = new Map<number, string>([
  [0, 'Id'],
  [1, 'Name'],
]);
