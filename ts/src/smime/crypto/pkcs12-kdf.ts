// PKCS#12 password-based key derivation + PBES1 decryption (RFC 7292).
//
// Needed to import the MimeKit S/MIME test .pfx files, whose keys and
// certificates use the classic pbeWithSHAAnd3-KeyTripleDES-CBC and
// pbeWithSHAAnd40BitRC2-CBC schemes. All hashing is SHA-1 via @noble/hashes;
// the block ciphers are the userland DES/RC2 in this directory. Isomorphic.

/* eslint-disable no-bitwise */

import { sha1 } from '@noble/hashes/legacy.js';
import { tripleDesCbcDecrypt } from './des.js';
import { rc2CbcDecrypt } from './rc2.js';

// PKCS#12 PBE OIDs (RFC 7292 App C / PKCS#12).
export const OID_PBE_SHA_3DES = '1.2.840.113549.1.12.1.3'; // pbeWithSHAAnd3-KeyTripleDES-CBC
export const OID_PBE_SHA_2DES = '1.2.840.113549.1.12.1.4'; // pbeWithSHAAnd2-KeyTripleDES-CBC
export const OID_PBE_SHA_RC2_128 = '1.2.840.113549.1.12.1.5'; // pbeWithSHAAnd128BitRC2-CBC
export const OID_PBE_SHA_RC2_40 = '1.2.840.113549.1.12.1.6'; // pbeWithSHAAnd40BitRC2-CBC

const ID_KEY = 1;
const ID_IV = 2;
const ID_MAC = 3;

const HASH_LEN = 20; // SHA-1 output (u)
const BLOCK_LEN = 64; // SHA-1 block (v)

/** Encode a password as a PKCS#12 BMPString: UTF-16BE code units + a NUL terminator. */
export function passwordToBmp(password: string): Uint8Array {
  const out = new Uint8Array((password.length + 1) * 2);
  for (let i = 0; i < password.length; i++) {
    const code = password.charCodeAt(i);
    out[i * 2] = (code >> 8) & 0xff;
    out[i * 2 + 1] = code & 0xff;
  }
  // Trailing 0x0000 is already present (zero-filled).
  return out;
}

// Add `b` (BLOCK_LEN-byte big-endian int) + 1 into the BLOCK_LEN-byte slice of I
// at `ioff`, modulo 2^(BLOCK_LEN*8), in place (RFC 7292 B.2 step 6c).
function addBlock(i: Uint8Array, ioff: number, b: Uint8Array): void {
  let carry = 1;
  for (let k = BLOCK_LEN - 1; k >= 0; k--) {
    const sum = i[ioff + k]! + b[k]! + carry;
    i[ioff + k] = sum & 0xff;
    carry = sum >> 8;
  }
}

/**
 * The PKCS#12 key-derivation function (RFC 7292 Appendix B.2) with SHA-1.
 *
 * @param id 1 = encryption key, 2 = IV, 3 = MAC key.
 * @param n number of output bytes.
 */
export function pkcs12Derive(bmpPassword: Uint8Array, salt: Uint8Array, iterations: number, id: number, n: number): Uint8Array {
  const d = new Uint8Array(BLOCK_LEN).fill(id);

  const sLen = salt.length > 0 ? Math.ceil(salt.length / BLOCK_LEN) * BLOCK_LEN : 0;
  const pLen = bmpPassword.length > 0 ? Math.ceil(bmpPassword.length / BLOCK_LEN) * BLOCK_LEN : 0;
  const iBuf = new Uint8Array(sLen + pLen);
  for (let k = 0; k < sLen; k++) iBuf[k] = salt[k % salt.length]!;
  for (let k = 0; k < pLen; k++) iBuf[sLen + k] = bmpPassword[k % bmpPassword.length]!;

  const c = Math.ceil(n / HASH_LEN);
  const out = new Uint8Array(c * HASH_LEN);

  for (let i = 1; i <= c; i++) {
    // A = H^iterations(D || I)
    let a = sha1.create().update(d).update(iBuf).digest();
    for (let j = 1; j < iterations; j++) a = sha1(a);

    out.set(a, (i - 1) * HASH_LEN);

    if (i < c) {
      // B = A repeated to BLOCK_LEN bytes.
      const b = new Uint8Array(BLOCK_LEN);
      for (let k = 0; k < BLOCK_LEN; k++) b[k] = a[k % HASH_LEN]!;
      // I_j = (I_j + B + 1) mod 2^(v*8) for each block.
      for (let off = 0; off < iBuf.length; off += BLOCK_LEN) addBlock(iBuf, off, b);
    }
  }

  return out.subarray(0, n);
}

function pkcs7Unpad(data: Uint8Array): Uint8Array {
  if (data.length === 0) return data;
  const pad = data[data.length - 1]!;
  if (pad === 0 || pad > 8 || pad > data.length) return data; // not padded / tolerate
  for (let i = data.length - pad; i < data.length; i++) if (data[i] !== pad) return data;
  return data.subarray(0, data.length - pad);
}

/**
 * Decrypt PKCS#12 PBES1-protected data for the given algorithm OID + params.
 * Returns the plaintext with PKCS#7 padding removed.
 */
export function pkcs12PbeDecrypt(
  oid: string,
  bmpPassword: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  data: Uint8Array,
): Uint8Array {
  switch (oid) {
    case OID_PBE_SHA_3DES: {
      const key = pkcs12Derive(bmpPassword, salt, iterations, ID_KEY, 24);
      const iv = pkcs12Derive(bmpPassword, salt, iterations, ID_IV, 8);
      return pkcs7Unpad(tripleDesCbcDecrypt(key, iv, data));
    }
    case OID_PBE_SHA_2DES: {
      // 2-key 3DES: derive 16 bytes, expand to K1 K2 K1.
      const k = pkcs12Derive(bmpPassword, salt, iterations, ID_KEY, 16);
      const key = new Uint8Array(24);
      key.set(k.subarray(0, 16), 0);
      key.set(k.subarray(0, 8), 16);
      const iv = pkcs12Derive(bmpPassword, salt, iterations, ID_IV, 8);
      return pkcs7Unpad(tripleDesCbcDecrypt(key, iv, data));
    }
    case OID_PBE_SHA_RC2_40: {
      const key = pkcs12Derive(bmpPassword, salt, iterations, ID_KEY, 5);
      const iv = pkcs12Derive(bmpPassword, salt, iterations, ID_IV, 8);
      return pkcs7Unpad(rc2CbcDecrypt(key, 40, iv, data));
    }
    case OID_PBE_SHA_RC2_128: {
      const key = pkcs12Derive(bmpPassword, salt, iterations, ID_KEY, 16);
      const iv = pkcs12Derive(bmpPassword, salt, iterations, ID_IV, 8);
      return pkcs7Unpad(rc2CbcDecrypt(key, 128, iv, data));
    }
    default:
      throw new Error(`Unsupported PKCS#12 PBE algorithm: ${oid}`);
  }
}

/** Derive the PKCS#12 MAC key (SHA-1) for integrity verification. */
export function pkcs12MacKey(bmpPassword: Uint8Array, salt: Uint8Array, iterations: number): Uint8Array {
  return pkcs12Derive(bmpPassword, salt, iterations, ID_MAC, HASH_LEN);
}
