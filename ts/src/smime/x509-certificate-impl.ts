// Concrete X509Certificate implementation (the crypto backend for wave C2b-1).
//
// Backs the structural X509Certificate seam declared by the C2a foundation
// (x509-certificate.ts). Certificates are parsed with pkijs's (crypto-free)
// Certificate class; individual extensions (KeyUsage, SubjectAltName,
// SMIMECapabilities) are decoded with asn1js. Fingerprints are a synchronous
// SHA-1 via @noble/hashes (the C2a seam's getFingerprint() is sync, unlike
// pkijs/WebCrypto's async digest). Semantics match
// MimeKit/Cryptography/BouncyCastleCertificateExtensions.cs. Isomorphic.

/* eslint-disable no-bitwise */

import { sha1 } from '@noble/hashes/legacy.js';
import * as asn1js from 'asn1js';
import { Certificate } from 'pkijs';
import { EncryptionAlgorithm } from './encryption-algorithm.js';
import type { PublicKeyAlgorithm } from './public-key-algorithm.js';
import { X509KeyUsageFlags, X509KeyUsageBits } from './x509-key-usage-flags.js';
import type { X509Certificate } from './x509-certificate.js';
import { publicKeyAlgorithmFromOid } from './asymmetric-key.js';
import { base64Decode } from '../dkim/crypto.js';

// Distinguished-name attribute OIDs.
const OID_COMMON_NAME = '2.5.4.3';
const OID_EMAIL_ADDRESS = '1.2.840.113549.1.9.1';

// Extension OIDs.
const OID_EXT_KEY_USAGE = '2.5.29.15';
const OID_EXT_SUBJECT_ALT_NAME = '2.5.29.17';
const OID_EXT_SMIME_CAPABILITIES = '1.2.840.113549.1.9.15';

// GeneralName context tag numbers.
const GENERAL_NAME_RFC822 = 1;
const GENERAL_NAME_DNS = 2;

// S/MIME capability content-encryption OIDs (mirrors
// BouncyCastleSecureMimeContext.TryGetEncryptionAlgorithm).
const ENCRYPTION_ALGORITHM_OIDS: Record<string, EncryptionAlgorithm> = {
  '2.16.840.1.101.3.4.1.42': EncryptionAlgorithm.Aes256,
  '2.16.840.1.101.3.4.1.22': EncryptionAlgorithm.Aes192,
  '2.16.840.1.101.3.4.1.2': EncryptionAlgorithm.Aes128,
  '1.2.392.200011.61.1.1.1.4': EncryptionAlgorithm.Camellia256,
  '1.2.392.200011.61.1.1.1.3': EncryptionAlgorithm.Camellia192,
  '1.2.392.200011.61.1.1.1.2': EncryptionAlgorithm.Camellia128,
  '1.2.840.113533.7.66.10': EncryptionAlgorithm.Cast5,
  '1.2.840.113549.3.7': EncryptionAlgorithm.TripleDes,
  '1.3.6.1.4.1.3029.1.2': EncryptionAlgorithm.Blowfish,
  '1.3.6.1.4.1.25258.3.3': EncryptionAlgorithm.Twofish,
  '1.2.410.200004.1.4': EncryptionAlgorithm.Seed,
  '1.3.14.3.2.7': EncryptionAlgorithm.Des,
  '1.3.6.1.4.1.188.7.1.1.2': EncryptionAlgorithm.Idea,
};
const OID_RC2_CBC = '1.2.840.113549.3.2';

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function ia5String(block: asn1js.BaseBlock): string {
  const bytes = new Uint8Array((block.valueBlock as unknown as { valueHexView: Uint8Array }).valueHexView);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/** A parsed X.509 certificate, backed by pkijs + asn1js. */
export class X509CertificateImpl implements X509Certificate {
  private readonly der: Uint8Array;
  private readonly cert: Certificate;
  private _fingerprint: string | null = null;

  constructor(der: Uint8Array) {
    this.der = der.slice();
    const asn = asn1js.fromBER(this.der.slice().buffer);
    if (asn.offset === -1) throw new Error('Invalid X.509 certificate.');
    this.cert = new Certificate({ schema: asn.result });
  }

  /** Parse a single certificate from DER. */
  static fromDer(der: Uint8Array): X509CertificateImpl {
    return new X509CertificateImpl(der);
  }

  /** Parse the first certificate found in PEM text (skips key blocks). */
  static fromPem(text: string): X509CertificateImpl {
    const certs = X509CertificateImpl.fromPemAll(text);
    if (certs.length === 0) throw new Error('No certificate found in PEM.');
    return certs[0]!;
  }

  /** Parse every certificate found in PEM text. */
  static fromPemAll(text: string): X509CertificateImpl[] {
    const out: X509CertificateImpl[] = [];
    const re = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push(new X509CertificateImpl(base64Decode(m[1]!)));
    return out;
  }

  getEncoded(): Uint8Array {
    return this.der.slice();
  }

  getFingerprint(): string {
    if (this._fingerprint === null) this._fingerprint = toHex(sha1(this.der));
    return this._fingerprint;
  }

  getPublicKeyAlgorithm(): PublicKeyAlgorithm {
    return publicKeyAlgorithmFromOid(this.cert.subjectPublicKeyInfo.algorithm.algorithmId);
  }

  getNotBefore(): Date {
    return this.cert.notBefore.value;
  }

  getNotAfter(): Date {
    return this.cert.notAfter.value;
  }

  private getDnValue(oid: string): string | null {
    for (const tv of this.cert.subject.typesAndValues) {
      if (tv.type === oid) {
        const value = (tv.value.valueBlock as unknown as { value: string }).value;
        return value ?? null;
      }
    }
    return null;
  }

  getCommonName(): string | null {
    return this.getDnValue(OID_COMMON_NAME);
  }

  private getExtensionValue(oid: string): Uint8Array | null {
    for (const ext of this.cert.extensions ?? []) {
      if (ext.extnID === oid) return new Uint8Array(ext.extnValue.valueBlock.valueHexView);
    }
    return null;
  }

  // Return the GeneralName string values with the given context tag.
  private getSubjectAltNames(tagNo: number): string[] {
    const raw = this.getExtensionValue(OID_EXT_SUBJECT_ALT_NAME);
    if (!raw) return [];
    const asn = asn1js.fromBER(raw.slice().buffer);
    if (asn.offset === -1) return [];
    const seq = asn.result as asn1js.Sequence;
    const names: string[] = [];
    for (const name of seq.valueBlock.value as asn1js.BaseBlock[]) {
      if (name.idBlock.tagClass === 3 && name.idBlock.tagNumber === tagNo) names.push(ia5String(name));
    }
    return names;
  }

  getSubjectEmailAddress(): string | null {
    const dn = this.getDnValue(OID_EMAIL_ADDRESS);
    if (dn) return dn;
    const rfc822 = this.getSubjectAltNames(GENERAL_NAME_RFC822);
    return rfc822.length > 0 ? rfc822[0]! : null;
  }

  getSubjectDnsNames(): string[] {
    return this.getSubjectAltNames(GENERAL_NAME_DNS);
  }

  getKeyUsageFlags(): X509KeyUsageFlags {
    const raw = this.getExtensionValue(OID_EXT_KEY_USAGE);
    // No KeyUsage extension => BouncyCastle GetKeyUsage() returns null, which
    // GetKeyUsageFlags(null) maps to every flag being set.
    if (!raw) return keyUsageFlagsFromBits(null);

    const asn = asn1js.fromBER(raw.slice().buffer);
    if (asn.offset === -1) return keyUsageFlagsFromBits(null);
    const bitString = asn.result as asn1js.BitString;
    const bytes = new Uint8Array(bitString.valueBlock.valueHexView);
    const usage: boolean[] = [];
    for (let i = 0; i < 9; i++) {
      const byteIndex = i >> 3;
      const bitIndex = 7 - (i & 7);
      usage.push(byteIndex < bytes.length ? ((bytes[byteIndex]! >> bitIndex) & 1) === 1 : false);
    }
    return keyUsageFlagsFromBits(usage);
  }

  getEncryptionAlgorithms(): EncryptionAlgorithm[] {
    const raw = this.getExtensionValue(OID_EXT_SMIME_CAPABILITIES);
    if (raw) {
      const decoded = decodeEncryptionAlgorithms(raw);
      if (decoded) return decoded;
    }
    return [EncryptionAlgorithm.TripleDes];
  }

  equals(other: X509Certificate): boolean {
    if (other === this) return true;
    const a = this.der;
    const b = other.getEncoded();
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
}

// Port of BouncyCastleCertificateExtensions.GetKeyUsageFlags(bool[]).
function keyUsageFlagsFromBits(usage: boolean[] | null): X509KeyUsageFlags {
  let flags = X509KeyUsageFlags.None;
  const on = (bit: X509KeyUsageBits): boolean => usage === null || usage[bit] === true;
  if (on(X509KeyUsageBits.DigitalSignature)) flags |= X509KeyUsageFlags.DigitalSignature;
  if (on(X509KeyUsageBits.NonRepudiation)) flags |= X509KeyUsageFlags.NonRepudiation;
  if (on(X509KeyUsageBits.KeyEncipherment)) flags |= X509KeyUsageFlags.KeyEncipherment;
  if (on(X509KeyUsageBits.DataEncipherment)) flags |= X509KeyUsageFlags.DataEncipherment;
  if (on(X509KeyUsageBits.KeyAgreement)) flags |= X509KeyUsageFlags.KeyAgreement;
  if (on(X509KeyUsageBits.KeyCertSign)) flags |= X509KeyUsageFlags.KeyCertSign;
  if (on(X509KeyUsageBits.CrlSign)) flags |= X509KeyUsageFlags.CrlSign;
  if (on(X509KeyUsageBits.EncipherOnly)) flags |= X509KeyUsageFlags.EncipherOnly;
  if (on(X509KeyUsageBits.DecipherOnly)) flags |= X509KeyUsageFlags.DecipherOnly;
  return flags;
}

// Decode a DER SMIMECapabilities value into the recognized EncryptionAlgorithms.
function decodeEncryptionAlgorithms(raw: Uint8Array): EncryptionAlgorithm[] | null {
  const asn = asn1js.fromBER(raw.slice().buffer);
  if (asn.offset === -1 || !(asn.result instanceof asn1js.Sequence)) return null;
  const algorithms: EncryptionAlgorithm[] = [];

  for (const cap of asn.result.valueBlock.value as asn1js.Sequence[]) {
    const oid = (cap.valueBlock.value[0] as asn1js.ObjectIdentifier).getValue();
    const mapped = ENCRYPTION_ALGORITHM_OIDS[oid];
    if (mapped !== undefined) {
      algorithms.push(mapped);
      continue;
    }
    if (oid === OID_RC2_CBC) {
      const rc2 = decodeRc2Capability(cap.valueBlock.value[1] as asn1js.BaseBlock | undefined);
      if (rc2 !== null) algorithms.push(rc2);
    }
  }

  return algorithms;
}

// RC2 S/MIME capability: parameters carry the RC2 version (DER SEQUENCE with a
// leading INTEGER, or a bare INTEGER of key bits).
function decodeRc2Capability(params: asn1js.BaseBlock | undefined): EncryptionAlgorithm | null {
  if (!params) return null;
  if (params instanceof asn1js.Sequence) {
    const version = (params.valueBlock.value[0] as asn1js.Integer).valueBlock.valueDec;
    switch (version) {
      case 58: return EncryptionAlgorithm.RC2128;
      case 120: return EncryptionAlgorithm.RC264;
      case 160: return EncryptionAlgorithm.RC240;
      default: return null;
    }
  }
  if (params instanceof asn1js.Integer) {
    switch (params.valueBlock.valueDec) {
      case 128: return EncryptionAlgorithm.RC2128;
      case 64: return EncryptionAlgorithm.RC264;
      case 40: return EncryptionAlgorithm.RC240;
      default: return null;
    }
  }
  return null;
}
