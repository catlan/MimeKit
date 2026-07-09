// Port of UnitTests/Cryptography/DummyArcSigner.cs (test helper).

import { ArcSigner } from '../../src/dkim/arc-signer.js';
import type { DkimPrivateKeySource } from '../../src/dkim/dkim-signer-base.js';
import { DkimSignatureAlgorithm } from '../../src/dkim/dkim-signature-algorithm.js';
import type { DkimPublicKeyLocator } from '../../src/dkim/dkim-public-key-locator.js';
import { HeaderId } from '../../src/header-id.js';
import type { FormatOptions } from '../../src/format-options.js';
import type { MimeMessage } from '../../src/mime-message.js';
import { AuthenticationResults } from '../../src/authentication-results.js';

/** A test ARC signer whose ARC-Authentication-Results is built from the message. */
export class DummyArcSigner extends ArcSigner {
  /** The public key locator (used by tests to verify the signed message). */
  publicKeyLocator!: DkimPublicKeyLocator;

  /** The authentication service identifier. */
  srvId = '';

  /** The fixed timestamp to use. */
  timestamp = 0;

  constructor(key: DkimPrivateKeySource, domain: string, selector: string, algorithm: DkimSignatureAlgorithm = DkimSignatureAlgorithm.RsaSha256) {
    super(key, domain, selector, algorithm);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async generateArcAuthenticationResults(_options: FormatOptions, message: MimeMessage): Promise<AuthenticationResults | null> {
    const results = new AuthenticationResults(this.srvId);

    for (let i = 0; i < message.headers.count; i++) {
      const header = message.headers.at(i);

      if (header.id !== HeaderId.AuthenticationResults) continue;

      const parsed = AuthenticationResults.tryParse(header.rawValue);
      if (!parsed.ok) continue;

      const authres = parsed.value;
      if (authres.authenticationServiceIdentifier !== this.srvId) continue;

      for (const result of authres.results) {
        if (!results.results.some((r) => r.method === result.method)) results.results.push(result);
      }
    }

    return results;
  }

  protected override getTimestamp(): number {
    return this.timestamp;
  }
}
