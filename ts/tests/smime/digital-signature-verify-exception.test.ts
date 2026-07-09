// Port of UnitTests/Cryptography/DigitalSignatureVerifyExceptionTests.cs (1:1).

import { describe, expect, test } from 'vitest';
import { DigitalSignatureVerifyException } from '../../src/smime/errors.js';

describe('DigitalSignatureVerifyExceptionTests', () => {
  test('TestConstructors', () => {
    const innerException = new Error('message');
    let ex: DigitalSignatureVerifyException;

    ex = new DigitalSignatureVerifyException('message');
    expect(ex.keyId).toBeNull();

    ex = new DigitalSignatureVerifyException('message', innerException);
    expect(ex.keyId).toBeNull();

    ex = new DigitalSignatureVerifyException(12345, 'message');
    expect(ex.keyId).toBe(12345);

    ex = new DigitalSignatureVerifyException(12345, 'message', innerException);
    expect(ex.keyId).toBe(12345);
  });
});
