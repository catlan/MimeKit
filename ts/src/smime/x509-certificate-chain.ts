// Port of MimeKit/Cryptography/X509CertificateChain.cs.
//
// C# implements IList<X509Certificate> and IStore<X509Certificate>. This is a
// value-only list wrapper (no crypto). The C# `this[index]` indexer maps to
// {@link get}/{@link set} here (TS classes have no bracket-indexer). The
// IStore `GetMatches` is reduced to a predicate-based helper for C2b.

import type { X509Certificate } from './x509-certificate.js';

function certEquals(a: X509Certificate, b: X509Certificate): boolean {
  return a === b || a.equals(b);
}

/**
 * An X.509 certificate chain.
 */
export class X509CertificateChain implements Iterable<X509Certificate> {
  private readonly certificates: X509Certificate[] = [];

  constructor(collection?: Iterable<X509Certificate>) {
    if (arguments.length > 0) {
      if (collection == null) throw new TypeError('collection cannot be null or undefined');
      for (const certificate of collection) this.certificates.push(certificate);
    }
  }

  /** The number of certificates in the chain. */
  get count(): number {
    return this.certificates.length;
  }

  /** A certificate chain is never read-only. */
  get isReadOnly(): boolean {
    return false;
  }

  /** Gets the index of the specified certificate, or -1. */
  indexOf(certificate: X509Certificate): number {
    if (certificate == null) throw new TypeError('certificate cannot be null or undefined');
    return this.certificates.findIndex((c) => certEquals(c, certificate));
  }

  /** Inserts a certificate at the specified index. */
  insert(index: number, certificate: X509Certificate): void {
    if (!Number.isInteger(index) || index < 0 || index > this.certificates.length)
      throw new RangeError(`index ${index} is out of range`);
    if (certificate == null) throw new TypeError('certificate cannot be null or undefined');
    this.certificates.splice(index, 0, certificate);
  }

  /** Removes the certificate at the specified index. */
  removeAt(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.certificates.length)
      throw new RangeError(`index ${index} is out of range`);
    this.certificates.splice(index, 1);
  }

  /** Gets the certificate at the specified index (C#: `this[index]` getter). */
  get(index: number): X509Certificate {
    if (!Number.isInteger(index) || index < 0 || index >= this.certificates.length)
      throw new RangeError(`index ${index} is out of range`);
    return this.certificates[index]!;
  }

  /** Sets the certificate at the specified index (C#: `this[index]` setter). */
  set(index: number, certificate: X509Certificate): void {
    // C# checks the null value before indexing (which would throw a range error).
    if (certificate == null) throw new TypeError('certificate cannot be null or undefined');
    if (!Number.isInteger(index) || index < 0 || index >= this.certificates.length)
      throw new RangeError(`index ${index} is out of range`);
    this.certificates[index] = certificate;
  }

  /** Adds a certificate to the chain. */
  add(certificate: X509Certificate): void {
    if (certificate == null) throw new TypeError('certificate cannot be null or undefined');
    this.certificates.push(certificate);
  }

  /** Adds a range of certificates to the chain. */
  addRange(certificates: Iterable<X509Certificate>): void {
    if (certificates == null) throw new TypeError('certificates cannot be null or undefined');
    for (const certificate of certificates) this.certificates.push(certificate);
  }

  /** Clears the chain. */
  clear(): void {
    this.certificates.length = 0;
  }

  /** Determines whether the chain contains the specified certificate. */
  contains(certificate: X509Certificate): boolean {
    if (certificate == null) throw new TypeError('certificate cannot be null or undefined');
    return this.certificates.some((c) => certEquals(c, certificate));
  }

  /** Copies the certificates into the array starting at the specified index. */
  copyTo(array: X509Certificate[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null or undefined');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex + this.count > array.length)
      throw new RangeError(`arrayIndex ${arrayIndex} is out of range`);
    for (let i = 0; i < this.certificates.length; i++) array[arrayIndex + i] = this.certificates[i]!;
  }

  /** Removes the specified certificate. Returns `true` if it was removed. */
  remove(certificate: X509Certificate): boolean {
    if (certificate == null) throw new TypeError('certificate cannot be null or undefined');
    const index = this.indexOf(certificate);
    if (index < 0) return false;
    this.certificates.splice(index, 1);
    return true;
  }

  /** Removes a range of certificates from the chain. */
  removeRange(certificates: Iterable<X509Certificate>): void {
    if (certificates == null) throw new TypeError('certificates cannot be null or undefined');
    for (const certificate of certificates) this.remove(certificate);
  }

  /** Gets the certificates matching the predicate (C#: `GetMatches(ISelector)`). */
  getMatches(selector: ((c: X509Certificate) => boolean) | null): X509Certificate[] {
    if (selector == null) return this.certificates.slice();
    return this.certificates.filter(selector);
  }

  [Symbol.iterator](): Iterator<X509Certificate> {
    return this.certificates[Symbol.iterator]();
  }
}
