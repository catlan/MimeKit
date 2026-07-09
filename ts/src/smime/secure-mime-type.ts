// Port of MimeKit/Cryptography/SecureMimeType.cs.

/**
 * The type of S/MIME data that an application/pkcs7-mime part contains.
 */
export enum SecureMimeType {
  /** The S/MIME data type is unknown. */
  Unknown = -1,
  /** The S/MIME content is compressed. */
  CompressedData = 0,
  /** The S/MIME content is encrypted. */
  EnvelopedData = 1,
  /** The S/MIME content is signed. */
  SignedData = 2,
  /** The S/MIME content contains only certificates. */
  CertsOnly = 3,
  /** The S/MIME content is both signed and encrypted. */
  AuthEnvelopedData = 4,
}
