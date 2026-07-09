import { Stream } from '../io/stream.js';
import { tryGetEncoding } from '../utils/charset-utils.js';
import { EndOfStreamError, TnefError } from './tnef-error.js';
import { TnefAttachMethod } from './tnef-attach-method.js';
import { TnefAttributeLevel, type TnefAttributeLevel as TnefAttributeLevelValue } from './tnef-attribute-level.js';
import { TnefAttributeTag, TnefAttributeType, type TnefAttributeTag as TnefAttributeTagValue } from './tnef-attribute-tag.js';
import { type TnefComplianceMode } from './tnef-compliance-mode.js';
import { TnefComplianceStatus, type TnefComplianceStatus as TnefComplianceStatusValue } from './tnef-compliance-status.js';
import { TnefPropertyReader } from './tnef-property-reader.js';

export class TnefReader {
  static readonly tnefSignature = 0x223e9f78;

  readonly tnefPropertyReader: TnefPropertyReader;
  readonly complianceMode: TnefComplianceMode;
  complianceStatus: TnefComplianceStatusValue = TnefComplianceStatus.Compliant;
  attachmentKey = 0;
  attributeLevel: TnefAttributeLevelValue = TnefAttributeLevel.Message;
  attributeTag: TnefAttributeTagValue = TnefAttributeTag.Null;
  attributeRawValueLength = 0;
  attributeRawValueStreamOffset = 0;
  tnefVersion = 0;
  messageCodepage: number;

  private readonly data: Uint8Array;
  private offset = 0;
  private checksum = 0;
  private closed = false;

  constructor(inputStream: Stream | Uint8Array, defaultMessageCodepage = 0, complianceMode: TnefComplianceMode = 'loose') {
    if (defaultMessageCodepage < 0) throw new RangeError('defaultMessageCodepage must be non-negative');
    this.data = inputStream instanceof Uint8Array ? inputStream.slice() : readAll(inputStream);
    this.messageCodepage = defaultMessageCodepage !== 0 ? normalizeCodepage(defaultMessageCodepage) : 1252;
    this.complianceMode = complianceMode;
    this.tnefPropertyReader = new TnefPropertyReader(this);
    this.decodeHeader();
  }

  get streamOffset(): number {
    return this.offset;
  }

  get attributeType(): number {
    return (this.attributeTag as number) & 0xf0000;
  }

  setMessageCodepage(value: number): void {
    if (value === this.messageCodepage) return;
    const normalized = normalizeCodepage(value);
    if (normalized === 0) {
      this.setComplianceError(TnefComplianceStatus.InvalidMessageCodepage);
      this.messageCodepage = 1252;
    } else {
      this.messageCodepage = normalized;
    }
  }

  resetComplianceStatus(): void {
    this.complianceStatus = TnefComplianceStatus.Compliant;
  }

  close(): void {
    this.closed = true;
  }

  dispose(): void {
    this.close();
  }

  setComplianceError(error: TnefComplianceStatusValue, cause?: unknown): void {
    this.complianceStatus = (this.complianceStatus | error) as TnefComplianceStatusValue;
    if (this.complianceMode !== 'strict' || error === TnefComplianceStatus.Compliant) return;
    throw new TnefError(error, complianceMessage(error), { cause });
  }

  readNextAttribute(): boolean {
    this.checkDisposed();
    if (this.attributeRawValueStreamOffset !== 0 && !this.skipAttributeRawValue())
      return false;
    try {
      this.attributeLevel = this.readByte() as TnefAttributeLevelValue;
    } catch (ex) {
      if (ex instanceof EndOfStreamError) return false;
      throw ex;
    }
    this.checkAttributeLevel();
    try {
      this.attributeTag = this.readInt32() as TnefAttributeTagValue;
      this.attributeRawValueLength = this.readInt32();
      this.attributeRawValueStreamOffset = this.streamOffset;
      this.checksum = 0;
    } catch (ex) {
      if (ex instanceof EndOfStreamError) {
        this.setComplianceError(TnefComplianceStatus.StreamTruncated);
        return false;
      }
      throw ex;
    }
    this.checkAttributeTag();
    if (this.attributeRawValueLength < 0) {
      this.setComplianceError(TnefComplianceStatus.InvalidAttributeLength);
      return false;
    }
    try {
      this.tnefPropertyReader.load();
    } catch (ex) {
      if (ex instanceof EndOfStreamError) {
        this.setComplianceError(TnefComplianceStatus.StreamTruncated);
        return false;
      }
      throw ex;
    }
    return true;
  }

  readAttributeRawValue(buffer: Uint8Array, offset: number, count: number): number {
    validateBufferArguments(buffer, offset, count);
    this.checkDisposed();
    const dataEnd = this.attributeRawValueStreamOffset + this.attributeRawValueLength;
    const dataLeft = dataEnd - this.streamOffset;
    if (dataLeft <= 0) return 0;
    const n = Math.min(dataLeft, count, this.data.length - this.offset);
    if (n <= 0) {
      this.setComplianceError(TnefComplianceStatus.StreamTruncated);
      return 0;
    }
    buffer.set(this.data.subarray(this.offset, this.offset + n), offset);
    this.updateChecksum(buffer, offset, n);
    this.offset += n;
    return n;
  }

  readByte(): number {
    this.ensure(1);
    this.updateChecksum(this.data, this.offset, 1);
    return this.data[this.offset++]!;
  }

  readInt16(): number {
    this.ensure(2);
    this.updateChecksum(this.data, this.offset, 2);
    const value = this.dataView().getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readInt32(): number {
    this.ensure(4);
    this.updateChecksum(this.data, this.offset, 4);
    const value = this.dataView().getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  peekInt32(): number {
    this.ensure(4);
    return this.dataView().getInt32(this.offset, true);
  }

  readInt64(): number {
    this.ensure(8);
    this.updateChecksum(this.data, this.offset, 8);
    const value = Number(this.dataView().getBigInt64(this.offset, true));
    this.offset += 8;
    return value;
  }

  readSingle(): number {
    this.ensure(4);
    this.updateChecksum(this.data, this.offset, 4);
    const value = this.dataView().getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readDouble(): number {
    this.ensure(8);
    this.updateChecksum(this.data, this.offset, 8);
    const value = this.dataView().getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  skip(count: number): boolean {
    this.checkDisposed();
    if (count <= 0) return true;
    const n = Math.min(count, this.data.length - this.offset);
    this.updateChecksum(this.data, this.offset, n);
    this.offset += n;
    if (n !== count) {
      this.setComplianceError(TnefComplianceStatus.StreamTruncated);
      return false;
    }
    return true;
  }

  private decodeHeader(): void {
    try {
      const signature = this.readInt32();
      if (signature !== TnefReader.tnefSignature)
        this.setComplianceError(TnefComplianceStatus.InvalidTnefSignature);
      this.attachmentKey = this.readInt16();
    } catch (ex) {
      if (ex instanceof EndOfStreamError)
        this.setComplianceError(TnefComplianceStatus.StreamTruncated);
      else
        throw ex;
    }
  }

  private checkAttributeLevel(): void {
    if (this.attributeLevel !== TnefAttributeLevel.Attachment && this.attributeLevel !== TnefAttributeLevel.Message)
      this.setComplianceError(TnefComplianceStatus.InvalidAttributeLevel);
  }

  private checkAttributeTag(): void {
    switch (this.attributeTag) {
    case TnefAttributeTag.AidOwner:
    case TnefAttributeTag.AttachCreateDate:
    case TnefAttributeTag.AttachData:
    case TnefAttributeTag.Attachment:
    case TnefAttributeTag.AttachMetaFile:
    case TnefAttributeTag.AttachModifyDate:
    case TnefAttributeTag.AttachTitle:
    case TnefAttributeTag.AttachTransportFilename:
    case TnefAttributeTag.Body:
    case TnefAttributeTag.ConversationId:
    case TnefAttributeTag.DateEnd:
    case TnefAttributeTag.DateModified:
    case TnefAttributeTag.DateReceived:
    case TnefAttributeTag.DateSent:
    case TnefAttributeTag.DateStart:
    case TnefAttributeTag.Delegate:
    case TnefAttributeTag.From:
    case TnefAttributeTag.MapiProperties:
    case TnefAttributeTag.MessageClass:
    case TnefAttributeTag.MessageId:
    case TnefAttributeTag.MessageStatus:
    case TnefAttributeTag.Null:
    case TnefAttributeTag.OriginalMessageClass:
    case TnefAttributeTag.Owner:
    case TnefAttributeTag.ParentId:
    case TnefAttributeTag.Priority:
    case TnefAttributeTag.RecipientTable:
    case TnefAttributeTag.RequestResponse:
    case TnefAttributeTag.SentFor:
    case TnefAttributeTag.Subject:
      break;
    case TnefAttributeTag.AttachRenderData:
      this.tnefPropertyReader.attachMethod = TnefAttachMethod.ByValue as number;
      break;
    case TnefAttributeTag.OemCodepage:
      this.setMessageCodepage(this.peekInt32());
      break;
    case TnefAttributeTag.TnefVersion:
      this.tnefVersion = this.peekInt32();
      if (this.tnefVersion !== 0x00010000)
        this.setComplianceError(TnefComplianceStatus.InvalidTnefVersion);
      break;
    default:
      this.setComplianceError(TnefComplianceStatus.InvalidAttribute);
      break;
    }
  }

  private skipAttributeRawValue(): boolean {
    const offset = this.attributeRawValueStreamOffset + this.attributeRawValueLength;
    if (!this.skip(offset - this.streamOffset)) return false;
    const expected = this.checksum;
    try {
      const actual = this.readInt16() & 0xffff;
      if (actual !== expected)
        this.setComplianceError(TnefComplianceStatus.InvalidAttributeChecksum);
    } catch (ex) {
      if (ex instanceof EndOfStreamError) {
        this.setComplianceError(TnefComplianceStatus.StreamTruncated);
        return false;
      }
      throw ex;
    }
    return true;
  }

  private ensure(count: number): void {
    if (this.offset + count > this.data.length)
      throw new EndOfStreamError();
  }

  private dataView(): DataView {
    return new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
  }

  private updateChecksum(buffer: Uint8Array, offset: number, count: number): void {
    for (let i = offset; i < offset + count; i++)
      this.checksum = (this.checksum + buffer[i]!) & 0xffff;
  }

  private checkDisposed(): void {
    if (this.closed) throw new TypeError('TnefReader has been disposed');
  }
}

function readAll(stream: Stream): Uint8Array {
  const chunks: Uint8Array[] = [];
  const buffer = new Uint8Array(4096);
  let total = 0;
  let n: number;
  while ((n = stream.read(buffer, 0, buffer.length)) > 0) {
    chunks.push(buffer.slice(0, n));
    total += n;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function validateBufferArguments(buffer: Uint8Array, offset: number, count: number): void {
  if (!Number.isInteger(offset) || offset < 0 || offset > buffer.length)
    throw new RangeError('offset out of range');
  if (!Number.isInteger(count) || count < 0 || count > buffer.length - offset)
    throw new RangeError('count out of range');
}

function normalizeCodepage(codepage: number): number {
  return tryGetEncoding(String(codepage))?.codePage ?? (tryGetEncoding(codepageName(codepage))?.codePage ?? 0);
}

function codepageName(codepage: number): string {
  if (codepage === 1252) return 'windows-1252';
  if (codepage === 65001) return 'utf-8';
  if (codepage === 28591) return 'iso-8859-1';
  if (codepage === 20866) return 'koi8-r';
  return `windows-${codepage}`;
}

function complianceMessage(error: number): string {
  switch (error) {
  case TnefComplianceStatus.AttributeOverflow: return 'Too many attributes.';
  case TnefComplianceStatus.InvalidAttribute: return 'Invalid attribute.';
  case TnefComplianceStatus.InvalidAttributeChecksum: return 'Invalid attribute checksum.';
  case TnefComplianceStatus.InvalidAttributeLength: return 'Invalid attribute length.';
  case TnefComplianceStatus.InvalidAttributeLevel: return 'Invalid attribute level.';
  case TnefComplianceStatus.InvalidAttributeValue: return 'Invalid attribute value.';
  case TnefComplianceStatus.InvalidDate: return 'Invalid date.';
  case TnefComplianceStatus.InvalidMessageClass: return 'Invalid message class.';
  case TnefComplianceStatus.InvalidMessageCodepage: return 'Invalid message codepage.';
  case TnefComplianceStatus.InvalidPropertyLength: return 'Invalid property length.';
  case TnefComplianceStatus.InvalidRowCount: return 'Invalid row count.';
  case TnefComplianceStatus.InvalidTnefSignature: return 'Invalid TNEF signature.';
  case TnefComplianceStatus.InvalidTnefVersion: return 'Invalid TNEF version.';
  case TnefComplianceStatus.NestingTooDeep: return 'Nesting too deep.';
  case TnefComplianceStatus.StreamTruncated: return 'Truncated TNEF stream.';
  case TnefComplianceStatus.UnsupportedPropertyType: return 'Unsupported property type.';
  default: return 'TNEF compliance error.';
  }
}
