// Port of MimeKit/BodyBuilder.cs.
//
// Builds a MIME body tree from a plain-text body, an HTML body, linked
// resources, and attachments, following C#'s exact nesting rules.
import { AttachmentCollection } from './attachment-collection.js';
import { MimeEntity } from './mime-entity.js';
import { Multipart } from './multipart.js';
import { MultipartAlternative } from './multipart-alternative.js';
import { MultipartRelated } from './multipart-related.js';
import { TextPart } from './text-part.js';
import { utf8, type CharsetEncoding } from './utils/charset-utils.js';

export class BodyBuilder {
  readonly attachments = new AttachmentCollection();
  readonly linkedResources = new AttachmentCollection(true);
  textBody: string | null = null;
  htmlBody: string | null = null;

  private bodyEncodingValue: CharsetEncoding = utf8;

  get bodyEncoding(): CharsetEncoding {
    return this.bodyEncodingValue;
  }

  set bodyEncoding(value: CharsetEncoding) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    this.bodyEncodingValue = value;
  }

  toMessageBody(): MimeEntity {
    let alternative: MultipartAlternative | null = null;
    let body: MimeEntity | null = null;

    if (this.textBody != null) {
      const text = new TextPart('plain');
      text.setText(this.bodyEncodingValue, this.textBody);

      if (this.htmlBody != null) {
        alternative = new MultipartAlternative();
        alternative.add(text);
        body = alternative;
      } else {
        body = text;
      }
    }

    if (this.htmlBody != null) {
      const text = new TextPart('html');
      let html: MimeEntity;

      text.setText(this.bodyEncodingValue, this.htmlBody);

      if (this.linkedResources.count > 0) {
        const related = new MultipartRelated();
        related.root = text;

        for (const resource of this.linkedResources)
          related.add(resource);

        html = related;
      } else {
        html = text;
      }

      if (alternative != null)
        alternative.add(html);
      else
        body = html;
    }

    if (this.attachments.count > 0) {
      if (body == null && this.attachments.count === 1)
        return this.attachments.at(0);

      const mixed = new Multipart('mixed');

      if (body != null)
        mixed.add(body);

      for (const attachment of this.attachments)
        mixed.add(attachment);

      body = mixed;
    }

    if (body == null) {
      const text = new TextPart('plain');
      text.setText(this.bodyEncodingValue, '');
      body = text;
    }

    return body;
  }
}
