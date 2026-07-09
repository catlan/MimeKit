// Port of MimeKit/Cryptography/SubjectIdentifierType.cs.

/**
 * The method to use for identifying a certificate.
 */
export enum SubjectIdentifierType {
  /** The identifier type is unknown. */
  Unknown = 0,
  /** Identify the certificate by its Issuer and Serial Number properties. */
  IssuerAndSerialNumber = 1,
  /** Identify the certificate by the sha1 hash of its public key. */
  SubjectKeyIdentifier = 2,
}
