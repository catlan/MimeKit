// Port of MimeKit/Cryptography/DkimSigner.cs.

import { FormatOptions } from '../format-options.js';
import { Header } from '../header.js';
import { HeaderId, toHeaderName } from '../header-id.js';
import type { MimeMessage } from '../mime-message.js';
import { FilteredStream } from '../io/filtered-stream.js';
import { DkimCanonicalizationAlgorithm, canonicalizationTag } from './dkim-canonicalization-algorithm.js';
import { DkimSignatureAlgorithm, signatureAlgorithmTag } from './dkim-signature-algorithm.js';
import { DkimSignatureStream } from './dkim-signature-stream.js';
import { DkimSignerBase, type DkimPrivateKeySource } from './dkim-signer-base.js';
import { DkimVerifierBase } from './dkim-verifier-base.js';
import { hashBody } from './hash-body.js';
import { bytesToBase64 } from './crypto.js';

const DKIM_SHOULD_NOT_INCLUDE = ['return-path', 'received', 'comments', 'keywords', 'bcc', 'resent-bcc', 'dkim-signature'];

/**
 * A DKIM signer.
 */
export class DkimSigner extends DkimSignerBase {
  /** The agent or user identifier. */
  agentOrUserIdentifier: string | null = null;

  /** The public key query method. */
  queryMethod: string | null = null;

  /**
   * Initialize a new instance of the DKIM signer.
   *
   * @param key The private key (an {@link AsymmetricKey}, PEM string, PEM bytes,
   *   or a stream containing a PEM private key).
   * @param domain The domain that the signer represents.
   * @param selector The selector subdividing the domain.
   * @param algorithm The signature algorithm.
   */
  constructor(key: DkimPrivateKeySource, domain: string, selector: string, algorithm: DkimSignatureAlgorithm = DkimSignatureAlgorithm.RsaSha256) {
    super(key, domain, selector, algorithm);
  }

  /**
   * Get the timestamp to use as the `t=` value in the DKIM-Signature header.
   *
   * @returns The Unix timestamp in seconds.
   */
  protected getTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  private async dkimSign(options: FormatOptions, message: MimeMessage, headers: string[]): Promise<void> {
    const t = this.getTimestamp();
    let builder = 'v=1';

    options = options.clone();
    options.newLineFormat = 'dos';
    options.ensureNewLine = true;

    builder += `; a=${signatureAlgorithmTag(this.signatureAlgorithm)}`;
    builder += `; d=${this.domain}`;
    builder += `; s=${this.selector}`;
    builder += `; c=${canonicalizationTag(this.headerCanonicalizationAlgorithm)}/${canonicalizationTag(this.bodyCanonicalizationAlgorithm)}`;

    if (this.queryMethod != null && this.queryMethod.length > 0) builder += `; q=${this.queryMethod}`;
    if (this.agentOrUserIdentifier != null && this.agentOrUserIdentifier.length > 0) builder += `; i=${this.agentOrUserIdentifier}`;

    builder += `; t=${t}`;

    if (this.signaturesExpireAfter != null) {
      const x = t + this.signaturesExpireAfter;
      builder += `; x=${x}`;
    }

    const stream = new DkimSignatureStream(this.createSigningContext());
    const filtered = new FilteredStream(stream);
    filtered.add(options.createNewLineFilter(false));

    // write the specified message headers
    DkimVerifierBase.writeHeaders(options, message, headers, this.headerCanonicalizationAlgorithm, filtered);

    builder += `; h=${headers.join(':')}`;

    const hash = hashBody(message, options, this.signatureAlgorithm, this.bodyCanonicalizationAlgorithm, -1);
    builder += `; bh=${bytesToBase64(hash)}`;
    builder += '; b=';

    const dkim = new Header(HeaderId.DkimSignature, builder);
    message.headers.insert(0, dkim);

    if (this.headerCanonicalizationAlgorithm === DkimCanonicalizationAlgorithm.Relaxed) {
      DkimVerifierBase.writeHeaderRelaxed(options, filtered, dkim, true);
    } else {
      DkimVerifierBase.writeHeaderSimple(options, filtered, dkim, true);
    }

    filtered.flush();

    const signature = await stream.generateSignature();

    dkim.value = dkim.value + bytesToBase64(signature);
  }

  /**
   * Digitally sign the message using a DKIM signature.
   *
   * @param a The formatting options, or the message.
   * @param b The message, or the headers to sign.
   * @param c The headers to sign (when options are supplied).
   * @throws {TypeError} A required argument is null, or the header list is invalid.
   */
  sign(options: FormatOptions, message: MimeMessage, headers: readonly string[] | readonly HeaderId[]): Promise<void>;
  sign(message: MimeMessage, headers: readonly string[] | readonly HeaderId[]): Promise<void>;
  async sign(a: FormatOptions | MimeMessage, b: MimeMessage | readonly string[] | readonly HeaderId[], c?: readonly string[] | readonly HeaderId[]): Promise<void> {
    const options = a instanceof FormatOptions ? a : FormatOptions.default;
    const message = (a instanceof FormatOptions ? b : a) as MimeMessage;
    const headers = (a instanceof FormatOptions ? c : b) as readonly string[] | readonly HeaderId[] | undefined;

    if (options == null) throw new TypeError('options cannot be null or undefined');
    if (message == null) throw new TypeError('message cannot be null or undefined');
    if (headers == null) throw new TypeError('headers cannot be null or undefined');

    const fields = normalizeSignedHeaders(headers, DKIM_SHOULD_NOT_INCLUDE);

    return this.dkimSign(options, message, fields);
  }
}

const HEADER_ID_VALUES = new Set<string>(Object.values(HeaderId) as string[]);

/**
 * Normalize a list of header fields to lowercase wire names and enforce the
 * DKIM/ARC signing rules (C#: `DkimSigner.Sign` overloads).
 *
 * `HeaderId` is a string enum, so a list element is a well-known header id when
 * it matches an enum value (e.g. `MimeVersion` -> wire name `mime-version`) and
 * a raw field name otherwise (e.g. `mime-version` -> `mime-version`).
 *
 * @param headers The header fields (raw names and/or `HeaderId` values).
 * @param shouldNotInclude The lowercase header names that must not be signed.
 * @returns The lowercased wire header names to sign.
 * @throws {TypeError} An element is null/empty/`Unknown`, is forbidden, or the
 *   list omits `From`.
 */
export function normalizeSignedHeaders(headers: readonly string[] | readonly HeaderId[], shouldNotInclude: readonly string[]): string[] {
  const fields = new Array<string>(headers.length);
  let containsFrom = false;

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i] as string | HeaderId | null | undefined;

    if (header == null) throw new TypeError('The list of headers cannot contain null.');

    let field: string;
    if (HEADER_ID_VALUES.has(header)) {
      const id = header as HeaderId;
      if (id === HeaderId.Unknown) throw new TypeError("The list of headers to sign cannot include the 'Unknown' header.");
      field = toHeaderName(id).toLowerCase();
    } else {
      if (header.length === 0) throw new TypeError('The list of headers cannot contain empty string.');
      field = header.toLowerCase();
    }

    fields[i] = field;

    if (shouldNotInclude.includes(field))
      throw new TypeError(`The list of headers to sign SHOULD NOT include the '${header}' header.`);

    if (field === 'from') containsFrom = true;
  }

  if (!containsFrom) throw new TypeError("The list of headers to sign MUST include the 'From' header.");

  return fields;
}
