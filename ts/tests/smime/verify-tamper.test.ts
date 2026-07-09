/**
 * Forgery-rejection guard (the catastrophic property): `verify` MUST reject a
 * tampered signature. A `verify()` that always returned true would pass every
 * (all-positive) interop gate — these negative cases are the only thing standing
 * between that bug and a signature-spoofing hole.
 *
 * Every case runs through the real {@link PkijsSecureMimeContext} verify path
 * with the real test certificates, for BOTH the RSA path (pkijs) and the ECDSA
 * WebCrypto-fallback path (`verifyEcdsaSignerInfo`). Inputs are produced by the
 * production `buildSignedData` and tampered precisely via the parsed CMS
 * structure. A rejection is either a thrown `DigitalSignatureVerifyException`
 * or `verify()` reporting not-valid.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, beforeAll } from 'vitest';
import { ContentInfo } from 'pkijs';
import '../../src/smime/index.js';
import { PkijsSecureMimeContext } from '../../src/smime/pkijs-secure-mime-context.js';
import {
  buildSignedData, parseSignedData, type SignMaterial, type ParsedSignedData,
} from '../../src/smime/crypto/cms-signed.js';
import { OID_SIGNED_DATA } from '../../src/smime/crypto/smime-oids.js';
import { ensureEngine } from '../../src/smime/crypto/smime-webcrypto.js';
import { DigestAlgorithm } from '../../src/smime/digest-algorithm.js';
import { EncryptionAlgorithm } from '../../src/smime/encryption-algorithm.js';
import { SubjectIdentifierType } from '../../src/smime/subject-identifier-type.js';
import { DigitalSignatureVerifyException } from '../../src/smime/errors.js';
import type { DigitalSignatureCollection } from '../../src/smime/digital-signature-collection.js';
import type { X509PrivateKey } from '../../src/smime/asymmetric-key.js';
import { loadPkcs12 } from '../../src/smime/pkcs12-loader.js';
import { testDataDir } from '../gates/helpers.js';

const smimeDir = join(testDataDir, 'smime');
function loadPfx(rel: string) {
  return loadPkcs12(new Uint8Array(readFileSync(join(smimeDir, rel))), 'no.secret');
}

const rsa = loadPfx('rsa/smime.pfx');
const ec = existsSync(join(smimeDir, 'ec/smime.pfx')) ? loadPfx('ec/smime.pfx') : null;

// A well-formed MIME entity so the encapsulated verify path can parse eContent.
const HEADER = 'Content-Type: text/plain\r\n\r\n';
const BODY = 'The quick brown fox jumps over the lazy dog.\r\n';
const CONTENT = new TextEncoder().encode(HEADER + BODY);
const BODY_OFFSET = HEADER.length; // index of first body byte within CONTENT

function makeContext(): PkijsSecureMimeContext {
  const ctx = new PkijsSecureMimeContext();
  ctx.certificateStore.addPrivateKey(rsa.certificateChain, rsa.privateKey);
  ctx.certificateStore.addCertificate(rsa.certificateChain[0]!);
  if (ec) {
    ctx.certificateStore.addPrivateKey(ec.certificateChain, ec.privateKey);
    ctx.certificateStore.addCertificate(ec.certificateChain[0]!);
  }
  return ctx;
}

function material(key: typeof rsa): SignMaterial {
  return {
    certChainDer: [key.certificateChain[0]!.getEncoded()],
    pkcs8: (key.privateKey as X509PrivateKey).pkcs8,
    publicKeyAlgorithm: key.certificateChain[0]!.getPublicKeyAlgorithm(),
    digestAlgorithm: DigestAlgorithm.Sha256,
    signerIdentifierType: SubjectIdentifierType.IssuerAndSerialNumber,
    rsaSignaturePadding: null,
    capabilities: [EncryptionAlgorithm.Aes256],
  };
}

/** Re-serialize a (possibly tampered) parsed SignedData back to ContentInfo DER. */
function reencode(parsed: ParsedSignedData): Uint8Array {
  const ci = new ContentInfo({ contentType: OID_SIGNED_DATA, content: parsed.signedData.toSchema(true) });
  return new Uint8Array(ci.toSchema().toBER(false));
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** The signer cert's subjectPublicKey value bytes (excludes the BIT STRING unused-bits octet). */
function signerPublicKeyBytes(der: Uint8Array): Uint8Array {
  const parsed = parseSignedData(der);
  return new Uint8Array(
    parsed.signedData.certificates![0]!.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView,
  );
}

/** Assert every signature in the collection is REJECTED (throws or reports invalid). */
async function expectRejected(sigs: DigitalSignatureCollection): Promise<void> {
  expect(sigs.count).toBeGreaterThan(0);
  for (const sig of sigs) {
    let verdict: 'threw' | boolean;
    try {
      verdict = await sig.verify(true);
    } catch (ex) {
      expect(ex).toBeInstanceOf(DigitalSignatureVerifyException);
      verdict = 'threw';
    }
    expect(verdict === 'threw' || verdict === false).toBe(true);
  }
}

async function expectValid(sigs: DigitalSignatureCollection): Promise<void> {
  expect(sigs.count).toBeGreaterThan(0);
  for (const sig of sigs) expect(await sig.verify(true)).toBe(true);
}

const SIGNERS: [string, () => typeof rsa | null][] = [
  ['RSA', () => rsa],
  ['ECDSA (WebCrypto fallback)', () => ec],
];

beforeAll(() => { ensureEngine(); });

describe('S/MIME verify rejects forgeries', () => {
  for (const [label, getKey] of SIGNERS) {
    describe(label, () => {
      const missing = getKey() === null;

      test.skipIf(missing)('baseline: an untampered signature VERIFIES', async () => {
        const key = getKey()!;
        const der = await buildSignedData(material(key), CONTENT, false);
        await expectValid(await makeContext().verifyDetached(CONTENT, der));
      });

      test.skipIf(missing)('detached: flip a content byte -> REJECTED', async () => {
        const key = getKey()!;
        const der = await buildSignedData(material(key), CONTENT, false);
        const tampered = CONTENT.slice();
        tampered[BODY_OFFSET]! ^= 0x01; // "The" -> "Uhe"
        await expectRejected(await makeContext().verifyDetached(tampered, der));
      });

      test.skipIf(missing)('detached: content differs from message-digest attr -> REJECTED', async () => {
        const key = getKey()!;
        const der = await buildSignedData(material(key), CONTENT, false);
        const other = new TextEncoder().encode(HEADER + 'a completely different body\r\n');
        await expectRejected(await makeContext().verifyDetached(other, der));
      });

      test.skipIf(missing)('detached: flip a signature byte -> REJECTED', async () => {
        const key = getKey()!;
        const der = await buildSignedData(material(key), CONTENT, false);
        const parsed = parseSignedData(der);
        const sig = parsed.signedData.signerInfos[0]!.signature;
        const bytes = new Uint8Array(sig.valueBlock.valueHexView);
        bytes[bytes.length - 1]! ^= 0x01;
        sig.valueBlock.valueHex = bytes.slice().buffer;
        await expectRejected(await makeContext().verifyDetached(CONTENT, reencode(parsed)));
      });

      test.skipIf(missing)('encapsulated: tamper embedded eContent -> REJECTED', async () => {
        const key = getKey()!;
        const der = await buildSignedData(material(key), CONTENT, true);
        // sanity: untampered encapsulated verifies
        await expectValid((await makeContext().verifyEncapsulated(der)).signatures);

        const parsed = parseSignedData(der);
        const eco = parsed.signedData.encapContentInfo.eContent!;
        const bytes = new Uint8Array(eco.valueBlock.valueHexView);
        bytes[BODY_OFFSET]! ^= 0x01; // flip a body byte (MIME still parses)
        eco.valueBlock.valueHex = bytes.slice().buffer;
        const { signatures } = await makeContext().verifyEncapsulated(reencode(parsed));
        await expectRejected(signatures);
      });
    });
  }

  test('detached: RSA wrong signing key (corrupt modulus) -> REJECTED', async () => {
    const der = await buildSignedData(material(rsa), CONTENT, false);
    // Corrupt a modulus byte inside the embedded signer cert's public key, in the
    // raw DER (pkijs re-encodes the Certificate from its own schema, so an
    // object-level mutation would be silently dropped).
    const pk = signerPublicKeyBytes(der); // DER of RSAPublicKey SEQUENCE
    const pos = indexOfBytes(der, pk);
    expect(pos).toBeGreaterThan(0);
    const tampered = der.slice();
    tampered[pos + 15]! ^= 0xff; // a byte well inside the modulus
    await expectRejected(await makeContext().verifyDetached(CONTENT, tampered));
  });

  test.skipIf(!ec)('detached: ECDSA wrong signing key (swapped public point) -> REJECTED', async () => {
    const der = await buildSignedData(material(ec!), CONTENT, false);
    const point = signerPublicKeyBytes(der); // 0x04 || X || Y (uncompressed point)
    const namedCurve = { 65: 'P-256', 97: 'P-384', 133: 'P-521' }[point.length];
    expect(namedCurve).toBeDefined();
    const subtle = ensureEngine();
    const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: namedCurve! }, true, ['sign', 'verify']);
    const newPoint = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
    expect(newPoint.length).toBe(point.length);
    // Swap the embedded public point for a different (valid) one in the raw DER.
    const pos = indexOfBytes(der, point);
    expect(pos).toBeGreaterThan(0);
    const tampered = der.slice();
    tampered.set(newPoint, pos);
    await expectRejected(await makeContext().verifyDetached(CONTENT, tampered));
  });
});
