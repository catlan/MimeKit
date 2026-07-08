import { describe, expect, test } from 'vitest';
import { TextRfc822Headers } from '../src/index.js';

describe('TextRfc822Headers', () => {
  test('TestArgumentExceptions', () => {
    const entity = new TextRfc822Headers();
    expect(() => new TextRfc822Headers('unknown-parameter')).toThrow(TypeError);
    expect(() => entity.accept(null as never)).toThrow(TypeError);
  });

  test.skip('TestSerializationAndDeserialization', () => {
    // deferred(wave-3e/4): requires MimeMessage construction, write, load, and parser visitor traversal.
  });
});
