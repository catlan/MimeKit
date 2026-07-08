#!/usr/bin/env node
// Harvests raw header values from the corpus into oracle input lists
// (gates/header-inputs/*.list, one base64-encoded raw value per line).
//
// Extraction is deliberately crude: it scans every corpus file (top-level
// AND nested part headers, since parts start after any blank line) for
// `Name: value` lines plus their folded continuations, keeping the raw
// bytes exactly. False positives (body text that looks like a header) are
// harmless — the oracle defines the expected output for whatever input we
// feed both sides.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testData = resolve(tsRoot, '..', 'UnitTests', 'TestData');
const outDir = join(tsRoot, 'gates', 'header-inputs');

const kinds = {
  addr: /^(from|to|cc|bcc|reply-to|sender|resent-from|resent-to|resent-cc)$/i,
  ctype: /^content-type$/i,
  cdisp: /^content-disposition$/i,
  date: /^(date|resent-date)$/i,
  rfc2047: /^(subject|comments|content-description)$/i,
};

const collected = Object.fromEntries(Object.keys(kinds).map((k) => [k, new Set()]));

function harvest(buf) {
  // Split on \n but keep raw bytes per line (minus the line terminator).
  const lines = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      let end = i;
      if (end > start && buf[end - 1] === 0x0d) end--;
      lines.push(buf.subarray(start, end));
      start = i + 1;
    }
  }
  lines.push(buf.subarray(start));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colon = line.indexOf(0x3a);
    if (colon <= 0 || colon > 40) continue;
    const name = Buffer.from(line.subarray(0, colon)).toString('latin1');
    if (!/^[!-9;-~]+$/.test(name)) continue; // RFC 5322 field-name chars only
    let value = [line.subarray(colon + 1)];
    while (i + 1 < lines.length && (lines[i + 1][0] === 0x20 || lines[i + 1][0] === 0x09)) {
      i++;
      value.push(Buffer.from('\r\n', 'latin1'), lines[i]);
    }
    const raw = Buffer.concat(value.map((v) => Buffer.from(v)));
    for (const [kind, pattern] of Object.entries(kinds)) {
      if (pattern.test(name)) collected[kind].add(raw.toString('base64'));
    }
  }
}

const roots = ['messages', 'mbox', 'partial'];
let files = 0;
for (const root of roots) {
  for (const entry of readdirSync(join(testData, root), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    harvest(new Uint8Array(readFileSync(join(entry.parentPath, entry.name))));
    files++;
  }
}

mkdirSync(outDir, { recursive: true });
for (const [kind, set] of Object.entries(collected)) {
  const sorted = [...set].sort();
  writeFileSync(join(outDir, `${kind}.list`), sorted.join('\n') + '\n');
  console.log(`${kind}: ${sorted.length} inputs`);
}
console.log(`scanned ${files} corpus files`);
