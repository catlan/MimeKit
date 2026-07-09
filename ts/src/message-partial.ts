import { FormatOptions } from './format-options.js';
import { Header } from './header.js';
import { HeaderId } from './header-id.js';
import { BoundStream } from './io/bound-stream.js';
import { ChainedStream } from './io/chained-stream.js';
import { MemoryStream, Stream } from './io/stream.js';
import { MimeContent } from './mime-content.js';
import { MimeMessage } from './mime-message.js';
import { newMimeParser } from './parser-hook.js';
import { MimePart } from './mime-part.js';
import type { MimeEntityConstructorArgs } from './mime-entity.js';
import type { MimeVisitor } from './mime-visitor.js';
import { Parameter } from './parameter.js';
import { ParserOptions } from './parser-options.js';
import { generateMessageId } from './utils/mime-utils.js';

// C#: the set of header ids that survive MessagePartial.Split (everything else
// is hidden). Kept in sync with rfc2046 §5.2.2.1 / the C# switch statement.
const SPLIT_KEEP: ReadonlySet<HeaderId> = new Set<HeaderId>([
  HeaderId.Subject,
  HeaderId.MessageId,
  HeaderId.Encrypted,
  HeaderId.MimeVersion,
  HeaderId.ContentAlternative,
  HeaderId.ContentBase,
  HeaderId.ContentClass,
  HeaderId.ContentDescription,
  HeaderId.ContentDisposition,
  HeaderId.ContentDuration,
  HeaderId.ContentFeatures,
  HeaderId.ContentId,
  HeaderId.ContentIdentifier,
  HeaderId.ContentLanguage,
  HeaderId.ContentLength,
  HeaderId.ContentLocation,
  HeaderId.ContentMd5,
  HeaderId.ContentReturn,
  HeaderId.ContentTransferEncoding,
  HeaderId.ContentTranslationType,
  HeaderId.ContentType,
]);

// rfc2046: headers copied/kept when reassembling a partial message.
const JOIN_KEEP: ReadonlySet<HeaderId> = new Set<HeaderId>([
  HeaderId.Subject,
  HeaderId.MessageId,
  HeaderId.Encrypted,
  HeaderId.MimeVersion,
]);

/**
 * A MIME part containing a fragment of a larger message.
 *
 * The message/partial type is used to split large messages into multiple
 * parts, typically for transports with message size limits.
 */
export class MessagePartial extends MimePart {
  /**
   * Initializes a new message/partial entity.
   *
   * @param id The id value shared among all partial message parts.
   * @param number The 1-based part number for this fragment.
   * @param total The total number of fragments.
   */
  constructor(args: MimeEntityConstructorArgs);
  constructor(id: string, number: number, total: number);
  constructor(idOrArgs: string | MimeEntityConstructorArgs, number?: number, total?: number) {
    if (isConstructorArgs(idOrArgs)) {
      super(idOrArgs);
      return;
    }
    const id = idOrArgs;
    if (id == null) throw new TypeError('id cannot be null or undefined');
    if (number == null || number < 1) throw new RangeError('number out of range');
    if (total == null || total < number) throw new RangeError('total out of range');
    super('message', 'partial');
    this.contentType.parameters.add(new Parameter('id', id));
    this.contentType.parameters.add(new Parameter('number', String(number)));
    this.contentType.parameters.add(new Parameter('total', String(total)));
  }

  /** Gets the `id` parameter of the Content-Type header. */
  get Id(): string | null { return this.id; }
  /** Gets the `id` parameter of the Content-Type header. */
  get id(): string | null { return this.contentType.parameters.get('id') as string | null; }
  /** Gets the `number` parameter of the Content-Type header. */
  get Number(): number | null { return this.number; }
  /** Gets the `number` parameter of the Content-Type header. */
  get number(): number | null { return parseNullableInt(this.contentType.parameters.get('number') as string | null); }
  /** Gets the `total` parameter of the Content-Type header. */
  get Total(): number | null { return this.total; }
  /** Gets the `total` parameter of the Content-Type header. */
  get total(): number | null { return parseNullableInt(this.contentType.parameters.get('total') as string | null); }

  /**
   * Dispatches to the visitor method for message/partial entities.
   *
   * @param visitor The visitor.
   */
  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MessagePartial');
    visitor.visitMessagePartial(this);
  }

  /**
   * Splits a message into multiple message/partial messages.
   *
   * @param message The message to split.
   * @param maxSize The maximum size for each message body.
   * @returns The partial messages.
   */
  static split(message: MimeMessage, maxSize: number): MimeMessage[] {
    if (message == null) throw new TypeError('message cannot be null or undefined');
    if (!Number.isInteger(maxSize) || maxSize < 1) throw new RangeError('maxSize out of range');

    const options = FormatOptions.default.clone();
    for (const id of Object.values(HeaderId) as HeaderId[]) {
      if (!SPLIT_KEEP.has(id)) options.hiddenHeaders.add(id);
    }

    const memory = new MemoryStream();
    message.writeTo(options, memory);
    memory.position = 0;

    const length = memory.length;
    if (length <= maxSize) return [message];

    const buf = memory.toArray();
    const streams: Stream[] = [];
    let startIndex = 0;

    while (startIndex < length) {
      // Prefer splitting on a whole-line boundary; fall back to the raw size.
      let endIndex = Math.min(length, startIndex + maxSize);

      if (endIndex < length) {
        let ebx = endIndex;
        while (ebx > startIndex + 1 && buf[ebx] !== 0x0a /* '\n' */) ebx--;
        if (buf[ebx] === 0x0a) endIndex = ebx + 1;
      }

      streams.push(new BoundStream(memory, startIndex, endIndex, true));
      startIndex = endIndex;
    }

    const msgid = message.messageId ?? generateMessageId();
    const result: MimeMessage[] = [];

    for (let i = 0; i < streams.length; i++) {
      const msg = MessagePartial.cloneMessage(message);
      const partial = new MessagePartial(msgid, i + 1, streams.length);
      partial.content = new MimeContent(streams[i]!);
      msg.body = partial;
      result.push(msg);
    }

    return result;
  }

  /**
   * Joins message/partial parts into the complete message.
   *
   * @param options Parser options to use.
   * @param message The message containing the first message/partial body.
   * @param partials The partial message parts.
   * @returns The reassembled message, or `null` when reassembly fails.
   */
  static join(message: MimeMessage, partials: Iterable<MessagePartial>): MimeMessage | null;
  static join(options: ParserOptions, message: MimeMessage, partials: Iterable<MessagePartial>): MimeMessage | null;
  static join(
    a: MimeMessage | ParserOptions,
    b: MimeMessage | Iterable<MessagePartial>,
    c?: Iterable<MessagePartial>,
  ): MimeMessage | null {
    let options: ParserOptions;
    let message: MimeMessage;
    let partials: Iterable<MessagePartial>;

    if (a instanceof ParserOptions) {
      options = a;
      message = b as MimeMessage;
      partials = c as Iterable<MessagePartial>;
    } else {
      options = ParserOptions.default;
      message = a;
      partials = b as Iterable<MessagePartial>;
    }

    if (options == null) throw new TypeError('options cannot be null or undefined');
    if (message == null) throw new TypeError('message cannot be null or undefined');
    if (partials == null) throw new TypeError('partials cannot be null or undefined');

    const parts = [...partials];
    if (parts.length === 0) return null;

    parts.sort(partialCompare);

    const lastTotal = parts[parts.length - 1]!.total;
    if (lastTotal == null) throw new TypeError('The last partial does not have a Total.');
    if (parts.length !== lastTotal) throw new TypeError('The number of partials provided does not match the expected count.');

    const chained = new ChainedStream();
    for (let i = 0; i < parts.length; i++) {
      const number = parts[i]!.number!; // partialCompare guarantees non-null.
      if (number !== i + 1) throw new TypeError('One or more partials is missing.');
      const content = parts[i]!.content;
      if (content != null) chained.add(content.open());
    }

    const parser = newMimeParser(options, chained, 'entity');
    const result = parser.parseMessage();
    if (!result.ok) throw new Error(result.error.message);

    const joined = result.value;
    combineHeaders(message, joined);

    return joined;
  }

  private static cloneMessage(message: MimeMessage): MimeMessage {
    const options = message.headers.options;
    const clone = new MimeMessage(options);

    for (const header of message.headers) clone.headers.add(header.clone());

    clone.headers.replace(HeaderId.MessageId, '<' + generateMessageId() + '>');

    return clone;
  }
}

/** C#: MessagePartial.PartialCompare. */
function partialCompare(partial1: MessagePartial, partial2: MessagePartial): number {
  if (partial1.id !== partial2.id) throw new TypeError('Partial messages have mismatching identifiers.');
  if (partial1.number == null || partial2.number == null)
    throw new TypeError('One or more partial messages have missing numbers.');
  return partial1.number - partial2.number;
}

/** C#: MessagePartial.CombineHeaders. */
function combineHeaders(message: MimeMessage, joined: MimeMessage): void {
  const headers: Header[] = [];
  let i = 0;

  // Keep only Subject/Message-ID/Encrypted/MIME-Version from the enclosed message.
  while (i < joined.headers.count) {
    const header = joined.headers.at(i);
    if (JOIN_KEEP.has(header.id)) {
      headers.push(header);
      header.offset = null;
      i++;
    } else {
      joined.headers.removeAt(i);
    }
  }

  // Copy (in order) all non-Content- headers from the enclosing message.
  i = 0;
  for (const header of message.headers) {
    if (JOIN_KEEP.has(header.id)) {
      for (let j = 0; j < headers.length; j++) {
        if (headers[j]!.id === header.id) {
          const original = headers[j]!;
          joined.headers.remove(original);
          joined.headers.insert(i++, original);
          headers.splice(j, 1);
          break;
        }
      }
    } else {
      const clone = header.clone();
      clone.offset = null;
      joined.headers.insert(i++, clone);
    }
  }

  if (joined.body != null) {
    for (const header of joined.body.headers) header.offset = null;
  }
}

function isConstructorArgs(value: unknown): value is MimeEntityConstructorArgs {
  return typeof value === 'object' && value !== null && 'parserOptions' in value && 'contentType' in value && 'headers' in value;
}

function parseNullableInt(value: string | null): number | null {
  if (value == null)
    return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed))
    return null;
  return Number.parseInt(trimmed, 10);
}
