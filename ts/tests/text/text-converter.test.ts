import { describe, expect, test } from 'vitest';
import { MemoryStream, StringWriter, TextToText, latin1 } from '../../src/index.js';

describe('TextConverterTests', () => {
  test('TestPropertySetters', () => {
    const converter = new TextToText();
    converter.inputEncoding = latin1;
    expect(converter.inputEncoding).toBe(latin1);
    converter.inputStreamBufferSize = 5000;
    expect(converter.inputStreamBufferSize).toBe(5000);
    converter.outputEncoding = latin1;
    expect(converter.outputEncoding).toBe(latin1);
    converter.outputStreamBufferSize = 6000;
    expect(converter.outputStreamBufferSize).toBe(6000);
    converter.detectEncodingFromByteOrderMark = true;
    expect(converter.detectEncodingFromByteOrderMark).toBe(true);
  });

  test('TestConvertFromReaderToStream', () => {
    const input = 'This is some text...';
    const converter = new TextToText();
    const output = new MemoryStream();
    converter.convertToStream(input, output);
    expect(new TextDecoder().decode(output.toArray())).toBe(input);
  });

  test('TestConvertFromStreamToStream', () => {
    const input = 'This is some text...';
    const converter = new TextToText();
    const source = new MemoryStream(new TextEncoder().encode(input));
    const output = new MemoryStream();
    converter.convertToStream(source, output);
    expect(new TextDecoder().decode(output.toArray())).toBe(input);
  });

  test('TestConvertFromStreamToWriter', () => {
    const input = 'This is some text...';
    const converter = new TextToText();
    const source = new MemoryStream(new TextEncoder().encode(input));
    const writer = new StringWriter();
    converter.convertToWriter(source, writer);
    expect(writer.toString()).toBe(input);
  });
});
