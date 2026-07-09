import { beforeAll, describe, expect, test } from 'vitest';
import '../../src/smime/index.js';
import { ApplicationPkcs7Mime } from '../../src/smime/application-pkcs7-mime.js';
import { CmsRecipient } from '../../src/smime/cms-recipient.js';
import { CmsRecipientCollection } from '../../src/smime/cms-recipient-collection.js';
import { CmsSigner } from '../../src/smime/cms-signer.js';
import { DigestAlgorithm } from '../../src/smime/digest-algorithm.js';
import { EncryptionAlgorithm } from '../../src/smime/encryption-algorithm.js';
import { MultipartSigned } from '../../src/smime/multipart-signed.js';
import { PkijsSecureMimeContext } from '../../src/smime/pkijs-secure-mime-context.js';
import { PublicKeyAlgorithm } from '../../src/smime/public-key-algorithm.js';
import { SecureMailboxAddress } from '../../src/smime/secure-mailbox-address.js';
import { registerSecureMimeContext } from '../../src/smime/secure-mime-context.js';
import { SecureMimeType } from '../../src/smime/secure-mime-type.js';
import { SubjectIdentifierType } from '../../src/smime/subject-identifier-type.js';
import { MailboxAddress } from '../../src/mailbox-address.js';
import { MimeEntity } from '../../src/mime-entity.js';
import { TextPart } from '../../src/text-part.js';
import { MemoryStream } from '../../src/io/stream.js';
import { rsaCertificate, smimeCertificates, type SMimeCertificate } from './helpers.js';

function contextFor(certs: SMimeCertificate[]): PkijsSecureMimeContext {
  const ctx = new PkijsSecureMimeContext(undefined, { allowLegacyDecryption: true });
  for (const c of certs) {
    ctx.certificateStore.addPrivateKey(c.chain, c.privateKey);
    ctx.certificateStore.addTrustedAnchor(c.chain[c.chain.length - 1]!);
  }
  return ctx;
}

const supportedCertificates = smimeCertificates.filter((c) =>
  c.emailAddress && (c.publicKeyAlgorithm === PublicKeyAlgorithm.RsaGeneral ||
    c.publicKeyAlgorithm === PublicKeyAlgorithm.EllipticCurve ||
    c.publicKeyAlgorithm === PublicKeyAlgorithm.EllipticCurveDsa));
const rsaCertificates = supportedCertificates.filter((c) => c.publicKeyAlgorithm === PublicKeyAlgorithm.RsaGeneral);
const domainCertificate = smimeCertificates.find((c) => c.certificate.getSubjectDnsNames().length > 0)!;

beforeAll(() => registerSecureMimeContext(() => contextFor(smimeCertificates)));

function makeTextPart(): TextPart {
  const part = new TextPart('plain');
  part.text = 'This is some text...';
  return part;
}

function makeSigner(cert: SMimeCertificate): CmsSigner {
  return new CmsSigner(cert.chain, cert.privateKey);
}

function recipientsFor(cert: SMimeCertificate, id = SubjectIdentifierType.IssuerAndSerialNumber): CmsRecipientCollection {
  const recipients = new CmsRecipientCollection();
  recipients.add(new CmsRecipient(cert.certificate, id));
  return recipients;
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

function textOf(entity: MimeEntity): string {
  expect(entity).toBeInstanceOf(TextPart);
  return normalize((entity as TextPart).text);
}

async function assertSignResults(cert: SMimeCertificate, ctx: PkijsSecureMimeContext, signed: ApplicationPkcs7Mime, entity: TextPart): Promise<void> {
  const verified = await signed.verify(ctx);
  expect(textOf(verified.entity)).toBe(normalize(entity.text));
  expect(verified.signatures.count).toBe(1);
  const signature = verified.signatures.get(0);
  expect(signature.signerCertificate!.name).toBe('MimeKit UnitTests');
  expect(signature.signerCertificate!.email).toBe(cert.emailAddress);
  expect(signature.signerCertificate!.dnsNames).toEqual(cert.certificate.getSubjectDnsNames());
  expect(signature.signerCertificate!.fingerprint).toBe(cert.fingerprint);
  expect(signature.signerCertificate!.creationDate.getTime()).toBe(cert.certificate.getNotBefore().getTime());
  expect(signature.signerCertificate!.expirationDate.getTime()).toBe(cert.certificate.getNotAfter().getTime());
  expect(signature.signerCertificate!.publicKeyAlgorithm).toBe(cert.publicKeyAlgorithm);
  expect(signature.publicKeyAlgorithm).toBe(cert.publicKeyAlgorithm);
  expect(signature.encryptionAlgorithms.slice(0, 3)).toEqual([
    EncryptionAlgorithm.Aes256,
    EncryptionAlgorithm.Aes192,
    EncryptionAlgorithm.Aes128,
  ]);
  expect(await signature.verify(true)).toBe(true);
}

async function assertSignAndEncryptResults(cert: SMimeCertificate, ctx: PkijsSecureMimeContext, encrypted: ApplicationPkcs7Mime, entity: TextPart): Promise<void> {
  const decrypted = await encrypted.decrypt(ctx);
  expect(decrypted).toBeInstanceOf(MultipartSigned);
  const signed = decrypted as MultipartSigned;
  expect(signed.count).toBe(2);
  expect(textOf(signed.at(0))).toBe(normalize(entity.text));
  const signatures = await signed.verify(ctx);
  expect(signatures.count).toBe(1);
  const signature = signatures.get(0);
  expect(signature.signerCertificate!.name).toBe('MimeKit UnitTests');
  expect(signature.signerCertificate!.email).toBe(cert.emailAddress);
  expect(signature.signerCertificate!.dnsNames).toEqual(cert.certificate.getSubjectDnsNames());
  expect(signature.signerCertificate!.fingerprint).toBe(cert.fingerprint);
  expect(signature.signerCertificate!.creationDate.getTime()).toBe(cert.certificate.getNotBefore().getTime());
  expect(signature.signerCertificate!.expirationDate.getTime()).toBe(cert.certificate.getNotAfter().getTime());
  expect(signature.signerCertificate!.publicKeyAlgorithm).toBe(cert.publicKeyAlgorithm);
  expect(signature.publicKeyAlgorithm).toBe(cert.publicKeyAlgorithm);
  expect(signature.encryptionAlgorithms.slice(0, 3)).toEqual([
    EncryptionAlgorithm.Aes256,
    EncryptionAlgorithm.Aes192,
    EncryptionAlgorithm.Aes128,
  ]);
  expect(await signature.verify(true)).toBe(true);
}

describe('ApplicationPkcs7MimeTestsBase port', () => {
  test('C#: TestArgumentExceptions', async () => {
    const ctx = contextFor([rsaCertificate]);
    const entity = makeTextPart();
    const mailbox = new MailboxAddress('MimeKit UnitTests', rsaCertificate.emailAddress!);
    const signer = makeSigner(rsaCertificate);
    const recipients = recipientsFor(rsaCertificate);
    const mailboxes = [mailbox];

    // R2: null/type-guard-only C# overload assertions that TS types forbid are omitted; surviving runtime guards remain.
    await expect(ApplicationPkcs7Mime.compress(ctx, null as never)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.compress(null as never)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.encrypt(ctx, null as never, entity)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.encrypt(ctx, recipients, null as never)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.encrypt(recipients, null as never)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.encryptToMailboxes(ctx, mailboxes, null as never)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.sign(ctx, null as never, entity)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.sign(ctx, signer, null as never)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.sign(signer, null as never)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.signWithMailbox(ctx, null as never, DigestAlgorithm.Sha1, entity)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.signWithMailbox(ctx, mailbox, DigestAlgorithm.Sha1, null as never)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.signAndEncrypt(ctx, null as never, recipients, entity)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.signAndEncrypt(ctx, signer, null as never, entity)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.signAndEncrypt(ctx, signer, recipients, null as never)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.signAndEncryptToMailboxes(ctx, null as never, DigestAlgorithm.Sha1, mailboxes, entity)).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.signAndEncryptToMailboxes(ctx, mailbox, DigestAlgorithm.Sha1, null as never, entity)).rejects.toThrow(TypeError);

    const compressed = await ApplicationPkcs7Mime.compress(ctx, entity);
    const encrypted = await ApplicationPkcs7Mime.encrypt(ctx, recipients, entity);
    const signed = await ApplicationPkcs7Mime.sign(ctx, signer, entity);
    await expect(encrypted.decompress(ctx)).rejects.toThrow(Error);
    await expect(signed.decompress(ctx)).rejects.toThrow(Error);
    await expect(compressed.decrypt(ctx)).rejects.toThrow(Error);
    await expect(signed.decrypt(ctx)).rejects.toThrow(Error);
    await expect(compressed.import(ctx)).rejects.toThrow(Error);
    await expect(encrypted.verify(ctx)).rejects.toThrow(Error);
    await expect(compressed.verify(ctx)).rejects.toThrow(Error);
  });

  test('C#: TestSecureMimeTypes', () => {
    const stream = new MemoryStream();
    expect(() => new ApplicationPkcs7Mime(SecureMimeType.Unknown, stream)).toThrow(RangeError);
    for (const [type, value] of [
      [SecureMimeType.AuthEnvelopedData, 'authenveloped-data'],
      [SecureMimeType.EnvelopedData, 'enveloped-data'],
      [SecureMimeType.CompressedData, 'compressed-data'],
      [SecureMimeType.SignedData, 'signed-data'],
      [SecureMimeType.CertsOnly, 'certs-only'],
    ] as const) {
      const pkcs7 = new ApplicationPkcs7Mime(type, stream);
      expect(pkcs7.contentType.parameters.get('smime-type')).toBe(value);
      expect(pkcs7.secureMimeType).toBe(type);
    }
    const pkcs7 = new ApplicationPkcs7Mime(SecureMimeType.CertsOnly, stream);
    pkcs7.contentType.parameters.set('smime-type', 'x-unknown-data');
    expect(pkcs7.secureMimeType).toBe(SecureMimeType.Unknown);
    pkcs7.contentType.parameters.remove('smime-type');
    expect(pkcs7.secureMimeType).toBe(SecureMimeType.Unknown);
  });

  test.each([SubjectIdentifierType.IssuerAndSerialNumber, SubjectIdentifierType.SubjectKeyIdentifier])(
    'C#: TestEncryptCmsRecipients (%s)',
    async (id) => {
      for (const cert of rsaCertificates) {
        const entity = makeTextPart();
        const encrypted = await ApplicationPkcs7Mime.encrypt(recipientsFor(cert, id), entity);
        expect(textOf(await encrypted.decrypt(contextFor(smimeCertificates)))).toBe(normalize(entity.text));
      }
      // DEFER:ecdh — EC recipient encryption requires ECDH key agreement.
    },
  );

  test('C#: TestEncryptMailboxes', async () => {
    for (const cert of rsaCertificates) {
      const ctx = contextFor(smimeCertificates);
      const entity = makeTextPart();
      const mailboxes = [new MailboxAddress('MimeKit UnitTests', cert.emailAddress!)];
      expect(textOf(await (await ApplicationPkcs7Mime.encryptToMailboxes(mailboxes, entity)).decrypt(ctx))).toBe(normalize(entity.text));
      expect(textOf(await (await ApplicationPkcs7Mime.encryptToMailboxes(ctx, mailboxes, entity)).decrypt(ctx))).toBe(normalize(entity.text));
    }
    // DEFER:ecdh — EC mailbox encryption requires ECDH key agreement.
  });

  test('C#: TestEncryptDnsNames', async () => {
    const ctx = contextFor(smimeCertificates);
    for (const domain of domainCertificate.certificate.getSubjectDnsNames()) {
      const entity = makeTextPart();
      const mailboxes = [new MailboxAddress('MimeKit UnitTests', `mimekit@${domain}`)];
      expect(textOf(await (await ApplicationPkcs7Mime.encryptToMailboxes(ctx, mailboxes, entity)).decrypt(ctx))).toBe(normalize(entity.text));
    }
  });

  test('C#: TestSignCmsSigner', async () => {
    const ctx = contextFor(smimeCertificates);
    for (const cert of supportedCertificates) {
      const entity = makeTextPart();
      await assertSignResults(cert, ctx, await ApplicationPkcs7Mime.sign(ctx, makeSigner(cert), entity), entity);
    }
  });

  test('C#: TestSignMailbox', async () => {
    const ctx = contextFor(smimeCertificates);
    for (const cert of supportedCertificates) {
      const entity = makeTextPart();
      const mailbox = new SecureMailboxAddress('MimeKit UnitTests', cert.emailAddress!, cert.fingerprint);
      await assertSignResults(cert, ctx, await ApplicationPkcs7Mime.signWithMailbox(ctx, mailbox, DigestAlgorithm.Sha256, entity), entity);
    }
  });

  test('C#: TestSignDnsNames', async () => {
    const ctx = contextFor(smimeCertificates);
    for (const domain of domainCertificate.certificate.getSubjectDnsNames()) {
      const entity = makeTextPart();
      const mailbox = new MailboxAddress('MimeKit UnitTests', `mimekit@${domain}`);
      await assertSignResults(domainCertificate, ctx, await ApplicationPkcs7Mime.signWithMailbox(ctx, mailbox, DigestAlgorithm.Sha256, entity), entity);
    }
  });

  test('C#: TestSignAndEncryptCms', async () => {
    for (const cert of rsaCertificates) {
      const ctx = contextFor(smimeCertificates);
      const entity = makeTextPart();
      const encrypted = await ApplicationPkcs7Mime.signAndEncryptDefault(makeSigner(cert), recipientsFor(cert), entity);
      await assertSignAndEncryptResults(cert, ctx, encrypted, entity);
    }
    // DEFER:ecdh — EC recipient encryption requires ECDH key agreement.
  });

  test('C#: TestSignAndEncryptMailboxes', async () => {
    for (const cert of rsaCertificates) {
      const ctx = contextFor(smimeCertificates);
      const entity = makeTextPart();
      const mailbox = new SecureMailboxAddress('MimeKit UnitTests', cert.emailAddress!, cert.fingerprint);
      const encrypted = await ApplicationPkcs7Mime.signAndEncryptToMailboxesDefault(mailbox, DigestAlgorithm.Sha256, [mailbox], entity);
      await assertSignAndEncryptResults(cert, ctx, encrypted, entity);
    }
    // DEFER:ecdh — EC recipient encryption requires ECDH key agreement.
  });

  test('C#: TestSignAndEncryptDnsNames', async () => {
    const ctx = contextFor(smimeCertificates);
    for (const domain of domainCertificate.certificate.getSubjectDnsNames()) {
      const entity = makeTextPart();
      const mailbox = new MailboxAddress('MimeKit UnitTests', `mimekit@${domain}`);
      const encrypted = await ApplicationPkcs7Mime.signAndEncryptToMailboxes(ctx, mailbox, DigestAlgorithm.Sha256, [mailbox], entity);
      await assertSignAndEncryptResults(domainCertificate, ctx, encrypted, entity);
    }
  });
});
