// Port of MimeKit/Cryptography/RsaEncryptionPadding.cs.
//
// The ASN.1-producing members (`getAlgorithmIdentifier`,
// `getRsaesOaepParameters`) are implemented here in wave C2b-1. They build the
// RFC 8017 RSAES-OAEP `AlgorithmIdentifier` / `RsaesOaepParameters` structure
// that the CMS enveloped-data layer (wave C2b-2) will DER-encode. The structure
// is kept as plain value objects carrying OID strings — no crypto library is
// bound at this layer.

import { DigestAlgorithm } from './digest-algorithm.js';
import { RsaEncryptionPaddingScheme } from './rsa-encryption-padding-scheme.js';
import { NotSupportedError } from './errors.js';

// RFC 8017 / PKCS#1 OIDs.
const OID_RSAES_OAEP = '1.2.840.113549.1.1.7';
const OID_MGF1 = '1.2.840.113549.1.1.8';

// Digest OIDs (mirror SecureMimeContext.getDigestOid; duplicated here to keep
// this portable value type free of any dependency on the context layer).
const DIGEST_OIDS: Partial<Record<DigestAlgorithm, string>> = {
  [DigestAlgorithm.Sha1]: '1.3.14.3.2.26',
  [DigestAlgorithm.Sha256]: '2.16.840.1.101.3.4.2.1',
  [DigestAlgorithm.Sha384]: '2.16.840.1.101.3.4.2.2',
  [DigestAlgorithm.Sha512]: '2.16.840.1.101.3.4.2.3',
};

/**
 * A minimal X.509 `AlgorithmIdentifier` value object (OID + optional
 * parameters). The CMS layer serializes this to DER in wave C2b-2.
 */
export class AlgorithmIdentifier {
  constructor(
    readonly algorithm: string,
    readonly parameters: AlgorithmIdentifier | RsaesOaepParameters | null = null,
  ) {}
}

/** The RSAES-OAEP parameters structure (RFC 8017 A.2.1). */
export class RsaesOaepParameters {
  /** The OAEP hash algorithm. */
  readonly hashAlgorithm: AlgorithmIdentifier;
  /** The mask-generation function (MGF1 with the same hash). */
  readonly maskGenAlgorithm: AlgorithmIdentifier;

  constructor(hashOid: string) {
    this.hashAlgorithm = new AlgorithmIdentifier(hashOid);
    this.maskGenAlgorithm = new AlgorithmIdentifier(OID_MGF1, new AlgorithmIdentifier(hashOid));
  }
}

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
   * Get the RSAES-OAEP parameters for this padding (RFC 8017 A.2.1).
   *
   * @throws {NotSupportedError} The OAEP hash algorithm is not supported.
   */
  getRsaesOaepParameters(): RsaesOaepParameters {
    const oid = DIGEST_OIDS[this.oaepHashAlgorithm];
    if (oid === undefined)
      throw new NotSupportedError(
        `The ${DigestAlgorithm[this.oaepHashAlgorithm] ?? this.oaepHashAlgorithm} hash algorithm is not supported.`,
      );
    return new RsaesOaepParameters(oid);
  }

  /**
   * Get the {@link AlgorithmIdentifier} for this padding, or `null` for PKCS #1
   * v1.5 (which has no explicit algorithm identifier).
   */
  getAlgorithmIdentifier(): AlgorithmIdentifier | null {
    if (this.scheme === RsaEncryptionPaddingScheme.Pkcs1) return null;
    return new AlgorithmIdentifier(OID_RSAES_OAEP, this.getRsaesOaepParameters());
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
