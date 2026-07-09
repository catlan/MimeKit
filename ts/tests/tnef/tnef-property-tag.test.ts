import { describe, expect, test } from 'vitest';
import { TnefPropertyTag, TnefPropertyType } from '../../src/index.js';

describe('TnefPropertyTag', () => {
  test('built-ins round-trip through integer tag', () => {
    const tags = Object.entries(TnefPropertyTag).filter(([, value]) => value instanceof TnefPropertyTag);
    expect(tags.length).toBeGreaterThan(600);

    for (const [name, tag] of tags as Array<[string, TnefPropertyTag]>) {
      if (name === 'Puid') continue;
      expect(tag.isTnefTypeValid, name).toBe(true);
      const copy = new TnefPropertyTag(tag.toInt32());
      expect(copy.equals(tag), name).toBe(true);
      expect(copy.hashCode()).toBe(tag.hashCode());
      expect(copy.id).toBe(tag.id);
      expect(copy.tnefType).toBe(tag.tnefType);
      expect(copy.valueTnefType).toBe(tag.valueTnefType);
      expect(copy.isMultiValued).toBe(tag.isMultiValued);
      expect(copy.isNamed).toBe(tag.isNamed);
    }
  });

  test('toString and toUnicode', () => {
    expect((TnefPropertyTag as unknown as { NicknameA: TnefPropertyTag }).NicknameA.toString()).toBe('Nickname (String8)');
    expect((TnefPropertyTag as unknown as { NicknameW: TnefPropertyTag }).NicknameW.toString()).toBe('Nickname (Unicode)');
    expect((TnefPropertyTag as unknown as { NicknameA: TnefPropertyTag }).NicknameA.toUnicode().equals((TnefPropertyTag as unknown as { NicknameW: TnefPropertyTag }).NicknameW)).toBe(true);
  });

  test('multi-valued flag', () => {
    const tag = new TnefPropertyTag(0x3001, TnefPropertyType.String8 | TnefPropertyType.MultiValued);
    expect(tag.isMultiValued).toBe(true);
    expect(tag.valueTnefType).toBe(TnefPropertyType.String8);
  });
});
