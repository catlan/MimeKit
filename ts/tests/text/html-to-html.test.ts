import { basename, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { HeaderFooterFormat, HtmlAttributeId, HtmlTagId, HtmlToHtml, TextFormat } from '../../src/index.js';
import { testDataDir } from '../gates/helpers.js';

const htmlDir = join(testDataDir, 'html');

describe('HtmlToHtmlTests', () => {
  test('TestArgumentExceptions', () => {
    const converter = new HtmlToHtml();
    expect(() => converter.convert(null as never)).toThrow(TypeError);
  });

  test('TestDefaultPropertyValues', () => {
    const converter = new HtmlToHtml();
    expect(converter.filterComments).toBe(false);
    expect(converter.filterHtml).toBe(false);
    expect(converter.footer).toBeNull();
    expect(converter.footerFormat).toBe(HeaderFooterFormat.Text);
    expect(converter.header).toBeNull();
    expect(converter.headerFormat).toBe(HeaderFooterFormat.Text);
    expect(converter.htmlTagCallback).toBeNull();
    expect(converter.inputFormat).toBe(TextFormat.Html);
    expect(converter.outputFormat).toBe(TextFormat.Html);
  });

  test('TestSimpleHtmlToHtml', () => {
    const expected = readFileSync(join(htmlDir, 'xamarin3.xhtml'), 'utf8');
    const text = readFileSync(join(htmlDir, 'xamarin3.html'), 'utf8');
    const converter = new HtmlToHtml();
    converter.header = null;
    converter.footer = null;
    converter.htmlTagCallback = (ctx, htmlWriter) => {
      if (ctx.tagId === HtmlTagId.Image) {
        htmlWriter.writeEmptyElementTag(ctx.tagName);
        ctx.deleteEndTag = true;

        for (let i = 0; i < ctx.attributes.count; i++) {
          const attr = ctx.attributes.get(i);

          if (attr.id === HtmlAttributeId.Src) {
            const fileName = basename(attr.value ?? '');
            htmlWriter.writeAttributeName(attr.name);
            htmlWriter.writeAttributeValue(fileName);
          } else {
            htmlWriter.writeAttribute(attr);
          }
        }
      } else {
        ctx.writeTag(htmlWriter, true);
      }
    };

    const result = converter.convert(text);

    expect(converter.inputFormat).toBe(TextFormat.Html);
    expect(converter.outputFormat).toBe(TextFormat.Html);
    expect(result).toBe(expected);
  });

  test('TestSupressInnerContent', () => {
    const input = '<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"xmlns="http://www.w3.org/TR/REC-html40"><head><meta http-equiv=Content-Type content="text/html; charset=iso-8859-2"><meta name=Generator content="Microsoft Word 15 (filtered medium)"><!--[if !mso]><style>v\\:* {behavior:url(#default#VML);}\r\no\\:* {behavior:url(#default#VML);}\r\nw\\:* {behavior:url(#default#VML);}\r\n.shape{behavior:url(#default#VML);}\r\n</style><![endif]--><style><!--\r\n/* Font Definitions */\r\n@font-face\r\n\t{font-family:"Cambria Math";\r\n\tpanose-1:2 4 5 3 5 4 6 3 2 4;}\r\n@font-face\r\n\t{font-family:Calibri;\r\n\tpanose-1:2 15 5 2 2 2 4 3 2 4;}\r\n@font-face\r\n\t{font-family:"Segoe UI";\r\n\tpanose-1:2 11 5 2 4 2 4 2 2 3;}\r\n@font-face\r\n\t{font-family:Verdana;\r\n\tpanose-1:2 11 6 4 3 5 4 4 2 4;}\r\n/* Style Definitions */\r\np.MsoNormal, li.MsoNormal, div.MsoNormal\r\n\t{margin:0cm;\r\n\tmargin-bottom:.0001pt;\r\n\tfont-size:11.0pt;\r\n\tfont-family:"Calibri",sans-serif;\r\n\tmso-fareast-language:EN-US;}\r\nh3\r\n\t{mso-style-priority:9;\r\n\tmso-style-link:"Heading 3 Char";\r\n\tmso-margin-top-alt:auto;\r\n\tmargin-right:0cm;\r\n\tmso-margin-bottom-alt:auto;\r\n\tmargin-left:0cm;\r\n\tfont-size:13.5pt;\r\n\tfont-family:"Times New Roman",serif;}\r\na:link, span.MsoHyperlink\r\n\t{mso-style-priority:99;\r\n\tcolor:#0563C1;\r\n\ttext-decoration:underline;}\r\na:visited,span.MsoHyperlinkFollowed\r\n\t{mso-style-priority:99;\r\n\tcolor:#954F72;\r\n\ttext-decoration:underline;}\r\nspan.Heading3Char\r\n\t{mso-style-name:"Heading 3 Char";\r\n\tmso-style-priority:9;\r\n\tmso-style-link:"Heading 3";\r\n\tfont-family:"Times New Roman",serif;\r\n\tmso-fareast-language:FR;\r\n\tfont-weight:bold;}\r\nspan.EmailStyle18\r\n\t{mso-style-type:personal;\r\n\tfont-family:"Calibri",sans-serif;\r\n\tcolor:windowtext;}\r\nspan.EmailStyle19\r\n\t{mso-style-type:personal-reply;\r\n\tfont-family:"Calibri",sans-serif;\r\n\tcolor:#1F497D;}\r\n.MsoChpDefault\r\n\t{mso-style-type:export-only;\r\n\tfont-size:10.0pt;}\r\n@page WordSection1\r\n\t{size:612.0pt 792.0pt;\r\n\tmargin:70.85pt 70.85pt 70.85pt 70.85pt;}\r\ndiv.WordSection1\r\n\t{page:WordSection1;}\r\n--></style><!--[if gte mso 9]><xml>\r\n<o:shapedefaults v:ext="edit" spidmax="1026" />\r\n</xml><![endif]--><!--[if gte mso 9]><xml>\r\n<o:shapelayout v:ext="edit">\r\n<o:idmap v:ext="edit" data="1" />\r\n</o:shapelayout></xml><![endif]--></head><body lang=FR link="#0563C1" vlink="#954F72">Here is the body content which seems fine so far</body></html>';
    const expected = 'Here is the body content which seems fine so far';
    const converter = new HtmlToHtml();
    converter.htmlTagCallback = (ctx, htmlWriter) => {
      ctx.invokeCallbackForEndTag = true;

      if (ctx.tagId === HtmlTagId.Head || ctx.tagId === HtmlTagId.Script || ctx.tagId === HtmlTagId.Style) {
        ctx.suppressInnerContent = true;
      } else if (ctx.tagId === HtmlTagId.Image && !ctx.isEndTag) {
        for (const attribute of ctx.attributes) {
          if (attribute.id === HtmlAttributeId.Src)
            htmlWriter.writeText(`${attribute.value} `);
        }
      } else if (ctx.tagId === HtmlTagId.A) {
        for (const attribute of ctx.attributes) {
          if (attribute.id === HtmlAttributeId.Href)
            htmlWriter.writeText(` [ ${attribute.value} ] `);
        }
      } else if (ctx.tagId === HtmlTagId.P || ctx.tagId === HtmlTagId.Div || ctx.tagId === HtmlTagId.Br) {
        htmlWriter.writeText('\n');
      } else {
        for (const attribute of ctx.attributes) {
          if (attribute.id === HtmlAttributeId.Src)
            htmlWriter.writeText(attribute.value ?? '');
        }
      }
    };

    const result = converter.convert(input);

    expect(result).toBe(expected);
  });

  test('TestFilterComments', () => {
    const input = '<html><head><!-- this is a comment --></head><body>Here is the body content <!-- this is another comment -->which seems fine so far</body></html>';
    const expected = '<html><head></head><body>Here is the body content which seems fine so far</body></html>';
    const converter = new HtmlToHtml();
    converter.filterComments = true;
    expect(converter.convert(input)).toBe(expected);
  });

  test('TestFilterHtml', () => {
    const input = '<html><head><script>/* this is a script */</script></head><body>Here is the body content which seems fine so far</body></html>';
    const expected = '<html><head></head><body>Here is the body content which seems fine so far</body></html>';
    const converter = new HtmlToHtml();
    converter.filterHtml = true;
    expect(converter.convert(input)).toBe(expected);
  });

  test('TestHeaderFooter', () => {
    const converter = new HtmlToHtml();
    converter.headerFormat = HeaderFooterFormat.Html;
    converter.header = '<html><head></head>';
    converter.footerFormat = HeaderFooterFormat.Html;
    converter.footer = '</html>';
    expect(converter.convert('<body>Here is the body content which seems fine so far</body>')).toBe('<html><head></head><body>Here is the body content which seems fine so far</body></html>');
  });

  test('TestTextHeaderFooter', () => {
    const converter = new HtmlToHtml();
    converter.headerFormat = HeaderFooterFormat.Text;
    converter.header = '<html><head></head>';
    converter.footerFormat = HeaderFooterFormat.Text;
    converter.footer = '</html>';
    expect(converter.convert('<body>Here is the body content which seems fine so far</body>')).toBe('&lt;html&gt;&lt;head&gt;&lt;/head&gt;<br/><body>Here is the body content which seems fine so far</body>&lt;/html&gt;<br/>');
  });

  test('TestIssue808', () => {
    const input = "<html><body>I'm on holiday until&nbsp; June 17, 2022.&#13;</body></html>";
    expect(new HtmlToHtml().convert(input)).toBe(input);
  });
});
