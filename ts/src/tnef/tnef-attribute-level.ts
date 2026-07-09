/** A TNEF attribute level. */
export const TnefAttributeLevel = {
  /** The attribute is a message-level attribute. */
  Message: 1,
  /** The attribute is an attachment-level attribute. */
  Attachment: 2,
} as const;
/** Numeric value of a TnefAttributeLevel. */
export type TnefAttributeLevel = typeof TnefAttributeLevel[keyof typeof TnefAttributeLevel];
/** Get a display name for a TnefAttributeLevel value. */
export function tnefAttributeLevelName(value: number): string {
  return TnefAttributeLevelNames.get(value) ?? `0x${value.toString(16)}`;
}
const TnefAttributeLevelNames = new Map<number, string>([
  [1, 'Message'],
  [2, 'Attachment'],
]);
