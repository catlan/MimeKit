// An optional DNS-over-HTTPS public-key locator (not a MimeKit port).
//
// A shipped, browser-capable implementation of DkimPublicKeyLocator that
// resolves DKIM TXT records via Cloudflare (with a Google fallback). Both DoH
// endpoints send `access-control-allow-origin: *`, so this is callable
// cross-origin from any page. It is NOT wired into the verifiers by default —
// callers opt in by passing an instance to DkimVerifier / ArcVerifier.

import type { AsymmetricKey } from './crypto.js';
import { DkimPublicKeyLocatorBase } from './dkim-public-key-locator.js';

interface DohAnswer {
  data?: string;
  type?: number;
}

interface DohResponse {
  Answer?: DohAnswer[];
}

/**
 * A {@link DkimPublicKeyLocator} that resolves DKIM TXT records over
 * DNS-over-HTTPS (Cloudflare, then Google).
 */
export class DohPublicKeyLocator extends DkimPublicKeyLocatorBase {
  /**
   * Create a DNS-over-HTTPS public-key locator.
   *
   * @param fetchImpl The `fetch` implementation to use (defaults to the global).
   */
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch) {
    super();
  }

  /**
   * Locate and retrieve the public key for the given domain and selector.
   *
   * @param _methods A colon-separated list of query methods (ignored).
   * @param domain The domain.
   * @param selector The selector.
   * @returns The public key.
   */
  async locatePublicKey(_methods: string, domain: string, selector: string): Promise<AsymmetricKey> {
    const name = `${selector}._domainkey.${domain}`;
    const txt = await this.query(name);
    return DohPublicKeyLocator.getPublicKey(txt);
  }

  private async query(name: string): Promise<string> {
    const endpoints = [
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`,
    ];

    let lastError: unknown;
    for (const url of endpoints) {
      try {
        const response = await this.fetchImpl(url, { headers: { accept: 'application/dns-json' } });
        if (!response.ok) {
          lastError = new Error(`DoH query failed: HTTP ${response.status}`);
          continue;
        }
        const json = (await response.json()) as DohResponse;
        const txt = collectTxt(json);
        if (txt != null) return txt;
        lastError = new Error(`No TXT record found for ${name}`);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Failed to resolve TXT record for ${name}`);
  }
}

function collectTxt(json: DohResponse): string | null {
  const answers = json.Answer;
  if (!answers) return null;

  for (const answer of answers) {
    if (answer.type != null && answer.type !== 16) continue;
    const data = answer.data;
    if (data == null) continue;
    // TXT records are returned as one or more quoted strings; strip quotes and
    // concatenate the character-strings.
    const parts = data.match(/"(?:[^"\\]|\\.)*"/g);
    const joined = parts ? parts.map((part) => part.slice(1, -1).replace(/\\(.)/g, '$1')).join('') : data;
    if (joined.includes('DKIM1') || joined.includes('p=')) return joined;
  }

  return null;
}
