import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { parseDate } from '../../src/utils/date-utils.js';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface OracleDateResult {
  readonly input: string;
  readonly ok: boolean;
  readonly unixSeconds?: number;
  readonly offsetMinutes?: number;
}

interface ActualDateResult {
  readonly ok: boolean;
  readonly unixSeconds?: number;
  readonly offsetMinutes?: number;
}

function readInputs(): Uint8Array[] {
  return readFileSync(join(tsRoot, 'gates', 'header-inputs', 'date.list'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => new Uint8Array(Buffer.from(line, 'base64')));
}

function readOracle(): OracleDateResult[] {
  return JSON.parse(readFileSync(join(tsRoot, 'gates', 'out', 'oracle', 'headers', 'date.json'), 'utf8'));
}

function actualFor(input: Uint8Array): ActualDateResult {
  const parsed = parseDate(input);
  if (!parsed.ok) return { ok: false };

  return {
    ok: true,
    unixSeconds: Math.floor(parsed.value.epochMillis / 1000),
    offsetMinutes: parsed.value.offsetMinutes,
  };
}

describe('headers/date differential gate', () => {
  const inputs = readInputs();
  const oracle = readOracle();

  test('input list and oracle have the same number of entries', () => {
    expect(oracle).toHaveLength(inputs.length);
  });

  test.each(inputs.map((input, index) => [index, input] as const))('date header %i matches oracle', (index, input) => {
    const expected = oracle[index]!;
    expect(actualFor(input)).toEqual({
      ok: expected.ok,
      ...(expected.ok ? { unixSeconds: expected.unixSeconds, offsetMinutes: expected.offsetMinutes } : {}),
    });
  });
});
