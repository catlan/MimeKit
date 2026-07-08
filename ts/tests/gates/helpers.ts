/**
 * Shared helpers for differential gate tests (TS vs C# oracle).
 * See ts/gates/README.md for the design; ratchet rules in particular.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const testDataDir = resolve(tsRoot, '..', 'UnitTests', 'TestData');
const oracleOutDir = join(tsRoot, 'gates', 'out', 'oracle');

interface RatchetEntry {
  gate: string;
  case: string;
  reason: string;
  blockedOn?: string;
}

const ratchet: RatchetEntry[] = JSON.parse(
  readFileSync(join(tsRoot, 'gates', 'known-divergent.json'), 'utf8'),
);

/** Read a generated oracle output; fails loudly if generation hasn't run. */
export function oracleOut(relPath: string): Uint8Array {
  try {
    return new Uint8Array(readFileSync(join(oracleOutDir, relPath)));
  } catch {
    throw new Error(
      `missing oracle output ${relPath} — run: node gates/oracle-gen.mjs (from ts/)`,
    );
  }
}

export function corpusFile(relPath: string): Uint8Array {
  return new Uint8Array(readFileSync(join(testDataDir, relPath)));
}

function firstDifference(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

/**
 * Byte-parity assertion with ratchet semantics:
 * - equal + not listed → pass
 * - equal + listed     → FAIL ("remove the stale ratchet entry")
 * - unequal + listed   → pass (accepted divergence, still asserted to exist)
 * - unequal + not listed → FAIL with offset diagnostics
 */
export function expectParity(gate: string, caseId: string, actual: Uint8Array, expected: Uint8Array): void {
  const entry = ratchet.find((e) => e.gate === gate && e.case === caseId);
  const diffAt = firstDifference(actual, expected);
  if (diffAt === -1) {
    if (entry)
      throw new Error(
        `[${gate}/${caseId}] now matches the oracle — remove its known-divergent.json entry (reason was: ${entry.reason})`,
      );
    return;
  }
  if (entry) return; // accepted divergence, still present
  const context = (buf: Uint8Array) =>
    Buffer.from(buf.subarray(Math.max(0, diffAt - 16), diffAt + 16)).toString('hex');
  throw new Error(
    `[${gate}/${caseId}] diverges from oracle at byte ${diffAt} ` +
      `(ts ${actual.length}B vs oracle ${expected.length}B)\n` +
      `  ts:     …${context(actual)}…\n  oracle: …${context(expected)}…`,
  );
}
