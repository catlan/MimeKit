import { FormatOptions, MAXIMUM_LINE_LENGTH, MINIMUM_LINE_LENGTH } from './format-options.js';
import type { EncodingConstraint } from './io/filters/best-encoding-filter.js';
import { Stream } from './io/stream.js';
import { MimeEntity, type MimeEntityConstructorArgs } from './mime-entity.js';
import type { MimeMessage } from './mime-message.js';
import type { MimeVisitor } from './mime-visitor.js';

export class MessagePart extends MimeEntity {
  message: MimeMessage | null = null;

  constructor();
  constructor(subtype: string, ...args: unknown[]);
  constructor(args: MimeEntityConstructorArgs);
  constructor(subtype: string | MimeEntityConstructorArgs = 'rfc822', ...args: unknown[]) {
    if (isConstructorArgs(subtype)) {
      super(subtype);
      return;
    }
    if (subtype == null) throw new TypeError('subtype cannot be null or undefined');
    super('message', subtype);
    for (const obj of args) {
      if (obj == null || this.tryInit(obj))
        continue;
      if (isMimeMessage(obj)) {
        if (this.message != null) throw new TypeError('MimeMessage should not be specified more than once.');
        this.message = obj;
        continue;
      }
      throw new TypeError(`Unknown initialization parameter: ${String(obj)}`);
    }
  }

  get Message(): MimeMessage | null { return this.message; }
  set Message(value: MimeMessage | null) { this.message = value; }

  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MessagePart');
    visitor.visitMessagePart(this);
  }

  override prepare(constraint: EncodingConstraint, maxLineLength = 78): void {
    if (maxLineLength < MINIMUM_LINE_LENGTH || maxLineLength > MAXIMUM_LINE_LENGTH)
      throw new RangeError('maxLineLength out of range');
    this.checkDisposed('MessagePart');
    this.message?.prepare(constraint, maxLineLength);
  }

  override writeTo(a: FormatOptions | Stream, b?: Stream, contentOnly = false): void {
    const options = a instanceof FormatOptions ? a : FormatOptions.default;
    const stream = a instanceof FormatOptions ? b : a;
    super.writeTo(options, stream!, contentOnly);
    if (this.message == null)
      return;
    if (this.message.mboxMarker != null && this.message.mboxMarker.length > 0)
      stream!.write(this.message.mboxMarker, 0, this.message.mboxMarker.length);
    const messageOptions = options.ensureNewLine ? options.clone() : options;
    messageOptions.ensureNewLine = false;
    this.message.writeTo(messageOptions, stream!);
  }

  override dispose(): void {
    this.message?.dispose();
    super.dispose();
  }
}

function isConstructorArgs(value: unknown): value is MimeEntityConstructorArgs {
  return typeof value === 'object' && value !== null && 'parserOptions' in value && 'contentType' in value && 'headers' in value;
}

// Structural (not instanceof) to keep MessagePart's import of MimeMessage
// type-only and the runtime graph cycle-free (MimeMessage -> Multipart ->
// MessagePart). A MimeMessage is the only ctor arg exposing writeTo + body.
function isMimeMessage(value: unknown): value is MimeMessage {
  return typeof value === 'object' && value !== null && 'writeTo' in value && 'body' in value;
}
