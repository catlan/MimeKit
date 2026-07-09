/**
 * Differential gate: TS S/MIME engine <-> the C# crypto oracle (oracle-smime,
 * which references the FULL MimeKit + BouncyCastle via TemporarySecureMimeContext
 * loaded with the TestData/smime PKCS#12 fixtures).
 *
 * CMS output is NON-deterministic (random session keys/IVs, signing time), so
 * the gate is BIDIRECTIONAL cross-verification, not byte-parity:
 *   - oracle -> TS: TS verifies/decrypts/decompresses the parts MimeKit produced
 *     (generated into gates/out/oracle/smime by `node gates/oracle-gen.mjs smime`).
 *   - TS -> oracle: the oracle verifies/decrypts/decompresses the parts TS
 *     produces (run live here via the oracle-smime process).
 * Together these prove RFC-conformant interop with real MimeKit in both
 * directions over the algorithm matrix.
 *
 * ANTI-FACADE: the TS crypto never imports/reads the oracle; primitives come
 * only from WebCrypto + @noble + pkijs. The oracle is a separate C# process.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, beforeAll } from 'vitest';
import '../../src/smime/index.js';
import { PkijsSecureMimeContext } from '../../src/smime/pkijs-secure-mime-context.js';
import { CmsSigner } from '../../src/smime/cms-signer.js';
import { CmsRecipient } from '../../src/smime/cms-recipient.js';
import { CmsRecipientCollection } from '../../src/smime/cms-recipient-collection.js';
import { MultipartSigned } from '../../src/smime/multipart-signed.js';
import { ApplicationPkcs7Mime } from '../../src/smime/application-pkcs7-mime.js';
import { DigestAlgorithm } from '../../src/smime/digest-algorithm.js';
import { EncryptionAlgorithm } from '../../src/smime/encryption-algorithm.js';
import { RsaEncryptionPadding } from '../../src/smime/rsa-encryption-padding.js';
import { RsaSignaturePadding } from '../../src/smime/rsa-signature-padding.js';
import { MimeEntity } from '../../src/mime-entity.js';
import { TextPart } from '../../src/text-part.js';
import { FormatOptions } from '../../src/format-options.js';
import { MemoryStream } from '../../src/io/stream.js';
import { loadPkcs12 } from '../../src/smime/pkcs12-loader.js';
import { testDataDir } from './helpers.js';

const smimeOut = join(__dirname, '..', '..', 'gates', 'out', 'oracle', 'smime');
const smimeDll = join(testDataDir, '..', '..', 'oracle-smime', 'bin', 'Release', 'net10.0', 'oracle-smime.dll');
const smimeCertDir = join(testDataDir, 'smime');

const EXPECTED_BODY = 'The quick brown fox jumps over the lazy dog.';

function readFixture(rel: string): Uint8Array {
  const p = join(smimeOut, rel);
  if (!existsSync(p)) throw new Error(`missing oracle output ${rel} — run: node gates/oracle-gen.mjs smime`);
  return new Uint8Array(readFileSync(p));
}

function loadEntity(bytes: Uint8Array): MimeEntity {
  const r = MimeEntity.load(bytes);
  if (!r.ok) throw new Error(`${r.error.kind}: ${r.error.message}`);
  return r.value;
}

function textOf(entity: MimeEntity): string {
  return (entity as TextPart).text.replace(/\r\n/g, '\n').trimEnd();
}

function loadPfx(rel: string) {
  return loadPkcs12(new Uint8Array(readFileSync(join(smimeCertDir, rel))), 'no.secret');
}

const rsa = loadPfx('rsa/smime.pfx');
const ec = existsSync(join(smimeCertDir, 'ec/smime.pfx')) ? loadPfx('ec/smime.pfx') : null;

function makeContext(): PkijsSecureMimeContext {
  const ctx = new PkijsSecureMimeContext(undefined, { allowLegacyDecryption: true });
  ctx.certificateStore.addPrivateKey(rsa.certificateChain, rsa.privateKey);
  ctx.certificateStore.addCertificate(rsa.certificateChain[0]!);
  if (ec) {
    ctx.certificateStore.addPrivateKey(ec.certificateChain, ec.privateKey);
    ctx.certificateStore.addCertificate(ec.certificateChain[0]!);
  }
  return ctx;
}

function signerFor(algo: string): CmsSigner {
  if (algo === 'ecdsa-sha256') {
    const s = new CmsSigner(ec!.certificateChain, ec!.privateKey);
    s.digestAlgorithm = DigestAlgorithm.Sha256;
    return s;
  }
  const s = new CmsSigner(rsa.certificateChain, rsa.privateKey);
  s.digestAlgorithm = DigestAlgorithm.Sha256;
  if (algo === 'rsa-pss-sha256') s.rsaSignaturePadding = RsaSignaturePadding.Pss;
  return s;
}

function serialize(entity: MimeEntity): Uint8Array {
  const mem = new MemoryStream();
  const opts = FormatOptions.default.clone();
  opts.newLineFormat = 'dos';
  entity.writeTo(opts, mem);
  return mem.toArray();
}

let tmp: string;
function oracleRun(...args: string[]): string {
  return execFileSync('dotnet', [smimeDll, ...args], { encoding: 'utf8' }).trim();
}

const SIGN_ALGOS = ['rsa-sha256', 'rsa-pss-sha256', 'ecdsa-sha256'] as const;
const ENC_COMBOS = [
  ['aes256.oaep', RsaEncryptionPadding.OaepSha1, EncryptionAlgorithm.Aes256],
  ['aes128.v1.5', RsaEncryptionPadding.Pkcs1, EncryptionAlgorithm.Aes128],
  ['3des.v1.5', RsaEncryptionPadding.Pkcs1, EncryptionAlgorithm.TripleDes],
  ['rc2-128.v1.5', RsaEncryptionPadding.Pkcs1, EncryptionAlgorithm.RC2128],
] as const;

describe('S/MIME oracle cross-verify gate', () => {
  beforeAll(() => {
    if (!existsSync(smimeDll))
      throw new Error(`oracle-smime not built at ${smimeDll} — run: node gates/oracle-gen.mjs smime`);
    tmp = mkdtempSync(join(tmpdir(), 'smime-gate-'));
  });

  // ---- oracle -> TS (verify) ----
  describe.each(SIGN_ALGOS)('oracle-signed %s -> TS verifies', (algo) => {
    const ecdsaMissing = algo === 'ecdsa-sha256' && !ec;
    test.skipIf(ecdsaMissing)('detached', async () => {
      const ctx = makeContext();
      const signed = loadEntity(readFixture(`signed/${algo}.txt`)) as MultipartSigned;
      const sigs = await signed.verify(ctx);
      expect(sigs.count).toBeGreaterThan(0);
      for (const sig of sigs) expect(await sig.verify(true)).toBe(true);
    });
    test.skipIf(ecdsaMissing)('encapsulated', async () => {
      const ctx = makeContext();
      const p7m = loadEntity(readFixture(`signed/${algo}.p7m.txt`)) as ApplicationPkcs7Mime;
      const { signatures, entity } = await p7m.verify(ctx);
      for (const sig of signatures) expect(await sig.verify(true)).toBe(true);
      expect(textOf(entity)).toBe(EXPECTED_BODY);
    });
  });

  // ---- oracle -> TS (decrypt) ----
  test.each(ENC_COMBOS)('oracle-encrypted %s -> TS decrypts', async (name) => {
    const ctx = makeContext();
    const enc = loadEntity(readFixture(`encrypted/${name}.txt`)) as ApplicationPkcs7Mime;
    const dec = await enc.decrypt(ctx);
    expect(textOf(dec)).toBe(EXPECTED_BODY);
  });

  // ---- oracle -> TS (decompress) ----
  test('oracle-compressed -> TS decompresses', async () => {
    const ctx = makeContext();
    const comp = loadEntity(readFixture('compressed.txt')) as ApplicationPkcs7Mime;
    const back = await comp.decompress(ctx);
    expect(textOf(back)).toBe(EXPECTED_BODY);
  });

  // ---- TS -> oracle (verify) ----
  describe.each(SIGN_ALGOS)('TS-signed %s -> oracle verifies', (algo) => {
    const ecdsaMissing = algo === 'ecdsa-sha256' && !ec;
    test.skipIf(ecdsaMissing)('detached', async () => {
      const ctx = makeContext();
      const entity = loadEntity(readFixture('entity.txt'));
      const signed = await MultipartSigned.create(ctx, signerFor(algo), entity);
      const file = join(tmp, `ts-signed-${algo}.txt`);
      writeFileSync(file, serialize(signed));
      expect(oracleRun('smime-verify', file)).toBe('valid');
    });
    test.skipIf(ecdsaMissing)('encapsulated', async () => {
      const ctx = makeContext();
      const entity = loadEntity(readFixture('entity.txt'));
      const p7m = await ApplicationPkcs7Mime.sign(ctx, signerFor(algo), entity);
      const file = join(tmp, `ts-encapsulated-${algo}.txt`);
      writeFileSync(file, serialize(p7m));
      expect(oracleRun('smime-encapsulated-verify', file)).toBe('valid');
    });
  });

  // ---- TS -> oracle (decrypt) ----
  test.each(ENC_COMBOS)('TS-encrypted %s -> oracle decrypts', async (name, padding, algo) => {
    const ctx = makeContext();
    ctx.enable(algo);
    const entity = loadEntity(readFixture('entity.txt'));
    const recipient = new CmsRecipient(rsa.certificateChain[0]!);
    recipient.rsaEncryptionPadding = padding;
    recipient.encryptionAlgorithms = [algo];
    const recipients = new CmsRecipientCollection();
    recipients.add(recipient);
    const enc = await ApplicationPkcs7Mime.encrypt(ctx, recipients, entity);
    const file = join(tmp, `ts-enc-${name}.txt`);
    const out = join(tmp, `ts-dec-${name}.txt`);
    writeFileSync(file, serialize(enc));
    expect(oracleRun('smime-decrypt', file, out)).toBe('ok');
    expect(textOf(loadEntity(new Uint8Array(readFileSync(out))))).toBe(EXPECTED_BODY);
  });

  // ---- TS -> oracle (decompress) ----
  test('TS-compressed -> oracle decompresses', async () => {
    const ctx = makeContext();
    const entity = loadEntity(readFixture('entity.txt'));
    const comp = await ApplicationPkcs7Mime.compress(ctx, entity);
    const file = join(tmp, 'ts-compressed.txt');
    const out = join(tmp, 'ts-decompressed.txt');
    writeFileSync(file, serialize(comp));
    expect(oracleRun('smime-decompress', file, out)).toBe('ok');
    expect(textOf(loadEntity(new Uint8Array(readFileSync(out))))).toBe(EXPECTED_BODY);
  });

  // ---- round-trip (TS only) ----
  test('TS encrypt -> TS decrypt round-trip', async () => {
    const ctx = makeContext();
    const entity = loadEntity(readFixture('entity.txt'));
    const recipients = new CmsRecipientCollection();
    recipients.add(new CmsRecipient(rsa.certificateChain[0]!));
    const enc = await ApplicationPkcs7Mime.encrypt(ctx, recipients, entity);
    expect(textOf(await enc.decrypt(ctx))).toBe(EXPECTED_BODY);
  });
});
