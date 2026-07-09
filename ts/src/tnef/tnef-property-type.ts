/** The type of value that a TNEF property contains. */
export const TnefPropertyType = {
  /** The type of the property is unspecified. */
  Unspecified: 0,
  /** The property has a null value. */
  Null: 1,
  /** The property has a signed 16-bit value. */
  I2: 2,
  /** The property has a signed 32-bit value. */
  Long: 3,
  /** The property has a 32-bit floating point value. */
  R4: 4,
  /** The property has a 64-bit floating point value. */
  Double: 5,
  /** The property has a 64-bit integer value representing 1/10000th of a monetary unit (i.e., 1/100th of a cent). */
  Currency: 6,
  /** The property has a 64-bit integer value specifying the number of 100ns periods since Jan 1, 1601. */
  AppTime: 7,
  /** The property has a 32-bit error value. */
  Error: 10,
  /** The property has a boolean value. */
  Boolean: 11,
  /** The property has an embedded object value. */
  Object: 13,
  /** The property has a signed 64-bit value. */
  I8: 20,
  /** The property has a null-terminated 8-bit character string value. */
  String8: 30,
  /** The property has a null-terminated unicode character string value. */
  Unicode: 31,
  /** The property has a 64-bit integer value specifying the number of 100ns periods since Jan 1, 1601. */
  SysTime: 64,
  /** The property has an OLE GUID value. */
  ClassId: 72,
  /** The property has a binary blob value. */
  Binary: 258,
  /** A flag indicating that the property contains multiple values. */
  MultiValued: 4096,
} as const;
/** Numeric value of a TnefPropertyType. */
export type TnefPropertyType = typeof TnefPropertyType[keyof typeof TnefPropertyType];
/** Get a display name for a TnefPropertyType value. */
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
