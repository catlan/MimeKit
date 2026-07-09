// PKCS#12 / PFX parsing (RFC 7292).
//
// pkijs's PFXParser delegates SafeContents decryption to a WebCrypto engine,
// which cannot handle the classic pbeWithSHAAnd3-KeyTripleDES-CBC /
// pbeWithSHAAnd40BitRC2-CBC protection used by the MimeKit S/MIME test .pfx
// files. So we walk the PFX structure with asn1js and decrypt the PBES1 bags
// with the userland ciphers in this directory. Certificate field access + chain
// ordering use pkijs's (crypto-free) Certificate class.
//
// Returns raw DER: the ordered certificate chain (leaf first) + the decrypted
// PKCS#8 private key. Higher layers wrap these into X509Certificate /
// AsymmetricKey.

/* eslint-disable no-bitwise */

import * as asn1js from 'asn1js';
import { Certificate } from 'pkijs';
import { passwordToBmp, pkcs12PbeDecrypt } from './pkcs12-kdf.js';

const OID_PKCS7_DATA = '1.2.840.113549.1.7.1';
const OID_PKCS7_ENCRYPTED_DATA = '1.2.840.113549.1.7.6';
const OID_CERT_BAG = '1.2.840.113549.1.12.10.1.3';
const OID_KEY_BAG = '1.2.840.113549.1.12.10.1.1';
const OID_PKCS8_SHROUDED_KEY_BAG = '1.2.840.113549.1.12.10.1.2';
const OID_X509_CERTIFICATE = '1.2.840.113549.1.9.22.1';
const OID_LOCAL_KEY_ID = '1.2.840.113549.1.9.21';

interface CertEntry {
  der: Uint8Array;
  localKeyId: Uint8Array | null;
}

interface KeyEntry {
  pkcs8: Uint8Array;
  localKeyId: Uint8Array | null;
}

/** The raw result of parsing a PKCS#12 file. */
export interface Pkcs12ParseResult {
  /** The certificate chain, ordered leaf-first (following issuer links). */
  certificates: Uint8Array[];
  /** The decrypted PKCS#8 private key (DER), or null if the file had none. */
  privateKey: Uint8Array | null;
}

// Decode a PBES1 AlgorithmIdentifier { OID, SEQUENCE { salt OCTET STRING, iter INTEGER } }.
function decodePbeAlgorithm(algId: asn1js.Sequence): { oid: string; salt: Uint8Array; iterations: number } {
  const oid = (algId.valueBlock.value[0] as asn1js.ObjectIdentifier).getValue();
  const params = algId.valueBlock.value[1] as asn1js.Sequence;
  const salt = octetStringBytes(params.valueBlock.value[0] as asn1js.OctetString);
  const iterations = (params.valueBlock.value[1] as asn1js.Integer).valueBlock.valueDec;
  return { oid, salt, iterations };
}

function octetStringBytes(os: asn1js.OctetString): Uint8Array {
  return new Uint8Array(os.valueBlock.valueHexView);
}

// Read the localKeyId (if any) from a SafeBag's bagAttributes SET.
function readLocalKeyId(attrs: asn1js.Set | null): Uint8Array | null {
  if (!attrs) return null;
  for (const attr of attrs.valueBlock.value as asn1js.Sequence[]) {
    const type = (attr.valueBlock.value[0] as asn1js.ObjectIdentifier).getValue();
    if (type === OID_LOCAL_KEY_ID) {
      const set = attr.valueBlock.value[1] as asn1js.Set;
      const val = set.valueBlock.value[0] as asn1js.OctetString;
      return new Uint8Array(val.valueBlock.valueHexView);
    }
  }
  return null;
}

// Parse a SafeContents (SEQUENCE OF SafeBag) into cert + key entries.
function parseSafeContents(der: Uint8Array, bmp: Uint8Array, certs: CertEntry[], keys: KeyEntry[]): void {
  const asn = asn1js.fromBER(der.slice().buffer);
  if (asn.offset === -1) throw new Error('Invalid PKCS#12 SafeContents.');
  const safeContents = asn.result as asn1js.Sequence;

  for (const bag of safeContents.valueBlock.value as asn1js.Sequence[]) {
    const bagId = (bag.valueBlock.value[0] as asn1js.ObjectIdentifier).getValue();
    // bagValue is [0] EXPLICIT.
    const bagValueCtx = bag.valueBlock.value[1] as asn1js.Constructed;
    const bagValue = bagValueCtx.valueBlock.value[0] as asn1js.BaseBlock;
    const bagAttrs = (bag.valueBlock.value[2] as asn1js.Set | undefined) ?? null;
    const localKeyId = readLocalKeyId(bagAttrs);

    if (bagId === OID_CERT_BAG) {
      const certBag = bagValue as asn1js.Sequence;
      const certType = (certBag.valueBlock.value[0] as asn1js.ObjectIdentifier).getValue();
      if (certType !== OID_X509_CERTIFICATE) continue;
      const certValueCtx = certBag.valueBlock.value[1] as asn1js.Constructed;
      const certOctet = certValueCtx.valueBlock.value[0] as asn1js.OctetString;
      certs.push({ der: octetStringBytes(certOctet), localKeyId });
    } else if (bagId === OID_PKCS8_SHROUDED_KEY_BAG) {
      // EncryptedPrivateKeyInfo { AlgorithmIdentifier, OCTET STRING }.
      const epki = bagValue as asn1js.Sequence;
      const alg = decodePbeAlgorithm(epki.valueBlock.value[0] as asn1js.Sequence);
      const encrypted = octetStringBytes(epki.valueBlock.value[1] as asn1js.OctetString);
      const pkcs8 = pkcs12PbeDecrypt(alg.oid, bmp, alg.salt, alg.iterations, encrypted);
      keys.push({ pkcs8, localKeyId });
    } else if (bagId === OID_KEY_BAG) {
      // Unencrypted PrivateKeyInfo.
      keys.push({ pkcs8: bagValue.valueBeforeDecodeView.slice(), localKeyId });
    }
  }
}

function hex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function equalBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Order the certs leaf-first by following issuer links, starting from `leaf`.
function orderChain(leafDer: Uint8Array, all: CertEntry[]): Uint8Array[] {
  const parsed = all.map((c) => {
    const asn = asn1js.fromBER(c.der.slice().buffer);
    const cert = new Certificate({ schema: asn.result });
    return { der: c.der, subject: cert.subject.toSchema().toBER(), issuer: cert.issuer.toSchema().toBER() };
  });

  const bySubject = new Map<string, { der: Uint8Array; issuer: ArrayBuffer }>();
  for (const p of parsed) bySubject.set(hex(p.subject), { der: p.der, issuer: p.issuer });

  const chain: Uint8Array[] = [];
  const seen = new Set<string>();
  let currentDer = leafDer;

  for (;;) {
    const asn = asn1js.fromBER(currentDer.slice().buffer);
    const cert = new Certificate({ schema: asn.result });
    const subjHex = hex(cert.subject.toSchema().toBER());
    const issuerHex = hex(cert.issuer.toSchema().toBER());
    if (seen.has(subjHex)) break;
    seen.add(subjHex);
    chain.push(currentDer);
    if (issuerHex === subjHex) break; // self-signed root
    const parent = bySubject.get(issuerHex);
    if (!parent || equalBytes(parent.der, currentDer)) break;
    currentDer = parent.der;
  }

  return chain;
}

/**
 * Parse a PKCS#12 / PFX file. Decrypts the (first) private key and returns it
 * with its certificate chain ordered leaf-first. The MAC is not verified
 * (parsing succeeds or a decrypt error is thrown, matching what the tests need).
 */
export function parsePkcs12(data: Uint8Array, password: string): Pkcs12ParseResult {
  const bmp = passwordToBmp(password);
  const asn = asn1js.fromBER(data.slice().buffer);
  if (asn.offset === -1) throw new Error('Invalid PKCS#12 file.');
  const pfx = asn.result as asn1js.Sequence;

  // authSafe = ContentInfo { contentType=pkcs7-data, [0] content OCTET STRING }.
  const authSafe = pfx.valueBlock.value[1] as asn1js.Sequence;
  const authSafeCtx = authSafe.valueBlock.value[1] as asn1js.Constructed;
  const authSafeOctet = authSafeCtx.valueBlock.value[0] as asn1js.OctetString;
  const authSafeDer = octetStringBytes(authSafeOctet);

  const asAsn = asn1js.fromBER(authSafeDer.slice().buffer);
  const authenticatedSafe = asAsn.result as asn1js.Sequence;

  const certs: CertEntry[] = [];
  const keys: KeyEntry[] = [];

  for (const contentInfo of authenticatedSafe.valueBlock.value as asn1js.Sequence[]) {
    const contentType = (contentInfo.valueBlock.value[0] as asn1js.ObjectIdentifier).getValue();
    const contentCtx = contentInfo.valueBlock.value[1] as asn1js.Constructed;

    if (contentType === OID_PKCS7_DATA) {
      const octet = contentCtx.valueBlock.value[0] as asn1js.OctetString;
      parseSafeContents(octetStringBytes(octet), bmp, certs, keys);
    } else if (contentType === OID_PKCS7_ENCRYPTED_DATA) {
      // EncryptedData { version, EncryptedContentInfo }.
      const encryptedData = contentCtx.valueBlock.value[0] as asn1js.Sequence;
      const eci = encryptedData.valueBlock.value[1] as asn1js.Sequence;
      const alg = decodePbeAlgorithm(eci.valueBlock.value[1] as asn1js.Sequence);
      // encryptedContent is [0] IMPLICIT OCTET STRING (primitive).
      const encContentCtx = eci.valueBlock.value[2] as asn1js.BaseBlock;
      const encrypted = new Uint8Array((encContentCtx.valueBlock as unknown as { valueHexView: Uint8Array }).valueHexView);
      const plain = pkcs12PbeDecrypt(alg.oid, bmp, alg.salt, alg.iterations, encrypted);
      parseSafeContents(plain, bmp, certs, keys);
    }
  }

  if (certs.length === 0) return { certificates: [], privateKey: keys[0]?.pkcs8 ?? null };

  const keyEntry = keys[0] ?? null;
  let leaf: CertEntry | undefined;
  if (keyEntry?.localKeyId) leaf = certs.find((c) => equalBytes(c.localKeyId, keyEntry.localKeyId));
  if (!leaf) {
    // Fall back to the cert that is not an issuer of any other cert.
    leaf = certs.find((candidate) => {
      const asnC = asn1js.fromBER(candidate.der.slice().buffer);
      const certC = new Certificate({ schema: asnC.result });
      const subjHex = hex(certC.subject.toSchema().toBER());
      return !certs.some((other) => {
        if (other === candidate) return false;
        const asnO = asn1js.fromBER(other.der.slice().buffer);
        const certO = new Certificate({ schema: asnO.result });
        return hex(certO.issuer.toSchema().toBER()) === subjHex;
      });
    });
  }
  if (!leaf) leaf = certs[0];

  const certificates = orderChain(leaf!.der, certs);
  return { certificates, privateKey: keyEntry?.pkcs8 ?? null };
}
