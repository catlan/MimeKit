// Port of UnitTests/Cryptography/RsaEncryptionPaddingTests.cs.
//
// `TestGetAlgorithmIdentifier` is DEFERRED to wave C2b (it asserts on
// BouncyCastle DER AlgorithmIdentifier / RsaesOaepParameters objects — ASN.1
// that belongs with the concrete crypto backend). See tests/smime/DEFERRED.md.
// The other four cases are value-only and run now.

import { describe, expect, test } from 'vitest';
import { RsaEncryptionPadding } from '../../src/smime/rsa-encryption-padding.js';
import { RsaEncryptionPaddingScheme } from '../../src/smime/rsa-encryption-padding-scheme.js';
import { DigestAlgorithm, digestAlgorithmValues } from '../../src/smime/digest-algorithm.js';
import { NotSupportedError } from '../../src/smime/errors.js';

describe('RsaEncryptionPaddingTests', () => {
  test('TestEquality', () => {
    expect(RsaEncryptionPadding.createOaep(DigestAlgorithm.Sha1).equals(RsaEncryptionPadding.OaepSha1)).toBe(true);
    expect(RsaEncryptionPadding.createOaep(DigestAlgorithm.Sha256).equals(RsaEncryptionPadding.OaepSha256)).toBe(true);
    expect(RsaEncryptionPadding.createOaep(DigestAlgorithm.Sha384).equals(RsaEncryptionPadding.OaepSha384)).toBe(true);
    expect(RsaEncryptionPadding.createOaep(DigestAlgorithm.Sha512).equals(RsaEncryptionPadding.OaepSha512)).toBe(true);

    expect(RsaEncryptionPadding.OaepSha1.equals(RsaEncryptionPadding.Pkcs1)).toBe(false); // PKCS1 !Equals SHA-1
    expect(RsaEncryptionPadding.OaepSha256.equals(RsaEncryptionPadding.Pkcs1)).toBe(false); // PKCS1 !Equals SHA-256
    expect(RsaEncryptionPadding.OaepSha256.equals(RsaEncryptionPadding.OaepSha1)).toBe(false); // SHA-1 !Equals SHA-256

    expect(RsaEncryptionPadding.Pkcs1.equals({} as unknown as RsaEncryptionPadding)).toBe(false); // PKCS1 !Equals object

    expect(RsaEncryptionPadding.OaepSha1.equals(RsaEncryptionPadding.createOaep(DigestAlgorithm.Sha1))).toBe(true); // SHA-1 == SHA-1
    expect(RsaEncryptionPadding.OaepSha1.equals(RsaEncryptionPadding.OaepSha256)).toBe(false); // SHA-1 == SHA-256
    expect(RsaEncryptionPadding.OaepSha1.equals(null)).toBe(false); // SHA-1 == null
  });

  test('TestGetHashCode', () => {
    const hashCodes = new Map<number, RsaEncryptionPadding>();

    for (const padding of RsaEncryptionPadding.values) {
      const hashCode = padding.getHashCode();
      const other = hashCodes.get(hashCode);
      if (other !== undefined)
        throw new Error(`${padding.scheme} shares the same hash code as ${other.scheme}`);
      hashCodes.set(hashCode, padding);
    }
  });

  test('TestNotSupportedException', () => {
    const supported = new Set<DigestAlgorithm>();

    for (const padding of RsaEncryptionPadding.values) {
      if (padding.scheme === RsaEncryptionPaddingScheme.Oaep)
        supported.add(padding.oaepHashAlgorithm);
    }

    for (const hashAlgorithm of digestAlgorithmValues()) {
      if (!supported.has(hashAlgorithm))
        expect(() => RsaEncryptionPadding.createOaep(hashAlgorithm)).toThrow(NotSupportedError);
      else
        expect(() => RsaEncryptionPadding.createOaep(hashAlgorithm)).not.toThrow();
    }
  });

  test('TestToString', () => {
    expect(RsaEncryptionPadding.Pkcs1.toString()).toBe('Pkcs1');
    expect(RsaEncryptionPadding.OaepSha1.toString()).toBe('OaepSha1');
    expect(RsaEncryptionPadding.OaepSha256.toString()).toBe('OaepSha256');
    expect(RsaEncryptionPadding.OaepSha384.toString()).toBe('OaepSha384');
    expect(RsaEncryptionPadding.OaepSha512.toString()).toBe('OaepSha512');
  });
});
