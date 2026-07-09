/**
 * Primitive crypto layer for the DKIM/ARC subsystem (not a port of a single
 * MimeKit file — it replaces MimeKit's BouncyCastle binding).
 *
 * Design (see CRYPTO-PLAN.md §3):
 *
 *  - **Hashing is SYNCHRONOUS** via `@noble/hashes` (SHA-256 / SHA-1) with an
 *    incremental `update()`. DKIM body/header canonicalization streams bytes
 *    into a running digest and `SubtleCrypto.digest` has no incremental API,
 *    so a sync userland hash is required. `DkimHashStream` depends on this.
 *
 *  - **sign / verify are ASYNCHRONOUS.** RSASSA-PKCS1-v1_5 (SHA-256 / SHA-1)
 *    goes through WebCrypto (`crypto.subtle`); Ed25519 uses WebCrypto where the
 *    platform supports it and falls back to the audited `@noble/curves`
 *    implementation (feature-detected). Only the final signature operation is
 *    async — canonicalization stays synchronous.
 *
 *  - **Keys are Uint8Array throughout.** RSA private keys import from PEM
 *    (PKCS#1 "RSA PRIVATE KEY" and PKCS#8 "PRIVATE KEY"); RSA public keys
 *    import from the DKIM record `p=` tag (base64 SubjectPublicKeyInfo).
 *    Ed25519 keys are the raw 32-byte scalars/points from RFC 8463.
 *
 * Nothing here touches Node-only APIs; it runs unmodified in browsers.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { ed25519 } from '@noble/curves/ed25519.js';

/** A synchronous, incremental message digest. */
export interface IncrementalHash {
  /** Absorb `count` bytes of `buffer` starting at `offset`. */
  update(buffer: Uint8Array, offset: number, count: number): void;
  /** Produce the final digest. */
  digest(): Uint8Array;
}

class NobleIncrementalHash implements IncrementalHash {
  private readonly hasher: { update(data: Uint8Array): unknown; digest(): Uint8Array };

  constructor(create: () => { update(data: Uint8Array): unknown; digest(): Uint8Array }) {
    this.hasher = create();
  }

  update(buffer: Uint8Array, offset: number, count: number): void {
    this.hasher.update(buffer.subarray(offset, offset + count));
  }

  digest(): Uint8Array {
    return this.hasher.digest();
  }
}

/** Create an incremental SHA-256 hash. */
export function createSha256(): IncrementalHash {
  return new NobleIncrementalHash(() => sha256.create());
}

/** Create an incremental SHA-1 hash. */
export function createSha1(): IncrementalHash {
  return new NobleIncrementalHash(() => sha1.create());
}

/** Compute a one-shot SHA-256 digest. */
export function digestSha256(data: Uint8Array): Uint8Array {
  return sha256(data);
}

// ---------------------------------------------------------------------------
// Key model (the AsymmetricKeyParameter analog)
// ---------------------------------------------------------------------------

/** An RSA private key, stored as PKCS#8 DER for WebCrypto import. */
export interface RsaPrivateKey {
  readonly kind: 'rsa';
  readonly isPrivate: true;
  readonly pkcs8: Uint8Array;
  /** The modulus bit length (for `MinimumRsaKeyLength` checks). */
  readonly bitLength: number;
}

/** An RSA public key, stored as SubjectPublicKeyInfo DER for WebCrypto import. */
export interface RsaPublicKey {
  readonly kind: 'rsa';
  readonly isPrivate: false;
  readonly spki: Uint8Array;
  /** The modulus bit length (for `MinimumRsaKeyLength` checks). */
  readonly bitLength: number;
}

/** An Ed25519 private key (raw 32-byte seed). */
export interface Ed25519PrivateKey {
  readonly kind: 'ed25519';
  readonly isPrivate: true;
  readonly raw: Uint8Array;
}

/** An Ed25519 public key (raw 32-byte point). */
export interface Ed25519PublicKey {
  readonly kind: 'ed25519';
  readonly isPrivate: false;
  readonly raw: Uint8Array;
}

/** Any DKIM asymmetric key (the AsymmetricKeyParameter analog). */
export type AsymmetricKey = RsaPrivateKey | RsaPublicKey | Ed25519PrivateKey | Ed25519PublicKey;

/** Whether a key is a private key (C#: `AsymmetricKeyParameter.IsPrivate`). */
export function isPrivateKey(key: AsymmetricKey): boolean {
  return key.isPrivate;
}

// ---------------------------------------------------------------------------
// Minimal DER helpers
// ---------------------------------------------------------------------------

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  let x = n;
  while (x > 0) {
    bytes.unshift(x & 0xff);
    x = Math.floor(x / 256);
  }
  return [0x80 | bytes.length, ...bytes];
}

function derSequence(...parts: number[][]): Uint8Array {
  const body: number[] = [];
  for (const p of parts) body.push(...p);
  return Uint8Array.from([0x30, ...derLength(body.length), ...body]);
}

// rsaEncryption AlgorithmIdentifier: SEQUENCE { OID 1.2.840.113549.1.1.1, NULL }.
const RSA_ALGID = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];

/** Wrap a PKCS#1 RSAPrivateKey DER as a PKCS#8 PrivateKeyInfo DER. */
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = [0x02, 0x01, 0x00];
  const octet = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  return derSequence(version, RSA_ALGID, octet);
}

/**
 * Read a single DER TLV header at `pos`; return the tag, the content offset,
 * and the content length.
 */
function readTlv(der: Uint8Array, pos: number): { tag: number; start: number; length: number; next: number } {
  const tag = der[pos]!;
  let i = pos + 1;
  let length = der[i]!;
  i++;
  if (length & 0x80) {
    const count = length & 0x7f;
    length = 0;
    for (let j = 0; j < count; j++) length = length * 256 + der[i++]!;
  }
  return { tag, start: i, length, next: i + length };
}

/** Compute the RSA modulus bit length from a PKCS#1 RSAPrivateKey DER. */
function rsaBitLengthFromPkcs1(pkcs1: Uint8Array): number {
  // RSAPrivateKey ::= SEQUENCE { version INTEGER, modulus INTEGER, ... }
  const seq = readTlv(pkcs1, 0);
  const version = readTlv(pkcs1, seq.start);
  const modulus = readTlv(pkcs1, version.next);
  return integerBitLength(pkcs1, modulus.start, modulus.length);
}

/** Compute the RSA modulus bit length from a SubjectPublicKeyInfo DER. */
export function rsaBitLengthFromSpki(spki: Uint8Array): number {
  // SPKI ::= SEQUENCE { AlgorithmIdentifier, BIT STRING { RSAPublicKey } }
  const seq = readTlv(spki, 0);
  const algId = readTlv(spki, seq.start);
  const bitString = readTlv(spki, algId.next);
  // BIT STRING: first content byte is the number of unused bits (0 here).
  const rsaKey = readTlv(spki, bitString.start + 1);
  const modulus = readTlv(spki, rsaKey.start);
  return integerBitLength(spki, modulus.start, modulus.length);
}

function integerBitLength(der: Uint8Array, start: number, length: number): number {
  let i = start;
  let len = length;
  // Skip a leading 0x00 sign byte.
  while (len > 0 && der[i] === 0x00) {
    i++;
    len--;
  }
  if (len === 0) return 0;
  const top = der[i]!;
  let bits = (len - 1) * 8;
  let b = top;
  while (b > 0) {
    bits++;
    b >>= 1;
  }
  return bits;
}

// ---------------------------------------------------------------------------
// PEM parsing
// ---------------------------------------------------------------------------

interface PemBlock {
  tag: string;
  der: Uint8Array;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Base64-encode raw bytes (isomorphic). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/** Decode base64 (accepts embedded whitespace). */
export function base64Decode(b64: string): Uint8Array {
  return base64ToBytes(b64);
}

function parsePemBlocks(text: string): PemBlock[] {
  const blocks: PemBlock[] = [];
  const re = /-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ tag: m[1]!.trim(), der: base64ToBytes(m[2]!) });
  }
  return blocks;
}

/** The Ed25519 PKCS#8 private-key OID prefix (id-Ed25519, RFC 8410). */
const ED25519_PKCS8_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
/** The rsaEncryption OID bytes (for PKCS#8 algorithm detection). */
const RSA_OID = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];

function bytesStartWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false;
  return true;
}

function containsOid(der: Uint8Array, oid: number[]): boolean {
  outer: for (let i = 0; i + oid.length <= der.length; i++) {
    for (let j = 0; j < oid.length; j++) if (der[i + j] !== oid[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Load an RSA or Ed25519 private key from PEM text.
 *
 * Supports PKCS#1 (`RSA PRIVATE KEY`), PKCS#8 (`PRIVATE KEY`, RSA or Ed25519).
 * Throws if no private key is found (C#: `FormatException`).
 */
export function loadPrivateKeyFromPem(text: string): AsymmetricKey {
  const blocks = parsePemBlocks(text);

  for (const block of blocks) {
    if (block.tag === 'RSA PRIVATE KEY') {
      return { kind: 'rsa', isPrivate: true, pkcs8: pkcs1ToPkcs8(block.der), bitLength: rsaBitLengthFromPkcs1(block.der) };
    }

    if (block.tag === 'PRIVATE KEY') {
      if (bytesStartWith(block.der, ED25519_PKCS8_PREFIX)) {
        return { kind: 'ed25519', isPrivate: true, raw: block.der.slice(ED25519_PKCS8_PREFIX.length, ED25519_PKCS8_PREFIX.length + 32) };
      }
      if (containsOid(block.der, RSA_OID)) {
        // PKCS#8 already; extract the inner PKCS#1 for the bit length.
        const seq = readTlv(block.der, 0);
        const version = readTlv(block.der, seq.start);
        const algId = readTlv(block.der, version.next);
        const octet = readTlv(block.der, algId.next);
        const pkcs1 = block.der.subarray(octet.start, octet.start + octet.length);
        return { kind: 'rsa', isPrivate: true, pkcs8: block.der.slice(), bitLength: rsaBitLengthFromPkcs1(pkcs1) };
      }
    }
  }

  throw new Error('Private key not found.');
}

/**
 * Parse a DKIM public key from the record `p=` value.
 *
 * @param k The key algorithm tag (`rsa` or `ed25519`).
 * @param pBase64 The base64-encoded key material (SPKI for RSA, raw for Ed25519).
 */
export function parseDkimPublicKey(k: string, pBase64: string): AsymmetricKey {
  const decoded = base64ToBytes(pBase64);

  if (k === 'ed25519') {
    return { kind: 'ed25519', isPrivate: false, raw: decoded };
  }

  return { kind: 'rsa', isPrivate: false, spki: decoded, bitLength: rsaBitLengthFromSpki(decoded) };
}

// ---------------------------------------------------------------------------
// Digest signers (the ISigner analog)
// ---------------------------------------------------------------------------

/** A streaming signer/verifier (the BouncyCastle `ISigner` analog). */
export interface DigestSigner {
  /** Absorb `count` bytes of `buffer` starting at `offset`. */
  blockUpdate(buffer: Uint8Array, offset: number, count: number): void;
  /** Generate the signature over the absorbed bytes. */
  generateSignature(): Promise<Uint8Array>;
  /** Verify `signature` against the absorbed bytes. */
  verifySignature(signature: Uint8Array): Promise<boolean>;
}

abstract class AccumulatingSigner implements DigestSigner {
  private readonly chunks: Uint8Array[] = [];
  private total = 0;

  blockUpdate(buffer: Uint8Array, offset: number, count: number): void {
    if (count <= 0) return;
    this.chunks.push(buffer.slice(offset, offset + count));
    this.total += count;
  }

  protected data(): Uint8Array {
    if (this.chunks.length === 1) return this.chunks[0]!;
    const out = new Uint8Array(this.total);
    let pos = 0;
    for (const c of this.chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  }

  abstract generateSignature(): Promise<Uint8Array>;
  abstract verifySignature(signature: Uint8Array): Promise<boolean>;
}

const subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle;

class RsaDigestSigner extends AccumulatingSigner {
  constructor(private readonly hash: 'SHA-1' | 'SHA-256', private readonly key: RsaPrivateKey | RsaPublicKey) {
    super();
  }

  override async generateSignature(): Promise<Uint8Array> {
    if (this.key.isPrivate === false) throw new Error('RsaDigestSigner not initialised for signing.');
    if (!subtle) throw new Error('WebCrypto (crypto.subtle) is not available.');
    const key = await subtle.importKey('pkcs8', asBufferSource(this.key.pkcs8), { name: 'RSASSA-PKCS1-v1_5', hash: this.hash }, false, ['sign']);
    const sig = await subtle.sign('RSASSA-PKCS1-v1_5', key, asBufferSource(this.data()));
    return new Uint8Array(sig);
  }

  override async verifySignature(signature: Uint8Array): Promise<boolean> {
    if (this.key.isPrivate !== false) throw new Error('RsaDigestSigner not initialised for verification.');
    if (!subtle) throw new Error('WebCrypto (crypto.subtle) is not available.');
    const key = await subtle.importKey('spki', asBufferSource(this.key.spki), { name: 'RSASSA-PKCS1-v1_5', hash: this.hash }, false, ['verify']);
    return subtle.verify('RSASSA-PKCS1-v1_5', key, asBufferSource(signature), asBufferSource(this.data()));
  }
}

class Ed25519DigestSigner extends AccumulatingSigner {
  constructor(private readonly key: Ed25519PrivateKey | Ed25519PublicKey) {
    super();
  }

  override async generateSignature(): Promise<Uint8Array> {
    if (this.key.isPrivate === false) throw new Error('Ed25519DigestSigner not initialised for signing.');
    // MimeKit's Ed25519DigestSigner signs the SHA-256 digest of the data.
    const hash = digestSha256(this.data());
    return ed25519.sign(hash, this.key.raw);
  }

  override async verifySignature(signature: Uint8Array): Promise<boolean> {
    if (this.key.isPrivate !== false) throw new Error('Ed25519DigestSigner not initialised for verification.');
    if (signature.length !== 64) return false;
    const hash = digestSha256(this.data());
    try {
      return ed25519.verify(signature, hash, this.key.raw);
    } catch {
      return false;
    }
  }
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  // Copy into a fresh ArrayBuffer so SubtleCrypto never sees a shared/offset view.
  return bytes.slice().buffer;
}

/**
 * Create a signing/verifying context for the given signature algorithm and key
 * (C#: `DkimSignerBase.CreateSigningContext` / `DkimVerifierBase.CreateVerifyContext`).
 */
export function createDigestSigner(algorithm: 'rsa-sha1' | 'rsa-sha256' | 'ed25519-sha256', key: AsymmetricKey): DigestSigner {
  switch (algorithm) {
  case 'rsa-sha1':
    return new RsaDigestSigner('SHA-1', key as RsaPrivateKey | RsaPublicKey);
  case 'rsa-sha256':
    return new RsaDigestSigner('SHA-256', key as RsaPrivateKey | RsaPublicKey);
  case 'ed25519-sha256':
    return new Ed25519DigestSigner(key as Ed25519PrivateKey | Ed25519PublicKey);
  }
}
