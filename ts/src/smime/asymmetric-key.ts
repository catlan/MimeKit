// Concrete AsymmetricKey implementations (the crypto backend for wave C2b-1).
//
// The C2a foundation (x509-certificate.ts) only declares the structural
// AsymmetricKey seam ({ isPrivate }). Here we back it with real key material:
// private keys as PKCS#8 DER and public keys as SubjectPublicKeyInfo DER, each
// tagged with the detected PublicKeyAlgorithm. WebCrypto import (for the actual
// CMS sign/verify/encrypt in C2b-2) happens against these DER blobs; this wave
// only parses + carries them. Isomorphic — no node:crypto.

/* eslint-disable no-bitwise */

import * as asn1js from 'asn1js';
import { PublicKeyAlgorithm } from './public-key-algorithm.js';
import type { AsymmetricKey } from './x509-certificate.js';
import { base64Decode } from '../dkim/crypto.js';

// Public-key algorithm OIDs (mirrors BouncyCastle's GetPublicKeyAlgorithm map).
const OID_RSA = '1.2.840.113549.1.1.1';
const OID_RSASSA_PSS = '1.2.840.113549.1.1.10';
const OID_DSA = '1.2.840.10040.4.1';
const OID_EC = '1.2.840.10045.2.1';
const OID_DH = '1.2.840.10046.2.1';
const OID_DH_KEY_AGREEMENT = '1.2.840.113549.1.3.1';
const OID_ELGAMAL = '1.3.14.7.2.1.1';

/** Map a public-key algorithm OID to a {@link PublicKeyAlgorithm}. */
export function publicKeyAlgorithmFromOid(oid: string): PublicKeyAlgorithm {
  switch (oid) {
    case OID_RSA:
    case OID_RSASSA_PSS:
      return PublicKeyAlgorithm.RsaGeneral;
    case OID_DSA:
      return PublicKeyAlgorithm.Dsa;
    case OID_EC:
      return PublicKeyAlgorithm.EllipticCurve;
    case OID_DH:
    case OID_DH_KEY_AGREEMENT:
      return PublicKeyAlgorithm.DiffieHellman;
    case OID_ELGAMAL:
      return PublicKeyAlgorithm.ElGamalGeneral;
    default:
      return PublicKeyAlgorithm.None;
  }
}

/** The interface implemented by the concrete key types (adds the algorithm). */
export interface X509AsymmetricKey extends AsymmetricKey {
  readonly algorithm: PublicKeyAlgorithm;
}

/** A private key backed by a PKCS#8 PrivateKeyInfo DER blob. */
export class X509PrivateKey implements X509AsymmetricKey {
  readonly isPrivate = true;
  constructor(
    /** The PKCS#8 (PrivateKeyInfo) DER encoding. */
    readonly pkcs8: Uint8Array,
    readonly algorithm: PublicKeyAlgorithm,
  ) {}
}

/** A public key backed by a SubjectPublicKeyInfo DER blob. */
export class X509PublicKey implements X509AsymmetricKey {
  readonly isPrivate = false;
  constructor(
    /** The SubjectPublicKeyInfo DER encoding. */
    readonly spki: Uint8Array,
    readonly algorithm: PublicKeyAlgorithm,
  ) {}
}

function parseSeq(der: Uint8Array): asn1js.Sequence {
  const asn = asn1js.fromBER(der.slice().buffer);
  if (asn.offset === -1) throw new Error('Invalid DER.');
  return asn.result as asn1js.Sequence;
}

/** Read the algorithm OID from a PKCS#8 PrivateKeyInfo DER. */
export function privateKeyAlgorithmOid(pkcs8: Uint8Array): string {
  const info = parseSeq(pkcs8);
  const alg = info.valueBlock.value[1] as asn1js.Sequence;
  return (alg.valueBlock.value[0] as asn1js.ObjectIdentifier).getValue();
}

/** Read the algorithm OID from a SubjectPublicKeyInfo DER. */
export function spkiAlgorithmOid(spki: Uint8Array): string {
  const info = parseSeq(spki);
  const alg = info.valueBlock.value[0] as asn1js.Sequence;
  return (alg.valueBlock.value[0] as asn1js.ObjectIdentifier).getValue();
}

/** Wrap a PKCS#8 DER blob as a private key, detecting the algorithm. */
export function importPrivateKeyFromPkcs8(pkcs8: Uint8Array): X509PrivateKey {
  return new X509PrivateKey(pkcs8, publicKeyAlgorithmFromOid(privateKeyAlgorithmOid(pkcs8)));
}

/** Wrap a SubjectPublicKeyInfo DER blob as a public key, detecting the algorithm. */
export function importPublicKeyFromSpki(spki: Uint8Array): X509PublicKey {
  return new X509PublicKey(spki, publicKeyAlgorithmFromOid(spkiAlgorithmOid(spki)));
}

// ---- PEM helpers ------------------------------------------------------------

interface PemBlock {
  tag: string;
  der: Uint8Array;
}

function parsePemBlocks(text: string): PemBlock[] {
  const blocks: PemBlock[] = [];
  const re = /-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) blocks.push({ tag: m[1]!.trim(), der: base64Decode(m[2]!) });
  return blocks;
}

// rsaEncryption AlgorithmIdentifier: SEQUENCE { OID 1.2.840.113549.1.1.1, NULL }.
const RSA_ALGID = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];

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

/** Wrap a PKCS#1 RSAPrivateKey DER as a PKCS#8 PrivateKeyInfo DER. */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = [0x02, 0x01, 0x00];
  const octet = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  return derSequence(version, RSA_ALGID, octet);
}

// Build a SubjectPublicKeyInfo DER for an RSA key from its PKCS#1 RSAPublicKey DER.
function rsaSpkiFromPkcs1Public(rsaPublicKey: Uint8Array): Uint8Array {
  const bitString = [0x03, ...derLength(rsaPublicKey.length + 1), 0x00, ...rsaPublicKey];
  return derSequence(RSA_ALGID, bitString);
}

// Extract the RSAPublicKey (modulus + publicExponent) DER from a PKCS#1 RSAPrivateKey DER.
function rsaPublicFromPrivatePkcs1(pkcs1: Uint8Array): Uint8Array {
  const seq = parseSeq(pkcs1);
  const modulus = seq.valueBlock.value[1] as asn1js.Integer;
  const exponent = seq.valueBlock.value[2] as asn1js.Integer;
  const rsaPublic = new asn1js.Sequence({ value: [modulus, exponent] });
  return new Uint8Array(rsaPublic.toBER());
}

/**
 * Load a private key from PEM text. Supports PKCS#8 (`PRIVATE KEY`, any
 * algorithm) and PKCS#1 (`RSA PRIVATE KEY`).
 */
export function loadPrivateKeyFromPem(text: string): X509PrivateKey {
  for (const block of parsePemBlocks(text)) {
    if (block.tag === 'PRIVATE KEY') return importPrivateKeyFromPkcs8(block.der);
    if (block.tag === 'RSA PRIVATE KEY') return new X509PrivateKey(pkcs1ToPkcs8(block.der), PublicKeyAlgorithm.RsaGeneral);
  }
  throw new Error('No private key found in PEM.');
}

/**
 * Load a public key from PEM text. Supports `PUBLIC KEY` (SubjectPublicKeyInfo),
 * `RSA PUBLIC KEY` (PKCS#1), and derives the public key from an `RSA PRIVATE KEY`.
 */
export function loadPublicKeyFromPem(text: string): X509PublicKey {
  for (const block of parsePemBlocks(text)) {
    if (block.tag === 'PUBLIC KEY') return importPublicKeyFromSpki(block.der);
    if (block.tag === 'RSA PUBLIC KEY') return new X509PublicKey(rsaSpkiFromPkcs1Public(block.der), PublicKeyAlgorithm.RsaGeneral);
    if (block.tag === 'RSA PRIVATE KEY')
      return new X509PublicKey(rsaSpkiFromPkcs1Public(rsaPublicFromPrivatePkcs1(block.der)), PublicKeyAlgorithm.RsaGeneral);
  }
  throw new Error('No public key found in PEM.');
}
