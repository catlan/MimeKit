// CMS EnvelopedData build + decrypt (RFC 5652 §6) for the concrete S/MIME
// context. The ASN.1 envelope is assembled/parsed with pkijs objects; all the
// actual crypto is our own so we can support what WebCrypto lacks: RSAES-PKCS1
// v1.5 key transport and 3DES/RC2 content encryption, plus the uniform-error
// PKCS#7 unpad (Vaudenay). RSA-OAEP + AES-CBC ride WebCrypto.

/* eslint-disable no-bitwise */

import * as asn1js from 'asn1js';
import {
  ContentInfo, EnvelopedData, EncryptedContentInfo, RecipientInfo, KeyTransRecipientInfo,
  IssuerAndSerialNumber, AlgorithmIdentifier, Certificate,
} from 'pkijs';
import { DigestAlgorithm } from '../digest-algorithm.js';
import { EncryptionAlgorithm } from '../encryption-algorithm.js';
import { SubjectIdentifierType } from '../subject-identifier-type.js';
import { RsaEncryptionPadding } from '../rsa-encryption-padding.js';
import { RsaEncryptionPaddingScheme } from '../rsa-encryption-padding-scheme.js';
import {
  OID_ENVELOPED_DATA, OID_DATA, OID_RSA_ENCRYPTION, OID_RSAES_OAEP, OID_MGF1, OID_RC2_CBC,
  DIGEST_OID, DIGEST_BY_OID, contentEncryptionOid, contentKeyLength, contentBlockSize,
  rc2EffectiveBits, RC2_BITS_TO_VERSION, RC2_VERSION_TO_BITS, encryptionAlgorithmFromOid,
  webCryptoHashName,
} from './smime-oids.js';
import { ab, aesCbcEncryptRaw, aesCbcDecryptRaw, pkcs7Pad, pkcs7UnpadUniform } from './smime-webcrypto.js';
import { rsaOaepEncrypt, rsaOaepDecrypt, rsaV15Encrypt, rsaV15Decrypt } from './key-transport.js';
import { tripleDesCbcEncrypt, tripleDesCbcDecrypt } from './des.js';
import { rc2CbcEncrypt, rc2CbcDecrypt } from './rc2.js';

/** A recipient the EnvelopedData is wrapped for. */
export interface EnvelopeRecipient {
  /** The recipient certificate (DER). */
  certDer: Uint8Array;
  /** RSA encryption padding (defaults to PKCS#1 v1.5). */
  padding: RsaEncryptionPadding | null;
  /** How to identify the recipient in the RecipientInfo. */
  identifierType: SubjectIdentifierType;
}

/** A candidate private key for decryption. */
export interface DecryptCandidate {
  certDer: Uint8Array;
  pkcs8: Uint8Array;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

function parseCert(der: Uint8Array): Certificate {
  return new Certificate({ schema: asn1js.fromBER(ab(der)).result });
}

function spkiDer(cert: Certificate): Uint8Array {
  return new Uint8Array(cert.subjectPublicKeyInfo.toSchema().toBER(false));
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

// ---- OAEP parameters DER (RFC 8017 A.2.1) -----------------------------------

function digestAlgId(oid: string): asn1js.Sequence {
  return new asn1js.Sequence({ value: [ new asn1js.ObjectIdentifier({ value: oid }), new asn1js.Null() ] });
}

function oaepParameters(hash: DigestAlgorithm): asn1js.Sequence {
  const hashOid = DIGEST_OID[hash];
  if (!hashOid) throw new Error(`Unsupported OAEP hash ${DigestAlgorithm[hash] ?? hash}.`);
  // RSAES-OAEP-params ::= SEQUENCE { [0] hashAlgorithm, [1] maskGenAlgorithm, [2] pSourceAlgorithm }
  const hashAlg = new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 0 }, value: [ digestAlgId(hashOid) ] });
  const mgf = new asn1js.Sequence({ value: [ new asn1js.ObjectIdentifier({ value: OID_MGF1 }), digestAlgId(hashOid) ] });
  const maskGen = new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 1 }, value: [ mgf ] });
  // pSpecifiedEmpty: id-pSpecified with empty OCTET STRING label.
  const pSource = new asn1js.Constructed({
    idBlock: { tagClass: 3, tagNumber: 2 },
    value: [ new asn1js.Sequence({ value: [
      new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.1.9' }),
      new asn1js.OctetString({ valueHex: new ArrayBuffer(0) }),
    ] }) ],
  });
  return new asn1js.Sequence({ value: [ hashAlg, maskGen, pSource ] });
}

// ---- content-encryption algorithm identifier --------------------------------

function contentAlgId(algo: EncryptionAlgorithm, iv: Uint8Array): AlgorithmIdentifier {
  const oid = contentEncryptionOid(algo);
  let params: asn1js.BaseBlock;
  if (oid === OID_RC2_CBC) {
    const version = RC2_BITS_TO_VERSION[rc2EffectiveBits(algo)]!;
    params = new asn1js.Sequence({ value: [
      new asn1js.Integer({ value: version }),
      new asn1js.OctetString({ valueHex: ab(iv) }),
    ] });
  } else {
    params = new asn1js.OctetString({ valueHex: ab(iv) });
  }
  return new AlgorithmIdentifier({ algorithmId: oid, algorithmParams: params });
}

// ---- build ------------------------------------------------------------------

/** Build a CMS EnvelopedData ContentInfo (DER) for the given recipients. */
export async function buildEnvelopedData(
  recipients: EnvelopeRecipient[],
  algo: EncryptionAlgorithm,
  content: Uint8Array,
): Promise<Uint8Array> {
  const cek = randomBytes(contentKeyLength(algo));
  const blockSize = contentBlockSize(algo);
  const iv = randomBytes(blockSize);
  const padded = pkcs7Pad(content, blockSize);

  let encryptedContent: Uint8Array;
  switch (algo) {
    case EncryptionAlgorithm.Aes128:
    case EncryptionAlgorithm.Aes192:
    case EncryptionAlgorithm.Aes256:
      encryptedContent = await aesCbcEncryptRaw(cek, iv, padded);
      break;
    case EncryptionAlgorithm.TripleDes:
      encryptedContent = tripleDesCbcEncrypt(cek, iv, padded);
      break;
    case EncryptionAlgorithm.RC240:
    case EncryptionAlgorithm.RC264:
    case EncryptionAlgorithm.RC2128:
      encryptedContent = rc2CbcEncrypt(cek, rc2EffectiveBits(algo), iv, padded);
      break;
    default:
      throw new Error(`The ${EncryptionAlgorithm[algo] ?? algo} encryption algorithm is not supported.`);
  }

  const recipientInfos: RecipientInfo[] = [];
  let useV3 = false;

  for (const recipient of recipients) {
    const cert = parseCert(recipient.certDer);
    const spki = spkiDer(cert);
    const padding = recipient.padding;
    const useOaep = padding != null && padding.scheme === RsaEncryptionPaddingScheme.Oaep;

    let keyEncAlg: AlgorithmIdentifier;
    let wrapped: Uint8Array;
    if (useOaep) {
      keyEncAlg = new AlgorithmIdentifier({ algorithmId: OID_RSAES_OAEP, algorithmParams: oaepParameters(padding!.oaepHashAlgorithm) });
      wrapped = await rsaOaepEncrypt(spki, webCryptoHashName(padding!.oaepHashAlgorithm), cek);
    } else {
      keyEncAlg = new AlgorithmIdentifier({ algorithmId: OID_RSA_ENCRYPTION, algorithmParams: new asn1js.Null() });
      wrapped = await rsaV15Encrypt(spki, cek);
    }

    let rid: IssuerAndSerialNumber | asn1js.OctetString;
    let version: number;
    if (recipient.identifierType === SubjectIdentifierType.SubjectKeyIdentifier) {
      const ski = subjectKeyIdentifier(cert);
      if (!ski) throw new Error('Recipient certificate has no SubjectKeyIdentifier extension.');
      rid = new asn1js.OctetString({ valueHex: ab(ski) });
      version = 2;
      useV3 = true;
    } else {
      rid = new IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber });
      version = 0;
    }

    recipientInfos.push(new RecipientInfo({
      variant: 1,
      value: new KeyTransRecipientInfo({ version, rid, keyEncryptionAlgorithm: keyEncAlg, encryptedKey: new asn1js.OctetString({ valueHex: ab(wrapped) }) }),
    }));
  }

  const enveloped = new EnvelopedData({
    version: useV3 ? 2 : 0,
    recipientInfos,
    encryptedContentInfo: new EncryptedContentInfo({
      contentType: OID_DATA,
      contentEncryptionAlgorithm: contentAlgId(algo, iv),
      encryptedContent: new asn1js.OctetString({ valueHex: ab(encryptedContent) }),
    }),
  });

  const contentInfo = new ContentInfo({ contentType: OID_ENVELOPED_DATA, content: enveloped.toSchema() });
  return new Uint8Array(contentInfo.toSchema().toBER(false));
}

// ---- decrypt ----------------------------------------------------------------

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function ridMatchesCert(rid: IssuerAndSerialNumber | asn1js.OctetString, cert: Certificate): boolean {
  if (rid instanceof IssuerAndSerialNumber) {
    const issuerA = new Uint8Array(rid.issuer.toSchema().toBER(false));
    const issuerB = new Uint8Array(cert.issuer.toSchema().toBER(false));
    if (!bytesEqual(issuerA, issuerB)) return false;
    const serialA = new Uint8Array(rid.serialNumber.valueBlock.valueHexView);
    const serialB = new Uint8Array(cert.serialNumber.valueBlock.valueHexView);
    return bytesEqual(serialA, serialB);
  }
  // SubjectKeyIdentifier
  const ski = subjectKeyIdentifier(cert);
  if (!ski) return false;
  return bytesEqual(ski, new Uint8Array(rid.valueBlock.valueHexView));
}

function gatherOctetString(octet: asn1js.OctetString): Uint8Array {
  // Handle both primitive and constructed (chunked) OCTET STRINGs.
  const inner = octet.valueBlock.value as asn1js.OctetString[] | undefined;
  if (inner && inner.length > 0) {
    let total = 0;
    const parts = inner.map((c) => new Uint8Array(c.valueBlock.valueHexView));
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { out.set(p, pos); pos += p.length; }
    return out;
  }
  return new Uint8Array(octet.valueBlock.valueHexView);
}

/** A single generic error for every EnvelopedData decryption failure. */
class DecryptFailed extends Error {
  constructor() { super('Failed to decrypt the enveloped data.'); this.name = 'DecryptFailed'; }
}

/**
 * Decrypt a CMS EnvelopedData ContentInfo (DER). Finds the recipient matching
 * one of `candidates`, unwraps the CEK (OAEP or v1.5), decrypts the content, and
 * applies the uniform PKCS#7 unpad. All failures collapse to one generic error.
 */
export async function decryptEnvelopedData(
  der: Uint8Array,
  candidates: DecryptCandidate[],
  options: { allowLegacyDecryption?: boolean } = {},
): Promise<Uint8Array> {
  let contentInfo: ContentInfo;
  let enveloped: EnvelopedData;
  try {
    contentInfo = new ContentInfo({ schema: asn1js.fromBER(ab(der)).result });
    enveloped = new EnvelopedData({ schema: contentInfo.content });
  } catch {
    throw new DecryptFailed();
  }

  // Find a (recipientInfo, candidate) pair we can decrypt.
  for (const candidate of candidates) {
    const cert = parseCert(candidate.certDer);
    for (const ri of enveloped.recipientInfos) {
      if (ri.variant !== 1) continue;
      const ktri = ri.value as KeyTransRecipientInfo;
      if (!ridMatchesCert(ktri.rid, cert)) continue;

      try {
        const encryptedKey = new Uint8Array(ktri.encryptedKey.valueBlock.valueHexView);
        const keyAlgOid = ktri.keyEncryptionAlgorithm.algorithmId;

        let cek: Uint8Array;
        if (keyAlgOid === OID_RSAES_OAEP) {
          const hash = oaepHashFromParams(ktri.keyEncryptionAlgorithm);
          cek = await rsaOaepDecrypt(candidate.pkcs8, webCryptoHashName(hash), encryptedKey);
        } else if (keyAlgOid === OID_RSA_ENCRYPTION) {
          // Thread the expected CEK length so the browser v1.5 path can apply
          // implicit rejection (a valid-padding, wrong-length message is
          // rejected exactly like bad padding).
          const expectedKeyLength = contentKeyLengthOf(enveloped.encryptedContentInfo);
          cek = await rsaV15Decrypt(candidate.pkcs8, encryptedKey, expectedKeyLength, options);
        } else {
          throw new Error(`Unsupported key-encryption algorithm ${keyAlgOid}.`);
        }

        const plaintext = await decryptContent(enveloped.encryptedContentInfo, cek);
        return plaintext;
      } catch {
        throw new DecryptFailed();
      }
    }
  }

  throw new DecryptFailed();
}

function oaepHashFromParams(alg: AlgorithmIdentifier): DigestAlgorithm {
  const params = alg.algorithmParams as asn1js.Sequence | undefined;
  if (!params || !(params instanceof asn1js.Sequence)) return DigestAlgorithm.Sha1;
  for (const el of params.valueBlock.value as asn1js.BaseBlock[]) {
    if (el.idBlock.tagClass === 3 && el.idBlock.tagNumber === 0) {
      const seq = (el as asn1js.Constructed).valueBlock.value[0] as asn1js.Sequence;
      const oid = (seq.valueBlock.value[0] as asn1js.ObjectIdentifier).getValue();
      const mapped = DIGEST_BY_OID[oid];
      if (mapped !== undefined) return mapped;
    }
  }
  return DigestAlgorithm.Sha1;
}

/** The expected content-encryption-key length from the content algorithm. */
function contentKeyLengthOf(ecInfo: EncryptedContentInfo): number {
  const alg = ecInfo.contentEncryptionAlgorithm;
  const oid = alg.algorithmId;
  let rc2Bits: number | undefined;
  if (oid === OID_RC2_CBC) {
    const seq = alg.algorithmParams as asn1js.Sequence;
    const version = (seq.valueBlock.value[0] as asn1js.Integer).valueBlock.valueDec;
    rc2Bits = RC2_VERSION_TO_BITS[version] ?? 128;
  }
  return contentKeyLength(encryptionAlgorithmFromOid(oid, rc2Bits));
}

async function decryptContent(ecInfo: EncryptedContentInfo, cek: Uint8Array): Promise<Uint8Array> {
  const alg = ecInfo.contentEncryptionAlgorithm;
  const oid = alg.algorithmId;

  let iv: Uint8Array;
  let rc2Bits: number | undefined;
  if (oid === OID_RC2_CBC) {
    const seq = alg.algorithmParams as asn1js.Sequence;
    const version = (seq.valueBlock.value[0] as asn1js.Integer).valueBlock.valueDec;
    rc2Bits = RC2_VERSION_TO_BITS[version] ?? 128;
    iv = new Uint8Array((seq.valueBlock.value[1] as asn1js.OctetString).valueBlock.valueHexView);
  } else {
    iv = new Uint8Array((alg.algorithmParams as asn1js.OctetString).valueBlock.valueHexView);
  }

  if (!ecInfo.encryptedContent) throw new Error('EnvelopedData has no encrypted content.');
  const ct = gatherOctetString(ecInfo.encryptedContent);
  const algo = encryptionAlgorithmFromOid(oid, rc2Bits);
  const blockSize = contentBlockSize(algo);

  let raw: Uint8Array;
  switch (algo) {
    case EncryptionAlgorithm.Aes128:
    case EncryptionAlgorithm.Aes192:
    case EncryptionAlgorithm.Aes256:
      raw = await aesCbcDecryptRaw(cek, iv, ct);
      break;
    case EncryptionAlgorithm.TripleDes:
      raw = tripleDesCbcDecrypt(cek, iv, ct);
      break;
    case EncryptionAlgorithm.RC240:
    case EncryptionAlgorithm.RC264:
    case EncryptionAlgorithm.RC2128:
      raw = rc2CbcDecrypt(cek, rc2Bits!, iv, ct);
      break;
    default:
      throw new Error('Unsupported content-encryption algorithm.');
  }

  const unpadded = pkcs7UnpadUniform(raw, blockSize);
  if (unpadded === null) throw new Error('Invalid padding.');
  return unpadded;
}
