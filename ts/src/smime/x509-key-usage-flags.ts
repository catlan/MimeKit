// Port of MimeKit/Cryptography/X509KeyUsageFlags.cs.

/**
 * X.509 key usage flags ([Flags] enum). Used to determine what operations a
 * certificate can be used for. A value of {@link X509KeyUsageFlags.None}
 * indicates that there are no restrictions.
 */
export enum X509KeyUsageFlags {
  /** No limitations for the key usage are set. */
  None = 0,
  /** The key may only be used for enciphering data during key agreement. */
  EncipherOnly = 1 << 0,
  /** The key may be used for verifying signatures on CRLs. */
  CrlSign = 1 << 1,
  /** The key may be used for verifying signatures on certificates. */
  KeyCertSign = 1 << 2,
  /** The key is meant to be used for key agreement. */
  KeyAgreement = 1 << 3,
  /** The key may be used for data encipherment. */
  DataEncipherment = 1 << 4,
  /** The key is meant to be used for key encipherment. */
  KeyEncipherment = 1 << 5,
  /** The key may be used to provide a non-repudiation service. */
  NonRepudiation = 1 << 6,
  /** The key may be used for digitally signing data. */
  DigitalSignature = 1 << 7,
  /** The key may only be used for deciphering data during key agreement. */
  DecipherOnly = 1 << 15,
}

/**
 * X.509 key usage bits. Similar to {@link X509KeyUsageFlags} but each value
 * represents a position in a bit array.
 */
export enum X509KeyUsageBits {
  /** The key may be used for digitally signing data. */
  DigitalSignature = 0,
  /** The key may be used to provide a non-repudiation service. */
  NonRepudiation = 1,
  /** The key is meant to be used for key encipherment. */
  KeyEncipherment = 2,
  /** The key may be used for data encipherment. */
  DataEncipherment = 3,
  /** The key is meant to be used for key agreement. */
  KeyAgreement = 4,
  /** The key may be used for verifying signatures on certificates. */
  KeyCertSign = 5,
  /** The key may be used for verifying signatures on CRLs. */
  CrlSign = 6,
  /** The key may only be used for enciphering data during key agreement. */
  EncipherOnly = 7,
  /** The key may only be used for deciphering data during key agreement. */
  DecipherOnly = 8,
}
