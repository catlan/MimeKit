// Port of MimeKit/Cryptography/DkimCanonicalizationAlgorithm.cs.

/**
 * A DKIM canonicalization algorithm.
 */
export enum DkimCanonicalizationAlgorithm {
  /**
   * The simple canonicalization algorithm tolerates almost no modification
   * by mail servers while the message is in-transit.
   */
  Simple = 'Simple',

  /**
   * The relaxed canonicalization algorithm tolerates common modifications
   * by mail servers while the message is in-transit such as whitespace
   * replacement and header field line rewrapping.
   */
  Relaxed = 'Relaxed',
}

/** The DKIM `c=` token for a canonicalization algorithm (C#: `.ToString().ToLowerInvariant()`). */
export function canonicalizationTag(algorithm: DkimCanonicalizationAlgorithm): 'simple' | 'relaxed' {
  return algorithm === DkimCanonicalizationAlgorithm.Relaxed ? 'relaxed' : 'simple';
}
