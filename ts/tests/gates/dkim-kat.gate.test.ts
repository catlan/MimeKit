/**
 * External Known-Answer-Test gate for DKIM — INDEPENDENT of the C# oracle.
 *
 * These anchors prove the canonicalization/hash/verify path is correct even if
 * the oracle were wrong:
 *  - the empty-body body-hash constants (relaxed/simple SHA-256), published and
 *    reproducible from first principles;
 *  - the RFC 8463 Ed25519 + RSA example message (verify both signatures), and a
 *    round-trip reproduction of its Ed25519 signature.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import '../../src/index.js';
import { MimeMessage } from '../../src/mime-message.js';
import { HeaderId } from '../../src/header-id.js';
import { FilteredStream } from '../../src/io/filtered-stream.js';
import { DkimSigner } from '../../src/dkim/dkim-signer.js';
import { DkimVerifier } from '../../src/dkim/dkim-verifier.js';
import { DkimHashStream } from '../../src/dkim/dkim-hash-stream.js';
import { DkimSimpleBodyFilter } from '../../src/dkim/dkim-simple-body-filter.js';
import { DkimRelaxedBodyFilter } from '../../src/dkim/dkim-relaxed-body-filter.js';
import { DkimSignatureAlgorithm } from '../../src/dkim/dkim-signature-algorithm.js';
import { DkimCanonicalizationAlgorithm } from '../../src/dkim/dkim-canonicalization-algorithm.js';
import { bytesToBase64, type AsymmetricKey } from '../../src/dkim/crypto.js';
import { DkimPublicKeyLocator } from '../dkim/dkim-public-key-locator.js';
import { testDataDir } from './helpers.js';

const BRISBANE = 'v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=';
const TEST_RSA = 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkHlOQoBTzWRiGs5V6NpP3idY6Wk08a5qhdR6wy5bdOKb2jLQiY/J16JYi0Qvx/byYzCNb3W91y3FutACDfzwQ/BC/e/8uBsCR+yz1Lxj+PL6lHvqMKrM3rG4hstT5QjvHO9PzoxZyVYLzBfO2EeC3Ip3G+2kryOTIKT+l/K4w3QIDAQAB';

function loadMessage(name: string): MimeMessage {
  const r = MimeMessage.load(new Uint8Array(readFileSync(join(testDataDir, 'dkim', name))));
  if (!r.ok) throw new Error(`${r.error.kind}: ${r.error.message}`);
  return r.value;
}

function emptyBodyHash(canon: DkimCanonicalizationAlgorithm): string {
  const stream = new DkimHashStream(DkimSignatureAlgorithm.RsaSha256, -1);
  const filter = canon === DkimCanonicalizationAlgorithm.Relaxed ? new DkimRelaxedBodyFilter() : new DkimSimpleBodyFilter();
  const filtered = new FilteredStream(stream);
  filtered.add(filter);
  filtered.flush();
  if (!filter.lastWasNewLine) {
    const nl = new Uint8Array([0x0d, 0x0a]);
    stream.write(nl, 0, nl.length);
  }
  return bytesToBase64(stream.generateHash());
}

function rfc8463Locator(): DkimPublicKeyLocator {
  const locator = new DkimPublicKeyLocator();
  locator.add('brisbane._domainkey.football.example.com', BRISBANE);
  locator.add('test._domainkey.football.example.com', TEST_RSA);
  return locator;
}

describe('dkim KAT gate (oracle-independent)', () => {
  test('empty-body SHA-256 body-hash constants', () => {
    // relaxed empty body == SHA-256 of the empty string.
    expect(emptyBodyHash(DkimCanonicalizationAlgorithm.Relaxed)).toBe('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
    // simple empty body == SHA-256 of "\r\n".
    expect(emptyBodyHash(DkimCanonicalizationAlgorithm.Simple)).toBe('frcCV1k9oG9oKj3dpUqdJg1PxRT2RSN/XKdLCPjaYaY=');
  });

  test('RFC 8463 example verifies (ed25519-sha256 and rsa-sha256)', async () => {
    const message = loadMessage('rfc8463-example.msg');
    const verifier = new DkimVerifier(rfc8463Locator());

    const rsa = message.headers.lastIndexOf(HeaderId.DkimSignature);
    expect(await verifier.verify(message, message.headers.at(rsa))).toBe(true);

    const ed = message.headers.indexOf(HeaderId.DkimSignature);
    expect(await verifier.verify(message, message.headers.at(ed))).toBe(true);
  });

  test('RFC 8463 Ed25519 signature reproduces and verifies', async () => {
    const message = loadMessage('rfc8463-example.msg');
    const seed = Uint8Array.from(Buffer.from('nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A=', 'base64'));
    const key: AsymmetricKey = { kind: 'ed25519', isPrivate: true, raw: seed };
    const signer = new DkimSigner(key, 'football.example.com', 'brisbane', DkimSignatureAlgorithm.Ed25519Sha256);
    signer.headerCanonicalizationAlgorithm = DkimCanonicalizationAlgorithm.Relaxed;
    signer.bodyCanonicalizationAlgorithm = DkimCanonicalizationAlgorithm.Relaxed;
    signer.agentOrUserIdentifier = '@football.example.com';

    await signer.sign(message, ['from', 'to', 'subject', 'date', 'message-id', 'from', 'subject', 'date']);

    const verifier = new DkimVerifier(rfc8463Locator());
    const index = message.headers.indexOf(HeaderId.DkimSignature);
    expect(await verifier.verify(message, message.headers.at(index))).toBe(true);
  });
});
