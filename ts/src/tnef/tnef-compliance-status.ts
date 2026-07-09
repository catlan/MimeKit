export const TnefComplianceStatus = {
  Compliant: 0,
  AttributeOverflow: 1,
  InvalidAttribute: 2,
  InvalidAttributeChecksum: 4,
  InvalidAttributeLength: 8,
  InvalidAttributeLevel: 16,
  InvalidAttributeValue: 32,
  InvalidDate: 64,
  InvalidMessageClass: 128,
  InvalidMessageCodepage: 256,
  InvalidPropertyLength: 512,
  InvalidRowCount: 1024,
  InvalidTnefSignature: 2048,
  InvalidTnefVersion: 4096,
  NestingTooDeep: 8192,
  StreamTruncated: 16384,
  UnsupportedPropertyType: 32768,
} as const;
export type TnefComplianceStatus = typeof TnefComplianceStatus[keyof typeof TnefComplianceStatus];
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
