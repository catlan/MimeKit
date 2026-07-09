// X.509 certificate-chain construction (the crypto backend for wave C2b-1).
//
// Builds the leaf-first chain the C2a X509CertificateChain value type holds by
// following issuer -> subject distinguished-name links among a candidate set,
// i.e. structural (name-based) chaining. This is *construction*, not validation:
// full RFC 5280 path validation (signature verification, validity windows,
// revocation, policy) is deferred to wave C2b-2.
//
// The plan named @peculiar/x509's X509ChainBuilder, but that package requires a
// `reflect-metadata` polyfill (via tsyringe) that is not in the dependency set,
// so this uses pkijs's crypto-free Certificate DN comparison instead — the same
// structural chaining X509ChainBuilder performs.

import * as asn1js from 'asn1js';
import { Certificate } from 'pkijs';
import { X509CertificateChain } from './x509-certificate-chain.js';
import type { X509Certificate } from './x509-certificate.js';

function nameHexes(cert: X509Certificate): { subject: string; issuer: string } {
  const der = cert.getEncoded();
  const asn = asn1js.fromBER(der.slice().buffer);
  const parsed = new Certificate({ schema: asn.result });
  const toHex = (b: ArrayBuffer): string => {
    const bytes = new Uint8Array(b);
    let s = '';
    for (const x of bytes) s += x.toString(16).padStart(2, '0');
    return s;
  };
  return { subject: toHex(parsed.subject.toSchema().toBER()), issuer: toHex(parsed.issuer.toSchema().toBER()) };
}

/**
 * Build the certificate chain for `leaf`, ordered leaf-first, by following
 * issuer links through `candidates` (which may or may not include `leaf`).
 * Stops at a self-signed certificate or when no issuer is found.
 */
export function buildCertificateChain(
  leaf: X509Certificate,
  candidates: Iterable<X509Certificate>,
): X509CertificateChain {
  const pool: { cert: X509Certificate; subject: string; issuer: string }[] = [];
  for (const cert of candidates) {
    const { subject, issuer } = nameHexes(cert);
    pool.push({ cert, subject, issuer });
  }

  const bySubject = new Map<string, { cert: X509Certificate; subject: string; issuer: string }>();
  for (const entry of pool) if (!bySubject.has(entry.subject)) bySubject.set(entry.subject, entry);

  const chain = new X509CertificateChain();
  const seen = new Set<string>();
  let current = { cert: leaf, ...nameHexes(leaf) };

  for (;;) {
    if (seen.has(current.subject)) break;
    seen.add(current.subject);
    chain.add(current.cert);
    if (current.issuer === current.subject) break; // self-signed root
    const parent = bySubject.get(current.issuer);
    if (!parent || parent.cert.equals(current.cert)) break;
    current = parent;
  }

  return chain;
}
