// Ports of MimeKit/Cryptography/IDigitalSignature.cs + IDigitalCertificate.cs.
//
// C#'s `IDigitalSignature.Verify` is synchronous; in the port the underlying
// CMS verification runs on WebCrypto (async, wave C2b), so `verify` returns a
// Promise. This is the one deliberate shape change from the C# interface.

import type { DigestAlgorithm } from './digest-algorithm.js';
import type { PublicKeyAlgorithm } from './public-key-algorithm.js';

/**
 * An interface for a digital certificate.
 */
export interface IDigitalCertificate {
  /** The public key algorithm supported by the certificate. */
  readonly publicKeyAlgorithm: PublicKeyAlgorithm;
  /** The date the certificate was created. */
  readonly creationDate: Date;
  /** The expiration date of the certificate. */
  readonly expirationDate: Date;
  /** The fingerprint of the certificate. */
  readonly fingerprint: string;
  /** The email address of the owner of the certificate. */
  readonly email: string | null;
  /** The name of the owner of the certificate. */
  readonly name: string | null;
}

/**
 * An interface for a digital signature.
 */
export interface IDigitalSignature {
  /** The certificate used by the signer. */
  readonly signerCertificate: IDigitalCertificate | null;
  /** The public key algorithm used for the signature. */
  readonly publicKeyAlgorithm: PublicKeyAlgorithm;
  /** The digest algorithm used for the signature. */
  readonly digestAlgorithm: DigestAlgorithm;
  /** The creation date of the digital signature. */
  readonly creationDate: Date;

  /**
   * Verify the digital signature.
   *
   * @param verifySignatureOnly When `true`, only the signature itself is
   *   verified; otherwise both the signature and the certificate chain are
   *   validated.
   * @returns `true` if the signature is valid.
   * @throws {DigitalSignatureVerifyException} An error verifying the signature occurred.
   */
  verify(verifySignatureOnly?: boolean): Promise<boolean>;
}
