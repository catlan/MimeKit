// Port of MimeKit/Cryptography/OpenPgpDigitalCertificate.cs — a read-only view over
// an OpenPGP public key.

import type { IDigitalCertificate } from '../smime/digital-signature.js';
import { PublicKeyAlgorithm } from '../smime/public-key-algorithm.js';
import type { OpenPgpPublicKey } from './engine.js';

/** Split an OpenPGP user id ("Name <email>") into its name and email parts. */
export function parseUserId(userId: string): { name: string | null; email: string | null } {
  const match = /^\s*(.*?)\s*<([^>]*)>\s*$/.exec(userId);
  if (match) return { name: match[1]! || null, email: match[2]! || null };
  // No angle-bracket form: treat a bare address-looking id as the email, else the name.
  return userId.includes('@') ? { name: null, email: userId.trim() || null } : { name: userId.trim() || null, email: null };
}

function mapPublicKeyAlgorithm(algorithm: string): PublicKeyAlgorithm {
  switch (algorithm) {
    case 'rsaEncryptSign':
    case 'rsaEncrypt':
    case 'rsaSign':
      return PublicKeyAlgorithm.RsaGeneral;
    case 'dsa':
      return PublicKeyAlgorithm.Dsa;
    case 'elgamal':
      return PublicKeyAlgorithm.ElGamalGeneral;
    case 'ecdsa':
    case 'eddsa':
    case 'eddsaLegacy':
      return PublicKeyAlgorithm.EllipticCurve;
    case 'ecdh':
      return PublicKeyAlgorithm.EllipticCurve;
    default:
      return PublicKeyAlgorithm.None;
  }
}

/**
 * An OpenPGP digital certificate — a thin, read-only view over an OpenPGP public key.
 */
export class OpenPgpDigitalCertificate implements IDigitalCertificate {
  /** The underlying OpenPGP public key. */
  readonly publicKey: OpenPgpPublicKey;
  /** The public key algorithm. */
  readonly publicKeyAlgorithm: PublicKeyAlgorithm;
  /** The 40-character lowercase-hex key fingerprint. */
  readonly fingerprint: string;
  /** The hex key id. */
  readonly keyId: string;

  /** The expiration date of the certificate (`8640000000000000` = never). */
  readonly expirationDate: Date;

  private readonly primaryUserId: string | null;

  constructor(publicKey: OpenPgpPublicKey, expirationDate: Date) {
    if (publicKey == null) throw new TypeError('publicKey cannot be null or undefined');
    this.publicKey = publicKey;
    this.fingerprint = publicKey.getFingerprint();
    this.keyId = publicKey.getKeyID().toHex();
    this.publicKeyAlgorithm = mapPublicKeyAlgorithm(publicKey.getAlgorithmInfo().algorithm);
    this.primaryUserId = publicKey.getUserIDs()[0] ?? null;
    this.expirationDate = expirationDate;
  }

  /**
   * Create a certificate view over an OpenPGP public key, resolving its (async)
   * expiration time.
   */
  static async create(publicKey: OpenPgpPublicKey): Promise<OpenPgpDigitalCertificate> {
    let expiration: Date;
    try {
      const value = await publicKey.getExpirationTime();
      expiration = value instanceof Date ? value : new Date(8640000000000000);
    } catch {
      expiration = new Date(8640000000000000);
    }
    return new OpenPgpDigitalCertificate(publicKey, expiration);
  }

  /** The date the certificate (key) was created. */
  get creationDate(): Date {
    return this.publicKey.getCreationTime();
  }

  /** The email address of the key's primary user id. */
  get email(): string | null {
    return this.primaryUserId != null ? parseUserId(this.primaryUserId).email : null;
  }

  /** The name of the key's primary user id. */
  get name(): string | null {
    return this.primaryUserId != null ? parseUserId(this.primaryUserId).name : null;
  }
}
