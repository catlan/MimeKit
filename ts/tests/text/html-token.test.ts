import { describe, expect, test } from 'vitest';
import {
  HtmlAttribute,
  HtmlCDataToken,
  HtmlCommentToken,
  HtmlDataToken,
  HtmlDocTypeToken,
  HtmlScriptDataToken,
  HtmlTagId,
  HtmlTagToken,
  HtmlTokenKind,
  type TextWriter,
} from '../../src/index.js';

class BrokenHtmlDataToken extends HtmlDataToken {
  constructor(data: string) {
    super(HtmlTokenKind.Comment, data);
  }
}

const nullWriter = null as unknown as TextWriter;

describe('HtmlToken', () => {
  test('TestArgumentExceptions', () => {
    const comment = new HtmlCommentToken('This is a comment.');
    const cdata = new HtmlCDataToken('This is some CDATA.');
    const data = new HtmlDataToken('This is some character data.');
    const script = new HtmlScriptDataToken('This is some script data.');
    const doc = new HtmlDocTypeToken();
    const tag = new HtmlTagToken('name', false);
    const attributes: HtmlAttribute[] = [];

    expect(() => new HtmlCommentToken(null as unknown as string)).toThrow(TypeError);
    expect(() => comment.writeTo(nullWriter)).toThrow(TypeError);

    expect(() => new HtmlCDataToken(null as unknown as string)).toThrow(TypeError);
    expect(() => cdata.writeTo(nullWriter)).toThrow(TypeError);

    expect(() => new HtmlDataToken(null as unknown as string)).toThrow(TypeError);
    expect(() => new BrokenHtmlDataToken('This is some character data.')).toThrow(RangeError);
    expect(() => data.writeTo(nullWriter)).toThrow(TypeError);

    expect(() => doc.writeTo(nullWriter)).toThrow(TypeError);

    expect(() => new HtmlTagToken(null as unknown as string, attributes, false)).toThrow(TypeError);
    expect(() => new HtmlTagToken('name', null as unknown as HtmlAttribute[], false)).toThrow(TypeError);
    expect(() => new HtmlTagToken(null as unknown as string, false)).toThrow(TypeError);
    expect(() => tag.writeTo(nullWriter)).toThrow(TypeError);

    expect(() => new HtmlScriptDataToken(null as unknown as string)).toThrow(TypeError);
    expect(() => script.writeTo(nullWriter)).toThrow(TypeError);
  });

  test('TestHtmlTagTokenCtor', () => {
    const attrs = [new HtmlAttribute('src', 'image.png'), new HtmlAttribute('alt', '[image]')];
    const token = new HtmlTagToken('img', attrs, true);

    expect(token.id).toBe(HtmlTagId.Image);
    expect(token.isEmptyElement).toBe(true);
    expect(token.isEndTag).toBe(false);
    expect(token.attributes.count).toBe(2);
  });

  test('TestHtmlDocTypePublicIdentifier', () => {
    const doctype = new HtmlDocTypeToken();

    doctype.publicIdentifier = 'public-identifier';
    expect(doctype.publicIdentifier, 'PublicIdentifier').toBe('public-identifier');
    expect(doctype.publicKeyword, 'PublicKeyword').toBe('PUBLIC');
    expect(doctype.systemKeyword, 'SystemKeyword').toBeNull();

    doctype.publicIdentifier = null;
    expect(doctype.publicIdentifier, 'PublicIdentifier').toBeNull();
    expect(doctype.publicKeyword, 'PublicKeyword').toBe('PUBLIC');
    expect(doctype.systemKeyword, 'SystemKeyword').toBeNull();

    doctype.publicIdentifier = 'public-identifier';
    doctype.systemIdentifier = 'system-identifier';
    doctype.publicIdentifier = null;
    expect(doctype.publicIdentifier, 'PublicIdentifier').toBeNull();
    expect(doctype.publicKeyword, 'PublicKeyword').toBe('PUBLIC');
    expect(doctype.systemKeyword, 'SystemKeyword').toBe('SYSTEM');
  });

  test('TestHtmlDocTypeSystemIdentifier', () => {
    const doctype = new HtmlDocTypeToken();

    doctype.systemIdentifier = 'system-identifier';
    expect(doctype.systemIdentifier, 'SystemIdentifier').toBe('system-identifier');
    expect(doctype.systemKeyword, 'SystemKeyword').toBe('SYSTEM');

    doctype.systemIdentifier = null;
    expect(doctype.systemIdentifier, 'SystemIdentifier').toBeNull();
    expect(doctype.systemKeyword, 'SystemKeyword').toBeNull();
  });
});
