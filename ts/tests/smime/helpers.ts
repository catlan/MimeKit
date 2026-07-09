// Test fixtures for the S/MIME X.509 + key-import suites (wave C2b-1).
//
// Mirrors the parts of UnitTests/Cryptography/SecureMimeTests.cs
// (SMimeCertificate / SecureMimeTestsBase) that the ported X.509/key tests use:
// it loads the real .pfx / .crt fixtures from TestData/smime. The PFX files are
// long-lived (valid into 2034+), so unlike the C# base we never regenerate them.

// Importing the /smime entry installs the concrete crypto backend (registers
// the PKCS#12 loader on CmsSigner, wires the MIME types).
import '../../src/smime/index.js';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { testDataDir } from '../gates/helpers.js';
import { X509CertificateImpl } from '../../src/smime/x509-certificate-impl.js';
import { loadPkcs12 } from '../../src/smime/pkcs12-loader.js';
import { PublicKeyAlgorithm } from '../../src/smime/public-key-algorithm.js';
import type { X509PrivateKey } from '../../src/smime/asymmetric-key.js';

export const smimeDir = join(testDataDir, 'smime');

export function smimePath(rel: string): string {
  return join(smimeDir, rel);
}

export interface SMimeCertificate {
  fileName: string;
  chain: X509CertificateImpl[];
  certificate: X509CertificateImpl;
  privateKey: X509PrivateKey;
  emailAddress: string | null;
  publicKeyAlgorithm: PublicKeyAlgorithm;
  fingerprint: string;
}

function loadSMime(pfxRel: string): SMimeCertificate {
  const fileName = smimePath(pfxRel);
  const { certificateChain, privateKey } = loadPkcs12(new Uint8Array(readFileSync(fileName)), 'no.secret');
  const certificate = certificateChain[0]!;
  return {
    fileName,
    chain: certificateChain,
    certificate,
    privateKey,
    emailAddress: certificate.getSubjectEmailAddress(),
    publicKeyAlgorithm: certificate.getPublicKeyAlgorithm(),
    fingerprint: certificate.getFingerprint(),
  };
}

// The `smime.pfx` fixtures (matches SecureMimeTestsBase.RelativeConfigFilePaths).
const smimeDirs = ['dnsnames', 'dsa', 'ec', 'nochain', 'revoked', 'revokednochain', 'revokedsubca', 'rsa'];

/** All S/MIME certificate fixtures (SecureMimeTestsBase.SMimeCertificates). */
export const smimeCertificates: SMimeCertificate[] = smimeDirs.map((d) => loadSMime(`${d}/smime.pfx`));

/** The RSA signing certificate (SecureMimeTestsBase.RsaCertificate). */
export const rsaCertificate: SMimeCertificate =
  smimeCertificates.find((c) => c.emailAddress === 'rsa@mimekit.net')!;

/** Load a certificate from a DER or PEM file (SecureMimeTestsBase.LoadCertificate). */
export function loadCertificate(path: string): X509CertificateImpl {
  const bytes = readFileSync(path);
  const text = bytes.toString('latin1');
  if (text.includes('-----BEGIN CERTIFICATE-----')) return X509CertificateImpl.fromPem(text);
  return X509CertificateImpl.fromDer(new Uint8Array(bytes));
}
