// Port of MimeKit/Cryptography/SecureMailboxAddress.cs.
//
// The C# overloads that take a System.Text.Encoding are folded away (the TS
// MailboxAddress carries its own encoding), matching the core port's
// MailboxAddress constructor shape (name, address, route?).

import { MailboxAddress } from '../mailbox-address.js';

function validateFingerprint(fingerprint: string): void {
  if (fingerprint == null) throw new TypeError('fingerprint cannot be null or undefined');
  for (let i = 0; i < fingerprint.length; i++) {
    const c = fingerprint.charCodeAt(i);
    if (c > 128 || !isXDigit(c))
      throw new TypeError('The fingerprint should be a hex-encoded string.');
  }
}

function isXDigit(c: number): boolean {
  return (
    (c >= 0x30 && c <= 0x39) || // 0-9
    (c >= 0x41 && c <= 0x46) || // A-F
    (c >= 0x61 && c <= 0x66) // a-f
  );
}

/**
 * A secure mailbox address which includes the fingerprint of the owner's
 * certificate (a SHA-1 hash used as a unique identifier in a certificate store).
 */
export class SecureMailboxAddress extends MailboxAddress {
  /** The fingerprint of the certificate and/or key to use for signing or encrypting. */
  readonly fingerprint: string;

  /**
   * @param name The display name of the mailbox.
   * @param address The address of the mailbox.
   * @param fingerprint The fingerprint of the owner's certificate.
   * @param route The optional route of the mailbox.
   */
  constructor(
    name: string | null | undefined,
    address: string,
    fingerprint: string,
    route?: Iterable<string>,
  ) {
    super(name, address, route);
    validateFingerprint(fingerprint);
    this.fingerprint = fingerprint;
  }
}
