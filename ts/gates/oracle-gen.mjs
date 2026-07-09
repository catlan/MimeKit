#!/usr/bin/env node
// Generates C# oracle outputs for the differential gates.
//
// Usage: node gates/oracle-gen.mjs [encoders] [messages] [mbox] [headers]
//        (no args = all modes)
//
// Outputs land in gates/out/oracle/ (gitignored); gate tests in
// tests/gates/ read them and fail loudly if generation hasn't run.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(tsRoot, '..');
const testData = join(repoRoot, 'UnitTests', 'TestData');
const outRoot = join(tsRoot, 'gates', 'out', 'oracle');
const oracleDll = join(repoRoot, 'oracle', 'bin', 'Release', 'net10.0', 'oracle.dll');
const dkimDll = join(repoRoot, 'oracle-dkim', 'bin', 'Release', 'net10.0', 'oracle-dkim.dll');

function oracle(...args) {
  execFileSync('dotnet', [oracleDll, ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
}

function dkimOracle(...args) {
  return execFileSync('dotnet', [dkimDll, ...args], { encoding: 'utf8' });
}

function ensureOracleBuilt() {
  if (!existsSync(oracleDll)) {
    console.log('building oracle (Release)...');
    execFileSync('dotnet', ['build', join(repoRoot, 'oracle'), '-c', 'Release', '-v', 'q'], { stdio: 'inherit' });
  }
}

function ensureDkimOracleBuilt() {
  if (!existsSync(dkimDll)) {
    console.log('building oracle-dkim (Release)...');
    execFileSync('dotnet', ['build', join(repoRoot, 'oracle-dkim'), '-c', 'Release', '-v', 'q'], { stdio: 'inherit' });
  }
}

function listFiles(dir, filter = () => true) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && filter(e.name))
    .map((e) => join(e.parentPath, e.name));
}

// Deterministic pseudo-random bytes for fuzz inputs (fixed seed, xorshift32).
function fuzzBytes(seed, length) {
  const out = new Uint8Array(length);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    out[i] = s & 0xff;
  }
  return out;
}

const modes = {
  encoders() {
    const dir = join(outRoot, 'encoders');
    mkdirSync(join(dir, 'fuzz'), { recursive: true });
    // Corpus round-trips: encode the raw files, decode the encoded files.
    const jobs = [
      ['base64', 'encode', join(testData, 'encoders', 'photo.jpg'), 'photo.jpg.b64'],
      ['base64', 'decode', join(testData, 'encoders', 'photo.b64'), 'photo.b64.raw'],
      ['uu', 'encode', join(testData, 'encoders', 'photo.jpg'), 'photo.jpg.uu'],
      ['uu', 'decode', join(testData, 'encoders', 'photo.uu'), 'photo.uu.raw'],
      ['qp', 'encode', join(testData, 'encoders', 'wikipedia.txt'), 'wikipedia.txt.qp'],
      ['qp', 'decode', join(testData, 'encoders', 'wikipedia.qp'), 'wikipedia.qp.raw'],
      ['yenc', 'encode', join(testData, 'encoders', 'photo.jpg'), 'photo.jpg.yenc'],
      ['hex', 'encode', join(testData, 'encoders', 'photo.jpg'), 'photo.jpg.hex'],
    ];
    for (const [codec, dirn, input, output] of jobs)
      oracle('transcode', codec, dirn, input, join(dir, output));
    // Deterministic fuzz inputs: sizes chosen to cross block/line boundaries.
    // Binary fuzz for the binary-safe codecs; UU/yEnc decoders need
    // payload-only mode (real streams carry begin/=ybegin framing). QP is a
    // text codec (not binary-round-trip-safe), so its fuzz is text-biased.
    const sizes = [0, 1, 2, 3, 4, 56, 57, 58, 76, 77, 1000, 65536];
    const decodeVariant = { base64: 'base64', qp: 'qp', uu: 'uu-payload', yenc: 'yenc-payload', hex: 'hex' };
    for (const size of sizes) {
      const raw = fuzzBytes(0xc0ffee + size, size);
      const rawPath = join(dir, 'fuzz', `raw-${size}.bin`);
      writeFileSync(rawPath, raw);
      for (const codec of ['base64', 'uu', 'yenc', 'hex']) {
        const enc = join(dir, 'fuzz', `raw-${size}.${codec}`);
        oracle('transcode', codec, 'encode', rawPath, enc);
        oracle('transcode', decodeVariant[codec], 'decode', enc, join(dir, 'fuzz', `raw-${size}.${codec}.redecoded`));
      }
      // Text-biased input for QP: printable ASCII + spaces + CRLF newlines.
      const text = Buffer.from(raw.map((b) => (b % 96) + 32));
      for (let i = 0; i + 1 < text.length; i += 97) { text[i] = 0x0d; text[i + 1] = 0x0a; }
      const textPath = join(dir, 'fuzz', `text-${size}.bin`);
      writeFileSync(textPath, text);
      const qpEnc = join(dir, 'fuzz', `text-${size}.qp`);
      oracle('transcode', 'qp', 'encode', textPath, qpEnc);
      oracle('transcode', 'qp', 'decode', qpEnc, join(dir, 'fuzz', `text-${size}.qp.redecoded`));
    }
    console.log('encoders: done');
  },

  messages() {
    const files = listFiles(join(testData, 'messages'), (n) => n.endsWith('.txt') || n.endsWith('.eml'));
    oracle('parse', '--base', testData, '--out', join(outRoot, 'tree'), ...files);
    oracle('roundtrip', '--base', testData, '--out', join(outRoot, 'tree'), ...files);
    console.log(`messages: ${files.length} files`);
  },

  partial() {
    const files = listFiles(join(testData, 'partial'), (n) => n.endsWith('.eml'));
    oracle('parse', '--base', testData, '--out', join(outRoot, 'tree'), ...files);
    oracle('roundtrip', '--base', testData, '--out', join(outRoot, 'tree'), ...files);
    console.log(`partial: ${files.length} files`);
  },

  mbox() {
    const files = listFiles(join(testData, 'mbox'), (n) => n.endsWith('.mbox.txt'));
    oracle('parse', '--base', testData, '--out', join(outRoot, 'tree'), '--mbox', ...files);
    oracle('roundtrip', '--base', testData, '--out', join(outRoot, 'tree'), '--mbox', ...files);
    console.log(`mbox: ${files.length} files`);
  },

  witnesses() {
    const dir = join(tsRoot, 'gates', 'witnesses');
    const files = listFiles(dir, (n) => n.endsWith('.eml'));
    oracle('parse', '--base', dir, '--out', join(outRoot, 'tree', 'witnesses'), ...files);
    oracle('roundtrip', '--base', dir, '--out', join(outRoot, 'tree', 'witnesses'), ...files);
    console.log(`witnesses: ${files.length} files`);
  },

  idn() {
    oracle('idn', join(tsRoot, 'gates', 'idn-inputs.list'), join(outRoot, 'idn.json'));
    console.log('idn: done');
  },

  dkim() {
    // Crypto trust anchor: DKIM signing is byte-deterministic once the t=
    // timestamp is pinned. We emit (a) the DKIM-Signature VALUE per fixture ×
    // canon × algo for byte-parity, and (b) full oracle-signed messages for
    // the oracle->TS cross-verify direction.
    ensureDkimOracleBuilt();
    const dir = join(outRoot, 'dkim');
    mkdirSync(join(dir, 'oracle-signed'), { recursive: true });
    const keyfile = join(testData, 'dkim', 'example.pem');
    const domain = 'example.com';
    const selector = '1433868189.example';
    const t = '1400000000';
    const fixtures = ['gmail.msg', 'related.msg', 'multipart-no-end-boundary.msg', 'rfc8463-example.msg'];
    const combos = [
      ['relaxed', 'relaxed', 'rsa-sha256'],
      ['simple', 'simple', 'rsa-sha256'],
      ['relaxed', 'simple', 'rsa-sha1'],
      ['simple', 'relaxed', 'rsa-sha256'],
    ];
    const sign = {};
    for (const fixture of fixtures) {
      const msgPath = join(testData, 'dkim', fixture);
      for (const [hc, bc, algo] of combos) {
        const key = `${fixture}|${hc}|${bc}|${algo}`;
        sign[key] = dkimOracle('dkim-sign', msgPath, hc, bc, algo, domain, selector, keyfile, t).trim();
        const outName = `${fixture}.${hc}.${bc}.${algo}.eml`;
        dkimOracle('dkim-sign-full', msgPath, hc, bc, algo, domain, selector, keyfile, t, join(dir, 'oracle-signed', outName));
      }
    }
    writeFileSync(join(dir, 'sign.json'), JSON.stringify({ domain, selector, t: Number(t), sign }, null, 2) + '\n');
    console.log(`dkim: ${Object.keys(sign).length} signatures + ${Object.keys(sign).length} full messages`);
  },

  headers() {
    // Header-primitive dumps over inputs extracted from the corpus by
    // gates/extract-headers.mjs (wave 2 will add it). Until then this mode
    // only processes hand-seeded lists if present.
    const listsDir = join(tsRoot, 'gates', 'header-inputs');
    if (!existsSync(listsDir)) {
      console.log('headers: no gates/header-inputs/ yet, skipping');
      return;
    }
    const dir = join(outRoot, 'headers');
    mkdirSync(dir, { recursive: true });
    for (const file of readdirSync(listsDir)) {
      const kind = file.replace(/\..*$/, ''); // addr.list → addr
      oracle('hdr', kind, join(listsDir, file), join(dir, `${kind}.json`));
    }
    console.log('headers: done');
  },
};

ensureOracleBuilt();
mkdirSync(outRoot, { recursive: true });
const requested = process.argv.slice(2);
const run = requested.length ? requested : Object.keys(modes);
for (const mode of run) {
  if (!modes[mode]) {
    console.error(`unknown mode: ${mode} (have: ${Object.keys(modes).join(', ')})`);
    process.exit(1);
  }
  modes[mode]();
}
