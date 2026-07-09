// Port of UnitTests/Cryptography/PrivateKeyNotFoundExceptionTests.cs (1:1).
//
// C#'s ArgumentNullException maps to native TypeError per the port's error model.

import { describe, expect, test } from 'vitest';
import { PrivateKeyNotFoundException } from '../../src/smime/errors.js';
import { MailboxAddress } from '../../src/mailbox-address.js';

describe('PrivateKeyNotFoundExceptionTests', () => {
  test('TestArgumentExceptions', () => {
    expect(() => new PrivateKeyNotFoundException(null as unknown as string, 'Message')).toThrow(TypeError); // String
    expect(() => new PrivateKeyNotFoundException(null as unknown as MailboxAddress, 'Message')).toThrow(TypeError); // MailboxAddress
  });

  test('TestConstructorLong', () => {
    const ex = new PrivateKeyNotFoundException(0xdeadbeef, 'Message');
    expect(ex.keyId).toBe('DEADBEEF');
  });

  test('TestConstructorString', () => {
    const ex = new PrivateKeyNotFoundException('DEADBEEF', 'Message');
    expect(ex.keyId).toBe('DEADBEEF');
  });

  test('TestConstructorMailboxAddress', () => {
    const mailbox = new MailboxAddress('', 'user@domain.com');
    const ex = new PrivateKeyNotFoundException(mailbox, 'Message');
    expect(ex.keyId).toBe(mailbox.address);
  });
});
