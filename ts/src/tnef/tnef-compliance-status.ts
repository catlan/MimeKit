/** A bitfield of potential TNEF compliance issues. */
export const TnefComplianceStatus = {
  /** The TNEF stream has no errors. */
  Compliant: 0,
  /** The TNEF stream has too many attributes. */
  AttributeOverflow: 1,
  /** The TNEF stream has one or more invalid attributes. */
  InvalidAttribute: 2,
  /** The TNEF stream has one or more attributes with invalid checksums. */
  InvalidAttributeChecksum: 4,
  /** The TNEF stream has one or more attributes with an invalid length. */
  InvalidAttributeLength: 8,
  /** The TNEF stream has one or more attributes with an invalid level. */
  InvalidAttributeLevel: 16,
  /** The TNEF stream has one or more attributes with an invalid value. */
  InvalidAttributeValue: 32,
  /** The TNEF stream has one or more attributes with an invalid date value. */
  InvalidDate: 64,
  /** The TNEF stream has one or more invalid MessageClass attributes. */
  InvalidMessageClass: 128,
  /** The TNEF stream has one or more invalid MessageCodepage attributes. */
  InvalidMessageCodepage: 256,
  /** The TNEF stream has one or more invalid property lengths. */
  InvalidPropertyLength: 512,
  /** The TNEF stream has one or more invalid row counts. */
  InvalidRowCount: 1024,
  /** The TNEF stream has an invalid signature value. */
  InvalidTnefSignature: 2048,
  /** The TNEF stream has an invalid version value. */
  InvalidTnefVersion: 4096,
  /** The TNEF stream is nested too deeply. */
  NestingTooDeep: 8192,
  /** The TNEF stream is truncated. */
  StreamTruncated: 16384,
  /** The TNEF stream has one or more unsupported property types. */
  UnsupportedPropertyType: 32768,
} as const;
/** Numeric value of a TnefComplianceStatus. */
export type TnefComplianceStatus = typeof TnefComplianceStatus[keyof typeof TnefComplianceStatus];
/** Get a display name for a TnefComplianceStatus value. */
export function tnefComplianceStatusName(value: number): string {
  return TnefComplianceStatusNames.get(value) ?? `0x${value.toString(16)}`;
}
const TnefComplianceStatusNames = new Map<number, string>([
  [0, 'Compliant'],
  [1, 'AttributeOverflow'],
  [2, 'InvalidAttribute'],
  [4, 'InvalidAttributeChecksum'],
  [8, 'InvalidAttributeLength'],
  [16, 'InvalidAttributeLevel'],
  [32, 'InvalidAttributeValue'],
  [64, 'InvalidDate'],
  [128, 'InvalidMessageClass'],
  [256, 'InvalidMessageCodepage'],
  [512, 'InvalidPropertyLength'],
  [1024, 'InvalidRowCount'],
  [2048, 'InvalidTnefSignature'],
  [4096, 'InvalidTnefVersion'],
  [8192, 'NestingTooDeep'],
  [16384, 'StreamTruncated'],
  [32768, 'UnsupportedPropertyType'],
]);
