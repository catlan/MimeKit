// Port of MimeKit/Cryptography/SecureMimeDigitalSignature.cs.
//
// C# extracts the signing time, S/MIME capabilities, and digest algorithm from
// the CMS `SignerInformation.SignedAttributes` inside this constructor via
// BouncyCastle ASN.1. That extraction is DER parsing = crypto backend work, so
// the port models the CMS signer info as an injected {@link SignerInformation}
// seam whose concrete implementation (wave C2b) performs the parsing and the
// actual signature verification.

import type { DigestAlgorithm } from './digest-algorithm.js';
import type { EncryptionAlgorithm } from './encryption-algorithm.js';
import { PublicKeyAlgorithm } from './public-key-algorithm.js';
import type { IDigitalCertificate, IDigitalSignature } from './digital-signature.js';
import type { X509Certificate } from './x509-certificate.js';
import { SecureMimeDigitalCertificate } from './secure-mime-digital-certificate.js';
import { DigitalSignatureVerifyException } from './errors.js';

/**
 * The CMS signer information seam. C# uses BouncyCastle's `SignerInformation`;
 * the concrete implementation is supplied by the crypto backend (wave C2b) and
 * performs ASN.1 attribute extraction and the actual (async, WebCrypto)
 * signature verification.
 */
export interface SignerInformation {
  /** Verify the signature against the signer's certificate. */
  verify(certificate: X509Certificate): Promise<boolean>;
  /** The signing time from the signed attributes, if present. */
  getSigningTime(): Date | null;
  /** The S/MIME capabilities (encryption algorithms) from the signed attributes. */
  getSmimeCapabilities(): EncryptionAlgorithm[];
  /** The digest algorithm identified by the signer info. */
  getDigestAlgorithm(): DigestAlgorithm;
}

/**
 * An S/MIME digital signature.
 */
export class SecureMimeDigitalSignature implements IDigitalSignature {
  private vex: DigitalSignatureVerifyException | null = null;
  private valid: boolean | null = null;

  /** The CMS signer info. */
  readonly signerInfo: SignerInformation;

  /** The encryption algorithms (in preferential order) the signer's client supports. */
  readonly encryptionAlgorithms: EncryptionAlgorithm[];

  /** The certificate used by the signer. */
  readonly signerCertificate: IDigitalCertificate | null;

  /** The digest algorithm used for the signature. */
  readonly digestAlgorithm: DigestAlgorithm;

  /** The creation date of the digital signature (UTC). */
  readonly creationDate: Date;

  /**
   * The certificate chain. If building the chain failed, this is `null` and
   * {@link chainException} is set.
   */
  chain: unknown | null = null;

  /** The error that occurred, if any, while building the certificate chain. */
  chainException: Error | null = null;

  constructor(signerInfo: SignerInformation, certificate: X509Certificate | null) {
    if (signerInfo == null) throw new TypeError('signerInfo cannot be null or undefined');

    this.signerInfo = signerInfo;
    this.creationDate = signerInfo.getSigningTime() ?? new Date(0);
    this.encryptionAlgorithms = signerInfo.getSmimeCapabilities();
    this.digestAlgorithm = signerInfo.getDigestAlgorithm();
    this.signerCertificate = certificate != null ? new SecureMimeDigitalCertificate(certificate) : null;
  }

  /** The public key algorithm used for the signature. */
  get publicKeyAlgorithm(): PublicKeyAlgorithm {
    return this.signerCertificate != null ? this.signerCertificate.publicKeyAlgorithm : PublicKeyAlgorithm.None;
  }

  /**
   * Verify the digital signature.
   *
   * @param verifySignatureOnly When `true`, only the signature itself is
   *   verified; otherwise both the signature and the certificate chain are
   *   validated.
   * @throws {DigitalSignatureVerifyException} An error verifying the signature occurred.
   */
  async verify(verifySignatureOnly = false): Promise<boolean> {
    if (this.vex != null) throw this.vex;

    if (this.signerCertificate == null) {
      const message = 'Failed to verify digital signature: missing certificate.';
      this.vex = new DigitalSignatureVerifyException(message);
      throw this.vex;
    }

    if (this.valid == null) {
      try {
        const certificate = (this.signerCertificate as SecureMimeDigitalCertificate).certificate;
        this.valid = await this.signerInfo.verify(certificate);
      } catch (ex) {
        const message = `Failed to verify digital signature: ${(ex as Error)?.message ?? ex}`;
        this.vex = new DigitalSignatureVerifyException(message, ex);
        throw this.vex;
      }
    }

    if (!verifySignatureOnly && this.chainException != null) {
      const message = `Failed to verify digital signature chain: ${this.chainException.message}`;
      throw new DigitalSignatureVerifyException(message, this.chainException);
    }

    return this.valid;
  }
}
