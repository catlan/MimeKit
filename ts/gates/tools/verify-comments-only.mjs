// Proves a doc-backfill changed ONLY comments: esbuild-minifies each changed
// src .ts against the baseline; identical minified JS ⟺ code unchanged.
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = resolve(tsRoot, '..');
const baseRef = process.argv[2] || 'ts-port';
const [eb] = readdirSync(join(tsRoot, 'node_modules/.pnpm')).filter((n) => n.startsWith('esbuild@'));
const esbuild = join(tsRoot, 'node_modules/.pnpm', eb, 'node_modules/esbuild/bin/esbuild');
const tmp = mkdtempSync(join(tmpdir(), 'coff-'));

function walk(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(e.parentPath, e.name));
}
function min(code) {
  const f = join(tmp, 'x.ts');
  writeFileSync(f, code);
  return execSync(`"${esbuild}" "${f}" --minify`, { encoding: 'utf8' });
}

let changed = 0; const codeChanged = [];
for (const abs of walk(join(tsRoot, 'src'))) {
  const rel = relative(tsRoot, abs);
  const now = readFileSync(abs, 'utf8');
  let base;
  try { base = execSync(`git show ${baseRef}:ts/${rel}`, { cwd: repoRoot, encoding: 'utf8' }); } catch { continue; }
  if (now === base) continue;
  changed++;
  if (min(now) !== min(base)) codeChanged.push(rel);
}
console.log(`changed files: ${changed}; code-altering: ${codeChanged.length}`);
if (codeChanged.length) { console.error('CODE CHANGED (not comment-only):\n  ' + codeChanged.join('\n  ')); process.exit(1); }
console.log('OK — every change is comment-only');
