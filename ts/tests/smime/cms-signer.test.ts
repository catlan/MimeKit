// Port of UnitTests/Cryptography/CmsSignerTests.cs.
//
// C#'s .ctor overloads that parse a .pfx (`CmsSigner(string|Stream, password)`)
// map to the async `CmsSigner.load(data, password)` seam in the TS port; the
// X509Certificate2 overloads are Windows-only and have no TS analogue. Every
// case loads a real certificate/key, so this suite was deferred by C2a and is
// unblocked by the C2b-1 X.509 + PKCS#12 backend.

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { testDataDir } from '../gates/helpers.js';
import { CmsSigner } from '../../src/smime/cms-signer.js';
import { SubjectIdentifierType } from '../../src/smime/subject-identifier-type.js';
import { RsaSignaturePadding } from '../../src/smime/rsa-signature-padding.js';
import { loadPublicKeyFromPem } from '../../src/smime/asymmetric-key.js';
import { rsaCertificate, smimeCertificates } from './helpers.js';

const password = 'no.secret';

function pfx(fileName: string): Uint8Array {
  return new Uint8Array(readFileSync(fileName));
}

describe('CmsSignerTests', () => {
  test('TestArgumentExceptions', async () => {
    const rsa = rsaCertificate;
    const signer = await CmsSigner.load(pfx(rsa.fileName), password);
    const examplePem = readFileSync(join(testDataDir, 'dkim', 'example.pem'), 'utf8');
    const publicKey = loadPublicKeyFromPem(examplePem);

    // A public key cannot be used for signing.
    expect(() => new CmsSigner([signer.certificate], publicKey)).toThrow(TypeError);

    expect(() => new CmsSigner(null as never, signer.privateKey)).toThrow(TypeError);
    expect(() => new CmsSigner([], signer.privateKey)).toThrow(TypeError);
    expect(() => new CmsSigner(signer.certificateChain, publicKey)).toThrow(TypeError);
    expect(() => new CmsSigner(signer.certificateChain, null as never)).toThrow(TypeError);

    expect(() => new CmsSigner(null as never, signer.privateKey)).toThrow(TypeError);
    expect(() => new CmsSigner(signer.certificate, publicKey)).toThrow(TypeError);
    expect(() => new CmsSigner(signer.certificate, null as never)).toThrow(TypeError);

    await expect(CmsSigner.load(null as never, password)).rejects.toThrow(TypeError);
    await expect(CmsSigner.load(pfx(rsa.fileName), null as never)).rejects.toThrow(TypeError);
  });

  test('TestConstructors', async () => {
    for (const certificate of smimeCertificates) {
      // .ctor (data, password)
      await expect(CmsSigner.load(pfx(certificate.fileName), password)).resolves.toBeInstanceOf(CmsSigner);

      // .ctor (chain, key)
      expect(() => new CmsSigner(certificate.chain, certificate.privateKey)).not.toThrow();

      // .ctor (certificate, key)
      expect(() => new CmsSigner(certificate.certificate, certificate.privateKey)).not.toThrow();
    }
  });

  test('TestDefaultValues', async () => {
    const rsa = rsaCertificate;

    let signer = await CmsSigner.load(pfx(rsa.fileName), password);
    expect(signer.signerIdentifierType).toBe(SubjectIdentifierType.IssuerAndSerialNumber);
    expect(signer.rsaSignaturePadding).toBeNull();

    signer = new CmsSigner(rsa.chain, rsa.privateKey);
    expect(signer.signerIdentifierType).toBe(SubjectIdentifierType.IssuerAndSerialNumber);
    expect(signer.rsaSignaturePadding).toBeNull();

    signer = new CmsSigner(rsa.certificate, rsa.privateKey);
    expect(signer.signerIdentifierType).toBe(SubjectIdentifierType.IssuerAndSerialNumber);
    expect(signer.rsaSignaturePadding).toBeNull();
  });

  test('TestSignerIdentifierType', async () => {
    const rsa = rsaCertificate;

    let signer = await CmsSigner.load(pfx(rsa.fileName), password, SubjectIdentifierType.SubjectKeyIdentifier);
    expect(signer.signerIdentifierType).toBe(SubjectIdentifierType.SubjectKeyIdentifier);
    expect(signer.rsaSignaturePadding).toBeNull();

    signer = new CmsSigner(rsa.chain, rsa.privateKey, SubjectIdentifierType.SubjectKeyIdentifier);
    expect(signer.signerIdentifierType).toBe(SubjectIdentifierType.SubjectKeyIdentifier);
    expect(signer.rsaSignaturePadding).toBeNull();

    signer = new CmsSigner(rsa.certificate, rsa.privateKey, SubjectIdentifierType.SubjectKeyIdentifier);
    expect(signer.signerIdentifierType).toBe(SubjectIdentifierType.SubjectKeyIdentifier);
    expect(signer.rsaSignaturePadding).toBeNull();
  });

  test('TestRsaSignaturePadding', async () => {
    const rsa = rsaCertificate;
    const signer = await CmsSigner.load(pfx(rsa.fileName), password);

    expect(signer.rsaSignaturePadding).toBeNull();

    signer.rsaSignaturePadding = RsaSignaturePadding.Pkcs1;
    expect(signer.rsaSignaturePadding).toBe(RsaSignaturePadding.Pkcs1);

    signer.rsaSignaturePadding = RsaSignaturePadding.Pss;
    expect(signer.rsaSignaturePadding).toBe(RsaSignaturePadding.Pss);

    signer.rsaSignaturePadding = RsaSignaturePadding.Pkcs1;
    expect(signer.rsaSignaturePadding).toBe(RsaSignaturePadding.Pkcs1);

    signer.rsaSignaturePadding = RsaSignaturePadding.Pss;
    expect(signer.rsaSignaturePadding).toBe(RsaSignaturePadding.Pss);
  });
});
