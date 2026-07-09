/** A RTF compression mode. */
export const RtfCompressionMode = {
  /** The compression mode is not known. */
  Unknown: 0,
  /** The RTF stream is not compressed. */
  Uncompressed: 1095517517,
  /** The RTF stream is compressed. */
  Compressed: 1967544908,
} as const;
/** Numeric value of a RtfCompressionMode. */
export type RtfCompressionMode = typeof RtfCompressionMode[keyof typeof RtfCompressionMode];
/** Get a display name for a RtfCompressionMode value. */
export function rtfCompressionModeName(value: number): string {
  return RtfCompressionModeNames.get(value) ?? `0x${value.toString(16)}`;
}
const RtfCompressionModeNames = new Map<number, string>([
  [0, 'Unknown'],
  [1095517517, 'Uncompressed'],
  [1967544908, 'Compressed'],
]);
