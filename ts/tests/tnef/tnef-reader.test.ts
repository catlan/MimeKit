import { describe, expect, test } from 'vitest';
import {
  MemoryStream,
  TnefAttributeLevel,
  TnefAttributeTag,
  TnefComplianceMode,
  TnefComplianceStatus,
  TnefError,
  TnefReader,
  TnefReaderStream,
} from '../../src/index.js';

function le32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function le64(value: bigint): number[] {
  return Array.from({ length: 8 }, (_, i) => Number((value >> BigInt(i * 8)) & 0xffn));
}

function doubleBytes(value: number): number[] {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, true);
  return Array.from(new Uint8Array(buffer));
}

function singleBytes(value: number): number[] {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, true);
  return Array.from(new Uint8Array(buffer));
}

function tnefPrefix(): number[] {
  return [...le32(0x223e9f78), 0, 0];
}

function attr(tag: number, length: number, value: number[]): Uint8Array {
  return new Uint8Array([...tnefPrefix(), TnefAttributeLevel.Message, ...le32(tag), ...le32(length), ...value]);
}

describe('TnefReader', () => {
  test('argument exceptions', () => {
    const stream = new MemoryStream(new Uint8Array(tnefPrefix()));
    expect(() => new TnefReader(null as never, 0, TnefComplianceMode.Strict)).toThrow(TypeError);
    expect(() => new TnefReader(stream, -1, TnefComplianceMode.Strict)).toThrow(RangeError);

    const reader = new TnefReader(new MemoryStream(new Uint8Array(tnefPrefix())), 1252, TnefComplianceMode.Strict);
    const buffer = new Uint8Array(16);
    expect(() => reader.readAttributeRawValue(null as never, 0, buffer.length)).toThrow(TypeError);
    expect(() => reader.readAttributeRawValue(buffer, -1, buffer.length)).toThrow(RangeError);
    expect(() => reader.readAttributeRawValue(buffer, 0, -1)).toThrow(RangeError);
  });

  test('setComplianceError throws in strict for every non-compliant status', () => {
    const statuses = Object.values(TnefComplianceStatus).filter((value): value is number => typeof value === 'number');
    for (const status of statuses) {
      const reader = new TnefReader(new MemoryStream(new Uint8Array(tnefPrefix())), 0, TnefComplianceMode.Strict);
      if (status === TnefComplianceStatus.Compliant)
        expect(() => reader.setComplianceError(status)).not.toThrow();
      else
        expect(() => reader.setComplianceError(status)).toThrow(TnefError);
    }
  });

  test('truncated header strict throws and loose records status', () => {
    expect(() => new TnefReader(new MemoryStream(), 0, TnefComplianceMode.Strict)).toThrow(TnefError);
    const reader = new TnefReader(new MemoryStream(), 0, TnefComplianceMode.Loose);
    expect(reader.complianceStatus).toBe(TnefComplianceStatus.StreamTruncated);
    reader.resetComplianceStatus();
    expect(reader.complianceStatus).toBe(TnefComplianceStatus.Compliant);
  });

  test('invalid signature', () => {
    const data = new Uint8Array([...le32(0x223e9f79), 0, 0]);
    const loose = new TnefReader(new MemoryStream(data), 0, TnefComplianceMode.Loose);
    expect(loose.complianceStatus).toBe(TnefComplianceStatus.InvalidTnefSignature);
    expect(() => new TnefReader(new MemoryStream(data), 0, TnefComplianceMode.Strict)).toThrow(TnefError);
  });

  test('truncated header after signature', () => {
    const reader = new TnefReader(new MemoryStream(new Uint8Array([...le32(0x223e9f78), 0])), 0, TnefComplianceMode.Loose);
    expect(reader.complianceStatus).toBe(TnefComplianceStatus.StreamTruncated);
  });

  test('invalid OEM codepage loose and strict', () => {
    const data = attr(TnefAttributeTag.OemCodepage, 4, le32(1));
    const loose = new TnefReader(new MemoryStream(data), 0, TnefComplianceMode.Loose);
    expect(loose.readNextAttribute()).toBe(true);
    expect(loose.attributeTag).toBe(TnefAttributeTag.OemCodepage);
    expect(loose.complianceStatus).toBe(TnefComplianceStatus.InvalidMessageCodepage);

    const strict = new TnefReader(new MemoryStream(data), 0, TnefComplianceMode.Strict);
    expect(() => strict.readNextAttribute()).toThrow(TnefError);
  });

  test('version attribute updates compliance status', () => {
    const data = new Uint8Array([
      ...le32(0x223e9f78), 0, 0,
      TnefAttributeLevel.Message,
      ...le32(TnefAttributeTag.TnefVersion),
      ...le32(4),
      ...le32(1),
    ]);
    const reader = new TnefReader(new MemoryStream(data), 0, TnefComplianceMode.Loose);
    expect(reader.readNextAttribute()).toBe(true);
    expect(reader.attributeTag).toBe(TnefAttributeTag.TnefVersion);
    expect(reader.tnefPropertyReader.readValueAsInt32()).toBe(1);
    expect(reader.tnefVersion).toBe(1);
    expect(reader.complianceStatus).toBe(TnefComplianceStatus.InvalidTnefVersion);
  });

  test('negative attribute raw value length loose and strict', () => {
    const data = attr(TnefAttributeTag.TnefVersion, -4, le32(65536));
    const loose = new TnefReader(new MemoryStream(data), 0, TnefComplianceMode.Loose);
    expect(loose.readNextAttribute()).toBe(false);
    expect(loose.attributeTag).toBe(TnefAttributeTag.TnefVersion);
    expect(loose.complianceStatus).toBe(TnefComplianceStatus.InvalidAttributeLength);

    const strict = new TnefReader(new MemoryStream(data), 0, TnefComplianceMode.Strict);
    expect(() => strict.readNextAttribute()).toThrow(TnefError);
  });

  test('read after close throws TypeError', () => {
    const reader = new TnefReader(new MemoryStream(attr(TnefAttributeTag.TnefVersion, 4, le32(65536))), 0, TnefComplianceMode.Loose);
    reader.close();
    expect(() => reader.readNextAttribute()).toThrow(TypeError);
  });

  test('readAttributeRawValue truncated loose and strict', () => {
    const data = attr(TnefAttributeTag.MessageId, 28, le32(0xffffffff));
    const loose = new TnefReader(new MemoryStream(data), 0, TnefComplianceMode.Loose);
    expect(loose.readNextAttribute()).toBe(true);
    const buffer = new Uint8Array(28);
    while (loose.readAttributeRawValue(buffer, 0, buffer.length) > 0) {}
    expect(loose.complianceStatus).toBe(TnefComplianceStatus.StreamTruncated);

    const strict = new TnefReader(new MemoryStream(data), 0, TnefComplianceMode.Strict);
    expect(strict.readNextAttribute()).toBe(true);
    const n = strict.readAttributeRawValue(buffer, 0, buffer.length);
    expect(() => strict.readAttributeRawValue(buffer, n, buffer.length - n)).toThrow(TnefError);
  });

  test('read primitive numeric values', () => {
    expect(new TnefReader(new MemoryStream(new Uint8Array([...tnefPrefix(), ...le32(1060)])), 0, TnefComplianceMode.Loose).readInt32()).toBe(1060);
    expect(new TnefReader(new MemoryStream(new Uint8Array([...tnefPrefix(), ...le64(1060n)])), 0, TnefComplianceMode.Loose).readInt64()).toBe(1060);
    expect(new TnefReader(new MemoryStream(new Uint8Array([...tnefPrefix(), ...doubleBytes(1024.1024)])), 0, TnefComplianceMode.Loose).readDouble()).toBe(1024.1024);
    expect(new TnefReader(new MemoryStream(new Uint8Array([...tnefPrefix(), ...singleBytes(1024.1024)])), 0, TnefComplianceMode.Loose).readSingle()).toBeCloseTo(1024.1024);
  });

  test('skip truncated loose and strict', () => {
    const data = attr(TnefAttributeTag.TnefVersion, 4, le32(65536));
    const loose = new TnefReader(new MemoryStream(data), 0, TnefComplianceMode.Loose);
    expect(loose.skip(64)).toBe(false);
    expect(loose.complianceStatus).toBe(TnefComplianceStatus.StreamTruncated);

    const strict = new TnefReader(new MemoryStream(data), 0, TnefComplianceMode.Strict);
    expect(() => strict.skip(64)).toThrow(TnefError);
  });

  test('TnefReaderStream unsupported operations and arguments', () => {
    const reader = new TnefReader(new MemoryStream(new Uint8Array(tnefPrefix())));
    const stream = new TnefReaderStream(reader, 0, 0);
    const buffer = new Uint8Array(1024);

    expect(stream.canRead).toBe(true);
    expect(stream.canWrite).toBe(false);
    expect(stream.canSeek).toBe(false);
    expect(() => stream.read(null as never, 0, buffer.length)).toThrow(TypeError);
    expect(() => stream.read(buffer, -1, buffer.length)).toThrow(RangeError);
    expect(() => stream.read(buffer, 0, -1)).toThrow(RangeError);
    expect(() => stream.write(buffer, 0, buffer.length)).toThrow(TypeError);
    expect(() => stream.seek(0, 'end')).toThrow(TypeError);
    expect(() => stream.flush()).toThrow(TypeError);
    expect(() => stream.setLength(1024)).toThrow(TypeError);
    expect(() => stream.position).toThrow(TypeError);
    expect(() => { stream.position = 0; }).toThrow(TypeError);
    expect(() => stream.length).toThrow(TypeError);
  });
});
