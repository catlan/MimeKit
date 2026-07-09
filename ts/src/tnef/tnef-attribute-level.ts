export const TnefAttributeLevel = {
  Message: 1,
  Attachment: 2,
} as const;
export type TnefAttributeLevel = typeof TnefAttributeLevel[keyof typeof TnefAttributeLevel];
export function tnefAttributeLevelName(value: number): string {
  return TnefAttributeLevelNames.get(value) ?? `0x${value.toString(16)}`;
}
const TnefAttributeLevelNames = new Map<number, string>([
  [1, 'Message'],
  [2, 'Attachment'],
]);
