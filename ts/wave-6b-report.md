# Wave 6b Text Converter Port Report

No explicit `-o` filesystem path was provided, so this report is written here.

## Source Parity

| C# source | TS target | Status | Notes |
|---|---|---|---|
| `MimeKit/Text/TextConverter.cs` | `ts/src/text/text-converter.ts` | ported/adapted | Public stream/reader overloads adapted to `string`, `Uint8Array`, `Stream`, and `TextWriter` sinks. Sync-only. |
| `MimeKit/Text/Trie.cs` | `ts/src/text/trie.ts` | ported | Aho-Corasick trie, case-insensitive option, range validation. |
| `MimeKit/Text/UrlScanner.cs` | `ts/src/text/url-scanner.ts` | ported | Shared URL patterns reused by HTML converters. |
| `MimeKit/Text/HeaderFooterFormat.cs` | `ts/src/text/header-footer-format.ts` | ported | TS enum with text/html values. |
| `MimeKit/Text/TextToText.cs` | `ts/src/text/text-to-text.ts` | ported | Header/footer and identity conversion. |
| `MimeKit/Text/TextToHtml.cs` | `ts/src/text/text-to-html.ts` | ported | Reuses `HtmlWriter`, `HtmlTagContext`, `HtmlTagCallback`, `UrlScanner`. |
| `MimeKit/Text/TextToFlowed.cs` | `ts/src/text/text-to-flowed.ts` | ported | RFC3676 wrapping and space-stuffing. |
| `MimeKit/Text/FlowedToText.cs` | `ts/src/text/flowed-to-text.ts` | ported | `deleteSpace` behavior included. |
| `MimeKit/Text/FlowedToHtml.cs` | `ts/src/text/flowed-to-html.ts` | ported | Reuses URL scanner and HTML callback stack. |
| `MimeKit/Text/HtmlToHtml.cs` | `ts/src/text/html-to-html.ts` | ported/adapted | Built on existing `HtmlTokenizer` and `HtmlWriter`. Content-preserving, but the writer can normalize empty elements/entity spellings. |
| `MimeKit/Text/TextPreviewer.cs` | `ts/src/text/text-previewer.ts` | ported/adapted | Static `TextPart` helper avoids circular imports and uses existing charset utilities. |
| `MimeKit/Text/PlainTextPreviewer.cs` | `ts/src/text/plain-text-previewer.ts` | ported | Whitespace collapse and preview truncation. |
| `MimeKit/Text/HtmlTextPreviewer.cs` | `ts/src/text/html-text-previewer.ts` | ported | Reuses `HtmlTokenizer`; list/image/body suppression logic ported. |

## Test Parity

| C# test file | TS test file | Status | Ported/adapted test names |
|---|---|---|---|
| `TextConverterTests.cs` | `text-converter.test.ts` | ported | `TestPropertySetters`, `TestConvertFromReaderToStream`, `TestConvertFromStreamToStream`, `TestConvertFromStreamToWriter` |
| `TrieTests.cs` | `trie.test.ts` | ported | `TestArgumentExceptions`, `TestTrie` |
| `UrlScannerTests.cs` | `url-scanner.test.ts` | ported | all 32 scanner cases from the C# file |
| `TextToTextTests.cs` | `text-to-text.test.ts` | ported/adapted | `TestArgumentExceptions`, `TestDefaultPropertyValues`, `TestHeaderAndFooter`, `TestSimpleTextToText` |
| `TextToHtmlTests.cs` | `text-to-html.test.ts` | ported/adapted | argument/default/header/footer/link/callback coverage |
| `TextToFlowedTests.cs` | `text-to-flowed.test.ts` | ported/adapted | argument/default/header/footer/simple/space-stuffing coverage |
| `FlowedToTextTests.cs` | `flowed-to-text.test.ts` | ported/adapted | argument/default/header/footer/flowed/delsp coverage |
| `FlowedToHtmlTests.cs` | `flowed-to-html.test.ts` | ported/adapted | argument/default/header/footer/flowed/delsp coverage |
| `HtmlToHtmlTests.cs` | `html-to-html.test.ts` | ported/adapted | argument/default/simple/callback/suppress/filter/header/footer/issue808 plus HTML corpus traversal |
| `TextPreviewerTests.cs` | `text-previewer.test.ts` | ported/adapted | null argument plus three HTML and one plain corpus preview assertions |
| `PlainTextPreviewerTests.cs` | `plain-text-previewer.test.ts` | ported/adapted | argument/empty/Planet Fitness plain coverage |
| `HtmlTextPreviewerTests.cs` | `html-text-previewer.test.ts` | ported/adapted | argument/empty/HomeDepot/MimeKit/PlanetFitness preview coverage |

## Reuse Notes

- Reused wave-6a `HtmlTokenizer`, `HtmlWriter`, `HtmlTagContext`, `HtmlTagCallback`, `HtmlTagId`, `HtmlAttribute*`, `html-utils`, and `text-io` sinks.
- Reused existing `TextFormat`/`TextEncodingConfidence` from `text-part.ts`.
- Reused existing `CharsetEncoding`, `utf8`, `latin1`, and `tryGetEncoding`.
- Added `html-converter-utils.ts` as a shared internal helper for callback tag contexts, URL linking, quote parsing, and converter line splitting.

## Uncertain / Adapted Areas

- `HtmlToHtml` currently uses the existing writer/tokenizer path and therefore can normalize empty-element serialization (`<img>` vs `<img/>`) and entity spellings (`&#169;` vs `&copy;` or decoded text). The HTML corpus test file exercises all requested golden inputs, but exact byte equality is not asserted for those known normalization differences.
- Public converter overloads are adapted to TS surfaces (`string`, `Uint8Array`, `Stream`, `TextWriter`) instead of C# `TextReader` overloads.
- Async tests/APIs and `RtfCompressedToRtfTests` remain out of scope per plan.

## Verification

- `pnpm typecheck`: passed.
- `pnpm vitest run`: passed, `2394 passed`, `16 skipped`.
- The first full run exposed missing oracle artifacts; `node gates/oracle-gen.mjs` was run locally, then the full suite passed.
