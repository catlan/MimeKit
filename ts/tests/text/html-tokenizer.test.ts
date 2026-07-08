import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { testDataDir } from '../gates/helpers.js';
import {
  HtmlTokenizer,
  HtmlTokenizerState,
  HtmlTokenKind,
  HtmlDataToken,
  HtmlCDataToken,
  HtmlScriptDataToken,
  HtmlTagToken,
  HtmlCommentToken,
  HtmlDocTypeToken,
  HtmlTagId,
  HtmlAttributeId,
  HtmlNamespace,
  HtmlToken,
  decodeHtml,
} from '../../src/index.js';

const htmlDir = join(testDataDir, 'html');

function quote(text: string): string {
  let quoted = '"';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\\' || ch === '"') quoted += '\\';
    else if (ch === '\r') continue;
    quoted += ch;
  }
  quoted += '"';
  return quoted;
}

function verify(path: string, encoding: string, useTextReader: boolean, trimCharsetSuffix: boolean, detectBOM: boolean): void {
  let p = path;
  if (trimCharsetSuffix) {
    // strip the ".<charset>" that precedes the ".html" extension
    const ext = p.slice(p.lastIndexOf('.'));
    const charsetIdx = p.lastIndexOf('.', p.length - ext.length - 1);
    p = p.slice(0, charsetIdx) + ext;
  }
  const outpath = p.replace(/\.[^.]+$/, '.out.html');
  const tokensPath = p.replace(/\.[^.]+$/, '.tokens');
  const expectedOutput = existsSync(outpath) ? readFileSync(outpath, 'utf8') : '';
  const expected = existsSync(tokensPath) ? readFileSync(tokensPath, 'utf8').replace(/\r\n/g, '\n') : '';

  const bytes = new Uint8Array(readFileSync(path));
  const tokenizer = useTextReader
    ? new HtmlTokenizer(decodeHtml(bytes, encoding, detectBOM))
    : HtmlTokenizer.fromBytes(bytes, encoding, detectBOM);

  expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.Data);

  let output = '';
  let actual = '';
  let token;
  while ((token = tokenizer.readNextToken()) !== null) {
    output += token.toString();
    actual += `${token.kind}: `;
    switch (token.kind) {
      case HtmlTokenKind.ScriptData:
      case HtmlTokenKind.CData:
      case HtmlTokenKind.Data: {
        const t = token as HtmlDataToken;
        for (let i = 0; i < t.data.length; i++) {
          const ch = t.data[i]!;
          if (ch === '\f') actual += '\\f';
          else if (ch === '\t') actual += '\\t';
          else if (ch === '\r') {} // skip
          else if (ch === '\n') actual += '\\n';
          else actual += ch;
        }
        actual += '\n';
        break;
      }
      case HtmlTokenKind.Tag: {
        const tag = token as HtmlTagToken;
        actual += `<${tag.isEndTag ? '/' : ''}${tag.name}`;
        for (const attr of tag.attributes) {
          if (attr.value !== null) actual += ` ${attr.name}=${quote(attr.value)}`;
          else actual += ` ${attr.name}`;
        }
        actual += tag.isEmptyElement ? '/>' : '>';
        actual += '\n';
        break;
      }
      case HtmlTokenKind.Comment: {
        const c = token as HtmlCommentToken;
        actual += c.comment.replace(/\r\n/g, '\n');
        actual += '\n';
        break;
      }
      case HtmlTokenKind.DocType: {
        const d = token as HtmlDocTypeToken;
        if (d.forceQuirksMode) actual += '<!-- force quirks mode -->';
        actual += '<!DOCTYPE';
        if (d.name !== null) actual += ` ${d.name.toUpperCase()}`;
        if (d.publicIdentifier !== null) {
          actual += ` PUBLIC ${quote(d.publicIdentifier)}`;
          if (d.systemIdentifier !== null) actual += ` ${quote(d.systemIdentifier)}`;
        } else if (d.systemIdentifier !== null) {
          actual += ` SYSTEM ${quote(d.systemIdentifier)}`;
        }
        actual += '>';
        actual += '\n';
        break;
      }
      default:
        throw new Error(`Unhandled token type: ${token.kind}`);
    }
  }

  expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.EndOfFile);
  expect(actual).toBe(expected);
  expect(output).toBe(expectedOutput);
}

function readToken(tokenizer: HtmlTokenizer): HtmlToken {
  const token = tokenizer.readNextToken();
  expect(token).not.toBeNull();
  return token!;
}

describe('HtmlTokenizer', () => {
  test('TestArgumentExceptions', () => {
    expect(() => new HtmlTokenizer(null as never)).toThrow(TypeError);
    expect(() => HtmlTokenizer.fromBytes(null as never)).toThrow(TypeError);
    expect(() => HtmlTokenizer.fromBytes(null as never, 'utf-8')).toThrow(TypeError);
    expect(() => HtmlTokenizer.fromBytes(new Uint8Array(), null as never)).toThrow(TypeError);
    expect(() => HtmlTokenizer.fromBytes(new Uint8Array())).not.toThrow();
    expect(() => HtmlTokenizer.fromBytes(new Uint8Array(), 'utf-8')).not.toThrow();
  });

  test.each([true, false])('TestGoogleSignInAttemptBlocked useTextReader=%s', (useTextReader) => {
    verify(join(htmlDir, 'blocked.html'), 'windows-1252', useTextReader, false, true);
  });

  test.each([true, false])('TestXamarin3SampleHtml useTextReader=%s', (useTextReader) => {
    verify(join(htmlDir, 'xamarin3.html'), 'windows-1252', useTextReader, false, true);
  });

  test.each([true, false])('TestPapercut useTextReader=%s', (useTextReader) => {
    verify(join(htmlDir, 'papercut.html'), 'windows-1252', useTextReader, false, true);
  });

  test.each([true, false])('TestPapercut44 useTextReader=%s', (useTextReader) => {
    verify(join(htmlDir, 'papercut-4.4.html'), 'windows-1252', useTextReader, false, true);
  });

  test.each([true, false])('TestScriptData useTextReader=%s', (useTextReader) => {
    verify(join(htmlDir, 'script-data.html'), 'windows-1252', useTextReader, false, true);
  });

  test.each([true, false])('TestCData useTextReader=%s', (useTextReader) => {
    verify(join(htmlDir, 'cdata.html'), 'windows-1252', useTextReader, false, true);
  });

  test.each([true, false])('TestTokenizer useTextReader=%s', (useTextReader) => {
    verify(join(htmlDir, 'test.html'), 'windows-1252', useTextReader, false, true);
  });

  test.each([true, false])('TestPlainText useTextReader=%s', (useTextReader) => {
    verify(join(htmlDir, 'plaintext.html'), 'windows-1252', useTextReader, false, true);
  });

  test.each([true, false])('TestBadlyQuotedAttribute useTextReader=%s', (useTextReader) => {
    verify(join(htmlDir, 'badly-quoted-attr.html'), 'windows-1252', useTextReader, false, true);
  });

  test.each(["utf-8","utf-16","utf-16BE","utf-32","utf-32BE"])('TestDetectEncodingFromByteOrderMarks %s', (charset) => {
    verify(join(htmlDir, `Gimhae_Kim_clan.${charset}.html`), 'windows-1252', false, true, true);
  });

  test.each(["utf-8","utf-16","utf-16BE","utf-32","utf-32BE"])('TestSkipByteOrderMarks %s', (charset) => {
    verify(join(htmlDir, `Gimhae_Kim_clan.${charset}.html`), charset, false, true, false);
  });

  test('TokenizationFinalEOF', () => {
  
      let tokenizer = new HtmlTokenizer("");
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TokenizationLongerCharacterReference', () => {
  
      const content = "&abcdefghijklmnopqrstvwxyzABCDEFGHIJKLMNOPQRSTV;";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      const cdata = token as HtmlDataToken;
      expect(cdata.data).toBe(content);
  });

  test('TokenizationStartTagDetection', () => {
  
      let tokenizer = new HtmlTokenizer("<p>");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      const tag = token as HtmlTagToken;
      expect(tag.name).toBe("p");
      expect(tag.isEndTag).toBe(false);
      expect(tag.isEmptyElement).toBe(false);
  });

  test('TokenizationBogusCommentEmpty', () => {
  
      let tokenizer = new HtmlTokenizer("<!>");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      const comment = token as HtmlCommentToken;
      expect(comment.comment).toBe("");
  });

  test('TokenizationBogusCommentQuestionMark', () => {
  
      let tokenizer = new HtmlTokenizer("<?>");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      const comment = token as HtmlCommentToken;
      expect(comment.comment).toBe("?");
  });

  test('TokenizationBogusCommentClosingTag', () => {
  
      let tokenizer = new HtmlTokenizer("</ >");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      const comment = token as HtmlCommentToken;
      expect(comment.comment).toBe(" ");
  });

  test('TokenizationTagNameDetection', () => {
  
      let tokenizer = new HtmlTokenizer("<span>");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect((token as HtmlTagToken).name).toBe("span");
  });

  test('TokenizationTagSelfClosingDetected', () => {
  
      let tokenizer = new HtmlTokenizer("<img />");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect((token as HtmlTagToken).isEmptyElement).toBe(true);
  });

  test('TokenizationAttributesDetected', () => {
  
      let tokenizer = new HtmlTokenizer("<a target='_blank' href='http://whatever' title='ho'>");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect((token as HtmlTagToken).attributes.count).toBe(3);
  });

  test('TokenizationAttributeNameDetection', () => {
  
      let tokenizer = new HtmlTokenizer("<input required>");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect((token as HtmlTagToken).attributes.get(0).name).toBe("required");
  });

  test('TokenizationTagMixedCaseHandling', () => {
  
      let tokenizer = new HtmlTokenizer("<InpUT>");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Input);
  });

  test('TokenizationTagSpacesBehind', () => {
  
      let tokenizer = new HtmlTokenizer("<i   >");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect((token as HtmlTagToken).name).toBe("i");
  });

  test('TokenizationCharacterReferenceNotin', () => {
  
      let str = '';
      let src = "I'm &notin; I tell you";
      let tokenizer = new HtmlTokenizer(src);
      let token: HtmlToken | null;
  
      while ((token = tokenizer.readNextToken()) !== null) {
        if (token.kind === HtmlTokenKind.Data)
          str += (token as HtmlDataToken).data;
      }
  
      expect(str).toBe("I'm ∉ I tell you");
  });

  test('TokenizationCharacterReferenceNotIt', () => {
  
      let str = '';
      let src = "I'm &notit; I tell you";
      let tokenizer = new HtmlTokenizer(src);
      let token: HtmlToken | null;
  
      while ((token = tokenizer.readNextToken()) !== null) {
        if (token.kind === HtmlTokenKind.Data)
          str += (token as HtmlDataToken).data;
      }
  
      expect(str).toBe("I'm ¬it; I tell you");
  });

  test('TokenizationDoctypeDetected', () => {
  
      let tokenizer = new HtmlTokenizer("<!doctype html>");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
  });

  test('TokenizationCommentDetected', () => {
  
      let tokenizer = new HtmlTokenizer("<!-- hi my friend -->");
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
  });

  test('TokenizationCDataDetected', () => {
  
      let tokenizer = new HtmlTokenizer("<![CDATA[hi mum how <!-- are you doing />]]>");
  
      //tokenizer.IsAcceptingCharacterData = true;
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.CData);
  });

  test('TokenizationCDataCorrectCharacters', () => {
  
      let sb = '';
      let tokenizer = new HtmlTokenizer("<![CDATA[hi mum how <!-- are you doing />]]>");
      let token: HtmlToken | null;
  
      //tokenizer.IsAcceptingCharacterData = true;
  
      while ((token = tokenizer.readNextToken()) !== null) {
        if (token.kind === HtmlTokenKind.CData)
          sb += (token as HtmlCDataToken).data;
      }
  
      expect(sb).toBe("hi mum how <!-- are you doing />");
  });

  test('TokenizationUnusualDoctype', () => {
  
      let tokenizer = new HtmlTokenizer("<!DOCTYPE root_element SYSTEM \"DTD_location\">");
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
  
      const d = token as HtmlDocTypeToken;
      expect(d.name).not.toBeNull();
      expect(d.name).toBe("root_element");
      expect(d.systemIdentifier).toBe("DTD_location");
  });

  test('TokenizationOnlyCarriageReturn', () => {
  
      let tokenizer = new HtmlTokenizer("\r");
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("\r");
  });

  test('TokenizationOnlyLineFeed', () => {
  
      let tokenizer = new HtmlTokenizer("\n");
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("\n");
  });

  test('TokenizationCarriageReturnLineFeed', () => {
  
      let tokenizer = new HtmlTokenizer("\r\n");
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("\r\n");
  });

  test('TokenizationLongestLegalCharacterReference', () => {
  
      let content = "&CounterClockwiseContourIntegral;";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("∳");
  });

  test('TestDataCharacterReferencesNotDecoded', () => {
  
      const content = "<b>check &CounterClockwiseContourIntegral; is not decoded</b>";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      tokenizer.decodeCharacterReferencesEnabled = false;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.B);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.Data);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("check &CounterClockwiseContourIntegral; is not decoded");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.B);
      expect((token as HtmlTagToken).isEndTag).toBe(true);
  });

  test('TestRcDataCharacterReferencesNotDecoded', () => {
  
      const content = "<title>check &CounterClockwiseContourIntegral; is not decoded</title>";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      tokenizer.decodeCharacterReferencesEnabled = false;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Title);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RcData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("check &CounterClockwiseContourIntegral; is not decoded");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Title);
      expect((token as HtmlTagToken).isEndTag).toBe(true);
  });

  test('TestTruncatedMarkupDeclarationOpen', () => {
  
      const content = "<!-";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<!-");
  });

  test('TestTruncatedDocType', () => {
  
      const content = "<!DOCTYPE";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      expect((token as HtmlDocTypeToken).forceQuirksMode).toBe(true);
  });

  test('TestTruncatedDocTypeSpace', () => {
  
      const content = "<!DOCTYPE ";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      expect((token as HtmlDocTypeToken).forceQuirksMode).toBe(true);
  });

  test('TestDocTypeNoName', () => {
  
      const content = "<!DOCTYPE  >";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      expect((token as HtmlDocTypeToken).forceQuirksMode).toBe(true);
  });

  test('TestTruncatedDocTypeName', () => {
  
      const content = "<!DOCTYPE HTML";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      expect((token as HtmlDocTypeToken).forceQuirksMode).toBe(true);
  });

  test('TestDocTypeWithName', () => {
  
      const content = "<!DOCTYPE HTML>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      expect((token as HtmlDocTypeToken).forceQuirksMode).toBe(false);
  });

  test('TestTruncatedAfterDocTypeName', () => {
  
      const content = "<!DOCTYPE HTML ";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      expect((token as HtmlDocTypeToken).forceQuirksMode).toBe(true);
  });

  test('TestDocTypeNameParseError', () => {
  
      const content = "<!DOCTYPE HTML\0>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.name).toBe("HTML\uFFFD");
      expect(doctype.forceQuirksMode).toBe(false);
  });

  test('TestDocTypeNameSpace', () => {
  
      const content = "<!DOCTYPE HTML >";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.name).toBe("HTML");
      expect(doctype.forceQuirksMode).toBe(false);
  });

  test('TestDocTypeNameSpaceBogus', () => {
  
      const content = "<!DOCTYPE HTML BOGUS>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.name).toBe("HTML");
      expect(doctype.forceQuirksMode).toBe(false);
  });

  test('TestAfterDocTypeNameBogusDocType', () => {
  
      const content = "<!DOCTYPE HTML PUBLISH>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.name).toBe("HTML");
      expect(doctype.forceQuirksMode).toBe(false);
  });

  test('TestBogusDocTypeAfterName', () => {
  
      const content = "<!DOCTYPE HTML BOGUS >";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.name).toBe("HTML");
      expect(doctype.forceQuirksMode).toBe(false);
  });

  test('TestDocTypeNamePublicX', () => {
  
      const content = "<!DOCTYPE HTML PUBLICX>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.name).toBe("HTML");
      expect(doctype.forceQuirksMode).toBe(true);
  });

  test('TestDocTypePublicIdentifierQuotedParseError', () => {
  
      const content = "<!DOCTYPE HTML PUBLIC \"public-identifier\0\">";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.name).toBe("HTML");
      expect(doctype.forceQuirksMode).toBe(false);
      expect(doctype.publicKeyword).toBe("PUBLIC");
      expect(doctype.publicIdentifier).toBe("public-identifier\uFFFD");
  });

  test('TestDocTypeSystemIdentifierQuotedParseError', () => {
  
      const content = "<!DOCTYPE HTML SYSTEM \"system-identifier\0\">";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.name).toBe("HTML");
      expect(doctype.forceQuirksMode).toBe(false);
      expect(doctype.systemKeyword).toBe("SYSTEM");
      expect(doctype.systemIdentifier).toBe("system-identifier\uFFFD");
  });

  test('TestTruncatedDocTypeAfterPublicKeyword', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.name).toBe("HTML");
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
  });

  test('TestTruncatedDocTypeBeforePublicIdentifier', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc ";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
  });

  test('TestIncompleteDocTypeBeforePublicIdentifier', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc  >";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
  });

  test('TestInvalidDocTypeBeforePublicIdentifier', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc  value>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
      expect(doctype.publicIdentifier).toBe(null);
  });

  test('TestIncompleteDocTypePublicIdentifierQuoted', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc \"value>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
      expect(doctype.publicIdentifier).toBe("value");
  });

  test('TestTruncatedDocTypePublicIdentifierQuoted', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc \"value";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
      expect(doctype.publicIdentifier).toBe("value");
  });

  test('TestTruncatedDocTypeAfterPublicIdentifier', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc \"value\"";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
      expect(doctype.publicIdentifier).toBe("value");
  });

  test('TestDocTypePublicWithoutSpace', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc\"value\">";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(false);
      expect(doctype.publicKeyword).toBe("PuBlIc");
      expect(doctype.publicIdentifier).toBe("value");
  });

  test('TestDocTypeQuoteAfterPublicIdentifier', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc \"value\"\">";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
      expect(doctype.publicIdentifier).toBe("value");
  });

  test('TestDocTypeCharAfterPublicIdentifier', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc \"value\"x>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
      expect(doctype.publicIdentifier).toBe("value");
  });

  test('TestTruncatedDocTypeBetweenPublicAndSystemIdentifier', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc \"value\" ";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
      expect(doctype.publicIdentifier).toBe("value");
  });

  test('TestInvalidDocTypeBetweenPublicAndSystemIdentifier', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc \"value\"  x>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
      expect(doctype.publicIdentifier).toBe("value");
  });

  test('TestDocTypeBetweenPublicAndSystemIdentifier', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc \"value\"  >";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(false);
      expect(doctype.publicKeyword).toBe("PuBlIc");
      expect(doctype.publicIdentifier).toBe("value");
  });

  test('TestDocTypeNamePublicClose', () => {
  
      const content = "<!DOCTYPE HTML PuBlIc>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.publicKeyword).toBe("PuBlIc");
      expect(doctype.publicIdentifier).toBe(null);
  });

  test('TestTruncatedDocTypeAfterSystemKeyword', () => {
  
      const content = "<!DOCTYPE HTML SySTeM";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.systemKeyword).toBe("SySTeM");
      expect(doctype.systemIdentifier).toBe(null);
  });

  test('TestDocTypeSystemWithoutSpace', () => {
  
      const content = "<!DOCTYPE HTML SySTeM\"value\">";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(false);
      expect(doctype.systemKeyword).toBe("SySTeM");
      expect(doctype.systemIdentifier).toBe("value");
  });

  test('TestTruncatedDocTypeBeforeSystemIdentifier', () => {
  
      const content = "<!DOCTYPE HTML SySTeM ";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.systemKeyword).toBe("SySTeM");
  });

  test('TestDocTypeBeforeSystemIdentifier', () => {
  
      const content = "<!DOCTYPE HTML SySTeM  >";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.systemKeyword).toBe("SySTeM");
  });

  test('TestDocTypeBeforeSystemIdentifierX', () => {
  
      const content = "<!DOCTYPE HTML SySTeM  x>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.systemKeyword).toBe("SySTeM");
  });

  test('TestTruncatedDocTypeSystemIdentifier', () => {
  
      const content = "<!DOCTYPE HTML SySTeM \"value";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.systemKeyword).toBe("SySTeM");
      expect(doctype.systemIdentifier).toBe("value");
  });

  test('TestDocTypeQuoteAfterSystemIdentifier', () => {
  
      const content = "<!DOCTYPE HTML SySTeM \"value\"\">";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(false);
      expect(doctype.systemKeyword).toBe("SySTeM");
      expect(doctype.systemIdentifier).toBe("value");
  });

  test('TestDocTypeCharAfterSystemIdentifier', () => {
  
      const content = "<!DOCTYPE HTML SySTeM \"value\"x>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(false);
      expect(doctype.systemKeyword).toBe("SySTeM");
      expect(doctype.systemIdentifier).toBe("value");
  });

  test('TestTruncatedDocTypeAfterSystemIdentifier', () => {
  
      const content = "<!DOCTYPE HTML SySTeM \"value\" ";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.systemKeyword).toBe("SySTeM");
      expect(doctype.systemIdentifier).toBe("value");
  });

  test('TestTruncatedBogusDocType', () => {
  
      const content = "<!DOCTYPE HTML SySTeM \"value\" x";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
      expect(doctype.systemKeyword).toBe("SySTeM");
      expect(doctype.systemIdentifier).toBe("value");
  });

  test('TestDocTypeNameSystemX', () => {
  
      const content = "<!DOCTYPE HTML SYSTEMX>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
  });

  test('TestDocTypeNameSystem', () => {
  
      const content = "<!DOCTYPE HTML SYSTEM>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.DocType);
      const doctype = token as HtmlDocTypeToken;
      expect(doctype.forceQuirksMode).toBe(true);
  });

  test('TestTruncatedDocTypeToken', () => {
  
      const content = "<!DOC";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<!DOC");
  });

  test('TestNotQuiteDocTypeBogusComment', () => {
  
      const content = "<!DOCS>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("DOCS");
  });

  test('TestTruncatedNotQuiteDocTypeBogusComment', () => {
  
      const content = "<!DOCS";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("DOCS");
  });

  test('TestNotQuiteCDATABogusComment', () => {
  
      const content = "<![CDAT[>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("[CDAT[");
  });

  test('TestTruncatedNotQuiteCDATABogusComment', () => {
  
      const content = "<![CDAT[";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("[CDAT[");
  });

  test('TestTruncatedCDATA', () => {
  
      const content = "<![CDATA";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<![CDATA");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedCDATASection', () => {
  
      const content = "<![CDATA[this is some cdata]]";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.CData);
      expect((token as HtmlDataToken).data).toBe("this is some cdata]]");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.CData);
      expect((token as HtmlDataToken).data).toBe("this is some cdata]]");
  });

  test('TestTruncatedComment', () => {
  
      const content = "<!--comment";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("comment");
  });

  test('TestTruncatedCommentEndDash', () => {
  
      const content = "<!--comment-";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("comment");
  });

  test('TestEmptyComment0', () => {
  
      const content = "<!-->"; // malformed
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe('');
  });

  test('TestEmptyComment1', () => {
  
      const content = "<!--->"; // malformed
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe('');
  });

  test('TestEmptyComment2', () => {
  
      const content = "<!---->"; // correct
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe('');
  });

  test('TestTruncatedEmptyComment0', () => {
  
      const content = "<!--";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe('');
  });

  test('TestTruncatedEmptyComment1', () => {
  
      const content = "<!---";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe('');
  });

  test('TestTruncatedEmptyComment2', () => {
  
      const content = "<!----";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe('');
  });

  test('TestDashComment', () => {
  
      const content = "<!---comment-->";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("-comment");
  });

  test('TestDashDashComment', () => {
  
      const content = "<!----comment-->";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("--comment");
  });

  test('TestCommentDash', () => {
  
      const content = "<!--comment--->";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("comment-");
  });

  test('TestCommentDashDash', () => {
  
      const content = "<!--comment---->";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("comment--");
  });

  test('TestCommentDashComment', () => {
  
      const content = "<!--comment-comment-->";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("comment-comment");
  });

  test('TestCommentDashDashComment', () => {
  
      const content = "<!--comment--comment-->";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("comment--comment");
  });

  test('TestCommentEndBang', () => {
  
      const content = "<!--comment--!>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("comment");
  });

  test('TestTruncatedCommentEndBang', () => {
  
      const content = "<!--comment--!";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("comment");
  });

  test('TestCommentDashDashBang', () => {
  
      const content = "<!--comment--!-->";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("comment--!");
  });

  test('TestCommentDashDashBangComment', () => {
  
      const content = "<!--comment--!comment-->";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Comment);
      expect((token as HtmlCommentToken).comment).toBe("comment--!comment");
  });

  test('TestTruncatedCharacterReferenceStart', () => {
  
      const content = "&";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("&");
  });

  test('TestTruncatedCharacterReference', () => {
  
      const content = "&am";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("&am");
  });

  test('TestTruncatedTagOpen', () => {
  
      const content = "<";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTagOpenDigit', () => {
  
      const content = "<5>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<5>");
  });

  test('TestTruncatedTagName', () => {
  
      const content = "<nam";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<nam");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedBeforeAttributeName', () => {
  
      const content = "<name ";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedAttributeName', () => {
  
      const content = "<name attr";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedAfterAttributeName', () => {
  
      const content = "<name attr  ";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr  ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedSelfClosingTag1', () => {
  
      const content = "<name/";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name/");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedSelfClosingTag2', () => {
  
      const content = "<name /";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name /");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedSelfClosingTagWithAttributeName1', () => {
  
      const content = "<name attr/";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr/");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedSelfClosingTagWithAttributeName2', () => {
  
      const content = "<name attr /";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr /");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedBeforeAttributeValue1', () => {
  
      const content = "<name attr =";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr =");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedBeforeAttributeValue2', () => {
  
      const content = "<name attr = ";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr = ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedAttributeValueQuoted', () => {
  
      const content = "<name attr=\"value";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr=\"value");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedAttributeValueQuotedWithAbortedCharacterReference', () => {
  
      const content = "<name attr=\"one & two";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr=\"one & two");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedAttributeValueUnquoted', () => {
  
      const content = "<name attr=value";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr=value");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedCharacterReferenceInAttributeValue1', () => {
  
      const content = "<name attr=&";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr=&");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedCharacterReferenceInAttributeValue2', () => {
  
      const content = "<name attr=&am";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr=&am");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestUnquotedAmpersandAttributeValue', () => {
  
      const content = "<name attr=&>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      const tag = token as HtmlTagToken;
      expect(tag.name).toBe("name");
      expect(tag.attributes.count).toBe(1);
      expect(tag.attributes.get(0).name).toBe("attr");
      expect(tag.attributes.get(0).value).toBe("&");
  });

  test('TestTruncatedAfterAttributeValueQuoted', () => {
  
      const content = "<name attr=\"value\"";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr=\"value\"");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestAttrbuteNameAfterAttributeValueQuoted', () => {
  
      const content = "<name attr1=\"value\"attr2=value>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      const tag = token as HtmlTagToken;
      expect(tag.name).toBe("name");
      expect(tag.attributes.count).toBe(2);
      expect(tag.attributes.get(0).name).toBe("attr1");
      expect(tag.attributes.get(0).value).toBe("value");
      expect(tag.attributes.get(1).name).toBe("attr2");
      expect(tag.attributes.get(1).value).toBe("value");
  });

  test('TestTruncatedSelfClosingTagAfterAttributeValueQuoted', () => {
  
      const content = "<name attr=\"value\"/";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr=\"value\"/");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedSelfClosingTagBeforeAttributeValue', () => {
  
      const content = "<name attr=  /";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr=  /");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestSelfClosingTagBeforeAttributeValue', () => {
  
      const content = "<name attr=  />";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      const tag = token as HtmlTagToken;
      expect(tag.name).toBe("name");
      expect(tag.attributes.count).toBe(1);
      expect(tag.attributes.get(0).name).toBe("attr");
      expect(tag.attributes.get(0).value).toBe(null);
  });

  test('TestMultipleAttributes', () => {
  
      const content = "<name attr1=\"value\"  attr2 =  value  attr3  />";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      const tag = token as HtmlTagToken;
      expect(tag.name).toBe("name");
      expect(tag.attributes.count).toBe(3);
      expect(tag.attributes.get(0).value).toBe("value");
      expect(tag.attributes.get(1).value).toBe("value");
      expect(tag.attributes.get(2).value).toBeNull();
  });

  test('TestTruncatedAfterAttributeValueUnquoted', () => {
  
      const content = "<name attr=value  ";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("<name attr=value  ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedEndTagOpen', () => {
  
      const content = "</";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedRawText', () => {
  
      const content = "<style>a";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("a");
  });

  test('TestTruncatedRawTextEndTagOpen', () => {
  
      const content = "<style></";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedRawTextEndTagOpenNonAsciiLetter', () => {
  
      const content = "<style></ ";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</ ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</ ");
  });

  test('TestTruncatedRawTextEndTagName', () => {
  
      const content = "<style></s";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</s");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedRawTextEndTagNameNotActiveTagSpace', () => {
  
      const content = "<style></bold ";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</bold ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</bold ");
  });

  test('TestTruncatedRawTextEndTagNameNotActiveTagSolidus', () => {
  
      const content = "<style></bold/";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</bold/");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</bold/");
  });

  test('TestTruncatedRawTextEndTagNameNotActiveTagGreaterThan', () => {
  
      const content = "<style></bold>";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</bold>");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</bold>");
  });

  test('TestTruncatedRawTextEndTagNameNotActiveTagNonAsciiLetter', () => {
  
      const content = "<style></bold-";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</bold-");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</bold-");
  });

  test('TestRawTextEndTagNameSpace', () => {
  
      const content = "<style>a</style >";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("a");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect((token as HtmlTagToken).isEndTag).toBe(true);
  });

  test('TestRawTextEndTagNameSolidus', () => {
  
      const content = "<style>a</style/>";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("a");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Style);
      expect((token as HtmlTagToken).isEndTag).toBe(true);
  });

  test('TestTruncatedRcData', () => {
  
      const content = "<title>a";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Title);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RcData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("a");
  });

  test('TestTruncatedRcDataEndTagOpen', () => {
  
      const content = "<title></";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Title);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RcData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Title);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RcData);
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedRcDataEndTagName', () => {
  
      const content = "<title></t";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Title);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RcData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</t");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Title);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RcData);
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedScriptData', () => {
  
      const content = "<script>a";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("a");
  });

  test('TestTruncatedScriptDataEscapedDash', () => {
  
      const content = "<script><!-- -";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -");
  });

  test('TestTruncatedScriptDataEscapedDashDash', () => {
  
      const content = "<script><!--";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!--");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!--");
  });

  test('TestTruncatedScriptDataEscapedEndTagOpen', () => {
  
      const content = "<script><!---</";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</");
  });

  test('TestTruncatedScriptDataEscapedEndTagName', () => {
  
      const content = "<script><!---</s";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</s");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</s");
  });

  test('TestTruncatedScriptDataEscapedEndTagNameActiveTagSpace', () => {
  
      const content = "<script><!-- -</script ";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -");
      token = readToken(tokenizer);
      // FIXME: Is this correct? Or should it be ScriptData?
      expect(token.kind).toBe(HtmlTokenKind.Data);
      expect((token as HtmlDataToken).data).toBe("</script ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -");
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestTruncatedScriptDataEscapedEndTagNameNotActiveTagSpace', () => {
  
      const content = "<script><!-- -</style ";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style ");
  });

  test('TestTruncatedScriptDataEscapedEndTagNameNotActiveTagSolidus', () => {
  
      const content = "<script><!-- -</style/";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style/");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style/");
  });

  test('TestTruncatedScriptDataEscaped', () => {
  
      const content = "<script><!--- ";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!--- ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!--- ");
  });

  test('TestTruncatedScriptDataDoubleEscapeStart', () => {
  
      const content = "<script><!---<s";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<s");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<s");
  });

  test('TestTruncatedScriptDataDoubleEscapeStartNotActiveTagSpace', () => {
  
      const content = "<script><!---<style ";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<style ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<style ");
  });

  test('TestTruncatedScriptDataDoubleEscapeStartNotActiveTagNonAsciiLetter', () => {
  
      const content = "<script><!---<style-";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<style-");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<style-");
  });

  test('TestTruncatedScriptDataDoubleEscaped', () => {
  
      const content = "<script><!---<script>";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>");
  });

  test('TestTruncatedScriptDataDoubleEscapedDash', () => {
  
      const content = "<script><!---<script>-";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>-");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>-");
  });

  test('TestTruncatedScriptDataDoubleEscapedDashDefault', () => {
  
      const content = "<script><!---<script>-a";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>-a");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>-a");
  });

  test('TestTruncatedScriptDataDoubleEscapedDashDash', () => {
  
      const content = "<script><!---<script>--";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>--");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>--");
  });

  test('TestTruncatedScriptDataDoubleEscapedDashDashDash', () => {
  
      const content = "<script><!---<script>---";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>---");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>---");
  });

  test('TestTruncatedScriptDataDoubleEscapedDashDashGreaterThan', () => {
  
      const content = "<script><!---<script>-->";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>-->");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>-->");
  });

  test('TestTruncatedScriptDataDoubleEscapedDashDashLetter', () => {
  
      const content = "<script><!---<script>--a";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>--a");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!---");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>--a");
  });

  test('TestTruncatedScriptDataEndTagOpen', () => {
  
      const content = "<script></";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</");
  });

  test('TestTruncatedScriptDataEndTagName', () => {
  
      const content = "<script></s";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</s");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</s");
  });

  test('TestTruncatedScriptDataEndTagNameNotActiveTagSpace', () => {
  
      const content = "<script></style ";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style ");
  });

  test('TestTruncatedScriptDataEndTagNameNotActiveTagSolidus', () => {
  
      const content = "<script></style/";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style/");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style/");
  });

  test('TestTruncatedScriptDataEndTagNameNotActiveTagGreaterThan', () => {
  
      const content = "<script></style>";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style>");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style>");
  });

  test('TestTruncatedScriptDataEndTagNameNotActiveTagNonAsciiLetter', () => {
  
      const content = "<script></style-";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style-");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</style-");
  });

  test('TestTruncatedScriptDataEscapeStartNonDash', () => {
  
      const content = "<script><!a";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!a");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!a");
  });

  test('TestTruncatedScriptDataEscapeStartDashNonDash', () => {
  
      const content = "<script><!-a";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-a");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-a");
  });

  test('TestTruncatedScriptDataEscapedDashLessThan', () => {
  
      const content = "<script><!-- -<";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -");
      token = readToken(tokenizer);
      expect((token as HtmlScriptDataToken).data).toBe("<");
  });

  test('TestTruncatedScriptDataEscapedDashDefault', () => {
  
      const content = "<script><!-- -a";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -a");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- -a");
  });

  test('TestTruncatedScriptDataEscapedEndTagOpenNonAsciiLetter', () => {
  
      const content = "<script><!-- </ ";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- ");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</ ");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!-- ");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("</ ");
  });

  test('TestTruncatedScriptDataDoubleEscapeEndNotActiveTag', () => {
  
      const content = "<script><!--<--<script>double escaped!-</style>";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!--");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<--");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>double escaped!-</style>");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!--");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<--");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>double escaped!-</style>");
  });

  test('TestTruncatedScriptDataDoubleEscapeEndNonAsciiLetter', () => {
  
      const content = "<script><!--<--<script>double escaped!-</style-";
      let tokenizer = new HtmlTokenizer(content);
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!--");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<--");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>double escaped!-</style-");
  
      tokenizer = new HtmlTokenizer(content);
      tokenizer.ignoreTruncatedTagsEnabled = true;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      expect((token as HtmlTagToken).id).toBe(HtmlTagId.Script);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.ScriptData);
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<!--");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<--");
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.ScriptData);
      expect((token as HtmlScriptDataToken).data).toBe("<script>double escaped!-</style-");
  });

  test('TestBeforeAttributeNameParseError', () => {
  
      const content = "<img \"image.png\">";
      let tokenizer = new HtmlTokenizer(content);
      let tag: HtmlTagToken;
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      tag = token as HtmlTagToken;
      expect(tag.id).toBe(HtmlTagId.Image);
      expect(tag.attributes.count).toBe(1);
      expect(tag.attributes.get(0).name).toBe("\"image.png\"");
      expect(tag.attributes.get(0).id).toBe(HtmlAttributeId.Unknown);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.Data);
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestAfterAttributeNameGreaterThan', () => {
  
      const content = "<img src >";
      let tokenizer = new HtmlTokenizer(content);
      let tag: HtmlTagToken;
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      tag = token as HtmlTagToken;
      expect(tag.id).toBe(HtmlTagId.Image);
      expect(tag.attributes.count).toBe(1);
      expect(tag.attributes.get(0).name).toBe("src");
      expect(tag.attributes.get(0).id).toBe(HtmlAttributeId.Src);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.Data);
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestAfterAttributeNameParseError', () => {
  
      const content = "<img src \">";
      let tokenizer = new HtmlTokenizer(content);
      let tag: HtmlTagToken;
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      tag = token as HtmlTagToken;
      expect(tag.id).toBe(HtmlTagId.Image);
      expect(tag.attributes.count).toBe(2);
      expect(tag.attributes.get(0).name).toBe("src");
      expect(tag.attributes.get(0).id).toBe(HtmlAttributeId.Src);
      expect(tag.attributes.get(1).name).toBe("\"");
      expect(tag.attributes.get(1).id).toBe(HtmlAttributeId.Unknown);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.Data);
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestBeforeAttributeValueParseError', () => {
  
      const content = "<img src= =>";
      let tokenizer = new HtmlTokenizer(content);
      let tag: HtmlTagToken;
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      tag = token as HtmlTagToken;
      expect(tag.id).toBe(HtmlTagId.Image);
      expect(tag.attributes.count).toBe(1);
      expect(tag.attributes.get(0).name).toBe("src");
      expect(tag.attributes.get(0).id).toBe(HtmlAttributeId.Src);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.Data);
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestBeforeAttributeValueGreaterThan', () => {
  
      const content = "<img src= >";
      let tokenizer = new HtmlTokenizer(content);
      let tag: HtmlTagToken;
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      tag = token as HtmlTagToken;
      expect(tag.id).toBe(HtmlTagId.Image);
      expect(tag.attributes.count).toBe(1);
      expect(tag.attributes.get(0).name).toBe("src");
      expect(tag.attributes.get(0).id).toBe(HtmlAttributeId.Src);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.Data);
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestAttributeValueUnquotedParseError', () => {
  
      const content = "<img src=ab=c>";
      let tokenizer = new HtmlTokenizer(content);
      let tag: HtmlTagToken;
      let token: HtmlToken | null;
  
      token = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      tag = token as HtmlTagToken;
      expect(tag.id).toBe(HtmlTagId.Image);
      expect(tag.attributes.count).toBe(1);
      expect(tag.attributes.get(0).name).toBe("src");
      expect(tag.attributes.get(0).id).toBe(HtmlAttributeId.Src);
      expect(tag.attributes.get(0).value).toBe("ab=c");
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.Data);
      expect(tokenizer.readNextToken()).toBeNull();
  });

  test('TestIncompleteEndTag', () => {
  
      const content = "</>";
      let tokenizer = new HtmlTokenizer(content);
  
      // TODO: is this the expected behavior?
      expect(tokenizer.readNextToken()).toBeNull();
      //Assert.That (token.Kind, Is.EqualTo (HtmlTokenKind.Data));
      //Assert.That (((HtmlDataToken) token).Data, Is.EqualTo ("</>"));
  });

  test('TestInvalidSelfClosingStartTag', () => {
  
      const content = "<name/ attr=value>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      const tag = token as HtmlTagToken;
      expect(tag.name).toBe("name");
      expect(tag.attributes.count).toBe(1);
  });

  test('TestNoScript', () => {
  
      const content = "<noscript>";
      let tokenizer = new HtmlTokenizer(content);
  
      let token: HtmlToken | null = readToken(tokenizer);
      expect(token.kind).toBe(HtmlTokenKind.Tag);
      const tag = token as HtmlTagToken;
      expect(tag.name).toBe("noscript");
      expect(tag.id).toBe(HtmlTagId.NoScript);
      expect(tokenizer.tokenizerState).toBe(HtmlTokenizerState.RawText);
  });

});
