// Port of MimeKit/Cryptography/SecureMimeDigitalCertificate.cs.

import type { IDigitalCertificate } from './digital-signature.js';
import type { PublicKeyAlgorithm } from './public-key-algorithm.js';
import type { X509Certificate } from './x509-certificate.js';

/**
 * An S/MIME digital certificate — a thin, read-only view over an
 * {@link X509Certificate}.
 */
export class SecureMimeDigitalCertificate implements IDigitalCertificate {
  /** The underlying X.509 certificate. */
  readonly certificate: X509Certificate;

  /** The public key algorithm supported by the certificate. */
  readonly publicKeyAlgorithm: PublicKeyAlgorithm;

  /** The fingerprint of the certificate. */
  readonly fingerprint: string;

  constructor(certificate: X509Certificate) {
    if (certificate == null) throw new TypeError('certificate cannot be null or undefined');
    this.certificate = certificate;
    this.fingerprint = certificate.getFingerprint();
    this.publicKeyAlgorithm = certificate.getPublicKeyAlgorithm();
  }

  /** The date the certificate was created (UTC). */
  get creationDate(): Date {
    return this.certificate.getNotBefore();
  }

  /** The expiration date of the certificate (UTC). */
  get expirationDate(): Date {
    return this.certificate.getNotAfter();
  }

  /** The email address of the owner of the certificate. */
  get email(): string | null {
    return this.certificate.getSubjectEmailAddress();
  }

  /** The DNS names of the owner of the certificate. */
  get dnsNames(): string[] {
    return this.certificate.getSubjectDnsNames();
  }

  /** The common name of the owner of the certificate. */
  get name(): string | null {
    return this.certificate.getCommonName();
  }
}
