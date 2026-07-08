import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ContentType } from '../../src/content-type.js';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface OracleParameter {
  readonly name: string;
  readonly value: string;
}

interface OracleContentType {
  readonly input: string;
  readonly ok: boolean;
  readonly mimeType?: string;
  readonly parameters?: readonly OracleParameter[];
}

function readInputs(): Uint8Array[] {
  return readFileSync(join(tsRoot, 'gates', 'header-inputs', 'ctype.list'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => new Uint8Array(Buffer.from(line, 'base64')));
}

function readInputLines(): string[] {
  return readFileSync(join(tsRoot, 'gates', 'header-inputs', 'ctype.list'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
}

function readOracle(): OracleContentType[] {
  return JSON.parse(readFileSync(join(tsRoot, 'gates', 'out', 'oracle', 'headers', 'ctype.json'), 'utf8'));
}

describe('headers/ctype differential gate', () => {
  const inputs = readInputs();
  const inputLines = readInputLines();
  const oracle = readOracle();

  test('input list and oracle have the same number of entries', () => {
    expect(oracle).toHaveLength(inputs.length);
  });

  test('oracle entries align with input list', () => {
    expect(oracle.map((entry) => entry.input)).toEqual(inputLines);
  });

  test('content-type parser matches oracle dumps', () => {
    const mismatches: string[] = [];

    for (let index = 0; index < inputs.length; index++) {
      const expected = oracle[index]!;
      const actual = ContentType.parse(inputs[index]!);

      if (actual.ok !== expected.ok) {
        mismatches.push(`#${index} ok mismatch\nexpected: ${expected.ok}\nactual:   ${actual.ok}`);
        continue;
      }

      if (actual.ok && expected.ok) {
        const parameters = [...actual.value.parameters].map((parameter) => ({
          name: parameter.name,
          value: parameter.value,
        }));

        if (actual.value.mimeType !== expected.mimeType || JSON.stringify(parameters) !== JSON.stringify(expected.parameters ?? [])) {
          mismatches.push(
            `#${index}\nexpected: ${JSON.stringify({ mimeType: expected.mimeType, parameters: expected.parameters ?? [] })}` +
            `\nactual:   ${JSON.stringify({ mimeType: actual.value.mimeType, parameters })}`,
          );
        }
      }
    }

    expect(mismatches, mismatches.join('\n\n')).toHaveLength(0);
  });
});
