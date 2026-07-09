// Port of MimeKit/Cryptography/DigestAlgorithm.cs.
//
// Numeric enum with the exact C# integer values (they are used as OID map keys
// and in GetHashCode for the RSA padding value types).

/**
 * A digest (secure hashing) algorithm.
 */
export enum DigestAlgorithm {
  /** No digest algorithm specified. */
  None = 0,
  /** The MD5 digest algorithm. */
  MD5 = 1,
  /** The SHA-1 digest algorithm. */
  Sha1 = 2,
  /** The Ripe-MD/160 digest algorithm. */
  RipeMD160 = 3,
  /** The double-SHA digest algorithm. */
  DoubleSha = 4,
  /** The MD2 digest algorithm. */
  MD2 = 5,
  /** The TIGER/192 digest algorithm. */
  Tiger192 = 6,
  /** The HAVAL 5-pass 160-bit digest algorithm. */
  Haval5160 = 7,
  /** The SHA-256 digest algorithm. */
  Sha256 = 8,
  /** The SHA-384 digest algorithm. */
  Sha384 = 9,
  /** The SHA-512 digest algorithm. */
  Sha512 = 10,
  /** The SHA-224 digest algorithm. */
  Sha224 = 11,
  /** The MD4 digest algorithm. */
  MD4 = 301,
}

/**
 * Enumerate the defined {@link DigestAlgorithm} numeric values (the TS analogue
 * of C#'s `Enum.GetValues(typeof(DigestAlgorithm))`).
 */
export function digestAlgorithmValues(): DigestAlgorithm[] {
  return Object.values(DigestAlgorithm).filter(
    (v): v is DigestAlgorithm => typeof v === 'number',
  );
}
