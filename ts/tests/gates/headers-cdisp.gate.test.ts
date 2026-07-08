import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ContentDisposition } from '../../src/content-disposition.js';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface OracleParameter {
  readonly name: string;
  readonly value: string;
}

interface OracleContentDisposition {
  readonly input: string;
  readonly ok: boolean;
  readonly disposition?: string;
  readonly parameters?: readonly OracleParameter[];
}

function readInputLines(): string[] {
  return readFileSync(join(tsRoot, 'gates', 'header-inputs', 'cdisp.list'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
}

function readInputs(): Uint8Array[] {
  return readInputLines().map((line) => new Uint8Array(Buffer.from(line, 'base64')));
}

function readOracle(): OracleContentDisposition[] {
  return JSON.parse(readFileSync(join(tsRoot, 'gates', 'out', 'oracle', 'headers', 'cdisp.json'), 'utf8'));
}

describe('headers/cdisp differential gate', () => {
  const inputLines = readInputLines();
  const inputs = readInputs();
  const oracle = readOracle();

  test('input list and oracle have the same number of entries', () => {
    expect(oracle).toHaveLength(inputs.length);
  });

  test('oracle entries align with input list', () => {
    expect(oracle.map((entry) => entry.input)).toEqual(inputLines);
  });

  test('content-disposition parser matches oracle dumps', () => {
    const mismatches: string[] = [];

    for (let index = 0; index < inputs.length; index++) {
      const expected = oracle[index]!;
      const actual = ContentDisposition.parse(inputs[index]!);

      if (actual.ok !== expected.ok) {
        mismatches.push(`#${index} ok mismatch\nexpected: ${expected.ok}\nactual:   ${actual.ok}`);
        continue;
      }

      if (actual.ok && expected.ok) {
        const parameters = [...actual.value.parameters].map((parameter) => ({
          name: parameter.name,
          value: parameter.value,
        }));

        if (actual.value.disposition !== expected.disposition || JSON.stringify(parameters) !== JSON.stringify(expected.parameters ?? [])) {
          mismatches.push(
            `#${index}\nexpected: ${JSON.stringify({ disposition: expected.disposition, parameters: expected.parameters ?? [] })}` +
            `\nactual:   ${JSON.stringify({ disposition: actual.value.disposition, parameters })}`,
          );
        }
      }
    }

    expect(mismatches, mismatches.join('\n\n')).toHaveLength(0);
  });
});
