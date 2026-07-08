import { describe, expect, test } from 'vitest';
import { MessagePartial } from '../src/index.js';

describe('MessagePartial', () => {
  test('TestArgumentExceptions', () => {
    expect(() => new MessagePartial(null as never, 1, 5)).toThrow(TypeError);
    expect(() => new MessagePartial('id', 0, 5)).toThrow(RangeError);
    expect(() => new MessagePartial('id', 6, 5)).toThrow(RangeError);
    expect(() => new MessagePartial('id', 1, 5).accept(null as never)).toThrow(TypeError);
    expect(() => MessagePartial.split(null as never, 500)).toThrow('deferred(wave-3e/4)');
    expect(() => MessagePartial.join(null as never, [])).toThrow('deferred(wave-3e/4)');
  });

  test('TestNumberAndTotalParameters', () => {
    const partial = new MessagePartial('abc@example.com', 1, 5);
    partial.contentType.parameters.set('number', 'invalid');
    partial.contentType.parameters.set('total', 'invalid');
    expect(partial.number).toBeNull();
    expect(partial.total).toBeNull();
    partial.contentType.parameters.remove('number');
    partial.contentType.parameters.remove('total');
    expect(partial.number).toBeNull();
    expect(partial.total).toBeNull();
    partial.contentType.parameters.set('number', '1');
    partial.contentType.parameters.set('total', '5');
    expect(partial.number).toBe(1);
    expect(partial.total).toBe(5);
  });

  test.skip('TestReassembleGirlOnTrainPhotoExample', () => {
    // deferred(wave-3e/4): requires MimeMessage.Load, MimeParser, and MessagePartial.Join.
  });

  test.skip('TestReassembleRfc2046Example', () => {
    // deferred(wave-3e/4): requires MimeMessage.Load, MimeParser, and MessagePartial.Join.
  });

  test.skip('TestSplit', () => {
    // deferred(wave-3e/4): requires MimeMessage serialization and MessagePartial.Split.
  });
});
