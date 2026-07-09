// Port of MimeKit/Cryptography/RsaEncryptionPaddingScheme.cs.

/**
 * The RSA encryption padding schemes used by S/MIME (rfc8017).
 */
export enum RsaEncryptionPaddingScheme {
  /** The PKCS #1 v1.5 encryption padding scheme. */
  Pkcs1 = 0,
  /** The Optimal Asymmetric Encryption Padding (OAEP) scheme. */
  Oaep = 1,
}
