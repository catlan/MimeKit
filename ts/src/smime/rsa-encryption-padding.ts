// Port of MimeKit/Cryptography/RsaEncryptionPadding.cs.
//
// The ASN.1-producing members (`GetAlgorithmIdentifier`,
// `GetRsaesOaepParameters`) are NOT ported here: they build BouncyCastle DER
// `AlgorithmIdentifier` / `RsaesOaepParameters` objects and belong with the
// concrete crypto backend (wave C2b). `RsaEncryptionPaddingTests
// .TestGetAlgorithmIdentifier` is deferred with them.

import { DigestAlgorithm } from './digest-algorithm.js';
import { RsaEncryptionPaddingScheme } from './rsa-encryption-padding-scheme.js';
import { NotSupportedError } from './errors.js';

/**
 * The RSA encryption padding schemes and parameters used by S/MIME (rfc8017).
 *
 * Immutable value type with a small set of interned static instances. Compare
 * with {@link RsaEncryptionPadding.equals} (C#'s `==` / `Equals`).
 */
export class RsaEncryptionPadding {
  /** The PKCS #1 v1.5 encryption padding. */
  static readonly Pkcs1 = new RsaEncryptionPadding(
    RsaEncryptionPaddingScheme.Pkcs1,
    DigestAlgorithm.None,
  );

  /** OAEP using the default (SHA-1) hash algorithm. */
  static readonly OaepSha1 = new RsaEncryptionPadding(
    RsaEncryptionPaddingScheme.Oaep,
    DigestAlgorithm.Sha1,
  );

  /** OAEP using the SHA-256 hash algorithm. */
  static readonly OaepSha256 = new RsaEncryptionPadding(
    RsaEncryptionPaddingScheme.Oaep,
    DigestAlgorithm.Sha256,
  );

  /** OAEP using the SHA-384 hash algorithm. */
  static readonly OaepSha384 = new RsaEncryptionPadding(
    RsaEncryptionPaddingScheme.Oaep,
    DigestAlgorithm.Sha384,
  );

  /** OAEP using the SHA-512 hash algorithm. */
  static readonly OaepSha512 = new RsaEncryptionPadding(
    RsaEncryptionPaddingScheme.Oaep,
    DigestAlgorithm.Sha512,
  );

  /** All public static padding instances (the TS analogue of C#'s reflection over static fields). */
  static readonly values: readonly RsaEncryptionPadding[] = [
    RsaEncryptionPadding.Pkcs1,
    RsaEncryptionPadding.OaepSha1,
    RsaEncryptionPadding.OaepSha256,
    RsaEncryptionPadding.OaepSha384,
    RsaEncryptionPadding.OaepSha512,
  ];

  /** The RSA encryption padding scheme. */
  readonly scheme: RsaEncryptionPaddingScheme;

  /** The hash algorithm used for RSAES-OAEP padding. */
  readonly oaepHashAlgorithm: DigestAlgorithm;

  private constructor(scheme: RsaEncryptionPaddingScheme, oaepHashAlgorithm: DigestAlgorithm) {
    this.scheme = scheme;
    this.oaepHashAlgorithm = oaepHashAlgorithm;
  }

  /** Determines whether the specified padding is equal to this one. */
  equals(other: RsaEncryptionPadding | null | undefined): boolean {
    if (other == null) return false;
    return other.scheme === this.scheme && other.oaepHashAlgorithm === this.oaepHashAlgorithm;
  }

  /** Returns a hash code for this instance (C#: `((hash << 5) + hash) ^ oaep`). */
  getHashCode(): number {
    const hash = this.scheme;
    return ((hash << 5) + hash) ^ this.oaepHashAlgorithm;
  }

  /** Returns a string representation (C#: `Pkcs1` or `Oaep{HashName}`). */
  toString(): string {
    if (this.scheme === RsaEncryptionPaddingScheme.Pkcs1) return 'Pkcs1';
    return 'Oaep' + DigestAlgorithm[this.oaepHashAlgorithm];
  }

  /**
   * Create a new {@link RsaEncryptionPadding} using OAEP and the specified hash
   * algorithm.
   *
   * @throws {NotSupportedError} The hash algorithm is not supported.
   */
  static createOaep(hashAlgorithm: DigestAlgorithm): RsaEncryptionPadding {
    switch (hashAlgorithm) {
      case DigestAlgorithm.Sha1: return RsaEncryptionPadding.OaepSha1;
      case DigestAlgorithm.Sha256: return RsaEncryptionPadding.OaepSha256;
      case DigestAlgorithm.Sha384: return RsaEncryptionPadding.OaepSha384;
      case DigestAlgorithm.Sha512: return RsaEncryptionPadding.OaepSha512;
      default:
        throw new NotSupportedError(
          `The ${DigestAlgorithm[hashAlgorithm] ?? hashAlgorithm} hash algorithm is not supported.`,
        );
    }
  }
}
