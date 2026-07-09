// RSA key transport for CMS EnvelopedData (wrap/unwrap the content-encryption
// key). See CRYPTO-PLAN "C2b-2 crypto requirements":
//
//  - modern: RSA-OAEP via WebCrypto (isomorphic, both runtimes).
//  - legacy PKCS#1 v1.5 (Bleichenbacher): Node default = node:crypto
//    privateDecrypt (OpenSSL implicit rejection, constant-time; the /smime
//    subpath MAY use node:crypto). Browser = opt-in pure-JS BigInt RSA, gated
//    behind `allowLegacyDecryption`.
//
// The browser v1.5 unwrap implements Marvin-style IMPLICIT REJECTION (RFC 8017
// §7.2.2 note / OpenSSL rsa_ossl_private_decrypt): it NEVER throws or branches
// its return on the padding. On invalid padding OR a wrong-length message it
// returns a deterministic synthetic key of the expected length (derived from the
// private key + ciphertext), so a Bleichenbacher attacker sees the same
// downstream failure whether padding was valid or not. modExp is blinded (RSA
// blinding) to blunt timing on the secret exponentiation. HONEST CAVEAT: JS/
// BigInt cannot guarantee constant time (JIT, variable-time bigint mul), so this
// path stays browser-opt-in/unaudited per CRYPTO-PLAN direction B; Node (the
// default and the tested path) uses OpenSSL's constant-time implicit rejection.
//
// Uniform errors: an unwrap failure NEVER reveals whether the RSA padding or a
// downstream step failed; callers surface a single generic decrypt error.

/// <reference types="node" />
/* eslint-disable no-bitwise */

import * as asn1js from 'asn1js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { ensureEngine, ab } from './smime-webcrypto.js';

// ---- runtime detection ------------------------------------------------------

const nodeProcess = (globalThis as { process?: { versions?: { node?: string } } }).process;
const isNode = !!nodeProcess?.versions?.node;

type NodeCrypto = typeof import('node:crypto');
let nodeCryptoPromise: Promise<NodeCrypto> | null = null;
function nodeCrypto(): Promise<NodeCrypto> {
  if (!nodeCryptoPromise) nodeCryptoPromise = import('node:crypto');
  return nodeCryptoPromise;
}

// ---- RSA-OAEP (WebCrypto) ---------------------------------------------------

/** Wrap the CEK with RSA-OAEP for a recipient (public SPKI DER + OAEP hash). */
export async function rsaOaepEncrypt(spki: Uint8Array, hash: string, cek: Uint8Array): Promise<Uint8Array> {
  const subtle = ensureEngine();
  const key = await subtle.importKey('spki', ab(spki), { name: 'RSA-OAEP', hash }, false, ['encrypt']);
  return new Uint8Array(await subtle.encrypt({ name: 'RSA-OAEP' }, key, ab(cek)));
}

/** Unwrap the CEK with RSA-OAEP (private PKCS#8 DER + OAEP hash). */
export async function rsaOaepDecrypt(pkcs8: Uint8Array, hash: string, encryptedKey: Uint8Array): Promise<Uint8Array> {
  const subtle = ensureEngine();
  const key = await subtle.importKey('pkcs8', ab(pkcs8), { name: 'RSA-OAEP', hash }, false, ['decrypt']);
  return new Uint8Array(await subtle.decrypt({ name: 'RSA-OAEP' }, key, ab(encryptedKey)));
}

// ---- RSA PKCS#1 v1.5 --------------------------------------------------------

/** Wrap the CEK with RSAES-PKCS1-v1.5. Public-key op: no timing sensitivity. */
export async function rsaV15Encrypt(spki: Uint8Array, cek: Uint8Array): Promise<Uint8Array> {
  if (isNode) {
    const { createPublicKey, publicEncrypt, constants } = await nodeCrypto();
    const key = createPublicKey({ key: Buffer.from(spki), format: 'der', type: 'spki' });
    return new Uint8Array(publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(cek)));
  }
  const { n, e } = parseRsaPublicSpki(spki);
  return emePkcs1Encrypt(n, e, cek);
}

/**
 * Unwrap the CEK with RSAES-PKCS1-v1.5.
 *
 * @param expectedKeyLength The content-encryption-key length the caller expects
 *   (from the EnvelopedData content algorithm). Used by the browser path for
 *   implicit rejection: a valid-padding message of the wrong length is treated
 *   exactly like invalid padding.
 * @param options.allowLegacyDecryption Browser opt-in for the pure-JS path
 *   (unaudited timing — see CRYPTO-PLAN §7). Ignored on Node, which always uses
 *   the constant-time OpenSSL path.
 * @throws Only when the browser opt-in is not enabled (a configuration error,
 *   independent of the ciphertext). Padding/length failures NEVER throw here —
 *   they return a synthetic key so no padding-oracle signal leaks.
 */
export async function rsaV15Decrypt(
  pkcs8: Uint8Array,
  encryptedKey: Uint8Array,
  expectedKeyLength: number,
  options: { allowLegacyDecryption?: boolean } = {},
): Promise<Uint8Array> {
  if (isNode) {
    // Do the raw RSA private op with OpenSSL (constant-time, blinded) and run our own
    // fixed-length implicit-rejection decode — rather than RSA_PKCS1_PADDING, whose
    // variable-length implicit-rejection output would let the downstream length check
    // distinguish valid from invalid padding (a Bleichenbacher/Marvin timing oracle).
    const { createPrivateKey, privateDecrypt, constants } = await nodeCrypto();
    const key = createPrivateKey({ key: Buffer.from(pkcs8), format: 'der', type: 'pkcs8' });
    const em = new Uint8Array(privateDecrypt({ key, padding: constants.RSA_NO_PADDING }, Buffer.from(encryptedKey)));
    const { n, d } = parseRsaPrivatePkcs8(pkcs8);
    return decodeEmImplicit(em, d, n, encryptedKey, expectedKeyLength);
  }
  if (!options.allowLegacyDecryption)
    throw new Error(
      'Legacy RSA PKCS#1 v1.5 key transport requires allowLegacyDecryption in the browser (unaudited timing).',
    );
  const { n, e, d } = parseRsaPrivatePkcs8(pkcs8);
  return emePkcs1DecryptImplicit(n, e, d, encryptedKey, expectedKeyLength);
}

// ---- pure-JS BigInt RSA (browser legacy path) -------------------------------
//
// A minimal EME-PKCS1-v1.5 (RFC 8017 §7.2) over blinded BigInt modExp with
// Marvin-style implicit rejection on decode. Isomorphic; validated on Node
// against node:crypto. See the file header for the constant-time caveat.

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

function bigIntToBytes(n: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function modulusByteLength(n: bigint): number {
  let bits = 0;
  let x = n;
  while (x > 0n) { bits++; x >>= 1n; }
  return (bits + 7) >> 3;
}

// Extended-Euclid modular inverse (for RSA blinding).
function modInverse(a: bigint, m: bigint): bigint {
  let [oldR, r] = [((a % m) + m) % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return ((oldS % m) + m) % m;
}

// RSA private exponentiation m = c^d mod n, blinded with a random r:
// m = ((c * r^e)^d) * r^-1 mod n. Blinding decorrelates the modExp timing from
// the ciphertext; it does NOT make BigInt itself constant-time (see header).
function blindedModPow(c: bigint, e: bigint, d: bigint, n: bigint): bigint {
  const rnd = new Uint8Array(modulusByteLength(n));
  let r: bigint;
  do {
    globalThis.crypto.getRandomValues(rnd);
    r = bytesToBigInt(rnd) % n;
  } while (r <= 1n || gcd(r, n) !== 1n);
  const blinded = (c * modPow(r, e, n)) % n;
  const m = modPow(blinded, d, n);
  return (m * modInverse(r, n)) % n;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) { [a, b] = [b, a % b]; }
  return a;
}

// A deterministic, unpredictable synthetic key of `length` bytes, derived from
// the private exponent + ciphertext (the OpenSSL implicit-rejection idea). Same
// (key, ciphertext) always yields the same bytes; an attacker cannot predict
// them without d. HKDF-style counter expansion of HMAC-SHA256.
function syntheticKey(d: bigint, n: bigint, ciphertext: Uint8Array, length: number): Uint8Array {
  const secret = bigIntToBytes(d, modulusByteLength(n));
  const out = new Uint8Array(length);
  let pos = 0;
  let counter = 0;
  while (pos < length) {
    const msg = new Uint8Array(ciphertext.length + 2);
    msg.set(ciphertext, 0);
    msg[ciphertext.length] = counter & 0xff;
    msg[ciphertext.length + 1] = (counter >> 8) & 0xff;
    const block = hmac(sha256, secret, msg);
    const take = Math.min(block.length, length - pos);
    out.set(block.subarray(0, take), pos);
    pos += take;
    counter++;
  }
  return out;
}

function emePkcs1Encrypt(n: bigint, e: bigint, message: Uint8Array): Uint8Array {
  const k = modulusByteLength(n);
  if (message.length > k - 11) throw new Error('Message too long for RSA modulus.');
  // EM = 0x00 || 0x02 || PS (non-zero random) || 0x00 || M
  const em = new Uint8Array(k);
  em[0] = 0x00;
  em[1] = 0x02;
  const psLen = k - message.length - 3;
  const rnd = new Uint8Array(psLen);
  globalThis.crypto.getRandomValues(rnd);
  for (let i = 0; i < psLen; i++) em[2 + i] = rnd[i]! === 0 ? 1 : rnd[i]!;
  em[2 + psLen] = 0x00;
  em.set(message, 3 + psLen);
  const c = modPow(bytesToBigInt(em), e, n);
  return bigIntToBytes(c, k);
}

/**
 * EME-PKCS1-v1.5 decode with implicit rejection. Returns a byte string of
 * exactly `expectedLength`: the real message when the padding is valid AND the
 * message length equals `expectedLength`, otherwise a deterministic synthetic
 * key. NEVER throws or branches its return on the padding — the only observable
 * outcome difference is the (unpredictable) bytes, which fail identically
 * downstream. Because a valid EM is 0x00 02 PS 00 M with M trailing, a correct-
 * length message occupies exactly the last `expectedLength` bytes of EM, so the
 * validity check and the extraction are position-fixed (no secret-dependent
 * index).
 */
function emePkcs1DecryptImplicit(
  n: bigint,
  e: bigint,
  d: bigint,
  ciphertext: Uint8Array,
  expectedLength: number,
): Uint8Array {
  const k = modulusByteLength(n);
  const em = bigIntToBytes(blindedModPow(bytesToBigInt(ciphertext), e, d, n), k);
  return decodeEmImplicit(em, d, n, ciphertext, expectedLength);
}

/**
 * The position-fixed, constant-select EME-PKCS1-v1.5 decode shared by the Node
 * (raw OpenSSL RSA) and browser (BigInt) paths. `em` is the raw k-byte RSA
 * decryption result. Returns exactly `expectedLength` bytes — the real message
 * when padding is valid AND the message length matches, otherwise a deterministic
 * synthetic key — with no return branch or secret-dependent index on the padding.
 */
function decodeEmImplicit(
  em: Uint8Array,
  d: bigint,
  n: bigint,
  ciphertext: Uint8Array,
  expectedLength: number,
): Uint8Array {
  const k = em.length;
  const synthetic = syntheticKey(d, n, ciphertext, expectedLength);

  // The separator 0x00 must sit immediately before the trailing message.
  const sep = k - expectedLength - 1;

  let good = 1;
  good &= em[0] === 0x00 ? 1 : 0;
  good &= em[1] === 0x02 ? 1 : 0;
  // Need room for the 2 header bytes + >= 8 PS bytes + separator.
  good &= sep >= 10 ? 1 : 0;
  if (sep >= 2 && sep < k) {
    good &= em[sep] === 0x00 ? 1 : 0;
    // All PS bytes (indices 2..sep-1) must be non-zero.
    for (let i = 2; i < sep; i++) good &= em[i] !== 0x00 ? 1 : 0;
  } else {
    good = 0;
  }

  // Constant-time select: mask = 0xff iff good, else 0x00 (no return branch).
  const mask = (good & 1) * 0xff;
  const out = new Uint8Array(expectedLength);
  const start = sep + 1;
  for (let i = 0; i < expectedLength; i++) {
    const real = start >= 0 && start + i < k ? em[start + i]! : 0;
    out[i] = (real & mask) | (synthetic[i]! & (mask ^ 0xff));
  }
  return out;
}

// ---- DER key parsing for the pure-JS path -----------------------------------

function readInteger(seq: asn1js.Sequence, index: number): bigint {
  const int = seq.valueBlock.value[index] as asn1js.Integer;
  return bytesToBigInt(new Uint8Array(int.valueBlock.valueHexView));
}

function parseRsaPublicSpki(spki: Uint8Array): { n: bigint; e: bigint } {
  const info = asn1js.fromBER(ab(spki)).result as asn1js.Sequence;
  const bitString = info.valueBlock.value[1] as asn1js.BitString;
  const rsaPub = asn1js.fromBER(bitString.valueBlock.valueHexView.slice().buffer).result as asn1js.Sequence;
  return { n: readInteger(rsaPub, 0), e: readInteger(rsaPub, 1) };
}

function parseRsaPrivatePkcs8(pkcs8: Uint8Array): { n: bigint; e: bigint; d: bigint } {
  const info = asn1js.fromBER(ab(pkcs8)).result as asn1js.Sequence;
  const octet = info.valueBlock.value[2] as asn1js.OctetString;
  const rsaPriv = asn1js.fromBER(octet.valueBlock.valueHexView.slice().buffer).result as asn1js.Sequence;
  // RSAPrivateKey ::= SEQUENCE { version, modulus, publicExponent, privateExponent, ... }
  return { n: readInteger(rsaPriv, 1), e: readInteger(rsaPriv, 2), d: readInteger(rsaPriv, 3) };
}
