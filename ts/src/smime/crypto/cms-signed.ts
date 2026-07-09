// CMS SignedData build + parse (RFC 5652 §5) for the concrete S/MIME context.
// Handles both DETACHED (multipart/signed) and ATTACHED / encapsulated
// (application/pkcs7-mime; smime-type=signed-data) signatures.
//
// The signature itself rides pkijs's SignedData.sign/verify (which correctly
// handles ECDSA DER conversion and RSA-PSS parameters over WebCrypto); we
// populate the signed attributes (content-type, signing-time, message-digest,
// S/MIME capabilities) exactly as BouncyCastleSecureMimeContext does so the wire
// format interoperates with MimeKit.

/* eslint-disable no-bitwise */

import * as asn1js from 'asn1js';
import {
  ContentInfo, SignedData, SignerInfo, SignedAndUnsignedAttributes, Attribute,
  EncapsulatedContentInfo, IssuerAndSerialNumber, Certificate,
} from 'pkijs';
import { DigestAlgorithm } from '../digest-algorithm.js';
import { EncryptionAlgorithm } from '../encryption-algorithm.js';
import { SubjectIdentifierType } from '../subject-identifier-type.js';
import { PublicKeyAlgorithm } from '../public-key-algorithm.js';
import { RsaSignaturePaddingScheme } from '../rsa-signature-padding-scheme.js';
import type { RsaSignaturePadding } from '../rsa-signature-padding.js';
import {
  OID_SIGNED_DATA, OID_DATA, OID_ATTR_MESSAGE_DIGEST,
  OID_ATTR_SIGNING_TIME, OID_ATTR_SMIME_CAPABILITIES, OID_ATTR_CONTENT_TYPE, OID_EC_PUBLIC_KEY,
  DIGEST_OID, DIGEST_BY_OID,
  contentEncryptionOid, webCryptoHashName, OID_RC2_CBC, rc2EffectiveBits, RC2_BITS_TO_VERSION,
} from './smime-oids.js';
import { ensureEngine, ab, digest } from './smime-webcrypto.js';

/** Material needed to produce a SignedData for one signer. */
export interface SignMaterial {
  certChainDer: Uint8Array[]; // leaf-first
  pkcs8: Uint8Array;
  publicKeyAlgorithm: PublicKeyAlgorithm;
  digestAlgorithm: DigestAlgorithm;
  signerIdentifierType: SubjectIdentifierType;
  rsaSignaturePadding: RsaSignaturePadding | null;
  /** S/MIME capabilities to advertise (the context's enabled algorithms). */
  capabilities: EncryptionAlgorithm[];
}

function parseCert(der: Uint8Array): Certificate {
  return new Certificate({ schema: asn1js.fromBER(ab(der)).result });
}

// ---- EC named curve ---------------------------------------------------------

const EC_CURVE_BY_OID: Record<string, string> = {
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
};

/**
 * The WebCrypto named curve for an EC certificate. The test certs use explicit
 * EC parameters (not a namedCurve OID), so we derive the curve from the public
 * point length (0x04 || X || Y) — WebCrypto then matches the explicit params.
 */
function ecNamedCurveFromCert(cert: Certificate): string {
  const params = cert.subjectPublicKeyInfo.algorithm.algorithmParams as asn1js.ObjectIdentifier | undefined;
  const oid = params?.getValue?.();
  if (oid && EC_CURVE_BY_OID[oid]) return EC_CURVE_BY_OID[oid]!;

  const point = cert.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
  switch (point.byteLength) {
    case 65: return 'P-256';
    case 97: return 'P-384';
    case 133: return 'P-521';
    default: throw new Error(`Unsupported EC public key length ${point.byteLength}.`);
  }
}

// ---- WebCrypto private-key import for signing -------------------------------

async function importSigningKey(material: SignMaterial, cert: Certificate): Promise<CryptoKey> {
  const subtle = ensureEngine();
  const hash = webCryptoHashName(material.digestAlgorithm);
  if (material.publicKeyAlgorithm === PublicKeyAlgorithm.EllipticCurve) {
    const namedCurve = ecNamedCurveFromCert(cert);
    return subtle.importKey('pkcs8', ab(material.pkcs8), { name: 'ECDSA', namedCurve }, false, ['sign']);
  }
  const isPss = material.rsaSignaturePadding?.scheme === RsaSignaturePaddingScheme.Pss;
  const name = isPss ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5';
  return subtle.importKey('pkcs8', ab(material.pkcs8), { name, hash }, false, ['sign']);
}

// ---- S/MIME capabilities attribute ------------------------------------------

function buildSmimeCapabilities(algos: EncryptionAlgorithm[]): asn1js.Sequence {
  const caps: asn1js.Sequence[] = [];
  for (const algo of algos) {
    try {
      const oid = contentEncryptionOid(algo);
      if (oid === OID_RC2_CBC) {
        caps.push(new asn1js.Sequence({ value: [
          new asn1js.ObjectIdentifier({ value: oid }),
          new asn1js.Integer({ value: RC2_BITS_TO_VERSION[rc2EffectiveBits(algo)]! }),
        ] }));
      } else {
        caps.push(new asn1js.Sequence({ value: [ new asn1js.ObjectIdentifier({ value: oid }) ] }));
      }
    } catch {
      // Skip algorithms without a content-encryption OID.
    }
  }
  return new asn1js.Sequence({ value: caps });
}

// ---- build ------------------------------------------------------------------

/** Build a CMS SignedData ContentInfo (DER). `encapsulate` embeds the content. */
export async function buildSignedData(
  material: SignMaterial,
  content: Uint8Array,
  encapsulate: boolean,
): Promise<Uint8Array> {
  const leaf = parseCert(material.certChainDer[0]!);
  const privKey = await importSigningKey(material, leaf);
  const hashName = webCryptoHashName(material.digestAlgorithm);
  const messageDigest = await digest(hashName, content);

  const attributes: Attribute[] = [
    new Attribute({ type: OID_ATTR_CONTENT_TYPE, values: [ new asn1js.ObjectIdentifier({ value: OID_DATA }) ] }),
    new Attribute({ type: OID_ATTR_SIGNING_TIME, values: [ new asn1js.UTCTime({ valueDate: new Date() }) ] }),
    new Attribute({ type: OID_ATTR_MESSAGE_DIGEST, values: [ new asn1js.OctetString({ valueHex: ab(messageDigest) }) ] }),
    new Attribute({ type: OID_ATTR_SMIME_CAPABILITIES, values: [ buildSmimeCapabilities(material.capabilities) ] }),
  ];

  const useSki = material.signerIdentifierType === SubjectIdentifierType.SubjectKeyIdentifier;
  const signerInfoParams: ConstructorParameters<typeof SignerInfo>[0] = {
    version: useSki ? 3 : 1,
    signedAttrs: new SignedAndUnsignedAttributes({ type: 0, attributes }),
  };
  if (useSki) {
    const ski = subjectKeyIdentifier(leaf);
    if (!ski) throw new Error('Signer certificate has no SubjectKeyIdentifier extension.');
    signerInfoParams.sid = new asn1js.Primitive({ idBlock: { tagClass: 3, tagNumber: 0 }, valueHex: ab(ski) });
  } else {
    signerInfoParams.sid = new IssuerAndSerialNumber({ issuer: leaf.issuer, serialNumber: leaf.serialNumber });
  }

  const certificates = material.certChainDer.map((der) => parseCert(der));

  const encap = new EncapsulatedContentInfo({ eContentType: OID_DATA });
  if (encapsulate) encap.eContent = new asn1js.OctetString({ valueHex: ab(content) });

  const signed = new SignedData({
    version: 1,
    encapContentInfo: encap,
    signerInfos: [ new SignerInfo(signerInfoParams) ],
    certificates,
  });

  await signed.sign(privKey, 0, hashName, ab(content));

  const contentInfo = new ContentInfo({ contentType: OID_SIGNED_DATA, content: signed.toSchema(true) });
  return new Uint8Array(contentInfo.toSchema().toBER(false));
}

function subjectKeyIdentifier(cert: Certificate): Uint8Array | null {
  for (const ext of cert.extensions ?? []) {
    if (ext.extnID === '2.5.29.14') {
      const octet = asn1js.fromBER(ext.extnValue.valueBlock.valueHexView.slice().buffer).result as asn1js.OctetString;
      return new Uint8Array(octet.valueBlock.valueHexView);
    }
  }
  return null;
}

// ---- parse ------------------------------------------------------------------

export interface ParsedSignedData {
  signedData: SignedData;
  certificates: Certificate[];
  /** The embedded content for encapsulated signatures, else null. */
  eContent: Uint8Array | null;
}

/** Parse a CMS SignedData ContentInfo (DER). */
export function parseSignedData(der: Uint8Array): ParsedSignedData {
  const contentInfo = new ContentInfo({ schema: asn1js.fromBER(ab(der)).result });
  const signedData = new SignedData({ schema: contentInfo.content });
  const certificates = (signedData.certificates ?? []).filter((c): c is Certificate => c instanceof Certificate);

  let eContent: Uint8Array | null = null;
  const eco = signedData.encapContentInfo.eContent;
  if (eco) {
    const inner = eco.valueBlock.value as asn1js.OctetString[] | undefined;
    if (inner && inner.length > 0) {
      let total = 0;
      const parts = inner.map((c) => new Uint8Array(c.valueBlock.valueHexView));
      for (const p of parts) total += p.length;
      eContent = new Uint8Array(total);
      let pos = 0;
      for (const p of parts) { eContent.set(p, pos); pos += p.length; }
    } else {
      eContent = new Uint8Array(eco.valueBlock.valueHexView);
    }
  }

  return { signedData, certificates, eContent };
}

/** Find the certificate for a signer info by its sid (issuerAndSerial or SKI). */
export function findSignerCertificate(parsed: ParsedSignedData, signerIndex: number): Certificate | null {
  const si = parsed.signedData.signerInfos[signerIndex];
  if (!si) return null;
  const sid = si.sid;
  if (sid instanceof IssuerAndSerialNumber) {
    const issuer = new Uint8Array(sid.issuer.toSchema().toBER(false));
    const serial = new Uint8Array(sid.serialNumber.valueBlock.valueHexView);
    for (const cert of parsed.certificates) {
      const ci = new Uint8Array(cert.issuer.toSchema().toBER(false));
      const cs = new Uint8Array(cert.serialNumber.valueBlock.valueHexView);
      if (bytesEqual(issuer, ci) && bytesEqual(serial, cs)) return cert;
    }
  } else {
    // SubjectKeyIdentifier primitive [0]
    const ski = new Uint8Array((sid as asn1js.Primitive).valueBlock.valueHexView);
    for (const cert of parsed.certificates) {
      const certSki = subjectKeyIdentifier(cert);
      if (certSki && bytesEqual(ski, certSki)) return cert;
    }
  }
  return null;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---- signed-attribute extraction (for SecureMimeDigitalSignature) -----------

function findAttribute(si: SignerInfo, type: string): Attribute | null {
  for (const attr of si.signedAttrs?.attributes ?? []) if (attr.type === type) return attr;
  return null;
}

/** The signing time from a signer info's signed attributes, if present. */
export function extractSigningTime(si: SignerInfo): Date | null {
  const attr = findAttribute(si, OID_ATTR_SIGNING_TIME);
  const value = attr?.values[0] as asn1js.UTCTime | asn1js.GeneralizedTime | undefined;
  return value?.toDate ? value.toDate() : (value as { valueDate?: Date })?.valueDate ?? null;
}

/** The digest algorithm identified by a signer info. */
export function extractDigestAlgorithm(si: SignerInfo): DigestAlgorithm {
  const oid = si.digestAlgorithm.algorithmId;
  return DIGEST_BY_OID[oid] ?? DigestAlgorithm.None;
}

/** The S/MIME capabilities (encryption algorithms) from a signer info. */
export function extractSmimeCapabilities(si: SignerInfo): EncryptionAlgorithm[] {
  const attr = findAttribute(si, OID_ATTR_SMIME_CAPABILITIES);
  const seq = attr?.values[0] as asn1js.Sequence | undefined;
  if (!seq || !(seq instanceof asn1js.Sequence)) return [];
  const out: EncryptionAlgorithm[] = [];
  const OID_MAP: Record<string, EncryptionAlgorithm> = {
    '2.16.840.1.101.3.4.1.42': EncryptionAlgorithm.Aes256,
    '2.16.840.1.101.3.4.1.22': EncryptionAlgorithm.Aes192,
    '2.16.840.1.101.3.4.1.2': EncryptionAlgorithm.Aes128,
    '1.2.840.113549.3.7': EncryptionAlgorithm.TripleDes,
  };
  for (const cap of seq.valueBlock.value as asn1js.Sequence[]) {
    const oid = (cap.valueBlock.value[0] as asn1js.ObjectIdentifier).getValue();
    const mapped = OID_MAP[oid];
    if (mapped !== undefined) out.push(mapped);
  }
  return out;
}

/** Verify one signer info against `data` (detached) or the embedded content. */
export async function verifySignerInfo(
  parsed: ParsedSignedData,
  signerIndex: number,
  detachedContent: Uint8Array | null,
): Promise<boolean> {
  const subtle = ensureEngine();
  const cert = findSignerCertificate(parsed, signerIndex);

  // The test EC certs carry explicit EC parameters, which pkijs cannot parse for
  // verification. Verify ECDSA ourselves over WebCrypto (curve derived from the
  // public point), matching what pkijs does for RSA.
  if (cert && cert.subjectPublicKeyInfo.algorithm.algorithmId === OID_EC_PUBLIC_KEY) {
    return verifyEcdsaSignerInfo(subtle, parsed, signerIndex, cert, detachedContent);
  }

  const params: { signer: number; checkChain: boolean; data?: ArrayBuffer } = { signer: signerIndex, checkChain: false };
  if (detachedContent !== null) params.data = ab(detachedContent);
  const result = await parsed.signedData.verify(params);
  return typeof result === 'boolean' ? result : !!(result as { signatureVerified?: boolean }).signatureVerified;
}

const EC_FIELD_BYTES: Record<string, number> = { 'P-256': 32, 'P-384': 48, 'P-521': 66 };

/** Convert a DER ECDSA-Sig-Value (SEQUENCE{r,s}) to IEEE-P1363 (r||s). */
function derEcdsaToP1363(der: Uint8Array, fieldBytes: number): Uint8Array {
  const seq = asn1js.fromBER(der.slice().buffer).result as asn1js.Sequence;
  const r = new Uint8Array((seq.valueBlock.value[0] as asn1js.Integer).valueBlock.valueHexView);
  const s = new Uint8Array((seq.valueBlock.value[1] as asn1js.Integer).valueBlock.valueHexView);
  const out = new Uint8Array(fieldBytes * 2);
  const place = (v: Uint8Array, offset: number): void => {
    let start = 0;
    while (start < v.length && v[start] === 0) start++; // strip DER sign/zero padding
    const len = v.length - start;
    out.set(v.subarray(start), offset + fieldBytes - len);
  };
  place(r, 0);
  place(s, fieldBytes);
  return out;
}

async function verifyEcdsaSignerInfo(
  subtle: SubtleCrypto,
  parsed: ParsedSignedData,
  signerIndex: number,
  cert: Certificate,
  detachedContent: Uint8Array | null,
): Promise<boolean> {
  const si = parsed.signedData.signerInfos[signerIndex]!;
  const digestAlgo = extractDigestAlgorithm(si);
  const hash = webCryptoHashName(digestAlgo);
  const namedCurve = ecNamedCurveFromCert(cert);
  const fieldBytes = EC_FIELD_BYTES[namedCurve]!;

  const point = new Uint8Array(cert.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView);
  const key = await subtle.importKey('raw', ab(point), { name: 'ECDSA', namedCurve }, false, ['verify']);

  // The signed data is the DER of the signed attributes re-tagged as SET OF (0x31).
  if (!si.signedAttrs) return false;
  const attrsDer = new Uint8Array(si.signedAttrs.toSchema().toBER(false));
  attrsDer[0] = 0x31;

  // Cross-check the message-digest attribute against the content.
  const content = detachedContent ?? parsed.eContent;
  if (content) {
    const md = findAttribute(si, OID_ATTR_MESSAGE_DIGEST);
    const expected = md ? new Uint8Array((md.values[0] as asn1js.OctetString).valueBlock.valueHexView) : null;
    const actual = await digest(hash, content);
    if (!expected || !bytesEqual(expected, actual)) return false;
  }

  const sig = derEcdsaToP1363(new Uint8Array(si.signature.valueBlock.valueHexView), fieldBytes);
  return subtle.verify({ name: 'ECDSA', hash }, key, ab(sig), ab(attrsDer));
}

void DIGEST_OID;
