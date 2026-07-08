import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { GroupAddress, InternetAddress, InternetAddressList, MailboxAddress } from '../../src/index.js';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface OracleMailbox {
  readonly type: 'mailbox';
  readonly name: string;
  readonly address: string;
  readonly route: string[];
}

interface OracleGroup {
  readonly type: 'group';
  readonly name: string;
  readonly members: OracleAddress[];
}

type OracleAddress = OracleMailbox | OracleGroup;

interface OracleAddrResult {
  readonly input: string;
  readonly ok: boolean;
  readonly addresses?: OracleAddress[];
  readonly canonical?: string;
}

interface ActualAddrResult {
  readonly ok: boolean;
  readonly addresses?: OracleAddress[];
  readonly canonical?: string;
}

function readInputs(): Uint8Array[] {
  return readFileSync(join(tsRoot, 'gates', 'header-inputs', 'addr.list'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => new Uint8Array(Buffer.from(line, 'base64')));
}

function readOracle(): OracleAddrResult[] {
  return JSON.parse(readFileSync(join(tsRoot, 'gates', 'out', 'oracle', 'headers', 'addr.json'), 'utf8'));
}

function addressTree(address: InternetAddress): OracleAddress {
  if (address instanceof MailboxAddress) {
    return {
      type: 'mailbox',
      name: address.name ?? '',
      address: address.address,
      route: Array.from(address.route),
    };
  }

  const group = address as GroupAddress;
  return {
    type: 'group',
    name: group.name ?? '',
    members: Array.from(group.members, addressTree),
  };
}

function actualFor(input: Uint8Array): ActualAddrResult {
  const parsed = InternetAddressList.parse(input);
  if (!parsed.ok) return { ok: false };

  return {
    ok: true,
    addresses: Array.from(parsed.value, addressTree),
    canonical: parsed.value.toString(),
  };
}

describe('headers/address differential gate', () => {
  const inputs = readInputs();
  const oracle = readOracle();

  test('input list and oracle have the same number of entries', () => {
    expect(oracle).toHaveLength(inputs.length);
  });

  test.each(inputs.map((input, index) => [index, input] as const))('address header %i matches oracle', (index, input) => {
    const expected = oracle[index]!;
    expect(actualFor(input)).toEqual({
      ok: expected.ok,
      ...(expected.ok ? { addresses: expected.addresses, canonical: expected.canonical } : {}),
    });
  });
});
