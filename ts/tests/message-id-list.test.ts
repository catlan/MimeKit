import { describe, expect, test } from 'vitest';
import { MessageIdList } from '../src/index.js';

describe('MessageIdList', () => {
  test('TestArgumentExceptions', () => {
    const list = new MessageIdList();

    expect(() => list.add(null as never)).toThrow(TypeError);
    expect(() => list.addRange(null as never)).toThrow(TypeError);
    expect(() => list.contains(null as never)).toThrow(TypeError);
    expect(() => list.copyTo(null as never, 0)).toThrow(TypeError);
    expect(() => list.copyTo([], -1)).toThrow(RangeError);
    expect(() => list.indexOf(null as never)).toThrow(TypeError);
    expect(() => list.insert(-1, 'item')).toThrow(RangeError);
    expect(() => list.insert(0, null as never)).toThrow(TypeError);
    expect(() => list.set(0, null as never)).toThrow(TypeError);
    expect(() => list.remove(null as never)).toThrow(TypeError);
    expect(() => list.removeAt(-1)).toThrow(RangeError);
  });

  test('TestBasicListFunctionality', () => {
    const list = new MessageIdList();

    expect(list.isReadOnly).toBe(false);
    expect(list.count).toBe(0);

    list.add('id2@localhost');

    expect(list.count).toBe(1);
    expect(list.at(0)).toBe('id2@localhost');

    list.insert(0, 'id0@localhost');
    list.insert(1, 'id1@localhost');

    expect(list.count).toBe(3);
    expect(list.at(0)).toBe('id0@localhost');
    expect(list.at(1)).toBe('id1@localhost');
    expect(list.at(2)).toBe('id2@localhost');

    const clone = list.clone();

    expect(clone.count).toBe(3);
    expect(clone.at(0)).toBe('id0@localhost');
    expect(clone.at(1)).toBe('id1@localhost');
    expect(clone.at(2)).toBe('id2@localhost');

    expect(list.contains('id1@localhost')).toBe(true);
    expect(list.indexOf('id1@localhost')).toBe(1);

    const array = new Array<string>(list.count);
    list.copyTo(array, 0);
    list.clear();

    expect(list.count).toBe(0);

    list.addRange(array);

    expect(list.count).toBe(array.length);

    expect(list.remove('id2@localhost')).toBe(true);
    expect(list.count).toBe(2);
    expect(list.at(0)).toBe('id0@localhost');
    expect(list.at(1)).toBe('id1@localhost');

    list.removeAt(0);

    expect(list.count).toBe(1);
    expect(list.at(0)).toBe('id1@localhost');

    list.set(0, 'id@localhost');

    expect(list.count).toBe(1);
    expect(list.at(0)).toBe('id@localhost');
  });

  test('TestGetEnumerator', () => {
    const list = new MessageIdList();

    for (let i = 0; i < 5; i++)
      list.add(`${i}@example.com`);

    let index = 0;
    for (const msgid of list)
      expect(msgid).toBe(`${index++}@example.com`);

    // C# also iterates the non-generic IEnumerable; a single for..of covers both in TS.
    index = 0;
    for (const msgid of [...list])
      expect(msgid).toBe(`${index++}@example.com`);
  });
});
