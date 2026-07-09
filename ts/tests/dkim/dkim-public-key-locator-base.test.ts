// Port of UnitTests/Cryptography/DkimPublicKeyLocatorBaseTests.cs.
//
// C#'s synchronous `LocatePublicKey` collapses into the async `locatePublicKey`
// (the only lookup method in the port), so each sync/async assertion pair is
// ported as a single async assertion.

import { describe, expect, test } from 'vitest';
import { DkimPublicKeyLocator } from './dkim-public-key-locator.js';
import { ParseException } from '../../src/dkim/errors.js';

describe('DkimPublicKeyLocatorBaseTests', () => {
  test('TestArgumentExceptions', async () => {
    const locator = new DkimPublicKeyLocator();

    locator.add('dummy._domainkey.example.org', null as unknown as string);

    await expect(locator.locatePublicKey('dns/txt', 'example.org', 'dummy')).rejects.toThrow(TypeError);
  });

  test('TestParseExceptions', async () => {
    const locator = new DkimPublicKeyLocator();

    locator.add('empty._domainkey.example.org', '');
    locator.add('whitespace._domainkey.example.org', '     ');
    locator.add('no-k-or-p-params._domainkey.example.org', 'v=DKIM1; x=abc; y=def');
    locator.add('no-p-param._domainkey.example.org', 'v=DKIM1; k=rsa');
    locator.add('unknown-algorithm._domainkey.example.org', 'v=DKIM1; k=dummy; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkHlOQoBTzWRiGs5V6NpP3id');

    await expect(locator.locatePublicKey('dns/txt', 'example.org', 'empty')).rejects.toThrow(ParseException);
    await expect(locator.locatePublicKey('dns/txt', 'example.org', 'whitespace')).rejects.toThrow(ParseException);
    await expect(locator.locatePublicKey('dns/txt', 'example.org', 'no-k-or-p-params')).rejects.toThrow(ParseException);
    await expect(locator.locatePublicKey('dns/txt', 'example.org', 'no-p-param')).rejects.toThrow(ParseException);
    await expect(locator.locatePublicKey('dns/txt', 'example.org', 'unknown-algorithm')).rejects.toThrow(ParseException);
  });

  test('TestParseMissingKParamDefaultsToRsa', async () => {
    const locator = new DkimPublicKeyLocator();

    locator.add('no-k-param._domainkey.example.org', 'v=DKIM1; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkHlOQoBTzWRiGs5V6NpP3id Y6Wk08a5qhdR6wy5bdOKb2jLQiY/J16JYi0Qvx/byYzCNb3W91y3FutACDfzwQ/BC/e/8uBsCR+yz1Lx j+PL6lHvqMKrM3rG4hstT5QjvHO9PzoxZyVYLzBfO2EeC3Ip3G+2kryOTIKT+l/K4w3QIDAQAB');

    const key = await locator.locatePublicKey('dns/txt', 'example.org', 'no-k-param');

    expect(key.kind).toBe('rsa');
  });
});
