// Port of MimeKit/Cryptography/OpenPgpDigitalSignature.cs — an OpenPGP signature
// result plus its resolved signer certificate.

import type { IDigitalSignature } from '../smime/digital-signature.js';
import { DigestAlgorithm } from '../smime/digest-algorithm.js';
import { PublicKeyAlgorithm } from '../smime/public-key-algorithm.js';
import type { OpenPgpVerification } from './engine.js';
import type { OpenPgpDigitalCertificate } from './openpgp-digital-certificate.js';

/** An OpenPGP digital signature. */
export class OpenPgpDigitalSignature implements IDigitalSignature {
  /** The resolved signer certificate, or `null` if the signing key is not in the keyring. */
  readonly signerCertificate: OpenPgpDigitalCertificate | null;
  /** The public key algorithm of the signer. */
  readonly publicKeyAlgorithm: PublicKeyAlgorithm;
  /** The digest algorithm used for the signature (when known). */
  readonly digestAlgorithm: DigestAlgorithm;
  /** The signature creation date. */
  readonly creationDate: Date;
  /** The hex key id of the signing key. */
  readonly keyId: string;

  private readonly valid: boolean;

  constructor(
    verification: OpenPgpVerification,
    signerCertificate: OpenPgpDigitalCertificate | null,
    digestAlgorithm: DigestAlgorithm = DigestAlgorithm.None,
  ) {
    this.keyId = verification.keyId;
    this.valid = verification.verified;
    this.creationDate = verification.created ?? new Date(0);
    this.signerCertificate = signerCertificate;
    this.publicKeyAlgorithm = signerCertificate?.publicKeyAlgorithm ?? PublicKeyAlgorithm.None;
    this.digestAlgorithm = digestAlgorithm;
  }

  /**
   * Verify the signature. OpenPGP trust/web-of-trust validation is not performed
   * (as with the S/MIME context's deferred chain validation); this reports the
   * cryptographic validity computed at decode time.
   *
   * @returns `true` if the signature is cryptographically valid.
   */
  async verify(_verifySignatureOnly = false): Promise<boolean> {
    return this.valid;
  }
}
