// S/MIME exception types (ports of the MimeKit.Cryptography exception classes).
//
// The S/MIME public API mirrors MimeKit's throwing surface (Sign/Verify/Encrypt
// throw on failure) rather than the parser's Result-union convention; the
// ported tests assert on these exact exception kinds. Programmer errors
// (null/invalid arguments — C#'s ArgumentNullException / ArgumentException
// family) throw native TypeError/RangeError as elsewhere in the port.

import type { MailboxAddress } from '../mailbox-address.js';
import type { CmsRecipient } from './cms-recipient.js';

/**
 * Thrown when an operation is requested that the S/MIME context or a value type
 * does not support (C#: `System.NotSupportedException`).
 */
export class NotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotSupportedError';
  }
}

/**
 * Thrown when a signed/encrypted MIME part is malformed (C#: `System.FormatException`).
 */
export class FormatException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatException';
  }
}

/**
 * Thrown when an error occurs while processing a CMS recipient
 * (C#: `CmsRecipientException`).
 */
export class CmsRecipientException extends Error {
  /** The recipient that caused the error. */
  readonly recipient: CmsRecipient;

  constructor(message: string, recipient: CmsRecipient, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'CmsRecipientException';
    if (recipient == null) throw new TypeError('recipient cannot be null or undefined');
    this.recipient = recipient;
  }

  /** The mailbox address associated with the recipient, if available. */
  get mailbox(): MailboxAddress | null {
    return this.recipient.mailbox;
  }
}

/**
 * Thrown when an error occurs while generating a CMS envelope
 * (C#: `CmsEnvelopeException`, which derives from BouncyCastle's `CmsException`;
 * the port has no CMS layer here, so it extends `Error`).
 */
export class CmsEnvelopeException extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'CmsEnvelopeException';
  }
}

/**
 * Thrown when a private key could not be found for a specified mailbox or key
 * id (C#: `PrivateKeyNotFoundException`).
 */
export class PrivateKeyNotFoundException extends Error {
  /** The key id that could not be found. */
  readonly keyId: string;

  constructor(keyOrMailbox: MailboxAddress | string | number, message: string) {
    super(message);
    this.name = 'PrivateKeyNotFoundException';
    if (keyOrMailbox == null)
      throw new TypeError('keyOrMailbox cannot be null or undefined');
    if (typeof keyOrMailbox === 'number')
      this.keyId = keyOrMailbox.toString(16).toUpperCase(); // C#: keyid.ToString("X")
    else if (typeof keyOrMailbox === 'string')
      this.keyId = keyOrMailbox;
    else
      this.keyId = keyOrMailbox.address;
  }
}

/**
 * Thrown when a certificate could not be found for a specified mailbox
 * (C#: `CertificateNotFoundException`).
 */
export class CertificateNotFoundException extends Error {
  /** The mailbox address that could not be resolved to a certificate. */
  readonly mailbox: MailboxAddress;

  constructor(mailbox: MailboxAddress, message: string) {
    super(message);
    this.name = 'CertificateNotFoundException';
    this.mailbox = mailbox;
  }
}

/**
 * Thrown when an error occurs in {@link IDigitalSignature.verify}
 * (C#: `DigitalSignatureVerifyException`).
 */
export class DigitalSignatureVerifyException extends Error {
  /** The key identifier, if available. */
  readonly keyId: number | null;

  constructor(message: string, cause?: unknown);
  constructor(keyId: number, message: string, cause?: unknown);
  constructor(a: string | number, b?: unknown, c?: unknown) {
    if (typeof a === 'number') {
      const message = b as string;
      const cause = c;
      super(message, cause !== undefined ? { cause } : undefined);
      this.keyId = a;
    } else {
      const message = a;
      const cause = b;
      super(message, cause !== undefined ? { cause } : undefined);
      this.keyId = null;
    }
    this.name = 'DigitalSignatureVerifyException';
  }
}
