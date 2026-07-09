// Port of MimeKit/Cryptography/CmsRecipient.cs.
//
// The stream/file loading constructors parse a DER/PEM certificate and belong in
// the crypto backend (wave C2b); the value-type constructor (from a parsed
// {@link X509Certificate}) is fully portable. `CmsRecipientTests` is deferred to
// C2b because every case loads a real certificate.

import { SubjectIdentifierType } from './subject-identifier-type.js';
import type { EncryptionAlgorithm } from './encryption-algorithm.js';
import type { RsaEncryptionPadding } from './rsa-encryption-padding.js';
import type { MailboxAddress } from '../mailbox-address.js';
import type { X509Certificate } from './x509-certificate.js';

/**
 * An S/MIME recipient.
 */
export class CmsRecipient {
  /** The recipient's certificate, used for encrypting data. */
  readonly certificate: X509Certificate;

  /** The recipient identifier type. */
  readonly recipientIdentifierType: SubjectIdentifierType;

  /**
   * The known S/MIME encryption capabilities of the recipient's mail client, in
   * their preferred order. Initialized from the certificate's S/MIME capability
   * extension, or `[TripleDes]` if none.
   */
  encryptionAlgorithms: EncryptionAlgorithm[];

  /** The RSA key encryption padding, if the certificate's public key is RSA. */
  rsaEncryptionPadding: RsaEncryptionPadding | null = null;

  /** The mailbox address of the recipient, if available (internal). */
  mailbox: MailboxAddress | null = null;

  /**
   * Initialize a new recipient from a parsed certificate.
   *
   * @param certificate The recipient's certificate.
   * @param recipientIdentifierType The recipient identifier type.
   * @throws {TypeError} `certificate` is null or undefined.
   */
  constructor(
    certificate: X509Certificate,
    recipientIdentifierType: SubjectIdentifierType = SubjectIdentifierType.IssuerAndSerialNumber,
  ) {
    if (certificate == null) throw new TypeError('certificate cannot be null or undefined');

    this.recipientIdentifierType =
      recipientIdentifierType !== SubjectIdentifierType.SubjectKeyIdentifier
        ? SubjectIdentifierType.IssuerAndSerialNumber
        : SubjectIdentifierType.SubjectKeyIdentifier;

    this.encryptionAlgorithms = certificate.getEncryptionAlgorithms();
    this.certificate = certificate;
  }
}
