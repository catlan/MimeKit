// Port of MimeKit/Cryptography/ApplicationPgpEncrypted.cs.

import { MimeContent } from '../mime-content.js';
import { MimePart } from '../mime-part.js';
import { MemoryStream } from '../io/stream.js';
import type { MimeEntityConstructorArgs } from '../mime-entity.js';
import type { MimeVisitor } from '../mime-visitor.js';

/**
 * A MIME part with a Content-Type of application/pgp-encrypted.
 *
 * Typically the first child of a `multipart/encrypted` part; its content is the
 * fixed version marker `"Version: 1\n"` (RFC 3156).
 */
export class ApplicationPgpEncrypted extends MimePart {
  /** @param args The parser constructor args. */
  constructor(args: MimeEntityConstructorArgs);
  constructor();
  constructor(args?: MimeEntityConstructorArgs) {
    if (args === undefined) {
      super('application', 'pgp-encrypted');
      this.content = new MimeContent(new MemoryStream(new TextEncoder().encode('Version: 1\n')));
      return;
    }
    super(args);
  }

  /**
   * Dispatches to the visitor method for application/pgp-encrypted entities.
   *
   * @param visitor The visitor.
   */
  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('ApplicationPgpEncrypted');
    visitor.visitApplicationPgpEncrypted(this);
  }
}
