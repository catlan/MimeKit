// Smoke tests for the C2b-1 crypto backend pieces that have no 1:1 C# analogue
// (they replace MimeKit's excluded SQL cert-store + BouncyCastle chain builder):
// the structural chain builder and the in-memory ISecureMimeStore.

import { describe, expect, test } from 'vitest';
import { MailboxAddress } from '../../src/mailbox-address.js';
import { buildCertificateChain } from '../../src/smime/chain-builder.js';
import { InMemorySecureMimeStore } from '../../src/smime/in-memory-store.js';
import { rsaCertificate } from './helpers.js';

describe('C2b-1 backend smoke', () => {
  test('buildCertificateChain orders a leaf-first chain by issuer links', () => {
    const certs = rsaCertificate.chain; // leaf..root (4 certs from the PFX)
    const leaf = certs[0]!;
    // Shuffle the candidate order to prove name-based chaining, not input order.
    const shuffled = [certs[2]!, certs[0]!, certs[3]!, certs[1]!];

    const chain = buildCertificateChain(leaf, shuffled);

    expect(chain.count).toBe(certs.length);
    for (let i = 0; i < certs.length; i++) expect(chain.get(i).equals(certs[i]!)).toBe(true);
  });

  test('InMemorySecureMimeStore resolves certificates + keys by mailbox', async () => {
    const store = new InMemorySecureMimeStore();
    const leaf = rsaCertificate.certificate;

    await store.addCertificate(leaf);
    const found = await store.getCertificate(new MailboxAddress(null, 'rsa@mimekit.net'));
    expect(found).not.toBeNull();
    expect(found!.getFingerprint()).toBe(leaf.getFingerprint());

    // Unknown recipient => null.
    expect(await store.getCertificate(new MailboxAddress(null, 'nobody@example.com'))).toBeNull();

    // Private-key registration + lookup.
    store.addPrivateKey(rsaCertificate.chain, rsaCertificate.privateKey);
    const entry = await store.getPrivateKey(new MailboxAddress(null, 'rsa@mimekit.net'));
    expect(entry).not.toBeNull();
    expect(entry!.key.isPrivate).toBe(true);
    expect(entry!.chain.length).toBe(rsaCertificate.chain.length);

    // Trust anchors.
    const root = rsaCertificate.chain[rsaCertificate.chain.length - 1]!;
    store.addTrustedAnchor(root);
    const anchors = await store.getTrustedAnchors();
    expect(anchors.some((a) => a.equals(root))).toBe(true);

    // importCertificates over raw DER.
    const store2 = new InMemorySecureMimeStore();
    await store2.importCertificates(leaf.getEncoded());
    expect(await store2.getCertificate(new MailboxAddress(null, 'rsa@mimekit.net'))).not.toBeNull();
  });
});
