import { describe, expect, test } from 'vitest';
import { err, mimeError, ok, unwrap, type Result } from '../src/result.js';

describe('Result', () => {
  test('ok wraps a value and narrows', () => {
    const r: Result<number> = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  test('err from kind + message', () => {
    const r: Result<number> = err('invalid-token', 'unexpected token', { offset: 17 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('invalid-token');
      expect(r.error.message).toBe('unexpected token');
      expect(r.error.offset).toBe(17);
    }
  });

  test('err from a MimeError object', () => {
    const inner = mimeError('bad-charset', 'unknown charset "x-oops"');
    const r = err(mimeError('invalid-header', 'header failed to parse', { offset: 3, cause: inner }));
    expect(r.error.cause).toBe(inner);
    expect(r.error.offset).toBe(3);
  });

  test('mimeError omits absent optional fields entirely', () => {
    const e = mimeError('k', 'm');
    expect('offset' in e).toBe(false);
    expect('cause' in e).toBe(false);
  });

  test('unwrap returns the value on Ok and throws on Err', () => {
    expect(unwrap(ok('v'))).toBe('v');
    expect(() => unwrap(err('kind', 'boom'))).toThrowError(/\[kind\] boom/);
  });
});
