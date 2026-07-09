import type { MimeEntity } from '../mime-entity.js';
import type { MimeMessage } from '../mime-message.js';

/**
 * An interface for a MIME part containing Microsoft TNEF data.
 *
 * Represents an `application/ms-tnef` or `application/vnd.ms-tnef` part. TNEF
 * (Transport Neutral Encapsulation Format) attachments are most often sent by
 * Microsoft Outlook clients.
 */
export interface ITnefPart {
  /**
   * Convert the TNEF content into a {@link MimeMessage}.
   *
   * TNEF data often contains properties that map to {@link MimeMessage} headers
   * and file attachments that are mapped to MIME parts.
   *
   * @returns a message representing the TNEF data in MIME format.
   */
  convertToMessage(): MimeMessage;
  /**
   * Extract the embedded attachments from the TNEF data.
   *
   * Parses the TNEF data and extracts all embedded file attachments.
   *
   * @returns the attachments.
   */
  extractAttachments(): Iterable<MimeEntity>;
}
