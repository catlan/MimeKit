/**
 * Port of MimeKit/ParserOptions.cs (partial) + MimeKit/RfcComplianceMode.cs.
 *
 * The custom-MimeType registration table (RegisterMimeType / CreateEntity —
 * reflection over entity constructors) is deferred to wave 3 with the
 * message model; this file carries the option properties the header/parser
 * layers consume.
 */
import type { CharsetEncoding } from './utils/charset-utils.js';
import { utf8 } from './utils/charset-utils.js';

/**
 * RFC compliance mode used by lenient MIME and address parsers.
 */
export type RfcComplianceMode = 'looser' | 'loose' | 'strict';

/**
 * Parser options used by MimeParser and parse-style helper methods.
 *
 * Allows callers to change or override the default parsing behavior used
 * throughout the MIME parser.
 */
export class ParserOptions {
  /**
   * The default parser options.
   *
   * If custom options are not supplied to parsers or parse methods, these
   * options are used.
   */
  static readonly default: ParserOptions = new ParserOptions();

  /**
   * Compliance mode used when parsing RFC 822 addresses.
   */
  addressParserComplianceMode: RfcComplianceMode = 'loose';
  /**
   * Whether the address parser should ignore unquoted commas in display names.
   */
  allowUnquotedCommasInAddresses = true;
  /**
   * Whether mailbox addresses without an `@domain` component are accepted.
   */
  allowAddressesWithoutDomain = true;
  /**
   * Maximum recursive RFC 822 group-address depth the parser accepts.
   */
  maxAddressGroupDepth = 3;
  /**
   * Maximum recursive MIME part depth the parser accepts.
   */
  maxMimeDepth = 1024;
  /**
   * Compliance mode used when parsing Content-Type and Content-Disposition
   * parameters.
   */
  parameterComplianceMode: RfcComplianceMode = 'loose';
  /**
   * Compliance mode used when decoding RFC 2047 encoded-words.
   */
  rfc2047ComplianceMode: RfcComplianceMode = 'loose';
  /**
   * Whether mbox Content-Length values should be respected while parsing.
   */
  respectContentLength = false;
  /**
   * Fallback charset encoding used for 8bit headers.
   */
  charsetEncoding: CharsetEncoding = utf8;

  /**
   * Clone these parser options.
   *
   * @returns An identical copy of the current instance.
   */
  clone(): ParserOptions {
    const options = new ParserOptions();
    options.addressParserComplianceMode = this.addressParserComplianceMode;
    options.allowUnquotedCommasInAddresses = this.allowUnquotedCommasInAddresses;
    options.allowAddressesWithoutDomain = this.allowAddressesWithoutDomain;
    options.maxAddressGroupDepth = this.maxAddressGroupDepth;
    options.maxMimeDepth = this.maxMimeDepth;
    options.parameterComplianceMode = this.parameterComplianceMode;
    options.rfc2047ComplianceMode = this.rfc2047ComplianceMode;
    options.respectContentLength = this.respectContentLength;
    options.charsetEncoding = this.charsetEncoding;
    return options;
  }
}
