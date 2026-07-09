/**
 * Differential gate: TS reserialization bytes vs the C# oracle.
 *
 * The oracle parsed each corpus file with ExperimentalMimeParser and wrote
 * every message back out via MimeMessage.WriteTo(FormatOptions.Default) —
 * MimeKit's near-byte-preserving round-trip. The TS port must produce the
 * IDENTICAL byte stream. Divergences are the wave-5 convergence backlog:
 * each goes into gates/known-divergent.json (asserted to still diverge)
 * and the list is driven to zero.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'vitest';
import { MemoryStream } from '../../src/io/stream.js';
import { MimeParser, type MimeFormat } from '../../src/mime-parser.js';
import { FormatOptions } from '../../src/format-options.js';
import { corpusFile, expectParity } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const treeDir = resolve(__dirname, '..', '..', 'gates', 'out', 'oracle', 'tree');

function roundtrip(bytes: Uint8Array, format: MimeFormat): Uint8Array {
  const parser = new MimeParser(new MemoryStream(bytes), format);
  const output = new MemoryStream();
  while (!parser.isEndOfStream) {
    const message = parser.parseMessage();
    if (!message.ok)
      throw new Error(`parse failed: [${message.error.kind}] ${message.error.message}`);
    message.value.writeTo(FormatOptions.default, output);
  }
  return output.toArray();
}

function gateGroup(subdir: string, format: MimeFormat): void {
  const dir = join(treeDir, subdir);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.roundtrip'))
    .sort();

  describe(`roundtrip gate: ${subdir}/ (${format})`, () => {
    test.each(files)('%s', (rtFile) => {
      const expected = new Uint8Array(readFileSync(join(dir, rtFile)));
      const corpusRel = `${subdir}/${rtFile.replace(/\.roundtrip$/, '')}`;
      const source = corpusRel.startsWith('witnesses/')
        ? new Uint8Array(readFileSync(join(treeDir, '..', '..', '..', 'witnesses', corpusRel.slice('witnesses/'.length))))
        : corpusFile(corpusRel);
      const actual = roundtrip(source, format);
      expectParity('roundtrip', corpusRel, actual, expected);
    });
  });
}

gateGroup('messages', 'entity');
gateGroup('partial', 'entity');
gateGroup('witnesses', 'entity');
gateGroup('mbox', 'mbox');
