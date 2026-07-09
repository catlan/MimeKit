// Port of MimeKit/Cryptography/DkimVerifierBase.cs.
//
// This file is the byte-exact core of the subsystem: the header
// canonicalization (`WriteHeaderRelaxed` / `WriteHeaderSimple` / `WriteHeaders`),
// the `b=`-stripping (`GetSignedSignatureHeader`), and the DKIM/ARC parameter
// parsing/validation all reproduce MimeKit branch-for-branch.

import { FormatOptions } from '../format-options.js';
import { Header } from '../header.js';
import { HeaderId, toHeaderName } from '../header-id.js';
import type { HeaderList } from '../header-list.js';
import type { MimeMessage } from '../mime-message.js';
import type { Stream } from '../io/stream.js';
import { FilteredStream } from '../io/filtered-stream.js';
import { isWhitespace } from '../utils/byte-extensions.js';
import { DkimCanonicalizationAlgorithm } from './dkim-canonicalization-algorithm.js';
import { DkimSignatureAlgorithm, signatureAlgorithmOrdinal, signatureAlgorithmTag } from './dkim-signature-algorithm.js';
import { DkimSignatureStream } from './dkim-signature-stream.js';
import { hashBody } from './hash-body.js';
import { createDigestSigner, bytesToBase64, type AsymmetricKey, type DigestSigner } from './crypto.js';
import { FormatException } from './errors.js';
import type { DkimPublicKeyLocator } from './dkim-public-key-locator.js';

const COLON = new Uint8Array([0x3a]);

function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

/** Common validated DKIM/ARC parameter tags. */
export interface CommonParameters {
  algorithm: DkimSignatureAlgorithm;
  d: string;
  s: string;
  q: string;
  b: string;
}

/** Common validated DKIM/ARC signature parameter tags. */
export interface CommonSignatureParameters {
  algorithm: DkimSignatureAlgorithm;
  headerAlgorithm: DkimCanonicalizationAlgorithm;
  bodyAlgorithm: DkimCanonicalizationAlgorithm;
  d: string;
  s: string;
  q: string;
  headers: string[];
  bh: string;
  b: string;
  maxLength: number;
}

/**
 * A base class for DKIM and ARC verifiers.
 */
export abstract class DkimVerifierBase {
  private enabledSignatureAlgorithms = 0;

  /** The minimum allowed RSA key length. */
  minimumRsaKeyLength: number;

  /** The public key locator. */
  protected readonly publicKeyLocator: DkimPublicKeyLocator;

  /**
   * Initialize a new instance of the verifier base.
   *
   * @param publicKeyLocator The public key locator.
   * @throws {TypeError} `publicKeyLocator` is null or undefined.
   */
  protected constructor(publicKeyLocator: DkimPublicKeyLocator) {
    if (publicKeyLocator == null) throw new TypeError('publicKeyLocator cannot be null or undefined');

    this.publicKeyLocator = publicKeyLocator;

    this.enable(DkimSignatureAlgorithm.Ed25519Sha256);
    this.enable(DkimSignatureAlgorithm.RsaSha256);
    this.minimumRsaKeyLength = 1024;
  }

  /**
   * Enable a DKIM signature algorithm.
   *
   * @param algorithm The DKIM signature algorithm.
   */
  enable(algorithm: DkimSignatureAlgorithm): void {
    this.enabledSignatureAlgorithms |= 1 << signatureAlgorithmOrdinal(algorithm);
  }

  /**
   * Disable a DKIM signature algorithm.
   *
   * @param algorithm The DKIM signature algorithm.
   */
  disable(algorithm: DkimSignatureAlgorithm): void {
    this.enabledSignatureAlgorithms &= ~(1 << signatureAlgorithmOrdinal(algorithm));
  }

  /**
   * Check whether a DKIM signature algorithm is enabled.
   *
   * @param algorithm The DKIM signature algorithm.
   * @returns `true` if the algorithm is enabled; otherwise, `false`.
   */
  isEnabled(algorithm: DkimSignatureAlgorithm): boolean {
    return (this.enabledSignatureAlgorithms & (1 << signatureAlgorithmOrdinal(algorithm))) !== 0;
  }

  /**
   * Parse the parameter tags of a DKIM/ARC header value.
   *
   * @param header The header identifier (for error messages).
   * @param signature The header value.
   * @returns A map of parameter names to values.
   * @throws {FormatException} The value is malformed.
   */
  static parseParameterTags(header: HeaderId, signature: string): Map<string, string> {
    const parameters = new Map<string, string>();
    let index = 0;

    while (index < signature.length) {
      while (index < signature.length && isSpaceOrTab(signature[index]!)) index++;

      if (index >= signature.length) break;

      if (signature[index] === ';' || !isAlpha(signature[index]!))
        throw new FormatException(`Malformed ${toHeaderName(header)} value.`);

      const startIndex = index++;

      while (index < signature.length && signature[index] !== '=') index++;

      if (index >= signature.length) continue;

      const name = signature.substring(startIndex, index).replace(/[ \t\r\n]+$/, '');

      // skip over '=' and clear value buffer
      let value = '';
      index++;

      while (index < signature.length && signature[index] !== ';') {
        if (!isSpaceOrTab(signature[index]!)) value += signature[index];
        index++;
      }

      if (parameters.has(name))
        throw new FormatException(`Malformed ${toHeaderName(header)} value: duplicate parameter '${name}'.`);

      parameters.set(name, value);

      // skip over ';'
      index++;
    }

    return parameters;
  }

  /**
   * Validate the common DKIM/ARC parameter tags.
   *
   * @param header The header name (for error messages).
   * @param parameters The parsed parameters.
   * @returns The validated common parameters.
   * @throws {FormatException} A required parameter is missing or malformed.
   */
  static validateCommonParameters(header: string, parameters: Map<string, string>): CommonParameters {
    const a = parameters.get('a');
    if (a === undefined) throw new FormatException(`Malformed ${header} header: no signature algorithm parameter detected.`);

    let algorithm: DkimSignatureAlgorithm;
    switch (a.toLowerCase()) {
    case 'ed25519-sha256': algorithm = DkimSignatureAlgorithm.Ed25519Sha256; break;
    case 'rsa-sha256': algorithm = DkimSignatureAlgorithm.RsaSha256; break;
    case 'rsa-sha1': algorithm = DkimSignatureAlgorithm.RsaSha1; break;
    default: throw new FormatException(`Unrecognized ${header} algorithm parameter: a=${a}`);
    }

    const d = parameters.get('d');
    if (d === undefined) throw new FormatException(`Malformed ${header} header: no domain parameter detected.`);
    if (d.length === 0) throw new FormatException(`Malformed ${header} header: empty domain parameter detected.`);

    const s = parameters.get('s');
    if (s === undefined) throw new FormatException(`Malformed ${header} header: no selector parameter detected.`);
    if (s.length === 0) throw new FormatException(`Malformed ${header} header: empty selector parameter detected.`);

    let q = parameters.get('q');
    if (q === undefined) q = 'dns/txt';

    const b = parameters.get('b');
    if (b === undefined) throw new FormatException(`Malformed ${header} header: no signature parameter detected.`);
    if (b.length === 0) throw new FormatException(`Malformed ${header} header: empty signature parameter detected.`);

    const t = parameters.get('t');
    if (t !== undefined) {
      if (!isNonNegativeInteger(t)) throw new FormatException(`Malformed ${header} header: invalid timestamp parameter: t=${t}.`);
    }

    return { algorithm, d, s, q, b };
  }

  /**
   * Validate the common DKIM/ARC signature parameter tags.
   *
   * @param header The header name (for error messages).
   * @param parameters The parsed parameters.
   * @returns The validated common signature parameters.
   * @throws {FormatException} A required parameter is missing or malformed.
   */
  static validateCommonSignatureParameters(header: string, parameters: Map<string, string>): CommonSignatureParameters {
    const common = DkimVerifierBase.validateCommonParameters(header, parameters);

    let maxLength: number;
    const l = parameters.get('l');
    if (l !== undefined) {
      if (!isNonNegativeInteger(l)) throw new FormatException(`Malformed ${header} header: invalid length parameter: l=${l}`);
      maxLength = parseInt(l, 10);
    } else {
      maxLength = -1;
    }

    let headerAlgorithm: DkimCanonicalizationAlgorithm;
    let bodyAlgorithm: DkimCanonicalizationAlgorithm;
    const c = parameters.get('c');
    if (c !== undefined) {
      const tokens = c.toLowerCase().split('/');

      if (tokens.length === 0 || tokens.length > 2)
        throw new FormatException(`Malformed ${header} header: invalid canonicalization parameter: c=${c}`);

      switch (tokens[0]) {
      case 'relaxed': headerAlgorithm = DkimCanonicalizationAlgorithm.Relaxed; break;
      case 'simple': headerAlgorithm = DkimCanonicalizationAlgorithm.Simple; break;
      default: throw new FormatException(`Malformed ${header} header: invalid canonicalization parameter: c=${c}`);
      }

      if (tokens.length === 2) {
        switch (tokens[1]) {
        case 'relaxed': bodyAlgorithm = DkimCanonicalizationAlgorithm.Relaxed; break;
        case 'simple': bodyAlgorithm = DkimCanonicalizationAlgorithm.Simple; break;
        default: throw new FormatException(`Malformed ${header} header: invalid canonicalization parameter: c=${c}`);
        }
      } else {
        bodyAlgorithm = DkimCanonicalizationAlgorithm.Simple;
      }
    } else {
      headerAlgorithm = DkimCanonicalizationAlgorithm.Simple;
      bodyAlgorithm = DkimCanonicalizationAlgorithm.Simple;
    }

    const h = parameters.get('h');
    if (h === undefined) throw new FormatException(`Malformed ${header} header: no signed header parameter detected.`);

    const headers = h.split(':');

    const bh = parameters.get('bh');
    if (bh === undefined) throw new FormatException(`Malformed ${header} header: no body hash parameter detected.`);

    return { algorithm: common.algorithm, headerAlgorithm, bodyAlgorithm, d: common.d, s: common.s, q: common.q, headers, bh, b: common.b, maxLength };
  }

  /**
   * Write a header using the DKIM relaxed header canonicalization.
   *
   * @param options The formatting options.
   * @param stream The output stream.
   * @param header The header to write.
   * @param isDkimSignature Whether this is the DKIM/ARC signature header.
   */
  static writeHeaderRelaxed(options: FormatOptions, stream: Stream, header: Header, isDkimSignature: boolean): void {
    // Convert the header field name (not the value) to lowercase.
    const name = asciiBytes(header.field.toLowerCase());
    const rawValue = header.getRawValue(options);
    let index = 0;

    // Delete WSP before/after the colon; retain the colon.
    stream.write(name, 0, name.length);
    stream.write(COLON, 0, 1);

    // trim leading whitespace...
    while (index < rawValue.length && isWhitespace(rawValue[index]!)) index++;

    while (index < rawValue.length) {
      let startIndex = index;

      // look for the first non-whitespace character
      while (index < rawValue.length && isWhitespace(rawValue[index]!)) index++;

      // Delete all WSP at the end of the unfolded value.
      if (index >= rawValue.length) break;

      // Convert sequences of WSP to a single SP.
      if (index > startIndex) stream.write(SPACE, 0, 1);

      startIndex = index;

      while (index < rawValue.length && !isWhitespace(rawValue[index]!)) index++;

      if (index > startIndex) stream.write(rawValue, startIndex, index - startIndex);
    }

    if (!isDkimSignature) stream.write(options.newLineBytes, 0, options.newLineBytes.length);
  }

  /**
   * Write a header using the DKIM simple header canonicalization.
   *
   * @param _options The formatting options (unused).
   * @param stream The output stream.
   * @param header The header to write.
   * @param isDkimSignature Whether this is the DKIM/ARC signature header.
   */
  static writeHeaderSimple(_options: FormatOptions, stream: Stream, header: Header, isDkimSignature: boolean): void {
    const rawValue = header.getRawValue(_options);
    let rawLength = rawValue.length;

    if (isDkimSignature && rawLength > 0) {
      if (rawValue[rawLength - 1] === 0x0a) {
        rawLength--;
        if (rawLength > 0 && rawValue[rawLength - 1] === 0x0d) rawLength--;
      }
    }

    stream.write(header.rawField, 0, header.rawField.length);
    stream.write(COLON, 0, COLON.length);
    stream.write(rawValue, 0, rawLength);
  }

  /**
   * Create the digest verifying context.
   *
   * @param algorithm The DKIM signature algorithm.
   * @param key The public (or private) key.
   * @returns The digest signer.
   */
  createVerifyContext(algorithm: DkimSignatureAlgorithm, key: AsymmetricKey): DigestSigner {
    return createDigestSigner(signatureAlgorithmTag(algorithm), key);
  }

  /**
   * Write the signed message headers to the stream (in DKIM signing order).
   *
   * @param options The formatting options.
   * @param message The message.
   * @param fields The header field names to sign.
   * @param headerCanonicalizationAlgorithm The header canonicalization algorithm.
   * @param stream The output stream.
   */
  static writeHeaders(options: FormatOptions, message: MimeMessage, fields: readonly string[], headerCanonicalizationAlgorithm: DkimCanonicalizationAlgorithm, stream: Stream): void {
    const counts = new Map<string, number>();

    for (let i = 0; i < fields.length; i++) {
      let headers: HeaderList;

      if (fields[i]!.toLowerCase().startsWith('content-')) {
        if (message.body == null) continue;
        headers = message.body.headers;
      } else {
        headers = message.headers;
      }

      const name = fields[i]!.toLowerCase();
      let n = 0;

      const count = counts.get(name) ?? 0;

      // Sign the physically last instance (and successive-from-bottom for duplicates).
      let index = headers.lastIndexOf(name);

      while (n < count && --index >= 0) {
        if (equalsIgnoreCase(headers.at(index).field, name)) n++;
      }

      if (index < 0) continue;

      const header = headers.at(index);

      if (headerCanonicalizationAlgorithm === DkimCanonicalizationAlgorithm.Relaxed) {
        DkimVerifierBase.writeHeaderRelaxed(options, stream, header, false);
      } else {
        DkimVerifierBase.writeHeaderSimple(options, stream, header, false);
      }

      counts.set(name, count + 1);
    }
  }

  /**
   * Get the signed DKIM/ARC signature header (with the `b=` value stripped).
   *
   * @param header The DKIM-Signature/ARC-* header.
   * @returns A new header whose value has the signature value removed.
   * @throws {FormatException} The signature parameter is missing.
   */
  static getSignedSignatureHeader(header: Header): Header {
    // chop off the signature value after "b="
    const rawValue = header.rawValue.slice();
    let length = 0;
    let index = 0;

    do {
      while (index < rawValue.length && isWhitespace(rawValue[index]!)) index++;

      if (index + 2 < rawValue.length) {
        const param = String.fromCharCode(rawValue[index++]!);

        while (index < rawValue.length && isWhitespace(rawValue[index]!)) index++;

        if (index < rawValue.length && rawValue[index] === 0x3d && param === 'b') {
          length = ++index;

          while (index < rawValue.length && rawValue[index] !== 0x3b) index++;

          if (index === rawValue.length && rawValue[index - 1] === 0x0a) {
            index--;
            if (rawValue[index - 1] === 0x0d) index--;
          }

          break;
        }
      }

      while (index < rawValue.length && rawValue[index] !== 0x3b) index++;

      if (index < rawValue.length) index++;
    } while (index < rawValue.length);

    if (index === rawValue.length)
      throw new FormatException(`Malformed ${toHeaderName(header.id)} header: missing signature parameter.`);

    while (index < rawValue.length) rawValue[length++] = rawValue[index++];

    const resized = rawValue.slice(0, length);

    return Header.fromRaw(header.options, header.id, header.field, resized, false, header.rawField);
  }

  /**
   * Verify the hash of the message body.
   *
   * @param options The formatting options.
   * @param message The signed MIME message.
   * @param signatureAlgorithm The signature algorithm.
   * @param canonicalizationAlgorithm The body canonicalization algorithm.
   * @param maxLength The max body length to hash, or `-1`.
   * @param bodyHash The expected base64 body hash.
   * @returns `true` if the computed body hash matches.
   */
  protected static verifyBodyHash(options: FormatOptions, message: MimeMessage, signatureAlgorithm: DkimSignatureAlgorithm, canonicalizationAlgorithm: DkimCanonicalizationAlgorithm, maxLength: number, bodyHash: string): boolean {
    const hash = bytesToBase64(hashBody(message, options, signatureAlgorithm, canonicalizationAlgorithm, maxLength));
    return hash === bodyHash;
  }

  /**
   * Verify the signature of the message headers.
   *
   * @param options The formatting options.
   * @param message The signed MIME message.
   * @param dkimSignature The DKIM-Signature or ARC-Message-Signature header.
   * @param signatureAlgorithm The signature algorithm.
   * @param key The public key.
   * @param headers The signed header field names.
   * @param canonicalizationAlgorithm The header canonicalization algorithm.
   * @param signature The expected base64 signature.
   * @returns `true` if the signature verifies.
   */
  protected async verifySignature(options: FormatOptions, message: MimeMessage, dkimSignature: Header, signatureAlgorithm: DkimSignatureAlgorithm, key: AsymmetricKey, headers: readonly string[], canonicalizationAlgorithm: DkimCanonicalizationAlgorithm, signature: string): Promise<boolean> {
    const stream = new DkimSignatureStream(this.createVerifyContext(signatureAlgorithm, key));
    const filtered = new FilteredStream(stream);
    filtered.add(options.createNewLineFilter(false));

    DkimVerifierBase.writeHeaders(options, message, headers, canonicalizationAlgorithm, filtered);

    // include the DKIM-Signature header being verified, but with "b=" stripped.
    const header = DkimVerifierBase.getSignedSignatureHeader(dkimSignature);

    if (canonicalizationAlgorithm === DkimCanonicalizationAlgorithm.Relaxed) {
      DkimVerifierBase.writeHeaderRelaxed(options, filtered, header, true);
    } else {
      DkimVerifierBase.writeHeaderSimple(options, filtered, header, true);
    }

    filtered.flush();

    return stream.verifySignature(signature);
  }
}

const SPACE = new Uint8Array([0x20]);

function isSpaceOrTab(c: string): boolean {
  return c === ' ' || c === '\t';
}

function isAlpha(c: string): boolean {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}

function isNonNegativeInteger(s: string): boolean {
  // C#: int.TryParse with NumberStyles.None (digits only, no sign/whitespace).
  return s.length > 0 && /^[0-9]+$/.test(s) && Number(s) <= 2147483647;
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
