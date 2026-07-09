// Port of UnitTests/Cryptography/RsaSignaturePaddingTests.cs (1:1).
//
// C# uses operator ==/!= and reflection over the public static fields; the port
// uses `.equals()` / identity and the `RsaSignaturePadding.values` array.

import { describe, expect, test } from 'vitest';
import { RsaSignaturePadding } from '../../src/smime/rsa-signature-padding.js';

describe('RsaSignaturePaddingTests', () => {
  test('TestEquality', () => {
    const pkcs1 = RsaSignaturePadding.Pkcs1;
    const pss = RsaSignaturePadding.Pss;

    expect(pkcs1.equals(RsaSignaturePadding.Pkcs1)).toBe(true); // Pkcs1 Equals Pkcs1
    expect(pss.equals(RsaSignaturePadding.Pss)).toBe(true); // Pss Equals Pss

    expect(RsaSignaturePadding.Pss.equals(RsaSignaturePadding.Pkcs1)).toBe(false); // Pss !Equals Pkcs1
    expect(RsaSignaturePadding.Pkcs1.equals(RsaSignaturePadding.Pss)).toBe(false); // Pkcs1 !Equals Pss

    expect(RsaSignaturePadding.Pkcs1.equals({} as unknown as RsaSignaturePadding)).toBe(false); // Pkcs1 !Equals object
    expect(RsaSignaturePadding.Pss.equals({} as unknown as RsaSignaturePadding)).toBe(false); // Pss !Equals object

    expect(pkcs1.equals(RsaSignaturePadding.Pkcs1)).toBe(true); // Pkcs1 == Pkcs1
    expect(pss.equals(RsaSignaturePadding.Pss)).toBe(true); // Pss == Pss
    expect(pkcs1.equals(pss)).toBe(false); // Pkcs1 == Pss
    expect(pss.equals(pkcs1)).toBe(false); // Pss == Pkcs1
    expect(pkcs1.equals(null)).toBe(false); // Pkcs1 == null

    expect(pkcs1.equals(RsaSignaturePadding.Pkcs1)).toBe(true); // Pkcs1 != Pkcs1 -> !false
    expect(pss.equals(RsaSignaturePadding.Pss)).toBe(true); // Pss != Pss -> !false
    expect(pkcs1.equals(pss)).toBe(false); // Pkcs1 != Pss -> !true
    expect(pss.equals(pkcs1)).toBe(false); // Pss != Pkcs1 -> !true
    expect(pkcs1.equals(null)).toBe(false); // Pkcs1 != null -> !true
  });

  test('TestGetHashCode', () => {
    const hashCodes = new Map<number, RsaSignaturePadding>();

    for (const padding of RsaSignaturePadding.values) {
      const hashCode = padding.getHashCode();
      const other = hashCodes.get(hashCode);
      if (other !== undefined)
        throw new Error(`${padding.scheme} shares the same hash code as ${other.scheme}`);
      hashCodes.set(hashCode, padding);
    }
  });

  test('TestToString', () => {
    expect(RsaSignaturePadding.Pkcs1.toString()).toBe('Pkcs1');
    expect(RsaSignaturePadding.Pss.toString()).toBe('Pss');
  });
});
