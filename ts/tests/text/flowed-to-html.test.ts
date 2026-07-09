import { describe, expect, test } from 'vitest';
import { FlowedToHtml, HeaderFooterFormat, TextFormat } from '../../src/index.js';

describe('FlowedToHtmlTests', () => {
  test('TestArgumentExceptions', () => {
    const converter = new FlowedToHtml();
    expect(() => converter.convert(null as never)).toThrow(TypeError);
  });

  test('TestDefaultPropertyValues', () => {
    const converter = new FlowedToHtml();
    expect(converter.deleteSpace).toBe(false);
    expect(converter.footer).toBeNull();
    expect(converter.footerFormat).toBe(HeaderFooterFormat.Text);
    expect(converter.header).toBeNull();
    expect(converter.headerFormat).toBe(HeaderFooterFormat.Text);
    expect(converter.htmlTagCallback).toBeNull();
    expect(converter.inputFormat).toBe(TextFormat.Flowed);
    expect(converter.outputFormat).toBe(TextFormat.Html);
    expect(converter.outputHtmlFragment).toBe(false);
  });

  test('TestSimpleFlowedToHtml', () => {
    const expected = '<p>This is some sample text that has been formatted ' +
      'according to the format=flowed rules defined in rfc3676. ' +
      'This text, once converted, should all be on a single line.</p>\n' +
      '<br/>\n' +
      '<br/>\n' +
      '<br/>\n' +
      '<br/>\n' +
      '<p>And this line of text should be separate by 4 blank lines.</p>\n';
    const text = 'This is some sample text that has been formatted \n' +
      'according to the format=flowed rules defined in rfc3676. \n' +
      'This text, once converted, should all be on a single line.\n' +
      '\n' +
      '\n' +
      '\n' +
      '\n' +
      'And this line of text should be separate by 4 blank lines.\n';
    const converter = new FlowedToHtml();
    converter.outputHtmlFragment = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestIncreasingQuoteLevels', () => {
    const expected = '<blockquote><p>Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg!</p>\n' +
      '<blockquote><p>Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!</p>\n' +
      '<blockquote><p>Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!</p>\n' +
      '<blockquote><p>Henceforth, the coding style is to be strictly enforced, including the use of only upper case.</p>\n' +
      '<blockquote><p>I&#39;ve noticed a lack of adherence to the coding styles, of late.</p>\n' +
      '<blockquote><p>Any complaints?</p>\n' +
      '</blockquote></blockquote></blockquote></blockquote></blockquote></blockquote>';
    const text = '> Thou villainous ill-breeding spongy dizzy-eyed \n' +
      '> reeky elf-skinned pigeon-egg!\n' +
      '>> Thou artless swag-bellied milk-livered \n' +
      '>> dismal-dreaming idle-headed scut!\n' +
      '>>> Thou errant folly-fallen spleeny reeling-ripe \n' +
      '>>> unmuzzled ratsbane!\n' +
      '>>>> Henceforth, the coding style is to be strictly \n' +
      '>>>> enforced, including the use of only upper case.\n' +
      ">>>>> I've noticed a lack of adherence to the coding \n" +
      '>>>>> styles, of late.\n' +
      '>>>>>> Any complaints?\n';
    const converter = new FlowedToHtml();
    converter.outputHtmlFragment = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestDecreasingQuoteLevels', () => {
    const expected = '<blockquote><blockquote><blockquote><blockquote><blockquote><blockquote><p>Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg!</p>\n' +
      '</blockquote><p>Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!</p>\n' +
      '</blockquote><p>Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!</p>\n' +
      '</blockquote><p>Henceforth, the coding style is to be strictly enforced, including the use of only upper case.</p>\n' +
      '</blockquote><p>I&#39;ve noticed a lack of adherence to the coding styles, of late.</p>\n' +
      '</blockquote><p>Any complaints?</p>\n' +
      '</blockquote>';
    const text = '>>>>>> Thou villainous ill-breeding spongy dizzy-eyed \n' +
      '>>>>>> reeky elf-skinned pigeon-egg!\n' +
      '>>>>> Thou artless swag-bellied milk-livered \n' +
      '>>>>> dismal-dreaming idle-headed scut!\n' +
      '>>>> Thou errant folly-fallen spleeny reeling-ripe \n' +
      '>>>> unmuzzled ratsbane!\n' +
      '>>> Henceforth, the coding style is to be strictly \n' +
      '>>> enforced, including the use of only upper case.\n' +
      ">> I've noticed a lack of adherence to the coding \n" +
      '>> styles, of late.\n' +
      '> Any complaints?\n';
    const converter = new FlowedToHtml();
    converter.outputHtmlFragment = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestBrokenlyQuotedText', () => {
    const expected = '<blockquote><p>Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg! </p>\n' +
      '<blockquote><p>Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!</p>\n' +
      '<blockquote><p>Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!</p>\n' +
      '<blockquote><p>Henceforth, the coding style is to be strictly enforced, including the use of only upper case.</p>\n' +
      '<blockquote><p>I&#39;ve noticed a lack of adherence to the coding styles, of late.</p>\n' +
      '<blockquote><p>Any complaints?</p>\n' +
      '</blockquote></blockquote></blockquote></blockquote></blockquote></blockquote>';
    const text = '> Thou villainous ill-breeding spongy dizzy-eyed \n' +
      '> reeky elf-skinned pigeon-egg! \n' +
      '>> Thou artless swag-bellied milk-livered \n' +
      '>> dismal-dreaming idle-headed scut!\n' +
      '>>> Thou errant folly-fallen spleeny reeling-ripe \n' +
      '>>> unmuzzled ratsbane!\n' +
      '>>>> Henceforth, the coding style is to be strictly \n' +
      '>>>> enforced, including the use of only upper case.\n' +
      ">>>>> I've noticed a lack of adherence to the coding \n" +
      '>>>>> styles, of late.\n' +
      '>>>>>> Any complaints?\n';
    const converter = new FlowedToHtml();
    converter.outputHtmlFragment = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestTextHeaderAndFooter', () => {
    const expected = '<html><body>On &lt;date&gt;, so-and-so said:<br/><blockquote><p>Thou villainous ill-breeding spongy dizzy-eyed reeky elf-skinned pigeon-egg!</p>\n' +
      '<blockquote><p>Thou artless swag-bellied milk-livered dismal-dreaming idle-headed scut!</p>\n' +
      '<blockquote><p>Thou errant folly-fallen spleeny reeling-ripe unmuzzled ratsbane!</p>\n' +
      '<blockquote><p>Henceforth, the coding style is to be strictly enforced, including the use of only upper case.</p>\n' +
      '<blockquote><p>I&#39;ve noticed a lack of adherence to the coding styles, of late.</p>\n' +
      '<blockquote><p>Any complaints?</p>\n' +
      '</blockquote></blockquote></blockquote></blockquote></blockquote></blockquote>Tha-tha-tha-tha that&#39;s all, folks!<br/></body></html>';
    const text = '> Thou villainous ill-breeding spongy dizzy-eyed \n' +
      '> reeky elf-skinned pigeon-egg!\n' +
      '>> Thou artless swag-bellied milk-livered \n' +
      '>> dismal-dreaming idle-headed scut!\n' +
      '>>> Thou errant folly-fallen spleeny reeling-ripe \n' +
      '>>> unmuzzled ratsbane!\n' +
      '>>>> Henceforth, the coding style is to be strictly \n' +
      '>>>> enforced, including the use of only upper case.\n' +
      ">>>>> I've noticed a lack of adherence to the coding \n" +
      '>>>>> styles, of late.\n' +
      '>>>>>> Any complaints?\n';
    const converter = new FlowedToHtml();
    converter.header = 'On <date>, so-and-so said:\n';
    converter.headerFormat = HeaderFooterFormat.Text;
    converter.footer = "Tha-tha-tha-tha that's all, folks!\n";
    converter.footerFormat = HeaderFooterFormat.Text;
    converter.htmlTagCallback = null;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestSimpleFlowedWithUrlsToHtml', () => {
    const expected = '<p>Check out <a href="http://www.xamarin.com">http://www.xamarin.com</a> - it&#39;s amazing!</p>\n';
    const text = "Check out http://www.xamarin.com - it's amazing!\n";
    const converter = new FlowedToHtml();
    converter.header = null;
    converter.footer = null;
    converter.outputHtmlFragment = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });

  test('TestFlowedTextEndingWithSpace', () => {
    const expected = '<p>We should have access, and apparently did a few months ago, but now there isa &quot;You do not currently have access to this content.&quot; at the bottom of therecord</p>\n' +
      '<br/>\n' +
      '<p>The URL in question URL:</p>\n' +
      '<p><a href="https://example.com/">https://example.com/</a></p>\n';
    const text = 'We should have access, and apparently did a few months ago, but now there is \n' +
      'a "You do not currently have access to this content." at the bottom of the \n' +
      'record\n' +
      '\n' +
      'The URL in question URL:\n' +
      'https://example.com/ ';
    const converter = new FlowedToHtml();
    converter.deleteSpace = true;
    converter.outputHtmlFragment = true;
    const result = converter.convert(text);

    expect(result).toBe(expected);
  });
});
