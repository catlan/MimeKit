// Port of UnitTests/Cryptography/SecureMimeDigitalCertificateTests.cs.
//
// The Windows* variants (WindowsSecureMimeDigitalCertificate/Signature) are
// platform-specific and out of scope; only the portable + BouncyCastle-analog
// paths are ported. Loads real DSA/RSA/EC certificates, so this was deferred by
// C2a and is unblocked by the C2b-1 X.509 backend.

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { SecureMimeDigitalCertificate } from '../../src/smime/secure-mime-digital-certificate.js';
import { SecureMimeDigitalSignature } from '../../src/smime/secure-mime-digital-signature.js';
import { PublicKeyAlgorithm } from '../../src/smime/public-key-algorithm.js';
import { X509CertificateImpl } from '../../src/smime/x509-certificate-impl.js';
import { rsaCertificate, smimePath } from './helpers.js';

// GetCertificate: reads the CERTIFICATE block out of a PEM that also holds a key.
function getCertificate(fileName: string): X509CertificateImpl {
  return X509CertificateImpl.fromPem(readFileSync(smimePath(fileName), 'utf8'));
}

describe('SecureMimeDigitalCertificateTests', () => {
  test('TestArgumentExceptions', () => {
    const rsa = rsaCertificate;

    expect(() => new SecureMimeDigitalCertificate(null as never)).toThrow(TypeError);
    expect(() => new SecureMimeDigitalSignature(null as never, rsa.certificate)).toThrow(TypeError);
  });

  test('TestPublicKeyAlgorithmDetection', () => {
    const dsa = ['smdsa1.pem', 'smdsa2.pem', 'smdsa3.pem'];
    const rsa = ['smrsa1.pem', 'smrsa2.pem', 'smrsa3.pem'];
    const ec = ['smec1.pem', 'smec2.pem', 'smec3.pem'];

    for (const fileName of dsa) {
      const digital = new SecureMimeDigitalCertificate(getCertificate(fileName));
      expect(digital.publicKeyAlgorithm, fileName).toBe(PublicKeyAlgorithm.Dsa);
    }

    for (const fileName of rsa) {
      const digital = new SecureMimeDigitalCertificate(getCertificate(fileName));
      expect(digital.publicKeyAlgorithm, fileName).toBe(PublicKeyAlgorithm.RsaGeneral);
    }

    for (const fileName of ec) {
      const digital = new SecureMimeDigitalCertificate(getCertificate(fileName));
      expect(digital.publicKeyAlgorithm, fileName).toBe(PublicKeyAlgorithm.EllipticCurve);
    }
  });
});
