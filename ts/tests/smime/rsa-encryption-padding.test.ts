// Port of UnitTests/Cryptography/RsaEncryptionPaddingTests.cs.
//
// `TestGetAlgorithmIdentifier` (the RSAES-OAEP ASN.1 producer) is implemented in
// wave C2b-1 and ported here alongside the four value-only cases.

import { describe, expect, test } from 'vitest';
import {
  RsaEncryptionPadding,
  RsaesOaepParameters,
  type AlgorithmIdentifier,
} from '../../src/smime/rsa-encryption-padding.js';
import { RsaEncryptionPaddingScheme } from '../../src/smime/rsa-encryption-padding-scheme.js';
import { DigestAlgorithm, digestAlgorithmValues } from '../../src/smime/digest-algorithm.js';
import { NotSupportedError } from '../../src/smime/errors.js';

// OIDs asserted by the C# test (Pkcs/Oiw/Nist object identifiers).
const OID_RSAES_OAEP = '1.2.840.113549.1.1.7';
const OID_MGF1 = '1.2.840.113549.1.1.8';
const OID_SHA1 = '1.3.14.3.2.26';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_SHA384 = '2.16.840.1.101.3.4.2.2';
const OID_SHA512 = '2.16.840.1.101.3.4.2.3';

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

  function assertOaepAlgorithmIdentifier(padding: RsaEncryptionPadding, hashOid: string): void {
    const algorithm = padding.getAlgorithmIdentifier();
    expect(algorithm).not.toBeNull();
    expect(algorithm!.algorithm).toBe(OID_RSAES_OAEP);
    const parameters = algorithm!.parameters as RsaesOaepParameters;
    expect(parameters).toBeInstanceOf(RsaesOaepParameters);
    expect(parameters.hashAlgorithm.algorithm).toBe(hashOid);
    expect(parameters.maskGenAlgorithm.algorithm).toBe(OID_MGF1);
    const mgf1hash = parameters.maskGenAlgorithm.parameters as AlgorithmIdentifier;
    expect(mgf1hash.algorithm).toBe(hashOid);
  }

  test('TestGetAlgorithmIdentifier', () => {
    expect(RsaEncryptionPadding.Pkcs1.getAlgorithmIdentifier()).toBeNull();

    assertOaepAlgorithmIdentifier(RsaEncryptionPadding.OaepSha1, OID_SHA1);
    assertOaepAlgorithmIdentifier(RsaEncryptionPadding.OaepSha256, OID_SHA256);
    assertOaepAlgorithmIdentifier(RsaEncryptionPadding.OaepSha384, OID_SHA384);
    assertOaepAlgorithmIdentifier(RsaEncryptionPadding.OaepSha512, OID_SHA512);
  });
});
