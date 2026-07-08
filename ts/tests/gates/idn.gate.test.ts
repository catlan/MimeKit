/**
 * Differential gate: TS Punycode vs the C# oracle's IdnMapping dumps.
 * Inputs: ts/gates/idn-inputs.list (base64 lines, utf-8 strings).
 * Oracle: gates/out/oracle/idn.json ({input, ascii, unicode}; null = threw).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { Punycode } from '../../src/encodings/punycode.js';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadOracle(): Array<{ input: string; ascii: string | null; unicode: string | null }> {
  try {
    return JSON.parse(readFileSync(join(tsRoot, 'gates', 'out', 'oracle', 'idn.json'), 'utf8'));
  } catch {
    throw new Error('missing oracle output idn.json — run: node gates/oracle-gen.mjs idn (from ts/)');
  }
}

describe('idn gate (Punycode vs IdnMapping)', () => {
  const oracle = loadOracle();
  const punycode = new Punycode();

  test.each(oracle.map((o) => [o.input, o] as const))('%s', (_input, o) => {
    // MimeKit's Punycode falls back to the raw input where IdnMapping threw,
    // so a null oracle field means "input unchanged" at the MimeKit layer.
    expect(punycode.encode(o.input)).toBe(o.ascii ?? o.input);
    expect(punycode.decode(o.input)).toBe(o.unicode ?? o.input);
  });
});
