import { describe, expect, test } from 'vitest';
import { FormatOptions } from '../../src/format-options.js';
import { ParserOptions } from '../../src/parser-options.js';
import { utf8 } from '../../src/utils/charset-utils.js';
import {
  asciiString,
  decodePhrase,
  decodePhraseWithCodePage,
  decodeText,
  decodeTextWithCodePage,
  encodePhrase,
  encodeText,
  foldUnstructuredHeader,
} from '../../src/utils/rfc2047.js';

const te = new TextEncoder();

function bytes(text: string): Uint8Array {
  return te.encode(text);
}

function unquote(text: string): string {
  if (text.length >= 2 && text[0] === '"' && text[text.length - 1] === '"') {
    let out = '';
    for (let i = 1; i < text.length - 1; i++) {
      if (text[i] === '\\' && i + 1 < text.length - 1)
        i++;
      out += text[i]!;
    }
    return out;
  }
  return text;
}

describe('Rfc2047', () => {
  test('TestArgumentExceptions', () => {
    const text = bytes('this is some text');

    expect(() => decodePhrase(null as unknown as ParserOptions, text, 0, text.length)).toThrow(TypeError);
    expect(() => decodePhrase(ParserOptions.default, null as unknown as Uint8Array, 0, text.length)).toThrow(TypeError);
    expect(() => decodePhrase(ParserOptions.default, text, -1, text.length)).toThrow(RangeError);
    expect(() => decodePhrase(ParserOptions.default, text, 0, -1)).toThrow(RangeError);

    expect(() => decodePhrase(null as unknown as Uint8Array, 0, text.length)).toThrow(TypeError);
    expect(() => decodePhrase(text, -1, text.length)).toThrow(RangeError);
    expect(() => decodePhrase(text, 0, -1)).toThrow(RangeError);

    expect(() => decodePhrase(null as unknown as ParserOptions, text)).toThrow(TypeError);
    expect(() => decodePhrase(ParserOptions.default, null as unknown as Uint8Array)).toThrow(TypeError);

    expect(() => decodePhrase(null as unknown as Uint8Array)).toThrow(TypeError);

    expect(() => decodeText(null as unknown as ParserOptions, text, 0, text.length)).toThrow(TypeError);
    expect(() => decodeText(ParserOptions.default, null as unknown as Uint8Array, 0, text.length)).toThrow(TypeError);
    expect(() => decodeText(ParserOptions.default, text, -1, text.length)).toThrow(RangeError);
    expect(() => decodeText(ParserOptions.default, text, 0, -1)).toThrow(RangeError);

    expect(() => decodeText(null as unknown as Uint8Array, 0, text.length)).toThrow(TypeError);
    expect(() => decodeText(text, -1, text.length)).toThrow(RangeError);
    expect(() => decodeText(text, 0, -1)).toThrow(RangeError);

    expect(() => decodeText(null as unknown as ParserOptions, text)).toThrow(TypeError);
    expect(() => decodeText(ParserOptions.default, null as unknown as Uint8Array)).toThrow(TypeError);

    expect(() => decodeText(null as unknown as Uint8Array)).toThrow(TypeError);

    expect(() => encodePhrase(null as unknown as FormatOptions, utf8, 'phrase', 0, 6)).toThrow(TypeError);
    expect(() => encodePhrase(FormatOptions.default, null as never, 'phrase', 0, 6)).toThrow(TypeError);
    expect(() => encodePhrase(FormatOptions.default, utf8, null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => encodePhrase(FormatOptions.default, utf8, 'phrase', -1, 6)).toThrow(RangeError);
    expect(() => encodePhrase(FormatOptions.default, utf8, 'phrase', 0, 7)).toThrow(RangeError);

    expect(() => encodePhrase(null as never, 'phrase', 0, 6)).toThrow(TypeError);
    expect(() => encodePhrase(utf8, null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => encodePhrase(utf8, 'phrase', -1, 6)).toThrow(RangeError);
    expect(() => encodePhrase(utf8, 'phrase', 0, 7)).toThrow(RangeError);

    expect(() => encodePhrase(null as unknown as FormatOptions, utf8, 'phrase')).toThrow(TypeError);
    expect(() => encodePhrase(FormatOptions.default, null as never, 'phrase')).toThrow(TypeError);
    expect(() => encodePhrase(FormatOptions.default, utf8, null as unknown as string)).toThrow(TypeError);

    expect(() => encodePhrase(null as never, 'phrase')).toThrow(TypeError);
    expect(() => encodePhrase(utf8, null as unknown as string)).toThrow(TypeError);

    expect(() => encodeText(null as unknown as FormatOptions, utf8, 'text', 0, 4)).toThrow(TypeError);
    expect(() => encodeText(FormatOptions.default, null as never, 'text', 0, 4)).toThrow(TypeError);
    expect(() => encodeText(FormatOptions.default, utf8, null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => encodeText(FormatOptions.default, utf8, 'text', -1, 4)).toThrow(RangeError);
    expect(() => encodeText(FormatOptions.default, utf8, 'text', 0, 5)).toThrow(RangeError);

    expect(() => encodeText(null as never, 'text', 0, 4)).toThrow(TypeError);
    expect(() => encodeText(utf8, null as unknown as string, 0, 0)).toThrow(TypeError);
    expect(() => encodeText(utf8, 'text', -1, 4)).toThrow(RangeError);
    expect(() => encodeText(utf8, 'text', 0, 5)).toThrow(RangeError);

    expect(() => encodeText(null as unknown as FormatOptions, utf8, 'text')).toThrow(TypeError);
    expect(() => encodeText(FormatOptions.default, null as never, 'text')).toThrow(TypeError);
    expect(() => encodeText(FormatOptions.default, utf8, null as unknown as string)).toThrow(TypeError);

    expect(() => encodeText(null as never, 'text')).toThrow(TypeError);
    expect(() => encodeText(utf8, null as unknown as string)).toThrow(TypeError);
  });

  test('TestDecodeEmptyString', () => {
    const empty = new Uint8Array();

    expect(decodePhrase(empty)).toBe('');
    expect(decodePhrase(empty, 0, 0)).toBe('');
    expect(decodePhrase(ParserOptions.default, empty)).toBe('');
    expect(decodePhrase(ParserOptions.default, empty, 0, 0)).toBe('');
    expect(decodePhraseWithCodePage(ParserOptions.default, empty, 0, 0).value).toBe('');

    expect(decodeText(empty)).toBe('');
    expect(decodeText(empty, 0, 0)).toBe('');
    expect(decodeText(ParserOptions.default, empty)).toBe('');
    expect(decodeText(ParserOptions.default, empty, 0, 0)).toBe('');
    expect(decodeTextWithCodePage(ParserOptions.default, empty, 0, 0).value).toBe('');
  });

  test.each([
    ['TestDecodeEncodedWordEmptyCharset', 'blurdy bloop =??q?no_charset?= beep boop', 'blurdy bloop =??q?no_charset?= beep boop'],
    ['TestDecodeEncodedWordEmptyCharsetWithLang', 'blurdy bloop =?*en?q?no_charset?= beep boop', 'blurdy bloop =?*en?q?no_charset?= beep boop'],
    ['TestDecodeEncodedWordWithLang', 'blurdy bloop =?iso-8859-1*en?q?this_is_english?= beep boop', 'blurdy bloop this is english beep boop'],
    ['TestDecodeEncodedWordInvalidEncoding', 'blurdy bloop =?iso-8859-1?x?invalid_encoding?= beep boop', 'blurdy bloop =?iso-8859-1?x?invalid_encoding?= beep boop'],
    ['TestDecodeEncodedWordInvalidMultiCharacterEncoding', 'blurdy bloop =?iso-8859-1?qb?invalid_encoded_word?= beep boop', 'blurdy bloop =?iso-8859-1?qb?invalid_encoded_word?= beep boop'],
    ['TestDecodeEncodedWordIncompletePayload', 'blurdy bloop =?iso-8859-1?q?invalid_encoding', 'blurdy bloop =?iso-8859-1?q?invalid_encoding'],
    ['TestDecodeEncodedWordIncompleteCharset', 'blurdy bloop =?iso-8859-1', 'blurdy bloop =?iso-8859-1'],
    ['TestDecodeEncodedWordInvalidCharsetName', 'blurdy bloop =?isö-8859-1?q?invalid_charset_name?= beep boop', 'blurdy bloop =?isö-8859-1?q?invalid_charset_name?= beep boop'],
    ['TestDecodeEncodedWordInvalidLanguageCode', 'blurdy bloop =?iso-8859-1*eñ-US?q?invalid_charset_name?= beep boop', 'blurdy bloop =?iso-8859-1*eñ-US?q?invalid_charset_name?= beep boop'],
    ['TestDecodeEncodedWordEmbeddedInAnotherWord', 'blurdy bloop=?iso-8859-1?q?_encoded_word_?=beep boop', 'blurdy bloop encoded word beep boop'],
  ])('%s', (_name, text, expected) => {
    const buffer = bytes(text);
    expect(decodePhrase(buffer)).toBe(expected);
    expect(decodeText(buffer)).toBe(expected);
  });

  test('TestDecodeMultipleEncodedWordsWithCommonCodePage', () => {
    const text = '=?iso-8859-1?q?latin1_?= =?utf-8?q?unicode_?= =?iso-8859-1?q?and_latin1_again?=';
    const expected = 'latin1 unicode and latin1 again';
    const buffer = bytes(text);

    let result = decodePhraseWithCodePage(ParserOptions.default, buffer, 0, buffer.length);
    expect(result.value).toBe(expected);
    expect(result.codePage).toBe(28591);

    result = decodeTextWithCodePage(ParserOptions.default, buffer, 0, buffer.length);
    expect(result.value).toBe(expected);
    expect(result.codePage).toBe(28591);
  });

  test('TestDecodeMultipleEncodedWordsWithoutCommonCodePage', () => {
    const text = '=?iso-8859-1?q?latin1_?= =?iso-8859-2?q?latin2_?= =?iso-8859-3?q?latin3?=';
    const expected = 'latin1 latin2 latin3';
    const buffer = bytes(text);

    let result = decodePhraseWithCodePage(ParserOptions.default, buffer, 0, buffer.length);
    expect(result.value).toBe(expected);
    expect(result.codePage).toBe(28591);

    result = decodeTextWithCodePage(ParserOptions.default, buffer, 0, buffer.length);
    expect(result.value).toBe(expected);
    expect(result.codePage).toBe(28591);
  });

  test('TestDecodeEnsuresCodePageCapacity', () => {
    const text = '=?us-ascii?q?0?= =?iso-8859-1?q?1?= =?iso-8859-2?q?2?= =?iso-8859-3?q?3?= =?iso-8859-4?q?4?= =?iso-8859-5?q?5?= =?iso-8859-6?q?6?= =?iso-8859-7?q?7?= =?iso-8859-8?q?8?= =?iso-8859-9?q?9?= =?koi8-r?q?a?= =?koi8-u?q?b?= =?big5?q?c?= =?euc-cn?q?d?= =?euc-kr?q?e?= =?utf-8?q?f?= =?gb2312?q?g?=';
    const expected = '0123456789abcdefg';
    const buffer = bytes(text);

    let result = decodePhraseWithCodePage(ParserOptions.default, buffer, 0, buffer.length);
    expect(result.value).toBe(expected);
    // TS charset-utils aliases euc-cn/gb2312 to the supported GBK codepage 936,
    // so the last duplicate codepage wins this otherwise all-tied count.
    expect(result.codePage).toBe(936);

    result = decodeTextWithCodePage(ParserOptions.default, buffer, 0, buffer.length);
    expect(result.value).toBe(expected);
    expect(result.codePage).toBe(936);
  });

  test('TestEncodeControls', () => {
    const expected = "I'm so happy! =?utf-8?q?=07?= I love MIME so much =?utf-8?q?=07=07!?= Isn't it great?";
    const text = "I'm so happy! \x07 I love MIME so much \x07\x07! Isn't it great?";

    expect(asciiString(encodePhrase(utf8, text))).toBe(expected);
    expect(asciiString(encodePhrase(utf8, text, 0, text.length))).toBe(expected);
    expect(asciiString(encodeText(utf8, text))).toBe(expected);
    expect(asciiString(encodeText(utf8, text, 0, text.length))).toBe(expected);
  });

  test('TestEncodeSurrogatePair', () => {
    const expected = "I'm so happy! =?utf-8?b?8J+YgA==?= I love MIME so much =?utf-8?b?4p2k77iP4oCN8J+UpSE=?= Isn't it great?";
    const text = "I'm so happy! 😀 I love MIME so much ❤️‍🔥! Isn't it great?";

    expect(asciiString(encodePhrase(utf8, text))).toBe(expected);
    expect(asciiString(encodePhrase(utf8, text, 0, text.length))).toBe(expected);
    expect(asciiString(encodeText(utf8, text))).toBe(expected);
    expect(asciiString(encodeText(utf8, text, 0, text.length))).toBe(expected);
  });

  test('TestEncodeWrongCharset', () => {
    const expected = "I'm so happy! =?utf-8?b?5ZCN44GM44OJ44Oh44Kk44Oz?= I love MIME so much =?utf-8?b?4p2k77iP4oCN8J+UpSE=?= Isn't it great?";
    const text = "I'm so happy! 名がドメイン I love MIME so much ❤️‍🔥! Isn't it great?";

    expect(asciiString(encodePhrase(utf8, text))).toBe(expected);
    expect(asciiString(encodePhrase(utf8, text, 0, text.length))).toBe(expected);
    expect(asciiString(encodeText(utf8, text))).toBe(expected);
    expect(asciiString(encodeText(utf8, text, 0, text.length))).toBe(expected);
  });

  test('TestEncodePhraseLongSentenceWithCommas', () => {
    const expected = '"Once upon a time, back when things that are old now were new, there lived a man with a very particular set of skills."';
    const text = 'Once upon a time, back when things that are old now were new, there lived a man with a very particular set of skills.';
    const result = asciiString(encodePhrase(utf8, text));
    expect(result).toBe(expected);
    expect(unquote(result)).toBe(text);
  });

  test('TestEncodePhraseWithInnerQuotedString', () => {
    const expected = '"John \\"Jacob Jingle Heimer\\" Schmidt"';
    const text = 'John "Jacob Jingle Heimer" Schmidt';
    const result = asciiString(encodePhrase(utf8, text));
    expect(result).toBe(expected);
    expect(unquote(result)).toBe(text);
  });

  test.each([
    ['TestEncodePhraseWithInnerUnicodeQuotedString1', 'John =?utf-8?b?Ium7nueci0DlkI3jgYzjg4njg6HjgqTjg7MgSmFjb2IgSmluZ2xlIEhlaW1lciI=?= Schmidt', 'John "點看@名がドメイン Jacob Jingle Heimer" Schmidt'],
    ['TestEncodePhraseWithInnerUnicodeQuotedString2', 'John =?utf-8?b?IkphY29iIEppbmdsZSDpu57nnItA5ZCN44GM44OJ44Oh44Kk44OzIEhlaW1lciI=?= Schmidt', 'John "Jacob Jingle 點看@名がドメイン Heimer" Schmidt'],
    ['TestEncodePhraseWithInnerUnicodeQuotedString3', 'John =?utf-8?b?IkphY29iIEppbmdsZSBIZWltZXIg6bue55yLQOWQjeOBjOODieODoeOCpOODsyI=?= Schmidt', 'John "Jacob Jingle Heimer 點看@名がドメイン" Schmidt'],
    ['TestEncodePhraseWithInnerUnicodeQuotedString4', 'John =?utf-8?q?=22Jacob_Jingle_Heimer=2C_his_name_is_my_name_too!_Whenever_he_goes_out=2C_the_?=\t=?utf-8?q?people_always_shout=2C_=5C=22There_goes_John_Jacob_Jingle_Heimer_Schmidt!=5C=22_?=\t=?utf-8?b?6bue55yLQOWQjeOBjOODieODoeOCpOODsyI=?= Schmidt', 'John "Jacob Jingle Heimer, his name is my name too! Whenever he goes out, the people always shout, \\"There goes John Jacob Jingle Heimer Schmidt!\\" 點看@名がドメイン" Schmidt'],
  ])('%s', (_name, expected, text) => {
    const result = asciiString(encodePhrase(utf8, text));
    expect(result).toBe(expected);
    expect(decodePhrase(bytes(result))).toBe(text);
  });

  test('TestEncodePhraseWithInnerUnicodeQuotedString5', () => {
    const expected = '"John \\"Whenever he goes out, the people always shout, \\\\\\"There goes John Jacob Jingle Heimer Schmidt!\\\\\\"\\" Schmidt"';
    const text = 'John "Whenever he goes out, the people always shout, \\"There goes John Jacob Jingle Heimer Schmidt!\\"" Schmidt';
    const result = asciiString(encodePhrase(utf8, text));
    expect(result).toBe(expected);
    expect(unquote(result)).toBe(text);
  });

  test('TestEncodePhraseWithInnerUnicodeComment', () => {
    const expected = '"John (Jacob Jingle Heimer) Schmidt"';
    const text = 'John (Jacob Jingle Heimer) Schmidt';
    const result = asciiString(encodePhrase(utf8, text));
    expect(result).toBe(expected);
    expect(unquote(result)).toBe(text);
  });

  test.each([
    ['TestEncodePhraseWithInnerUnicodeComment1', 'John =?utf-8?b?KOm7nueci0DlkI3jgYzjg4njg6HjgqTjg7MgSmFjb2IgSmluZ2xlIEhlaW1lcik=?= Schmidt', 'John (點看@名がドメイン Jacob Jingle Heimer) Schmidt'],
    ['TestEncodePhraseWithInnerUnicodeComment2', 'John =?utf-8?b?KEphY29iIEppbmdsZSDpu57nnItA5ZCN44GM44OJ44Oh44Kk44OzIEhlaW1lcik=?= Schmidt', 'John (Jacob Jingle 點看@名がドメイン Heimer) Schmidt'],
    ['TestEncodePhraseWithInnerUnicodeComment3', 'John =?utf-8?b?KEphY29iIEppbmdsZSBIZWltZXIg6bue55yLQOWQjeOBjOODieODoeOCpOODsyk=?= Schmidt', 'John (Jacob Jingle Heimer 點看@名がドメイン) Schmidt'],
    ['TestEncodePhraseWithInnerUnicodeComment4', 'John =?utf-8?q?=28Jacob_Jingle_Heimer=2C_his_name_is_my_name_too!_Whenever_he_goes_out=2C_the_p?=\t=?utf-8?q?eople_always_shout=2C_=22There_goes_John_Jacob_Jingle_Heimer_Schmidt!=22?=\t=?utf-8?b?IOm7nueci0DlkI3jgYzjg4njg6HjgqTjg7Mp?= Schmidt', 'John (Jacob Jingle Heimer, his name is my name too! Whenever he goes out, the people always shout, "There goes John Jacob Jingle Heimer Schmidt!" 點看@名がドメイン) Schmidt'],
  ])('%s', (_name, expected, text) => {
    const result = asciiString(encodePhrase(utf8, text));
    expect(result).toBe(expected);
    expect(decodePhrase(bytes(result))).toBe(text);
  });

  test.each([
    ['TestFoldMultiLineHeaderValue', ' This is a multi-line\r\n header value.\r\n', 'This is a multi-line\r\nheader value.'],
    ['TestFoldPreFoldedHeaderValue', ' This is a pre\r\n folded header value.\r\n', 'This is a pre\r\n folded header value.'],
    ['TestFoldReallyLongWordToken', ' This header value has a\r\n really-really-really-really-long-rfc0822-word-token-that-exceeds-the-max-allo\r\n wable-line-length-and-must-be-folded lets see what MimeKit does...\r\n', 'This header value has a really-really-really-really-long-rfc0822-word-token-that-exceeds-the-max-allowable-line-length-and-must-be-folded lets see what MimeKit does...'],
    ['TestFoldHeaderValueWithEncodedWordsIncludingLanguageCodes', " I'm so happy! =?utf-8*en-US?b?8J+YgA==?= I love MIME so much\r\n =?utf-8*en-US?b?4p2k77iP4oCN8J+UpSE=?= Isn't it great?\r\n", "I'm so happy! =?utf-8*en-US?b?8J+YgA==?= I love MIME so much =?utf-8*en-US?b?4p2k77iP4oCN8J+UpSE=?= Isn't it great?"],
    ['TestFoldHeaderValueAtTabs', " I'm so happy! =?utf-8*en-US?b?8J+YgA==?= I love MIME so much\r\n\t=?utf-8*en-US?b?4p2k77iP4oCN8J+UpSE=?= Isn't it great? MIME is\r\n\tsupercalafragalisticexpialadotious, don't you think?\r\n", "I'm so happy! =?utf-8*en-US?b?8J+YgA==?= I love MIME so much\t=?utf-8*en-US?b?4p2k77iP4oCN8J+UpSE=?= Isn't it great? MIME is\tsupercalafragalisticexpialadotious, don't you think?"],
    ['TestFoldHeaderValueWithEmbeddedEncodedWordTokens', ' This subject has embedded\r\n =?iso-8859-1*en-US?q?rfc2047_encoded_word_tokens?=... How does the folding\r\n logic handle these embedded=?iso-8859-1*en-US?q?rfc2047_encoded_word_tokens?=\r\n ...?\r\n', 'This subject has embedded=?iso-8859-1*en-US?q?rfc2047_encoded_word_tokens?=... How does the folding logic handle these embedded=?iso-8859-1*en-US?q?rfc2047_encoded_word_tokens?=...?'],
    ['TestFolderHeaderValueDoesNotIgnoreWhitespaceBetweenEncodedWords', ' This test should demonstrate that\r\n =?iso-8859-1*en-US?q?whitespace_between_rfc2047_encoded_word_tokens?= \t \t \r\n\t =?iso-8859-1*en-US?q?does_not_get_ignored?=\r\n', 'This test should demonstrate that =?iso-8859-1*en-US?q?whitespace_between_rfc2047_encoded_word_tokens?= \t \t \t =?iso-8859-1*en-US?q?does_not_get_ignored?='],
  ])('%s', (_name, expected, text) => {
    const options = FormatOptions.default.clone();
    options.newLineFormat = 'dos';
    expect(asciiString(foldUnstructuredHeader(options, 'Subject', bytes(text)))).toBe(expected);
  });
});
