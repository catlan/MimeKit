// Representative end-to-end coverage of the concrete PkijsSecureMimeContext
// (wave C2b-2a) — a subset of SecureMimeTests/ApplicationPkcs7MimeTests
// exercising each engine operation. The FULL 1:1 port is deferred to C2b-2b.

import { describe, expect, test } from 'vitest';
import '../../src/smime/index.js';
import { PkijsSecureMimeContext } from '../../src/smime/pkijs-secure-mime-context.js';
import { CmsSigner } from '../../src/smime/cms-signer.js';
import { CmsRecipient } from '../../src/smime/cms-recipient.js';
import { CmsRecipientCollection } from '../../src/smime/cms-recipient-collection.js';
import { DigestAlgorithm } from '../../src/smime/digest-algorithm.js';
import { RsaEncryptionPadding } from '../../src/smime/rsa-encryption-padding.js';
import { RsaSignaturePadding } from '../../src/smime/rsa-signature-padding.js';
import { SecureMimeType } from '../../src/smime/secure-mime-type.js';
import { EncryptionAlgorithm } from '../../src/smime/encryption-algorithm.js';
import { MailboxAddress } from '../../src/mailbox-address.js';
import { TextPart } from '../../src/text-part.js';
import { MultipartSigned } from '../../src/smime/multipart-signed.js';
import { ApplicationPkcs7Mime } from '../../src/smime/application-pkcs7-mime.js';
import { rsaCertificate, smimeCertificates } from './helpers.js';
import type { SMimeCertificate } from './helpers.js';

function contextFor(certs: SMimeCertificate[]): PkijsSecureMimeContext {
  const ctx = new PkijsSecureMimeContext(undefined, { allowLegacyDecryption: true });
  for (const c of certs) {
    ctx.certificateStore.addPrivateKey(c.chain, c.privateKey);
    ctx.certificateStore.addTrustedAnchor(c.chain[c.chain.length - 1]!);
  }
  return ctx;
}

const ecCert = smimeCertificates.find((c) => c.emailAddress === 'ec@mimekit.net');
const body = 'This is a test of the emergency broadcast system.\r\n';
function textOf(e: unknown): string { return (e as TextPart).text.replace(/\r\n/g, '\n'); }
const bodyLf = body.replace(/\r\n/g, '\n');

function makeSigner(cert: SMimeCertificate, digest = DigestAlgorithm.Sha256, sigPad: RsaSignaturePadding | null = null): CmsSigner {
  const signer = new CmsSigner(cert.chain, cert.privateKey);
  signer.digestAlgorithm = digest;
  signer.rsaSignaturePadding = sigPad;
  return signer;
}

describe('PkijsSecureMimeContext', () => {
  test('detached sign + verify (rsa-sha256) round-trips', async () => {
    const ctx = contextFor([rsaCertificate]);
    const part = new TextPart('plain'); part.text = body;
    const signed = await MultipartSigned.create(ctx, makeSigner(rsaCertificate), part);
    expect(signed.count).toBe(2);
    const sigs = await signed.verify(ctx);
    expect(sigs.count).toBe(1);
    expect(await sigs.get(0).verify(true)).toBe(true);
    expect(sigs.get(0).digestAlgorithm).toBe(DigestAlgorithm.Sha256);
  });

  test('detached sign + verify (rsa-pss-sha256)', async () => {
    const ctx = contextFor([rsaCertificate]);
    const part = new TextPart('plain'); part.text = body;
    const signed = await MultipartSigned.create(ctx, makeSigner(rsaCertificate, DigestAlgorithm.Sha256, RsaSignaturePadding.Pss), part);
    const sigs = await signed.verify(ctx);
    expect(await sigs.get(0).verify(true)).toBe(true);
  });

  test.runIf(ecCert)('detached sign + verify (ecdsa-sha256)', async () => {
    const ctx = contextFor([ecCert!]);
    const part = new TextPart('plain'); part.text = body;
    const signed = await MultipartSigned.create(ctx, makeSigner(ecCert!), part);
    const sigs = await signed.verify(ctx);
    expect(await sigs.get(0).verify(true)).toBe(true);
  });

  test('encapsulated sign + verify unwraps the entity', async () => {
    const ctx = contextFor([rsaCertificate]);
    const part = new TextPart('plain'); part.text = body;
    const p7m = await ApplicationPkcs7Mime.sign(ctx, makeSigner(rsaCertificate), part);
    expect(p7m.secureMimeType).toBe(SecureMimeType.SignedData);
    const { signatures, entity } = await p7m.verify(ctx);
    expect(await signatures.get(0).verify(true)).toBe(true);
    expect(entity).toBeInstanceOf(TextPart);
    expect(textOf(entity)).toBe(bodyLf);
  });

  test.each([
    ['oaep+aes256', RsaEncryptionPadding.OaepSha1, EncryptionAlgorithm.Aes256],
    ['v1.5+aes128', RsaEncryptionPadding.Pkcs1, EncryptionAlgorithm.Aes128],
    ['v1.5+3des', RsaEncryptionPadding.Pkcs1, EncryptionAlgorithm.TripleDes],
    ['v1.5+rc2-128', RsaEncryptionPadding.Pkcs1, EncryptionAlgorithm.RC2128],
  ] as const)('encrypt + decrypt round-trips (%s)', async (_name, padding, algo) => {
    const ctx = contextFor([rsaCertificate]);
    ctx.enable(algo);
    const recipient = new CmsRecipient(rsaCertificate.certificate);
    recipient.rsaEncryptionPadding = padding;
    recipient.encryptionAlgorithms = [algo];
    const recipients = new CmsRecipientCollection();
    recipients.add(recipient);
    const part = new TextPart('plain'); part.text = body;
    const enc = await ApplicationPkcs7Mime.encrypt(ctx, recipients, part);
    expect(enc.secureMimeType).toBe(SecureMimeType.EnvelopedData);
    const dec = await enc.decrypt(ctx);
    expect(textOf(dec)).toBe(bodyLf);
  });

  test('encryptToMailboxes resolves the certificate via the store', async () => {
    const ctx = contextFor([rsaCertificate]);
    ctx.certificateStore.addCertificate(rsaCertificate.certificate);
    const part = new TextPart('plain'); part.text = body;
    const enc = await ApplicationPkcs7Mime.encryptToMailboxes(ctx, [new MailboxAddress(null, 'rsa@mimekit.net')], part);
    const dec = await enc.decrypt(ctx);
    expect(textOf(dec)).toBe(bodyLf);
  });

  test('sign+mailbox and compress/decompress round-trip', async () => {
    const ctx = contextFor([rsaCertificate]);
    const part = new TextPart('plain'); part.text = body;
    const compressed = await ApplicationPkcs7Mime.compress(ctx, part);
    expect(compressed.secureMimeType).toBe(SecureMimeType.CompressedData);
    const back = await compressed.decompress(ctx);
    expect(textOf(back)).toBe(bodyLf);
  });

  test('sign with mailbox resolves the signer via the store', async () => {
    const ctx = contextFor([rsaCertificate]);
    const part = new TextPart('plain'); part.text = body;
    const signed = await MultipartSigned.create(ctx, new MailboxAddress(null, 'rsa@mimekit.net'), DigestAlgorithm.Sha256, part);
    const sigs = await signed.verify(ctx);
    expect(await sigs.get(0).verify(true)).toBe(true);
  });
});
