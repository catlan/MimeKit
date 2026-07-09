// The X.509 crypto seam for the S/MIME foundation.
//
// C# MimeKit types these as BouncyCastle `Org.BouncyCastle.X509.X509Certificate`
// and `AsymmetricKeyParameter`. The portable foundation cannot parse DER or
// hold real key material — that is the concrete crypto backend's job (wave
// C2b, pkijs/asn1js/WebCrypto). So we define structural interfaces that carry
// exactly the accessors the portable value types (CmsSigner, CmsRecipient,
// SecureMimeDigitalCertificate, ...) call. C2b provides concrete
// implementations (e.g. a pkijs-Certificate-backed adapter); this file binds no
// crypto library.

import type { EncryptionAlgorithm } from './encryption-algorithm.js';
import type { PublicKeyAlgorithm } from './public-key-algorithm.js';
import type { X509KeyUsageFlags } from './x509-key-usage-flags.js';

/**
 * A parsed X.509 certificate.
 *
 * Mirrors the surface of BouncyCastle's `X509Certificate` that MimeKit's
 * portable code depends on. The concrete implementation is supplied by the
 * crypto backend (wave C2b).
 */
export interface X509Certificate {
  /** Gets the DER-encoded bytes of the certificate (C#: `GetEncoded()`). */
  getEncoded(): Uint8Array;

  /** Gets the SHA-1 fingerprint of the certificate (C#: `GetFingerprint()`). */
  getFingerprint(): string;

  /** Gets the public key algorithm (C#: `GetPublicKeyAlgorithm()`). */
  getPublicKeyAlgorithm(): PublicKeyAlgorithm;

  /**
   * Gets the X.509 key usage flags (C#: `GetKeyUsageFlags()`). Used to decide
   * whether the certificate can sign or encrypt.
   */
  getKeyUsageFlags(): X509KeyUsageFlags;

  /**
   * Gets the S/MIME encryption capabilities advertised by the certificate, or
   * a single-element `[TripleDes]` fallback (C#: `GetEncryptionAlgorithms()`).
   */
  getEncryptionAlgorithms(): EncryptionAlgorithm[];

  /** The `notBefore` validity date of the certificate. */
  getNotBefore(): Date;

  /** The `notAfter` validity date of the certificate. */
  getNotAfter(): Date;

  /** The subject email address, if any (C#: `GetSubjectEmailAddress(false)`). */
  getSubjectEmailAddress(): string | null;

  /** The subject DNS names (C#: `GetSubjectDnsNames(false)`). */
  getSubjectDnsNames(): string[];

  /** The subject common name (C#: `GetCommonName()`). */
  getCommonName(): string | null;

  /** Structural equality against another certificate (compares encoded bytes). */
  equals(other: X509Certificate): boolean;
}

/**
 * An asymmetric key (public or private), mirroring BouncyCastle's
 * `AsymmetricKeyParameter`. The concrete implementation is supplied by the
 * crypto backend (wave C2b).
 */
export interface AsymmetricKey {
  /** Whether this is a private key. */
  readonly isPrivate: boolean;
}
