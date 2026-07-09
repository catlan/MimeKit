import { TnefNameIdKind, type TnefNameIdKind as TnefNameIdKindValue } from './tnef-name-id-kind.js';

/**
 * A TNEF name identifier.
 */
export class TnefNameId {
  /**
   * Gets the property set GUID.
   */
  readonly propertySetGuid: string;
  /**
   * Gets the kind of TNEF name identifier.
   */
  readonly kind: TnefNameIdKindValue;
  /**
   * Gets the integer identifier when {@link kind} is {@link TnefNameIdKind.Id}.
   */
  readonly id: number;
  /**
   * Gets the string name when {@link kind} is {@link TnefNameIdKind.Name}.
   */
  readonly name: string | null;

  /**
   * Creates an empty TNEF name identifier.
   */
  constructor();
  /**
   * Creates a new TNEF name identifier with the specified integer identifier.
   *
   * @param propertySetGuid the property set GUID.
   * @param id the identifier.
   */
  constructor(propertySetGuid: string, id: number);
  /**
   * Creates a new TNEF name identifier with the specified string identifier.
   *
   * @param propertySetGuid the property set GUID.
   * @param name the name.
   */
  constructor(propertySetGuid: string, name: string);
  constructor(propertySetGuid = '00000000-0000-0000-0000-000000000000', idOrName: number | string = 0) {
    this.propertySetGuid = normalizeGuid(propertySetGuid);
    if (typeof idOrName === 'string') {
      this.kind = TnefNameIdKind.Name;
      this.name = idOrName;
      this.id = 0;
    } else {
      this.kind = TnefNameIdKind.Id;
      this.id = idOrName | 0;
      this.name = null;
    }
    Object.freeze(this);
  }

  /**
   * Determines whether another value is equal to this TNEF name identifier.
   *
   * @param other the value to compare with this identifier.
   * @returns `true` if the values are equal; otherwise, `false`.
   */
  equals(other: unknown): boolean {
    return other instanceof TnefNameId
      && this.kind === other.kind
      && this.propertySetGuid === other.propertySetGuid
      && (this.kind === TnefNameIdKind.Id ? this.id === other.id : this.name === other.name);
  }

  /**
   * Serves as a hash function for this TNEF name identifier.
   *
   * @returns a hash code suitable for hashing algorithms and data structures.
   */
  hashCode(): number {
    return hashString(this.propertySetGuid) ^ this.kind ^ (this.kind === TnefNameIdKind.Id ? this.id : hashString(this.name ?? ''));
  }
}

/**
 * Convert a 16-byte little-endian GUID value to its string representation.
 *
 * @param bytes the bytes containing the GUID.
 * @returns the GUID string.
 * @throws {RangeError} `bytes` contains fewer than 16 bytes.
 */
export function guidFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 16) throw new RangeError('guid requires 16 bytes');
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const b = Array.from(bytes.subarray(0, 16), hex);
  return `${b[3]}${b[2]}${b[1]}${b[0]}-${b[5]}${b[4]}-${b[7]}${b[6]}-${b[8]}${b[9]}-${b[10]}${b[11]}${b[12]}${b[13]}${b[14]}${b[15]}`;
}

function normalizeGuid(guid: string): string {
  return guid.toLowerCase();
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++)
    hash = ((hash * 31) + value.charCodeAt(i)) | 0;
  return hash;
}
