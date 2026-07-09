import { tryGetEncoding } from '../utils/charset-utils.js';
import { TnefAttachMethod } from './tnef-attach-method.js';
import { TnefAttributeTag } from './tnef-attribute-tag.js';
import { TnefComplianceStatus } from './tnef-compliance-status.js';
import { guidFromBytes, TnefNameId } from './tnef-name-id.js';
import { TnefNameIdKind } from './tnef-name-id-kind.js';
import { TnefPropertyId } from './tnef-property-id.js';
import { TnefPropertyTag } from './tnef-property-tag.js';
import { TnefPropertyType } from './tnef-property-type.js';
import { TnefReaderStream } from './tnef-reader-stream.js';
import type { TnefReader } from './tnef-reader.js';

export type TnefValueType = 'object' | 'boolean' | 'number' | 'date' | 'string' | 'bytes' | 'guid' | 'null';

export class TnefPropertyReader {
  propertyTag = TnefPropertyTag.Null;
  propertyNameId = new TnefNameId();
  rawValueStreamOffset = 0;
  rawValueLength = 0;
  propertyCount = 0;
  valueCount = 0;
  rowCount = 0;
  attachMethod: number = TnefAttachMethod.None;

  private propertyIndex = 0;
  private valueIndex = 0;
  private rowIndex = 0;
  private textDecoder: TextDecoder | null = null;

  constructor(private readonly reader: TnefReader) {}

  get isEmbeddedMessage(): boolean {
    return this.propertyTag.id === TnefPropertyId.AttachData && this.attachMethod === TnefAttachMethod.EmbeddedMessage;
  }

  get isMultiValuedProperty(): boolean { return this.propertyTag.isMultiValued; }
  get isNamedProperty(): boolean { return this.propertyTag.isNamed; }
  get isObjectProperty(): boolean { return this.propertyTag.valueTnefType === TnefPropertyType.Object; }

  get valueType(): TnefValueType {
    return this.propertyCount > 0 ? this.getPropertyValueType() : this.getAttributeValueType();
  }

  getRawValueReadStream(): TnefReaderStream {
    if (this.valueIndex >= this.valueCount) throw new TypeError('The property does not contain any more values.');
    const startOffset = this.rawValueStreamOffset;
    let length = this.rawValueLength;
    if (this.propertyCount > 0 && this.reader.streamOffset === this.rawValueStreamOffset) {
      switch (this.propertyTag.valueTnefType) {
      case TnefPropertyType.Unicode:
      case TnefPropertyType.String8:
      case TnefPropertyType.Binary:
      case TnefPropertyType.Object: {
        const n = this.readInt32();
        if (n >= 0 && n < length - 4) length = n + 4;
        break;
      }
      }
    }
    this.valueIndex++;
    return new TnefReaderStream(this.reader, startOffset + length, startOffset + this.rawValueLength);
  }

  getEmbeddedMessageReader(): TnefReader {
    if (!this.isEmbeddedMessage) throw new TypeError('The property value is not an embedded message.');
    const stream = this.getRawValueReadStream();
    const guid = new Uint8Array(16);
    let offset = 0;
    while (offset < 16) {
      const n = stream.read(guid, offset, 16 - offset);
      if (n === 0) break;
      offset += n;
    }
    return new (this.reader.constructor as typeof import('./tnef-reader.js').TnefReader)(stream, this.reader.messageCodepage, this.reader.complianceMode);
  }

  readNextProperty(): boolean {
    while (this.readNextValue()) {}
    if (this.propertyIndex >= this.propertyCount) return false;
    try {
      const type = this.readInt16() & 0xffff;
      const id = this.readInt16() & 0xffff;
      this.propertyTag = new TnefPropertyTag(id as never, type as never);
      if (this.propertyTag.isNamed) this.loadPropertyName();
      this.loadValueCount();
      this.propertyIndex++;
      const length = this.tryGetPropertyValueLength();
      if (length === null) return false;
      this.rawValueLength = length;
      this.rawValueStreamOffset = this.reader.streamOffset;
      if (id === TnefPropertyId.AttachMethod)
        this.attachMethod = this.reader.peekInt32();
    } catch {
      return false;
    }
    return this.checkRawValueLength();
  }

  readNextRow(): boolean {
    while (this.readNextProperty()) {}
    if (this.rowIndex >= this.rowCount) return false;
    try {
      this.loadPropertyCount();
      this.rowIndex++;
    } catch {
      this.reader.setComplianceError(TnefComplianceStatus.StreamTruncated);
      return false;
    }
    return true;
  }

  readNextValue(): boolean {
    if (this.valueIndex >= this.valueCount || this.propertyCount === 0) return false;
    const offset = this.rawValueStreamOffset + this.rawValueLength;
    if (this.reader.streamOffset < offset && !this.reader.skip(offset - this.reader.streamOffset)) return false;
    try {
      const length = this.tryGetPropertyValueLength();
      if (length === null) return false;
      this.rawValueLength = length;
      this.rawValueStreamOffset = this.reader.streamOffset;
      this.valueIndex++;
    } catch {
      return false;
    }
    return true;
  }

  readRawValue(buffer: Uint8Array, offset: number, count: number): number {
    if (this.propertyCount > 0 && this.reader.streamOffset === this.rawValueStreamOffset && isLengthPrefixed(this.propertyTag.valueTnefType))
      this.readInt32();
    const valueLeft = this.rawValueStreamOffset + this.rawValueLength - this.reader.streamOffset;
    const n = Math.min(valueLeft, count);
    return n > 0 ? this.reader.readAttributeRawValue(buffer, offset, n) : 0;
  }

  readTextValue(buffer: string[], offset: number, count: number): number {
    if (!Array.isArray(buffer)) throw new TypeError('buffer must be an array');
    if (offset < 0 || offset >= buffer.length) throw new RangeError('offset out of range');
    if (count < 0 || count > buffer.length - offset) throw new RangeError('count out of range');

    if (this.textDecoder === null) {
      if (this.reader.streamOffset !== this.rawValueStreamOffset)
        throw new TypeError('Text value is not readable.');

      if (this.propertyCount > 0) {
        switch (this.propertyTag.valueTnefType) {
        case TnefPropertyType.Unicode:
          this.readInt32();
          this.textDecoder = new TextDecoder('utf-16le');
          break;
        case TnefPropertyType.String8:
        case TnefPropertyType.Binary:
        case TnefPropertyType.Object:
          this.readInt32();
          this.textDecoder = new TextDecoder((tryGetEncoding(String(this.reader.messageCodepage)) ?? tryGetEncoding(codepageName(this.reader.messageCodepage)) ?? tryGetEncoding('windows-1252')!).webName);
          break;
        default:
          throw new TypeError('Text value is not readable.');
        }
      } else {
        switch (this.reader.attributeType) {
        case 0x00010000:
        case 0x00020000:
        case 0x00060000:
          this.textDecoder = new TextDecoder((tryGetEncoding(String(this.reader.messageCodepage)) ?? tryGetEncoding(codepageName(this.reader.messageCodepage)) ?? tryGetEncoding('windows-1252')!).webName);
          break;
        default:
          throw new TypeError('Text value is not readable.');
        }
      }
    }

    const valueEndOffset = this.rawValueStreamOffset + this.rawValueLength;
    const valueLeft = valueEndOffset - this.reader.streamOffset;
    const nbytes = Math.min(valueLeft, count);
    if (nbytes <= 0) {
      this.valueIndex++;
      this.textDecoder = null;
      return 0;
    }
    const bytes = new Uint8Array(nbytes);
    const nread = this.reader.readAttributeRawValue(bytes, 0, nbytes);
    const flush = this.reader.streamOffset >= valueEndOffset;
    const text = this.textDecoder.decode(bytes.subarray(0, nread), { stream: !flush });
    const n = Math.min(count, text.length);
    for (let i = 0; i < n; i++) buffer[offset + i] = text[i]!;
    if (flush) {
      this.valueIndex++;
      this.textDecoder = null;
    }
    return n;
  }

  readValue(): unknown {
    this.ensureReadable();
    if (this.propertyCount > 0) return this.readPropertyValue();
    let value: unknown = null;
    switch (this.reader.attributeType) {
    case 0x00000000:
    case 0x00060000: value = this.readAttrBytes(); break;
    case 0x00010000:
    case 0x00020000: value = this.readAttrString(); break;
    case 0x00030000: value = this.readAttrDateTime(); break;
    case 0x00040000:
    case 0x00070000: value = this.readInt16(); break;
    case 0x00050000:
    case 0x00080000: value = this.readInt32(); break;
    }
    this.valueIndex++;
    return value;
  }

  readValueAsBoolean(): boolean {
    this.ensureReadable();
    let value: boolean;
    if (this.propertyCount > 0) {
      switch (this.propertyTag.valueTnefType) {
      case TnefPropertyType.Boolean: value = (this.readInt32() & 0xff) !== 0; break;
      case TnefPropertyType.I2: value = (this.readInt32() & 0xffff) !== 0; break;
      case TnefPropertyType.Error:
      case TnefPropertyType.Long: value = this.readInt32() !== 0; break;
      case TnefPropertyType.Currency:
      case TnefPropertyType.I8: value = this.readInt64() !== 0; break;
      default: throw new TypeError('Value cannot be read as boolean');
      }
    } else {
      switch (this.reader.attributeType) {
      case 0x00040000:
      case 0x00070000: value = this.readInt16() !== 0; break;
      case 0x00050000:
      case 0x00080000: value = this.readInt32() !== 0; break;
      case 0x00060000: value = this.readByte() !== 0; break;
      default: throw new TypeError('Value cannot be read as boolean');
      }
    }
    this.valueIndex++;
    return value;
  }

  readValueAsBytes(): Uint8Array {
    this.ensureReadable();
    let bytes: Uint8Array;
    if (this.propertyCount > 0) {
      switch (this.propertyTag.valueTnefType) {
      case TnefPropertyType.Unicode:
      case TnefPropertyType.String8:
      case TnefPropertyType.Binary:
      case TnefPropertyType.Object: bytes = this.readByteArray(); break;
      case TnefPropertyType.ClassId: bytes = this.readBytes(16); break;
      default: throw new TypeError('Value cannot be read as bytes');
      }
    } else {
      switch (this.reader.attributeType) {
      case 0x00000000:
      case 0x00010000:
      case 0x00020000:
      case 0x00060000: bytes = this.readAttrBytes(); break;
      default: throw new TypeError('Value cannot be read as bytes');
      }
    }
    this.valueIndex++;
    return bytes;
  }

  readValueAsDateTime(): Date {
    this.ensureReadable();
    let value: Date;
    if (this.propertyCount > 0) {
      switch (this.propertyTag.valueTnefType) {
      case TnefPropertyType.AppTime: value = this.readAppTime(); break;
      case TnefPropertyType.SysTime: value = this.readSysTime(); break;
      default: throw new TypeError('Value cannot be read as date');
      }
    } else if (this.reader.attributeType === 0x00030000) {
      value = this.readAttrDateTime();
    } else {
      throw new TypeError('Value cannot be read as date');
    }
    this.valueIndex++;
    return value;
  }

  readValueAsDouble(): number {
    this.ensureReadable();
    let value: number;
    if (this.propertyCount > 0) {
      switch (this.propertyTag.valueTnefType) {
      case TnefPropertyType.Boolean: value = this.readInt32() & 0xff; break;
      case TnefPropertyType.I2: value = this.readInt32() & 0xffff; break;
      case TnefPropertyType.Error:
      case TnefPropertyType.Long: value = this.readInt32(); break;
      case TnefPropertyType.Currency:
      case TnefPropertyType.I8: value = this.readInt64(); break;
      case TnefPropertyType.Double: value = this.readDouble(); break;
      case TnefPropertyType.R4: value = this.readSingle(); break;
      default: throw new TypeError('Value cannot be read as double');
      }
    } else {
      switch (this.reader.attributeType) {
      case 0x00040000: value = this.readInt16(); break;
      case 0x00050000: value = this.readInt32(); break;
      case 0x00070000: value = this.readInt16(); break;
      case 0x00080000: value = this.readInt32(); break;
      case 0x00060000: value = this.readDouble(); break;
      default: throw new TypeError('Value cannot be read as double');
      }
    }
    this.valueIndex++;
    return value;
  }

  readValueAsFloat(): number {
    this.ensureReadable();
    let value: number;
    if (this.propertyCount > 0) {
      switch (this.propertyTag.valueTnefType) {
      case TnefPropertyType.Boolean: value = this.readInt32() & 0xff; break;
      case TnefPropertyType.I2: value = this.readInt32() & 0xffff; break;
      case TnefPropertyType.Error:
      case TnefPropertyType.Long: value = this.readInt32(); break;
      case TnefPropertyType.Currency:
      case TnefPropertyType.I8: value = this.readInt64(); break;
      case TnefPropertyType.Double: value = this.readDouble(); break;
      case TnefPropertyType.R4: value = this.readSingle(); break;
      default: throw new TypeError('Value cannot be read as float');
      }
    } else {
      switch (this.reader.attributeType) {
      case 0x00040000: value = this.readInt16(); break;
      case 0x00050000: value = this.readInt32(); break;
      case 0x00070000: value = this.readInt16(); break;
      case 0x00080000: value = this.readInt32(); break;
      case 0x00060000: value = this.readSingle(); break;
      default: throw new TypeError('Value cannot be read as float');
      }
    }
    this.valueIndex++;
    return value;
  }

  readValueAsInt16(): number {
    this.ensureReadable();
    let value: number;
    if (this.propertyCount > 0) {
      switch (this.propertyTag.valueTnefType) {
      case TnefPropertyType.Boolean: value = toInt16(this.readInt32() & 0xff); break;
      case TnefPropertyType.I2: value = toInt16(this.readInt32() & 0xffff); break;
      case TnefPropertyType.Error:
      case TnefPropertyType.Long: value = toInt16(this.readInt32()); break;
      case TnefPropertyType.Currency:
      case TnefPropertyType.I8: value = toInt16(this.readInt64()); break;
      case TnefPropertyType.Double: value = toInt16(this.readDouble()); break;
      case TnefPropertyType.R4: value = toInt16(this.readSingle()); break;
      default: throw new TypeError('Value cannot be read as int16');
      }
    } else {
      switch (this.reader.attributeType) {
      case 0x00040000: value = this.readInt16(); break;
      case 0x00050000: value = toInt16(this.readInt32()); break;
      case 0x00070000: value = this.readInt16(); break;
      case 0x00080000: value = toInt16(this.readInt32()); break;
      case 0x00060000: value = this.readInt16(); break;
      default: throw new TypeError('Value cannot be read as int16');
      }
    }
    this.valueIndex++;
    return value;
  }

  readValueAsInt32(): number {
    this.ensureReadable();
    let value: number;
    if (this.propertyCount > 0) {
      switch (this.propertyTag.valueTnefType) {
      case TnefPropertyType.Boolean: value = this.readInt32() & 0xff; break;
      case TnefPropertyType.I2: value = this.readInt32() & 0xffff; break;
      case TnefPropertyType.Error:
      case TnefPropertyType.Long: value = this.readInt32(); break;
      case TnefPropertyType.Currency:
      case TnefPropertyType.I8: value = this.readInt64() | 0; break;
      case TnefPropertyType.Double: value = this.readDouble() | 0; break;
      case TnefPropertyType.R4: value = this.readSingle() | 0; break;
      default: throw new TypeError('Value cannot be read as int32');
      }
    } else {
      switch (this.reader.attributeType) {
      case 0x00040000: value = this.readInt16(); break;
      case 0x00050000: value = this.readInt32(); break;
      case 0x00070000: value = this.readInt16(); break;
      case 0x00080000: value = this.readInt32(); break;
      case 0x00060000: value = this.readInt32(); break;
      default: throw new TypeError('Value cannot be read as int32');
      }
    }
    this.valueIndex++;
    return value | 0;
  }

  readValueAsInt64(): number {
    this.ensureReadable();
    let value: number;
    if (this.propertyCount > 0) {
      switch (this.propertyTag.valueTnefType) {
      case TnefPropertyType.Boolean: value = this.readInt32() & 0xff; break;
      case TnefPropertyType.I2: value = this.readInt32() & 0xffff; break;
      case TnefPropertyType.Error:
      case TnefPropertyType.Long: value = this.readInt32(); break;
      case TnefPropertyType.Currency:
      case TnefPropertyType.I8: value = this.readInt64(); break;
      case TnefPropertyType.Double: value = Math.trunc(this.readDouble()); break;
      case TnefPropertyType.R4: value = Math.trunc(this.readSingle()); break;
      default: throw new TypeError('Value cannot be read as int64');
      }
    } else {
      switch (this.reader.attributeType) {
      case 0x00040000: value = this.readInt16(); break;
      case 0x00050000: value = this.readInt32(); break;
      case 0x00070000: value = this.readInt16(); break;
      case 0x00080000: value = this.readInt32(); break;
      case 0x00060000: value = this.readInt64(); break;
      default: throw new TypeError('Value cannot be read as int64');
      }
    }
    this.valueIndex++;
    return value;
  }

  readValueAsGuid(): string {
    this.ensureReadable();
    if (this.propertyCount <= 0 || this.propertyTag.valueTnefType !== TnefPropertyType.ClassId)
      throw new TypeError('Value cannot be read as guid');
    const value = guidFromBytes(this.readBytes(16));
    this.valueIndex++;
    return value;
  }

  readValueAsString(): string {
    this.ensureReadable();
    let value: string;
    if (this.propertyCount > 0) {
      switch (this.propertyTag.valueTnefType) {
      case TnefPropertyType.Unicode: value = this.readUnicodeString(); break;
      case TnefPropertyType.String8:
      case TnefPropertyType.Binary: value = this.readString(); break;
      default: throw new TypeError('Value cannot be read as string');
      }
    } else {
      switch (this.reader.attributeType) {
      case 0x00010000:
      case 0x00020000:
      case 0x00060000: value = this.readAttrString(); break;
      default: throw new TypeError('Value cannot be read as string');
      }
    }
    this.valueIndex++;
    return value;
  }

  readValueAsUri(): URL | string | null {
    const value = this.readValueAsString();
    if (value.length === 0) return null;
    try { return new URL(value); } catch {
      return isWellFormedRelativeUri(value) ? value : null;
    }
  }

  load(): void {
    this.propertyTag = TnefPropertyTag.Null;
    this.rawValueStreamOffset = 0;
    this.rawValueLength = 0;
    this.propertyCount = 0;
    this.propertyIndex = 0;
    this.valueCount = 0;
    this.valueIndex = 0;
    this.rowCount = 0;
    this.rowIndex = 0;
    switch (this.reader.attributeTag) {
    case TnefAttributeTag.MapiProperties:
    case TnefAttributeTag.Attachment:
      this.loadPropertyCount();
      break;
    case TnefAttributeTag.RecipientTable:
      this.loadRowCount();
      break;
    default:
      this.rawValueLength = this.reader.attributeRawValueLength;
      this.rawValueStreamOffset = this.reader.streamOffset;
      this.valueCount = 1;
      break;
    }
  }

  private readByte(): number { return this.reader.readByte(); }
  private readInt16(): number { return this.reader.readInt16(); }
  private readInt32(): number { return this.reader.readInt32(); }
  private readInt64(): number { return this.reader.readInt64(); }
  private readSingle(): number { return this.reader.readSingle(); }
  private readDouble(): number { return this.reader.readDouble(); }

  private readBytes(count: number): Uint8Array {
    const bytes = new Uint8Array(count);
    let offset = 0;
    while (offset < count) {
      const n = this.reader.readAttributeRawValue(bytes, offset, count - offset);
      if (n === 0) break;
      offset += n;
    }
    return bytes;
  }

  private readAppTime(): Date {
    const oa = this.readDouble();
    return new Date(Date.UTC(1899, 11, 30) + oa * 86400000);
  }

  private readSysTime(): Date {
    const fileTime = this.readInt64();
    return new Date(fileTime / 10000 - 11644473600000);
  }

  private readByteArray(): Uint8Array {
    const length = this.readInt32();
    const bytes = this.readBytes(Math.max(length, 0));
    const padding = (4 - (length % 4)) & 3;
    if (padding) this.reader.skip(padding);
    return bytes;
  }

  private readUnicodeString(): string {
    const bytes = this.readByteArray();
    let length = bytes.length & ~1;
    while (length > 1 && bytes[length - 1] === 0 && bytes[length - 2] === 0) length -= 2;
    if (length < 2) return '';
    return new TextDecoder('utf-16le').decode(bytes.subarray(0, length));
  }

  private decodeAnsiString(bytes: Uint8Array): string {
    let length = bytes.length;
    while (length > 0 && bytes[length - 1] === 0) length--;
    if (length === 0) return '';
    const encoding = tryGetEncoding(String(this.reader.messageCodepage)) ?? tryGetEncoding(codepageName(this.reader.messageCodepage)) ?? tryGetEncoding('windows-1252')!;
    return encoding.decode(bytes.subarray(0, length));
  }

  private readString(): string { return this.decodeAnsiString(this.readByteArray()); }
  private readAttrBytes(): Uint8Array { return this.readBytes(this.rawValueLength); }
  private readAttrString(): string { return this.decodeAnsiString(this.readBytes(this.rawValueLength)); }

  private readAttrDateTime(): Date {
    const year = this.readInt16();
    const month = this.readInt16();
    const day = this.readInt16();
    const hour = this.readInt16();
    const minute = this.readInt16();
    const second = this.readInt16();
    this.readInt16();
    if (!isValidDateTime(year, month, day, hour, minute, second)) {
      this.reader.setComplianceError(TnefComplianceStatus.InvalidDate);
      return new Date(0);
    }
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  private loadPropertyName(): void {
    const guid = guidFromBytes(this.readBytes(16));
    const kind = this.readInt32();
    if (kind === TnefNameIdKind.Name) {
      this.propertyNameId = new TnefNameId(guid, this.readUnicodeString());
    } else if (kind === TnefNameIdKind.Id) {
      this.propertyNameId = new TnefNameId(guid, this.readInt32());
    } else {
      this.reader.setComplianceError(TnefComplianceStatus.InvalidAttributeValue);
      this.propertyNameId = new TnefNameId(guid, 0);
    }
  }

  private loadPropertyCount(): void {
    this.propertyCount = this.readInt32();
    if (this.propertyCount < 0) {
      this.reader.setComplianceError(TnefComplianceStatus.InvalidPropertyLength);
      this.propertyCount = 0;
    }
    this.propertyIndex = 0;
    this.valueCount = 0;
    this.valueIndex = 0;
  }

  private readValueCount(): number {
    const count = this.readInt32();
    if (count < 0) {
      this.reader.setComplianceError(TnefComplianceStatus.InvalidAttributeValue);
      return 0;
    }
    return count;
  }

  private loadValueCount(): void {
    if (this.propertyTag.isMultiValued || isLengthPrefixed(this.propertyTag.valueTnefType))
      this.valueCount = this.readValueCount();
    else
      this.valueCount = 1;
    this.valueIndex = 0;
  }

  private loadRowCount(): void {
    this.rowCount = this.readInt32();
    if (this.rowCount < 0) {
      this.reader.setComplianceError(TnefComplianceStatus.InvalidRowCount);
      this.rowCount = 0;
    }
    this.propertyCount = 0;
    this.propertyIndex = 0;
    this.valueCount = 0;
    this.valueIndex = 0;
    this.rowIndex = 0;
  }

  private tryGetPropertyValueLength(): number | null {
    switch (this.propertyTag.valueTnefType) {
    case TnefPropertyType.Unspecified:
    case TnefPropertyType.Null: return 0;
    case TnefPropertyType.Boolean:
    case TnefPropertyType.Error:
    case TnefPropertyType.Long:
    case TnefPropertyType.R4:
    case TnefPropertyType.I2: return 4;
    case TnefPropertyType.Currency:
    case TnefPropertyType.Double:
    case TnefPropertyType.I8:
    case TnefPropertyType.AppTime:
    case TnefPropertyType.SysTime: return 8;
    case TnefPropertyType.ClassId: return 16;
    case TnefPropertyType.Unicode:
    case TnefPropertyType.String8:
    case TnefPropertyType.Binary:
    case TnefPropertyType.Object: return 4 + getPaddedLength(this.reader.peekInt32());
    default:
      this.reader.setComplianceError(TnefComplianceStatus.UnsupportedPropertyType);
      return null;
    }
  }

  private getPropertyValueType(): TnefValueType {
    switch (this.propertyTag.valueTnefType) {
    case TnefPropertyType.Null: return 'null';
    case TnefPropertyType.Boolean: return 'boolean';
    case TnefPropertyType.AppTime:
    case TnefPropertyType.SysTime: return 'date';
    case TnefPropertyType.Unicode:
    case TnefPropertyType.String8: return 'string';
    case TnefPropertyType.Binary:
    case TnefPropertyType.Object: return 'bytes';
    case TnefPropertyType.ClassId: return 'guid';
    case TnefPropertyType.I2:
    case TnefPropertyType.Currency:
    case TnefPropertyType.I8:
    case TnefPropertyType.Error:
    case TnefPropertyType.Long:
    case TnefPropertyType.Double:
    case TnefPropertyType.R4: return 'number';
    default: return 'object';
    }
  }

  private getAttributeValueType(): TnefValueType {
    switch (this.reader.attributeType) {
    case 0x00000000:
    case 0x00060000: return 'bytes';
    case 0x00010000:
    case 0x00020000: return 'string';
    case 0x00030000: return 'date';
    case 0x00040000:
    case 0x00050000:
    case 0x00070000:
    case 0x00080000: return 'number';
    default: return 'object';
    }
  }

  private readPropertyValue(): unknown {
    let value: unknown;
    switch (this.propertyTag.valueTnefType) {
    case TnefPropertyType.Null: value = null; break;
    case TnefPropertyType.I2: value = toInt16(this.readInt32() & 0xffff); break;
    case TnefPropertyType.Boolean: value = (this.readInt32() & 0xff) !== 0; break;
    case TnefPropertyType.Currency:
    case TnefPropertyType.I8: value = this.readInt64(); break;
    case TnefPropertyType.Error:
    case TnefPropertyType.Long: value = this.readInt32(); break;
    case TnefPropertyType.Double: value = this.readDouble(); break;
    case TnefPropertyType.R4: value = this.readSingle(); break;
    case TnefPropertyType.AppTime: value = this.readAppTime(); break;
    case TnefPropertyType.SysTime: value = this.readSysTime(); break;
    case TnefPropertyType.Unicode: value = this.readUnicodeString(); break;
    case TnefPropertyType.String8: value = this.readString(); break;
    case TnefPropertyType.Binary:
    case TnefPropertyType.Object: value = this.readByteArray(); break;
    case TnefPropertyType.ClassId: value = guidFromBytes(this.readBytes(16)); break;
    default:
      this.reader.setComplianceError(TnefComplianceStatus.UnsupportedPropertyType);
      value = null;
      break;
    }
    this.valueIndex++;
    return value;
  }

  private ensureReadable(): void {
    if (this.valueIndex >= this.valueCount || this.reader.streamOffset > this.rawValueStreamOffset)
      throw new TypeError('There are no more values to read.');
  }

  private checkRawValueLength(): boolean {
    if (this.rawValueStreamOffset + this.rawValueLength > this.reader.attributeRawValueStreamOffset + this.reader.attributeRawValueLength) {
      this.reader.setComplianceError(TnefComplianceStatus.InvalidAttributeValue);
      return false;
    }
    return true;
  }
}

function isLengthPrefixed(type: number): boolean {
  return type === TnefPropertyType.Unicode || type === TnefPropertyType.String8 || type === TnefPropertyType.Binary || type === TnefPropertyType.Object;
}

function getPaddedLength(length: number): number {
  return (length + 3) & ~3;
}

function toInt16(value: number): number {
  const v = value & 0xffff;
  return v & 0x8000 ? v - 0x10000 : v;
}

function isValidDateTime(year: number, month: number, day: number, hour: number, minute: number, second: number): boolean {
  if (year < 1 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return false;
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1]!;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isWellFormedRelativeUri(value: string): boolean {
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false;
  try {
    new URL(value, 'http://example.invalid/');
    return true;
  } catch {
    return false;
  }
}

function codepageName(codepage: number): string {
  if (codepage === 1252) return 'windows-1252';
  if (codepage === 65001) return 'utf-8';
  if (codepage === 28591) return 'iso-8859-1';
  if (codepage === 20866) return 'koi8-r';
  return `windows-${codepage}`;
}
