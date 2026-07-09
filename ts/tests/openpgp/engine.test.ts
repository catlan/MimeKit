// Unit tests for the OpenPgpJsEngine seam, exercised against the real armored
// GnuPG keyring fixtures (TestData/openpgp/mimekit.gpg.{pub,sec}).

import { describe, expect, test, beforeAll } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { testDataDir } from '../gates/helpers.js';
import { OpenPgpJsEngine, type OpenPgpPublicKey, type OpenPgpPrivateKey } from '../../src/openpgp/engine.js';
import { DigestAlgorithm } from '../../src/smime/digest-algorithm.js';
import { EncryptionAlgorithm } from '../../src/smime/encryption-algorithm.js';

const openpgpDir = join(testDataDir, 'openpgp');
const engine = new OpenPgpJsEngine();

let publicKey: OpenPgpPublicKey;
let privateKey: OpenPgpPrivateKey;

const body = new TextEncoder().encode('This is a PGP/MIME engine test.\r\n');

beforeAll(async () => {
  const pub = readFileSync(join(openpgpDir, 'mimekit.gpg.pub'), 'utf8');
  const sec = readFileSync(join(openpgpDir, 'mimekit.gpg.sec'), 'utf8');
  publicKey = (await engine.readPublicKeys(pub))[0]!;
  const locked = (await engine.readPrivateKeys(sec))[0]!;
  privateKey = await engine.unlock(locked, 'no.secret');
});

describe('OpenPgpJsEngine', () => {
  test('loads the fixture keys with the expected user id', () => {
    expect(publicKey.getUserIDs()).toContain('MimeKit UnitTests <mimekit@example.com>');
    expect(privateKey.isDecrypted()).toBe(true);
  });

  test('detached sign + verify round-trips', async () => {
    const signature = await engine.signDetached(body, [privateKey], DigestAlgorithm.Sha256);
    const armored = new TextDecoder().decode(signature);
    expect(armored).toContain('-----BEGIN PGP SIGNATURE-----');
    const verifications = await engine.verifyDetached(body, signature, [publicKey]);
    expect(verifications.length).toBe(1);
    expect(verifications[0]!.verified).toBe(true);
  });

  test('detached verify rejects a tampered body', async () => {
    const signature = await engine.signDetached(body, [privateKey], DigestAlgorithm.Sha256);
    const tampered = new TextEncoder().encode('This is a DIFFERENT body.\r\n');
    const verifications = await engine.verifyDetached(tampered, signature, [publicKey]);
    expect(verifications[0]!.verified).toBe(false);
  });

  test('encrypt + decrypt round-trips', async () => {
    const encrypted = await engine.encrypt(body, [publicKey]);
    expect(new TextDecoder().decode(encrypted)).toContain('-----BEGIN PGP MESSAGE-----');
    const result = await engine.decrypt(encrypted, [privateKey]);
    expect(result.data).toEqual(body);
  });

  test('encrypt with explicit cipher + decrypt round-trips', async () => {
    const encrypted = await engine.encrypt(body, [publicKey], { cipher: EncryptionAlgorithm.Aes256 });
    const result = await engine.decrypt(encrypted, [privateKey]);
    expect(result.data).toEqual(body);
  });

  test('sign+encrypt + decrypt+verify round-trips', async () => {
    const encrypted = await engine.encrypt(body, [publicKey], { signingKeys: [privateKey] });
    const result = await engine.decrypt(encrypted, [privateKey], [publicKey]);
    expect(result.data).toEqual(body);
    expect(result.signatures.length).toBe(1);
    expect(result.signatures[0]!.verified).toBe(true);
  });
});
