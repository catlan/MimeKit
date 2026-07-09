import type { MimeEntity } from '../mime-entity.js';
import type { MimeMessage } from '../mime-message.js';

export interface ITnefPart {
  convertToMessage(): MimeMessage;
  extractAttachments(): Iterable<MimeEntity>;
}
