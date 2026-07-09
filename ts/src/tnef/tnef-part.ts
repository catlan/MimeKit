import { ContentDisposition } from '../content-disposition.js';
import { HeaderId } from '../header-id.js';
import { FilteredStream } from '../io/filtered-stream.js';
import { BestEncodingFilter } from '../io/filters/best-encoding-filter.js';
import { MemoryStream } from '../io/stream.js';
import { MailboxAddress } from '../mailbox-address.js';
import { MimeContent } from '../mime-content.js';
import { MimeEntity, type MimeEntityConstructorArgs } from '../mime-entity.js';
import { MimeMessage } from '../mime-message.js';
import { MimePart } from '../mime-part.js';
import type { MimeVisitor } from '../mime-visitor.js';
import { MultipartAlternative } from '../multipart-alternative.js';
import { Multipart } from '../multipart.js';
import { TextPart } from '../text-part.js';
import { MessageImportance } from '../message-importance.js';
import { MessagePriority } from '../message-priority.js';
import { Header } from '../header.js';
import { createDateTimeOffset } from '../mime-message.js';
import { tryGetEncoding, utf8 } from '../utils/charset-utils.js';
import { HtmlTokenizer } from '../text/html-tokenizer.js';
import { HtmlAttributeId } from '../text/html-attribute-id.js';
import { HtmlTagId } from '../text/html-tag-id.js';
import { HtmlTagToken } from '../text/html-token.js';
import { RtfCompressedToRtf } from './rtf-compressed-to-rtf.js';
import { TnefAttachFlags } from './tnef-attach-flags.js';
import { TnefAttachMethod } from './tnef-attach-method.js';
import { TnefAttributeLevel } from './tnef-attribute-level.js';
import { TnefAttributeTag } from './tnef-attribute-tag.js';
import { TnefComplianceMode } from './tnef-compliance-mode.js';
import { TnefPropertyId } from './tnef-property-id.js';
import { TnefPropertyType } from './tnef-property-type.js';
import { TnefReader } from './tnef-reader.js';
import type { ITnefPart } from './itnef-part.js';

export class TnefPart extends MimePart implements ITnefPart {
  constructor();
  constructor(args: MimeEntityConstructorArgs);
  constructor(args?: MimeEntityConstructorArgs) {
    if (args !== undefined) {
      super(args);
    } else {
      super('application', 'ms-tnef');
      this.fileName = 'winmail.dat';
    }
  }

  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('TnefPart');
    const maybe = visitor as MimeVisitor & { visitTnefPart?: (part: TnefPart) => void };
    if (typeof maybe.visitTnefPart === 'function') maybe.visitTnefPart(this);
    else visitor.visitMimePart(this);
  }

  convertToMessage(): MimeMessage {
    this.checkDisposed('TnefPart');
    if (this.content === null) throw new TypeError('Cannot parse null TNEF data.');
    let codepage = 0;
    const charset = this.contentType.charset;
    if (charset) codepage = tryGetEncoding(charset)?.codePage ?? 0;
    const reader = new TnefReader(this.content.open(), codepage, TnefComplianceMode.Loose);
    return extractTnefMessage(reader);
  }

  *extractAttachments(): Iterable<MimeEntity> {
    const message = this.convertToMessage();
    const body = message.body;
    message.body = null;
    message.dispose();
    if (body instanceof Multipart) {
      if (body.count > 0 && body.at(0) instanceof MultipartAlternative) {
        const alternatives = body.at(0) as MultipartAlternative;
        for (const alternative of alternatives) yield alternative;
        alternatives.clear(false);
        body.removeAt(0);
      }
      for (const part of body) yield part;
      body.clear(false);
    } else if (body !== null) {
      yield body;
    }
  }
}

class EmailAddress {
  addrType = 'SMTP';
  searchKey: string | null = null;
  name: string | null = null;
  addr: string | null = null;

  tryGetMailboxAddress(): MailboxAddress | null {
    let addr = this.addr;
    if ((!addr || addr.length === 0) && this.searchKey && this.searchKey.toUpperCase().startsWith(`${this.addrType.toUpperCase()}:`))
      addr = this.searchKey.slice(this.addrType.length + 1);
    if (!addr) return null;
    const parsed = MailboxAddress.parse(addr);
    if (!parsed.ok) return null;
    parsed.value.name = this.name ?? '';
    return parsed.value;
  }
}

function extractRecipientTable(reader: TnefReader, message: MimeMessage): void {
  const prop = reader.tnefPropertyReader;
  while (prop.readNextRow()) {
    let transmitableDisplayName: string | null = null;
    let recipientDisplayName: string | null = null;
    let displayName = '';
    let list: typeof message.to | null = null;
    let addr: string | null = null;
    while (prop.readNextProperty()) {
      switch (prop.propertyTag.id) {
      case TnefPropertyId.RecipientType:
        switch (prop.readValueAsInt32()) {
        case 1: list = message.to; break;
        case 2: list = message.cc; break;
        case 3: list = message.bcc; break;
        }
        break;
      case TnefPropertyId.TransmitableDisplayName: transmitableDisplayName = prop.readValueAsString(); break;
      case TnefPropertyId.RecipientDisplayName: recipientDisplayName = prop.readValueAsString(); break;
      case TnefPropertyId.DisplayName: displayName = prop.readValueAsString(); break;
      case TnefPropertyId.EmailAddress: if (!addr) addr = prop.readValueAsString(); break;
      case TnefPropertyId.SmtpAddress: addr = prop.readValueAsString(); break;
      default: prop.readValue(); break;
      }
    }
    if (list && addr) list.add(new MailboxAddress(recipientDisplayName ?? transmitableDisplayName ?? displayName, addr));
  }
}

function extractMapiProperties(reader: TnefReader, message: MimeMessage, alternatives: MultipartAlternative): void {
  const prop = reader.tnefPropertyReader;
  const recipient = new EmailAddress();
  const sender = new EmailAddress();
  let normalizedSubject: string | null = null;
  let subjectPrefix: string | null = null;
  let msgid = false;
  while (prop.readNextProperty()) {
    switch (prop.propertyTag.id) {
    case TnefPropertyId.InternetMessageId:
      if (isTextish(prop.propertyTag.valueTnefType)) { message.messageId = stripAngles(prop.readValueAsString()); msgid = true; }
      break;
    case TnefPropertyId.TnefCorrelationKey:
      if (isTextish(prop.propertyTag.valueTnefType) && !msgid) {
        const value = prop.readValueAsString();
        if (value.length > 5 && value.startsWith('<') && value.endsWith('>') && value.includes('@')) message.messageId = stripAngles(value);
      }
      break;
    case TnefPropertyId.Subject: if (isTextish(prop.propertyTag.valueTnefType)) message.subject = prop.readValueAsString(); break;
    case TnefPropertyId.SubjectPrefix: if (isTextish(prop.propertyTag.valueTnefType)) subjectPrefix = prop.readValueAsString(); break;
    case TnefPropertyId.NormalizedSubject: if (isTextish(prop.propertyTag.valueTnefType)) normalizedSubject = prop.readValueAsString(); break;
    case TnefPropertyId.SenderName: if (isTextish(prop.propertyTag.valueTnefType)) sender.name = prop.readValueAsString(); break;
    case TnefPropertyId.SenderEmailAddress: if (isTextish(prop.propertyTag.valueTnefType)) sender.addr = prop.readValueAsString(); break;
    case TnefPropertyId.SenderSearchKey: if (isTextish(prop.propertyTag.valueTnefType)) sender.searchKey = prop.readValueAsString(); break;
    case TnefPropertyId.SenderAddrtype: if (isTextish(prop.propertyTag.valueTnefType)) sender.addrType = prop.readValueAsString(); break;
    case TnefPropertyId.ReceivedByName: if (isTextish(prop.propertyTag.valueTnefType)) recipient.name = prop.readValueAsString(); break;
    case TnefPropertyId.ReceivedByEmailAddress: if (isTextish(prop.propertyTag.valueTnefType)) recipient.addr = prop.readValueAsString(); break;
    case TnefPropertyId.ReceivedBySearchKey: if (isTextish(prop.propertyTag.valueTnefType)) recipient.searchKey = prop.readValueAsString(); break;
    case TnefPropertyId.ReceivedByAddrtype: if (isTextish(prop.propertyTag.valueTnefType)) recipient.addrType = prop.readValueAsString(); break;
    case TnefPropertyId.RtfCompressed:
      if (isTextish(prop.propertyTag.valueTnefType)) {
        const converter = new RtfCompressedToRtf();
        const content = new MemoryStream();
        const filtered = new FilteredStream(content);
        filtered.add(converter);
        prop.getRawValueReadStream().copyTo(filtered, 4096);
        filtered.flush();
        content.position = 0;
        const rtf = new TextPart('rtf');
        rtf.content = new MimeContent(content);
        alternatives.add(rtf);
      }
      break;
    case TnefPropertyId.BodyHtml:
      if (isTextish(prop.propertyTag.valueTnefType)) {
        const html = new TextPart('html');
        const raw = prop.propertyTag.valueTnefType === TnefPropertyType.Unicode ? null : prop.readValueAsBytes();
        if (raw) {
          const { charset } = decodeHtml(raw, reader.messageCodepage);
          html.contentType.charsetEncoding = charset;
          let length = raw.length;
          while (length > 0 && raw[length - 1] === 0) length--;
          html.content = new MimeContent(new MemoryStream(raw.subarray(0, length)));
        } else {
          html.setText(utf8, prop.readValueAsString());
        }
        alternatives.add(html);
      }
      break;
    case TnefPropertyId.Body:
      if (isTextish(prop.propertyTag.valueTnefType)) {
        const plain = new TextPart('plain');
        plain.setText(encodingForCodepage(reader.messageCodepage), prop.readValueAsString());
        alternatives.add(plain);
      }
      break;
    case TnefPropertyId.Importance:
      switch (prop.readValueAsInt32()) {
      case 2: message.importance = MessageImportance.High; break;
      case 1: message.importance = MessageImportance.Normal; break;
      case 0: message.importance = MessageImportance.Low; break;
      }
      break;
    case TnefPropertyId.Priority:
      switch (prop.readValueAsInt32()) {
      case 1: message.priority = MessagePriority.Urgent; break;
      case 0: message.priority = MessagePriority.Normal; break;
      case -1: message.priority = MessagePriority.NonUrgent; break;
      }
      break;
    case TnefPropertyId.Sensitivity:
      switch (prop.readValueAsInt32()) {
      case 1: message.headers.setValue(HeaderId.Sensitivity, 'Personal'); break;
      case 2: message.headers.setValue(HeaderId.Sensitivity, 'Private'); break;
      case 3: message.headers.setValue(HeaderId.Sensitivity, 'Company-Confidential'); break;
      case 0: message.headers.remove(HeaderId.Sensitivity); break;
      }
      break;
    default:
      break;
    }
  }
  if (!message.subject && normalizedSubject)
    message.subject = subjectPrefix ? subjectPrefix + normalizedSubject : normalizedSubject;
  const senderMailbox = sender.tryGetMailboxAddress();
  if (senderMailbox) message.from.add(senderMailbox);
  const recipientMailbox = recipient.tryGetMailboxAddress();
  if (recipientMailbox) message.to.add(recipientMailbox);
}

function extractAttachments(reader: TnefReader, attachments: Multipart): void {
  let attachMethod: number = TnefAttachMethod.ByValue;
  const filter = new BestEncodingFilter();
  const prop = reader.tnefPropertyReader;
  let attachment: MimePart | null = null;
  do {
    if (reader.attributeLevel !== TnefAttributeLevel.Attachment) break;
    switch (reader.attributeTag) {
    case TnefAttributeTag.AttachRenderData:
      attachMethod = TnefAttachMethod.ByValue;
      attachment = new MimePart();
      break;
    case TnefAttributeTag.Attachment:
      if (!attachment) break;
      let attachData: Uint8Array | null = null;
      while (prop.readNextProperty()) {
        switch (prop.propertyTag.id) {
        case TnefPropertyId.AttachLongFilename: attachment.fileName = prop.readValueAsString(); break;
        case TnefPropertyId.AttachFilename: if (!attachment.fileName) attachment.fileName = prop.readValueAsString(); else prop.readValue(); break;
        case TnefPropertyId.AttachContentLocation: attachment.contentLocation = prop.readValueAsUri(); break;
        case TnefPropertyId.AttachContentBase: attachment.contentBase = prop.readValueAsUri(); break;
        case TnefPropertyId.AttachContentId: attachment.contentId = stripAngles(prop.readValueAsString()); break;
        case TnefPropertyId.AttachDisposition: {
          const parsed = ContentDisposition.parse(prop.readValueAsString());
          if (parsed.ok) attachment.contentDisposition = parsed.value;
          break;
        }
        case TnefPropertyId.AttachData: attachData = prop.readValueAsBytes(); break;
        case TnefPropertyId.AttachMethod: attachMethod = prop.readValueAsInt32(); break;
        case TnefPropertyId.AttachMimeTag: {
          const [type, subtype] = prop.readValueAsString().split('/');
          if (type && subtype) { attachment.contentType.mediaType = type.trim(); attachment.contentType.mediaSubtype = subtype.trim(); }
          break;
        }
        case TnefPropertyId.AttachFlags:
          if ((prop.readValueAsInt32() & TnefAttachFlags.RenderedInBody) !== 0) {
            attachment.contentDisposition ??= new ContentDisposition(ContentDisposition.inline);
            attachment.contentDisposition.disposition = ContentDisposition.inline;
          }
          break;
        case TnefPropertyId.AttachSize:
          attachment.contentDisposition ??= new ContentDisposition();
          attachment.contentDisposition.size = prop.readValueAsInt64();
          break;
        case TnefPropertyId.DisplayName: attachment.contentType.name = prop.readValueAsString(); break;
        default: prop.readValue(); break;
        }
      }
      if (attachData) {
        let index = 0;
        let count = attachData.length;
        if (attachMethod === TnefAttachMethod.EmbeddedMessage) {
          attachment.contentTransferEncoding = 'base64';
          const tnef = promoteToTnefPart(attachment);
          attachment = tnef;
          index = 16;
          count = Math.max(0, count - 16);
        } else if (attachment.contentType.isMimeType('text', '*')) {
          filter.flush(attachData, index, count);
          attachment.contentTransferEncoding = filter.getBestEncoding('7bit');
          filter.reset();
        } else {
          attachment.contentTransferEncoding = 'base64';
        }
        attachment.content = new MimeContent(new MemoryStream(attachData.subarray(index, index + count)));
        attachments.add(attachment);
      }
      break;
    case TnefAttributeTag.AttachData:
      if (!attachment || attachMethod !== TnefAttachMethod.ByValue) break;
      {
        const attachData = prop.readValueAsBytes();
        if (attachment.contentType.isMimeType('text', '*')) {
          filter.flush(attachData, 0, attachData.length);
          attachment.contentTransferEncoding = filter.getBestEncoding('7bit');
          filter.reset();
        } else {
          attachment.contentTransferEncoding = 'base64';
        }
        attachment.content = new MimeContent(new MemoryStream(attachData));
      }
      attachments.add(attachment);
      break;
    case TnefAttributeTag.AttachCreateDate:
      attachment && ((attachment.contentDisposition ??= new ContentDisposition()).creationDate = dateToDto(prop.readValueAsDateTime()));
      break;
    case TnefAttributeTag.AttachModifyDate:
      attachment && ((attachment.contentDisposition ??= new ContentDisposition()).modificationDate = dateToDto(prop.readValueAsDateTime()));
      break;
    case TnefAttributeTag.AttachTitle:
      if (attachment && !attachment.fileName) attachment.fileName = prop.readValueAsString();
      break;
    default:
      prop.readValue();
      break;
    }
  } while (reader.readNextAttribute());
}

function extractTnefMessage(reader: TnefReader): MimeMessage {
  const alternatives = new MultipartAlternative();
  const message = new MimeMessage();
  let body: MimeEntity | null = null;
  message.headers.remove(HeaderId.Date);
  while (reader.readNextAttribute()) {
    if (reader.attributeLevel === TnefAttributeLevel.Attachment) break;
    const prop = reader.tnefPropertyReader;
    switch (reader.attributeTag) {
    case TnefAttributeTag.RecipientTable: extractRecipientTable(reader, message); break;
    case TnefAttributeTag.MapiProperties: extractMapiProperties(reader, message, alternatives); break;
    case TnefAttributeTag.DateSent: message.date = dateToDto(prop.readValueAsDateTime()); break;
    case TnefAttributeTag.Body: {
      const text = new TextPart('plain');
      text.text = prop.readValueAsString();
      body = text;
      break;
    }
    default:
      break;
    }
  }
  if (body) {
    if (alternatives.count > 0) {
      alternatives.add(body);
      body = alternatives;
    }
  } else if (alternatives.count === 1) {
    body = alternatives.at(0);
    alternatives.clear(false);
  } else if (alternatives.count > 1) {
    body = alternatives;
  }
  if (reader.attributeLevel === TnefAttributeLevel.Attachment) {
    const mixed = new Multipart('mixed');
    if (body) mixed.add(body);
    message.body = mixed;
    extractAttachments(reader, mixed);
    if (mixed.count === 1) {
      message.body = mixed.at(0);
      mixed.clear(false);
    }
  } else {
    message.body = body;
  }
  return message;
}

function promoteToTnefPart(part: MimePart): TnefPart {
  const tnef = new TnefPart();
  for (const parameter of part.contentType.parameters)
    tnef.contentType.parameters.set(parameter.name, parameter.value);
  tnef.contentDisposition = part.contentDisposition;
  tnef.contentTransferEncoding = part.contentTransferEncoding;
  return tnef;
}

function isTextish(type: number): boolean {
  return type === TnefPropertyType.String8 || type === TnefPropertyType.Unicode || type === TnefPropertyType.Binary;
}

function stripAngles(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1) : trimmed;
}

function encodingForCodepage(codepage: number) {
  return tryGetEncoding(String(codepage)) ?? tryGetEncoding(codepageName(codepage)) ?? tryGetEncoding('windows-1252')!;
}

function codepageName(codepage: number): string {
  if (codepage === 1252) return 'windows-1252';
  if (codepage === 65001) return 'utf-8';
  if (codepage === 28591) return 'iso-8859-1';
  if (codepage === 20866) return 'koi8-r';
  return `windows-${codepage}`;
}

function decodeHtml(raw: Uint8Array, codepage: number): { text: string; charset: ReturnType<typeof encodingForCodepage> } {
  let length = raw.length;
  while (length > 0 && raw[length - 1] === 0) length--;
  const initial = encodingForCodepage(codepage);
  const bytes = raw.subarray(0, length);
  const tokenizer = HtmlTokenizer.fromBytes(bytes, initial.webName, true);
  let charset = initial;
  let token;

  while ((token = tokenizer.readNextToken()) !== null) {
    if (!(token instanceof HtmlTagToken) || token.id !== HtmlTagId.Meta)
      continue;

    for (let i = 0; i < token.attributes.count; i++) {
      const attr = token.attributes.get(i);
      if (attr.id === HtmlAttributeId.Charset && attr.value) {
        charset = tryGetEncoding(attr.value) ?? charset;
        return { text: charset.decode(bytes), charset };
      }

      if (attr.id === HtmlAttributeId.Content && attr.value) {
        const match = /(?:^|;)\s*charset\s*=\s*([^;]+)/i.exec(attr.value);
        if (match) {
          charset = tryGetEncoding(match[1]!.trim().replace(/^["']|["']$/g, '')) ?? charset;
          return { text: charset.decode(bytes), charset };
        }
      }
    }
  }

  return { text: initial.decode(bytes), charset };
}

function dateToDto(date: Date) {
  return createDateTimeOffset(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    0,
  );
}
