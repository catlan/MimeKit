// Port of MimeKit/Cryptography/DkimSignerBase.cs.

import { Stream } from '../io/stream.js';
import { DkimCanonicalizationAlgorithm } from './dkim-canonicalization-algorithm.js';
import { DkimSignatureAlgorithm, signatureAlgorithmTag } from './dkim-signature-algorithm.js';
import { createDigestSigner, loadPrivateKeyFromPem, type AsymmetricKey, type DigestSigner } from './crypto.js';

/** A private-key source accepted by the DKIM/ARC signer constructors. */
export type DkimPrivateKeySource = AsymmetricKey | string | Uint8Array | Stream;

function readAll(stream: Stream): Uint8Array {
  const chunks: Uint8Array[] = [];
  const buffer = new Uint8Array(4096);
  let total = 0;
  let n: number;
  while ((n = stream.read(buffer, 0, buffer.length)) > 0) {
    chunks.push(buffer.slice(0, n));
    total += n;
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

function isAsymmetricKey(value: unknown): value is AsymmetricKey {
  return typeof value === 'object' && value !== null && 'kind' in value && 'isPrivate' in value;
}

function loadKey(source: DkimPrivateKeySource): AsymmetricKey {
  if (source instanceof Stream) {
    return loadPrivateKeyFromPem(new TextDecoder('latin1').decode(readAll(source)));
  }
  if (source instanceof Uint8Array) {
    return loadPrivateKeyFromPem(new TextDecoder('latin1').decode(source));
  }
  if (typeof source === 'string') {
    return loadPrivateKeyFromPem(source);
  }
  return source;
}

/**
 * A base class for DKIM and ARC signers.
 */
export abstract class DkimSignerBase {
  /** The domain that the signer represents. */
  readonly domain: string;

  /** The selector subdividing the domain. */
  readonly selector: string;

  /** The algorithm to use for signing. */
  signatureAlgorithm: DkimSignatureAlgorithm;

  /** The canonicalization algorithm to use for the message body. */
  bodyCanonicalizationAlgorithm = DkimCanonicalizationAlgorithm.Simple;

  /** The canonicalization algorithm to use for the message headers. */
  headerCanonicalizationAlgorithm = DkimCanonicalizationAlgorithm.Simple;

  /**
   * The number of seconds after which signatures are no longer valid, or
   * `null` for no expiration (C#: `SignaturesExpireAfter`, a `TimeSpan`).
   */
  signaturesExpireAfter: number | null = null;

  /** The private key used for signing. */
  protected readonly privateKey: AsymmetricKey;

  /**
   * Initialize a new instance of the signer base.
   *
   * @param key The private key (an {@link AsymmetricKey}, PEM string, PEM bytes,
   *   or a stream containing a PEM private key).
   * @param domain The domain that the signer represents.
   * @param selector The selector subdividing the domain.
   * @param algorithm The signature algorithm.
   * @throws {TypeError} `key`, `domain`, or `selector` is null; `key` is empty
   *   or not a private key.
   */
  protected constructor(key: DkimPrivateKeySource, domain: string, selector: string, algorithm: DkimSignatureAlgorithm = DkimSignatureAlgorithm.RsaSha256) {
    if (key == null) throw new TypeError('key cannot be null or undefined');
    if (typeof key === 'string' && key.length === 0) throw new TypeError('The file name cannot be empty.');
    if (domain == null) throw new TypeError('domain cannot be null or undefined');
    if (selector == null) throw new TypeError('selector cannot be null or undefined');

    const loaded = loadKey(key);

    if (isAsymmetricKey(key) && !key.isPrivate) throw new TypeError('The key must be a private key.');
    if (!loaded.isPrivate) throw new TypeError('The key must be a private key.');

    this.privateKey = loaded;
    this.signatureAlgorithm = algorithm;
    this.selector = selector;
    this.domain = domain;
  }

  /**
   * Create the digest signing context.
   *
   * @returns The digest signer.
   */
  createSigningContext(): DigestSigner {
    return createDigestSigner(signatureAlgorithmTag(this.signatureAlgorithm), this.privateKey);
  }
}
