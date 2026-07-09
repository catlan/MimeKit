import { TnefNameIdKind, type TnefNameIdKind as TnefNameIdKindValue } from './tnef-name-id-kind.js';

export class TnefNameId {
  readonly propertySetGuid: string;
  readonly kind: TnefNameIdKindValue;
  readonly id: number;
  readonly name: string | null;

  constructor();
  constructor(propertySetGuid: string, id: number);
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

  equals(other: unknown): boolean {
    return other instanceof TnefNameId
      && this.kind === other.kind
      && this.propertySetGuid === other.propertySetGuid
      && (this.kind === TnefNameIdKind.Id ? this.id === other.id : this.name === other.name);
  }

  hashCode(): number {
    return hashString(this.propertySetGuid) ^ this.kind ^ (this.kind === TnefNameIdKind.Id ? this.id : hashString(this.name ?? ''));
  }
}

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
