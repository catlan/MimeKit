// Port of MimeKit/Cryptography/ApplicationPkcs7Signature.cs
// (+ IApplicationPkcs7Signature, which is an empty marker interface).

import { ContentDisposition } from '../content-disposition.js';
import { MimeContent } from '../mime-content.js';
import { MimePart } from '../mime-part.js';
import type { MimeEntityConstructorArgs } from '../mime-entity.js';
import type { MimeVisitor } from '../mime-visitor.js';
import { Stream } from '../io/stream.js';

/**
 * An S/MIME part with a Content-Type of application/pkcs7-signature.
 *
 * Contains detached PKCS#7 signature data and is typically a child of a
 * {@link MultipartSigned}. To verify, use the parent multipart/signed part's
 * verify methods.
 */
export class ApplicationPkcs7Signature extends MimePart {
  /**
   * @param arg The parser constructor args, or a content stream.
   */
  constructor(args: MimeEntityConstructorArgs);
  constructor(stream: Stream);
  constructor(arg: MimeEntityConstructorArgs | Stream) {
    if (arg instanceof Stream) {
      super('application', 'pkcs7-signature');
      this.contentDisposition = new ContentDisposition(ContentDisposition.attachment);
      this.contentTransferEncoding = 'base64';
      this.content = new MimeContent(arg);
      this.fileName = 'smime.p7s';
      return;
    }
    super(arg);
  }

  /**
   * Dispatches to the visitor method for application/pkcs7-signature entities.
   *
   * @param visitor The visitor.
   */
  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('ApplicationPkcs7Signature');
    visitor.visitApplicationPkcs7Signature(this);
  }
}
