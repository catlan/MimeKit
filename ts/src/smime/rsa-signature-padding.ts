// Port of MimeKit/Cryptography/RsaSignaturePadding.cs.

import { RsaSignaturePaddingScheme } from './rsa-signature-padding-scheme.js';

/**
 * The RSA signature padding schemes and parameters used by S/MIME (rfc8017).
 *
 * Immutable value type with a small set of interned static instances. Compare
 * with {@link RsaSignaturePadding.equals} (C#'s `==` / `Equals`).
 */
export class RsaSignaturePadding {
  /** The PKCS #1 v1.5 signature padding. */
  static readonly Pkcs1 = new RsaSignaturePadding(RsaSignaturePaddingScheme.Pkcs1);

  /** The Probabilistic Signature Scheme (PSS) padding. */
  static readonly Pss = new RsaSignaturePadding(RsaSignaturePaddingScheme.Pss);

  /** All public static padding instances (the TS analogue of C#'s reflection over static fields). */
  static readonly values: readonly RsaSignaturePadding[] = [
    RsaSignaturePadding.Pkcs1,
    RsaSignaturePadding.Pss,
  ];

  /** The RSA signature padding scheme. */
  readonly scheme: RsaSignaturePaddingScheme;

  private constructor(scheme: RsaSignaturePaddingScheme) {
    this.scheme = scheme;
  }

  /** Determines whether the specified padding is equal to this one. */
  equals(other: RsaSignaturePadding | null | undefined): boolean {
    if (other == null) return false;
    return other.scheme === this.scheme;
  }

  /** Returns a hash code for this instance (C#: `Scheme.GetHashCode()`). */
  getHashCode(): number {
    return this.scheme;
  }

  /** Returns a string representation (C#: `ToString()`). */
  toString(): string {
    return this.scheme === RsaSignaturePaddingScheme.Pkcs1 ? 'Pkcs1' : 'Pss';
  }
}
