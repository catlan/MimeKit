import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ParserOptions } from '../../src/parser-options.js';
import { decodeText } from '../../src/utils/rfc2047.js';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface OracleRfc2047Result {
  readonly decoded: string;
}

function readInputs(): Uint8Array[] {
  return readFileSync(join(tsRoot, 'gates', 'header-inputs', 'rfc2047.list'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => new Uint8Array(Buffer.from(line, 'base64')));
}

function readOracle(): OracleRfc2047Result[] {
  return JSON.parse(readFileSync(join(tsRoot, 'gates', 'out', 'oracle', 'headers', 'rfc2047.json'), 'utf8'));
}

describe('headers/rfc2047 differential gate', () => {
  const inputs = readInputs();
  const oracle = readOracle();

  test('input list and oracle have the same number of entries', () => {
    expect(oracle).toHaveLength(inputs.length);
  });

  test('rfc2047 headers match oracle decoded text', () => {
    const mismatches: string[] = [];

    for (let index = 0; index < inputs.length; index++) {
      const expected = oracle[index]!.decoded;
      const actual = decodeText(ParserOptions.default, inputs[index]!);

      if (actual !== expected) {
        mismatches.push(
          `#${index}\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`,
        );
      }
    }

    expect(mismatches, mismatches.join('\n\n')).toHaveLength(0);
  });
});
