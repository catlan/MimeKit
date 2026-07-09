import { describe, expect, test } from 'vitest';
import { MemoryStream, RtfCompressedToRtf, RtfCompressionMode } from '../../src/index.js';

const compressed = Uint8Array.from([45, 0, 0, 0, 43, 0, 0, 0, 76, 90, 70, 117, 0xf1, 0xc5, 0xc7, 0xa7, 0x03, 0x00, 10, 0x00, 114, 99, 112, 103, 49, 50, 53, 66, 50, 10, 0xf3, 32, 104, 101, 108, 9, 0, 32, 98, 119, 0x05, 0xb0, 108, 100, 125, 10, 0x80, 0x0f, 0xa0]);
const raw = Uint8Array.from([46, 0, 0, 0, 34, 0, 0, 0, 77, 69, 76, 65, 32, 0xdf, 0x12, 0xce, 123, 92, 114, 116, 102, 49, 92, 97, 110, 115, 105, 92, 97, 110, 115, 105, 99, 112, 103, 49, 50, 53, 50, 92, 112, 97, 114, 100, 32, 116, 101, 115, 116, 125]);

function ascii(bytes: Uint8Array): string {
  return new TextDecoder('ascii').decode(bytes);
}

describe('RtfCompressedToRtf', () => {
  test('unknown compression type', () => {
    const input = Uint8Array.from([0x10, 0, 0, 0, 0x11, 0, 0, 0, 65, 66, 67, 68, 0xff, 0xff, 0xff, 0xff]);
    const filter = new RtfCompressedToRtf();
    const output = filter.flush(input, 0, input.length);
    expect(output.index).toBe(16);
    expect(output.length).toBe(0);
    expect(filter.isValidCrc32).toBe(false);
    expect(filter.compressionMode).toBe(1145258561);
  });

  test('invalid compressed crc', () => {
    const input = Uint8Array.from([0x10, 0, 0, 0, 0x11, 0, 0, 0, 76, 90, 70, 117, 0xff, 0xff, 0xff, 0xff]);
    const filter = new RtfCompressedToRtf();
    const output = filter.flush(input, 0, input.length);
    expect(output.index).toBe(0);
    expect(output.length).toBe(0);
    expect(filter.isValidCrc32).toBe(false);
    expect(filter.compressionMode).toBe(RtfCompressionMode.Compressed);
  });

  test('compressed', () => {
    const filter = new RtfCompressedToRtf();
    const output = filter.flush(compressed, 0, compressed.length);
    expect(output.index).toBe(0);
    expect(output.length).toBe(43);
    expect(filter.isValidCrc32).toBe(true);
    expect(filter.compressionMode).toBe(RtfCompressionMode.Compressed);
    expect(ascii(output.buffer.subarray(output.index, output.index + output.length))).toBe('{\\rtf1\\ansi\\ansicpg1252\\pard hello world}\r\n');
  });

  test('compressed byte by byte', () => {
    const filter = new RtfCompressedToRtf();
    const memory = new MemoryStream();
    for (let i = 0; i < compressed.length; i++) {
      const output = filter.filter(compressed, i, 1);
      memory.write(output.buffer, output.index, output.length);
    }
    const output = filter.flush(compressed, 0, 0);
    memory.write(output.buffer, output.index, output.length);
    expect(memory.length).toBe(43);
    expect(filter.isValidCrc32).toBe(true);
    expect(ascii(memory.toArray())).toBe('{\\rtf1\\ansi\\ansicpg1252\\pard hello world}\r\n');
  });

  test('raw', () => {
    const filter = new RtfCompressedToRtf();
    const output = filter.flush(raw, 0, raw.length);
    expect(output.index).toBe(16);
    expect(output.length).toBe(34);
    expect(filter.isValidCrc32).toBe(true);
    expect(filter.compressionMode).toBe(RtfCompressionMode.Uncompressed);
    expect(ascii(output.buffer.subarray(output.index, output.index + output.length))).toBe('{\\rtf1\\ansi\\ansicpg1252\\pard test}');
  });

  test('raw byte by byte', () => {
    const filter = new RtfCompressedToRtf();
    const memory = new MemoryStream();
    for (let i = 0; i < raw.length; i++) {
      const output = filter.filter(raw, i, 1);
      memory.write(output.buffer, output.index, output.length);
    }
    const output = filter.flush(raw, 0, 0);
    memory.write(output.buffer, output.index, output.length);
    expect(memory.length).toBe(34);
    expect(filter.isValidCrc32).toBe(true);
    expect(ascii(memory.toArray())).toBe('{\\rtf1\\ansi\\ansicpg1252\\pard test}');
  });
});
