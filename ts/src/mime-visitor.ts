import { MessageDeliveryStatus } from './message-delivery-status.js';
import { MessageDispositionNotification } from './message-disposition-notification.js';
import { MessageFeedbackReport } from './message-feedback-report.js';
import { MessagePartial } from './message-partial.js';
import { MessagePart } from './message-part.js';
import type { MimeMessage } from './mime-message.js';
import { MimeEntity } from './mime-entity.js';
import { MimePart } from './mime-part.js';
import { MultipartAlternative } from './multipart-alternative.js';
import { MultipartRelated } from './multipart-related.js';
import { MultipartReport } from './multipart-report.js';
import { Multipart } from './multipart.js';
import { TextPart } from './text-part.js';
import { TextRfc822Headers } from './text-rfc822-headers.js';
import { TnefPart } from './tnef/tnef-part.js';

/**
 * Base visitor for traversing MIME messages and entities.
 */
export class MimeVisitor {
  /**
   * Visits a MIME entity and dispatches to the most specific visit method.
   *
   * @param entity The MIME entity.
   * @throws {TypeError} `entity` is null or undefined.
   */
  visit(entity: MimeEntity): void {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    if (entity instanceof TextRfc822Headers) return this.visitTextRfc822Headers(entity);
    if (entity instanceof MessageDeliveryStatus) return this.visitMessageDeliveryStatus(entity);
    if (entity instanceof MessageDispositionNotification) return this.visitMessageDispositionNotification(entity);
    if (entity instanceof MessageFeedbackReport) return this.visitMessageFeedbackReport(entity);
    if (entity instanceof MessagePartial) return this.visitMessagePartial(entity);
    if (entity instanceof MessagePart) return this.visitMessagePart(entity);
    if (entity instanceof MultipartAlternative) return this.visitMultipartAlternative(entity);
    if (entity instanceof MultipartRelated) return this.visitMultipartRelated(entity);
    if (entity instanceof MultipartReport) return this.visitMultipartReport(entity);
    if (entity instanceof Multipart) return this.visitMultipart(entity);
    if (entity instanceof TnefPart) return this.visitTnefPart(entity);
    if (entity instanceof TextPart) return this.visitTextPart(entity);
    if (entity instanceof MimePart) return this.visitMimePart(entity);
    this.visitMimeEntity(entity);
  }

  /** Visits the abstract MIME entity. */
  visitMimeEntity(_entity: MimeEntity): void {}
  /** Visits a MIME part entity. */
  visitMimePart(entity: MimePart): void { this.visitMimeEntity(entity); }
  /** Visits a text-based MIME part entity. */
  visitTextPart(entity: TextPart): void { this.visitMimePart(entity); }
  /** Visits a TNEF MIME part entity. */
  visitTnefPart(entity: TnefPart): void { this.visitMimePart(entity); }
  /** Visits the children of a multipart entity. */
  visitChildren(multipart: Multipart): void {
    for (const child of multipart)
      this.visit(child);
  }
  /** Visits a multipart MIME entity. */
  visitMultipart(entity: Multipart): void {
    this.visitMimeEntity(entity);
    this.visitChildren(entity);
  }
  /** Visits a `multipart/alternative` MIME entity. */
  visitMultipartAlternative(entity: MultipartAlternative): void { this.visitMultipart(entity); }
  /** Visits a `multipart/related` MIME entity. */
  visitMultipartRelated(entity: MultipartRelated): void { this.visitMultipart(entity); }
  /** Visits a `multipart/report` MIME entity. */
  visitMultipartReport(entity: MultipartReport): void { this.visitMultipart(entity); }
  /** Visits the message contained by a message part. */
  visitMessage(entity: MessagePart): void {
    entity.message?.accept(this);
  }
  /** Visits a `message/rfc822` or `message/news` MIME entity. */
  visitMessagePart(entity: MessagePart): void {
    this.visitMimeEntity(entity);
    this.visitMessage(entity);
  }
  /** Visits the body of a MIME message. */
  visitBody(message: MimeMessage): void {
    message.body?.accept(this);
  }
  /** Visits a MIME message. */
  visitMimeMessage(message: MimeMessage): void {
    this.visitBody(message);
  }
  /** Visits a `message/partial` MIME entity. */
  visitMessagePartial(entity: MessagePartial): void { this.visitMimePart(entity); }
  /** Visits a `message/delivery-status` MIME entity. */
  visitMessageDeliveryStatus(entity: MessageDeliveryStatus): void { this.visitMimePart(entity); }
  /** Visits a `message/disposition-notification` MIME entity. */
  visitMessageDispositionNotification(entity: MessageDispositionNotification): void { this.visitMimePart(entity); }
  /** Visits a `message/feedback-report` MIME entity. */
  visitMessageFeedbackReport(entity: MessageFeedbackReport): void { this.visitMimePart(entity); }
  /** Visits a `text/rfc822-headers` MIME entity. */
  visitTextRfc822Headers(entity: TextRfc822Headers): void { this.visitMessagePart(entity); }

  /**
   * Visits an `application/pkcs7-mime` MIME entity.
   *
   * The concrete `ApplicationPkcs7Mime` type lives in the optional S/MIME
   * subsystem (crypto-free core), so this dispatch is typed structurally and
   * degrades to {@link visitMimePart}.
   */
  visitApplicationPkcs7Mime(entity: MimePart): void { this.visitMimePart(entity); }
  /** Visits an `application/pkcs7-signature` MIME entity. */
  visitApplicationPkcs7Signature(entity: MimePart): void { this.visitMimePart(entity); }
  /** Visits a `multipart/signed` MIME entity. */
  visitMultipartSigned(entity: Multipart): void { this.visitMultipart(entity); }
  /** Visits an `application/pgp-encrypted` MIME entity. */
  visitApplicationPgpEncrypted(entity: MimePart): void { this.visitMimePart(entity); }
  /** Visits an `application/pgp-signature` MIME entity. */
  visitApplicationPgpSignature(entity: MimePart): void { this.visitMimePart(entity); }
  /** Visits a `multipart/encrypted` MIME entity. */
  visitMultipartEncrypted(entity: Multipart): void { this.visitMultipart(entity); }
}
