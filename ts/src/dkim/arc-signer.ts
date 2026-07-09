// Port of MimeKit/Cryptography/ArcSigner.cs.

import { FormatOptions } from '../format-options.js';
import { Header } from '../header.js';
import { HeaderId } from '../header-id.js';
import type { MimeMessage } from '../mime-message.js';
import type { AuthenticationResults } from '../authentication-results.js';
import { FilteredStream } from '../io/filtered-stream.js';
import { DkimCanonicalizationAlgorithm, canonicalizationTag } from './dkim-canonicalization-algorithm.js';
import { DkimSignatureAlgorithm, signatureAlgorithmTag } from './dkim-signature-algorithm.js';
import { DkimSignatureStream } from './dkim-signature-stream.js';
import { DkimSignerBase } from './dkim-signer-base.js';
import { normalizeSignedHeaders } from './dkim-signer.js';
import { DkimVerifierBase } from './dkim-verifier-base.js';
import { hashBody } from './hash-body.js';
import { bytesToBase64 } from './crypto.js';
import { ArcVerifier, ArcValidationErrors, type ArcHeaderSet } from './arc-verifier.js';

const ARC_SHOULD_NOT_INCLUDE = ['return-path', 'received', 'comments', 'keywords', 'bcc', 'resent-bcc', 'arc-seal'];

/** The callback used to generate an ARC-Authentication-Results header. */
export type GenerateArcAuthenticationResults = (options: FormatOptions, message: MimeMessage) => Promise<AuthenticationResults | null>;

function appendInstanceAndSignatureAlgorithm(instance: number, signatureAlgorithm: DkimSignatureAlgorithm): string {
  return `i=${instance}; a=${signatureAlgorithmTag(signatureAlgorithm)}`;
}

/**
 * An ARC signer.
 */
export abstract class ArcSigner extends DkimSignerBase {
  /**
   * Generate an ARC-Authentication-Results header.
   *
   * If the returned {@link AuthenticationResults} contains a result with method
   * `arc`, its result is used as the `cv=` tag value in the generated ARC-Seal.
   *
   * @param options The format options.
   * @param message The message.
   * @returns The ARC-Authentication-Results, or `null` to not sign the message.
   */
  protected abstract generateArcAuthenticationResults(options: FormatOptions, message: MimeMessage): Promise<AuthenticationResults | null>;

  /**
   * Get the timestamp to use as the `t=` value in the ARC headers.
   *
   * @returns The Unix timestamp in seconds.
   */
  protected getTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  private async generateArcMessageSignature(options: FormatOptions, message: MimeMessage, instance: number, t: number, headers: readonly string[]): Promise<Header> {
    let builder = appendInstanceAndSignatureAlgorithm(instance, this.signatureAlgorithm);

    builder += `; d=${this.domain}`;
    builder += `; s=${this.selector}`;
    builder += `; c=${canonicalizationTag(this.headerCanonicalizationAlgorithm)}/${canonicalizationTag(this.bodyCanonicalizationAlgorithm)}`;
    builder += `; t=${t}`;

    const stream = new DkimSignatureStream(this.createSigningContext());
    const filtered = new FilteredStream(stream);
    filtered.add(options.createNewLineFilter(false));

    // write the specified message headers
    DkimVerifierBase.writeHeaders(options, message, headers, this.headerCanonicalizationAlgorithm, filtered);

    builder += `; h=${headers.join(':')}`;

    const hash = hashBody(message, options, this.signatureAlgorithm, this.bodyCanonicalizationAlgorithm, -1);
    builder += `; bh=${bytesToBase64(hash)}`;
    builder += '; b=';

    const ams = new Header(HeaderId.ArcMessageSignature, builder);

    if (this.headerCanonicalizationAlgorithm === DkimCanonicalizationAlgorithm.Relaxed) {
      DkimVerifierBase.writeHeaderRelaxed(options, filtered, ams, true);
    } else {
      DkimVerifierBase.writeHeaderSimple(options, filtered, ams, true);
    }

    filtered.flush();

    const signature = await stream.generateSignature();

    ams.value = ams.value + bytesToBase64(signature);

    return ams;
  }

  private async generateArcSeal(options: FormatOptions, instance: number, cv: string, t: number, sets: (ArcHeaderSet | null)[], count: number, aar: Header, ams: Header): Promise<Header> {
    let builder = appendInstanceAndSignatureAlgorithm(instance, this.signatureAlgorithm);

    builder += `; cv=${cv}`;
    builder += `; d=${this.domain}`;
    builder += `; s=${this.selector}`;
    builder += `; t=${t}`;

    const stream = new DkimSignatureStream(this.createSigningContext());
    const filtered = new FilteredStream(stream);
    filtered.add(options.createNewLineFilter(false));

    for (let i = 0; i < count; i++) {
      DkimVerifierBase.writeHeaderRelaxed(options, filtered, sets[i]!.arcAuthenticationResult!, false);
      DkimVerifierBase.writeHeaderRelaxed(options, filtered, sets[i]!.arcMessageSignature!, false);
      DkimVerifierBase.writeHeaderRelaxed(options, filtered, sets[i]!.arcSeal!, false);
    }

    DkimVerifierBase.writeHeaderRelaxed(options, filtered, aar, false);
    DkimVerifierBase.writeHeaderRelaxed(options, filtered, ams, false);

    builder += '; b=';

    const seal = new Header(HeaderId.ArcSeal, builder);
    DkimVerifierBase.writeHeaderRelaxed(options, filtered, seal, true);

    filtered.flush();

    const signature = await stream.generateSignature();

    seal.value = seal.value + bytesToBase64(signature);

    return seal;
  }

  private async arcSign(options: FormatOptions, message: MimeMessage, headers: string[]): Promise<void> {
    const { sets, count, errors } = ArcVerifier.getArcHeaderSets(message, true);
    const instance = count + 1;

    // do not sign if there is already a failed/invalid ARC-Seal.
    if (count > 0 && (errors & ArcValidationErrors.InvalidArcSealChainValidationValue) !== 0) return;

    options = options.clone();
    options.newLineFormat = 'dos';
    options.ensureNewLine = true;

    const authres = await this.generateArcAuthenticationResults(options, message);

    if (authres == null) return;

    authres.instance = instance;

    const aar = new Header(HeaderId.ArcAuthenticationResults, authres.toString());
    let cv = 'none';

    if (count > 0) {
      cv = 'pass';

      for (const methodres of authres.results) {
        if (methodres.method.toLowerCase() === 'arc') {
          // GetArcHeaderSets validated the cv value to be "none" or "pass".
          cv = methodres.result;
          break;
        }
      }
    }

    const t = this.getTimestamp();
    const ams = await this.generateArcMessageSignature(options, message, instance, t, headers);
    const seal = await this.generateArcSeal(options, instance, cv, t, sets, count, aar, ams);

    message.headers.insert(0, aar);
    message.headers.insert(0, ams);
    message.headers.insert(0, seal);
  }

  /**
   * Digitally sign and seal a message using ARC.
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

    const fields = normalizeSignedHeaders(headers, ARC_SHOULD_NOT_INCLUDE);

    return this.arcSign(options, message, fields);
  }
}
