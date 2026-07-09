// Port of MimeKit/Cryptography/RsaSignaturePaddingScheme.cs.

/**
 * The RSA signature padding schemes used by S/MIME (rfc8017).
 */
export enum RsaSignaturePaddingScheme {
  /** The PKCS #1 v1.5 signature padding scheme. */
  Pkcs1 = 0,
  /** The Probabilistic Signature Scheme (PSS). */
  Pss = 1,
}
