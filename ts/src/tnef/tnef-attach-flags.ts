/** The TNEF attach flags. */
export const TnefAttachFlags = {
  /** No AttachFlags set. */
  None: 0,
  /** The attachment is invisible in HTML bodies. */
  InvisibleInHtml: 1,
  /** The attachment is invisible in RTF bodies. */
  InvisibleInRtf: 2,
  /** The attachment is referenced (and rendered) by the HTML body. */
  RenderedInBody: 4,
} as const;
/** Numeric value of a TnefAttachFlags. */
export type TnefAttachFlags = typeof TnefAttachFlags[keyof typeof TnefAttachFlags];
/** Get a display name for a TnefAttachFlags value. */
export function tnefAttachFlagsName(value: number): string {
  return TnefAttachFlagsNames.get(value) ?? `0x${value.toString(16)}`;
}
const TnefAttachFlagsNames = new Map<number, string>([
  [0, 'None'],
  [1, 'InvisibleInHtml'],
  [2, 'InvisibleInRtf'],
  [4, 'RenderedInBody'],
]);
