// Integration tests for the PGP/MIME layer (MultipartSigned PGP path,
// MultipartEncrypted, and message-level sign/encrypt/signAndEncrypt) over the real
// GnuPG keyring fixtures.

import { describe, expect, test, beforeAll } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { testDataDir } from '../gates/helpers.js';
import '../../src/openpgp/index.js';
import { OpenPgpContext } from '../../src/openpgp/openpgp-context.js';
import { MultipartEncrypted } from '../../src/openpgp/multipart-encrypted.js';
import { ApplicationPgpEncrypted } from '../../src/openpgp/application-pgp-encrypted.js';
import { ApplicationPgpSignature } from '../../src/openpgp/application-pgp-signature.js';
import { MultipartSigned } from '../../src/smime/multipart-signed.js';
import { DigestAlgorithm } from '../../src/smime/digest-algorithm.js';
import { EncryptionAlgorithm } from '../../src/smime/encryption-algorithm.js';
import { MailboxAddress } from '../../src/mailbox-address.js';
import { MimeMessage } from '../../src/mime-message.js';
import { TextPart } from '../../src/text-part.js';

const openpgpDir = join(testDataDir, 'openpgp');
const self = new MailboxAddress('MimeKit UnitTests', 'mimekit@example.com');

async function ctxWithKeys(): Promise<OpenPgpContext> {
  const ctx = new OpenPgpContext({ getPassword: () => 'no.secret' });
  await ctx.import(readFileSync(join(openpgpDir, 'mimekit.gpg.pub'), 'utf8'));
  await ctx.import(readFileSync(join(openpgpDir, 'mimekit.gpg.sec'), 'utf8'));
  return ctx;
}

function textPart(text: string): TextPart {
  const part = new TextPart('plain');
  part.text = text;
  return part;
}

function message(body: TextPart): MimeMessage {
  const msg = new MimeMessage();
  msg.subject = 'PGP/MIME test';
  msg.from.add(self);
  msg.to.add(self);
  msg.body = body;
  return msg;
}

describe('PGP/MIME layer', () => {
  test('MultipartSigned (PGP) create + verify', async () => {
    const ctx = await ctxWithKeys();
    const body = textPart('This is a PGP/MIME signed body.\r\n');
    const signed = await MultipartSigned.create(ctx, self, DigestAlgorithm.Sha256, body);
    expect(signed.count).toBe(2);
    expect(signed.contentType.parameters.get('protocol')).toBe('application/pgp-signature');
    expect(signed.contentType.parameters.get('micalg')).toBe('pgp-sha256');
    expect(signed.at(1)).toBeInstanceOf(ApplicationPgpSignature);
    const sigs = await signed.verify(ctx);
    expect(sigs.count).toBe(1);
    expect(await sigs.get(0).verify(true)).toBe(true);
    expect(sigs.get(0).signerCertificate?.email).toBe('mimekit@example.com');
  });

  test('MultipartEncrypted encrypt + decrypt round-trips', async () => {
    const ctx = await ctxWithKeys();
    const body = textPart('This is a PGP/MIME encrypted body.\r\n');
    const encrypted = await MultipartEncrypted.encrypt(ctx, [self], body);
    expect(encrypted.count).toBe(2);
    expect(encrypted.contentType.parameters.get('protocol')).toBe('application/pgp-encrypted');
    expect(encrypted.at(0)).toBeInstanceOf(ApplicationPgpEncrypted);
    const { entity } = await encrypted.decrypt(ctx);
    expect(entity).toBeInstanceOf(TextPart);
    expect((entity as TextPart).text.replace(/\r\n/g, '\n')).toBe('This is a PGP/MIME encrypted body.\n');
  });

  test('MultipartEncrypted signAndEncrypt round-trips and verifies', async () => {
    const ctx = await ctxWithKeys();
    const body = textPart('Signed and encrypted.\r\n');
    const encrypted = await MultipartEncrypted.signAndEncrypt(ctx, self, DigestAlgorithm.Sha256, [self], body, EncryptionAlgorithm.Aes256);
    const { entity, signatures } = await encrypted.decrypt(ctx);
    expect((entity as TextPart).text.replace(/\r\n/g, '\n')).toBe('Signed and encrypted.\n');
    expect(signatures).not.toBeNull();
    expect(await signatures!.get(0).verify(true)).toBe(true);
  });

  test('MimeMessage.sign (PGP) produces a verifiable multipart/signed', async () => {
    const ctx = await ctxWithKeys();
    const msg = message(textPart('Message body to sign.\r\n'));
    await msg.sign(ctx, DigestAlgorithm.Sha256);
    expect(msg.body).toBeInstanceOf(MultipartSigned);
    const sigs = await (msg.body as MultipartSigned).verify(ctx);
    expect(await sigs.get(0).verify(true)).toBe(true);
  });

  test('MimeMessage.encrypt (PGP) round-trips', async () => {
    const ctx = await ctxWithKeys();
    const msg = message(textPart('Message body to encrypt.\r\n'));
    await msg.encrypt(ctx);
    expect(msg.body).toBeInstanceOf(MultipartEncrypted);
    const { entity } = await (msg.body as MultipartEncrypted).decrypt(ctx);
    expect((entity as TextPart).text.replace(/\r\n/g, '\n')).toBe('Message body to encrypt.\n');
  });

  test('MimeMessage.signAndEncrypt (PGP) round-trips and verifies', async () => {
    const ctx = await ctxWithKeys();
    const msg = message(textPart('Message to sign and encrypt.\r\n'));
    await msg.signAndEncrypt(ctx, DigestAlgorithm.Sha256);
    expect(msg.body).toBeInstanceOf(MultipartEncrypted);
    const { entity, signatures } = await (msg.body as MultipartEncrypted).decrypt(ctx);
    expect((entity as TextPart).text.replace(/\r\n/g, '\n')).toBe('Message to sign and encrypt.\n');
    expect(await signatures!.get(0).verify(true)).toBe(true);
  });
});
