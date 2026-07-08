// Port of MimeKit/MimeMessage.cs.
//
// Scope notes (wave-3):
//  * Sync-only: the C# *Async WriteTo/Load pairs are not ported (plan Q4).
//  * Load/LoadAsync + the MimeParser-backed constructors are deferred to
//    wave-4; the static load() throws so callers (e.g. AttachmentCollection's
//    message/rfc822 path) fail loudly until the parser lands.
//  * Sign/Encrypt/SignAndEncrypt + HashBody (S/MIME, PGP, DKIM) are out of
//    scope (crypto excluded from the port) and omitted.
//  * CreateFromMailMessage / System.Net.Mail interop is omitted (no SNM).
//  * MboxMarker is retained (internal, needed for message/rfc822 reserialization).
import { FilteredStream } from './io/filtered-stream.js';
import { MemoryStream, Stream } from './io/stream.js';
import type { EncodingConstraint } from './io/filters/best-encoding-filter.js';
import { FormatOptions, MAXIMUM_LINE_LENGTH, MINIMUM_LINE_LENGTH } from './format-options.js';
import { Header } from './header.js';
import { HeaderId, toHeaderName } from './header-id.js';
import { HeaderList, type HeaderListChangedAction } from './header-list.js';
import {
  AddressParserFlags,
  InternetAddress,
  tryParseAddressListInternal,
} from './internet-address.js';
import { InternetAddressList } from './internet-address-list.js';
import { MailboxAddress } from './mailbox-address.js';
import { MessageIdList } from './message-id-list.js';
import { MessageImportance, isMessageImportance } from './message-importance.js';
import { MessagePriority } from './message-priority.js';
import { XMessagePriority, isXMessagePriority, rawXPriorityValues, xPriorityByLevel } from './x-message-priority.js';
import { MimeEntity } from './mime-entity.js';
import type { MimeVisitor } from './mime-visitor.js';
import { newMimeParser } from './parser-hook.js';
import { type Result } from './result.js';
import { Multipart } from './multipart.js';
import { MultipartAlternative } from './multipart-alternative.js';
import { ParserOptions, type RfcComplianceMode } from './parser-options.js';
import { TextPart, type TextFormat } from './text-part.js';
import { latin1, utf8 } from './utils/charset-utils.js';
import { formatDate, parseDate, type DateTimeOffset } from './utils/date-utils.js';
import {
  enumerateReferences,
  generateMessageId,
  tryParseMessageId,
  tryParseVersion,
} from './utils/mime-utils.js';
import { skipWhiteSpace, tryParseInt32, tryParseMsgId } from './utils/parse-utils.js';
import { Version } from './version.js';

const encoder = new TextEncoder();
const COLON = encoder.encode(':');

// C#: DateTimeOffset.MinValue (0001-01-01T00:00:00 +00:00).
const minDate = new Date(0);
minDate.setUTCFullYear(1, 0, 1);
minDate.setUTCHours(0, 0, 0, 0);
export const dateTimeOffsetMinValue: DateTimeOffset = { epochMillis: minDate.getTime(), offsetMinutes: 0 };

/** Construct a DateTimeOffset from calendar components (month is 1-based). */
export function createDateTimeOffset(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  offsetMinutes: number,
): DateTimeOffset {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  return { epochMillis: d.getTime() - offsetMinutes * 60_000, offsetMinutes };
}

function nowDateTimeOffset(): DateTimeOffset {
  const now = new Date();
  return { epochMillis: now.getTime(), offsetMinutes: -now.getTimezoneOffset() };
}

function dtoEquals(a: DateTimeOffset, b: DateTimeOffset): boolean {
  return a.epochMillis === b.epochMillis && a.offsetMinutes === b.offsetMinutes;
}

type LazyField =
  | 'resentSender' | 'resentFrom' | 'resentReplyTo' | 'resentTo' | 'resentCc' | 'resentBcc'
  | 'resentDate' | 'resentMessageId' | 'sender' | 'from' | 'replyTo' | 'to' | 'cc' | 'bcc'
  | 'date' | 'messageId' | 'inReplyTo' | 'references' | 'mimeVersion'
  | 'importance' | 'priority' | 'xPriority';

const STANDARD_ADDRESS_HEADERS: readonly HeaderId[] = [
  HeaderId.ResentFrom, HeaderId.ResentReplyTo, HeaderId.ResentTo, HeaderId.ResentCc, HeaderId.ResentBcc,
  HeaderId.From, HeaderId.ReplyTo, HeaderId.To, HeaderId.Cc, HeaderId.Bcc,
];

const ADDRESS_LAZY_FIELD: Partial<Record<HeaderId, LazyField>> = {
  [HeaderId.From]: 'from',
  [HeaderId.ReplyTo]: 'replyTo',
  [HeaderId.To]: 'to',
  [HeaderId.Cc]: 'cc',
  [HeaderId.Bcc]: 'bcc',
  [HeaderId.ResentFrom]: 'resentFrom',
  [HeaderId.ResentReplyTo]: 'resentReplyTo',
  [HeaderId.ResentTo]: 'resentTo',
  [HeaderId.ResentCc]: 'resentCc',
  [HeaderId.ResentBcc]: 'resentBcc',
};

export class MimeMessage {
  readonly headers: HeaderList;
  /** C#: internal RfcComplianceMode compliance. */
  readonly compliance: RfcComplianceMode;
  /** C#: internal byte[] MboxMarker. */
  mboxMarker: Uint8Array | null = null;
  body: MimeEntity | null = null;

  private readonly addresses = new Map<HeaderId, InternetAddressList>();
  private readonly addressListCallbacks = new Map<HeaderId, () => void>();
  private readonly referenceList = new MessageIdList();
  private readonly lazyLoaded = new Set<LazyField>();
  private readonly headersChangedCb: (header: Header | null, action: HeaderListChangedAction) => void;
  private readonly referencesChangedCb: () => void;

  private importanceValue: MessageImportance = MessageImportance.Normal;
  private priorityValue: MessagePriority = MessagePriority.Normal;
  private xpriorityValue: XMessagePriority = XMessagePriority.Normal;
  private resentSenderValue: MailboxAddress | null = null;
  private senderValue: MailboxAddress | null = null;
  private dateValue: DateTimeOffset = dateTimeOffsetMinValue;
  private resentDateValue: DateTimeOffset = dateTimeOffsetMinValue;
  private messageIdValue: string | null = null;
  private resentMessageIdValue: string | null = null;
  private inReplyToValue: string | null = null;
  private versionValue: Version | null = null;

  constructor();
  constructor(headers: Iterable<Header>);
  constructor(from: Iterable<InternetAddress>, to: Iterable<InternetAddress>, subject: string, body: MimeEntity | null);
  constructor(...args: unknown[]);
  /** C#: internal MimeMessage (ParserOptions options, IEnumerable<Header> headers, RfcComplianceMode mode). */
  constructor(options: ParserOptions, headers: Iterable<Header>, mode: RfcComplianceMode);
  constructor(...args: unknown[]);
  constructor(...args: unknown[]) {
    const internalFull =
      args.length === 3 &&
      args[0] instanceof ParserOptions &&
      (args[2] === 'loose' || args[2] === 'looser' || args[2] === 'strict');
    // C#: internal MimeMessage (ParserOptions options) — an empty message (no defaults).
    const internalEmpty = args.length === 1 && args[0] instanceof ParserOptions;
    const internal = internalFull || internalEmpty;

    this.headers = new HeaderList(internal ? (args[0] as ParserOptions) : ParserOptions.default.clone());
    this.compliance = internalFull ? (args[2] as RfcComplianceMode) : 'strict';

    for (const id of STANDARD_ADDRESS_HEADERS) {
      const list = new InternetAddressList();
      const cb = (): void => this.serializeAddressList(id, list);
      list.onChanged = cb;
      this.addressListCallbacks.set(id, cb);
      this.addresses.set(id, list);
    }

    this.referencesChangedCb = (): void => this.referencesChanged();
    this.referenceList.onChanged = this.referencesChangedCb;

    this.headersChangedCb = (header, action): void => this.headersChanged(action, header);
    this.headers.onChanged = this.headersChangedCb;

    if (internal) {
      // C#: add all message headers, skipping Content-* (those belong to the body entity).
      if (internalFull) {
        for (const header of args[1] as Iterable<Header>) {
          if (!startsWithContent(header.field)) this.headers.add(header);
        }
      }
      return;
    }

    if (args.length === 0) {
      this.applyDefaults(true);
      return;
    }

    if (args.length === 4 && looksLikeFromToSubjectBody(args)) {
      const [from, to, subject, body] = args;
      if (from == null) throw new TypeError('from cannot be null or undefined');
      if (to == null) throw new TypeError('to cannot be null or undefined');
      if (subject == null) throw new TypeError('subject cannot be null or undefined');
      this.applyDefaults(true); // C#: ": this ()"
      this.from.addRange(from as Iterable<InternetAddress>);
      this.to.addRange(to as Iterable<InternetAddress>);
      this.subject = subject as string;
      this.body = (body ?? null) as MimeEntity | null;
      return;
    }

    if (args.length === 1 && !(args[0] instanceof Header) && !(args[0] instanceof MimeEntity)) {
      // C#: MimeMessage (IEnumerable<Header> headers)
      const headers = args[0];
      if (headers == null) throw new TypeError('headers cannot be null or undefined');
      if (!isHeaderIterable(headers)) throw new TypeError('headers must be an iterable of Header');
      for (const header of headers as Iterable<Header>) {
        if (!startsWithContent(header.field))
          this.headers.add(header);
      }
      return;
    }

    // C#: MimeMessage (params object[] args)
    let body: MimeEntity | null = null;
    for (const obj of args) {
      if (obj == null) continue;
      if (obj instanceof Header) {
        if (!startsWithContent(obj.field)) this.headers.add(obj);
        continue;
      }
      if (isHeaderIterable(obj)) {
        for (const h of obj as Iterable<Header>) {
          if (!startsWithContent(h.field)) this.headers.add(h);
        }
        continue;
      }
      if (obj instanceof MimeEntity) {
        if (body != null) throw new TypeError('Message body should not be specified more than once.');
        body = obj;
        continue;
      }
      throw new TypeError(`Unknown initialization parameter: ${String(obj)}`);
    }
    if (body != null) this.body = body;
    this.applyDefaults(false);
  }

  private applyDefaults(force: boolean): void {
    if (force || !this.headers.contains(HeaderId.From)) this.headers.setValue(HeaderId.From, '');
    if (force || !this.headers.contains(HeaderId.Date)) this.date = nowDateTimeOffset();
    if (force || !this.headers.contains(HeaderId.Subject)) this.subject = '';
    if (force || !this.headers.contains(HeaderId.MessageId)) this.messageId = generateMessageId();
  }

  get importance(): MessageImportance {
    if (!this.lazyLoaded.has('importance')) {
      const header = this.headers.tryGetHeader(HeaderId.Importance);
      if (header !== null) {
        switch (header.value.toLowerCase().trim()) {
        case 'high': this.importanceValue = MessageImportance.High; break;
        case 'low': this.importanceValue = MessageImportance.Low; break;
        default: this.importanceValue = MessageImportance.Normal; break;
        }
      }
      this.lazyLoaded.add('importance');
    }
    return this.importanceValue;
  }

  set importance(value: MessageImportance) {
    if (value === this.importanceValue) return;
    if (!isMessageImportance(value)) throw new RangeError('value is not a valid MessageImportance');
    this.setHeader('Importance', value);
    this.lazyLoaded.add('importance');
    this.importanceValue = value;
  }

  get priority(): MessagePriority {
    if (!this.lazyLoaded.has('priority')) {
      const header = this.headers.tryGetHeader(HeaderId.Priority);
      if (header !== null) {
        switch (header.value.toLowerCase().trim()) {
        case 'non-urgent': this.priorityValue = MessagePriority.NonUrgent; break;
        case 'urgent': this.priorityValue = MessagePriority.Urgent; break;
        default: this.priorityValue = MessagePriority.Normal; break;
        }
      }
      this.lazyLoaded.add('priority');
    }
    return this.priorityValue;
  }

  set priority(value: MessagePriority) {
    if (value === this.priorityValue) return;
    switch (value) {
    case MessagePriority.NonUrgent:
    case MessagePriority.Normal:
    case MessagePriority.Urgent:
      break;
    default:
      throw new RangeError('value is not a valid MessagePriority');
    }
    this.setHeader('Priority', value);
    this.lazyLoaded.add('priority');
    this.priorityValue = value;
  }

  get xPriority(): XMessagePriority {
    if (!this.lazyLoaded.has('xPriority')) {
      const header = this.headers.tryGetHeader(HeaderId.XPriority);
      if (header !== null) {
        const raw = header.rawValue;
        const cursor = { index: 0 };
        skipWhiteSpace(raw, cursor, raw.length);
        const parsed = tryParseInt32(raw, cursor, raw.length);
        if (parsed.ok) {
          const level = Math.min(Math.max(parsed.value, 1), 5);
          this.xpriorityValue = xPriorityByLevel[level] ?? XMessagePriority.Normal;
        } else {
          this.xpriorityValue = XMessagePriority.Normal;
        }
      }
      this.lazyLoaded.add('xPriority');
    }
    return this.xpriorityValue;
  }

  set xPriority(value: XMessagePriority) {
    if (value === this.xpriorityValue) return;
    if (!isXMessagePriority(value)) throw new RangeError('value is not a valid XMessagePriority');
    this.setHeader('X-Priority', rawXPriorityValues[value]);
    this.lazyLoaded.add('xPriority');
    this.xpriorityValue = value;
  }

  get sender(): MailboxAddress | null {
    if (!this.lazyLoaded.has('sender')) {
      const header = this.headers.tryGetHeader(HeaderId.Sender);
      if (header !== null)
        this.senderValue = parseMailbox(this.headers.options, header.rawValue);
      this.lazyLoaded.add('sender');
    }
    return this.senderValue;
  }

  set sender(value: MailboxAddress | null) {
    if (this.lazyLoaded.has('sender') && value === this.senderValue) return;
    if (value === null) {
      this.removeHeader(HeaderId.Sender);
      this.lazyLoaded.add('sender');
      this.senderValue = null;
      return;
    }
    this.replaceHeader(HeaderId.Sender, 'Sender', encodeMailboxHeader('Sender', value));
    this.lazyLoaded.add('sender');
    this.senderValue = value;
  }

  get resentSender(): MailboxAddress | null {
    if (!this.lazyLoaded.has('resentSender')) {
      const header = this.headers.tryGetHeader(HeaderId.ResentSender);
      if (header !== null)
        this.resentSenderValue = parseMailbox(this.headers.options, header.rawValue);
      this.lazyLoaded.add('resentSender');
    }
    return this.resentSenderValue;
  }

  set resentSender(value: MailboxAddress | null) {
    if (this.lazyLoaded.has('resentSender') && value === this.resentSenderValue) return;
    if (value === null) {
      this.removeHeader(HeaderId.ResentSender);
      this.lazyLoaded.add('resentSender');
      this.resentSenderValue = null;
      return;
    }
    this.replaceHeader(HeaderId.ResentSender, 'Resent-Sender', encodeMailboxHeader('Resent-Sender', value));
    this.lazyLoaded.add('resentSender');
    this.resentSenderValue = value;
  }

  get from(): InternetAddressList { return this.getLazyLoadedAddresses(HeaderId.From, 'from'); }
  get resentFrom(): InternetAddressList { return this.getLazyLoadedAddresses(HeaderId.ResentFrom, 'resentFrom'); }
  get replyTo(): InternetAddressList { return this.getLazyLoadedAddresses(HeaderId.ReplyTo, 'replyTo'); }
  get resentReplyTo(): InternetAddressList { return this.getLazyLoadedAddresses(HeaderId.ResentReplyTo, 'resentReplyTo'); }
  get to(): InternetAddressList { return this.getLazyLoadedAddresses(HeaderId.To, 'to'); }
  get resentTo(): InternetAddressList { return this.getLazyLoadedAddresses(HeaderId.ResentTo, 'resentTo'); }
  get cc(): InternetAddressList { return this.getLazyLoadedAddresses(HeaderId.Cc, 'cc'); }
  get resentCc(): InternetAddressList { return this.getLazyLoadedAddresses(HeaderId.ResentCc, 'resentCc'); }
  get bcc(): InternetAddressList { return this.getLazyLoadedAddresses(HeaderId.Bcc, 'bcc'); }
  get resentBcc(): InternetAddressList { return this.getLazyLoadedAddresses(HeaderId.ResentBcc, 'resentBcc'); }

  get subject(): string | null { return this.headers.getValue('Subject'); }
  set subject(value: string) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    this.setHeader('Subject', value);
  }

  get date(): DateTimeOffset {
    if (!this.lazyLoaded.has('date')) {
      const header = this.headers.tryGetHeader(HeaderId.Date);
      if (header !== null) {
        const parsed = parseDate(header.rawValue);
        if (parsed.ok) this.dateValue = parsed.value;
      }
      this.lazyLoaded.add('date');
    }
    return this.dateValue;
  }

  set date(value: DateTimeOffset) {
    if (this.lazyLoaded.has('date') && dtoEquals(this.dateValue, value)) return;
    this.setHeader('Date', formatDate(value));
    this.lazyLoaded.add('date');
    this.dateValue = value;
  }

  get resentDate(): DateTimeOffset {
    if (!this.lazyLoaded.has('resentDate')) {
      const header = this.headers.tryGetHeader(HeaderId.ResentDate);
      if (header !== null) {
        const parsed = parseDate(header.rawValue);
        if (parsed.ok) this.resentDateValue = parsed.value;
      }
      this.lazyLoaded.add('resentDate');
    }
    return this.resentDateValue;
  }

  set resentDate(value: DateTimeOffset) {
    if (dtoEquals(this.resentDateValue, value)) return;
    this.setHeader('Resent-Date', formatDate(value));
    this.lazyLoaded.add('resentDate');
    this.resentDateValue = value;
  }

  get references(): MessageIdList {
    if (!this.lazyLoaded.has('references')) {
      const header = this.headers.tryGetHeader(HeaderId.References);
      if (header !== null) {
        const raw = header.rawValue;
        this.referenceList.onChanged = null;
        for (const msgid of enumerateReferences(raw, 0, raw.length))
          this.referenceList.add(msgid);
        this.referenceList.onChanged = this.referencesChangedCb;
      }
      this.lazyLoaded.add('references');
    }
    return this.referenceList;
  }

  get inReplyTo(): string | null {
    if (!this.lazyLoaded.has('inReplyTo')) {
      const header = this.headers.tryGetHeader(HeaderId.InReplyTo);
      if (header !== null) {
        const raw = header.rawValue;
        this.inReplyToValue = enumerateReferences(raw, 0, raw.length).next().value ?? null;
      }
      this.lazyLoaded.add('inReplyTo');
    }
    return this.inReplyToValue;
  }

  set inReplyTo(value: string | null) {
    if (this.lazyLoaded.has('inReplyTo') && this.inReplyToValue === value) return;
    if (value === null) {
      this.removeHeader(HeaderId.InReplyTo);
      this.lazyLoaded.add('inReplyTo');
      this.inReplyToValue = null;
      return;
    }
    const msgid = parseMsgIdOrThrow(value, 'Invalid Message-Id format.');
    this.lazyLoaded.add('inReplyTo');
    this.inReplyToValue = msgid;
    this.setHeader('In-Reply-To', `<${msgid}>`);
  }

  get messageId(): string | null {
    if (!this.lazyLoaded.has('messageId')) {
      const header = this.headers.tryGetHeader(HeaderId.MessageId);
      if (header !== null) {
        const parsed = tryParseMessageId(header.rawValue, 0, header.rawValue.length);
        this.messageIdValue = parsed.ok ? parsed.value : null;
      }
      this.lazyLoaded.add('messageId');
    }
    return this.messageIdValue;
  }

  set messageId(value: string) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (this.lazyLoaded.has('messageId') && this.messageIdValue === value) return;
    const msgid = parseMsgIdOrThrow(value, 'Invalid Message-Id format.');
    this.lazyLoaded.add('messageId');
    this.messageIdValue = msgid;
    this.setHeader('Message-Id', `<${msgid}>`);
  }

  get resentMessageId(): string | null {
    if (!this.lazyLoaded.has('resentMessageId')) {
      const header = this.headers.tryGetHeader(HeaderId.ResentMessageId);
      if (header !== null) {
        const parsed = tryParseMessageId(header.rawValue, 0, header.rawValue.length);
        this.resentMessageIdValue = parsed.ok ? parsed.value : null;
      }
      this.lazyLoaded.add('resentMessageId');
    }
    return this.resentMessageIdValue;
  }

  set resentMessageId(value: string) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (this.lazyLoaded.has('resentMessageId') && this.resentMessageIdValue === value) return;
    const msgid = parseMsgIdOrThrow(value, 'Invalid Resent-Message-Id format.');
    this.lazyLoaded.add('resentMessageId');
    this.resentMessageIdValue = msgid;
    this.setHeader('Resent-Message-Id', `<${msgid}>`);
  }

  get mimeVersion(): Version | null {
    if (!this.lazyLoaded.has('mimeVersion')) {
      const header = this.headers.tryGetHeader(HeaderId.MimeVersion);
      if (header !== null) {
        const parsed = tryParseVersion(header.rawValue, 0, header.rawValue.length);
        if (parsed.ok) this.versionValue = Version.fromMimeVersion(parsed.value);
      }
      this.lazyLoaded.add('mimeVersion');
    }
    return this.versionValue;
  }

  set mimeVersion(value: Version) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (this.versionValue != null && this.versionValue.compareTo(value) === 0) return;
    this.setHeader('MIME-Version', value.toString());
    this.lazyLoaded.add('mimeVersion');
    this.versionValue = value;
  }

  get textBody(): string | null { return this.getTextBody('plain'); }
  get htmlBody(): string | null { return this.getTextBody('html'); }

  getTextBody(format: TextFormat): string | null {
    const body = this.body;
    if (body instanceof Multipart) {
      const text = body.tryGetValue(format);
      if (text != null) return MultipartAlternative.getText(text);
    } else if (body instanceof TextPart && body.isFormat(format) && !body.isAttachment) {
      return MultipartAlternative.getText(body);
    }
    return null;
  }

  get bodyParts(): IterableIterator<MimeEntity> {
    return enumerateMimeParts(this.body);
  }

  get attachments(): IterableIterator<MimeEntity> {
    const self = this;
    return (function* () {
      for (const part of enumerateMimeParts(self.body)) {
        if (part.isAttachment) yield part;
      }
    })();
  }

  getRecipients(onlyUnique = false): MailboxAddress[] {
    return this.getMailboxes(false, onlyUnique);
  }

  accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    visitor.visitMimeMessage(this);
  }

  prepare(constraint: EncodingConstraint, maxLineLength = 78): void {
    if (maxLineLength < MINIMUM_LINE_LENGTH || maxLineLength > MAXIMUM_LINE_LENGTH)
      throw new RangeError('maxLineLength out of range');
    if (this.body != null) {
      if (this.mimeVersion == null && this.body.headers.count > 0)
        this.mimeVersion = new Version(1, 0);
      this.body.prepare(constraint, maxLineLength);
    }
  }

  writeTo(stream: Stream): void;
  writeTo(stream: Stream, headersOnly: boolean): void;
  writeTo(options: FormatOptions, stream: Stream): void;
  writeTo(options: FormatOptions, stream: Stream, headersOnly: boolean): void;
  writeTo(a: FormatOptions | Stream | null, b?: Stream | boolean | null, c?: boolean): void {
    let options: FormatOptions | null;
    let stream: Stream | null;
    let headersOnly: boolean;
    if (a === null || a instanceof FormatOptions) {
      options = a;
      stream = (b ?? null) as Stream | null;
      headersOnly = c ?? false;
    } else {
      options = FormatOptions.default;
      stream = a;
      headersOnly = typeof b === 'boolean' ? b : false;
    }
    if (options == null) throw new TypeError('options cannot be null or undefined');
    if (stream == null) throw new TypeError('stream cannot be null or undefined');

    if (this.compliance === 'strict' && this.body != null && this.body.headers.count > 0 && !this.headers.contains(HeaderId.MimeVersion))
      this.mimeVersion = new Version(1, 0);

    if (this.body != null) {
      const filtered = new FilteredStream(stream);
      filtered.add(options.createNewLineFilter());

      for (const header of MimeMessage.mergeHeaders(this.headers, this.body)) {
        if (options.hiddenHeaders.has(header.id)) continue;
        filtered.write(header.rawField, 0, header.rawField.length);
        if (!header.isInvalid) {
          const rawValue = header.getRawValue(options);
          filtered.write(COLON, 0, COLON.length);
          filtered.write(rawValue, 0, rawValue.length);
        }
      }

      filtered.flush();

      if (this.compliance === 'strict' || this.body.headers.hasBodySeparator) {
        const nl = options.newLineBytes;
        stream.write(nl, 0, nl.length);
      }

      if (!headersOnly) {
        try {
          this.body.ensureNewLine = this.compliance === 'strict' || options.ensureNewLine;
          this.body.writeTo(options, stream, true);
        } finally {
          this.body.ensureNewLine = false;
        }
      }
    } else {
      this.headers.writeTo(options, stream);
    }
  }

  toString(): string {
    const memory = new MemoryStream();
    this.writeTo(FormatOptions.default, memory);
    return latin1.decode(memory.toArray());
  }

  /**
   * C#: MimeMessage.Load. Parses a message from a stream (or byte buffer) using
   * the MIME parser. Per the port's Result convention, parse errors are returned
   * as an Err rather than thrown (C#: FormatException).
   */
  static load(stream: Stream, persistent?: boolean, options?: ParserOptions): Result<MimeMessage>;
  static load(data: Uint8Array, options?: ParserOptions): Result<MimeMessage>;
  static load(
    source: Stream | Uint8Array,
    b?: boolean | ParserOptions,
    c?: ParserOptions,
  ): Result<MimeMessage> {
    if (source == null) throw new TypeError('stream cannot be null or undefined');

    let stream: Stream;
    let persistent = false;
    let options: ParserOptions;

    if (source instanceof Stream) {
      stream = source;
      if (typeof b === 'boolean') {
        persistent = b;
        options = c ?? ParserOptions.default;
      } else {
        options = b ?? ParserOptions.default;
      }
    } else {
      stream = new MemoryStream(source);
      options = (b as ParserOptions | undefined) ?? ParserOptions.default;
    }

    const parser = newMimeParser(options, stream, 'entity', persistent);
    return parser.parseMessage();
  }

  dispose(): void {
    this.body?.dispose();
  }

  // --- internal helpers (mirror the C# private members) ---

  static *mergeHeaders(headers: HeaderList, body: MimeEntity): IterableIterator<Header> {
    let mesgIndex = 0;
    let bodyIndex = 0;

    while (mesgIndex < headers.count) {
      const mesgHeader = headers.at(mesgIndex);
      if (mesgHeader.offset !== null) break;
      yield mesgHeader;
      mesgIndex++;
    }

    while (mesgIndex < headers.count && bodyIndex < body.headers.count) {
      const bodyHeader = body.headers.at(bodyIndex);
      if (bodyHeader.offset === null) break;

      const mesgHeader = headers.at(mesgIndex);
      if (mesgHeader.offset !== null && mesgHeader.offset < bodyHeader.offset) {
        yield mesgHeader;
        mesgIndex++;
      } else {
        yield bodyHeader;
        bodyIndex++;
      }
    }

    while (mesgIndex < headers.count)
      yield headers.at(mesgIndex++);

    while (bodyIndex < body.headers.count)
      yield body.headers.at(bodyIndex++);
  }

  private getMailboxes(includeSenders: boolean, onlyUnique: boolean): MailboxAddress[] {
    const unique: Set<string> | null = onlyUnique ? new Set<string>() : null;
    const recipients: MailboxAddress[] = [];

    const add = (mailboxes: Iterable<MailboxAddress>): void => {
      for (const mailbox of mailboxes) {
        if (unique === null || addUnique(unique, mailbox.address))
          recipients.push(mailbox);
      }
    };

    if (this.resentSender != null || this.resentFrom.count > 0) {
      if (includeSenders) {
        if (this.resentSender != null && (unique === null || addUnique(unique, this.resentSender.address)))
          recipients.push(this.resentSender);
        add(this.resentFrom.mailboxes);
      }
      add(this.resentTo.mailboxes);
      add(this.resentCc.mailboxes);
      add(this.resentBcc.mailboxes);
    } else {
      if (includeSenders) {
        if (this.sender != null && (unique === null || addUnique(unique, this.sender.address)))
          recipients.push(this.sender);
        add(this.from.mailboxes);
      }
      add(this.to.mailboxes);
      add(this.cc.mailboxes);
      add(this.bcc.mailboxes);
    }

    return recipients;
  }

  private getLazyLoadedAddresses(id: HeaderId, field: LazyField): InternetAddressList {
    const list = this.addresses.get(id)!;
    if (!this.lazyLoaded.has(field)) {
      for (let i = 0; i < this.headers.count; i++) {
        if (this.headers.at(i).id !== id) continue;
        this.addAddresses(this.headers.at(i), list);
      }
      this.lazyLoaded.add(field);
    }
    return list;
  }

  private addAddresses(header: Header, list: InternetAddressList): void {
    const raw = header.rawValue;
    const cursor = { index: 0 };
    const parsed = tryParseAddressListInternal(
      AddressParserFlags.Internal | AddressParserFlags.TryParse,
      this.headers.options, raw, cursor, raw.length, false, 0,
    );
    if (!parsed.ok) return;

    const cb = this.addressListCallbacks.get(header.id) ?? null;
    list.onChanged = null;
    list.addRange(parsed.value);
    list.onChanged = cb;
  }

  private serializeAddressList(id: HeaderId, list: InternetAddressList): void {
    if (list.count === 0) {
      this.removeHeader(id);
      return;
    }

    const field = toHeaderName(id);
    const state = { lineLength: field.length + 2 };
    let builder = ' ';
    builder += list.encode(FormatOptions.default, true, state);
    builder += FormatOptions.default.newLine;

    this.replaceHeader(id, field, utf8.encode(builder));
  }

  private referencesChanged(): void {
    if (this.referenceList.count > 0) {
      const options = FormatOptions.default;
      let builder = '';
      let lineLength = 'References'.length + 1;

      for (let i = 0; i < this.referenceList.count; i++) {
        const value = this.referenceList.at(i);
        if (i > 0 && lineLength + value.length + 2 >= options.maxLineLength) {
          builder += options.newLine;
          builder += '\t';
          lineLength = 1;
        } else {
          builder += ' ';
          lineLength++;
        }
        lineLength += value.length;
        builder += `<${value}>`;
      }

      builder += options.newLine;
      this.replaceHeader(HeaderId.References, 'References', utf8.encode(builder));
    } else {
      this.removeHeader(HeaderId.References);
    }
  }

  private headersChanged(action: HeaderListChangedAction, header: Header | null): void {
    if (action !== 'cleared' && header !== null && this.addresses.has(header.id)) {
      const list = this.addresses.get(header.id)!;
      const field = ADDRESS_LAZY_FIELD[header.id];
      if (field !== undefined && this.lazyLoaded.has(field)) {
        switch (action) {
        case 'added':
          this.addAddresses(header, list);
          break;
        case 'changed':
        case 'removed': {
          const cb = this.addressListCallbacks.get(header.id) ?? null;
          list.onChanged = null;
          list.clear();
          list.onChanged = cb;
          this.lazyLoaded.delete(field);
          break;
        }
        }
      }
      return;
    }

    switch (action) {
    case 'added':
    case 'changed':
    case 'removed':
      switch (header!.id) {
      case HeaderId.ResentSender: this.lazyLoaded.delete('resentSender'); this.resentSenderValue = null; break;
      case HeaderId.Sender: this.lazyLoaded.delete('sender'); this.senderValue = null; break;
      case HeaderId.ResentDate: this.lazyLoaded.delete('resentDate'); this.resentDateValue = dateTimeOffsetMinValue; break;
      case HeaderId.Date: this.lazyLoaded.delete('date'); this.dateValue = dateTimeOffsetMinValue; break;
      case HeaderId.ResentMessageId: this.lazyLoaded.delete('resentMessageId'); this.resentMessageIdValue = null; break;
      case HeaderId.MessageId: this.lazyLoaded.delete('messageId'); this.messageIdValue = null; break;
      case HeaderId.References:
        this.lazyLoaded.delete('references');
        this.referenceList.onChanged = null;
        this.referenceList.clear();
        this.referenceList.onChanged = this.referencesChangedCb;
        break;
      case HeaderId.InReplyTo: this.lazyLoaded.delete('inReplyTo'); this.inReplyToValue = null; break;
      case HeaderId.MimeVersion: this.lazyLoaded.delete('mimeVersion'); this.versionValue = null; break;
      case HeaderId.Importance: this.lazyLoaded.delete('importance'); this.importanceValue = MessageImportance.Normal; break;
      case HeaderId.Priority: this.lazyLoaded.delete('priority'); this.priorityValue = MessagePriority.Normal; break;
      case HeaderId.XPriority: this.lazyLoaded.delete('xPriority'); this.xpriorityValue = XMessagePriority.Normal; break;
      }
      break;
    case 'cleared':
      this.lazyLoaded.clear();
      for (const [id, list] of this.addresses) {
        const cb = this.addressListCallbacks.get(id) ?? null;
        list.onChanged = null;
        list.clear();
        list.onChanged = cb;
      }
      this.referenceList.onChanged = null;
      this.referenceList.clear();
      this.referenceList.onChanged = this.referencesChangedCb;
      this.resentDateValue = this.dateValue = dateTimeOffsetMinValue;
      this.importanceValue = MessageImportance.Normal;
      this.xpriorityValue = XMessagePriority.Normal;
      this.priorityValue = MessagePriority.Normal;
      this.resentMessageIdValue = null;
      this.resentSenderValue = null;
      this.inReplyToValue = null;
      this.messageIdValue = null;
      this.versionValue = null;
      this.senderValue = null;
      break;
    }
  }

  private removeHeader(id: HeaderId): void {
    this.headers.onChanged = null;
    try {
      this.headers.removeAll(id);
    } finally {
      this.headers.onChanged = this.headersChangedCb;
    }
  }

  private replaceHeader(id: HeaderId, name: string, raw: Uint8Array): void {
    this.headers.onChanged = null;
    try {
      this.headers.replace(Header.fromRaw(this.headers.options, id, name, raw));
    } finally {
      this.headers.onChanged = this.headersChangedCb;
    }
  }

  private setHeader(name: string, value: string): void {
    this.headers.onChanged = null;
    try {
      this.headers.setValue(name, value);
    } finally {
      this.headers.onChanged = this.headersChangedCb;
    }
  }
}

function* enumerateMimeParts(entity: MimeEntity | null): IterableIterator<MimeEntity> {
  if (entity == null) return;
  if (entity instanceof Multipart) {
    for (const subpart of entity)
      yield* enumerateMimeParts(subpart);
    return;
  }
  yield entity;
}

function startsWithContent(field: string): boolean {
  return field.toLowerCase().startsWith('content-');
}

function isHeaderIterable(value: unknown): value is Iterable<Header> {
  if (value == null || typeof value === 'string' || value instanceof Uint8Array) return false;
  if (typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function') return false;
  for (const item of value as Iterable<unknown>)
    return item instanceof Header;
  return true;
}

function looksLikeFromToSubjectBody(args: unknown[]): boolean {
  return isAddressIterableOrNull(args[0])
    && isAddressIterableOrNull(args[1])
    && (args[2] === null || typeof args[2] === 'string')
    && (args[3] == null || args[3] instanceof MimeEntity);
}

function isAddressIterableOrNull(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string' || value instanceof MimeEntity || value instanceof Header) return false;
  return typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';
}

function addUnique(set: Set<string>, address: string): boolean {
  const key = address.toLowerCase();
  if (set.has(key)) return false;
  set.add(key);
  return true;
}

function parseMailbox(options: ParserOptions, raw: Uint8Array): MailboxAddress | null {
  const cursor = { index: 0 };
  const parsed = InternetAddress.tryParseInternal(AddressParserFlags.AllowMailboxAddress, options, raw, cursor, raw.length, 0);
  return parsed.ok && parsed.value instanceof MailboxAddress ? parsed.value : null;
}

function parseMsgIdOrThrow(value: string, message: string): string {
  const buffer = encoder.encode(value);
  const cursor = { index: 0 };
  const parsed = tryParseMsgId(buffer, cursor, buffer.length, false);
  if (!parsed.ok) throw new TypeError(message);
  return parsed.value;
}

function encodeMailboxHeader(field: string, value: MailboxAddress): Uint8Array {
  const state = { lineLength: `${field}: `.length };
  let builder = ' ';
  builder += value.encode(FormatOptions.default, true, state);
  builder += FormatOptions.default.newLine;
  return utf8.encode(builder);
}
