/**
 * Port of MimeKit/ParserOptions.CreateEntity — the entity factory the parser
 * uses to map a parsed Content-Type + header block to a concrete MimeEntity
 * subclass. Kept as a standalone function (rather than a ParserOptions method)
 * to avoid a runtime import cycle through the many entity classes.
 *
 * The custom-MimeType registration table (RegisterMimeType) is still deferred
 * (see parser-options.ts); crypto entity types (application/pkcs7-*, pgp-*,
 * multipart/signed|encrypted) and application/ms-tnef are out of Lite scope /
 * wave-7 and fall through to the built-in dispatch.
 */
import type { ContentEncoding } from './content-encoding.js';
import type { ContentType } from './content-type.js';
import type { Header } from './header.js';
import { HeaderId } from './header-id.js';
import { MessageDeliveryStatus } from './message-delivery-status.js';
import { MessageDispositionNotification } from './message-disposition-notification.js';
import { MessageFeedbackReport } from './message-feedback-report.js';
import { MessagePart } from './message-part.js';
import { MessagePartial } from './message-partial.js';
import { MimeEntity, type MimeEntityConstructorArgs } from './mime-entity.js';
import { MimePart } from './mime-part.js';
import { MultipartAlternative } from './multipart-alternative.js';
import { MultipartRelated } from './multipart-related.js';
import { MultipartReport } from './multipart-report.js';
import { Multipart } from './multipart.js';
import type { ParserOptions } from './parser-options.js';
import { TextPart } from './text-part.js';
import { TextRfc822Headers } from './text-rfc822-headers.js';
import { TnefPart } from './tnef/tnef-part.js';
import { tryParse as tryParseContentEncoding } from './utils/mime-utils.js';

/**
 * Registry of externally-provided entity factories (keyed by lowercased
 * `mediaType/mediaSubtype`). This is the seam that lets the optional S/MIME
 * subsystem teach the crypto-free core parser to produce `MultipartSigned`,
 * `ApplicationPkcs7Mime`, and `ApplicationPkcs7Signature` — without the core
 * statically importing any crypto code. `mimekit-ts/smime`'s entry point calls
 * {@link registerEntityType}; a core-only install never registers anything and
 * these content types fall through to the built-in dispatch.
 */
const entityTypeRegistry = new Map<string, (args: MimeEntityConstructorArgs) => MimeEntity>();

/** Register a factory for a specific media type/subtype (see {@link entityTypeRegistry}). */
export function registerEntityType(
  mediaType: string,
  mediaSubtype: string,
  factory: (args: MimeEntityConstructorArgs) => MimeEntity,
): void {
  entityTypeRegistry.set(`${mediaType.toLowerCase()}/${mediaSubtype.toLowerCase()}`, factory);
}

function lookupEntityType(type: string, subtype: string, args: MimeEntityConstructorArgs): MimeEntity | null {
  const factory = entityTypeRegistry.get(`${type.toLowerCase()}/${subtype.toLowerCase()}`);
  return factory ? factory(args) : null;
}

function isEncodedEncoding(encoding: ContentEncoding): boolean {
  switch (encoding) {
    case '7bit':
    case '8bit':
    case 'binary':
    case 'default':
      return false;
    default:
      return true;
  }
}

/** C#: ParserOptions.IsEncoded(IList<Header>). */
function isEncoded(headers: Iterable<Header>): boolean {
  for (const header of headers) {
    if (header.id !== HeaderId.ContentTransferEncoding) continue;
    const parsed = tryParseContentEncoding(header.value);
    if (!parsed.ok) return false;
    return isEncodedEncoding(parsed.value);
  }
  return false;
}

function eqIgnoreCase(value: string, ...values: string[]): boolean {
  const lower = value.toLowerCase();
  return values.some((v) => lower === v.toLowerCase());
}

/**
 * Creates the concrete MIME entity for a parsed Content-Type and header block.
 *
 * @param options Parser options.
 * @param contentType The parsed Content-Type.
 * @param headers The parsed entity headers.
 * @param hasBodySeparator Whether the parser saw a body separator.
 * @param toplevel Whether the entity is the top-level message body.
 * @param depth The current MIME nesting depth.
 * @returns The concrete MIME entity selected for the content type.
 */
export function createEntity(
  options: ParserOptions,
  contentType: ContentType,
  headers: Header[],
  hasBodySeparator: boolean,
  toplevel: boolean,
  depth: number,
): MimeEntity {
  const args: MimeEntityConstructorArgs = {
    parserOptions: options,
    headers,
    contentType,
    hasBodySeparator,
    isTopLevel: toplevel,
  };
  const type = contentType.mediaType;
  const subtype = contentType.mediaSubtype;
  const maxDepth = options.maxMimeDepth;

  if (eqIgnoreCase(type, 'text')) {
    // text/rfc822-headers
    if (depth < maxDepth && eqIgnoreCase(subtype, 'rfc822-headers') && !isEncoded(headers))
      return new TextRfc822Headers(args);

    return new TextPart(args);
  } else if (eqIgnoreCase(type, 'multipart')) {
    if (depth >= maxDepth) {
      // We don't want to recurse any further, so treat this as a leaf node.
      return new MimePart(args);
    }

    if (eqIgnoreCase(subtype, 'alternative')) return new MultipartAlternative(args);
    if (eqIgnoreCase(subtype, 'related')) return new MultipartRelated(args);
    if (eqIgnoreCase(subtype, 'report')) return new MultipartReport(args);

    // multipart/signed (multipart/encrypted later) are registered by the
    // optional S/MIME / PGP subsystems; otherwise fall through to a plain
    // Multipart.
    const registered = lookupEntityType(type, subtype, args);
    if (registered !== null) return registered;

    return new Multipart(args);
  } else if (eqIgnoreCase(type, 'message')) {
    if (eqIgnoreCase(subtype, 'disposition-notification', 'global-disposition-notification'))
      return new MessageDispositionNotification(args);

    if (eqIgnoreCase(subtype, 'delivery-status', 'global-delivery-status'))
      return new MessageDeliveryStatus(args);

    if (eqIgnoreCase(subtype, 'feedback-report')) return new MessageFeedbackReport(args);

    if (eqIgnoreCase(subtype, 'rfc822', 'global', 'news', 'external-body', 'rfc2822')) {
      if (depth < maxDepth && !isEncoded(headers)) return new MessagePart(args);
    } else if (eqIgnoreCase(subtype, 'partial')) {
      if (!isEncoded(headers)) return new MessagePartial(args);
    } else if (eqIgnoreCase(subtype, 'global-headers')) {
      if (depth < maxDepth && !isEncoded(headers)) return new TextRfc822Headers(args);
    }
  } else if (eqIgnoreCase(type, 'application')) {
    if (eqIgnoreCase(subtype, 'ms-tnef', 'vnd.ms-tnef')) return new TnefPart(args);
    if (eqIgnoreCase(subtype, 'rtf')) return new TextPart(args);

    // application/pkcs7-mime, application/pkcs7-signature (and pgp-*) are
    // registered by the optional S/MIME / PGP subsystems.
    const registered = lookupEntityType(type, subtype, args);
    if (registered !== null) return registered;
  }

  return new MimePart(args);
}
