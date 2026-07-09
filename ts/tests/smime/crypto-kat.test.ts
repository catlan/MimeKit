// Known-answer tests for the hand-rolled S/MIME block ciphers + PKCS#12 KDF.
//
// These primitives (DES/3DES, RC2, the RFC 7292 KDF) are bespoke userland ports
// with no WebCrypto/@noble equivalent, so they are pinned here against *published*
// standard vectors — independent of the .pfx fixtures — to guard against silent
// regressions:
//   - DES:  FIPS 46-3 / NIST single-DES known-answer vectors.
//   - RC2:  the RFC 2268 section 5 test vectors (exercising effective-key-bits).
//   - KDF:  the authoritative Go crypto/pkcs12 literals (incl. the leading-zero
//           carry case) plus id=1/2/3 (key/IV/MAC) derivations.

import { describe, expect, test } from 'vitest';
import { DesKey, tripleDesCbcDecrypt } from '../../src/smime/crypto/des.js';
import { rc2CbcDecrypt } from '../../src/smime/crypto/rc2.js';
import { pkcs12Derive, passwordToBmp } from '../../src/smime/crypto/pkcs12-kdf.js';

function hex(s: string): Uint8Array {
  const clean = s.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function toHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

describe('DES single-block KAT (FIPS/NIST)', () => {
  // key, plaintext, expected ciphertext
  const vectors: [string, string, string][] = [
    ['133457799BBCDFF1', '0123456789ABCDEF', '85E813540F0AB405'], // Davies canonical
    ['0000000000000000', '0000000000000000', '8CA64DE9C1B123A7'],
    ['FFFFFFFFFFFFFFFF', 'FFFFFFFFFFFFFFFF', '7359B2163E4EDC58'],
    ['3000000000000000', '1000000000000001', '958E6E627A05557B'],
    ['1111111111111111', '1111111111111111', 'F40379AB9E0EC533'],
    ['0123456789ABCDEF', '1111111111111111', '17668DFC7292532D'],
    ['FEDCBA9876543210', '0123456789ABCDEF', 'ED39D950FA74BCC4'],
  ];

  for (const [key, plain, cipher] of vectors) {
    test(`encrypt ${key} / ${plain}`, () => {
      const ct = new DesKey(hex(key)).encryptBlock(hex(plain), 0);
      expect(toHex(ct).toUpperCase()).toBe(cipher);
    });
    test(`decrypt ${key} / ${cipher}`, () => {
      const pt = new DesKey(hex(key)).decryptBlock(hex(cipher), 0);
      expect(toHex(pt).toUpperCase()).toBe(plain);
    });
  }
});

describe('3DES-EDE-CBC round-trip (openssl des-ede3-cbc -nopad)', () => {
  test('decrypts openssl-generated ciphertext', () => {
    const key = hex('0123456789abcdef23456789abcdef01456789abcdef0123');
    const iv = hex('0011223344556677');
    const ciphertext = hex('4eba739c998bcb602398af2375920b66');
    const plaintext = tripleDesCbcDecrypt(key, iv, ciphertext);
    expect(toHex(plaintext)).toBe('00112233445566778899aabbccddeeff');
  });
});

describe('RC2 RFC 2268 section 5 vectors', () => {
  // key(hex), effectiveBits, plaintext, ciphertext
  const vectors: [string, number, string, string][] = [
    ['0000000000000000', 63, '0000000000000000', 'ebb773f993278eff'],
    ['ffffffffffffffff', 64, 'ffffffffffffffff', '278b27e42e2f0d49'],
    ['3000000000000000', 64, '1000000000000001', '30649edf9be7d2c2'],
    ['88', 64, '0000000000000000', '61a8a244adacccf0'],
    ['88bca90e90875a', 64, '0000000000000000', '6ccf4308974c267f'],
    ['88bca90e90875a7f0f79c384627bafb2', 64, '0000000000000000', '1a807d272bbe5db1'],
    ['88bca90e90875a7f0f79c384627bafb2', 128, '0000000000000000', '2269552ab0f85ca6'],
    ['88bca90e90875a7f0f79c384627bafb216f80a6f85920584c42fceb0be255daf1e', 129, '0000000000000000', '5b78d3a43dfff1f1'],
  ];

  for (const [key, effectiveBits, plain, cipher] of vectors) {
    test(`decrypt key=${key} eff=${effectiveBits}`, () => {
      // Single-block CBC with a zero IV is equivalent to a raw ECB block decrypt.
      const iv = new Uint8Array(8);
      const pt = rc2CbcDecrypt(hex(key), effectiveBits, iv, hex(cipher));
      expect(toHex(pt)).toBe(plain);
    });
  }
});

describe('PKCS#12 KDF (RFC 7292 B.2, SHA-1)', () => {
  // password(bmp bytes), salt(hex), iterations, id, n, expected(hex)
  const vectors: [Uint8Array, string, number, number, number, string][] = [
    // Authoritative Go crypto/pkcs12 pbkdf_test.go literals:
    [passwordToBmp('sesame'), 'ffffffffffffffff', 2048, 1, 24, '7cd9fd3e2b3be7691a44e3bef0f9ea0fb9b897d4e325d9d1'],
    // Leading-zero carry case (Go passes the BMP of the empty string = 0x0000):
    [Uint8Array.from([0, 0]), 'f37e05b518324b4b', 2048, 1, 24, '00f759ff47d14dd03665d5943cb3c4a39a2555c02aed66e1'],
    // Clean-room-python cross-checks exercising id=1 (key), id=2 (IV), id=3 (MAC):
    [passwordToBmp('smime'), '0a583cf64c0468ef', 2048, 1, 24, '80b2cf43e19768ec84285047c7291463a86870dee84a545c'],
    [passwordToBmp('smime'), '0a583cf64c0468ef', 2048, 2, 8, '138866379d6f3fd4'],
    [passwordToBmp('smime'), '0a583cf64c0468ef', 2048, 3, 20, '2f4d19ce7afe347ceb4b5266eb42793d395f7bca'],
    [passwordToBmp('hello'), '1122334455667788', 1000, 1, 5, '0b3325a835'],
  ];

  for (const [bmp, salt, iterations, id, n, expected] of vectors) {
    test(`derive id=${id} n=${n} iter=${iterations}`, () => {
      const out = pkcs12Derive(bmp, hex(salt), iterations, id, n);
      expect(toHex(out)).toBe(expected);
    });
  }
});
