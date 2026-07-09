// Port of MimeKit/Cryptography/IDkimPublicKeyLocator.cs +
// DkimPublicKeyLocatorBase.cs.
//
// The verify path is asynchronous in the port, so the interface exposes only
// the async lookup (C#'s synchronous `LocatePublicKey` collapses into it).

import { parseDkimPublicKey, type AsymmetricKey } from './crypto.js';
import { ParseException } from './errors.js';

/**
 * A service which locates and retrieves DKIM public keys (typically via DNS).
 *
 * MimeKit does not implement DNS itself; the client supplies a locator. The
 * shipped implementations are {@link DkimPublicKeyLocatorBase} (TXT parsing),
 * the test locator (fixtures), and `DohPublicKeyLocator` (DNS-over-HTTPS).
 */
export interface DkimPublicKeyLocator {
  /**
   * Locate and retrieve the public key for the given domain and selector.
   *
   * @param methods A colon-separated list of query methods (default `dns/txt`).
   * @param domain The domain.
   * @param selector The selector.
   * @returns The public key.
   */
  locatePublicKey(methods: string, domain: string, selector: string): Promise<AsymmetricKey>;
}

/**
 * A base class for {@link DkimPublicKeyLocator} implementations that provides a
 * helper for extracting the public key from a DNS TXT record.
 */
export abstract class DkimPublicKeyLocatorBase implements DkimPublicKeyLocator {
  /**
   * Get the public key from a DNS TXT record.
   *
   * @param txt The DNS TXT record.
   * @returns The public key.
   * @throws {TypeError} `txt` is null or undefined.
   * @throws {ParseException} The DNS TXT record could not be parsed.
   */
  protected static getPublicKey(txt: string): AsymmetricKey {
    if (txt == null) throw new TypeError('txt cannot be null or undefined');

    let k = 'rsa';
    let p: string | null = null;
    let index = 0;

    // parse the response (will look something like: "k=rsa; p=<base64>")
    while (index < txt.length) {
      while (index < txt.length && isWhiteSpace(txt[index]!)) index++;

      if (index === txt.length) break;

      // find the end of the key
      let startIndex = index;
      while (index < txt.length && txt[index] !== '=') index++;

      if (index === txt.length) break;

      const key = txt.substring(startIndex, index);

      // skip over the '='
      index++;

      // find the end of the value
      startIndex = index;
      while (index < txt.length && txt[index] !== ';') index++;

      const value = txt.substring(startIndex, index);

      if (key === 'k') {
        switch (value) {
        case 'rsa':
        case 'ed25519':
          k = value;
          break;
        default:
          throw new ParseException(`Unknown public key algorithm: ${value}`, startIndex, index);
        }
      } else if (key === 'p') {
        p = value.replace(/ /g, '');
      }

      // skip over the ';'
      index++;
    }

    if (p != null) {
      return parseDkimPublicKey(k, p);
    }

    throw new ParseException('Public key parameters not found in DNS TXT record.', 0, txt.length);
  }

  /**
   * Locate and retrieve the public key for the given domain and selector.
   *
   * @param methods A colon-separated list of query methods.
   * @param domain The domain.
   * @param selector The selector.
   * @returns The public key.
   */
  abstract locatePublicKey(methods: string, domain: string, selector: string): Promise<AsymmetricKey>;
}

function isWhiteSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\v';
}
