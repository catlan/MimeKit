import { beforeAll, describe, expect, test } from 'vitest';
import '../../src/smime/index.js';
import { ApplicationPkcs7Mime } from '../../src/smime/application-pkcs7-mime.js';
import { CmsRecipient } from '../../src/smime/cms-recipient.js';
import { CmsRecipientCollection } from '../../src/smime/cms-recipient-collection.js';
import { CmsSigner, canSign } from '../../src/smime/cms-signer.js';
import { DigestAlgorithm, digestAlgorithmValues } from '../../src/smime/digest-algorithm.js';
import { EncryptionAlgorithm, encryptionAlgorithmCount } from '../../src/smime/encryption-algorithm.js';
import { CertificateNotFoundException, NotSupportedError, PrivateKeyNotFoundException } from '../../src/smime/errors.js';
import { canEncrypt } from '../../src/smime/in-memory-store.js';
import { MultipartSigned } from '../../src/smime/multipart-signed.js';
import { PkijsSecureMimeContext } from '../../src/smime/pkijs-secure-mime-context.js';
import { PublicKeyAlgorithm } from '../../src/smime/public-key-algorithm.js';
import { RsaEncryptionPadding } from '../../src/smime/rsa-encryption-padding.js';
import { RsaSignaturePadding } from '../../src/smime/rsa-signature-padding.js';
import { SecureMailboxAddress } from '../../src/smime/secure-mailbox-address.js';
import { SecureMimeContext, registerSecureMimeContext } from '../../src/smime/secure-mime-context.js';
import { SecureMimeType } from '../../src/smime/secure-mime-type.js';
import { SubjectIdentifierType } from '../../src/smime/subject-identifier-type.js';
import { MailboxAddress } from '../../src/mailbox-address.js';
import { MimeEntity } from '../../src/mime-entity.js';
import { MimeMessage } from '../../src/mime-message.js';
import { unwrap } from '../../src/result.js';
import { MimePart } from '../../src/mime-part.js';
import { TextPart } from '../../src/text-part.js';
import { MemoryStream } from '../../src/io/stream.js';
import { ApplicationPkcs7Signature } from '../../src/smime/application-pkcs7-signature.js';
import { rsaCertificate, smimeCertificates, smimePath, type SMimeCertificate } from './helpers.js';
import { readFileSync } from 'node:fs';

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
const text = 'This is some cleartext that we will process with S/MIME...';

beforeAll(() => registerSecureMimeContext(() => contextFor(smimeCertificates)));

function makeTextPart(value = text): TextPart {
  const part = new TextPart('plain');
  part.text = value;
  return part;
}

function makeSigner(cert: SMimeCertificate, digest = DigestAlgorithm.Sha256, padding: RsaSignaturePadding | null = null): CmsSigner {
  const signer = new CmsSigner(cert.chain, cert.privateKey);
  signer.digestAlgorithm = digest;
  signer.rsaSignaturePadding = padding;
  return signer;
}

function recipientsFor(cert: SMimeCertificate, id = SubjectIdentifierType.IssuerAndSerialNumber): CmsRecipientCollection {
  const recipients = new CmsRecipientCollection();
  recipients.add(new CmsRecipient(cert.certificate, id));
  return recipients;
}

function firstRecipient(recipients: CmsRecipientCollection): CmsRecipient {
  return [...recipients][0]!;
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

function textOf(entity: MimeEntity): string {
  expect(entity).toBeInstanceOf(TextPart);
  return normalize((entity as TextPart).text);
}

function decoded(part: ApplicationPkcs7Mime): Uint8Array {
  const stream = new MemoryStream();
  part.content!.decodeTo(stream);
  return stream.toArray();
}

async function expectSignature(cert: SMimeCertificate, signatures: Awaited<ReturnType<MultipartSigned['verify']>>): Promise<void> {
  expect(signatures.count).toBe(1);
  const signature = signatures.get(0);
  const signer = signature.signerCertificate;
  expect(signer).not.toBeNull();
  expect(signer!.name).toBe('MimeKit UnitTests');
  expect(signer!.email).toBe(cert.emailAddress);
  expect(signer!.dnsNames).toEqual(cert.certificate.getSubjectDnsNames());
  expect(signer!.fingerprint).toBe(cert.fingerprint);
  expect(signer!.creationDate.getTime()).toBe(cert.certificate.getNotBefore().getTime());
  expect(signer!.expirationDate.getTime()).toBe(cert.certificate.getNotAfter().getTime());
  expect(signer!.publicKeyAlgorithm).toBe(cert.publicKeyAlgorithm);
  expect(signature.publicKeyAlgorithm).toBe(cert.publicKeyAlgorithm);
  // C# AssertValidSignatures asserts the AES trio unconditionally followed by TripleDes
  // (Seed/Camellia/Cast5/Idea are all disabled in this engine, so index 3 is deterministic).
  expect(signature.encryptionAlgorithms.slice(0, 4)).toEqual([
    EncryptionAlgorithm.Aes256,
    EncryptionAlgorithm.Aes192,
    EncryptionAlgorithm.Aes128,
    EncryptionAlgorithm.TripleDes,
  ]);
  expect(await signature.verify(true)).toBe(true);
}

async function assertEncapsulated(cert: SMimeCertificate, signed: ApplicationPkcs7Mime, original: TextPart, ctx: PkijsSecureMimeContext): Promise<void> {
  expect(signed.secureMimeType).toBe(SecureMimeType.SignedData);
  const { signatures, entity } = await signed.verify(ctx);
  expect(textOf(entity)).toBe(normalize(original.text));
  await expectSignature(cert, signatures);
}

async function assertDetached(cert: SMimeCertificate, multipart: MultipartSigned, original: TextPart, ctx: PkijsSecureMimeContext): Promise<void> {
  expect(multipart.count).toBe(2);
  expect(multipart.contentType.parameters.get('protocol')).toBe(ctx.signatureProtocol);
  expect(multipart.at(0)).toBeInstanceOf(TextPart);
  expect(multipart.at(1)).toBeInstanceOf(ApplicationPkcs7Signature);
  expect(textOf(multipart.at(0))).toBe(normalize(original.text));
  await expectSignature(cert, await multipart.verify(ctx));
}

async function assertEncryptedRoundTrip(cert: SMimeCertificate, id: SubjectIdentifierType, ctx: PkijsSecureMimeContext, body = makeTextPart()): Promise<void> {
  const encrypted = await ApplicationPkcs7Mime.encrypt(ctx, recipientsFor(cert, id), body);
  expect(encrypted.secureMimeType).toBe(SecureMimeType.EnvelopedData);
  expect(textOf(await encrypted.decrypt(ctx))).toBe(normalize(body.text));
}

describe('SecureMimeTestsBase port', () => {
  test('C#: TestArgumentExceptions', async () => {
    const ctx = contextFor([rsaCertificate]);
    const body = makeTextPart();
    const signer = makeSigner(rsaCertificate);
    const recipients = recipientsFor(rsaCertificate);
    const emptyRecipients = new CmsRecipientCollection();

    // R2: null/type-guard-only C# assertions for overloads that TS types forbid are omitted.
    expect(() => SecureMimeContext.getDigestOid(DigestAlgorithm.None)).toThrow(RangeError);
    expect(() => SecureMimeContext.getDigestOid(DigestAlgorithm.DoubleSha)).toThrow(NotSupportedError);
    expect(() => SecureMimeContext.getDigestOid(DigestAlgorithm.Haval5160)).toThrow(NotSupportedError);
    expect(() => SecureMimeContext.getDigestOid(DigestAlgorithm.Tiger192)).toThrow(NotSupportedError);
    expect(ctx.supports('text/plain')).toBe(false);
    expect(ctx.supports('application/octet-stream')).toBe(false);
    expect(ctx.supports('application/pkcs7-mime')).toBe(true);
    expect(ctx.supports('application/x-pkcs7-mime')).toBe(true);
    expect(ctx.supports('application/pkcs7-signature')).toBe(true);
    expect(ctx.supports('application/x-pkcs7-signature')).toBe(true);
    expect(ctx.signatureProtocol).toBe('application/pkcs7-signature');
    expect(ctx.encryptionProtocol).toBe('application/pkcs7-mime');
    expect(ctx.keyExchangeProtocol).toBe('application/pkcs7-mime');
    expect(() => ctx.supports(null as never)).toThrow(TypeError);
    await expect(ctx.encrypt(emptyRecipients, new Uint8Array())).rejects.toThrow(TypeError);
    await expect(ApplicationPkcs7Mime.encrypt(ctx, emptyRecipients, body)).rejects.toThrow(TypeError);
    await expect(MultipartSigned.create(null as never, signer, body)).rejects.toThrow(TypeError);
    await expect(MultipartSigned.create(ctx, null as never, body)).rejects.toThrow(TypeError);
    await expect(MultipartSigned.create(ctx, signer, null as never)).rejects.toThrow(TypeError);
    expect(recipients.count).toBe(1);
  });

  test('C#: TestCanSignAndEncrypt', async () => {
    const ctx = contextFor(smimeCertificates);
    const invalid = new MailboxAddress('Joe Nobody', 'joe@nobody.com');
    for (const cert of supportedCertificates) {
      const valid = new MailboxAddress('MimeKit UnitTests', cert.emailAddress!);
      expect(canSign(cert.certificate.getKeyUsageFlags())).toBe(true);
      expect(canEncrypt(cert.certificate.getKeyUsageFlags())).toBe(true);
      expect(await ctx.certificateStore.getPrivateKey(valid)).not.toBeNull();
      expect(await ctx.certificateStore.getCertificate(valid)).not.toBeNull();
      expect(await ctx.certificateStore.getPrivateKey(invalid)).toBeNull();
      expect(await ctx.certificateStore.getCertificate(invalid)).toBeNull();
      await expect(ctx.encryptToMailboxes([invalid], new Uint8Array())).rejects.toBeInstanceOf(CertificateNotFoundException);
      await expect(ctx.signWithMailbox(invalid, DigestAlgorithm.Sha1, new Uint8Array())).rejects.toBeInstanceOf(PrivateKeyNotFoundException);
      await expect(ctx.encapsulatedSignWithMailbox(invalid, DigestAlgorithm.Sha1, new Uint8Array())).rejects.toBeInstanceOf(PrivateKeyNotFoundException);
    }
  });

  test('C#: TestCanSignAndEncryptDnsNames', async () => {
    const ctx = contextFor(smimeCertificates);
    const invalid = new MailboxAddress('Joe Nobody', 'joe@nobody.com');
    for (const domain of domainCertificate.certificate.getSubjectDnsNames()) {
      const valid = new MailboxAddress('MimeKit UnitTests', `mimekit@${domain}`);
      expect(await ctx.certificateStore.getPrivateKey(valid)).not.toBeNull();
      expect(await ctx.certificateStore.getCertificate(valid)).not.toBeNull();
      expect(await ctx.certificateStore.getPrivateKey(invalid)).toBeNull();
      expect(await ctx.certificateStore.getCertificate(invalid)).toBeNull();
    }
  });

  test('C#: TestDigestAlgorithmMappings', () => {
    const ctx = contextFor([rsaCertificate]);
    for (const digest of digestAlgorithmValues()) {
      if (digest === DigestAlgorithm.None || digest === DigestAlgorithm.DoubleSha) continue;
      const micalg = ctx.getDigestAlgorithmName(digest);
      expect(ctx.getDigestAlgorithm(micalg)).toBe(digest);
      try {
        const oid = SecureMimeContext.getDigestOid(digest);
        const mapped = SecureMimeContext.tryGetDigestAlgorithm(oid);
        expect(mapped.ok && mapped.algorithm).toBe(digest);
      } catch (ex) {
        expect(ex).toBeInstanceOf(NotSupportedError);
      }
    }
    expect(() => ctx.getDigestAlgorithmName(DigestAlgorithm.DoubleSha)).toThrow(NotSupportedError);
    expect(() => ctx.getDigestAlgorithmName(DigestAlgorithm.None)).toThrow(RangeError);
    expect(ctx.getDigestAlgorithm('blahblahblah')).toBe(DigestAlgorithm.None);
    expect(SecureMimeContext.tryGetDigestAlgorithm('blahblahblah').ok).toBe(false);
  });

  test('C#: TestSecureMimeCompression', async () => {
    const original = makeTextPart("This is some text that we'll end up compressing...");
    const compressed = await ApplicationPkcs7Mime.compress(original);
    expect(compressed.secureMimeType).toBe(SecureMimeType.CompressedData);
    expect(textOf(await compressed.decompress())).toBe(normalize(original.text));
  });

  test('C#: TestSecureMimeCompressionWithContext', async () => {
    const ctx = contextFor([rsaCertificate]);
    const original = makeTextPart("This is some text that we'll end up compressing...");
    const compressed = await ApplicationPkcs7Mime.compress(ctx, original);
    expect(compressed.secureMimeType).toBe(SecureMimeType.CompressedData);
    expect(textOf(await compressed.decompress(ctx))).toBe(normalize(original.text));
    expect(textOf(await ctx.decompress(decoded(compressed)))).toBe(normalize(original.text));
  });

  test('C#: TestSecureMimeEncapsulatedSigning', async () => {
    // C# signs with a MailboxAddress via the DEFAULT context (no ctx arg) — exercises the
    // no-ctx encapsulatedSignWithMailbox store-lookup-by-email path, distinct from the
    // CmsSigner variants below.
    for (const cert of supportedCertificates) {
      const ctx = contextFor(smimeCertificates);
      const body = makeTextPart("This is some cleartext that we'll end up signing...");
      const self = new MailboxAddress('MimeKit UnitTests', cert.emailAddress!);
      await assertEncapsulated(cert, await ApplicationPkcs7Mime.signWithMailbox(self, DigestAlgorithm.Sha256, body), body, ctx);
    }
  });

  test('C#: TestSecureMimeEncapsulatedSigningWithContext', async () => {
    const ctx = contextFor(smimeCertificates);
    for (const cert of supportedCertificates) {
      const body = makeTextPart("This is some cleartext that we'll end up signing...");
      const mailbox = new SecureMailboxAddress('MimeKit UnitTests', cert.emailAddress!, cert.fingerprint);
      await assertEncapsulated(cert, await ApplicationPkcs7Mime.signWithMailbox(ctx, mailbox, DigestAlgorithm.Sha256, body), body, ctx);
    }
  });

  test('C#: TestSecureMimeEncapsulatedSigningWithCmsSigner', async () => {
    for (const cert of supportedCertificates) {
      const ctx = contextFor(smimeCertificates);
      const body = makeTextPart("This is some cleartext that we'll end up signing...");
      await assertEncapsulated(cert, await ApplicationPkcs7Mime.sign(makeSigner(cert), body), body, ctx);
    }
  });

  test('C#: TestSecureMimeEncapsulatedSigningWithContextAndCmsSigner', async () => {
    const ctx = contextFor(smimeCertificates);
    for (const cert of supportedCertificates) {
      const body = makeTextPart("This is some cleartext that we'll end up signing...");
      await assertEncapsulated(cert, await ApplicationPkcs7Mime.sign(ctx, makeSigner(cert), body), body, ctx);
    }
  });

  test('C#: TestSecureMimeSigningWithCmsSigner', async () => {
    for (const cert of supportedCertificates) {
      const ctx = contextFor(smimeCertificates);
      const body = makeTextPart("This is some cleartext that we'll end up signing...");
      await assertDetached(cert, await MultipartSigned.createDefault(makeSigner(cert), body), body, ctx);
    }
  });

  test('C#: TestSecureMimeSigningWithContextAndCmsSigner', async () => {
    const ctx = contextFor(smimeCertificates);
    for (const cert of supportedCertificates) {
      const body = makeTextPart("This is some cleartext that we'll end up signing...");
      await assertDetached(cert, await MultipartSigned.create(ctx, makeSigner(cert), body), body, ctx);
    }
  });

  test('C#: TestSecureMimeSigningWithRsaSsaPss', async () => {
    const ctx = contextFor(smimeCertificates);
    const body = makeTextPart("This is some cleartext that we'll end up signing...");
    await assertDetached(rsaCertificate, await MultipartSigned.createDefault(makeSigner(rsaCertificate, DigestAlgorithm.Sha256, RsaSignaturePadding.Pss), body), body, ctx);
  });

  test.skip('C#: TestSecureMimeMessageSigning — DEFER:c2c-message-integration', () => {});

  test('C#: TestSecureMimeVerifyThunderbird', async () => {
    const thunderbirdFingerprint = '354ea4dcf98166639b58ec5df06a65de0cd8a95c';
    const thunderbirdName = 'fejj@gnome.org';
    const bytes = new Uint8Array(readFileSync(smimePath('thunderbird-signed.txt')));
    const message = unwrap(MimeMessage.load(bytes));
    const ctx = contextFor(smimeCertificates);
    expect(message.body).toBeInstanceOf(MultipartSigned);
    const multipart = message.body as MultipartSigned;
    const protocol = multipart.contentType.parameters.get('protocol')?.trim();
    expect(ctx.supports(protocol!)).toBe(true);
    expect(multipart.at(1)).toBeInstanceOf(ApplicationPkcs7Signature);
    const signatures = await multipart.verify(ctx);
    expect(signatures.count).toBe(1);
    const signature = signatures.get(0);
    expect(signature.signerCertificate!.name).toBe(thunderbirdName);
    expect(signature.signerCertificate!.fingerprint).toBe(thunderbirdFingerprint);
    expect(signature.encryptionAlgorithms).toEqual([
      EncryptionAlgorithm.Aes256, EncryptionAlgorithm.Aes128, EncryptionAlgorithm.TripleDes,
      EncryptionAlgorithm.RC2128, EncryptionAlgorithm.RC264, EncryptionAlgorithm.Des, EncryptionAlgorithm.RC240,
    ]);
    // C# uses full signature.Verify(); this port defers PKIX chain/trust, so we assert
    // cryptographic-signature validity (verify(true)) — the signer cert is expired and untrusted here.
    expect(await signature.verify(true)).toBe(true);
  });

  test.skip('C#: TestSecureMimeMessageEncryption — DEFER:c2c-message-integration', () => {});

  test.each([SubjectIdentifierType.IssuerAndSerialNumber, SubjectIdentifierType.SubjectKeyIdentifier])(
    'C#: TestSecureMimeEncryption (%s)',
    async (id) => {
      // C# uses the no-ctx Encrypt(recipients, body) + Decrypt() default-context path.
      for (const cert of rsaCertificates) {
        const body = makeTextPart();
        const encrypted = await ApplicationPkcs7Mime.encrypt(recipientsFor(cert, id), body);
        expect(encrypted.secureMimeType).toBe(SecureMimeType.EnvelopedData);
        expect(textOf(await encrypted.decrypt())).toBe(normalize(body.text));
      }
      // DEFER:ecdh — the C# EC recipient arm requires ECDH key agreement; this TS engine has RSA key transport only.
    },
  );

  test.each([SubjectIdentifierType.IssuerAndSerialNumber, SubjectIdentifierType.SubjectKeyIdentifier])(
    'C#: TestSecureMimeEncryptionWithContext (%s)',
    async (id) => {
      const ctx = contextFor(smimeCertificates);
      for (const cert of rsaCertificates) {
        const body = makeTextPart();
        const encrypted = await ApplicationPkcs7Mime.encrypt(ctx, recipientsFor(cert, id), body);
        expect(encrypted.secureMimeType).toBe(SecureMimeType.EnvelopedData);
        // C# WithContext decrypts via ctx.DecryptTo(stream) + MimeEntity.Load — exercise ctx.decryptTo.
        const raw = await ctx.decryptTo(decoded(encrypted));
        const loaded = MimeEntity.load(raw);
        expect(loaded.ok).toBe(true);
        expect(textOf(unwrap(loaded))).toBe(normalize(body.text));
      }
      // DEFER:ecdh — EC recipients require ECDH key agreement.
    },
  );

  test.each([SubjectIdentifierType.IssuerAndSerialNumber, SubjectIdentifierType.SubjectKeyIdentifier])(
    'C#: TestSecureMimeEncryptionWithAlgorithm (%s)',
    async (id) => {
      const algorithms = Array.from({ length: encryptionAlgorithmCount }, (_, i) => i as EncryptionAlgorithm);
      for (const cert of rsaCertificates) {
        for (const algorithm of algorithms) {
          if ([EncryptionAlgorithm.Camellia128, EncryptionAlgorithm.Camellia192, EncryptionAlgorithm.Camellia256,
            EncryptionAlgorithm.Cast5, EncryptionAlgorithm.Idea, EncryptionAlgorithm.Blowfish,
            EncryptionAlgorithm.Twofish, EncryptionAlgorithm.Seed, EncryptionAlgorithm.Des].includes(algorithm)) {
            continue;
          }
          const ctx = contextFor(smimeCertificates);
          const recipients = recipientsFor(cert, id);
          firstRecipient(recipients).encryptionAlgorithms = [algorithm];
          ctx.enable(algorithm);
          if ([EncryptionAlgorithm.RC2128, EncryptionAlgorithm.RC264, EncryptionAlgorithm.RC240].includes(algorithm))
            ctx.disable(EncryptionAlgorithm.TripleDes);
          const encrypted = await ApplicationPkcs7Mime.encrypt(ctx, recipients, makeTextPart());
          expect(textOf(await encrypted.decrypt(ctx))).toBe(normalize(text));
        }
      }
      // C# additionally requires plain DES-CBC to succeed on non-Windows contexts. This engine
      // has no DES-CBC content-encryption case, so a [Des] capability is silently ignored and a
      // default cipher is used — the DES arm is therefore not covered here (DEFER:des-cbc in
      // DEFERRED.md). Not asserting the fallback behavior, which is not a stable contract.
    },
  );

  test.each([
    DigestAlgorithm.Sha1,
    DigestAlgorithm.Sha256,
    DigestAlgorithm.Sha384,
    DigestAlgorithm.Sha512,
  ])('C#: TestSecureMimeEncryptionWithRsaesOaep (%s)', async (hash) => {
    const padding = {
      [DigestAlgorithm.Sha1]: RsaEncryptionPadding.OaepSha1,
      [DigestAlgorithm.Sha256]: RsaEncryptionPadding.OaepSha256,
      [DigestAlgorithm.Sha384]: RsaEncryptionPadding.OaepSha384,
      [DigestAlgorithm.Sha512]: RsaEncryptionPadding.OaepSha512,
    }[hash]!;
    const ctx = contextFor(smimeCertificates);
    const recipients = recipientsFor(rsaCertificate);
    firstRecipient(recipients).encryptionAlgorithms = [EncryptionAlgorithm.Aes128];
    firstRecipient(recipients).rsaEncryptionPadding = padding;
    const encrypted = await ApplicationPkcs7Mime.encrypt(ctx, recipients, makeTextPart());
    expect(encrypted.secureMimeType).toBe(SecureMimeType.EnvelopedData);
    expect(textOf(await encrypted.decrypt(ctx))).toBe(normalize(text));
  });

  test.skip('C#: TestSecureMimeDecryptThunderbird — SKIP:missing-fixture', () => {});

  test('C#: TestSecureMimeSignAndEncrypt', async () => {
    for (const cert of rsaCertificates) {
      const ctx = contextFor(smimeCertificates);
      const body = makeTextPart("This is some cleartext that we'll end up signing and encrypting...");
      const encrypted = await ApplicationPkcs7Mime.signAndEncrypt(ctx, makeSigner(cert), recipientsFor(cert), body);
      expect(encrypted.secureMimeType).toBe(SecureMimeType.EnvelopedData);
      const decrypted = await encrypted.decrypt(ctx);
      expect(decrypted).toBeInstanceOf(MultipartSigned);
      await assertDetached(cert, decrypted as MultipartSigned, body, ctx);
    }
    // DEFER:ecdh — the C# EC recipient arm requires ECDH key agreement.
  });

  test.skip('C#: TestSecureMimeDecryptVerifyThunderbird — SKIP:missing-fixture', () => {});
  test.skip('C#: TestSecureMimeImportExport — DEFER:certs-export', () => {});

  test('C#: TestSecureMimeVerifyMixedLineEndings', async () => {
    const bytes = new Uint8Array(readFileSync(smimePath('octet-stream-with-mixed-line-endings.dat')));
    const message = unwrap(MimeMessage.load(bytes));
    expect(message.body).toBeInstanceOf(MultipartSigned);
    const signed = message.body as MultipartSigned;
    const ctx = contextFor(smimeCertificates);
    const signatures = await signed.verify(ctx);
    expect(signatures.count).toBeGreaterThan(0);
    for (let i = 0; i < signatures.count; i++)
      expect(await signatures.get(i).verify(true)).toBe(true);
  });
});
