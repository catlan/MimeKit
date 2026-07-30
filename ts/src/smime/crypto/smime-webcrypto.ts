// WebCrypto + pkijs engine glue for the concrete S/MIME context.
//
// - Registers a pkijs CryptoEngine over the platform WebCrypto (Node & browser).
// - AES-CBC raw (no-padding) encrypt/decrypt so the EnvelopedData layer can run
//   ONE uniform PKCS#7 unpad across AES/3DES/RC2 (Vaudenay padding-oracle
//   defence — see CRYPTO-PLAN "C2b-2 crypto requirements"). WebCrypto's AES-CBC
//   always applies/strips PKCS#7 and throws distinguishably, so we coax raw CBC
//   bytes out of it and do the unpad ourselves.

import * as pkijs from 'pkijs';

let engineReady = false;

/** Register the pkijs crypto engine over the platform WebCrypto (idempotent). */
export function ensureEngine(): SubtleCrypto {
  const webcrypto = globalThis.crypto;
  if (!webcrypto?.subtle) throw new Error('WebCrypto (crypto.subtle) is not available in this runtime.');
  if (!engineReady) {
    pkijs.setEngine('mimekit', new pkijs.CryptoEngine({ name: 'mimekit', crypto: webcrypto as unknown as Crypto }));
    engineReady = true;
  }
  return webcrypto.subtle;
}

/** Copy bytes into a fresh ArrayBuffer (WebCrypto rejects shared/offset views). */
export function ab(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

/** One-shot digest via WebCrypto. */
export async function digest(hash: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512', data: Uint8Array): Promise<Uint8Array> {
  const subtle = ensureEngine();
  return new Uint8Array(await subtle.digest(hash, ab(data)));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ---- AES-CBC raw (no PKCS#7) ------------------------------------------------

async function importAesKey(raw: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const subtle = ensureEngine();
  return subtle.importKey('raw', ab(raw), { name: 'AES-CBC' }, false, [usage]);
}

/**
 * Raw AES-CBC encryption: input MUST already be a multiple of 16 bytes (the
 * caller applies PKCS#7). WebCrypto appends one pad block; we drop it.
 */
export async function aesCbcEncryptRaw(key: Uint8Array, iv: Uint8Array, paddedPlaintext: Uint8Array): Promise<Uint8Array> {
  const subtle = ensureEngine();
  const k = await importAesKey(key, 'encrypt');
  const out = new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv: ab(iv) }, k, ab(paddedPlaintext)));
  return out.slice(0, paddedPlaintext.length);
}

/**
 * Raw AES-CBC decryption: returns the padded plaintext WITHOUT stripping PKCS#7
 * (the EnvelopedData layer applies the uniform unpad). Uses the standard
 * append-block trick to stop WebCrypto from unpadding: we append a block that
 * decrypts to a full valid pad block so WebCrypto strips exactly that block.
 */
export async function aesCbcDecryptRaw(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  const subtle = ensureEngine();
  if (ciphertext.length === 0 || ciphertext.length % 16 !== 0)
    throw new Error('AES-CBC ciphertext must be a non-empty multiple of 16 bytes.');

  const lastC = ciphertext.subarray(ciphertext.length - 16);
  // block E s.t. D_K(E) = 0x10^16 XOR C[n-1]  =>  E = E_K(0x10^16 XOR C[n-1]).
  const xored = new Uint8Array(16);
  for (let i = 0; i < 16; i++) xored[i] = lastC[i]! ^ 0x10;
  const encKey = await importAesKey(key, 'encrypt');
  const zeroIv = new Uint8Array(16);
  const eFull = new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv: ab(zeroIv) }, encKey, ab(xored)));
  const eBlock = eFull.slice(0, 16);

  const extended = concat(ciphertext, eBlock);
  const decKey = await importAesKey(key, 'decrypt');
  const raw = new Uint8Array(await subtle.decrypt({ name: 'AES-CBC', iv: ab(iv) }, decKey, ab(extended)));
  // raw has (n+1)*16 - 16 = n*16 bytes = the raw decryption of the original n blocks.
  return raw;
}

// ---- uniform PKCS#7 unpad ---------------------------------------------------

/**
 * Remove PKCS#7 padding with a single, non-branching failure mode. Returns the
 * unpadded data, or `null` if the padding is invalid — the caller MUST map both
 * "bad padding" and any upstream RSA/decrypt failure to the SAME generic error
 * so no padding-oracle side channel is exposed (Vaudenay).
 */
export function pkcs7UnpadUniform(raw: Uint8Array, blockSize: number): Uint8Array | null {
  const len = raw.length;
  if (len === 0 || len % blockSize !== 0) return null;

  const pad = raw[len - 1]!;
  // Accumulate validity without early exit.
  let good = 1;
  good &= pad >= 1 ? 1 : 0;
  good &= pad <= blockSize ? 1 : 0;

  // Check the trailing bytes: for the last `blockSize` positions, any position
  // whose distance-from-end is < pad must equal pad. Iterate the whole block so
  // the work is independent of `pad`.
  for (let i = 0; i < blockSize; i++) {
    const idx = len - 1 - i;
    const inPad = i < pad ? 1 : 0;
    const matches = raw[idx] === pad ? 1 : 0;
    // if inPad and not matches -> bad
    good &= inPad ? matches : 1;
  }

  if (good !== 1) return null;
  return raw.subarray(0, len - pad);
}

/** Apply PKCS#7 padding to a block size. */
export function pkcs7Pad(data: Uint8Array, blockSize: number): Uint8Array {
  const pad = blockSize - (data.length % blockSize);
  const out = new Uint8Array(data.length + pad);
  out.set(data, 0);
  out.fill(pad, data.length);
  return out;
}
