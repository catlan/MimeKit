import { MessageDeliveryStatus } from './message-delivery-status.js';
import { MessageDispositionNotification } from './message-disposition-notification.js';
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

export class MimeVisitor {
  visit(entity: MimeEntity): void {
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    if (entity instanceof TextRfc822Headers) return this.visitTextRfc822Headers(entity);
    if (entity instanceof MessageDeliveryStatus) return this.visitMessageDeliveryStatus(entity);
    if (entity instanceof MessageDispositionNotification) return this.visitMessageDispositionNotification(entity);
    if (entity instanceof MessagePartial) return this.visitMessagePartial(entity);
    if (entity instanceof MessagePart) return this.visitMessagePart(entity);
    if (entity instanceof MultipartAlternative) return this.visitMultipartAlternative(entity);
    if (entity instanceof MultipartRelated) return this.visitMultipartRelated(entity);
    if (entity instanceof MultipartReport) return this.visitMultipartReport(entity);
    if (entity instanceof Multipart) return this.visitMultipart(entity);
    if (entity instanceof TextPart) return this.visitTextPart(entity);
    if (entity instanceof MimePart) return this.visitMimePart(entity);
    this.visitMimeEntity(entity);
  }

  visitMimeEntity(_entity: MimeEntity): void {}
  visitMimePart(entity: MimePart): void { this.visitMimeEntity(entity); }
  visitTextPart(entity: TextPart): void { this.visitMimePart(entity); }
  visitChildren(multipart: Multipart): void {
    for (const child of multipart)
      this.visit(child);
  }
  visitMultipart(entity: Multipart): void {
    this.visitMimeEntity(entity);
    this.visitChildren(entity);
  }
  visitMultipartAlternative(entity: MultipartAlternative): void { this.visitMultipart(entity); }
  visitMultipartRelated(entity: MultipartRelated): void { this.visitMultipart(entity); }
  visitMultipartReport(entity: MultipartReport): void { this.visitMultipart(entity); }
  visitMessage(entity: MessagePart): void {
    entity.message?.accept(this);
  }
  visitMessagePart(entity: MessagePart): void {
    this.visitMimeEntity(entity);
    this.visitMessage(entity);
  }
  visitBody(message: MimeMessage): void {
    message.body?.accept(this);
  }
  visitMimeMessage(message: MimeMessage): void {
    this.visitBody(message);
  }
  visitMessagePartial(entity: MessagePartial): void { this.visitMimePart(entity); }
  visitMessageDeliveryStatus(entity: MessageDeliveryStatus): void { this.visitMimePart(entity); }
  visitMessageDispositionNotification(entity: MessageDispositionNotification): void { this.visitMimePart(entity); }
  visitTextRfc822Headers(entity: TextRfc822Headers): void { this.visitMessagePart(entity); }
}
