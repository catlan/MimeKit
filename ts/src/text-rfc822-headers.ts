import { MessagePart } from './message-part.js';
import type { MimeEntityConstructorArgs } from './mime-entity.js';
import type { MimeVisitor } from './mime-visitor.js';

/**
 * A text/rfc822-headers MIME entity containing message headers.
 */
export class TextRfc822Headers extends MessagePart {
  /**
   * Initializes a new text/rfc822-headers entity.
   *
   * @param args Constructor arguments used by the parser.
   */
  constructor(args: MimeEntityConstructorArgs);
  constructor(...args: unknown[]) {
    if (args.length === 1 && isConstructorArgs(args[0])) {
      super(args[0]);
      return;
    }
    super('rfc822-headers', ...args);
    // C# derives from MessagePart but uses text/rfc822-headers.
    this.contentType.mediaType = 'text';
  }

  /**
   * Dispatches to the visitor method for text/rfc822-headers entities.
   *
   * @param visitor The visitor.
   */
  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('TextRfc822Headers');
    visitor.visitTextRfc822Headers(this);
  }
}

function isConstructorArgs(value: unknown): value is MimeEntityConstructorArgs {
  return typeof value === 'object' && value !== null && 'parserOptions' in value && 'contentType' in value && 'headers' in value;
}
