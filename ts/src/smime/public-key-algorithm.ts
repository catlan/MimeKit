// Port of MimeKit/Cryptography/PublicKeyAlgorithm.cs.

/**
 * An enumeration of public key algorithms.
 */
export enum PublicKeyAlgorithm {
  /** No public key algorithm specified. */
  None = 0,
  /** The RSA algorithm. */
  RsaGeneral = 1,
  /** The RSA encryption-only algorithm. */
  RsaEncrypt = 2,
  /** The RSA sign-only algorithm. */
  RsaSign = 3,
  /** The El-Gamal encryption-only algorithm. */
  ElGamalEncrypt = 16,
  /** The DSA algorithm. */
  Dsa = 17,
  /** The elliptic curve algorithm (aka EC or ECDH). */
  EllipticCurve = 18,
  /** The elliptic curve DSA algorithm (aka ECDSA). */
  EllipticCurveDsa = 19,
  /** The El-Gamal algorithm. */
  ElGamalGeneral = 20,
  /** The Diffie-Hellman algorithm. */
  DiffieHellman = 21,
  /** The Edwards-Curve DSA algorithm (aka EdDSA). */
  EdwardsCurveDsa = 22,
}
