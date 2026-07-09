// Port of MimeKit/Cryptography/DkimVerifier.cs.

import { FormatOptions } from '../format-options.js';
import { Header } from '../header.js';
import { HeaderId } from '../header-id.js';
import type { MimeMessage } from '../mime-message.js';
import { DkimVerifierBase, type CommonSignatureParameters } from './dkim-verifier-base.js';
import type { DkimPublicKeyLocator } from './dkim-public-key-locator.js';
import { FormatException } from './errors.js';

/**
 * A DKIM-Signature verifier.
 */
export class DkimVerifier extends DkimVerifierBase {
  /**
   * Initialize a new instance of the DKIM verifier.
   *
   * @param publicKeyLocator The public key locator.
   * @throws {TypeError} `publicKeyLocator` is null or undefined.
   */
  constructor(publicKeyLocator: DkimPublicKeyLocator) {
    super(publicKeyLocator);
  }

  private static validateDkimSignatureParameters(parameters: Map<string, string>): CommonSignatureParameters {
    const v = parameters.get('v');
    if (v === undefined) throw new FormatException('Malformed DKIM-Signature header: no version parameter detected.');
    if (v !== '1') throw new FormatException(`Unrecognized DKIM-Signature version: v=${v}`);

    const result = DkimVerifierBase.validateCommonSignatureParameters('DKIM-Signature', parameters);

    let containsFrom = false;
    for (const h of result.headers) {
      if (h.toLowerCase() === 'from') {
        containsFrom = true;
        break;
      }
    }

    if (!containsFrom) throw new FormatException('Malformed DKIM-Signature header: From header not signed.');

    const id = parameters.get('i');
    if (id !== undefined) {
      const at = id.lastIndexOf('@');
      if (at === -1) throw new FormatException('Malformed DKIM-Signature header: no @ in the AUID value.');

      const ident = id.substring(at + 1).toLowerCase();
      const domain = result.d.toLowerCase();

      if (ident !== domain && !ident.endsWith('.' + domain))
        throw new FormatException('Invalid DKIM-Signature header: the domain in the AUID does not match the domain parameter.');
    }

    return result;
  }

  /**
   * Verify the specified DKIM-Signature header.
   *
   * @param a The formatting options, or the message.
   * @param b The message, or the DKIM-Signature header.
   * @param c The DKIM-Signature header (when options are supplied).
   * @returns `true` if the DKIM-Signature is valid; otherwise, `false`.
   * @throws {TypeError} A required argument is null, or the header is not a DKIM-Signature.
   * @throws {FormatException} The DKIM-Signature header value is malformed.
   */
  verify(options: FormatOptions, message: MimeMessage, dkimSignature: Header): Promise<boolean>;
  verify(message: MimeMessage, dkimSignature: Header): Promise<boolean>;
  async verify(a: FormatOptions | MimeMessage, b: MimeMessage | Header, c?: Header): Promise<boolean> {
    const options = a instanceof FormatOptions ? a : FormatOptions.default;
    const message = (a instanceof FormatOptions ? b : a) as MimeMessage;
    const dkimSignature = (a instanceof FormatOptions ? c : b) as Header;

    if (options == null) throw new TypeError('options cannot be null or undefined');
    if (message == null) throw new TypeError('message cannot be null or undefined');
    if (dkimSignature == null) throw new TypeError('dkimSignature cannot be null or undefined');

    if (dkimSignature.id !== HeaderId.DkimSignature)
      throw new TypeError('The signature parameter MUST be a DKIM-Signature header.');

    return this.verifyImpl(options, message, dkimSignature);
  }

  private async verifyImpl(options: FormatOptions, message: MimeMessage, dkimSignature: Header): Promise<boolean> {
    const parameters = DkimVerifierBase.parseParameterTags(dkimSignature.id, dkimSignature.value);

    const params = DkimVerifier.validateDkimSignatureParameters(parameters);

    if (!this.isEnabled(params.algorithm)) return false;

    options = options.clone();
    options.newLineFormat = 'dos';

    // first check the body hash (if that's invalid, the entire signature is invalid)
    if (!DkimVerifier.verifyBodyHash(options, message, params.algorithm, params.bodyAlgorithm, params.maxLength, params.bh))
      return false;

    const key = await this.publicKeyLocator.locatePublicKey(params.q, params.d, params.s);

    if (key.kind === 'rsa' && key.bitLength < this.minimumRsaKeyLength) return false;

    return this.verifySignature(options, message, dkimSignature, params.algorithm, key, params.headers, params.headerAlgorithm, params.b);
  }
}
