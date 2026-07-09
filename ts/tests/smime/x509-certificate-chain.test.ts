// Port of UnitTests/Cryptography/X509CertificateChainTests.cs.
//
// The X509CertificateChain value type itself was ported in C2a; these cases were
// deferred because they load real certificate chains (from a .pfx and the
// StartCom .crt files), which the C2b-1 X.509 backend now provides.

import { describe, expect, test } from 'vitest';
import { X509CertificateChain } from '../../src/smime/x509-certificate-chain.js';
import { loadCertificate, rsaCertificate, smimePath } from './helpers.js';
import type { X509Certificate } from '../../src/smime/x509-certificate.js';

const certificateAuthorities = [
  'StartComCertificationAuthority.crt',
  'StartComClass1PrimaryIntermediateClientCA.crt',
];

describe('X509CertificateChainTests', () => {
  test('TestArgumentExceptions', () => {
    const rsa = rsaCertificate;
    const chain = new X509CertificateChain();

    expect(() => new X509CertificateChain(null as never)).toThrow(TypeError);
    expect(() => chain.add(null as never)).toThrow(TypeError);
    expect(() => chain.addRange(null as never)).toThrow(TypeError);
    expect(() => chain.contains(null as never)).toThrow(TypeError);
    expect(() => chain.copyTo(null as never, 0)).toThrow(TypeError);
    expect(() => chain.copyTo([], -1)).toThrow(RangeError);
    expect(() => chain.indexOf(null as never)).toThrow(TypeError);
    expect(() => chain.insert(-1, rsa.certificate)).toThrow(RangeError);
    expect(() => chain.insert(0, null as never)).toThrow(TypeError);
    expect(() => chain.set(0, null as never)).toThrow(TypeError);
    expect(() => chain.remove(null as never)).toThrow(TypeError);
    expect(() => chain.removeAt(-1)).toThrow(RangeError);
  });

  test('TestAddRemoveRange', () => {
    const certificates: X509Certificate[] = certificateAuthorities.map((a) => loadCertificate(smimePath(a)));
    const chain = new X509CertificateChain();

    expect(() => chain.addRange(null as never)).toThrow(TypeError);

    chain.addRange(certificates);
    expect(chain.count).toBe(certificateAuthorities.length);

    let index = 0;
    for (const certificate of chain) expect(certificate).toBe(certificates[index++]);

    expect(() => chain.removeRange(null as never)).toThrow(TypeError);

    chain.removeRange(certificates);
    expect(chain.count).toBe(0);
  });

  test('TestBasicFunctionality', () => {
    const certs = rsaCertificate.chain;
    const chain = new X509CertificateChain();

    expect(chain.isReadOnly).toBe(false);
    expect(chain.count).toBe(0);

    chain.add(certs[2]!);
    expect(chain.count).toBe(1);
    expect(chain.get(0)).toBe(certs[2]);

    chain.insert(0, certs[0]!);
    chain.insert(1, certs[1]!);

    expect(chain.count).toBe(3);
    expect(chain.get(0)).toBe(certs[0]);
    expect(chain.get(1)).toBe(certs[1]);
    expect(chain.get(2)).toBe(certs[2]);

    expect(chain.contains(certs[1]!)).toBe(true);
    expect(chain.indexOf(certs[1]!)).toBe(1);

    const array = new Array<X509Certificate>(chain.count);
    chain.copyTo(array, 0);
    chain.clear();
    expect(chain.count).toBe(0);

    for (const cert of array) chain.add(cert);
    expect(chain.count).toBe(array.length);

    expect(chain.remove(certs[2]!)).toBe(true);
    expect(chain.count).toBe(2);
    expect(chain.get(0)).toBe(certs[0]);
    expect(chain.get(1)).toBe(certs[1]);

    chain.removeAt(0);
    expect(chain.count).toBe(1);
    expect(chain.get(0)).toBe(certs[1]);

    chain.set(0, certs[2]!);
    expect(chain.count).toBe(1);
    expect(chain.get(0)).toBe(certs[2]);
  });
});
