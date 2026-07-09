// End-to-end tests for the OpenPgpContext crypto core: keyring import + mailbox key
// resolution + engine sign/verify/encrypt/decrypt, exercised against the real
// TestData/openpgp keyring fixtures.

import { describe, expect, test, beforeAll } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { testDataDir } from '../gates/helpers.js';
import { OpenPgpContext } from '../../src/openpgp/openpgp-context.js';
import { DigestAlgorithm } from '../../src/smime/digest-algorithm.js';
import { EncryptionAlgorithm } from '../../src/smime/encryption-algorithm.js';
import { MailboxAddress } from '../../src/mailbox-address.js';

const openpgpDir = join(testDataDir, 'openpgp');
const mimekit = new MailboxAddress('MimeKit UnitTests', 'mimekit@example.com');
const nobody = new MailboxAddress('Joe Nobody', 'joe@nobody.com');
const body = new TextEncoder().encode('This is a PGP/MIME context test.\r\n');

async function contextWithKeys(): Promise<OpenPgpContext> {
  const ctx = new OpenPgpContext({ getPassword: () => 'no.secret' });
  await ctx.import(readFileSync(join(openpgpDir, 'mimekit.gpg.pub'), 'utf8'));
  await ctx.import(readFileSync(join(openpgpDir, 'mimekit.gpg.sec'), 'utf8'));
  return ctx;
}

describe('OpenPgpContext', () => {
  test('protocol getters + supports', () => {
    const ctx = new OpenPgpContext();
    expect(ctx.signatureProtocol).toBe('application/pgp-signature');
    expect(ctx.encryptionProtocol).toBe('application/pgp-encrypted');
    expect(ctx.keyExchangeProtocol).toBe('application/pgp-keys');
    expect(ctx.supports('application/pgp-signature')).toBe(true);
    expect(ctx.supports('text/plain')).toBe(false);
  });

  test('resolves keys by mailbox; throws for unknown', async () => {
    const ctx = await contextWithKeys();
    expect((await ctx.getPublicKeys([mimekit])).length).toBe(1);
    await expect(ctx.getPublicKeys([nobody])).rejects.toThrow();
    await expect(ctx.getSigningKey(nobody)).rejects.toThrow();
  });

  test('detached sign + verify resolves the signer certificate', async () => {
    const ctx = await contextWithKeys();
    const signature = await ctx.sign(mimekit, DigestAlgorithm.Sha256, body);
    const sigs = await ctx.verify(body, signature);
    expect(sigs.length).toBe(1);
    expect(await sigs[0]!.verify()).toBe(true);
    expect(sigs[0]!.signerCertificate?.email).toBe('mimekit@example.com');
    expect(sigs[0]!.signerCertificate?.name).toBe('MimeKit UnitTests');
    expect(sigs[0]!.signerCertificate?.fingerprint).toBe('44cd48eec90d8849961f36ba50dcd107ab0821a2');
  });

  test('detached verify reports invalid for a tampered body', async () => {
    const ctx = await contextWithKeys();
    const signature = await ctx.sign(mimekit, DigestAlgorithm.Sha256, body);
    const sigs = await ctx.verify(new TextEncoder().encode('tampered\r\n'), signature);
    expect(await sigs[0]!.verify()).toBe(false);
  });

  test('encrypt + decrypt round-trips (mailbox recipients)', async () => {
    const ctx = await contextWithKeys();
    const encrypted = await ctx.encrypt([mimekit], body);
    const { data } = await ctx.decrypt(encrypted);
    expect(data).toEqual(body);
  });

  test('encrypt with explicit cipher round-trips', async () => {
    const ctx = await contextWithKeys();
    const encrypted = await ctx.encrypt([mimekit], body, EncryptionAlgorithm.Aes256);
    const { data } = await ctx.decrypt(encrypted);
    expect(data).toEqual(body);
  });

  test('signAndEncrypt round-trips and verifies the signature', async () => {
    const ctx = await contextWithKeys();
    const encrypted = await ctx.signAndEncrypt(mimekit, DigestAlgorithm.Sha256, [mimekit], body);
    const { data, signatures } = await ctx.decrypt(encrypted);
    expect(data).toEqual(body);
    expect(signatures.length).toBe(1);
    expect(await signatures[0]!.verify()).toBe(true);
    expect(signatures[0]!.signerCertificate?.email).toBe('mimekit@example.com');
  });
});
