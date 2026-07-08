import { describe, expect, test } from 'vitest';
import {
  HtmlNamespace,
  StringWriter,
  htmlAttributeEncode,
  htmlDecode,
  htmlEncode,
  isValidAttributeName,
  isValidTagName,
  toHtmlNamespace,
  toNamespaceUrl,
} from '../../src/index.js';

// Note: C# distinguishes string / char[] / ReadOnlySpan<char> overloads which
// collapse to `string` in the port; char[]/span assertions map to the string
// call with identical validation/behaviour.

describe('HtmlUtils', () => {
  test('TestArgumentExceptions', () => {
    const writer = new StringWriter();
    const text = 'text';

    // HtmlAttributeEncode
    expect(() => htmlAttributeEncode(null as unknown as string)).toThrow(TypeError);
    expect(() => htmlAttributeEncode(text, 'x')).toThrow(TypeError);

    expect(() => htmlAttributeEncode(null as unknown as StringWriter, text)).toThrow(TypeError);
    expect(() => htmlAttributeEncode(writer, null as unknown as string)).toThrow(TypeError);
    expect(() => htmlAttributeEncode(writer, text, 'x')).toThrow(TypeError);

    expect(() => htmlAttributeEncode(null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => htmlAttributeEncode(text, -1, 0)).toThrow(RangeError);
    expect(() => htmlAttributeEncode(text, 0, text.length + 1)).toThrow(RangeError);
    expect(() => htmlAttributeEncode(text, 0, text.length, 'x')).toThrow(TypeError);

    expect(() => htmlAttributeEncode(null as unknown as StringWriter, text, 0, text.length)).toThrow(TypeError);
    expect(() => htmlAttributeEncode(writer, null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => htmlAttributeEncode(writer, text, -1, 0)).toThrow(RangeError);
    expect(() => htmlAttributeEncode(writer, text, 0, text.length + 1)).toThrow(RangeError);
    expect(() => htmlAttributeEncode(writer, text, 0, text.length, 'x')).toThrow(TypeError);

    // HtmlEncode
    expect(() => htmlEncode(null as unknown as string)).toThrow(TypeError);
    expect(() => htmlEncode(null as unknown as StringWriter, text)).toThrow(TypeError);
    expect(() => htmlEncode(writer, null as unknown as string)).toThrow(TypeError);
    expect(() => htmlEncode(null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => htmlEncode(text, -1, 0)).toThrow(RangeError);
    expect(() => htmlEncode(text, 0, text.length + 1)).toThrow(RangeError);
    expect(() => htmlEncode(null as unknown as StringWriter, text, 0, text.length)).toThrow(TypeError);
    expect(() => htmlEncode(writer, null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => htmlEncode(writer, text, -1, 0)).toThrow(RangeError);
    expect(() => htmlEncode(writer, text, 0, text.length + 1)).toThrow(RangeError);

    // HtmlDecode
    expect(() => htmlDecode(null as unknown as string)).toThrow(TypeError);
    expect(() => htmlDecode(null as unknown as StringWriter, text)).toThrow(TypeError);
    expect(() => htmlDecode(writer, null as unknown as string)).toThrow(TypeError);
    expect(() => htmlDecode(null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => htmlDecode(text, -1, 0)).toThrow(RangeError);
    expect(() => htmlDecode(text, 0, text.length + 1)).toThrow(RangeError);
    expect(() => htmlDecode(null as unknown as StringWriter, text, 0, text.length)).toThrow(TypeError);
    expect(() => htmlDecode(writer, null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => htmlDecode(writer, text, -1, 0)).toThrow(RangeError);
    expect(() => htmlDecode(writer, text, 0, text.length + 1)).toThrow(RangeError);
  });

  function assertHtmlAttributeEncode(text: string, expected: string): void {
    expect(htmlAttributeEncode(text), 'HtmlAttributeEncode(string)').toBe(expected);

    let writer = new StringWriter();
    htmlAttributeEncode(writer, text);
    expect(writer.toString(), 'HtmlAttributeEncode(TextWriter,string)').toBe(expected);

    expect(htmlAttributeEncode(text, 0, text.length), 'HtmlAttributeEncode(string,int,int)').toBe(expected);

    writer = new StringWriter();
    htmlAttributeEncode(writer, text, 0, text.length);
    expect(writer.toString(), 'HtmlAttributeEncode(TextWriter,string,int,int)').toBe(expected);

    // char[] overloads collapse to string in the port.
    expect(htmlAttributeEncode(text, 0, text.length), 'HtmlAttributeEncode(char[],int,int)').toBe(expected);

    writer = new StringWriter();
    htmlAttributeEncode(writer, text, 0, text.length);
    expect(writer.toString(), 'HtmlAttributeEncode(TextWriter,char[],int,int)').toBe(expected);
  }

  function assertHtmlEncode(text: string, expected: string, testDecode: boolean): void {
    expect(htmlEncode(text), 'HtmlEncode(string)').toBe(expected);
    expect(htmlEncode(text, 0, text.length), 'HtmlEncode(string,int,int)').toBe(expected);
    expect(htmlEncode(text, 0, text.length), 'HtmlEncode(char[],int,int)').toBe(expected);

    let writer = new StringWriter();
    htmlEncode(writer, text);
    expect(writer.toString(), 'HtmlEncode(TextWriter,string)').toBe(expected);

    writer = new StringWriter();
    htmlEncode(writer, text, 0, text.length);
    expect(writer.toString(), 'HtmlEncode(TextWriter,string,int,int)').toBe(expected);

    writer = new StringWriter();
    htmlEncode(writer, text, 0, text.length);
    expect(writer.toString(), 'HtmlEncode(TextWriter,char[],int,int)').toBe(expected);

    if (testDecode) {
      const encoded = expected;
      expect(htmlDecode(encoded), 'HtmlDecode(string)').toBe(text);
      expect(htmlDecode(encoded, 0, encoded.length), 'HtmlDecode(string,int,int)').toBe(text);

      writer = new StringWriter();
      htmlDecode(writer, encoded);
      expect(writer.toString(), 'HtmlDecode(TextWriter,string)').toBe(text);

      writer = new StringWriter();
      htmlDecode(writer, encoded, 0, encoded.length);
      expect(writer.toString(), 'HtmlDecode(TextWriter,string,int,int)').toBe(text);
    }
  }

  test('TestEncode', () => {
    const attributeValue = '"if (showJapaneseText &amp;&amp; x &gt; 0 &amp;&amp; x &lt;= 1)\ttext = \'&#29378;&#12387;&#12383;&#12371;&#12398;&#19990;&#12391;&#29378;&#12358;&#12394;&#12425;&#27671;&#12399;&#30906;&#12363;&#12384;&#12290;\';"';
    const encoded = 'if (showJapaneseText &amp;&amp; x &gt; 0 &amp;&amp; x &lt;= 1)\ttext = &#39;&#29378;&#12387;&#12383;&#12371;&#12398;&#19990;&#12391;&#29378;&#12358;&#12394;&#12425;&#27671;&#12399;&#30906;&#12363;&#12384;&#12290;&#39;;';
    const text = "if (showJapaneseText && x > 0 && x <= 1)\ttext = '狂ったこの世で狂うなら気は確かだ。';";

    assertHtmlAttributeEncode(text, attributeValue);
    assertHtmlEncode(text, encoded, true);
  });

  test('TestEncodeSurrogatePairs', () => {
    const attributeValue = '"This emoji (&#128561;) contains a surrogate pair. And this next one is truncated: &#55357;"';
    const encoded = 'This emoji (&#128561;) contains a surrogate pair. And this next one is truncated: &#55357;';
    const emoji = String.fromCodePoint(0x1f631); // 😱, from base64 "8J+YsQ=="
    const text = `This emoji (${emoji}) contains a surrogate pair. And this next one is truncated: ${emoji[0]}`;

    assertHtmlAttributeEncode(text, attributeValue);
    assertHtmlEncode(text, encoded, false);
  });

  test('TestEncodeIllegalControlCharacters', () => {
    const attributeValue = '"This contains some embedded control sequences ()"';
    const encoded = 'This contains some embedded control sequences ()';
    const text = 'This contains some embedded control sequences (\x19\x80\x9F)';

    assertHtmlAttributeEncode(text, attributeValue);
    assertHtmlEncode(text, encoded, false);
  });

  test('TestHtmlDecode', () => {
    const encoded = '&lt;&pound;&euro;&cent;&yen;&nbsp;&copy;&reg;&gt;';
    const expected = '<£€¢¥ ©®>';

    expect(htmlDecode(encoded)).toBe(expected);
  });

  test('TestHtmlNamespaces', () => {
    expect(() => toHtmlNamespace(null as unknown as string)).toThrow(TypeError);
    expect(toHtmlNamespace('does not exist')).toBe(HtmlNamespace.Html);
    expect(() => toNamespaceUrl(500 as unknown as HtmlNamespace)).toThrow(RangeError);

    for (const ns of Object.values(HtmlNamespace)) {
      expect(toHtmlNamespace(toNamespaceUrl(ns))).toBe(ns);
    }
  });

  test('TestIsValidAttributeName', () => {
    expect(isValidAttributeName(''), 'string.Empty').toBe(false);
  });

  test('TestIsValidTagName', () => {
    expect(isValidTagName(''), 'string.Empty').toBe(false);
  });
});
