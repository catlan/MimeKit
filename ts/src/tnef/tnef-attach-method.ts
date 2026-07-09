/**
 * The TNEF attach method.
 * The TnefAttachMethod enum contains a list of possible values for the TnefPropertyId.AttachMethod property.
 */
export const TnefAttachMethod = {
  /** No AttachMethod specified. */
  None: 0,
  /** The attachment is a binary blob and SHOULD appear in the TnefAttributeTag.AttachData attribute. */
  ByValue: 1,
  /** The attachment is an embedded TNEF message stream and MUST appear in the TnefPropertyId.AttachData property of the TnefAttributeTag.Attachment attribute. */
  EmbeddedMessage: 5,
  /** The attachment is an OLE stream and MUST appear in the TnefPropertyId.AttachData property of the TnefAttributeTag.Attachment attribute. */
  Ole: 6,
} as const;
/** Numeric value of a TnefAttachMethod. */
export type TnefAttachMethod = typeof TnefAttachMethod[keyof typeof TnefAttachMethod];
/** Get a display name for a TnefAttachMethod value. */
export function tnefAttachMethodName(value: number): string {
  return TnefAttachMethodNames.get(value) ?? `0x${value.toString(16)}`;
}
const TnefAttachMethodNames = new Map<number, string>([
  [0, 'None'],
  [1, 'ByValue'],
  [5, 'EmbeddedMessage'],
  [6, 'Ole'],
]);
