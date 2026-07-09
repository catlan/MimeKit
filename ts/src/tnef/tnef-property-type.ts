export const TnefPropertyType = {
  Unspecified: 0,
  Null: 1,
  I2: 2,
  Long: 3,
  R4: 4,
  Double: 5,
  Currency: 6,
  AppTime: 7,
  Error: 10,
  Boolean: 11,
  Object: 13,
  I8: 20,
  String8: 30,
  Unicode: 31,
  SysTime: 64,
  ClassId: 72,
  Binary: 258,
  MultiValued: 4096,
} as const;
export type TnefPropertyType = typeof TnefPropertyType[keyof typeof TnefPropertyType];
export function tnefPropertyTypeName(value: number): string {
  return TnefPropertyTypeNames.get(value) ?? `0x${value.toString(16)}`;
}
const TnefPropertyTypeNames = new Map<number, string>([
  [0, 'Unspecified'],
  [1, 'Null'],
  [2, 'I2'],
  [3, 'Long'],
  [4, 'R4'],
  [5, 'Double'],
  [6, 'Currency'],
  [7, 'AppTime'],
  [10, 'Error'],
  [11, 'Boolean'],
  [13, 'Object'],
  [20, 'I8'],
  [30, 'String8'],
  [31, 'Unicode'],
  [64, 'SysTime'],
  [72, 'ClassId'],
  [258, 'Binary'],
  [4096, 'MultiValued'],
]);
