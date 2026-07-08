import { describe, expect, test } from 'vitest';
import { DomainList } from '../src/domain-list.js';

describe('DomainList', () => {
  test('argument exceptions', () => {
    const list = new DomainList();
    expect(() => new DomainList(null as unknown as Iterable<string>)).toThrow(TypeError);
    expect(() => list.add(null as unknown as string)).toThrow(TypeError);
    expect(() => list.contains(null as unknown as string)).toThrow(TypeError);
    expect(() => list.copyTo(null as unknown as string[], 0)).toThrow(TypeError);
    expect(() => list.copyTo([], -1)).toThrow(RangeError);
    expect(() => list.indexOf(null as unknown as string)).toThrow(TypeError);
    expect(() => list.insert(-1, 'item')).toThrow(RangeError);
    expect(() => list.insert(0, null as unknown as string)).toThrow(TypeError);
    expect(() => list.set(0, null as unknown as string)).toThrow(TypeError);
    expect(() => list.remove(null as unknown as string)).toThrow(TypeError);
    expect(() => list.removeAt(-1)).toThrow(RangeError);
  });

  test('basic list functionality', () => {
    const list = new DomainList();
    list.add('domain2');
    list.insert(0, 'domain0');
    list.insert(1, 'domain1');
    expect(Array.from(list)).toEqual(['domain0', 'domain1', 'domain2']);
    expect(list.contains('domain1')).toBe(true);
    expect(list.indexOf('domain1')).toBe(1);
    const array = new Array<string>(list.count);
    list.copyTo(array, 0);
    list.clear();
    for (const domain of array) list.add(domain);
    expect(list.remove('not-in-the-list')).toBe(false);
    expect(list.remove('domain2')).toBe(true);
    list.removeAt(0);
    list.set(0, 'domain');
    expect(Array.from(list)).toEqual(['domain']);
  });

  test.each([
    '',
    ' \t\r\n',
    ' (this is an unterminated comment...',
    '@',
    '@ (this is an unterminated comment...',
    '@[invalid.domain',
  ])('parse failure: %j', (text) => {
    expect(DomainList.parse(text).ok).toBe(false);
  });

  test('parse empty domains', () => {
    const parsed = DomainList.parse('@domain1,,@domain2');
    expect(parsed.ok && Array.from(parsed.value)).toEqual(['domain1', 'domain2']);
  });

  test('toString skips whitespace domains', () => {
    const route = new DomainList(['route1', '  \t\t ', 'route2']);
    expect(route.toString()).toBe('@route1,@route2');
  });
});
