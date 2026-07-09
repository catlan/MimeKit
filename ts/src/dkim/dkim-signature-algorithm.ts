// Port of MimeKit/Cryptography/DkimSignatureAlgorithm.cs.

/**
 * A DKIM signature algorithm.
 */
export enum DkimSignatureAlgorithm {
  /** The RSA-SHA1 signature algorithm. */
  RsaSha1 = 'RsaSha1',

  /** The RSA-SHA256 signature algorithm. */
  RsaSha256 = 'RsaSha256',

  /** The Ed25519-SHA256 signature algorithm. */
  Ed25519Sha256 = 'Ed25519Sha256',
}

/**
 * The ordinal used by the enabled-algorithm bitmask (mirrors the C# enum's
 * integer value: `enabledSignatureAlgorithms |= 1 << (int) algorithm`).
 */
export function signatureAlgorithmOrdinal(algorithm: DkimSignatureAlgorithm): number {
  switch (algorithm) {
  case DkimSignatureAlgorithm.RsaSha1: return 0;
  case DkimSignatureAlgorithm.RsaSha256: return 1;
  case DkimSignatureAlgorithm.Ed25519Sha256: return 2;
  }
}

/** The DKIM `a=` tag value for a signature algorithm. */
export function signatureAlgorithmTag(algorithm: DkimSignatureAlgorithm): 'rsa-sha1' | 'rsa-sha256' | 'ed25519-sha256' {
  switch (algorithm) {
  case DkimSignatureAlgorithm.RsaSha1: return 'rsa-sha1';
  case DkimSignatureAlgorithm.RsaSha256: return 'rsa-sha256';
  case DkimSignatureAlgorithm.Ed25519Sha256: return 'ed25519-sha256';
  }
}
