// Port of MimeKit/Cryptography/EncryptionAlgorithm.cs.
//
// A numeric enum (not a string union) because the integer ordinal is
// load-bearing: SecureMimeContext's enabled-algorithm bitmask uses
// `1 << algorithm` and GetPreferredEncryptionAlgorithm indexes a vote array by
// the ordinal. The declaration order (and therefore the ordinals 0..15) is
// identical to the C# enum.

/**
 * Encryption algorithms supported by S/MIME and OpenPGP.
 */
export enum EncryptionAlgorithm {
  /** The AES 128-bit encryption algorithm. */
  Aes128,
  /** The AES 192-bit encryption algorithm. */
  Aes192,
  /** The AES 256-bit encryption algorithm. */
  Aes256,
  /** The Camellia 128-bit encryption algorithm. */
  Camellia128,
  /** The Camellia 192-bit encryption algorithm. */
  Camellia192,
  /** The Camellia 256-bit encryption algorithm. */
  Camellia256,
  /** The Cast-5 128-bit encryption algorithm. */
  Cast5,
  /** The DES 56-bit encryption algorithm (extremely weak). */
  Des,
  /** The Triple-DES encryption algorithm. */
  TripleDes,
  /** The IDEA 128-bit encryption algorithm. */
  Idea,
  /** The Blowfish encryption algorithm. */
  Blowfish,
  /** The Twofish encryption algorithm. */
  Twofish,
  /** The RC2 40-bit encryption algorithm (S/MIME only; extremely weak). */
  RC240,
  /** The RC2 64-bit encryption algorithm (S/MIME only; very weak). */
  RC264,
  /** The RC2 128-bit encryption algorithm (S/MIME only). */
  RC2128,
  /** The SEED 128-bit encryption algorithm (S/MIME only). */
  Seed,
}

/** The number of defined {@link EncryptionAlgorithm} values (C#: EncryptionAlgorithmCount). */
export const encryptionAlgorithmCount = 16;
