/**
 * Port of MimeKit/MimeAnonymizer.cs
 *
 * A tool for anonymizing a MimeMessage or MimeEntity: it x's out sensitive
 * header/content bytes while preserving MIME structure. The anonymized output
 * is a byte-parity surface — the C# tests assert exact anonymized strings.
 *
 * The port is branch-for-branch faithful. C#'s `ArgumentNullException` on null
 * arguments becomes a native `TypeError` per the port's error convention
 * (null args are programmer errors, not data errors).
 */
import { FormatOptions } from './format-options.js';
import { FilteredStream } from './io/filtered-stream.js';
import { Stream } from './io/stream.js';
import { AnonymizeFilter } from './io/filters/anonymize-filter.js';
import type { Header } from './header.js';
import { HeaderId } from './header-id.js';
import type { HeaderList } from './header-list.js';
import { MimeEntity } from './mime-entity.js';
import { MimePart } from './mime-part.js';
import { Multipart } from './multipart.js';
import { MessagePart } from './message-part.js';
import { MessageDeliveryStatus } from './message-delivery-status.js';
import { MessageDispositionNotification } from './message-disposition-notification.js';
import { MimeMessage } from './mime-message.js';
import { Version } from './version.js';
import type { HeaderListCollection } from './header-list-collection.js';
import { ByteArrayBuilder } from './utils/byte-array-builder.js';
import { isWhitespace } from './utils/byte-extensions.js';
import { parseDate } from './utils/date-utils.js';

const enc = new TextEncoder();

const AddressSpecials = enc.encode(' \t\r\n()<>[]:;@,.');
const ReceivedSpecials = enc.encode('<>[]:@,.');
const ReceivedFrom = enc.encode('from');
const ReceivedBy = enc.encode('by');
const ReceivedVia = enc.encode('via');
const ReceivedWith = enc.encode('with');
const ReceivedId = enc.encode('id');
const ReceivedFor = enc.encode('for');
const BoundaryParameter = enc.encode('boundary');
const CharsetParameter = enc.encode('charset');
const DelspParameter = enc.encode('delsp');
const FormatParameter = enc.encode('format');
const Whitespace = enc.encode(' \t\r\n');

/** C#: Header.Colon = { (byte) ':' }. */
const Colon = new Uint8Array([0x3a]);

const X = 0x78; // 'x'

function spanEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

enum Rfc2047EncodedWordState {
  None,
  Equals,
  EqualsQuestion,
  Charset,
  CharsetQuestion,
  Encoding,
  EncodingQuestion,
  Payload,
  PayloadQuestion,
}

function pushPotentialRfc2047EncodedWordByte(
  state: { rfc2047: Rfc2047EncodedWordState },
  c: number,
  pos: { index: number },
  anonymized: Uint8Array,
  specials: Uint8Array
): void {
  if (c === 0x3d /* = */) {
    switch (state.rfc2047) {
      case Rfc2047EncodedWordState.None:
        state.rfc2047 = Rfc2047EncodedWordState.Equals;
        anonymized[pos.index] = c;
        break;
      case Rfc2047EncodedWordState.PayloadQuestion:
        state.rfc2047 = Rfc2047EncodedWordState.None;
        anonymized[pos.index] = c;
        break;
      case Rfc2047EncodedWordState.Payload:
        // anonymize '=' in the payload
        anonymized[pos.index] = X;
        break;
      default:
        // break out of rfc2047 encoded-word mode
        state.rfc2047 = Rfc2047EncodedWordState.None;
        anonymized[pos.index] = c;
        break;
    }
  } else if (c === 0x3f /* ? */) {
    anonymized[pos.index] = c;

    switch (state.rfc2047) {
      case Rfc2047EncodedWordState.Equals:
        state.rfc2047 = Rfc2047EncodedWordState.EqualsQuestion;
        break;
      case Rfc2047EncodedWordState.Charset:
        state.rfc2047 = Rfc2047EncodedWordState.CharsetQuestion;
        break;
      case Rfc2047EncodedWordState.Encoding:
        state.rfc2047 = Rfc2047EncodedWordState.EncodingQuestion;
        break;
      case Rfc2047EncodedWordState.Payload:
        state.rfc2047 = Rfc2047EncodedWordState.PayloadQuestion;
        break;
      case Rfc2047EncodedWordState.None:
        // just a normal question mark
        break;
      default:
        // break out of rfc2047 encoded-word mode
        state.rfc2047 = Rfc2047EncodedWordState.None;
        break;
    }
  } else {
    switch (state.rfc2047) {
      case Rfc2047EncodedWordState.EqualsQuestion:
        state.rfc2047 = Rfc2047EncodedWordState.Charset;
        // goto case Charset
        anonymized[pos.index] = c;
        break;
      case Rfc2047EncodedWordState.Charset:
        // allow charset name to pass through...
        anonymized[pos.index] = c;
        break;
      case Rfc2047EncodedWordState.CharsetQuestion:
        state.rfc2047 = Rfc2047EncodedWordState.Encoding;
        // goto case Encoding
        anonymized[pos.index] = c;
        break;
      case Rfc2047EncodedWordState.Encoding:
        // allow encoding name to pass through...
        anonymized[pos.index] = c;
        break;
      case Rfc2047EncodedWordState.EncodingQuestion:
        state.rfc2047 = Rfc2047EncodedWordState.Payload;
        // goto case Payload
        anonymized[pos.index] = isWhitespace(c) ? c : X;
        break;
      case Rfc2047EncodedWordState.Payload:
        // anonymize everything but whitespace in the rfc2047 encoded-word payload
        // mostly in case of folding whitespace but also because it can screw up
        // tokenization in MIME parsers and we want to be able to see that.
        anonymized[pos.index] = isWhitespace(c) ? c : X;
        break;
      case Rfc2047EncodedWordState.None:
        anonymized[pos.index] = specials.indexOf(c) !== -1 ? c : X;
        break;
      default:
        // break out of rfc2047 encoded-word mode
        state.rfc2047 = Rfc2047EncodedWordState.None;
        // rewind 1 character
        pos.index--;
        break;
    }
  }
}

enum ParameterState {
  Semicolon,
  Name,
  NameStar,
  Value,
}

function isReceivedKeyword(rawValue: Uint8Array, indexStart: number): { keyword: boolean; length: number } {
  // look for: from, by, via, with, id, for
  const buffer = new Uint8Array(4);
  let length = 0;
  let index = indexStart;

  while (index < rawValue.length && length < 4 && !isWhitespace(rawValue[index]!)) {
    const c = rawValue[index]!;
    if (c >= 0x41 /* A */ && c <= 0x5a /* Z */) {
      buffer[length++] = c + 0x20;
    } else if (c >= 0x61 /* a */ && c <= 0x7a /* z */) {
      buffer[length++] = c;
    } else {
      return { keyword: false, length: 0 };
    }

    index++;
  }

  if (index >= rawValue.length || !isWhitespace(rawValue[index]!)) {
    return { keyword: false, length: 0 };
  }

  const word = buffer.subarray(0, length);
  const keyword =
    spanEquals(word, ReceivedFrom) ||
    spanEquals(word, ReceivedBy) ||
    spanEquals(word, ReceivedVia) ||
    spanEquals(word, ReceivedWith) ||
    spanEquals(word, ReceivedId) ||
    spanEquals(word, ReceivedFor);

  return { keyword, length };
}

function isSafeParameterName(name: ByteArrayBuilder): boolean {
  return (
    name.equals(BoundaryParameter, 'ordinal-ignore-case') ||
    name.equals(CharsetParameter, 'ordinal-ignore-case') ||
    name.equals(DelspParameter, 'ordinal-ignore-case') ||
    name.equals(FormatParameter, 'ordinal-ignore-case')
  );
}

function anonymizeParameterList(rawValue: Uint8Array, anonymized: Uint8Array, startIndex: number): void {
  const name = new ByteArrayBuilder(16);
  let state = ParameterState.Semicolon;
  let index = startIndex;
  let escaped = false;
  let quoted = false;
  let safe = false;

  try {
    if (index < rawValue.length) {
      anonymized[index] = rawValue[index]!;
      index++;
    }

    while (index < rawValue.length) {
      const c = rawValue[index]!;

      switch (state) {
        case ParameterState.Semicolon:
          if (c === 0x3b /* ; */) {
            // multiple semicolons in a row
            anonymized[index] = c;
          } else if (isWhitespace(c)) {
            // whitespace character
            anonymized[index] = c;
          } else {
            state = ParameterState.Name;
            // goto case Name
            if (c === 0x3d /* = */) {
              anonymized[index] = c;
              safe = isSafeParameterName(name);
              state = ParameterState.Value;
            } else if (c === 0x3b /* ; */) {
              anonymized[index] = c;
              state = ParameterState.Semicolon;
              name.clear();
            } else if (c === 0x2a /* * */) {
              state = ParameterState.NameStar;
              anonymized[index] = c;
            } else {
              name.append(c);
              anonymized[index] = c;
            }
          }
          break;
        case ParameterState.Name:
          if (c === 0x3d /* = */) {
            anonymized[index] = c;
            safe = isSafeParameterName(name);
            state = ParameterState.Value;
          } else if (c === 0x3b /* ; */) {
            // shouldn't happen...
            anonymized[index] = c;
            state = ParameterState.Semicolon;
            name.clear();
          } else if (c === 0x2a /* * */) {
            state = ParameterState.NameStar;
            anonymized[index] = c;
          } else {
            name.append(c);
            anonymized[index] = c;
          }
          break;
        case ParameterState.NameStar:
          if (c === 0x3d /* = */) {
            anonymized[index] = c;
            safe = isSafeParameterName(name);
            state = ParameterState.Value;
          } else if (c === 0x3b /* ; */) {
            // parameter seems to be incomplete?
            state = ParameterState.Semicolon;
            anonymized[index] = c;
          } else {
            anonymized[index] = c;
          }
          break;
        case ParameterState.Value:
          if (c === 0x22 /* " */) {
            anonymized[index] = c;
            if (escaped) escaped = false;
            else quoted = !quoted;
          } else if (quoted) {
            if (c === 0x5c /* \\ */) {
              anonymized[index] = c;
              escaped = !escaped;
            } else if (c === 0x0d /* \r */ || c === 0x0a /* \n */) {
              // don't anonymize folding whitespace within a quoted value
              anonymized[index] = c;
              escaped = false;
            } else {
              anonymized[index] = safe ? c : X;
              escaped = false;
            }
          } else if (c === 0x3b /* ; */) {
            anonymized[index] = c;
            state = ParameterState.Semicolon;
            name.clear();
          } else if (isWhitespace(c)) {
            anonymized[index] = c;
          } else if (safe) {
            anonymized[index] = c;
          } else {
            anonymized[index] = X;
          }
          break;
      }

      index++;
    }
  } finally {
    name.dispose();
  }
}

/**
 * Anonymizes identifying data in MIME messages and entities.
 */
export class MimeAnonymizer {
  private readonly preserve = new PreserveHeaderSet();

  /**
   * C#: MimeAnonymizer.PreserveHeaders — a HashSet<string>(OrdinalIgnoreCase).
   * Headers whose field name is in this set are emitted verbatim (not
   * anonymized). Also applies to status headers in message/delivery-status parts.
   */
  get preserveHeaders(): PreserveHeaderSet {
    return this.preserve;
  }

  /**
   * Anonymizes a MIME message and writes it to a stream.
   *
   * @param message The message to anonymize.
   * @param stream The stream to write the anonymized message to.
   */
  anonymize(message: MimeMessage, stream: Stream): void;
  /**
   * Anonymizes a MIME message using formatting options and writes it to a stream.
   *
   * @param options The formatting options.
   * @param message The message to anonymize.
   * @param stream The stream to write the anonymized message to.
   */
  anonymize(options: FormatOptions, message: MimeMessage, stream: Stream): void;
  /**
   * Anonymizes a MIME entity and writes it to a stream.
   *
   * @param entity The MIME entity to anonymize.
   * @param stream The stream to write the anonymized entity to.
   */
  anonymize(entity: MimeEntity, stream: Stream): void;
  /**
   * Anonymizes a MIME entity using formatting options and writes it to a stream.
   *
   * @param options The formatting options.
   * @param entity The MIME entity to anonymize.
   * @param stream The stream to write the anonymized entity to.
   */
  anonymize(options: FormatOptions, entity: MimeEntity, stream: Stream): void;
  anonymize(
    a: FormatOptions | MimeMessage | MimeEntity,
    b: MimeMessage | MimeEntity | Stream,
    c?: Stream
  ): void {
    const threeArg = a instanceof FormatOptions || c !== undefined;

    const options = (threeArg ? a : FormatOptions.default) as FormatOptions | null | undefined;
    const target = (threeArg ? b : a) as MimeMessage | MimeEntity | null | undefined;
    const stream = (threeArg ? c : b) as Stream | null | undefined;

    if (options == null) throw new TypeError('options cannot be null or undefined');
    if (target == null) throw new TypeError('message/entity cannot be null or undefined');
    if (stream == null) throw new TypeError('stream cannot be null or undefined');

    if (target instanceof MimeMessage) {
      this.anonymizeMessage(options, target, stream);
    } else {
      this.anonymizeEntity(options, target, stream, false);
    }
  }

  /**
   * Anonymizes a raw `Received` header value.
   *
   * @param rawValue The raw header value.
   * @returns The anonymized header value.
   */
  static anonymizeReceivedHeaderValue(rawValue: Uint8Array): Uint8Array {
    const anonymized = new Uint8Array(rawValue.length);
    let index = 0;

    while (index < rawValue.length) {
      while (index < rawValue.length && isWhitespace(rawValue[index]!)) {
        anonymized[index] = rawValue[index]!;
        index++;
      }

      if (index >= rawValue.length) break;

      if (rawValue[index] === 0x28 /* ( */) {
        // comment
        let commentDepth = 1;
        let escaped = false;

        // consume the '('
        anonymized[index] = rawValue[index]!;
        index++;

        while (index < rawValue.length && commentDepth > 0) {
          const c = rawValue[index]!;
          if (c === 0x5c /* \\ */) {
            anonymized[index] = c;
            escaped = !escaped;
          } else if (!escaped) {
            if (c === 0x28 /* ( */) {
              anonymized[index] = c;
              commentDepth++;
            } else if (c === 0x29 /* ) */) {
              anonymized[index] = c;
              commentDepth--;
            } else if (isWhitespace(c)) {
              anonymized[index] = c;
            } else if (ReceivedSpecials.indexOf(c) !== -1) {
              anonymized[index] = c;
            } else {
              // anonymize everything else in the comment
              anonymized[index] = X;
            }
          } else {
            // escaped
            anonymized[index] = X;
            escaped = false;
          }

          index++;
        }
      } else if (rawValue[index] === 0x3b /* ; */) {
        anonymized[index] = rawValue[index]!;
        index++;

        while (index < rawValue.length && isWhitespace(rawValue[index]!)) {
          anonymized[index] = rawValue[index]!;
          index++;
        }

        // This might be a date...
        if (parseDate(rawValue.subarray(index)).ok) {
          // don't anonymize the date
          anonymized.set(rawValue.subarray(index), index);
          break;
        }
      } else {
        const kw = isReceivedKeyword(rawValue, index);
        if (kw.keyword) {
          anonymized.set(rawValue.subarray(index, index + kw.length), index);
          index += kw.length;
        } else {
          while (index < rawValue.length) {
            const c = rawValue[index]!;
            if (isWhitespace(c) || c === 0x3b /* ; */ || c === 0x28 /* ( */) break;

            if (ReceivedSpecials.indexOf(c) !== -1) {
              anonymized[index] = c;
            } else {
              anonymized[index] = X;
            }

            index++;
          }
        }
      }
    }

    return anonymized;
  }

  /**
   * Anonymizes a raw address header value.
   *
   * @param rawValue The raw header value.
   * @returns The anonymized header value.
   */
  static anonymizeAddressHeaderValue(rawValue: Uint8Array): Uint8Array {
    const anonymized = new Uint8Array(rawValue.length);
    const state = { rfc2047: Rfc2047EncodedWordState.None };
    let escaped = false;
    let quoted = false;

    for (let i = 0; i < rawValue.length; i++) {
      const c = rawValue[i]!;

      if (c === 0x5c /* \\ */) {
        anonymized[i] = c;
        escaped = !escaped;
      } else if (c === 0x22 /* " */) {
        anonymized[i] = c;
        if (escaped) escaped = false;
        else quoted = !quoted;
      } else if (escaped) {
        anonymized[i] = c;
        escaped = false;
      } else if (quoted) {
        // anonymize everything but folding whitespace within a quoted string
        if (c === 0x0d /* \r */ || c === 0x0a /* \n */) anonymized[i] = c;
        else anonymized[i] = X;
      } else {
        const pos = { index: i };
        pushPotentialRfc2047EncodedWordByte(state, c, pos, anonymized, AddressSpecials);
        i = pos.index;
      }
    }

    return anonymized;
  }

  /**
   * Anonymizes a raw unstructured header value.
   *
   * @param rawValue The raw header value.
   * @returns The anonymized header value.
   */
  static anonymizeUnstructuredHeaderValue(rawValue: Uint8Array): Uint8Array {
    const anonymized = new Uint8Array(rawValue.length);
    const state = { rfc2047: Rfc2047EncodedWordState.None };

    for (let i = 0; i < rawValue.length; i++) {
      const pos = { index: i };
      pushPotentialRfc2047EncodedWordByte(state, rawValue[i]!, pos, anonymized, Whitespace);
      i = pos.index;
    }

    return anonymized;
  }

  /**
   * Anonymizes a raw `Content-Disposition` header value.
   *
   * @param rawValue The raw header value.
   * @returns The anonymized header value.
   */
  static anonymizeContentDispositionValue(rawValue: Uint8Array): Uint8Array {
    const anonymized = new Uint8Array(rawValue.length);
    let index = 0;

    // don't anonymize the "attachment" or "inline" part
    while (index < rawValue.length && rawValue[index] !== 0x3b /* ; */) {
      anonymized[index] = rawValue[index]!;
      index++;
    }

    anonymizeParameterList(rawValue, anonymized, index);

    return anonymized;
  }

  /**
   * Anonymizes a raw `Content-Type` header value.
   *
   * @param rawValue The raw header value.
   * @returns The anonymized header value.
   */
  static anonymizeContentTypeValue(rawValue: Uint8Array): Uint8Array {
    const anonymized = new Uint8Array(rawValue.length);
    let index = 0;

    // don't anonymize the mime-type
    while (index < rawValue.length && rawValue[index] !== 0x3b /* ; */) {
      anonymized[index] = rawValue[index]!;
      index++;
    }

    anonymizeParameterList(rawValue, anonymized, index);

    return anonymized;
  }

  private anonymizeHeader(options: FormatOptions, header: Header): Uint8Array {
    const rawValue = header.getRawValue(options);

    if (this.preserve.has(header.field)) {
      // don't anonymize this header
      return rawValue;
    }

    switch (header.id) {
      case HeaderId.DispositionNotificationTo:
      case HeaderId.ResentReplyTo:
      case HeaderId.ResentSender:
      case HeaderId.ResentFrom:
      case HeaderId.ResentBcc:
      case HeaderId.ResentCc:
      case HeaderId.ResentTo:
      case HeaderId.ReplyTo:
      case HeaderId.Sender:
      case HeaderId.From:
      case HeaderId.Bcc:
      case HeaderId.Cc:
      case HeaderId.To:
        return MimeAnonymizer.anonymizeAddressHeaderValue(rawValue);
      case HeaderId.Received:
        return MimeAnonymizer.anonymizeReceivedHeaderValue(rawValue);
      case HeaderId.OriginalMessageId:
      case HeaderId.ResentMessageId:
      case HeaderId.References:
      case HeaderId.InReplyTo:
      case HeaderId.MessageId:
      case HeaderId.ContentId:
        // We'll treat these like address headers (for now)...
        return MimeAnonymizer.anonymizeAddressHeaderValue(rawValue);
      case HeaderId.ContentDisposition:
        return MimeAnonymizer.anonymizeContentDispositionValue(rawValue);
      case HeaderId.ContentType:
        return MimeAnonymizer.anonymizeContentTypeValue(rawValue);
      case HeaderId.ArcAuthenticationResults:
      case HeaderId.AuthenticationResults:
      case HeaderId.ArcMessageSignature:
      case HeaderId.ArcSeal:
      case HeaderId.DkimSignature:
        // TODO: should we have custom logic for anonymizing these?
        return MimeAnonymizer.anonymizeUnstructuredHeaderValue(rawValue);
      case HeaderId.ContentTransferEncoding:
      case HeaderId.MimeVersion:
      case HeaderId.Date:
        // don't anonymize these
        return rawValue;
      default:
        return MimeAnonymizer.anonymizeUnstructuredHeaderValue(rawValue);
    }
  }

  private anonymizeHeaders(options: FormatOptions, headers: Iterable<Header>, stream: Stream): void {
    const filtered = new FilteredStream(stream);
    try {
      filtered.add(options.createNewLineFilter(false));

      for (const header of headers) {
        if (header.isInvalid) {
          MimeAnonymizer.anonymizeBytes(options, stream, header.rawField, false);
        } else {
          const rawValue = this.anonymizeHeader(options, header);

          filtered.write(header.rawField, 0, header.rawField.length);
          filtered.write(Colon, 0, Colon.length);
          filtered.write(rawValue, 0, rawValue.length);
        }
      }

      filtered.flush();
    } finally {
      filtered.dispose();
    }
  }

  private anonymizeMessage(options: FormatOptions, message: MimeMessage, stream: Stream): void {
    if (
      message.compliance === 'strict' &&
      message.body != null &&
      message.body.headers.count > 0 &&
      !message.headers.contains(HeaderId.MimeVersion)
    )
      message.mimeVersion = new Version(1, 0);

    if (message.body != null) {
      this.anonymizeHeaders(options, MimeMessage.mergeHeaders(message.headers, message.body), stream);

      if (message.compliance === 'strict' || message.body.headers.hasBodySeparator) {
        const nl = options.newLineBytes;
        stream.write(nl, 0, nl.length);
      }

      try {
        message.body.ensureNewLine = message.compliance === 'strict' || options.ensureNewLine;

        this.anonymizeEntity(options, message.body, stream, true);
      } finally {
        message.body.ensureNewLine = false;
      }
    } else {
      this.anonymizeHeaders(options, message.headers, stream);
      const nl = options.newLineBytes;
      stream.write(nl, 0, nl.length);
    }
  }

  private static generateBoundaryMarker(boundary: string, newLine: Uint8Array): Uint8Array {
    const marker = new Uint8Array(2 + boundary.length + newLine.length);
    let index = 0;

    marker[index++] = 0x2d; // '-'
    marker[index++] = 0x2d; // '-'

    for (let i = 0; i < boundary.length; i++) marker[index++] = boundary.charCodeAt(i) & 0xff;

    for (let i = 0; i < newLine.length; i++) marker[index++] = newLine[i]!;

    return marker;
  }

  private static generateEndBoundaryMarker(boundary: string, newLine: Uint8Array): Uint8Array {
    const marker = new Uint8Array(4 + boundary.length + newLine.length);
    let index = 0;

    marker[index++] = 0x2d; // '-'
    marker[index++] = 0x2d; // '-'

    for (let i = 0; i < boundary.length; i++) marker[index++] = boundary.charCodeAt(i) & 0xff;

    marker[index++] = 0x2d; // '-'
    marker[index++] = 0x2d; // '-'

    for (let i = 0; i < newLine.length; i++) marker[index++] = newLine[i]!;

    return marker;
  }

  private static anonymizeBytes(
    options: FormatOptions,
    stream: Stream,
    rawValue: Uint8Array | null,
    ensureNewLine: boolean
  ): void {
    if (rawValue == null || rawValue.length === 0) return;

    const filtered = new FilteredStream(stream);
    try {
      filtered.add(new AnonymizeFilter());
      filtered.add(options.createNewLineFilter(ensureNewLine));

      filtered.write(rawValue, 0, rawValue.length);
      filtered.flush();
    } finally {
      filtered.dispose();
    }
  }

  private static tryGetStatusGroups(mds: MessageDeliveryStatus): HeaderListCollection | null {
    try {
      return mds.statusGroups;
    } catch {
      return null;
    }
  }

  private static tryGetNotificationFields(mdn: MessageDispositionNotification): HeaderList | null {
    try {
      return mdn.fields;
    } catch {
      return null;
    }
  }

  private anonymizeEntity(options: FormatOptions, entity: MimeEntity, stream: Stream, contentOnly: boolean): void {
    if (!contentOnly) {
      this.anonymizeHeaders(options, entity.headers, stream);

      if (entity.headers.hasBodySeparator) {
        const nl = options.newLineBytes;
        stream.write(nl, 0, nl.length);
      }
    }

    if (entity instanceof MessagePart) {
      if (entity.message != null) this.anonymizeMessage(options, entity.message, stream);
    } else if (entity instanceof Multipart) {
      const multipart = entity;
      const defaultBoundary = MimeAnonymizer.generateBoundaryMarker(multipart.boundary ?? '', options.newLineBytes);

      MimeAnonymizer.anonymizeBytes(
        options,
        stream,
        multipart.rawPreamble,
        multipart.count > 0 || multipart.ensureNewLine
      );

      for (let i = 0; i < multipart.count; i++) {
        const boundary = multipart.rawBoundaries?.[i] ?? defaultBoundary;
        const child = multipart.at(i);
        const rfc822 = child instanceof MessagePart ? child : null;
        let multi: Multipart | null = child instanceof Multipart ? child : null;
        let part: MimePart | null = child instanceof MimePart ? child : null;

        stream.write(boundary, 0, boundary.length);
        this.anonymizeEntity(options, child, stream, false);

        if (rfc822 != null && rfc822.message != null && rfc822.message.body != null) {
          multi = rfc822.message.body instanceof Multipart ? rfc822.message.body : null;
          part = rfc822.message.body instanceof MimePart ? rfc822.message.body : null;
        }

        if (
          (part != null && part.content == null) ||
          (rfc822 != null && (rfc822.message == null || rfc822.message.body == null)) ||
          (multi != null && !multi.writeEndBoundary)
        )
          continue;

        const nl = options.newLineBytes;
        stream.write(nl, 0, nl.length);
      }

      if (multipart.rawEndBoundary != null) {
        if (multipart.rawEndBoundary.length === 0) return;

        stream.write(multipart.rawEndBoundary, 0, multipart.rawEndBoundary.length);
      } else {
        const boundary = MimeAnonymizer.generateEndBoundaryMarker(
          multipart.boundary ?? '',
          multipart.rawEpilogue == null ? options.newLineBytes : new Uint8Array(0)
        );

        stream.write(boundary, 0, boundary.length);
      }

      MimeAnonymizer.anonymizeBytes(options, stream, multipart.rawEpilogue, multipart.ensureNewLine);
    } else if (entity instanceof MessageDeliveryStatus) {
      const statusGroups = MimeAnonymizer.tryGetStatusGroups(entity);
      if (statusGroups != null) {
        for (let i = 0; i < statusGroups.count; i++) {
          const statusGroup = statusGroups.at(i);

          this.anonymizeHeaders(options, statusGroup, stream);

          if (i + 1 < statusGroups.count) {
            const nl = options.newLineBytes;
            stream.write(nl, 0, nl.length);
          }
        }
        return;
      }
      this.anonymizeContent(options, entity, stream);
    } else if (entity instanceof MessageDispositionNotification) {
      const fields = MimeAnonymizer.tryGetNotificationFields(entity);
      if (fields != null) {
        this.anonymizeHeaders(options, fields, stream);
        return;
      }
      this.anonymizeContent(options, entity, stream);
    } else {
      this.anonymizeContent(options, entity, stream);
    }
  }

  private anonymizeContent(options: FormatOptions, entity: MimeEntity, stream: Stream): void {
    const filtered = new FilteredStream(stream);
    try {
      filtered.add(new AnonymizeFilter());

      entity.writeTo(options, filtered, true);
    } finally {
      filtered.dispose();
    }
  }
}

/**
 * Case-insensitive (ordinal-ignore-case) string set, mirroring C#'s
 * HashSet<string>(StringComparer.OrdinalIgnoreCase) exposed by PreserveHeaders.
 */
/**
 * Case-insensitive set of header names to preserve during anonymization.
 */
export class PreserveHeaderSet {
  private readonly map = new Map<string, string>();

  /** The number of preserved header names. */
  get size(): number {
    return this.map.size;
  }

  /** Adds a header name to the set. */
  add(value: string): this {
    this.map.set(value.toLowerCase(), value);
    return this;
  }

  /** Removes a header name from the set. */
  delete(value: string): boolean {
    return this.map.delete(value.toLowerCase());
  }

  /** Determines whether a header name is in the set. */
  has(value: string): boolean {
    return this.map.has(value.toLowerCase());
  }

  /** Removes all header names from the set. */
  clear(): void {
    this.map.clear();
  }

  [Symbol.iterator](): Iterator<string> {
    return this.map.values();
  }
}
