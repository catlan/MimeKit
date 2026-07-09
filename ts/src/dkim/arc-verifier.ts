// Port of MimeKit/Cryptography/ArcVerifier.cs.

import { FormatOptions } from '../format-options.js';
import { Header } from '../header.js';
import { HeaderId, toHeaderName } from '../header-id.js';
import type { MimeMessage } from '../mime-message.js';
import { AuthenticationResults } from '../authentication-results.js';
import { FilteredStream } from '../io/filtered-stream.js';
import { DkimSignatureAlgorithm } from './dkim-signature-algorithm.js';
import { DkimCanonicalizationAlgorithm } from './dkim-canonicalization-algorithm.js';
import { DkimSignatureStream } from './dkim-signature-stream.js';
import { DkimVerifierBase, type CommonParameters, type CommonSignatureParameters } from './dkim-verifier-base.js';
import type { DkimPublicKeyLocator } from './dkim-public-key-locator.js';
import { FormatException } from './errors.js';

/** An ARC signature validation result. */
export enum ArcSignatureValidationResult {
  /** No signatures to validate. */
  None = 'None',
  /** The validation passed. */
  Pass = 'Pass',
  /** The validation failed. */
  Fail = 'Fail',
}

/** An enumeration of possible ARC validation errors (bit flags). */
export enum ArcValidationErrors {
  /** No errors. */
  None = 0,
  /** One or more duplicate ARC-Authentication-Results headers exist. */
  DuplicateArcAuthenticationResults = 1 << 0,
  /** One or more duplicate ARC-Message-Signature headers exist. */
  DuplicateArcMessageSignature = 1 << 1,
  /** One or more duplicate ARC-Seal headers exist. */
  DuplicateArcSeal = 1 << 2,
  /** One or more ARC-Authentication-Results headers are missing. */
  MissingArcAuthenticationResults = 1 << 3,
  /** One or more ARC-Message-Signature headers are missing. */
  MissingArcMessageSignature = 1 << 4,
  /** One or more ARC-Seal headers are missing. */
  MissingArcSeal = 1 << 5,
  /** One or more ARC-Authentication-Results headers could not be parsed. */
  InvalidArcAuthenticationResults = 1 << 6,
  /** One or more ARC-Message-Signature headers could not be parsed. */
  InvalidArcMessageSignature = 1 << 7,
  /** One or more ARC-Seal headers could not be parsed. */
  InvalidArcSeal = 1 << 8,
  /** One or more ARC-Seal headers have an invalid `cv` value. */
  InvalidArcSealChainValidationValue = 1 << 9,
  /** One or more ARC-Seal headers are missing a `cv` value. */
  MissingArcSealChainValidationValue = 1 << 10,
  /** Validation failed for the most recent ARC-Message-Signature header. */
  MessageSignatureValidationFailed = 1 << 11,
  /** Validation failed for one or more of the ARC-Seal headers. */
  SealValidationFailed = 1 << 12,
}

/** An ARC header validation result. */
export class ArcHeaderValidationResult {
  /** The signature validation result. */
  signature: ArcSignatureValidationResult = ArcSignatureValidationResult.None;

  /** The ARC header. */
  readonly header: Header;

  /**
   * Initialize a new instance of the ARC header validation result.
   *
   * @param header The ARC header.
   * @param signature The signature validation result.
   * @throws {TypeError} `header` is null or undefined.
   */
  constructor(header: Header, signature?: ArcSignatureValidationResult) {
    if (header == null) throw new TypeError('header cannot be null or undefined');
    this.header = header;
    if (signature !== undefined) this.signature = signature;
  }
}

/** An ARC validation result. */
export class ArcValidationResult {
  /** The validation results for the ARC-Message-Signature header. */
  messageSignature: ArcHeaderValidationResult | null = null;

  /** The validation results for each of the ARC-Seal headers. */
  seals: ArcHeaderValidationResult[] | null = null;

  /** The signature validation results of the entire chain. */
  chain: ArcSignatureValidationResult = ArcSignatureValidationResult.None;

  /** The chain validation errors. */
  chainErrors: ArcValidationErrors = ArcValidationErrors.None;

  /**
   * Initialize a new instance of the ARC validation result.
   *
   * @param chain The signature validation results of the entire chain.
   * @param messageSignature The validation results for the ARC-Message-Signature header.
   * @param seals The validation results for the ARC-Seal headers.
   */
  constructor(chain?: ArcSignatureValidationResult, messageSignature?: ArcHeaderValidationResult, seals?: ArcHeaderValidationResult[]) {
    if (chain !== undefined) this.chain = chain;
    if (messageSignature !== undefined) this.messageSignature = messageSignature;
    if (seals !== undefined) this.seals = seals;
  }
}

/** @internal An ARC header set (AAR + AMS + AS for one instance). */
export class ArcHeaderSet {
  arcAuthenticationResult: Header | null = null;
  arcMessageSignatureParameters: Map<string, string> | null = null;
  arcMessageSignature: Header | null = null;
  arcSealParameters: Map<string, string> | null = null;
  arcSeal: Header | null = null;

  add(header: Header, parameters: Map<string, string> | null): boolean {
    switch (header.id) {
    case HeaderId.ArcAuthenticationResults:
      if (this.arcAuthenticationResult != null) return false;
      this.arcAuthenticationResult = header;
      break;
    case HeaderId.ArcMessageSignature:
      if (this.arcMessageSignature != null) return false;
      this.arcMessageSignatureParameters = parameters;
      this.arcMessageSignature = header;
      break;
    case HeaderId.ArcSeal:
      if (this.arcSeal != null) return false;
      this.arcSealParameters = parameters;
      this.arcSeal = header;
      break;
    default:
      return false;
    }
    return true;
  }
}

/** The result of {@link ArcVerifier.getArcHeaderSets}. */
export interface ArcHeaderSetsResult {
  result: ArcSignatureValidationResult;
  sets: (ArcHeaderSet | null)[];
  count: number;
  errors: ArcValidationErrors;
}

/**
 * An ARC verifier. Validates Authenticated Received Chains.
 */
export class ArcVerifier extends DkimVerifierBase {
  /**
   * Initialize a new instance of the ARC verifier.
   *
   * @param publicKeyLocator The public key locator.
   * @throws {TypeError} `publicKeyLocator` is null or undefined.
   */
  constructor(publicKeyLocator: DkimPublicKeyLocator) {
    super(publicKeyLocator);
  }

  private static validateArcMessageSignatureParameters(parameters: Map<string, string>): CommonSignatureParameters {
    return DkimVerifierBase.validateCommonSignatureParameters('ARC-Message-Signature', parameters);
  }

  private static validateArcSealParameters(parameters: Map<string, string>): CommonParameters {
    const result = DkimVerifierBase.validateCommonParameters('ARC-Seal', parameters);
    if (parameters.has('h')) throw new FormatException("Malformed ARC-Seal header: the 'h' parameter tag is not allowed.");
    return result;
  }

  private async verifyArcMessageSignature(options: FormatOptions, message: MimeMessage, arcSignature: Header, parameters: Map<string, string>): Promise<boolean> {
    const params = ArcVerifier.validateArcMessageSignatureParameters(parameters);

    if (!this.isEnabled(params.algorithm)) return false;

    options = options.clone();
    options.newLineFormat = 'dos';

    // first check the body hash (if that's invalid, the entire signature is invalid)
    if (!ArcVerifier.verifyBodyHash(options, message, params.algorithm, params.bodyAlgorithm, params.maxLength, params.bh))
      return false;

    const key = await this.publicKeyLocator.locatePublicKey(params.q, params.d, params.s);

    if (key.kind === 'rsa' && key.bitLength < this.minimumRsaKeyLength) return false;

    return this.verifySignature(options, message, arcSignature, params.algorithm, key, params.headers, params.headerAlgorithm, params.b);
  }

  private async verifyArcSeal(options: FormatOptions, sets: (ArcHeaderSet | null)[], i: number): Promise<boolean> {
    const params = ArcVerifier.validateArcSealParameters(sets[i]!.arcSealParameters!);

    if (!this.isEnabled(params.algorithm)) return false;

    const key = await this.publicKeyLocator.locatePublicKey(params.q, params.d, params.s);

    if (key.kind === 'rsa' && key.bitLength < this.minimumRsaKeyLength) return false;

    options = options.clone();
    options.newLineFormat = 'dos';

    const stream = new DkimSignatureStream(this.createVerifyContext(params.algorithm, key));
    const filtered = new FilteredStream(stream);
    filtered.add(options.createNewLineFilter(false));

    for (let j = 0; j < i; j++) {
      DkimVerifierBase.writeHeaderRelaxed(options, filtered, sets[j]!.arcAuthenticationResult!, false);
      DkimVerifierBase.writeHeaderRelaxed(options, filtered, sets[j]!.arcMessageSignature!, false);
      DkimVerifierBase.writeHeaderRelaxed(options, filtered, sets[j]!.arcSeal!, false);
    }

    DkimVerifierBase.writeHeaderRelaxed(options, filtered, sets[i]!.arcAuthenticationResult!, false);
    DkimVerifierBase.writeHeaderRelaxed(options, filtered, sets[i]!.arcMessageSignature!, false);

    // include the ARC-Seal header being verified, but with "b=" stripped.
    const seal = DkimVerifierBase.getSignedSignatureHeader(sets[i]!.arcSeal!);

    DkimVerifierBase.writeHeaderRelaxed(options, filtered, seal, true);

    filtered.flush();

    return stream.verifySignature(params.b);
  }

  /**
   * Collect and validate the ARC header sets on a message.
   *
   * @param message The message.
   * @param throwOnError Whether to throw on the first malformed header.
   * @returns The header sets, their count, and any accumulated errors.
   * @throws {FormatException} `throwOnError` is set and a header is malformed.
   */
  static getArcHeaderSets(message: MimeMessage, throwOnError: boolean): ArcHeaderSetsResult {
    let errors = ArcValidationErrors.None;
    const sets: (ArcHeaderSet | null)[] = new Array<ArcHeaderSet | null>(50).fill(null);
    let count = 0;

    for (let i = 0; i < message.headers.count; i++) {
      let parameters: Map<string, string> | null = null;
      const header = message.headers.at(i);
      let instance = 0;

      switch (header.id) {
      case HeaderId.ArcAuthenticationResults: {
        const parsed = AuthenticationResults.tryParse(header.rawValue);
        if (!parsed.ok) {
          if (throwOnError) throw new FormatException('Invalid ARC-Authentication-Results header.');
          errors |= ArcValidationErrors.InvalidArcAuthenticationResults;
          break;
        }

        const authres = parsed.value;
        if (authres.instance == null) {
          if (throwOnError) throw new FormatException('Missing instance tag in ARC-Authentication-Results header.');
          errors |= ArcValidationErrors.InvalidArcAuthenticationResults;
          break;
        }

        instance = authres.instance;

        if (instance < 1 || instance > 50) {
          if (throwOnError) throw new FormatException(`Invalid instance tag in ARC-Authentication-Results header: i=${instance}`);
          errors |= ArcValidationErrors.InvalidArcAuthenticationResults;
          instance = 0;
          break;
        }
        break;
      }
      case HeaderId.ArcMessageSignature:
      case HeaderId.ArcSeal: {
        try {
          parameters = DkimVerifierBase.parseParameterTags(header.id, header.value);
        } catch (ex) {
          if (throwOnError) throw ex;
          if (header.id === HeaderId.ArcMessageSignature) errors |= ArcValidationErrors.InvalidArcMessageSignature;
          else errors |= ArcValidationErrors.InvalidArcSeal;
          break;
        }

        const value = parameters.get('i');
        if (value === undefined) {
          if (throwOnError) throw new FormatException(`Missing instance tag in ${toHeaderName(header.id)} header.`);
          if (header.id === HeaderId.ArcMessageSignature) errors |= ArcValidationErrors.InvalidArcMessageSignature;
          else errors |= ArcValidationErrors.InvalidArcSeal;
          break;
        }

        if (!isInstanceTag(value)) {
          if (throwOnError) throw new FormatException(`Invalid instance tag in ${toHeaderName(header.id)} header: i=${value}`);
          if (header.id === HeaderId.ArcMessageSignature) errors |= ArcValidationErrors.InvalidArcMessageSignature;
          else errors |= ArcValidationErrors.InvalidArcSeal;
          instance = 0;
          break;
        }

        instance = parseInt(value, 10);
        break;
      }
      }

      if (instance === 0) continue;

      let set = sets[instance - 1];
      if (set == null) {
        set = new ArcHeaderSet();
        sets[instance - 1] = set;
      }

      if (!set.add(header, parameters)) {
        if (throwOnError) throw new FormatException(`Duplicate ${toHeaderName(header.id)} header for i=${instance}`);

        switch (header.id) {
        case HeaderId.ArcAuthenticationResults: errors |= ArcValidationErrors.DuplicateArcAuthenticationResults; break;
        case HeaderId.ArcMessageSignature: errors |= ArcValidationErrors.DuplicateArcMessageSignature; break;
        case HeaderId.ArcSeal: errors |= ArcValidationErrors.DuplicateArcSeal; break;
        }
      }

      if (instance > count) count = instance;
    }

    if (count === 0) {
      return { result: ArcSignatureValidationResult.None, sets, count, errors };
    }

    // verify that all ARC sets are complete
    for (let i = 0; i < count; i++) {
      const set = sets[i];

      if (set == null) {
        if (throwOnError) throw new FormatException(`Missing ARC headers for i=${i + 1}`);
        if ((errors & ArcValidationErrors.InvalidArcAuthenticationResults) === 0) errors |= ArcValidationErrors.MissingArcAuthenticationResults;
        if ((errors & ArcValidationErrors.InvalidArcMessageSignature) === 0) errors |= ArcValidationErrors.MissingArcMessageSignature;
        if ((errors & ArcValidationErrors.InvalidArcSeal) === 0) errors |= ArcValidationErrors.MissingArcSeal;
        continue;
      }

      if (set.arcAuthenticationResult == null) {
        if (throwOnError) throw new FormatException(`Missing ARC-Authentication-Results header for i=${i + 1}`);
        if ((errors & ArcValidationErrors.InvalidArcAuthenticationResults) === 0) errors |= ArcValidationErrors.MissingArcAuthenticationResults;
      }

      if (set.arcMessageSignature == null) {
        if (throwOnError) throw new FormatException(`Missing ARC-Message-Signature header for i=${i + 1}`);
        if ((errors & ArcValidationErrors.InvalidArcMessageSignature) === 0) errors |= ArcValidationErrors.MissingArcMessageSignature;
      }

      if (set.arcSeal == null) {
        if (throwOnError) throw new FormatException(`Missing ARC-Seal header for i=${i + 1}`);
        if ((errors & ArcValidationErrors.InvalidArcSeal) === 0) errors |= ArcValidationErrors.MissingArcSeal;
        continue;
      }

      const cv = set.arcSealParameters!.get('cv');
      if (cv === undefined) {
        if (throwOnError) throw new FormatException(`Missing chain validation tag in ARC-Seal header for i=${i + 1}.`);
        errors |= ArcValidationErrors.MissingArcSealChainValidationValue;
        continue;
      }

      // The "cv" value MUST NOT be "fail"; MUST be "none" for i=1, "pass" otherwise.
      if (cv !== (i === 0 ? 'none' : 'pass')) errors |= ArcValidationErrors.InvalidArcSealChainValidationValue;
    }

    return { result: errors === ArcValidationErrors.None ? ArcSignatureValidationResult.Pass : ArcSignatureValidationResult.Fail, sets, count, errors };
  }

  private async verifyImpl(options: FormatOptions, message: MimeMessage): Promise<ArcValidationResult> {
    const ArcSealCvParamErrors = ArcValidationErrors.InvalidArcSealChainValidationValue | ArcValidationErrors.MissingArcSealChainValidationValue;

    if (options == null) throw new TypeError('options cannot be null or undefined');
    if (message == null) throw new TypeError('message cannot be null or undefined');

    const result = new ArcValidationResult();

    const { result: headerResult, sets, count, errors } = ArcVerifier.getArcHeaderSets(message, false);

    switch (headerResult) {
    case ArcSignatureValidationResult.None:
      return result;
    case ArcSignatureValidationResult.Fail:
      result.chain = ArcSignatureValidationResult.Fail;
      result.chainErrors = errors;
      // If the only error(s) are invalid/missing 'cv' values, ignore for now.
      if ((errors & ~ArcSealCvParamErrors) === 0) break;
      return result;
    default:
      result.chain = ArcSignatureValidationResult.Pass;
      break;
    }

    const newest = count - 1;

    result.seals = new Array<ArcHeaderValidationResult>(count);

    const parameters = sets[newest]!.arcMessageSignatureParameters;
    const header = sets[newest]!.arcMessageSignature;

    result.messageSignature = new ArcHeaderValidationResult(header!);

    // validate the most recent Arc-Message-Signature
    try {
      if (await this.verifyArcMessageSignature(options, message, header!, parameters!)) {
        result.messageSignature.signature = ArcSignatureValidationResult.Pass;
      } else {
        result.messageSignature.signature = ArcSignatureValidationResult.Fail;
        result.chainErrors |= ArcValidationErrors.MessageSignatureValidationFailed;
        result.chain = ArcSignatureValidationResult.Fail;
      }
    } catch {
      result.messageSignature.signature = ArcSignatureValidationResult.Fail;
      result.chainErrors |= ArcValidationErrors.MessageSignatureValidationFailed;
      result.chain = ArcSignatureValidationResult.Fail;
    }

    // validate all Arc-Seals from the most recent to the oldest
    for (let i = newest; i >= 0; i--) {
      result.seals[i] = new ArcHeaderValidationResult(sets[i]!.arcSeal!);

      try {
        if (await this.verifyArcSeal(options, sets, i)) {
          result.seals[i]!.signature = ArcSignatureValidationResult.Pass;
        } else {
          result.seals[i]!.signature = ArcSignatureValidationResult.Fail;
          result.chainErrors |= ArcValidationErrors.SealValidationFailed;
          result.chain = ArcSignatureValidationResult.Fail;
        }
      } catch {
        result.seals[i]!.signature = ArcSignatureValidationResult.Fail;
        result.chainErrors |= ArcValidationErrors.SealValidationFailed;
        result.chain = ArcSignatureValidationResult.Fail;
      }
    }

    return result;
  }

  /**
   * Verify the ARC signature chain.
   *
   * @param a The formatting options, or the message.
   * @param b The message (when options are supplied).
   * @returns The ARC validation result.
   * @throws {TypeError} A required argument is null.
   */
  verify(options: FormatOptions, message: MimeMessage): Promise<ArcValidationResult>;
  verify(message: MimeMessage): Promise<ArcValidationResult>;
  async verify(a: FormatOptions | MimeMessage, b?: MimeMessage): Promise<ArcValidationResult> {
    const options = a instanceof FormatOptions ? a : FormatOptions.default;
    const message = (a instanceof FormatOptions ? b : a) as MimeMessage;

    if (options == null) throw new TypeError('options cannot be null or undefined');
    if (message == null) throw new TypeError('message cannot be null or undefined');

    return this.verifyImpl(options, message);
  }
}

function isInstanceTag(value: string): boolean {
  if (!/^[0-9]+$/.test(value)) return false;
  const n = Number(value);
  return n >= 1 && n <= 50;
}
