// Port of the structurally-special ArcSignerTests.cs cases (ctors, defaults,
// argument exceptions). The regular Sign-driven KATs are in arc-signer.test.ts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import '../../src/index.js';
import { MimeMessage } from '../../src/mime-message.js';
import { MemoryStream } from '../../src/io/stream.js';
import { Header } from '../../src/header.js';
import { HeaderId } from '../../src/header-id.js';
import { FormatOptions } from '../../src/format-options.js';
import { DkimSignatureAlgorithm } from '../../src/dkim/dkim-signature-algorithm.js';
import { loadPrivateKeyFromPem, parseDkimPublicKey, type AsymmetricKey } from '../../src/dkim/crypto.js';
import { DummyArcSigner } from './dummy-arc-signer.js';
import { testDataDir } from '../gates/helpers.js';

const examplePem = readFileSync(join(testDataDir, 'dkim', 'example.pem'), 'utf8');
const keysPrivate = loadPrivateKeyFromPem(examplePem);
const keysPublic: AsymmetricKey = (() => {
  const pem = readFileSync(join(testDataDir, 'dkim', 'example.pub'), 'utf8');
  return parseDkimPublicKey('rsa', pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
})();

describe('ArcSignerTests (extra)', () => {
  test('TestArcSignerCtors', () => {
    expect(() => {
      const signer = new DummyArcSigner(examplePem, 'example.com', '1433868189.example');
      signer.signatureAlgorithm = DkimSignatureAlgorithm.RsaSha256;
    }).not.toThrow();

    expect(() => {
      const signer = new DummyArcSigner(keysPrivate, 'example.com', '1433868189.example');
      signer.signatureAlgorithm = DkimSignatureAlgorithm.RsaSha256;
    }).not.toThrow();
  });

  test('TestArcSignerDefaults', () => {
    let signer = new DummyArcSigner(keysPrivate, 'example.com', '1433868189.example');
    expect(signer.signatureAlgorithm).toBe(DkimSignatureAlgorithm.RsaSha256);

    signer = new DummyArcSigner(examplePem, 'example.com', '1433868189.example');
    expect(signer.signatureAlgorithm).toBe(DkimSignatureAlgorithm.RsaSha256);

    signer = new DummyArcSigner(new MemoryStream(new TextEncoder().encode(examplePem)), 'example.com', '1433868189.example');
    expect(signer.signatureAlgorithm).toBe(DkimSignatureAlgorithm.RsaSha256);
  });

  test('TestArgumentExceptions', async () => {
    const options = FormatOptions.default;
    const message = new MimeMessage();

    expect(() => new DummyArcSigner(null as never, 'domain', 'selector')).toThrow(TypeError);
    expect(() => new DummyArcSigner(keysPublic, 'domain', 'selector')).toThrow(TypeError);
    expect(() => new DummyArcSigner(keysPrivate, null as never, 'selector')).toThrow(TypeError);
    expect(() => new DummyArcSigner(keysPrivate, 'domain', null as never)).toThrow(TypeError);
    expect(() => new DummyArcSigner(null as never, 'domain', 'selector')).toThrow(TypeError);
    expect(() => new DummyArcSigner('fileName', null as never, 'selector')).toThrow(TypeError);
    expect(() => new DummyArcSigner('fileName', 'domain', null as never)).toThrow(TypeError);
    expect(() => new DummyArcSigner('', 'domain', 'selector')).toThrow(TypeError);
    expect(() => new DummyArcSigner(null as never, 'domain', 'selector')).toThrow(TypeError);

    const signer = new DummyArcSigner(examplePem, 'example.com', '1433868189.example');
    signer.signatureAlgorithm = DkimSignatureAlgorithm.RsaSha1;

    // Sign / SignAsync (both async in the port)
    await expect(signer.sign(null as never, [HeaderId.From])).rejects.toThrow(TypeError);
    await expect(signer.sign(message, null as never)).rejects.toThrow(TypeError);
    await expect(signer.sign(message, [HeaderId.Unknown, HeaderId.From])).rejects.toThrow(TypeError);
    await expect(signer.sign(message, [HeaderId.Received, HeaderId.From])).rejects.toThrow(TypeError);
    await expect(signer.sign(message, [HeaderId.ContentType])).rejects.toThrow(TypeError);
    await expect(signer.sign(null as never, ['From'])).rejects.toThrow(TypeError);
    await expect(signer.sign(message, null as never)).rejects.toThrow(TypeError);
    await expect(signer.sign(message, ['', 'From'])).rejects.toThrow(TypeError);
    await expect(signer.sign(message, [null as never, 'From'])).rejects.toThrow(TypeError);
    await expect(signer.sign(message, ['Received', 'From'])).rejects.toThrow(TypeError);
    await expect(signer.sign(message, ['Content-Type'])).rejects.toThrow(TypeError);

    await expect(signer.sign(null as never, message, [HeaderId.From])).rejects.toThrow(TypeError);
    await expect(signer.sign(options, null as never, [HeaderId.From])).rejects.toThrow(TypeError);
    await expect(signer.sign(options, message, [HeaderId.From, HeaderId.Unknown])).rejects.toThrow(TypeError);
    await expect(signer.sign(options, message, null as never)).rejects.toThrow(TypeError);

    await expect(signer.sign(null as never, message, ['From'])).rejects.toThrow(TypeError);
    await expect(signer.sign(options, null as never, ['From'])).rejects.toThrow(TypeError);
    await expect(signer.sign(options, message, ['From', null as never])).rejects.toThrow(TypeError);
    await expect(signer.sign(options, message, null as never)).rejects.toThrow(TypeError);
  });
});
