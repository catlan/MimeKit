import { describe, expect, test } from 'vitest';
import { ByteArrayBuilder } from '../../src/utils/byte-array-builder.js';

describe('ByteArrayBuilderTests', () => {
  test('TestEnsureCapacity', () => {
    const builder = new ByteArrayBuilder(1);

    for (let i = 0; i < 32; i++)
      builder.append(i);

    const array = builder.toArray();
    builder.dispose();

    expect(array.length).toBe(32);
    for (let i = 0; i < array.length; i++)
      expect(array[i]).toBe(i);
  });
});
