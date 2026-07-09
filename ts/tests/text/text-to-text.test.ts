import { describe, expect, test } from 'vitest';
import { MemoryStream, StringWriter, TextFormat, TextToText } from '../../src/index.js';

describe('TextToTextTests', () => {
  test('TestArgumentExceptions', () => {
    const converter = new TextToText();
    const writer = new StringWriter();
    expect(() => { converter.inputEncoding = null as never; }).toThrow(TypeError);
    expect(() => { converter.outputEncoding = null as never; }).toThrow(TypeError);
    expect(() => { converter.inputStreamBufferSize = -1; }).toThrow(RangeError);
    expect(() => { converter.outputStreamBufferSize = -1; }).toThrow(RangeError);
    expect(() => converter.convert(null as never)).toThrow(TypeError);
    expect(() => converter.convertToStream(null as never, new MemoryStream())).toThrow(TypeError);
    expect(() => converter.convertToStream('', null as never)).toThrow(TypeError);
    expect(() => converter.convertToWriter(null as never, writer)).toThrow(TypeError);
    expect(() => converter.convertToWriter('', null as never)).toThrow(TypeError);
  });

  test('TestDefaultPropertyValues', () => {
    const converter = new TextToText();
    expect(converter.detectEncodingFromByteOrderMark).toBe(false);
    expect(converter.footer).toBeNull();
    expect(converter.header).toBeNull();
    expect(converter.inputEncoding.webName).toBe('utf-8');
    expect(converter.inputFormat).toBe(TextFormat.Plain);
    expect(converter.outputEncoding.webName).toBe('utf-8');
    expect(converter.outputFormat).toBe(TextFormat.Plain);
    expect(converter.inputStreamBufferSize).toBe(4096);
    expect(converter.outputStreamBufferSize).toBe(4096);
  });

  test('TestHeaderAndFooter', () => {
    const converter = new TextToText();
    converter.header = 'Header';
    converter.footer = 'Footer';
    expect(converter.convert(',')).toBe('Header,Footer');
  });

  test('TestSimpleTextToText', () => {
    const text = 'This is some sample text. This is line #1.\nThis is line #2.\nAnd this is line #3.\n';
    expect(new TextToText().convert(text)).toBe(text);
  });
});
