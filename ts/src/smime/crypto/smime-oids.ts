// OID constants and algorithm maps shared by the concrete CMS engine
// (cms-signed / cms-enveloped / cms-compressed / pkijs-secure-mime-context).
//
// Mirrors the OIDs BouncyCastleSecureMimeContext uses so the produced wire
// format is byte-compatible with MimeKit (and therefore the wider S/MIME world).

import { DigestAlgorithm } from '../digest-algorithm.js';
import { EncryptionAlgorithm } from '../encryption-algorithm.js';

// CMS content types (RFC 5652).
export const OID_DATA = '1.2.840.113549.1.7.1';
export const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
export const OID_ENVELOPED_DATA = '1.2.840.113549.1.7.3';
export const OID_COMPRESSED_DATA = '1.2.840.113549.1.9.16.1.9';

// CMS signed attributes (RFC 5652 / RFC 5751).
export const OID_ATTR_CONTENT_TYPE = '1.2.840.113549.1.9.3';
export const OID_ATTR_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
export const OID_ATTR_SIGNING_TIME = '1.2.840.113549.1.9.5';
export const OID_ATTR_SMIME_CAPABILITIES = '1.2.840.113549.1.9.15';

// Compression (RFC 3274).
export const OID_ZLIB = '1.2.840.113549.1.9.16.3.8';

// Public-key / key-transport OIDs.
export const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
export const OID_RSAES_OAEP = '1.2.840.113549.1.1.7';
export const OID_RSASSA_PSS = '1.2.840.113549.1.1.10';
export const OID_MGF1 = '1.2.840.113549.1.1.8';
export const OID_EC_PUBLIC_KEY = '1.2.840.10045.2.1';

// Digest OIDs.
export const DIGEST_OID: Record<number, string> = {
  [DigestAlgorithm.Sha1]: '1.3.14.3.2.26',
  [DigestAlgorithm.Sha224]: '2.16.840.1.101.3.4.2.4',
  [DigestAlgorithm.Sha256]: '2.16.840.1.101.3.4.2.1',
  [DigestAlgorithm.Sha384]: '2.16.840.1.101.3.4.2.2',
  [DigestAlgorithm.Sha512]: '2.16.840.1.101.3.4.2.3',
  [DigestAlgorithm.MD5]: '1.2.840.113549.2.5',
};

export const DIGEST_BY_OID: Record<string, DigestAlgorithm> = Object.fromEntries(
  Object.entries(DIGEST_OID).map(([k, v]) => [v, Number(k) as DigestAlgorithm]),
);

/** The WebCrypto hash name for a digest algorithm. */
export function webCryptoHashName(algo: DigestAlgorithm): 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' {
  switch (algo) {
    case DigestAlgorithm.Sha1: return 'SHA-1';
    case DigestAlgorithm.Sha256: return 'SHA-256';
    case DigestAlgorithm.Sha384: return 'SHA-384';
    case DigestAlgorithm.Sha512: return 'SHA-512';
    default:
      throw new Error(`Digest algorithm ${DigestAlgorithm[algo] ?? algo} is not supported by WebCrypto.`);
  }
}

// Content-encryption OIDs (RFC 3565 / RFC 5751).
export const OID_AES128_CBC = '2.16.840.1.101.3.4.1.2';
export const OID_AES192_CBC = '2.16.840.1.101.3.4.1.22';
export const OID_AES256_CBC = '2.16.840.1.101.3.4.1.42';
export const OID_DES_EDE3_CBC = '1.2.840.113549.3.7';
export const OID_RC2_CBC = '1.2.840.113549.3.2';
export const OID_DES_CBC = '1.3.14.3.2.7';

/** The content-encryption OID for an {@link EncryptionAlgorithm}. */
export function contentEncryptionOid(algo: EncryptionAlgorithm): string {
  switch (algo) {
    case EncryptionAlgorithm.Aes128: return OID_AES128_CBC;
    case EncryptionAlgorithm.Aes192: return OID_AES192_CBC;
    case EncryptionAlgorithm.Aes256: return OID_AES256_CBC;
    case EncryptionAlgorithm.TripleDes: return OID_DES_EDE3_CBC;
    case EncryptionAlgorithm.RC240:
    case EncryptionAlgorithm.RC264:
    case EncryptionAlgorithm.RC2128: return OID_RC2_CBC;
    default:
      throw new Error(`The ${EncryptionAlgorithm[algo] ?? algo} encryption algorithm is not supported.`);
  }
}

/** The CEK length in bytes for a content-encryption algorithm. */
export function contentKeyLength(algo: EncryptionAlgorithm): number {
  switch (algo) {
    case EncryptionAlgorithm.Aes128: return 16;
    case EncryptionAlgorithm.Aes192: return 24;
    case EncryptionAlgorithm.Aes256: return 32;
    case EncryptionAlgorithm.TripleDes: return 24;
    case EncryptionAlgorithm.RC240: return 5;
    case EncryptionAlgorithm.RC264: return 8;
    case EncryptionAlgorithm.RC2128: return 16;
    default:
      throw new Error(`The ${EncryptionAlgorithm[algo] ?? algo} encryption algorithm is not supported.`);
  }
}

/** The CBC block size in bytes for a content-encryption algorithm. */
export function contentBlockSize(algo: EncryptionAlgorithm): number {
  switch (algo) {
    case EncryptionAlgorithm.Aes128:
    case EncryptionAlgorithm.Aes192:
    case EncryptionAlgorithm.Aes256: return 16;
    default: return 8; // 3DES / RC2 / DES
  }
}

// The RC2 "version" encoding used in the RC2-CBC parameters (RFC 2268 / 3370):
// a table mapping effective key bits -> version number (asn1 INTEGER).
export const RC2_BITS_TO_VERSION: Record<number, number> = { 40: 160, 64: 120, 128: 58 };
export const RC2_VERSION_TO_BITS: Record<number, number> = { 160: 40, 120: 64, 58: 128 };

/** The RC2 effective key bits for an RC2 {@link EncryptionAlgorithm}. */
export function rc2EffectiveBits(algo: EncryptionAlgorithm): number {
  switch (algo) {
    case EncryptionAlgorithm.RC240: return 40;
    case EncryptionAlgorithm.RC264: return 64;
    case EncryptionAlgorithm.RC2128: return 128;
    default:
      throw new Error('Not an RC2 algorithm.');
  }
}

/** Map a content-encryption OID (+ optional RC2 bits) to an {@link EncryptionAlgorithm}. */
export function encryptionAlgorithmFromOid(oid: string, rc2Bits?: number): EncryptionAlgorithm {
  switch (oid) {
    case OID_AES128_CBC: return EncryptionAlgorithm.Aes128;
    case OID_AES192_CBC: return EncryptionAlgorithm.Aes192;
    case OID_AES256_CBC: return EncryptionAlgorithm.Aes256;
    case OID_DES_EDE3_CBC: return EncryptionAlgorithm.TripleDes;
    case OID_DES_CBC: return EncryptionAlgorithm.Des;
    case OID_RC2_CBC:
      if (rc2Bits === 40) return EncryptionAlgorithm.RC240;
      if (rc2Bits === 64) return EncryptionAlgorithm.RC264;
      return EncryptionAlgorithm.RC2128;
    default:
      throw new Error(`Unsupported content-encryption algorithm OID: ${oid}`);
  }
}
