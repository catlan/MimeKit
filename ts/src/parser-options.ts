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

export type RfcComplianceMode = 'looser' | 'loose' | 'strict';

export class ParserOptions {
  /** The default parser options (C#: ParserOptions.Default). */
  static readonly default: ParserOptions = new ParserOptions();

  addressParserComplianceMode: RfcComplianceMode = 'loose';
  allowUnquotedCommasInAddresses = true;
  allowAddressesWithoutDomain = true;
  maxAddressGroupDepth = 3;
  maxMimeDepth = 1024;
  parameterComplianceMode: RfcComplianceMode = 'loose';
  rfc2047ComplianceMode: RfcComplianceMode = 'loose';
  respectContentLength = false;
  charsetEncoding: CharsetEncoding = utf8;

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
