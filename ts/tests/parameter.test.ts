import { describe, expect, test } from 'vitest';
import { ContentDisposition, FormatOptions, Parameter, unwrap, utf8 } from '../src/index.js';

function encodeParameter(parameter: Parameter, options = FormatOptions.default.clone()): string {
  const builder = ['Content-Disposition: attachment'];
  const lineLength = { value: builder.join('').length };
  options.newLineFormat = 'dos';
  parameter.encode(options, builder, lineLength, utf8);
  return builder.join('');
}

describe('Parameter', () => {
  test('TestArgumentExceptions', () => {
    const invalid = 'X-测试文本';
    expect(() => new Parameter(null as unknown as typeof utf8, 'name', 'value')).toThrow(TypeError);
    expect(() => new Parameter(utf8, null as unknown as string, 'value')).toThrow(TypeError);
    expect(() => new Parameter(utf8, '', 'value')).toThrow(TypeError);
    expect(() => new Parameter(utf8, invalid, 'value')).toThrow(TypeError);
    expect(() => new Parameter(utf8, 'name', null as unknown as string)).toThrow(TypeError);
    expect(() => new Parameter(null as unknown as string, 'name', 'value')).toThrow(TypeError);
    expect(() => new Parameter('utf-8', null as unknown as string, 'value')).toThrow(TypeError);
    expect(() => new Parameter('utf-8', '', 'value')).toThrow(TypeError);
    expect(() => new Parameter('utf-8', invalid, 'value')).toThrow(TypeError);
    expect(() => new Parameter('utf-8', 'name', null as unknown as string)).toThrow(TypeError);
    expect(() => new Parameter('x-unknown-charset', 'name', 'value')).toThrow(TypeError);
    expect(() => new Parameter(null as unknown as string, 'value')).toThrow(TypeError);
    expect(() => new Parameter('', 'value')).toThrow(TypeError);
    expect(() => new Parameter(invalid, 'value')).toThrow(TypeError);
    expect(() => new Parameter('name', null as unknown as string)).toThrow(TypeError);
    const parameter = new Parameter('name', 'value');
    expect(() => { parameter.value = null as unknown as string; }).toThrow(TypeError);
    expect(() => { parameter.encodingMethod = 'bogus' as never; }).toThrow(RangeError);
    expect(parameter.encoding.codePage).toBe(65001);
    parameter.encoding = utf8;
    expect(parameter.encoding).toBe(utf8);
    parameter.alwaysQuote = true; expect(parameter.alwaysQuote).toBe(true);
    parameter.alwaysQuote = false; expect(parameter.alwaysQuote).toBe(false);
  });

  test('TestBasicFunctionality', () => {
    const param = new Parameter('name', 'value');
    expect(param.encoding.webName).toBe('utf-8');
    expect(param.encodingMethod).toBe('default');
    expect(param.alwaysQuote).toBe(false);
    expect(param.name).toBe('name');
    expect(param.value).toBe('value');
    expect(param.toString()).toBe('name="value"');
  });

  test('TestEncode', () => {
    const options = FormatOptions.default.clone();
    options.alwaysQuoteParameterValues = false;
    expect(encodeParameter(new Parameter('filename', 'tps-report.doc'), options)).toBe('Content-Disposition: attachment; filename=tps-report.doc');
  });
  test('TestEncodeAlwaysQuote', () => {
    const param = new Parameter('filename', 'tps-report.doc'); param.alwaysQuote = true;
    expect(encodeParameter(param)).toBe('Content-Disposition: attachment; filename="tps-report.doc"');
  });
  test('TestEncodeFormatOptionsAlwaysQuote', () => {
    const options = FormatOptions.default.clone(); options.alwaysQuoteParameterValues = true;
    expect(encodeParameter(new Parameter('filename', 'tps-report.doc'), options)).toBe('Content-Disposition: attachment; filename="tps-report.doc"');
  });
  test('TestEncodeRfc2047', () => {
    const param = new Parameter('filename', '测试文本.doc'); param.encodingMethod = 'rfc2047';
    expect(encodeParameter(param)).toBe('Content-Disposition: attachment; filename="=?utf-8?b?5rWL6K+V5paH5pysLmRv?=\r\n\t=?utf-8?q?c?="');
  });
  test('TestEncodeRfc2047WithSurrogatePairs', () => {
    const param = new Parameter('filename', 'I ❤️‍🔥 emojis.doc'); param.encodingMethod = 'rfc2047';
    const encoded = encodeParameter(param);
    expect(unwrap(ContentDisposition.parse(encoded.slice('Content-Disposition:'.length))).parameters.get(param.name)).toBe(param.value);
  });
  test('TestEncodeRfc2047WithQuotes', () => {
    const param = new Parameter('filename', 'Some "测试文本" characters.doc'); param.encodingMethod = 'rfc2047';
    const encoded = encodeParameter(param);
    expect(unwrap(ContentDisposition.parse(encoded.slice('Content-Disposition:'.length))).parameters.get(param.name)).toBe(param.value);
  });
  test.skip('TestEncodeRfc2047WithGB18030', () => {
    // Existing charset-utils intentionally does not implement legacy charset encoding output yet (PLAN Q3).
  });
  test('TestEncodeFormatOptionsRfc2047', () => {
    const options = FormatOptions.default.clone(); options.parameterEncodingMethod = 'rfc2047';
    expect(encodeParameter(new Parameter('filename', '测试文本.doc'), options)).toBe('Content-Disposition: attachment; filename="=?utf-8?b?5rWL6K+V5paH5pysLmRv?=\r\n\t=?utf-8?q?c?="');
  });
  test.skip('TestEncodeFormatOptionsRfc2047WithGB18030', () => {
    // Existing charset-utils intentionally does not implement legacy charset encoding output yet (PLAN Q3).
  });
  test('TestEncodeRfc2231', () => {
    const param = new Parameter('filename', '测试文本.doc'); param.encodingMethod = 'rfc2231';
    expect(encodeParameter(param)).toBe("Content-Disposition: attachment;\r\n\tfilename*=utf-8''%E6%B5%8B%E8%AF%95%E6%96%87%E6%9C%AC.doc");
  });
  test.skip('TestEncodeRfc2231WithGB18030', () => {
    // Existing charset-utils intentionally does not implement legacy charset encoding output yet (PLAN Q3).
  });
  test('TestEncodeFormatOptionsRfc2231', () => {
    const options = FormatOptions.default.clone(); options.parameterEncodingMethod = 'rfc2231';
    expect(encodeParameter(new Parameter('filename', '测试文本.doc'), options)).toBe("Content-Disposition: attachment;\r\n\tfilename*=utf-8''%E6%B5%8B%E8%AF%95%E6%96%87%E6%9C%AC.doc");
  });
  test.skip('TestEncodeFormatOptionsRfc2231WithGB18030', () => {
    // Existing charset-utils intentionally does not implement legacy charset encoding output yet (PLAN Q3).
  });
  test('TestEncodeControlCharacters', () => {
    expect(encodeParameter(new Parameter('filename', 'tps\x07-\x08report.doc'))).toBe("Content-Disposition: attachment; filename*=iso-8859-1''tps%07-%08report.doc");
  });
  test('TestEncodeLongParameterName', () => {
    const param = new Parameter('A'.repeat(72), 'value');
    const encoded = encodeParameter(param);
    expect(encoded).toBe('Content-Disposition: attachment;\r\n\tAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA*0=val;\r\n\tAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA*1=ue');
    expect(unwrap(ContentDisposition.parse(encoded.slice('Content-Disposition:'.length))).parameters.get(param.name)).toBe(param.value);
  });
  test.skip('TestEncodeLongParameterNameWithRfc2231Value', () => {
    // Existing charset-utils intentionally does not implement legacy charset encoding output yet (PLAN Q3).
  });
  test('TestEncodeInternational', () => {
    const options = FormatOptions.default.clone(); options.international = true; options.alwaysQuoteParameterValues = false;
    expect(encodeParameter(new Parameter('filename', '测试文本.doc'), options)).toBe('Content-Disposition: attachment; filename="测试文本.doc"');
  });
  test('TestEncodeLongInternational', () => {
    const options = FormatOptions.default.clone(); options.international = true; options.alwaysQuoteParameterValues = false;
    const param = new Parameter('filename', '测试文本'.repeat(16) + '.doc');
    const encoded = encodeParameter(param, options);
    expect(encoded).toBe('Content-Disposition: attachment;\r\n\tfilename*0="测试文本测试文本测试文本测试文本测试文本测";\r\n\tfilename*1="试文本测试文本测试文本测试文本测试文本测试";\r\n\tfilename*2="文本测试文本测试文本测试文本测试文本测试文";\r\n\tfilename*3="本.doc"');
    expect(unwrap(ContentDisposition.parse(encoded.slice('Content-Disposition:'.length))).parameters.get(param.name)).toBe(param.value);
  });
});
