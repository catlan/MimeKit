// A default in-memory ISecureMimeStore (the injectable store for wave C2b-1).
//
// Implements the C2a store seam (secure-mime-context.ts). Browser (IndexedDB)
// and Node (filesystem) stores arrive later; this is the always-available
// default that backs certificates/keys imported at runtime. Recipient lookup is
// by certificate email address (SubjectAltName rfc822Name / DN emailAddress) or,
// for a SecureMailboxAddress, by SHA-1 fingerprint — matching how MimeKit's
// X509CertificateDatabase resolves certificates.

import * as asn1js from 'asn1js';
import punycode from 'punycode/punycode.js';
import { ContentInfo, SignedData, Certificate } from 'pkijs';
import { X509CertificateImpl } from './x509-certificate-impl.js';
import { X509CertificateChain } from './x509-certificate-chain.js';
import { canSign } from './cms-signer.js';
import { X509KeyUsageFlags } from './x509-key-usage-flags.js';
import { SecureMailboxAddress } from './secure-mailbox-address.js';
import type { ISecureMimeStore, PrivateKeyEntry } from './secure-mime-context.js';
import type { AsymmetricKey, X509Certificate } from './x509-certificate.js';
import type { MailboxAddress } from '../mailbox-address.js';

const OID_PKCS7_SIGNED_DATA = '1.2.840.113549.1.7.2';

/** Whether a certificate's key usage permits content encryption / key transport. */
export function canEncrypt(keyUsage: X509KeyUsageFlags): boolean {
  const mask = X509KeyUsageFlags.KeyEncipherment | X509KeyUsageFlags.DataEncipherment | X509KeyUsageFlags.KeyAgreement;
  return keyUsage === X509KeyUsageFlags.None || (keyUsage & mask) !== 0;
}

function emailKey(email: string | null): string | null {
  return email ? email.toLowerCase() : null;
}

function domainKey(domain: string): string {
  return punycode.toASCII(domain).toLowerCase();
}

/** A simple, always-available in-memory certificate / private-key store. */
export class InMemorySecureMimeStore implements ISecureMimeStore {
  private readonly certificates = new Map<string, X509Certificate>();
  private readonly anchors = new Map<string, X509Certificate>();
  private readonly privateKeys: PrivateKeyEntry[] = [];

  async getCertificate(mailbox: MailboxAddress): Promise<X509Certificate | null> {
    const candidates = this.matchCertificates(mailbox).filter((c) => canEncrypt(c.getKeyUsageFlags()));
    return candidates[0] ?? this.matchCertificates(mailbox)[0] ?? null;
  }

  async getPrivateKey(mailbox: MailboxAddress): Promise<PrivateKeyEntry | null> {
    const fingerprint = mailbox instanceof SecureMailboxAddress ? mailbox.fingerprint.toLowerCase() : null;
    const address = emailKey(mailbox.address);
    const at = address?.lastIndexOf('@') ?? -1;
    const domain = at !== -1 ? domainKey(address!.substring(at + 1)) : null;
    for (const entry of this.privateKeys) {
      if (fingerprint && entry.certificate.getFingerprint().toLowerCase() === fingerprint) return entry;
      if (!fingerprint && address && emailKey(entry.certificate.getSubjectEmailAddress()) === address) return entry;
      if (!fingerprint && domain && entry.certificate.getSubjectDnsNames().some((name) => domainKey(name) === domain)) return entry;
    }
    return null;
  }

  async getTrustedAnchors(): Promise<X509Certificate[]> {
    return [...this.anchors.values()];
  }

  async addCertificate(certificate: X509Certificate): Promise<void> {
    this.certificates.set(certificate.getFingerprint().toLowerCase(), certificate);
  }

  async importCertificates(data: Uint8Array): Promise<void> {
    for (const cert of parseCertificates(data)) await this.addCertificate(cert);
  }

  // ---- backend extras (not part of ISecureMimeStore) ----------------------

  /** Register a certificate as a trusted root/anchor. */
  addTrustedAnchor(certificate: X509Certificate): void {
    this.anchors.set(certificate.getFingerprint().toLowerCase(), certificate);
  }

  /** Register a signer/decryptor: a private key with its certificate chain (leaf-first). */
  addPrivateKey(chain: Iterable<X509Certificate>, key: AsymmetricKey): void {
    const certs = [...chain];
    if (certs.length === 0) throw new Error('The certificate chain was empty.');
    const certificate = certs[0]!;
    this.privateKeys.push({ certificate, chain: certs, key });
    for (const cert of certs) void this.addCertificate(cert);
  }

  /** Signing key entries whose certificate can sign. */
  getSigners(): PrivateKeyEntry[] {
    return this.privateKeys.filter((e) => canSign(e.certificate.getKeyUsageFlags()));
  }

  /** All registered private-key entries (decryption candidates). */
  getDecryptors(): PrivateKeyEntry[] {
    return [...this.privateKeys];
  }

  private matchCertificates(mailbox: MailboxAddress): X509Certificate[] {
    if (mailbox instanceof SecureMailboxAddress) {
      const cert = this.certificates.get(mailbox.fingerprint.toLowerCase());
      return cert ? [cert] : [];
    }
    const address = emailKey(mailbox.address);
    if (!address) return [];
    const at = address.lastIndexOf('@');
    const domain = at !== -1 ? domainKey(address.substring(at + 1)) : null;
    return [...this.certificates.values()].filter((c) =>
      emailKey(c.getSubjectEmailAddress()) === address ||
      (domain != null && c.getSubjectDnsNames().some((name) => domainKey(name) === domain))
    );
  }
}

/** Parse certificates from a DER certificate or a PKCS#7 signed-data bundle. */
export function parseCertificates(data: Uint8Array): X509Certificate[] {
  const asn = asn1js.fromBER(data.slice().buffer);
  if (asn.offset === -1) throw new Error('Invalid certificate data.');
  const seq = asn.result as asn1js.Sequence;

  // Detect a PKCS#7 ContentInfo { contentType = signedData, ... }.
  const first = seq.valueBlock.value[0];
  if (first instanceof asn1js.ObjectIdentifier && first.getValue() === OID_PKCS7_SIGNED_DATA) {
    const contentInfo = new ContentInfo({ schema: asn.result });
    const signedData = new SignedData({ schema: contentInfo.content });
    const out: X509Certificate[] = [];
    for (const cert of signedData.certificates ?? []) {
      if (cert instanceof Certificate) out.push(new X509CertificateImpl(new Uint8Array(cert.toSchema().toBER())));
    }
    return out;
  }

  return [new X509CertificateImpl(data)];
}
