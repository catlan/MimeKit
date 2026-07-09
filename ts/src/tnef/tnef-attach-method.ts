export const TnefAttachMethod = {
  None: 0,
  ByValue: 1,
  EmbeddedMessage: 5,
  Ole: 6,
} as const;
export type TnefAttachMethod = typeof TnefAttachMethod[keyof typeof TnefAttachMethod];
export function tnefAttachMethodName(value: number): string {
  return TnefAttachMethodNames.get(value) ?? `0x${value.toString(16)}`;
}
const TnefAttachMethodNames = new Map<number, string>([
  [0, 'None'],
  [1, 'ByValue'],
  [5, 'EmbeddedMessage'],
  [6, 'Ole'],
]);
