import { describe, expect, test } from 'vitest';
import { HtmlTagId, toHtmlTagId, toHtmlTagName, isEmptyElement, isFormattingElement } from '../../src/index.js';

describe('HtmlTagId', () => {
  test('TestToHtmlTagId', () => {
    expect(toHtmlTagId(''), 'string.Empty').toBe(HtmlTagId.Unknown);
    expect(toHtmlTagId('!'), '!').toBe(HtmlTagId.Comment);
    expect(toHtmlTagId('!blah'), '!blah').toBe(HtmlTagId.Comment);
    expect(toHtmlTagId('a'), 'a').toBe(HtmlTagId.A);
    expect(toHtmlTagId('A'), 'A').toBe(HtmlTagId.A);
    expect(toHtmlTagId('font'), 'font').toBe(HtmlTagId.Font);
    expect(toHtmlTagId('FONT'), 'FONT').toBe(HtmlTagId.Font);
    expect(toHtmlTagId('FoNt'), 'FoNt').toBe(HtmlTagId.Font);

    for (const value of Object.values(HtmlTagId)) {
      if (value === HtmlTagId.Unknown) continue;

      const name = toHtmlTagName(value).toUpperCase();
      const parsed = toHtmlTagId(name);

      expect(parsed, `Failed to parse the HtmlTagId value for ${value}`).toBe(value);
    }

    const name = toHtmlTagName(1024 as unknown as HtmlTagId);
    expect(name, 'ToHtmlTagName() for unknown value').toBe('1024');
  });

  test('TestIsFormattingElement', () => {
    const formattingElements = ['a', 'b', 'big', 'code', 'em', 'font', 'i', 'nobr', 's', 'small', 'strike', 'strong', 'tt', 'u'];

    for (const element of formattingElements) {
      const tag = toHtmlTagId(element);
      expect(isFormattingElement(tag), element).toBe(true);
    }

    expect(isFormattingElement(toHtmlTagId('body')), 'body').toBe(false);
  });

  test('TestIsEmptyElement', () => {
    const emptyElements = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'];

    for (const element of emptyElements) {
      const tag = toHtmlTagId(element);
      expect(isEmptyElement(tag), element).toBe(true);
    }

    expect(isEmptyElement(toHtmlTagId('body')), 'body').toBe(false);
  });
});
