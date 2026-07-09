export const RtfCompressionMode = {
  Unknown: 0,
  Uncompressed: 1095517517,
  Compressed: 1967544908,
} as const;
export type RtfCompressionMode = typeof RtfCompressionMode[keyof typeof RtfCompressionMode];
export function rtfCompressionModeName(value: number): string {
  return RtfCompressionModeNames.get(value) ?? `0x${value.toString(16)}`;
}
const RtfCompressionModeNames = new Map<number, string>([
  [0, 'Unknown'],
  [1095517517, 'Uncompressed'],
  [1967544908, 'Compressed'],
]);
