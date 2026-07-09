// Port of MimeKit/Cryptography/ApplicationPgpSignature.cs.

import { MimeContent } from '../mime-content.js';
import { MimePart } from '../mime-part.js';
import type { MimeEntityConstructorArgs } from '../mime-entity.js';
import type { MimeVisitor } from '../mime-visitor.js';
import { Stream } from '../io/stream.js';

/**
 * A MIME part with a Content-Type of application/pgp-signature.
 *
 * Contains detached OpenPGP signature data and is typically the second child of
 * a {@link MultipartSigned}. To verify, use the parent multipart/signed part's
 * verify methods.
 */
export class ApplicationPgpSignature extends MimePart {
  /**
   * @param arg The parser constructor args, or a content stream holding the
   *   armored signature.
   */
  constructor(args: MimeEntityConstructorArgs);
  constructor(stream: Stream);
  constructor(arg: MimeEntityConstructorArgs | Stream) {
    if (arg instanceof Stream) {
      super('application', 'pgp-signature');
      this.contentTransferEncoding = '7bit';
      this.content = new MimeContent(arg);
      return;
    }
    super(arg);
  }

  /**
   * Dispatches to the visitor method for application/pgp-signature entities.
   *
   * @param visitor The visitor.
   */
  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('ApplicationPgpSignature');
    visitor.visitApplicationPgpSignature(this);
  }
}
