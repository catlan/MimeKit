import { FormatOptions } from './format-options.js';
import { ParserOptions, type RfcComplianceMode } from './parser-options.js';
import { err, mimeError, ok, type MimeError, type Result } from './result.js';
import { DomainList } from './domain-list.js';
import { punycodeDefault } from './encodings/punycode.js';
import { getEncodingForCodePage, type CharsetEncoding } from './utils/charset-utils.js';
import { decodePhrase, decodePhraseWithCodePage } from './utils/rfc2047.js';
import { quote, unquote } from './utils/mime-utils.js';
import {
  isSentinel,
  skipAtom,
  skipComment,
  skipCommentsAndWhiteSpace,
  skipPhraseAtom,
  skipQuoted as skipQuotedLoose,
  skipWhiteSpace,
  skipWord,
  tryParseDomain,
  isIdnEncoded,
  type ParseCursor,
} from './utils/parse-utils.js';
import { isAtom, isBlank, isWhitespace } from './utils/byte-extensions.js';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const latin1Decoder = new TextDecoder('iso-8859-1');
const ATOM_SPECIALS = '()<>@,;:\\".[]';
const COMMA_GREATER_THAN_OR_SEMI_COLON = new Uint8Array([0x2c, 0x3e, 0x3b]);

/** Flags that control internet address parsing. */
export const enum AddressParserFlags {
  /** No address parser flags. */
  None = 0,
  /** Allow parsing mailbox addresses. */
  AllowMailboxAddress = 1 << 0,
  /** Allow parsing group addresses. */
  AllowGroupAddress = 1 << 1,
  /** Return parse errors for malformed input. */
  ThrowOnError = 1 << 2,
  /** Internal parser mode. */
  Internal = 1 << 3,
  /** Flags used for try-parse operations. */
  TryParse = AllowMailboxAddress | AllowGroupAddress,
  /** Flags used for parse operations. */
  Parse = TryParse | ThrowOnError,
}

/** Parsed mailbox address-spec data. */
export interface ParsedAddressSpec {
  /** The parsed address-spec. */
  addrspec: string;
  /** The index of the `@` separator. */
  at: number;
}

/** Constructors used by the shared address parser to create concrete address types. */
export interface AddressConstructors {
  /** Constructor for mailbox addresses. */
  mailbox: new (name: string | null | undefined, address: string, route?: Iterable<string>, at?: number) => InternetAddress;
  /** Constructor for group addresses. */
  group: new (name: string | null | undefined, members?: Iterable<InternetAddress>) => InternetAddress;
}

let constructors: AddressConstructors | null = null;

/** Registers concrete internet address constructors for the parser. */
export function registerAddressConstructors(value: AddressConstructors): void {
  constructors = value;
}

function makeMailbox(name: string | null | undefined, address: string, route?: DomainList, at?: number): InternetAddress {
  if (constructors === null) throw new Error('address constructors not registered');
  return new constructors.mailbox(name, address, route, at);
}

function makeGroup(name: string | null | undefined, members?: Iterable<InternetAddress>): InternetAddress {
  if (constructors === null) throw new Error('address constructors not registered');
  return new constructors.group(name, members);
}

/**
 * Base class for internet addresses.
 */
export abstract class InternetAddress {
  /** Invoked when the address changes. */
  onChanged: (() => void) | null = null;
  private _name: string | null;
  /** The charset used when encoding the display name. */
  encoding: string | CharsetEncoding = 'utf-8';

  protected constructor(name?: string | null) {
    this._name = name ?? null;
  }

  /** The display name for the address, if available. */
  get name(): string | null {
    return this._name;
  }

  set name(value: string | null) {
    if (value === this._name) return;
    this._name = value;
    this.changed();
  }

  /** Clones this internet address. */
  abstract clone(): InternetAddress;
  /** Determines whether this address equals another address. */
  abstract equals(other: InternetAddress | null | undefined): boolean;
  /** Encodes this address. */
  abstract encode(options: FormatOptions, firstToken: boolean, state: LineState): string;
  /** Serializes this address. */
  abstract toString(options?: FormatOptions, encode?: boolean): string;

  /** Compares this address with another address. */
  compareTo(other: InternetAddress): number {
    if (other == null) throw new TypeError('other cannot be null');
    const nameCompare = compareIgnoreCase(this.name ?? '', other.name ?? '');
    if (nameCompare !== 0) return nameCompare;

    if (isMailboxLike(this) && isMailboxLike(other)) {
      const address = this.address;
      const otherAddress = other.address;
      const at = address.indexOf('@');
      const otherAt = otherAddress.indexOf('@');
      let rv = 0;

      if (at !== -1 && otherAt !== -1) {
        const length = Math.min(address.length - (at + 1), otherAddress.length - (otherAt + 1));
        rv = compareIgnoreCase(address.slice(at + 1), otherAddress.slice(otherAt + 1), length, false);
      }

      if (rv === 0) {
        const local = at === -1 ? address : address.slice(0, at);
        const otherLocal = otherAt === -1 ? otherAddress : otherAddress.slice(0, otherAt);
        const length = Math.min(local.length, otherLocal.length);
        rv = compareIgnoreCase(local, otherLocal, length);
        if (rv === 0)
          rv = local.length - otherLocal.length;
      }

      return rv;
    }

    if (isMailboxLike(this) && !isMailboxLike(other)) return -1;
    if (!isMailboxLike(this) && isMailboxLike(other)) return 1;
    return 0;
  }

  protected changed(): void {
    this.onChanged?.();
  }

  /** Encodes an internationalized display-name phrase when quoting is required. */
  static encodeInternationalizedPhrase(phrase: string): string {
    for (let i = 0; i < phrase.length; i++) {
      if (ATOM_SPECIALS.includes(phrase[i]!))
        return quote(phrase);
    }
    return phrase;
  }

  /**
   * Parses an internet address.
   *
   * @param text The text to parse.
   * @param options The parser options.
   * @returns A {@link Result}; `{ ok: false }` with a `MimeError` on malformed input.
   */
  static parse(text: string | Uint8Array, options: ParserOptions = ParserOptions.default): Result<InternetAddress> {
    const buffer = typeof text === 'string' ? utf8Encoder.encode(text) : text;
    const cursor = { index: 0 };
    const parsed = tryParseAddress(AddressParserFlags.Parse, options, buffer, cursor, buffer.length, 0);
    if (!parsed.ok) return parsed;
    const skip = skipCommentsAndWhiteSpace(buffer, cursor, buffer.length);
    if (!skip.ok) return err(skip.error);
    if (cursor.index !== buffer.length)
      return err('unexpected-token', `Unexpected token at offset ${cursor.index}`, { offset: cursor.index });
    return ok(parsed.value);
  }

  /**
   * Attempts to parse an internet address from a byte range.
   *
   * @returns A {@link Result}; `{ ok: false }` with a `MimeError` on malformed input.
   */
  static tryParseInternal(
    flags: AddressParserFlags,
    options: ParserOptions,
    text: Uint8Array,
    cursor: ParseCursor,
    endIndex: number,
    groupDepth: number,
  ): Result<InternetAddress> {
    return tryParseAddress(flags, options, text, cursor, endIndex, groupDepth);
  }
}

/** Tracks the current encoded line length. */
export interface LineState {
  /** The current encoded line length. */
  lineLength: number;
}

/** Appends address text, folding before it when necessary. */
export function appendAddressFold(options: FormatOptions, text: string, firstToken: boolean, state: LineState): string {
  if (!firstToken && state.lineLength + text.length > options.maxLineLength) {
    state.lineLength = 1 + text.length;
    return `${options.newLine}\t${text}`;
  }
  state.lineLength += text.length;
  return text;
}

/** Appends a line break suitable for continued address output. */
export function lineWrap(options: FormatOptions, text: string): string {
  if (text.length === 0)
    return `${options.newLine}\t`;

  if (isCharWhiteSpace(text.charCodeAt(text.length - 1)))
    return `${text.slice(0, -1)}${options.newLine}${text.slice(-1)}`;

  return `${text}${options.newLine}\t`;
}

/** Appends a phrase value with folding. */
export function appendFolded(options: FormatOptions, text: string, firstToken: boolean, value: string, state: LineState): string {
  let output = text;
  let wordIndex = 0;

  while (wordIndex < value.length) {
    let lwspIndex = wordIndex;

    if (value.charCodeAt(wordIndex) === 0x22) {
      lwspIndex++;

      while (lwspIndex < value.length && value.charCodeAt(lwspIndex) !== 0x22) {
        if (value.charCodeAt(lwspIndex) === 0x5c) {
          lwspIndex++;
          if (lwspIndex < value.length)
            lwspIndex++;
        } else {
          lwspIndex++;
        }
      }

      if (lwspIndex < value.length)
        lwspIndex++;
    } else {
      while (lwspIndex < value.length && !isCharWhiteSpace(value.charCodeAt(lwspIndex)))
        lwspIndex++;
    }

    const length = lwspIndex - wordIndex;
    if (!firstToken && state.lineLength > 1 && state.lineLength + length > options.maxLineLength) {
      output = lineWrap(options, output);
      state.lineLength = 1;
    }

    output += value.slice(wordIndex, lwspIndex);
    state.lineLength += length;
    firstToken = false;

    wordIndex = lwspIndex;
    while (wordIndex < value.length && isCharWhiteSpace(value.charCodeAt(wordIndex)))
      wordIndex++;

    if (wordIndex < value.length && wordIndex > lwspIndex) {
      output += ' ';
      state.lineLength++;
    }
  }

  return output;
}

export function tryParseAddrspec(
  text: Uint8Array,
  cursor: ParseCursor,
  endIndex: number,
  sentinels: Uint8Array,
  compliance: RfcComplianceMode,
): Result<ParsedAddressSpec> {
  const startIndex = cursor.index;
  const local = tryParseLocalPart(text, cursor, endIndex, compliance, true);
  if (!local.ok) return local;

  if (cursor.index >= endIndex || isSentinel(text[cursor.index]!, sentinels))
    return ok({ addrspec: local.value, at: -1 });

  if (text[cursor.index] !== 0x40)
    return err('invalid-addr-spec', `Invalid addr-spec token at offset ${startIndex}`, { offset: cursor.index });

  cursor.index++;
  if (cursor.index >= endIndex)
    return err('incomplete-addr-spec', `Incomplete addr-spec token at offset ${startIndex}`, { offset: cursor.index });

  const skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
  if (!skip.ok) return err(skip.error);

  if (cursor.index >= endIndex)
    return err('incomplete-addr-spec', `Incomplete addr-spec token at offset ${startIndex}`, { offset: cursor.index });

  const domain = tryParseDomain(text, cursor, endIndex, sentinels);
  if (!domain.ok) return err(domain.error);
  const decodedDomain = isIdnEncoded(domain.value) ? punycodeDefault.decode(domain.value) : domain.value;
  return ok({ addrspec: `${local.value}@${decodedDomain}`, at: local.value.length });
}

function tryParseLocalPart(
  text: Uint8Array,
  cursor: ParseCursor,
  endIndex: number,
  compliance: RfcComplianceMode,
  skipTrailingCfws: boolean,
): Result<string> {
  const token: string[] = [];
  const startIndex = cursor.index;

  do {
    let escapedAt = false;
    const start = cursor.index;

    if (text[cursor.index] === 0x22) {
      const quoted = skipAddressQuoted(text, cursor, endIndex);
      if (!quoted.ok) return err(quoted.error);
    } else if (isAtom(text[cursor.index]!)) {
      if (!skipAtom(text, cursor, endIndex))
        return err('invalid-local-part', `Invalid local-part at offset ${startIndex}`, { offset: cursor.index });

      if (compliance === 'looser') {
        while (cursor.index + 1 < endIndex && text[cursor.index] === 0x5c && text[cursor.index + 1] === 0x40) {
          escapedAt = true;
          cursor.index += 2;
          if (!skipAtom(text, cursor, endIndex)) break;
        }
      }
    } else {
      return err('invalid-local-part', `Invalid local-part at offset ${startIndex}`, { offset: cursor.index });
    }

    let word: string;
    try {
      word = utf8Decoder.decode(text.subarray(start, cursor.index));
    } catch {
      if (compliance === 'strict')
        return err('invalid-utf8', 'Internationalized local-part tokens may only contain UTF-8 characters.', { offset: start });
      word = latin1Decoder.decode(text.subarray(start, cursor.index));
    }

    if (escapedAt) word = word.replace(/\\@/g, '%40');
    token.push(word);

    const cfws = cursor.index;
    const skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skip.ok) return err(skip.error);

    if (cursor.index >= endIndex || text[cursor.index] !== 0x2e) {
      if (!skipTrailingCfws) cursor.index = cfws;
      break;
    }

    do {
      token.push('.');
      cursor.index++;

      const skipAfterDot = skipCommentsAndWhiteSpace(text, cursor, endIndex);
      if (!skipAfterDot.ok) return err(skipAfterDot.error);

      if (cursor.index >= endIndex)
        return err('incomplete-local-part', `Incomplete local-part at offset ${startIndex}`, { offset: cursor.index });
    } while (compliance === 'looser' && text[cursor.index] === 0x2e);

    if (compliance === 'looser' && (cursor.index >= endIndex || text[cursor.index] === 0x40))
      break;
  } while (true);

  return ok(token.join(''));
}

function skipAddressQuoted(text: Uint8Array, cursor: ParseCursor, endIndex: number): Result<true> {
  const startIndex = cursor.index;
  let escaped = false;
  cursor.index++;

  while (cursor.index < endIndex) {
    const c = text[cursor.index]!;
    if (c === 0x5c) {
      escaped = !escaped;
    } else if (!escaped) {
      if (c === 0x22) break;
      if ((c < 32 && c !== 9) || c === 127)
        return err('invalid-control-in-quoted-string', `Invalid control character in quoted-string token at offset ${startIndex}`, { offset: cursor.index });
    } else {
      if ((c < 32 && c !== 9) || c === 127)
        return err('invalid-quoted-pair', `Invalid quoted-pair in quoted-string token at offset ${startIndex}`, { offset: cursor.index });
      escaped = false;
    }
    cursor.index++;
  }

  if (cursor.index >= endIndex)
    return err('incomplete-quoted-string', `Incomplete quoted-string token at offset ${startIndex}`, { offset: cursor.index });

  cursor.index++;
  return ok(true);
}

function tryParseAddress(
  flags: AddressParserFlags,
  options: ParserOptions,
  text: Uint8Array,
  cursor: ParseCursor,
  endIndex: number,
  groupDepth: number,
): Result<InternetAddress> {
  const skipStart = skipCommentsAndWhiteSpace(text, cursor, endIndex);
  if (!skipStart.ok) return err(skipStart.error);

  if (cursor.index === endIndex)
    return err('no-address', 'No address found.', { offset: cursor.index });

  let trimLeadingQuote = false;
  const startIndex = cursor.index;
  let length = 0;
  let words = 0;

  while (cursor.index < endIndex) {
    const quoted = text[cursor.index] === 0x22;

    if (options.addressParserComplianceMode === 'strict') {
      const word = skipWord(text, cursor, endIndex);
      if (!word.ok) return err(word.error);
      if (!word.value) break;
    } else if (text[cursor.index] === 0x22) {
      const qstringIndex = cursor.index;
      const quotedResult = skipQuotedLoose(text, cursor, endIndex);
      if (!quotedResult.ok) {
        cursor.index = qstringIndex + 1;
        skipWhiteSpace(text, cursor, endIndex);
        if (!skipPhraseAtom(text, cursor, endIndex))
          break;
        if (startIndex === qstringIndex)
          trimLeadingQuote = true;
      }
    } else {
      if (!skipPhraseAtom(text, cursor, endIndex))
        break;
    }

    length = cursor.index - startIndex;

    do {
      const skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
      if (!skip.ok) return err(skip.error);
      if (cursor.index >= endIndex || text[cursor.index] !== 0x2e)
        break;
      cursor.index++;
      length = cursor.index - startIndex;
    } while (true);

    words++;

    if (options.allowUnquotedCommasInAddresses && cursor.index < endIndex && text[cursor.index] === 0x2c && !quoted) {
      cursor.index++;
      length = cursor.index - startIndex;
      const skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
      if (!skip.ok) return err(skip.error);
    }
  }

  const skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
  if (!skip.ok) return err(skip.error);

  if (cursor.index >= endIndex || text[cursor.index] === 0x2c || text[cursor.index] === 0x3e || text[cursor.index] === 0x3b) {
    const sentinel = cursor.index < endIndex ? text[cursor.index]! : 0x2c;
    if ((flags & AddressParserFlags.AllowMailboxAddress) === 0)
      return err('addr-spec-not-allowed', `Addr-spec token at offset ${startIndex}`, { offset: cursor.index });
    if (!options.allowAddressesWithoutDomain)
      return err('incomplete-addr-spec', `Incomplete addr-spec token at offset ${startIndex}`, { offset: cursor.index });

    cursor.index = startIndex;
    const addrspec = tryParseLocalPart(text, cursor, endIndex, options.addressParserComplianceMode, false);
    if (!addrspec.ok) return addrspec;

    skipWhiteSpace(text, cursor, endIndex);
    let name = '';
    if (cursor.index < endIndex && text[cursor.index] === 0x28) {
      const comment = cursor.index + 1;
      skipComment(text, cursor, endIndex);
      name = decodePhrase(options, text, comment, (cursor.index - 1) - comment).trim();
      const skipAfter = skipCommentsAndWhiteSpace(text, cursor, endIndex);
      if (!skipAfter.ok) return err(skipAfter.error);
    }

    if (cursor.index < endIndex && text[cursor.index] === 0x3e) {
      if (options.addressParserComplianceMode === 'strict')
        return err('unexpected-greater-than', `Unexpected '>' token at offset ${cursor.index}`, { offset: cursor.index });
      cursor.index++;
    }

    if (cursor.index < endIndex && text[cursor.index] !== sentinel)
      return err('unexpected-token', `Unexpected '${String.fromCharCode(text[cursor.index]!)}' token at offset ${cursor.index}`, { offset: cursor.index });

    return ok(makeMailbox(name, addrspec.value, undefined, -1));
  }

  if (text[cursor.index] === 0x3a) {
    if ((flags & AddressParserFlags.AllowGroupAddress) === 0)
      return err('group-address-not-allowed', `Group address token at offset ${startIndex}`, { offset: startIndex });
    if (groupDepth >= options.maxAddressGroupDepth)
      return err('max-address-group-depth', `Exceeded maximum rfc822 group depth at offset ${startIndex}`, { offset: startIndex });

    let nameIndex = startIndex;
    if (trimLeadingQuote) {
      nameIndex++;
      length--;
    }

    let name = '';
    let codepage = -1;
    if (length > 0) {
      const decoded = decodePhraseWithCodePage(options, text, nameIndex, length);
      name = decoded.value;
      codepage = decoded.codePage;
    }
    if (codepage === -1)
      codepage = 65001;

    return tryParseGroup(flags, options, text, startIndex, cursor, endIndex, groupDepth + 1, unquote(name, true), codepage);
  }

  if ((flags & AddressParserFlags.AllowMailboxAddress) === 0)
    return err('mailbox-address-not-allowed', `Mailbox address token at offset ${startIndex}`, { offset: startIndex });

  if (text[cursor.index] === 0x40 || (options.addressParserComplianceMode === 'looser' && cursor.index + 1 < endIndex && text[cursor.index] === 0x5c && text[cursor.index + 1] === 0x40)) {
    cursor.index = startIndex;
    const addrspec = tryParseAddrspec(text, cursor, endIndex, COMMA_GREATER_THAN_OR_SEMI_COLON, options.addressParserComplianceMode);
    if (!addrspec.ok) return addrspec;

    skipWhiteSpace(text, cursor, endIndex);
    let name = '';
    if (cursor.index < endIndex && text[cursor.index] === 0x28) {
      const comment = cursor.index;
      if (!skipComment(text, cursor, endIndex))
        return err('incomplete-comment', `Incomplete comment token at offset ${comment}`, { offset: cursor.index });
      name = decodePhrase(options, text, comment + 1, (cursor.index - 1) - (comment + 1)).trim();
    }

    const skipAfter = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skipAfter.ok) return err(skipAfter.error);

    if (cursor.index >= endIndex)
      return ok(makeMailbox(name, addrspec.value.addrspec, undefined, addrspec.value.at));

    if (text[cursor.index] === 0x3c) {
      if (options.addressParserComplianceMode === 'strict')
        return err('unexpected-less-than', `Unexpected '<' token at offset ${cursor.index}`, { offset: cursor.index });
      let nameEndIndex = cursor.index;
      while (nameEndIndex > startIndex && isWhitespace(text[nameEndIndex - 1]!))
        nameEndIndex--;
      length = nameEndIndex - startIndex;
    } else {
      if (text[cursor.index] === 0x3e) {
        if (options.addressParserComplianceMode === 'strict')
          return err('unexpected-greater-than', `Unexpected '>' token at offset ${cursor.index}`, { offset: cursor.index });
        cursor.index++;
      }
      return ok(makeMailbox(name, addrspec.value.addrspec, undefined, addrspec.value.at));
    }
  }

  if (text[cursor.index] === 0x3c) {
    let nameIndex = startIndex;
    if (trimLeadingQuote) {
      nameIndex++;
      length--;
    }

    let name = '';
    let codepage = -1;
    if (length > 0) {
      const unquoted = unquote(text, nameIndex, length, true);
      const decoded = decodePhraseWithCodePage(options, unquoted, 0, unquoted.length);
      name = decoded.value;
      codepage = decoded.codePage;
    }
    if (codepage === -1)
      codepage = 65001;

    return tryParseMailbox(options, text, startIndex, cursor, endIndex, name, codepage);
  }

  return err('invalid-address', `Invalid address token at offset ${startIndex}`, { offset: cursor.index });
}

function tryParseMailbox(
  options: ParserOptions,
  text: Uint8Array,
  startIndex: number,
  cursor: ParseCursor,
  endIndex: number,
  name: string,
  codepage = 65001,
): Result<InternetAddress> {
  let route: DomainList | undefined;
  cursor.index++;

  if (cursor.index < endIndex && text[cursor.index] === 0x3c) {
    if (options.addressParserComplianceMode === 'strict')
      return err('excessive-angle-brackets', `Excessive angle brackets at offset ${cursor.index}`, { offset: cursor.index });
    do {
      cursor.index++;
    } while (cursor.index < endIndex && text[cursor.index] === 0x3c);
  }

  const skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
  if (!skip.ok) return err(skip.error);

  if (cursor.index >= endIndex)
    return err('incomplete-mailbox', `Incomplete mailbox at offset ${startIndex}`, { offset: cursor.index });

  if (text[cursor.index] === 0x40) {
    const parsedRoute = DomainList.tryParseInternal(text, cursor, endIndex);
    if (!parsedRoute.ok)
      return err('invalid-route', `Invalid route in mailbox at offset ${startIndex}`, { offset: cursor.index, cause: parsedRoute.error });
    route = parsedRoute.value;

    if (cursor.index >= endIndex || text[cursor.index] !== 0x3a)
      return err('incomplete-route', `Incomplete route in mailbox at offset ${startIndex}`, { offset: cursor.index });

    cursor.index++;
    const skipAfterColon = skipCommentsAndWhiteSpace(text, cursor, endIndex);
    if (!skipAfterColon.ok) return err(skipAfterColon.error);

    if (cursor.index >= endIndex)
      return err('incomplete-mailbox', `Incomplete mailbox at offset ${startIndex}`, { offset: cursor.index });
  }

  const addrspec = tryParseAddrspec(text, cursor, endIndex, COMMA_GREATER_THAN_OR_SEMI_COLON, options.addressParserComplianceMode);
  if (!addrspec.ok) return addrspec;

  const skipAfter = skipCommentsAndWhiteSpace(text, cursor, endIndex);
  if (!skipAfter.ok) return err(skipAfter.error);

  if (cursor.index >= endIndex || text[cursor.index] !== 0x3e) {
    if (options.addressParserComplianceMode === 'strict')
      return err('unexpected-end-of-mailbox', `Unexpected end of mailbox at offset ${startIndex}`, { offset: cursor.index });
  } else {
    cursor.index++;
    if (cursor.index < endIndex && text[cursor.index] === 0x3e) {
      if (options.addressParserComplianceMode === 'strict')
        return err('excessive-angle-brackets', `Excessive angle brackets at offset ${cursor.index}`, { offset: cursor.index });
      do {
        cursor.index++;
      } while (cursor.index < endIndex && text[cursor.index] === 0x3e);
    }
  }

  const address = makeMailbox(name, addrspec.value.addrspec, route, addrspec.value.at);
  address.encoding = getEncodingForCodePage(codepage) ?? 'utf-8';
  return ok(address);
}

function tryParseGroup(
  flags: AddressParserFlags,
  options: ParserOptions,
  text: Uint8Array,
  startIndex: number,
  cursor: ParseCursor,
  endIndex: number,
  groupDepth: number,
  name: string,
  codepage: number,
): Result<InternetAddress> {
  cursor.index++;

  while (cursor.index < endIndex && (text[cursor.index] === 0x3a || isBlank(text[cursor.index]!)))
    cursor.index++;

  let members: InternetAddress[] = [];
  const listParsed = tryParseAddressListInternal(flags | AddressParserFlags.AllowMailboxAddress, options, text, cursor, endIndex, true, groupDepth);
  if (listParsed.ok) {
    members = listParsed.value;
  } else if (
    (flags & AddressParserFlags.ThrowOnError) !== 0 &&
    listParsed.error.kind !== 'no-addresses' &&
    !(listParsed.error.kind === 'max-address-group-depth' && hasEncodedWordTerminatorAhead(text, cursor.index, endIndex))
  ) {
    return err(listParsed.error);
  }

  if (cursor.index >= endIndex || text[cursor.index] !== 0x3b) {
    if (options.addressParserComplianceMode === 'strict')
      return err('missing-group-semicolon', `Expected to find ';' at offset ${cursor.index}`, { offset: cursor.index });
    while (cursor.index < endIndex && text[cursor.index] !== 0x3b)
      cursor.index++;
  } else {
    cursor.index++;
  }

  const address = makeGroup(name, members);
  address.encoding = getEncodingForCodePage(codepage) ?? 'utf-8';
  return ok(address);
}

export function tryParseAddressListInternal(
  flags: AddressParserFlags,
  options: ParserOptions,
  text: Uint8Array,
  cursor: ParseCursor,
  endIndex: number,
  isGroup: boolean,
  groupDepth: number,
): Result<InternetAddress[]> {
  const list: InternetAddress[] = [];
  const skipStart = skipCommentsAndWhiteSpace(text, cursor, endIndex);
  if (!skipStart.ok) return err(skipStart.error);

  if (cursor.index === endIndex)
    return err('no-addresses', 'No addresses found.', { offset: cursor.index });

  while (cursor.index < endIndex) {
    if (isGroup && text[cursor.index] === 0x3b) break;

    const savedIndex = cursor.index;
    const parsed = tryParseAddress(flags, options, text, cursor, endIndex, groupDepth);
    if (!parsed.ok) {
      if ((flags & AddressParserFlags.Internal) === 0)
        return parsed;

      cursor.index = savedIndex;
      while (cursor.index < endIndex) {
        if (text[cursor.index] === 0x22) {
          if (!skipQuotedLoose(text, cursor, endIndex).ok) break;
        } else if (text[cursor.index] === 0x28) {
          if (!skipComment(text, cursor, endIndex)) break;
        } else if (text[cursor.index] === 0x2c || (isGroup && text[cursor.index] === 0x3b)) {
          break;
        } else {
          cursor.index++;
        }
      }
    } else {
      list.push(parsed.value);
    }

    let skippedComma = false;
    do {
      const skip = skipCommentsAndWhiteSpace(text, cursor, endIndex);
      if (!skip.ok) return err(skip.error);
      if (cursor.index >= endIndex) break;
      if (isGroup && text[cursor.index] === 0x3b) break;
      if (text[cursor.index] !== 0x2c) {
        if (skippedComma) break;
        if (options.addressParserComplianceMode === 'strict')
          return err('missing-comma', isGroup ? "Expected ',' between addresses or ';' to denote the end of a group of addresses." : "Expected ',' between addresses.", { offset: cursor.index });
        break;
      }
      skippedComma = true;
      cursor.index++;
    } while (true);
  }

  return ok(list);
}

function compareIgnoreCase(a: string, b: string, length = Math.min(a.length, b.length), tieBreak = true): number {
  for (let i = 0; i < length; i++) {
    const ac = toUpperAscii(a.charCodeAt(i));
    const bc = toUpperAscii(b.charCodeAt(i));
    if (ac !== bc)
      return ac < bc ? -1 : 1;
  }

  if (!tieBreak)
    return 0;

  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}

function isMailboxLike(value: unknown): value is { address: string } {
  return typeof value === 'object' && value !== null && 'address' in value;
}

function toUpperAscii(code: number): number {
  return code >= 0x61 && code <= 0x7a ? code - 0x20 : code;
}

function isCharWhiteSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0b || code === 0x0c || code === 0x0d;
}

function hasEncodedWordTerminatorAhead(text: Uint8Array, index: number, endIndex: number): boolean {
  for (let i = index; i + 1 < endIndex; i++) {
    const c = text[i]!;
    if (c === 0x2c || c === 0x3b || isCharWhiteSpace(c))
      return false;
    if (c === 0x3f && text[i + 1] === 0x3d)
      return true;
  }

  return false;
}
