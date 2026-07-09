// The concrete Pkcs12Loader (the crypto backend for wave C2b-1).
//
// Implements the CmsSigner Pkcs12Loader seam declared by the C2a foundation
// (cms-signer.ts): parse a PKCS#12 / PFX blob into a certificate chain + private
// key. Installing this loader (see index.ts) makes `CmsSigner.load(...)` work.

import { parsePkcs12 } from './crypto/pkcs12.js';
import { X509CertificateImpl } from './x509-certificate-impl.js';
import { importPrivateKeyFromPkcs8, type X509PrivateKey } from './asymmetric-key.js';
import type { Pkcs12Loader } from './cms-signer.js';
import type { SubjectIdentifierType } from './subject-identifier-type.js';
import type { AsymmetricKey, X509Certificate } from './x509-certificate.js';

/** Loads a certificate chain + private key from PKCS#12 / PFX data. */
export class DefaultPkcs12Loader implements Pkcs12Loader {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async load(
    data: Uint8Array,
    password: string,
    _signerIdentifierType: SubjectIdentifierType,
  ): Promise<{ certificateChain: X509Certificate[]; privateKey: AsymmetricKey }> {
    const { certificates, privateKey } = parsePkcs12(data, password);
    if (privateKey === null) throw new Error('The PKCS#12 data did not contain a private key.');
    if (certificates.length === 0) throw new Error('The PKCS#12 data did not contain a certificate.');

    return {
      certificateChain: certificates.map((der) => new X509CertificateImpl(der)),
      privateKey: importPrivateKeyFromPkcs8(privateKey),
    };
  }
}

/**
 * Parse a PKCS#12 / PFX blob into its certificate chain (leaf-first) + private
 * key without going through the CmsSigner seam. Convenience for tests and stores.
 */
export function loadPkcs12(
  data: Uint8Array,
  password: string,
): { certificateChain: X509CertificateImpl[]; privateKey: X509PrivateKey } {
  const { certificates, privateKey } = parsePkcs12(data, password);
  if (privateKey === null) throw new Error('The PKCS#12 data did not contain a private key.');
  return {
    certificateChain: certificates.map((der) => new X509CertificateImpl(der)),
    privateKey: importPrivateKeyFromPkcs8(privateKey),
  };
}
