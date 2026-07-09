/**
 * Public API barrel for mimekit-ts.
 *
 * Re-exports parser, formatter, MIME entity, stream/filter, encoding, text,
 * utility, and TNEF APIs from their implementation modules.
 */
export type { Result, Ok, Err, MimeError } from './result.js';
export { ok, err, mimeError, unwrap } from './result.js';
export type { ContentEncoding } from './content-encoding.js';
export { FormatOptions, type NewLineFormat, type ParameterEncodingMethod } from './format-options.js';
export { ParserOptions, type RfcComplianceMode } from './parser-options.js';
export { utf8, latin1, tryGetEncoding, getMimeCharset, type CharsetEncoding } from './utils/charset-utils.js';
export { DomainList } from './domain-list.js';
export { InternetAddress } from './internet-address.js';
export { MailboxAddress } from './mailbox-address.js';
export { GroupAddress } from './group-address.js';
export { InternetAddressList } from './internet-address-list.js';
export type { MimeEncoder, MimeDecoder } from './encodings/types.js';
export { Stream, MemoryStream, type SeekOrigin } from './io/stream.js';
export { BoundStream } from './io/bound-stream.js';
export { ChainedStream } from './io/chained-stream.js';
export { FilteredStream } from './io/filtered-stream.js';
export { MeasuringStream } from './io/measuring-stream.js';
export { MemoryBlockStream } from './io/memory-block-stream.js';
export type { IMimeFilter, MimeFilterResult } from './io/filters/mime-filter.js';
export { MimeFilterBase } from './io/filters/mime-filter-base.js';
export { PassThroughFilter } from './io/filters/pass-through-filter.js';
export { Dos2UnixFilter } from './io/filters/dos2unix-filter.js';
export { Unix2DosFilter } from './io/filters/unix2dos-filter.js';
export { EncoderFilter } from './io/filters/encoder-filter.js';
export { DecoderFilter } from './io/filters/decoder-filter.js';
export { CharsetFilter } from './io/filters/charset-filter.js';
export { BestEncodingFilter } from './io/filters/best-encoding-filter.js';
export { TrailingWhitespaceFilter } from './io/filters/trailing-whitespace-filter.js';
export { AnonymizeFilter } from './io/filters/anonymize-filter.js';
export { MboxFromFilter } from './io/filters/mbox-from-filter.js';
export { ArmoredFromFilter } from './io/filters/armored-from-filter.js';
export { Base64Encoder } from './encodings/base64-encoder.js';
export { Base64Decoder } from './encodings/base64-decoder.js';
export { QuotedPrintableEncoder } from './encodings/quoted-printable-encoder.js';
export { QuotedPrintableDecoder } from './encodings/quoted-printable-decoder.js';
export { QEncoder } from './encodings/q-encoder.js';
export { UUEncoder } from './encodings/uu-encoder.js';
export { UUDecoder } from './encodings/uu-decoder.js';
export { YEncoder } from './encodings/y-encoder.js';
export { YDecoder } from './encodings/y-decoder.js';
export { HexEncoder } from './encodings/hex-encoder.js';
export { HexDecoder } from './encodings/hex-decoder.js';
export { Parameter } from './parameter.js';
export { ParameterList } from './parameter-list.js';
export { ContentType } from './content-type.js';
export { ContentDisposition } from './content-disposition.js';
export { MimeContent } from './mime-content.js';
export { MimeEntity, type MimeEntityConstructorArgs } from './mime-entity.js';
export { MimePart } from './mime-part.js';
export { TextPart, TextFormat, type TextEncodingConfidence } from './text-part.js';
export { HeaderListCollection } from './header-list-collection.js';
export { MessageDeliveryStatus } from './message-delivery-status.js';
export { MessageDispositionNotification } from './message-disposition-notification.js';
export { MessageFeedbackReport } from './message-feedback-report.js';
export { MessagePart } from './message-part.js';
export { MessagePartial } from './message-partial.js';
export { MimeVisitor } from './mime-visitor.js';
export { Multipart, generateBoundary, setBoundaryGenerator } from './multipart.js';
export { MultipartAlternative } from './multipart-alternative.js';
export { MultipartRelated } from './multipart-related.js';
export { MultipartReport } from './multipart-report.js';
export { TextRfc822Headers } from './text-rfc822-headers.js';
export { MessageIdList } from './message-id-list.js';
export { MessageImportance } from './message-importance.js';
export { MessagePriority } from './message-priority.js';
export { XMessagePriority } from './x-message-priority.js';
export { Version } from './version.js';
export { getMimeType } from './mime-types.js';
export { AttachmentCollection } from './attachment-collection.js';
export { BodyBuilder } from './body-builder.js';
export { MimeMessage, createDateTimeOffset, dateTimeOffsetMinValue } from './mime-message.js';
export { MimeAnonymizer, PreserveHeaderSet } from './mime-anonymizer.js';
export { MimeReader, FormatError, type MimeFormat, type ReaderNewLineFormat } from './mime-reader.js';
export { MimeParser } from './mime-parser.js';
export { MimeIterator } from './mime-iterator.js';
export { Received, ReceivedClause, ReceivedClauseId } from './received.js';
export {
  AuthenticationResults,
  AuthenticationMethodResult,
  AuthenticationMethodProperty,
} from './authentication-results.js';
export { Header } from './header.js';
export { HeaderList, type HeaderListChangedAction, type HeaderListChangedCallback } from './header-list.js';
export { HeaderId, headerIdNameTable, toHeaderId, toHeaderName, type KnownHeaderId } from './header-id.js';
export { PassThroughEncoder } from './encodings/pass-through-encoder.js';
export { PassThroughDecoder } from './encodings/pass-through-decoder.js';
export { parseDate, formatDate, type DateTimeOffset } from './utils/date-utils.js';
export {
  decodePhrase,
  decodePhraseWithCodePage,
  decodeText,
  decodeTextWithCodePage,
  encodeComment,
  encodePhrase,
  encodePhraseAsString,
  encodeText,
  foldUnstructuredHeader,
  asciiString,
  type DecodedHeaderValue,
} from './utils/rfc2047.js';
export type { ParseCursor, ParseError } from './utils/parse-utils.js';
export {
  tryParseVersion,
  tryParse as tryParseContentEncoding,
  unquote,
  quote,
  appendQuoted,
  tryParseMessageId,
  enumerateReferences,
  generateMessageId,
} from './utils/mime-utils.js';
export {
  tryParseInt32,
  skipWhiteSpace,
  skipComment,
  skipCommentsAndWhiteSpace,
  skipQuoted,
  skipAtom,
  skipPhraseAtom,
  skipToken,
  skipWord,
  isSentinel,
  tryParseDomain,
  tryParseMsgId,
  isInternational,
  isIdnEncoded,
} from './utils/parse-utils.js';

// --- Text: HTML infrastructure (wave 6a) ---
export { HtmlEntityDecoder } from './text/html-entity-decoder.js';
export { HtmlTokenKind } from './text/html-token-kind.js';
export { HtmlTokenizerState } from './text/html-tokenizer-state.js';
export { HtmlWriterState } from './text/html-writer-state.js';
export { HtmlNamespace, toNamespaceUrl, toHtmlNamespace } from './text/html-namespace.js';
export {
  HtmlTagId,
  toHtmlTagName,
  toHtmlTagId,
  isHtmlTagId,
  isEmptyElement,
  isFormattingElement,
  htmlTagIdNameTable,
} from './text/html-tag-id.js';
export {
  HtmlAttributeId,
  toAttributeName,
  toHtmlAttributeId,
  isHtmlAttributeId,
  htmlAttributeIdNameTable,
} from './text/html-attribute-id.js';
export { HtmlAttribute } from './text/html-attribute.js';
export { HtmlAttributeCollection } from './text/html-attribute-collection.js';
export {
  HtmlToken,
  HtmlCommentToken,
  HtmlDataToken,
  HtmlCDataToken,
  HtmlScriptDataToken,
  HtmlTagToken,
  HtmlDocTypeToken,
} from './text/html-token.js';
export {
  isValidAttributeName,
  isValidTagName,
  htmlAttributeEncode,
  htmlEncode,
  htmlDecode,
} from './text/html-utils.js';
export { type TextWriter, StringWriter, StreamTextWriter } from './text/text-io.js';
export { HtmlWriter } from './text/html-writer.js';
export { HtmlTokenizer, decodeHtml } from './text/html-tokenizer.js';
export { HtmlTagContext } from './text/html-tag-context.js';
export type { HtmlTagCallback } from './text/html-tag-callback.js';
export { HeaderFooterFormat } from './text/header-footer-format.js';
export { Trie, type TrieSearchResult } from './text/trie.js';
export { UrlScanner, UrlMatch, UrlPattern, UrlPatternType } from './text/url-scanner.js';
export { TextConverter, UrlPatterns } from './text/text-converter.js';
export { TextToText } from './text/text-to-text.js';
export { TextToHtml } from './text/text-to-html.js';
export { TextToFlowed } from './text/text-to-flowed.js';
export { FlowedToText } from './text/flowed-to-text.js';
export { FlowedToHtml } from './text/flowed-to-html.js';
export { HtmlToHtml } from './text/html-to-html.js';
export { TextPreviewer } from './text/text-previewer.js';
export { PlainTextPreviewer } from './text/plain-text-previewer.js';
export { HtmlTextPreviewer } from './text/html-text-previewer.js';
export { RtfCompressedToRtf } from './tnef/rtf-compressed-to-rtf.js';
export { RtfCompressionMode } from './tnef/rtf-compression-mode.js';
export { TnefAttachFlags } from './tnef/tnef-attach-flags.js';
export { TnefAttachMethod } from './tnef/tnef-attach-method.js';
export { TnefAttributeLevel } from './tnef/tnef-attribute-level.js';
export { TnefAttributeTag, TnefAttributeType } from './tnef/tnef-attribute-tag.js';
export { TnefComplianceMode } from './tnef/tnef-compliance-mode.js';
export { TnefComplianceStatus } from './tnef/tnef-compliance-status.js';
export { TnefError } from './tnef/tnef-error.js';
export { TnefNameId } from './tnef/tnef-name-id.js';
export { TnefNameIdKind } from './tnef/tnef-name-id-kind.js';
export { TnefPart } from './tnef/tnef-part.js';
export { TnefPropertyId } from './tnef/tnef-property-id.js';
export { TnefPropertyReader, type TnefValueType } from './tnef/tnef-property-reader.js';
export { TnefPropertyTag } from './tnef/tnef-property-tag.js';
export { TnefPropertyType } from './tnef/tnef-property-type.js';
export { TnefReader } from './tnef/tnef-reader.js';
export { TnefReaderStream } from './tnef/tnef-reader-stream.js';
export type { ITnefPart } from './tnef/itnef-part.js';
