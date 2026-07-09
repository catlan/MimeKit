// Port of UnitTests/Cryptography/DkimPublicKeyLocator.cs (the offline test
// locator that serves keys from an in-memory map of DNS TXT records).

import { DkimPublicKeyLocatorBase } from '../../src/dkim/dkim-public-key-locator.js';
import type { AsymmetricKey } from '../../src/dkim/crypto.js';

/** A test DKIM public-key locator backed by an in-memory map of TXT records. */
export class DkimPublicKeyLocator extends DkimPublicKeyLocatorBase {
  private readonly keys = new Map<string, string>();

  /**
   * Add a TXT record for a `selector._domainkey.domain` query.
   *
   * @param key The `selector._domainkey.domain` query name.
   * @param value The TXT record value.
   */
  add(key: string, value: string): void {
    this.keys.set(key, value);
  }

  /**
   * Locate and retrieve the public key for the given domain and selector.
   *
   * @param _methods The query methods (ignored).
   * @param domain The domain.
   * @param selector The selector.
   * @returns The public key.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async locatePublicKey(_methods: string, domain: string, selector: string): Promise<AsymmetricKey> {
    const query = `${selector}._domainkey.${domain}`;
    const txt = this.keys.get(query);
    if (txt !== undefined) return DkimPublicKeyLocator.getPublicKey(txt);
    throw new Error(`Failed to look up public key for: ${domain}`);
  }
}
