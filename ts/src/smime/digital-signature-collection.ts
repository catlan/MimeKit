// Port of MimeKit/Cryptography/DigitalSignatureCollection.cs.
//
// C# derives from ReadOnlyCollection<IDigitalSignature>; the TS port exposes an
// immutable, indexable, iterable read-only view.

import type { IDigitalSignature } from './digital-signature.js';

/**
 * A read-only collection of digital signatures.
 *
 * When verifying a digitally signed MIME part such as a {@link MultipartSigned}
 * or an {@link ApplicationPkcs7Mime}, you get back a collection of digital
 * signatures. Typically there is a single signature.
 */
export class DigitalSignatureCollection implements Iterable<IDigitalSignature> {
  private readonly signatures: readonly IDigitalSignature[];

  constructor(signatures: readonly IDigitalSignature[]) {
    if (signatures == null) throw new TypeError('signatures cannot be null or undefined');
    this.signatures = signatures.slice();
  }

  /** The number of signatures in the collection. */
  get count(): number {
    return this.signatures.length;
  }

  /** Gets the signature at the specified index. */
  get(index: number): IDigitalSignature {
    if (!Number.isInteger(index) || index < 0 || index >= this.signatures.length)
      throw new RangeError(`index ${index} is out of range`);
    return this.signatures[index]!;
  }

  [Symbol.iterator](): Iterator<IDigitalSignature> {
    return this.signatures[Symbol.iterator]();
  }
}
