import { describe, expect, test } from 'vitest';
import { HtmlAttribute, HtmlAttributeId, toAttributeName, toHtmlAttributeId } from '../../src/index.js';

describe('HtmlAttribute', () => {
  test('TestArgumentExceptions', () => {
    expect(() => new HtmlAttribute(HtmlAttributeId.Unknown, '')).toThrow(RangeError);
    expect(() => new HtmlAttribute(null as unknown as string, '')).toThrow(TypeError);
    expect(() => new HtmlAttribute('', '')).toThrow(TypeError);
    expect(() => new HtmlAttribute('a b c', '')).toThrow(TypeError);
  });

  test('TestToHtmlAttributeId', () => {
    expect(toHtmlAttributeId(''), 'string.Empty').toBe(HtmlAttributeId.Unknown);
    expect(toHtmlAttributeId('alt'), 'alt').toBe(HtmlAttributeId.Alt);
    expect(toHtmlAttributeId('Alt'), 'Alt').toBe(HtmlAttributeId.Alt);
    expect(toHtmlAttributeId('aLt'), 'aLt').toBe(HtmlAttributeId.Alt);
    expect(toHtmlAttributeId('ALT'), 'ALT').toBe(HtmlAttributeId.Alt);
    expect(toHtmlAttributeId('AlT'), 'AlT').toBe(HtmlAttributeId.Alt);

    for (const value of Object.values(HtmlAttributeId)) {
      if (value === HtmlAttributeId.Unknown) continue;

      const name = toAttributeName(value).toUpperCase();
      const parsed = toHtmlAttributeId(name);

      expect(parsed, `Failed to parse the HtmlAttributeId value for ${value}`).toBe(value);
    }

    const name = toAttributeName(1024 as unknown as HtmlAttributeId);
    expect(name, 'ToAttributeName() for unknown value').toBe('1024');
  });
});
