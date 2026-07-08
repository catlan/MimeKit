import { describe, expect, test } from 'vitest';
import {
  HtmlAttribute,
  HtmlAttributeId,
  HtmlTagId,
  HtmlTagToken,
  HtmlWriter,
  HtmlWriterState,
  MemoryStream,
  StringWriter,
} from '../../src/index.js';

// C# InvalidOperationException / ObjectDisposedException map to TypeError in the port.

describe('HtmlWriter', () => {
  test('TestArgumentExceptions', () => {
    const memory = new MemoryStream();

    expect(() => new HtmlWriter(null as unknown as MemoryStream, 'utf-8')).toThrow(TypeError);
    expect(() => new HtmlWriter(memory, null as unknown as string)).toThrow(TypeError);
    expect(() => new HtmlWriter(null as unknown as StringWriter)).toThrow(TypeError);

    const html = new HtmlWriter(new StringWriter());

    expect(() => html.writeAttribute(null as unknown as HtmlAttribute)).toThrow(TypeError);
    expect(() => html.writeAttribute(null as unknown as string, '')).toThrow(TypeError);
    expect(() => html.writeAttribute('name', null as unknown as string)).toThrow(TypeError);
    expect(() => html.writeAttribute('', null as unknown as string)).toThrow(TypeError);
    expect(() => html.writeAttribute('a b c', null as unknown as string)).toThrow(TypeError);
    expect(() => html.writeAttributeRange(null as unknown as string, ' ', 0, 1)).toThrow(TypeError);
    expect(() => html.writeAttributeRange('name', null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => html.writeAttributeRange('name', '', -1, 0)).toThrow(RangeError);
    expect(() => html.writeAttributeRange('name', '', 0, 1)).toThrow(RangeError);
    expect(() => html.writeAttributeRange(HtmlAttributeId.Unknown, ' ', 0, 1)).toThrow(TypeError);
    expect(() => html.writeAttributeRange(HtmlAttributeId.Alt, null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => html.writeAttributeRange(HtmlAttributeId.Alt, '', -1, 0)).toThrow(RangeError);
    expect(() => html.writeAttributeRange(HtmlAttributeId.Alt, '', 0, 1)).toThrow(RangeError);
    expect(() => html.writeAttribute(HtmlAttributeId.Unknown, 'value')).toThrow(TypeError);
    expect(() => html.writeAttribute(HtmlAttributeId.Alt, null as unknown as string)).toThrow(TypeError);

    expect(() => html.writeAttributeName(HtmlAttributeId.Unknown)).toThrow(TypeError);
    expect(() => html.writeAttributeName(null as unknown as string)).toThrow(TypeError);

    expect(() => html.writeAttributeValue(null as unknown as string)).toThrow(TypeError);
    expect(() => html.writeAttributeValueRange(null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => html.writeAttributeValueRange('', -1, 0)).toThrow(RangeError);
    expect(() => html.writeAttributeValueRange('', 0, 1)).toThrow(RangeError);

    expect(() => html.writeEmptyElementTag(HtmlTagId.Unknown)).toThrow(TypeError);
    expect(() => html.writeEmptyElementTag(null as unknown as string)).toThrow(TypeError);
    expect(() => html.writeEmptyElementTag('')).toThrow(TypeError);
    expect(() => html.writeEmptyElementTag('a b c')).toThrow(TypeError);

    expect(() => html.writeEndTag(HtmlTagId.Unknown)).toThrow(TypeError);
    expect(() => html.writeEndTag(null as unknown as string)).toThrow(TypeError);
    expect(() => html.writeEndTag('')).toThrow(TypeError);
    expect(() => html.writeEndTag('a b c')).toThrow(TypeError);

    expect(() => html.writeMarkupText(null as unknown as string)).toThrow(TypeError);
    expect(() => html.writeMarkupTextRange(null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => html.writeMarkupTextRange('', -1, 0)).toThrow(RangeError);
    expect(() => html.writeMarkupTextRange('', 0, 1)).toThrow(RangeError);

    expect(() => html.writeStartTag(HtmlTagId.Unknown)).toThrow(TypeError);
    expect(() => html.writeStartTag(null as unknown as string)).toThrow(TypeError);
    expect(() => html.writeStartTag('')).toThrow(TypeError);
    expect(() => html.writeStartTag('a b c')).toThrow(TypeError);

    expect(() => html.writeText(null as unknown as string)).toThrow(TypeError);
    expect(() => html.writeTextRange(null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => html.writeTextRange('', -1, 0)).toThrow(RangeError);
    expect(() => html.writeTextRange('', 0, 1)).toThrow(RangeError);

    expect(() => html.writeToken(null as never)).toThrow(TypeError);

    html.dispose();
  });

  function runHtmlWriter(html: HtmlWriter, readActual: () => string): void {
    const expected =
      '<html ltr="true"><head/><body>' +
      '<p class="paragraph" style="font: arial; color: red" align="left">' +
      'special characters in this text should get encoded: &lt;&gt;&#39;&amp;\n' +
      'and this is a formatted string with a few args: 1 apple<br/><br/></p>' +
      '<p class="paragraph" style="font: arial; color: red" align="left">' +
      'special characters should not get encoded: &lt;&gt;' +
      '</p><p></p>' +
      '<p class="paragraph" style="font: arial; color: red" align="left">' +
      'special characters in this text should get encoded: &lt;&gt;&#39;&amp;\n<br/><br/></p>' +
      '<p class="paragraph" style="font: arial; color: red" align="left">' +
      'special characters should not get encoded: &lt;&gt;' +
      '</p></body></html>';
    const format = 'and this is a formatted string with a few args: {0} {1}';
    const text = "special characters in this text should get encoded: <>'&\n";
    const markup = 'special characters should not get encoded: &lt;&gt;';
    const style = 'font: arial; color: red';

    expect(html.writerState).toBe(HtmlWriterState.Default);

    expect(() => html.writeAttribute(new HtmlAttribute(HtmlAttributeId.Action, 'invalid state'))).toThrow(TypeError);
    expect(() => html.writeAttribute(HtmlAttributeId.Action, 'invalid state')).toThrow(TypeError);
    expect(() => html.writeAttribute('action', 'invalid state')).toThrow(TypeError);

    html.writeStartTag(HtmlTagId.Html);
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    html.writeAttribute(new HtmlAttribute('ltr', 'true'));

    html.writeEmptyElementTag(HtmlTagId.Head);
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    html.writeStartTag('body');
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    html.writeStartTag(HtmlTagId.P);
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    expect(() => html.writeAttributeValue('attrValue')).toThrow(TypeError);
    expect(() => html.writeAttributeValueRange('attrValue', 0, 9)).toThrow(TypeError);

    html.writeAttributeName(HtmlAttributeId.Class);
    expect(html.writerState).toBe(HtmlWriterState.Attribute);

    html.writeAttributeValue('paragraph');
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    html.writeAttributeName('style');
    expect(html.writerState).toBe(HtmlWriterState.Attribute);

    html.writeAttributeValueRange(style, 0, style.length);
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    html.writeAttribute(HtmlAttributeId.Align, 'left');
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    html.writeText(text);
    expect(html.writerState).toBe(HtmlWriterState.Default);

    html.writeTextFormat(format, 1, 'apple');
    expect(html.writerState).toBe(HtmlWriterState.Default);

    html.writeEmptyElementTag('br');
    expect(html.writerState).toBe(HtmlWriterState.Tag);
    html.writeEmptyElementTag('br');
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    html.writeEndTag('p');
    expect(html.writerState).toBe(HtmlWriterState.Default);

    expect(() => html.writeAttributeName('style')).toThrow(TypeError);
    expect(() => html.writeAttributeName(HtmlAttributeId.Style)).toThrow(TypeError);

    html.writeStartTag('p');
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    html.writeAttributeRange(HtmlAttributeId.Class, 'paragraph', 0, 'paragraph'.length);
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    html.writeAttributeRange('style', style, 0, style.length);
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    html.writeAttribute('align', 'left');
    expect(html.writerState).toBe(HtmlWriterState.Tag);

    html.writeMarkupText(markup);
    expect(html.writerState).toBe(HtmlWriterState.Default);

    html.writeEndTag(HtmlTagId.P);
    expect(html.writerState).toBe(HtmlWriterState.Default);

    html.writeStartTag(HtmlTagId.P);
    html.writeEndTag(HtmlTagId.P);

    html.writeStartTag('p');
    html.writeAttribute('class', 'paragraph');
    html.writeAttribute('style', style);
    html.writeAttribute('align', 'left');
    html.writeTextRange(text, 0, text.length);
    html.writeEmptyElementTag('br');
    html.writeEmptyElementTag('br');
    html.writeEndTag('p');

    html.writeStartTag('p');
    html.writeAttribute('class', 'paragraph');
    html.writeAttribute('style', style);
    html.writeAttribute('align', 'left');
    html.writeMarkupTextRange(markup, 0, markup.length);

    const paraEndTag = new HtmlTagToken('p', true);
    html.writeToken(paraEndTag);

    html.writeEndTag(HtmlTagId.Body);
    html.writeEndTag('html');
    html.flush();

    expect(readActual()).toBe(expected);
  }

  test('TestHtmlWriterToStringBuilder', () => {
    const sb = new StringWriter();
    const html = new HtmlWriter(sb);
    runHtmlWriter(html, () => sb.toString());
    html.dispose();
  });

  test('TestHtmlWriterToStream', () => {
    const memory = new MemoryStream();
    const html = new HtmlWriter(memory, 'utf-8');
    runHtmlWriter(html, () => new TextDecoder().decode(memory.toArray()));
    html.dispose();
  });
});
