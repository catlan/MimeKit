import { describe, expect, test } from 'vitest';
import { HeaderFooterFormat, HtmlTagId, TextFormat, TextToHtml } from '../../src/index.js';

describe('TextToHtmlTests', () => {
  test('TestArgumentExceptions', () => {
    const converter = new TextToHtml();
    expect(() => converter.convert(null as never)).toThrow(TypeError);
  });

  test('TestDefaultPropertyValues', () => {
    const converter = new TextToHtml();
    expect(converter.footer).toBeNull();
    expect(converter.footerFormat).toBe(HeaderFooterFormat.Text);
    expect(converter.header).toBeNull();
    expect(converter.headerFormat).toBe(HeaderFooterFormat.Text);
    expect(converter.htmlTagCallback).toBeNull();
    expect(converter.inputFormat).toBe(TextFormat.Plain);
    expect(converter.outputFormat).toBe(TextFormat.Html);
    expect(converter.outputHtmlFragment).toBe(false);
  });

  test('TestOutputHtmlFragment', () => {
    const input = 'This is the html body';
    const expected = '<html><body>This is the html body<br/></body></html>';
    const expected2 = 'This is the html body<br/>';
    const converter = new TextToHtml();

    let result = converter.convert(input);
    expect(result).toBe(expected);

    converter.outputHtmlFragment = true;
    result = converter.convert(input);
    expect(result).toBe(expected2);
  });

  test('TestHeaderFooter', () => {
    const input = 'This is the html body';
    const header = 'This is the header';
    const footer = 'This is the footer';
    const expected = `<html><body>${header}<br/>${input}<br/>${footer}<br/></body></html>`;
    const converter = new TextToHtml();
    converter.headerFormat = HeaderFooterFormat.Text;
    converter.header = header;
    converter.footerFormat = HeaderFooterFormat.Text;
    converter.footer = footer;

    const result = converter.convert(input);
    expect(result).toBe(expected);
  });

  test('TestEmoji', () => {
    const expected = '<html><body>&#128561;<br/></body></html>';
    const emoji = new TextDecoder().decode(new Uint8Array([0xF0, 0x9F, 0x98, 0xB1]));
    const converter = new TextToHtml();
    const result = converter.convert(emoji);

    expect(result).toBe(expected);
  });

  test('TestIncreasingQuoteLevels', () => {
    const expected = '<blockquote>Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg!<br/>' +
      '<blockquote>Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!<br/>' +
      '<blockquote>Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!<br/>' +
      '<blockquote>Henceforth, the coding style is to be strictly enforced, including the use of only upper case.<br/>' +
      '<blockquote>I&#39;ve noticed a lack of adherence to the coding styles, of late.<br/>' +
      '<blockquote>Any complaints?<br/>' +
      '</blockquote></blockquote></blockquote></blockquote></blockquote></blockquote>';
    const text = '> Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg!\n' +
      '>> Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!\n' +
      '>>> Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!\n' +
      '>>>> Henceforth, the coding style is to be strictly enforced, including the use of only upper case.\n' +
      ">>>>> I've noticed a lack of adherence to the coding styles, of late.\n" +
      '>>>>>> Any complaints?\n';
    const converter = new TextToHtml();
    converter.outputHtmlFragment = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestIncreasingQuoteLevelsNoNewLineAtEndOfText', () => {
    const expected = '<blockquote>Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg!<br/>' +
      '<blockquote>Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!<br/>' +
      '<blockquote>Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!<br/>' +
      '<blockquote>Henceforth, the coding style is to be strictly enforced, including the use of only upper case.<br/>' +
      '<blockquote>I&#39;ve noticed a lack of adherence to the coding styles, of late.<br/>' +
      '<blockquote>Any complaints?<br/>' +
      '</blockquote></blockquote></blockquote></blockquote></blockquote></blockquote>';
    const text = '> Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg!\n' +
      '>> Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!\n' +
      '>>> Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!\n' +
      '>>>> Henceforth, the coding style is to be strictly enforced, including the use of only upper case.\n' +
      ">>>>> I've noticed a lack of adherence to the coding styles, of late.\n" +
      '>>>>>> Any complaints?';
    const converter = new TextToHtml();
    converter.outputHtmlFragment = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestDecreasingQuoteLevels', () => {
    const expected = '<blockquote><blockquote><blockquote><blockquote><blockquote><blockquote>Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg!<br/>' +
      '</blockquote>Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!<br/>' +
      '</blockquote>Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!<br/>' +
      '</blockquote>Henceforth, the coding style is to be strictly enforced, including the use of only upper case.<br/>' +
      '</blockquote>I&#39;ve noticed a lack of adherence to the coding styles, of late.<br/>' +
      '</blockquote>Any complaints?<br/>' +
      '</blockquote>';
    const text = '>>>>>> Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg!\n' +
      '>>>>> Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!\n' +
      '>>>> Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!\n' +
      '>>> Henceforth, the coding style is to be strictly enforced, including the use of only upper case.\n' +
      ">> I've noticed a lack of adherence to the coding styles, of late.\n" +
      '> Any complaints?\n';
    const converter = new TextToHtml();
    converter.outputHtmlFragment = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestSimpleTextToHtml', () => {
    const expected = 'This is some sample text. This is line #1.<br/>' +
      'This is line #2.<br/>' +
      'And this is line #3.<br/>';
    const text = 'This is some sample text. This is line #1.\n' +
      'This is line #2.\n' +
      'And this is line #3.\n';
    const converter = new TextToHtml();
    converter.outputHtmlFragment = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestSimpleTextWithUrlsToHtml', () => {
    const expected = 'Check out <a href="http://www.xamarin.com">http://www.xamarin.com</a> - it&#39;s amazing!<br/>';
    const text = "Check out http://www.xamarin.com - it's amazing!\n";
    const converter = new TextToHtml();
    converter.outputHtmlFragment = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestHtmlTagCallback', () => {
    // extra (not in C#): verifies synthetic link tag callbacks can delete tags.
    const converter = new TextToHtml();
    converter.htmlTagCallback = (ctx, writer) => {
      if (ctx.tagId === HtmlTagId.A) ctx.deleteTag = true;
      else ctx.writeTag(writer, true);
    };
    expect(converter.convert('http://www.xamarin.com\n')).toContain('http://www.xamarin.com');
  });
});
