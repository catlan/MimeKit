import { describe, expect, test } from 'vitest';
import { TnefNameId, TnefNameIdKind } from '../../src/index.js';

describe('TnefNameId', () => {
  test('constructors and equality', () => {
    const guid = '00112233-4455-6677-8899-aabbccddeeff';
    const id1 = new TnefNameId(guid, 17);
    const id2 = new TnefNameId(guid, 17);
    const name = new TnefNameId(guid, 'name');
    const name2 = new TnefNameId(guid, 'name');

    expect(id1.kind).toBe(TnefNameIdKind.Id);
    expect(id1.propertySetGuid).toBe(guid);
    expect(id1.id).toBe(17);
    expect(name.kind).toBe(TnefNameIdKind.Name);
    expect(name.name).toBe('name');
    expect(id1.equals(id2)).toBe(true);
    expect(id1.hashCode()).toBe(id2.hashCode());
    expect(id1.equals(name)).toBe(false);
    expect(name.equals(name2)).toBe(true);
    expect(name.hashCode()).toBe(name2.hashCode());
  });
});
