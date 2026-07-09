// Port of MimeKit/Cryptography/CmsSigner.cs.
//
// The PKCS#12 / PEM loading constructors (`CmsSigner(stream|fileName, password)`
// and `CmsSigner(X509Certificate2)`) parse key material and therefore live in
// the crypto backend (wave C2b): they are exposed here as the async
// {@link CmsSigner.load} seam, which delegates to an injectable
// {@link Pkcs12Loader}. The value-type constructor (certificate/chain + key) is
// fully portable. `CmsSignerTests` is deferred to C2b because every case loads a
// real certificate.

import { DigestAlgorithm } from './digest-algorithm.js';
import { SubjectIdentifierType } from './subject-identifier-type.js';
import { X509KeyUsageFlags } from './x509-key-usage-flags.js';
import type { RsaSignaturePadding } from './rsa-signature-padding.js';
import type { AsymmetricKey, X509Certificate } from './x509-certificate.js';
import { X509CertificateChain } from './x509-certificate-chain.js';

/** C#: BouncyCastleSecureMimeContext.CanSign(keyUsage). */
export function canSign(keyUsage: X509KeyUsageFlags): boolean {
  return keyUsage === 0 || (keyUsage & X509KeyUsageFlags.DigitalSignature) !== 0;
}

/**
 * A table of CMS attributes (BouncyCastle `AttributeTable` in C#). Modeled as an
 * opaque map here; the concrete crypto backend (C2b) populates DER attributes.
 */
export type AttributeTable = Map<string, unknown>;

/**
 * Loads a signer's certificate chain and private key from PKCS#12 data. Injected
 * by the crypto backend (wave C2b).
 */
export interface Pkcs12Loader {
  load(data: Uint8Array, password: string, signerIdentifierType: SubjectIdentifierType): Promise<{
    certificateChain: X509Certificate[];
    privateKey: AsymmetricKey;
  }>;
}

/**
 * An S/MIME signer.
 */
export class CmsSigner {
  /** The signer's certificate (the leaf of {@link certificateChain}). */
  readonly certificate: X509Certificate;

  /** The certificate chain, starting with the signer's certificate. */
  readonly certificateChain: X509CertificateChain;

  /** The signer's private key. */
  readonly privateKey: AsymmetricKey;

  /** The signer identifier type. */
  readonly signerIdentifierType: SubjectIdentifierType;

  /** The digest algorithm to use (default: SHA-256). */
  digestAlgorithm: DigestAlgorithm = DigestAlgorithm.Sha256;

  /** The RSA signature padding to use when the private key is an RSA key. */
  rsaSignaturePadding: RsaSignaturePadding | null = null;

  /** Attributes included in and covered by the signature. */
  signedAttributes: AttributeTable = new Map();

  /** Attributes included in transport but not covered by the signature. */
  unsignedAttributes: AttributeTable = new Map();

  /**
   * Initialize a new signer from a certificate (or certificate chain) and a
   * private key.
   *
   * @param certificateOrChain The signer's certificate, or the chain starting
   *   with the signer's certificate.
   * @param key The signer's private key.
   * @param signerIdentifierType The scheme used for identifying the signer certificate.
   * @throws {TypeError} A required argument is null, the chain is empty, the key
   *   is not private, or the certificate cannot be used for signing.
   */
  constructor(
    certificateOrChain: X509Certificate | Iterable<X509Certificate>,
    key: AsymmetricKey,
    signerIdentifierType: SubjectIdentifierType = SubjectIdentifierType.IssuerAndSerialNumber,
  ) {
    if (certificateOrChain == null)
      throw new TypeError('certificate/chain cannot be null or undefined');
    if (key == null) throw new TypeError('key cannot be null or undefined');
    if (!key.isPrivate) throw new TypeError('The key must be a private key.');

    this.certificateChain = new X509CertificateChain();

    if (isCertificate(certificateOrChain)) {
      CmsSigner.checkCertificateCanBeUsedForSigning(certificateOrChain);
      this.certificateChain.add(certificateOrChain);
      this.certificate = certificateOrChain;
    } else {
      for (const cert of certificateOrChain) this.certificateChain.add(cert);
      if (this.certificateChain.count === 0)
        throw new TypeError('The certificate chain was empty.');
      CmsSigner.checkCertificateCanBeUsedForSigning(this.certificateChain.get(0));
      this.certificate = this.certificateChain.get(0);
    }

    this.signerIdentifierType =
      signerIdentifierType !== SubjectIdentifierType.SubjectKeyIdentifier
        ? SubjectIdentifierType.IssuerAndSerialNumber
        : SubjectIdentifierType.SubjectKeyIdentifier;
    this.privateKey = key;
  }

  private static checkCertificateCanBeUsedForSigning(certificate: X509Certificate): void {
    if (!canSign(certificate.getKeyUsageFlags()))
      throw new TypeError('The certificate cannot be used for signing.');
  }

  /**
   * The injectable PKCS#12 loader (set by the crypto backend, wave C2b). Used by
   * {@link CmsSigner.load}.
   */
  static pkcs12Loader: Pkcs12Loader | null = null;

  /**
   * Load a signer from PKCS#12 data (C#: `CmsSigner(stream|fileName, password)`).
   * Requires {@link CmsSigner.pkcs12Loader} to be set by the crypto backend.
   */
  static async load(
    data: Uint8Array,
    password: string,
    signerIdentifierType: SubjectIdentifierType = SubjectIdentifierType.IssuerAndSerialNumber,
  ): Promise<CmsSigner> {
    if (data == null) throw new TypeError('data cannot be null or undefined');
    if (password == null) throw new TypeError('password cannot be null or undefined');
    if (CmsSigner.pkcs12Loader == null)
      throw new Error('No PKCS#12 loader is configured (requires the S/MIME crypto backend).');
    const { certificateChain, privateKey } = await CmsSigner.pkcs12Loader.load(
      data,
      password,
      signerIdentifierType,
    );
    return new CmsSigner(certificateChain, privateKey, signerIdentifierType);
  }
}

function isCertificate(value: X509Certificate | Iterable<X509Certificate>): value is X509Certificate {
  return typeof (value as X509Certificate).getEncoded === 'function';
}
