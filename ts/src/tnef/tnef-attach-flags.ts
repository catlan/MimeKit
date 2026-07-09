export const TnefAttachFlags = {
  None: 0,
  InvisibleInHtml: 1,
  InvisibleInRtf: 2,
  RenderedInBody: 4,
} as const;
export type TnefAttachFlags = typeof TnefAttachFlags[keyof typeof TnefAttachFlags];
export function tnefAttachFlagsName(value: number): string {
  return TnefAttachFlagsNames.get(value) ?? `0x${value.toString(16)}`;
}
const TnefAttachFlagsNames = new Map<number, string>([
  [0, 'None'],
  [1, 'InvisibleInHtml'],
  [2, 'InvisibleInRtf'],
  [4, 'RenderedInBody'],
]);
