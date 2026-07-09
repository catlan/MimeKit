// Port of UnitTests/Cryptography/DkimTests.cs.
//
// Async adaptation: C#'s synchronous Sign/Verify and their *Async siblings both
// map to the single async TS `sign` / `verify`, so each is awaited. Argument
// exceptions (ArgumentNullException / ArgumentException) map to TypeError;
// FormatException maps to the ported `FormatException`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import '../../src/index.js';
import { MimeMessage, createDateTimeOffset } from '../../src/mime-message.js';
import { MimeParser } from '../../src/mime-parser.js';
import { MemoryStream } from '../../src/io/stream.js';
import { Header } from '../../src/header.js';
import { HeaderId } from '../../src/header-id.js';
import { MailboxAddress } from '../../src/mailbox-address.js';
import { TextPart } from '../../src/text-part.js';
import { BodyBuilder } from '../../src/body-builder.js';
import { Multipart } from '../../src/multipart.js';
import { FormatOptions } from '../../src/format-options.js';
import { DkimSigner } from '../../src/dkim/dkim-signer.js';
import { DkimVerifier } from '../../src/dkim/dkim-verifier.js';
import { DkimHashStream } from '../../src/dkim/dkim-hash-stream.js';
import { DkimSignatureStream } from '../../src/dkim/dkim-signature-stream.js';
import { DkimSignatureAlgorithm } from '../../src/dkim/dkim-signature-algorithm.js';
import { DkimCanonicalizationAlgorithm } from '../../src/dkim/dkim-canonicalization-algorithm.js';
import { FormatException } from '../../src/dkim/errors.js';
import { loadPrivateKeyFromPem, parseDkimPublicKey, type AsymmetricKey } from '../../src/dkim/crypto.js';
import type { DkimPublicKeyLocator } from '../../src/dkim/dkim-public-key-locator.js';
import { DkimPublicKeyLocator as TestLocator } from './dkim-public-key-locator.js';
import { testDataDir } from '../gates/helpers.js';

function dkimPath(name: string): string {
  return join(testDataDir, 'dkim', name);
}

function pubFromPem(name: string): AsymmetricKey {
  const pem = readFileSync(dkimPath(name), 'utf8');
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return parseDkimPublicKey('rsa', b64);
}

const examplePem = readFileSync(dkimPath('example.pem'), 'utf8');
const dkimPrivate = loadPrivateKeyFromPem(examplePem);
const dkimPublic = pubFromPem('example.pub');
const gmailPublic = pubFromPem('gmail.pub');
const ed25519Private: AsymmetricKey = { kind: 'ed25519', isPrivate: true, raw: Uint8Array.from(Buffer.from('nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A=', 'base64')) };

function dummyLocator(key: AsymmetricKey): DkimPublicKeyLocator {
  return { locatePublicKey: () => Promise.resolve(key) };
}

function loadMessage(name: string): MimeMessage {
  const r = MimeMessage.load(new Uint8Array(readFileSync(dkimPath(name))));
  if (!r.ok) throw new Error(`load failed: ${r.error.kind} ${r.error.message}`);
  return r.value;
}

function createSigner(algorithm: DkimSignatureAlgorithm, headerAlgorithm: DkimCanonicalizationAlgorithm, bodyAlgorithm: DkimCanonicalizationAlgorithm): DkimSigner {
  const signer = new DkimSigner(examplePem, 'example.com', '1433868189.example');
  signer.bodyCanonicalizationAlgorithm = bodyAlgorithm;
  signer.headerCanonicalizationAlgorithm = headerAlgorithm;
  signer.signatureAlgorithm = algorithm;
  signer.agentOrUserIdentifier = '@eng.example.com';
  signer.queryMethod = 'dns/txt';
  return signer;
}

function fixedDate(): ReturnType<typeof createDateTimeOffset> {
  return createDateTimeOffset(2015, 1, 1, 12, 0, 0, 0);
}

function dkimTag(message: MimeMessage, tag: string): string | null {
  const value = message.headers.getValue(HeaderId.DkimSignature)!;
  for (const raw of value.split(';')) {
    const param = raw.trim();
    if (param.startsWith(`${tag}=`)) return param.substring(tag.length + 1);
  }
  return null;
}

function verifyDkimBodyHash(message: MimeMessage, algorithm: DkimSignatureAlgorithm, expectedHash: string): void {
  expect(dkimTag(message, 'bh')).toBe(expectedHash);
}

async function testEmptyBody(signatureAlgorithm: DkimSignatureAlgorithm, bodyAlgorithm: DkimCanonicalizationAlgorithm, expectedHash: string): Promise<void> {
  const signer = createSigner(signatureAlgorithm, DkimCanonicalizationAlgorithm.Simple, bodyAlgorithm);
  const headers = [HeaderId.From, HeaderId.To, HeaderId.Subject, HeaderId.Date];
  const verifier = new DkimVerifier(dummyLocator(dkimPublic));
  const message = new MimeMessage();

  message.from.add(new MailboxAddress('', 'mimekit@example.com'));
  message.to.add(new MailboxAddress('', 'mimekit@example.com'));
  message.subject = 'This is an empty message';
  message.date = fixedDate();

  const body = new TextPart('plain');
  body.text = '';
  message.body = body;

  message.prepare('7bit');

  await signer.sign(message, headers);

  verifyDkimBodyHash(message, signatureAlgorithm, expectedHash);

  const dkim = message.headers.at(0);

  if (signatureAlgorithm === DkimSignatureAlgorithm.RsaSha1) {
    expect(await verifier.verify(message, dkim)).toBe(false);
    verifier.enable(DkimSignatureAlgorithm.RsaSha1);
  }

  expect(await verifier.verify(message, dkim)).toBe(true);
}

async function testUnicode(signatureAlgorithm: DkimSignatureAlgorithm, bodyAlgorithm: DkimCanonicalizationAlgorithm, expectedHash: string): Promise<void> {
  const signer = createSigner(signatureAlgorithm, DkimCanonicalizationAlgorithm.Simple, bodyAlgorithm);
  const headers = [HeaderId.From, HeaderId.To, HeaderId.Subject, HeaderId.Date];
  const verifier = new DkimVerifier(dummyLocator(dkimPublic));
  const message = new MimeMessage();

  message.from.add(new MailboxAddress('', 'mimekit@example.com'));
  message.to.add(new MailboxAddress('', 'mimekit@example.com'));
  message.subject = 'This is a unicode message';
  message.date = fixedDate();

  const builder = new BodyBuilder();
  builder.textBody = ' تست  ';
  builder.htmlBody = '  <div> تست </div> ';
  message.body = builder.toMessageBody();

  (message.body as Multipart).boundary = '=-MultipartAlternativeBoundary';
  (message.body as Multipart).at(1).contentId = null;

  message.prepare('8bit');

  await signer.sign(message, headers);

  const dkim = message.headers.at(0);

  verifyDkimBodyHash(message, signatureAlgorithm, expectedHash);

  if (signatureAlgorithm === DkimSignatureAlgorithm.RsaSha1) {
    expect(await verifier.verify(message, dkim)).toBe(false);
    verifier.enable(DkimSignatureAlgorithm.RsaSha1);
  }

  expect(await verifier.verify(message, dkim)).toBe(true);
}

async function testDkimSignVerify(message: MimeMessage, signatureAlgorithm: DkimSignatureAlgorithm, headerAlgorithm: DkimCanonicalizationAlgorithm, bodyAlgorithm: DkimCanonicalizationAlgorithm): Promise<void> {
  const headers = [HeaderId.From, HeaderId.Subject, HeaderId.Date];
  const verifier = new DkimVerifier(dummyLocator(dkimPublic));
  const signer = createSigner(signatureAlgorithm, headerAlgorithm, bodyAlgorithm);

  await signer.sign(message, headers);

  const dkim = message.headers.at(0);

  if (signatureAlgorithm === DkimSignatureAlgorithm.RsaSha1) {
    expect(await verifier.verify(message, dkim)).toBe(false);
    verifier.enable(DkimSignatureAlgorithm.RsaSha1);
  }

  expect(await verifier.verify(message, dkim)).toBe(true);

  message.headers.removeAt(0);
}

describe('DkimTests', () => {
  test('TestDkimSignerCtors', () => {
    expect(() => {
      const signer = new DkimSigner(examplePem, 'example.com', '1433868189.example');
      signer.signatureAlgorithm = DkimSignatureAlgorithm.RsaSha256;
      signer.agentOrUserIdentifier = '@eng.example.com';
      signer.queryMethod = 'dns/txt';
    }).not.toThrow();

    expect(() => {
      const signer = new DkimSigner(dkimPrivate, 'example.com', '1433868189.example');
      signer.signatureAlgorithm = DkimSignatureAlgorithm.RsaSha256;
      signer.agentOrUserIdentifier = '@eng.example.com';
      signer.queryMethod = 'dns/txt';
    }).not.toThrow();
  });

  test('TestDkimSignerDefaults', () => {
    let signer = new DkimSigner(dkimPrivate, 'example.com', '1433868189.example');
    expect(signer.signatureAlgorithm).toBe(DkimSignatureAlgorithm.RsaSha256);

    signer = new DkimSigner(examplePem, 'example.com', '1433868189.example');
    expect(signer.signatureAlgorithm).toBe(DkimSignatureAlgorithm.RsaSha256);

    signer = new DkimSigner(new MemoryStream(new TextEncoder().encode(examplePem)), 'example.com', '1433868189.example');
    expect(signer.signatureAlgorithm).toBe(DkimSignatureAlgorithm.RsaSha256);
  });

  test('TestDkimVerifierDefaults', () => {
    const verifier = new DkimVerifier(dummyLocator(dkimPublic));

    expect(verifier.minimumRsaKeyLength).toBe(1024);
    expect(verifier.isEnabled(DkimSignatureAlgorithm.RsaSha1)).toBe(false);
    expect(verifier.isEnabled(DkimSignatureAlgorithm.RsaSha256)).toBe(true);
  });

  test('TestDkimVerifierEnableDisable', () => {
    const verifier = new DkimVerifier(dummyLocator(dkimPublic));

    expect(verifier.isEnabled(DkimSignatureAlgorithm.RsaSha1)).toBe(false);

    verifier.enable(DkimSignatureAlgorithm.RsaSha1);
    expect(verifier.isEnabled(DkimSignatureAlgorithm.RsaSha1)).toBe(true);

    verifier.disable(DkimSignatureAlgorithm.RsaSha1);
    expect(verifier.isEnabled(DkimSignatureAlgorithm.RsaSha1)).toBe(false);
  });

  test('TestDkimHashStream', () => {
    const buffer = new Uint8Array(128);
    const stream = new DkimHashStream(DkimSignatureAlgorithm.RsaSha1);

    expect(stream.canRead).toBe(false);
    expect(stream.canWrite).toBe(true);
    expect(stream.canSeek).toBe(false);
    expect(stream.canTimeout).toBe(false);

    expect(() => stream.read(buffer, 0, buffer.length)).toThrow(TypeError);

    expect(() => stream.write(null as unknown as Uint8Array, 0, 0)).toThrow(TypeError);
    expect(() => stream.write(buffer, -1, 0)).toThrow(RangeError);
    expect(() => stream.write(buffer, 0, -1)).toThrow(RangeError);

    expect(stream.position).toBe(0);
    expect(stream.length).toBe(0);

    expect(() => { stream.position = 64; }).toThrow(TypeError);
    expect(() => stream.seek(64, 'begin')).toThrow(TypeError);
    expect(() => stream.setLength(256)).toThrow(TypeError);

    stream.flush();
  });

  test('TestDkimSignatureStream', () => {
    const signer = createSigner(DkimSignatureAlgorithm.RsaSha1, DkimCanonicalizationAlgorithm.Simple, DkimCanonicalizationAlgorithm.Simple);
    const buffer = new Uint8Array(128);

    expect(() => new DkimSignatureStream(null as never)).toThrow(TypeError);

    const stream = new DkimSignatureStream(signer.createSigningContext());

    expect(stream.canRead).toBe(false);
    expect(stream.canWrite).toBe(true);
    expect(stream.canSeek).toBe(false);
    expect(stream.canTimeout).toBe(false);

    expect(() => stream.read(buffer, 0, buffer.length)).toThrow(TypeError);

    expect(() => stream.write(null as unknown as Uint8Array, 0, 0)).toThrow(TypeError);
    expect(() => stream.write(buffer, -1, 0)).toThrow(RangeError);
    expect(() => stream.write(buffer, 0, -1)).toThrow(RangeError);

    expect(stream.position).toBe(0);
    expect(stream.length).toBe(0);

    expect(() => { stream.position = 64; }).toThrow(TypeError);
    expect(() => stream.seek(64, 'begin')).toThrow(TypeError);
    expect(() => stream.setLength(256)).toThrow(TypeError);

    expect(() => stream.verifySignature(null as unknown as string)).toThrow(TypeError);

    stream.flush();
  });

  test('TestDkimSignaturesExpirationHeaderValue', async () => {
    const signer = createSigner(DkimSignatureAlgorithm.RsaSha1, DkimCanonicalizationAlgorithm.Simple, DkimCanonicalizationAlgorithm.Simple);
    signer.signaturesExpireAfter = 24 * 60 * 60; // TimeSpan.FromDays(1).TotalSeconds

    const headers = [HeaderId.From, HeaderId.To, HeaderId.Subject, HeaderId.Date];
    const message = new MimeMessage();

    message.from.add(new MailboxAddress('', 'mimekit@example.com'));
    message.to.add(new MailboxAddress('', 'mimekit@example.com'));
    message.subject = 'This is an empty message';
    message.date = fixedDate();

    const body = new TextPart('plain');
    body.text = '';
    message.body = body;

    message.prepare('7bit');

    await signer.sign(message, headers);

    const headerValue = message.headers.getValue(HeaderId.DkimSignature)!;
    const parameters = headerValue.split(';');
    let timestamp: number | null = null;
    let expiration: number | null = null;

    for (const raw of parameters) {
      const param = raw.trim();
      // Note: C# uses Substring(3); with real (10-digit) timestamps t and x share
      // the same leading 3 digits, so the difference is preserved.
      if (param.startsWith('t=')) timestamp = parseInt(param.substring(3), 10);
      if (param.startsWith('x=')) expiration = parseInt(param.substring(3), 10);
    }

    expect(timestamp).not.toBeNull();
    expect(expiration).not.toBeNull();
    expect(expiration! - timestamp!).toBe(24 * 60 * 60);
  });

  test('TestArgumentExceptions', async () => {
    const locator = dummyLocator(dkimPublic);
    const verifier = new DkimVerifier(locator);
    const dkimHeader = new Header(HeaderId.DkimSignature, 'value');
    const arcHeader = new Header(HeaderId.ArcMessageSignature, 'value');
    const options = FormatOptions.default;
    const message = new MimeMessage();

    expect(() => new DkimSigner(null as never, 'domain', 'selector')).toThrow(TypeError);
    expect(() => new DkimSigner(dkimPublic, 'domain', 'selector')).toThrow(TypeError);
    expect(() => new DkimSigner(dkimPrivate, null as never, 'selector')).toThrow(TypeError);
    expect(() => new DkimSigner(dkimPrivate, 'domain', null as never)).toThrow(TypeError);
    expect(() => new DkimSigner(null as never, 'domain', 'selector')).toThrow(TypeError);
    expect(() => new DkimSigner('fileName', null as never, 'selector')).toThrow(TypeError);
    expect(() => new DkimSigner('fileName', 'domain', null as never)).toThrow(TypeError);
    expect(() => new DkimSigner('', 'domain', 'selector')).toThrow(TypeError);
    expect(() => new DkimSigner(null as never, 'domain', 'selector')).toThrow(TypeError);

    const signer = new DkimSigner(examplePem, 'example.com', '1433868189.example');
    signer.signatureAlgorithm = DkimSignatureAlgorithm.RsaSha1;
    signer.agentOrUserIdentifier = '@eng.example.com';
    signer.queryMethod = 'dns/txt';

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

    expect(() => new DkimVerifier(null as never)).toThrow(TypeError);

    await expect(verifier.verify(null as never, dkimHeader)).rejects.toThrow(TypeError);
    await expect(verifier.verify(message, null as never)).rejects.toThrow(TypeError);
    await expect(verifier.verify(null as never, message, dkimHeader)).rejects.toThrow(TypeError);
    await expect(verifier.verify(FormatOptions.default, null as never, dkimHeader)).rejects.toThrow(TypeError);
    await expect(verifier.verify(FormatOptions.default, message, null as never)).rejects.toThrow(TypeError);
    await expect(verifier.verify(FormatOptions.default, message, arcHeader)).rejects.toThrow(TypeError);
  });

  test('TestFormatExceptions', async () => {
    const message = loadMessage('gmail.msg');
    const verifier = new DkimVerifier(dummyLocator(dkimPublic));
    const index = message.headers.indexOf(HeaderId.DkimSignature);
    const dkim = message.headers.at(index);
    const original = dkim.value;

    dkim.value = dkim.value.substring(4);
    await expect(verifier.verify(message, dkim)).rejects.toThrow(FormatException);

    dkim.value = 'v=x; ' + dkim.value;
    await expect(verifier.verify(message, dkim)).rejects.toThrow(FormatException);

    dkim.value = original.replace('from:', '');
    await expect(verifier.verify(message, dkim)).rejects.toThrow(FormatException);

    dkim.value = 'i=1; ' + original;
    await expect(verifier.verify(message, dkim)).rejects.toThrow(FormatException);

    dkim.value = 'i=user@domain; ' + original;
    await expect(verifier.verify(message, dkim)).rejects.toThrow(FormatException);

    dkim.value = 'l=abc; ' + original;
    await expect(verifier.verify(message, dkim)).rejects.toThrow(FormatException);

    dkim.value = original.replace('c=relaxed/relaxed;', 'c=simple/complex;');
    await expect(verifier.verify(message, dkim)).rejects.toThrow(FormatException);

    dkim.value = original.replace('c=relaxed/relaxed;', 'c=;');
    await expect(verifier.verify(message, dkim)).rejects.toThrow(FormatException);

    dkim.value = original.replace('c=relaxed/relaxed;', 'c=relaxed/relaxed/extra;');
    await expect(verifier.verify(message, dkim)).rejects.toThrow(FormatException);
  });

  test('TestEmptySimpleBodyRsaSha1', () => testEmptyBody(DkimSignatureAlgorithm.RsaSha1, DkimCanonicalizationAlgorithm.Simple, 'uoq1oCgLlTqpdDX/iUbLy7J1Wic='));
  test('TestEmptySimpleBodyRsaSha256', () => testEmptyBody(DkimSignatureAlgorithm.RsaSha256, DkimCanonicalizationAlgorithm.Simple, 'frcCV1k9oG9oKj3dpUqdJg1PxRT2RSN/XKdLCPjaYaY='));
  test('TestEmptyRelaxedBodyRsaSha1', () => testEmptyBody(DkimSignatureAlgorithm.RsaSha1, DkimCanonicalizationAlgorithm.Relaxed, '2jmj7l5rSw0yVb/vlWAYkK/YBwk='));
  test('TestEmptyRelaxedBodyRsaSha256', () => testEmptyBody(DkimSignatureAlgorithm.RsaSha256, DkimCanonicalizationAlgorithm.Relaxed, '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='));

  test('TestUnicodeSimpleBodyRsaSha1', () => testUnicode(DkimSignatureAlgorithm.RsaSha1, DkimCanonicalizationAlgorithm.Simple, '6GV1ZoyaprYbwRLXsr5+8zY5Jh0='));
  test('TestUnicodeSimpleBodyRsaSha256', () => testUnicode(DkimSignatureAlgorithm.RsaSha256, DkimCanonicalizationAlgorithm.Simple, 'BuW/GpCA9rAVDfStp0Dc2duuFhmwcxhy5jOeL+Xn+ew='));
  test('TestUnicodeRelaxedBodyRsaSha1', () => testUnicode(DkimSignatureAlgorithm.RsaSha1, DkimCanonicalizationAlgorithm.Relaxed, 'bbT6nP0aAiAP5OMguA+mHgpzgh4='));
  test('TestUnicodeRelaxedBodyRsaSha256', () => testUnicode(DkimSignatureAlgorithm.RsaSha256, DkimCanonicalizationAlgorithm.Relaxed, 'PEaN3fYH5NdIg4QzgaSS+ceYlSMRnYbqCPMxncx6gy0='));

  test('TestVerifyGoogleMailDkimSignature', async () => {
    const message = loadMessage('gmail.msg');
    const index = message.headers.indexOf(HeaderId.DkimSignature);
    const verifier = new DkimVerifier(dummyLocator(gmailPublic));
    expect(await verifier.verify(message, message.headers.at(index))).toBe(true);
  });

  test('TestVerifyGoogleMailDkimSignatureAsync', async () => {
    const message = loadMessage('gmail.msg');
    const index = message.headers.indexOf(HeaderId.DkimSignature);
    const verifier = new DkimVerifier(dummyLocator(gmailPublic));
    expect(await verifier.verify(message, message.headers.at(index))).toBe(true);
  });

  test('TestVerifyGoogleMultipartRelatedDkimSignature', async () => {
    const message = loadMessage('related.msg');
    const index = message.headers.indexOf(HeaderId.DkimSignature);
    const verifier = new DkimVerifier(dummyLocator(gmailPublic));
    expect(await verifier.verify(message, message.headers.at(index))).toBe(true);
  });

  test('TestVerifyGoogleMultipartRelatedDkimSignatureAsync', async () => {
    const message = loadMessage('related.msg');
    const index = message.headers.indexOf(HeaderId.DkimSignature);
    const verifier = new DkimVerifier(dummyLocator(gmailPublic));
    expect(await verifier.verify(message, message.headers.at(index))).toBe(true);
  });

  test('TestVerifyGoogleMultipartWithoutEndBoundaryDkimSignature', async () => {
    const message = loadMessage('multipart-no-end-boundary.msg');
    const index = message.headers.indexOf(HeaderId.DkimSignature);
    const verifier = new DkimVerifier(dummyLocator(gmailPublic));
    expect(await verifier.verify(message, message.headers.at(index))).toBe(true);
  });

  test('TestVerifyGoogleMultipartWithoutEndBoundaryDkimSignatureAsync', async () => {
    const message = loadMessage('multipart-no-end-boundary.msg');
    const index = message.headers.indexOf(HeaderId.DkimSignature);
    const verifier = new DkimVerifier(dummyLocator(gmailPublic));
    expect(await verifier.verify(message, message.headers.at(index))).toBe(true);
  });

  test('TestSignRfc8463Example', async () => {
    const message = loadMessage('rfc8463-example.msg');
    const signer = new DkimSigner(ed25519Private, 'football.example.com', 'brisbane', DkimSignatureAlgorithm.Ed25519Sha256);
    signer.headerCanonicalizationAlgorithm = DkimCanonicalizationAlgorithm.Relaxed;
    signer.bodyCanonicalizationAlgorithm = DkimCanonicalizationAlgorithm.Relaxed;
    signer.agentOrUserIdentifier = '@football.example.com';
    const headers = ['from', 'to', 'subject', 'date', 'message-id', 'from', 'subject', 'date'];

    await signer.sign(message, headers);

    const index = message.headers.indexOf(HeaderId.DkimSignature);
    const locator = new TestLocator();
    const verifier = new DkimVerifier(locator);
    const dkim = message.headers.at(index);

    locator.add('brisbane._domainkey.football.example.com', 'v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=');
    locator.add('test._domainkey.football.example.com', 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkHlOQoBTzWRiGs5V6NpP3idY6Wk08a5qhdR6wy5bdOKb2jLQiY/J16JYi0Qvx/byYzCNb3W91y3FutACDfzwQ/BC/e/8uBsCR+yz1Lxj+PL6lHvqMKrM3rG4hstT5QjvHO9PzoxZyVYLzBfO2EeC3Ip3G+2kryOTIKT+l/K4w3QIDAQAB');

    expect(await verifier.verify(message, dkim)).toBe(true);
  });

  test('TestVerifyRfc8463Example', async () => {
    const message = loadMessage('rfc8463-example.msg');
    const locator = new TestLocator();
    const verifier = new DkimVerifier(locator);

    locator.add('brisbane._domainkey.football.example.com', 'v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=');
    locator.add('test._domainkey.football.example.com', 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkHlOQoBTzWRiGs5V6NpP3idY6Wk08a5qhdR6wy5bdOKb2jLQiY/J16JYi0Qvx/byYzCNb3W91y3FutACDfzwQ/BC/e/8uBsCR+yz1Lxj+PL6lHvqMKrM3rG4hstT5QjvHO9PzoxZyVYLzBfO2EeC3Ip3G+2kryOTIKT+l/K4w3QIDAQAB');

    let index = message.headers.lastIndexOf(HeaderId.DkimSignature);
    expect(await verifier.verify(message, message.headers.at(index))).toBe(true);

    index = message.headers.indexOf(HeaderId.DkimSignature);
    expect(await verifier.verify(message, message.headers.at(index))).toBe(true);
  });

  test('TestVerifyRfc8463ExampleAsync', async () => {
    const message = loadMessage('rfc8463-example.msg');
    const locator = new TestLocator();
    const verifier = new DkimVerifier(locator);

    locator.add('brisbane._domainkey.football.example.com', 'v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=');
    locator.add('test._domainkey.football.example.com', 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkHlOQoBTzWRiGs5V6NpP3idY6Wk08a5qhdR6wy5bdOKb2jLQiY/J16JYi0Qvx/byYzCNb3W91y3FutACDfzwQ/BC/e/8uBsCR+yz1Lxj+PL6lHvqMKrM3rG4hstT5QjvHO9PzoxZyVYLzBfO2EeC3Ip3G+2kryOTIKT+l/K4w3QIDAQAB');

    let index = message.headers.lastIndexOf(HeaderId.DkimSignature);
    expect(await verifier.verify(message, message.headers.at(index))).toBe(true);

    index = message.headers.indexOf(HeaderId.DkimSignature);
    expect(await verifier.verify(message, message.headers.at(index))).toBe(true);
  });

  test('TestDkimSignVerifyJwzMbox', async () => {
    const bytes = new Uint8Array(readFileSync(join(testDataDir, 'mbox', 'jwz.mbox.txt')));
    const parser = new MimeParser(new MemoryStream(bytes), 'mbox');
    let i = 0;

    while (!parser.isEndOfStream && i < 10) {
      const result = parser.parseMessage();
      if (!result.ok) throw new Error(`parse error: ${result.error.message}`);
      const message = result.value;

      await testDkimSignVerify(message, DkimSignatureAlgorithm.RsaSha1, DkimCanonicalizationAlgorithm.Relaxed, DkimCanonicalizationAlgorithm.Relaxed);
      await testDkimSignVerify(message, DkimSignatureAlgorithm.RsaSha256, DkimCanonicalizationAlgorithm.Relaxed, DkimCanonicalizationAlgorithm.Simple);
      await testDkimSignVerify(message, DkimSignatureAlgorithm.RsaSha1, DkimCanonicalizationAlgorithm.Simple, DkimCanonicalizationAlgorithm.Relaxed);
      await testDkimSignVerify(message, DkimSignatureAlgorithm.RsaSha256, DkimCanonicalizationAlgorithm.Simple, DkimCanonicalizationAlgorithm.Simple);

      i++;
    }
  });
});
