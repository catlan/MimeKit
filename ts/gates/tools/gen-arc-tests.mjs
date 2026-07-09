#!/usr/bin/env node
// Port tool: transcribes the regular (Validate/Sign-driven) ARC test cases
// from the C# NUnit sources into self-contained TypeScript vitest files.
//
// The OUTPUT is fully self-contained (every message/key/expected value inlined
// as a JS string literal) — it never reads the C# at runtime. The handful of
// structurally-different tests (argument exceptions, GetArcHeaderSets internals,
// result-object constructors, signer ctors/defaults) are hand-ported in
// arc-verifier-extra.test.ts / arc-signer-extra.test.ts and are BLOCKLISTED here.
//
// Analogous to gates/tools/gen-html-entities.mjs. Run: node gates/tools/gen-arc-tests.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const csDir = resolve(tsRoot, '..', 'UnitTests', 'Cryptography');
const outDir = join(tsRoot, 'tests', 'dkim');

// --- tiny C# lexer helpers ------------------------------------------------

function skipWs(src, i) {
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
}

// Parse a C# string literal ("..." or verbatim @"...") starting at src[i].
function parseString(src, i) {
  if (src[i] === '@') {
    i++; // @
    if (src[i] !== '"') throw new Error('bad verbatim string');
    i++;
    let value = '';
    while (i < src.length) {
      if (src[i] === '"') {
        if (src[i + 1] === '"') { value += '"'; i += 2; continue; }
        i++;
        return { value, next: i };
      }
      value += src[i++];
    }
    throw new Error('unterminated verbatim string');
  }
  if (src[i] !== '"') throw new Error(`expected string at ${i}: ${src.slice(i, i + 20)}`);
  i++;
  let value = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1];
      const map = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\', '0': '\0' };
      value += map[n] ?? n;
      i += 2;
      continue;
    }
    if (c === '"') { i++; return { value, next: i }; }
    value += src[i++];
  }
  throw new Error('unterminated string');
}

// Split the argument list of a call whose '(' is at src[open]; returns raw arg
// substrings (trimmed) split on top-level commas.
function parseArgList(src, open) {
  let i = open + 1;
  const args = [];
  let depth = 0;
  let start = i;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === '@') {
      // skip a string literal
      const s = src[i] === '@' ? parseString(src, i) : parseString(src, i);
      i = s.next;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (c === ')' && depth === 0) { args.push(src.slice(start, i).trim()); return { args, next: i + 1 }; }
      depth--; i++; continue;
    }
    if (c === ',' && depth === 0) { args.push(src.slice(start, i).trim()); i++; start = i; continue; }
    i++;
  }
  throw new Error('unterminated arg list');
}

// Extract method bodies from a C# test file.
function extractMethods(src) {
  const methods = [];
  const re = /public (?:void|async Task) (\w+) \(\)/g;
  let m;
  while ((m = re.exec(src))) {
    let i = skipWs(src, m.index + m[0].length);
    if (src[i] !== '{') continue;
    let depth = 0;
    const bodyStart = i;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === '@') { i = parseString(src, i).next; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
    const pre = src.slice(Math.max(0, m.index - 200), m.index);
    const ig = pre.match(/\[Ignore \("((?:[^"\\]|\\.)*)"\)\][^}]*$/);
    methods.push({ name: m[1], body: src.slice(bodyStart, i), ignore: ig ? ig[1] : null });
  }
  return methods;
}

// Collect `const string VAR = <string>;` and `var VAR = new string[] { ... };`.
function collectDecls(body) {
  const strings = {};
  const arrays = {};

  let re = /const string (\w+) = /g;
  let m;
  while ((m = re.exec(body))) {
    const s = parseString(body, skipWs(body, m.index + m[0].length));
    strings[m[1]] = s.value;
  }

  re = /var (\w+) = new string\[\] \{/g;
  while ((m = re.exec(body))) {
    const open = body.indexOf('{', m.index);
    const { args } = parseArgList(body, open); // reuse: treats { } as bracket
    // parseArgList started at '(' semantics; emulate by slicing between { }
    const close = matchBrace(body, open);
    const inner = body.slice(open + 1, close);
    arrays[m[1]] = splitTopLevel(inner).map((a) => parseString(a.trim(), 0).value);
    void args;
  }

  return { strings, arrays };
}

function matchBrace(src, open) {
  let depth = 0, i = open;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === '@') { i = parseString(src, i).next; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
    i++;
  }
  throw new Error('unmatched brace');
}

function splitTopLevel(s) {
  const out = [];
  let depth = 0, start = 0, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === '@') { i = parseString(s, i).next; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
    i++;
  }
  const last = s.slice(start).trim();
  if (last.length) out.push(last);
  return out;
}

function collectAdds(body) {
  const adds = [];
  const re = /\w+\.Add \(/g;
  let m;
  while ((m = re.exec(body))) {
    const open = body.indexOf('(', m.index);
    const { args } = parseArgList(body, open);
    adds.push(args.map((a) => a.trim()));
  }
  return adds;
}

// Resolve an argument that is either a string literal or a known const var.
function resolveString(arg, strings) {
  const t = arg.trim();
  if (t[0] === '"' || t.startsWith('@"')) return parseString(t, 0).value;
  if (t in strings) return strings[t];
  throw new Error(`cannot resolve string arg: ${t}`);
}

function js(value) {
  return JSON.stringify(value);
}

// --- ArcVerifierTests -> arc-verifier.test.ts -----------------------------

const VERIFIER_BLOCKLIST = new Set([
  'TestArgumentExceptions',
  'TestArcHeaderValidationResult',
  'TestArcValidationResult',
  'TestGetArcHeaderSetsBrokenAAR',
  'TestGetArcHeaderSetsBrokenAMS',
  'TestGetArcHeaderSetsBrokenAS',
  'TestGetArcHeaderSetsMissingSet',
]);

function genVerifier() {
  const src = readFileSync(join(csDir, 'ArcVerifierTests.cs'), 'utf8');
  const methods = extractMethods(src).filter((x) => !VERIFIER_BLOCKLIST.has(x.name));

  const out = [];
  out.push(`// GENERATED by gates/tools/gen-arc-tests.mjs from UnitTests/Cryptography/ArcVerifierTests.cs.`);
  out.push(`// Do not edit by hand. Structurally-special cases are in arc-verifier-extra.test.ts.`);
  out.push(``);
  out.push(`import { describe, expect, test } from 'vitest';`);
  out.push(`import '../../src/index.js';`);
  out.push(`import { MimeMessage } from '../../src/mime-message.js';`);
  out.push(`import { ArcVerifier, ArcSignatureValidationResult, ArcValidationErrors } from '../../src/dkim/arc-verifier.js';`);
  out.push(`import { DkimPublicKeyLocator } from './dkim-public-key-locator.js';`);
  out.push(``);
  out.push(`async function validate(description: string, input: string, locator: DkimPublicKeyLocator, expected: ArcSignatureValidationResult, expectedErrors: ArcValidationErrors = ArcValidationErrors.None): Promise<void> {`);
  out.push(`  if (input.length === 0) {`);
  out.push(`    expect(expected, description).toBe(ArcSignatureValidationResult.None);`);
  out.push(`    return;`);
  out.push(`  }`);
  out.push(`  const r = MimeMessage.load(new TextEncoder().encode(input));`);
  out.push(`  if (!r.ok) throw new Error(r.error.message);`);
  out.push(`  const message = r.value;`);
  out.push(`  const verifier = new ArcVerifier(locator);`);
  out.push(`  let result = await verifier.verify(message);`);
  out.push(`  expect(result.chain, description).toBe(expected);`);
  out.push(`  expect(result.chainErrors, 'chain errors').toBe(expectedErrors);`);
  out.push(`  result = await verifier.verify(message);`);
  out.push(`  expect(result.chain, description).toBe(expected);`);
  out.push(`  expect(result.chainErrors, 'async chain errors').toBe(expectedErrors);`);
  out.push(`}`);
  out.push(``);
  out.push(`describe('ArcVerifierTests', () => {`);

  let count = 0;
  for (const { name, body, ignore } of methods) {
    const { strings } = collectDecls(body);
    const adds = collectAdds(body);
    const callOpen = body.lastIndexOf('Validate (');
    if (callOpen < 0) throw new Error(`no Validate in ${name}`);
    const { args } = parseArgList(body, body.indexOf('(', callOpen));
    // args: description, input, locator, expected[, errors]
    const desc = resolveString(args[0], strings);
    const input = resolveString(args[1], strings);
    const expected = mapEnum(args[3]);
    const errors = args[4] ? mapErrors(args[4]) : null;

    // C#'s [Ignore]: attributed skip. The port matches MimeKit's actual
    // behavior (verified via the crypto oracle), which the ignored assertion
    // deliberately contradicts, so it is skipped exactly as upstream skips it.
    if (ignore) out.push(`  // [Ignore] ${ignore}`);
    const testFn = ignore ? 'test.skip' : 'test';
    out.push(`  ${testFn}(${js(name)}, async () => {`);
    out.push(`    const input = ${js(input)};`);
    out.push(`    const locator = new DkimPublicKeyLocator();`);
    for (const [q, v] of adds) {
      out.push(`    locator.add(${js(resolveString(q, strings))}, ${js(resolveString(v, strings))});`);
    }
    if (errors) out.push(`    await validate(${js(desc)}, input, locator, ${expected}, ${errors});`);
    else out.push(`    await validate(${js(desc)}, input, locator, ${expected});`);
    out.push(`  });`);
    count++;
  }

  out.push(`});`);
  out.push(``);
  writeFileSync(join(outDir, 'arc-verifier.test.ts'), out.join('\n'));
  return count;
}

function mapEnum(expr) {
  return expr.trim(); // ArcSignatureValidationResult.X is identical in TS
}

function mapErrors(expr) {
  // e.g. "ArcValidationErrors.A | ArcValidationErrors.B" -> identical in TS
  return expr.trim().replace(/\s+/g, ' ');
}

// --- ArcSignerTests -> arc-signer.test.ts ---------------------------------

const SIGNER_BLOCKLIST = new Set(['TestArcSignerCtors', 'TestArcSignerDefaults', 'TestArgumentExceptions']);

function genSigner() {
  const src = readFileSync(join(csDir, 'ArcSignerTests.cs'), 'utf8');
  const methods = extractMethods(src).filter((x) => !SIGNER_BLOCKLIST.has(x.name));

  const out = [];
  out.push(`// GENERATED by gates/tools/gen-arc-tests.mjs from UnitTests/Cryptography/ArcSignerTests.cs.`);
  out.push(`// Do not edit by hand. Structurally-special cases are in arc-signer-extra.test.ts.`);
  out.push(``);
  out.push(`import { describe, expect, test } from 'vitest';`);
  out.push(`import '../../src/index.js';`);
  out.push(`import { MimeMessage } from '../../src/mime-message.js';`);
  out.push(`import { HeaderId, toHeaderId } from '../../src/header-id.js';`);
  out.push(`import { DkimSignatureAlgorithm } from '../../src/dkim/dkim-signature-algorithm.js';`);
  out.push(`import { DkimCanonicalizationAlgorithm } from '../../src/dkim/dkim-canonicalization-algorithm.js';`);
  out.push(`import { ArcVerifier, ArcSignatureValidationResult } from '../../src/dkim/arc-verifier.js';`);
  out.push(`import { DkimVerifierBase } from '../../src/dkim/dkim-verifier-base.js';`);
  out.push(`import { base64Decode, type AsymmetricKey } from '../../src/dkim/crypto.js';`);
  out.push(`import { DkimPublicKeyLocator } from './dkim-public-key-locator.js';`);
  out.push(`import { DummyArcSigner } from './dummy-arc-signer.js';`);
  out.push(``);
  out.push(SIGN_HELPERS);
  out.push(``);
  out.push(`describe('ArcSignerTests', () => {`);

  let count = 0;
  for (const { name, body } of methods) {
    const { strings, arrays } = collectDecls(body);
    const adds = collectAdds(body);
    const callOpen = body.lastIndexOf('Sign (');
    if (callOpen < 0) throw new Error(`no Sign in ${name}`);
    const { args } = parseArgList(body, body.indexOf('(', callOpen));
    // Sign(desc, input, locator, srvid, domain, selector, privateKey, t, hdrs, aar, ams, seal, [algo], [hdrAlg], [bodyAlg])
    const desc = resolveString(args[0], strings);
    const input = resolveString(args[1], strings);
    const srvid = resolveString(args[3], strings);
    const domain = resolveString(args[4], strings);
    const selector = resolveString(args[5], strings);
    const privateKey = resolveString(args[6], strings);
    const t = args[7].trim();
    const hdrs = arrays[args[8].trim()] ?? [];
    const aar = resolveString(args[9], strings);
    const ams = resolveString(args[10], strings);
    const seal = resolveString(args[11], strings);
    const algo = args[12] ? args[12].trim() : 'DkimSignatureAlgorithm.RsaSha256';
    const hdrAlg = args[13] ? args[13].trim() : 'DkimCanonicalizationAlgorithm.Relaxed';
    const bodyAlg = args[14] ? args[14].trim() : 'DkimCanonicalizationAlgorithm.Relaxed';

    out.push(`  test(${js(name)}, async () => {`);
    out.push(`    const locator = new DkimPublicKeyLocator();`);
    for (const [q, v] of adds) {
      out.push(`    locator.add(${js(resolveString(q, strings))}, ${js(resolveString(v, strings))});`);
    }
    out.push(`    await sign(${js(desc)}, ${js(input)}, locator, ${js(srvid)}, ${js(domain)}, ${js(selector)}, ${js(privateKey)}, ${t}, ${js(hdrs)}, ${js(aar)}, ${js(ams)}, ${js(seal)}, ${algo}, ${hdrAlg}, ${bodyAlg});`);
    out.push(`  });`);
    count++;
  }

  out.push(`});`);
  out.push(``);
  writeFileSync(join(outDir, 'arc-signer.test.ts'), out.join('\n'));
  return count;
}

const SIGN_HELPERS = `function assertHeadersEqual(id: HeaderId, expected: string, actual: string): void {
  const exp = DkimVerifierBase.parseParameterTags(id, expected);
  const act = DkimVerifierBase.parseParameterTags(id, actual);
  expect(act.size).toBe(exp.size);
  for (const [key, value] of exp) {
    if (key === 'b') continue; // b= depends on tag order; validated via ArcVerifier
    expect(act.has(key)).toBe(true);
    expect(act.get(key)).toBe(value);
  }
}

async function assertSignResults(message: MimeMessage, locator: DkimPublicKeyLocator, algorithm: DkimSignatureAlgorithm, aar: string, ams: string, seal: string): Promise<void> {
  if (seal.length === 0) {
    const index = message.headers.indexOf(HeaderId.ArcSeal);
    expect(index).not.toBe(0);
    return;
  }
  let index = message.headers.indexOf(HeaderId.ArcAuthenticationResults);
  expect(index).toBe(2);
  expect(message.headers.at(index).value).toBe(aar);

  index = message.headers.indexOf(HeaderId.ArcMessageSignature);
  expect(index).toBe(1);
  assertHeadersEqual(HeaderId.ArcMessageSignature, ams, message.headers.at(index).value);

  index = message.headers.indexOf(HeaderId.ArcSeal);
  expect(index).toBe(0);
  const sealHeader = message.headers.at(index);
  assertHeadersEqual(HeaderId.ArcSeal, seal, sealHeader.value);

  let expected = ArcSignatureValidationResult.Pass;
  if (sealHeader.value.includes('cv=fail;')) expected = ArcSignatureValidationResult.Fail;
  const verifier = new ArcVerifier(locator);
  let result;
  if (!verifier.isEnabled(algorithm)) {
    result = await verifier.verify(message);
    expect(result.chain).toBe(ArcSignatureValidationResult.Fail);
    verifier.enable(algorithm);
  }
  result = await verifier.verify(message);
  expect(result.chain).toBe(expected);
}

function makeKey(privateKey: string, algorithm: DkimSignatureAlgorithm): string | AsymmetricKey {
  if (algorithm === DkimSignatureAlgorithm.Ed25519Sha256) {
    return { kind: 'ed25519', isPrivate: true, raw: base64Decode(privateKey) };
  }
  return privateKey;
}

function makeSigner(privateKey: string, domain: string, selector: string, algorithm: DkimSignatureAlgorithm, srvid: string, t: number, locator: DkimPublicKeyLocator, headerAlgorithm: DkimCanonicalizationAlgorithm, bodyAlgorithm: DkimCanonicalizationAlgorithm): DummyArcSigner {
  const signer = new DummyArcSigner(makeKey(privateKey, algorithm), domain, selector, algorithm);
  signer.headerCanonicalizationAlgorithm = headerAlgorithm;
  signer.bodyCanonicalizationAlgorithm = bodyAlgorithm;
  signer.publicKeyLocator = locator;
  signer.timestamp = t;
  signer.srvId = srvid;
  return signer;
}

async function sign(_description: string, input: string, locator: DkimPublicKeyLocator, srvid: string, domain: string, selector: string, privateKey: string, t: number, hdrs: string[], aar: string, ams: string, seal: string, algorithm: DkimSignatureAlgorithm, headerAlgorithm: DkimCanonicalizationAlgorithm, bodyAlgorithm: DkimCanonicalizationAlgorithm): Promise<void> {
  const bytes = new TextEncoder().encode(input);
  const ids = hdrs.map((h) => toHeaderId(h));

  for (const useIds of [false, true, false, true]) {
    const r = MimeMessage.load(bytes);
    if (!r.ok) throw new Error(r.error.message);
    const message = r.value;
    const signer = makeSigner(privateKey, domain, selector, algorithm, srvid, t, locator, headerAlgorithm, bodyAlgorithm);
    await signer.sign(message, useIds ? ids : hdrs);
    await assertSignResults(message, locator, algorithm, aar, ams, seal);
  }
}`;

const nv = genVerifier();
const ns = genSigner();
console.log(`generated arc-verifier.test.ts (${nv} tests), arc-signer.test.ts (${ns} tests)`);
