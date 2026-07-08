import { FormatOptions } from './format-options.js';
import { ParserOptions } from './parser-options.js';
import { err, ok, type Result } from './result.js';
import { DomainList } from './domain-list.js';
import {
  AddressParserFlags,
  InternetAddress,
  appendFolded,
  lineWrap,
  tryParseAddrspec,
  type LineState,
} from './internet-address.js';
import { encodePhraseAsString } from './utils/rfc2047.js';
import { quote } from './utils/mime-utils.js';
import { isInternational, skipCommentsAndWhiteSpace } from './utils/parse-utils.js';
import { punycodeDefault } from './encodings/punycode.js';

const EMPTY_SENTINELS = new Uint8Array();
const utf8Encoder = new TextEncoder();

export class MailboxAddress extends InternetAddress {
  readonly route: DomainList;
  private _address = '';
  private at = -1;

  constructor(name: string | null | undefined, address: string, route?: Iterable<string>, at?: number) {
    super(name ?? null);
    if (address == null) throw new TypeError('address cannot be null');
    this.route = route instanceof DomainList ? route : new DomainList(route);
    this.route.onChanged = () => this.onChanged?.();

    if (at !== undefined) {
      this._address = address;
      this.at = at;
    } else {
      this.address = address;
    }
  }

  get address(): string {
    return this._address;
  }

  set address(value: string) {
    if (value == null) throw new TypeError('address cannot be null');
    if (value === this._address) return;
    if (value.length > 0) {
      const buffer = utf8Encoder.encode(value);
      const cursor = { index: 0 };
      const parsed = tryParseAddrspec(buffer, cursor, buffer.length, EMPTY_SENTINELS, ParserOptions.default.addressParserComplianceMode);
      if (!parsed.ok)
        throw new TypeError(parsed.error.message);
      const skip = skipCommentsAndWhiteSpace(buffer, cursor, buffer.length);
      if (!skip.ok)
        throw new TypeError(skip.error.message);
      if (cursor.index !== buffer.length)
        throw new TypeError(`Unexpected '${String.fromCharCode(buffer[cursor.index]!)}' token at offset ${cursor.index}`);
      this._address = parsed.value.addrspec;
      this.at = parsed.value.at;
    } else {
      this._address = '';
      this.at = -1;
    }
    this.onChanged?.();
  }

  get localPart(): string {
    return this.at !== -1 ? this._address.slice(0, this.at) : this._address;
  }

  get domain(): string {
    return this.at !== -1 ? this._address.slice(this.at + 1) : '';
  }

  get isInternational(): boolean {
    if (this._address.length === 0) return false;
    if (isInternational(this._address)) return true;
    for (const domain of this.route) {
      if (isInternational(domain)) return true;
    }
    return false;
  }

  clone(): MailboxAddress {
    return new MailboxAddress(this.name, this._address, this.route, this.at);
  }

  getAddress(idnEncode: boolean): string {
    return idnEncode ? MailboxAddress.encodeAddrspecInternal(this._address, this.at) : this._address;
  }

  static encodeAddrspec(addrspec: string): string {
    if (addrspec == null) throw new TypeError('addrspec cannot be null');
    if (addrspec.length === 0) return addrspec;
    const buffer = utf8Encoder.encode(addrspec);
    const cursor = { index: 0 };
    const parsed = tryParseAddrspec(buffer, cursor, buffer.length, EMPTY_SENTINELS, 'looser');
    if (!parsed.ok) return addrspec;
    return MailboxAddress.encodeAddrspecInternal(parsed.value.addrspec, parsed.value.at);
  }

  static decodeAddrspec(addrspec: string): string {
    if (addrspec == null) throw new TypeError('addrspec cannot be null');
    if (addrspec.length === 0) return addrspec;
    const buffer = utf8Encoder.encode(addrspec);
    const cursor = { index: 0 };
    const parsed = tryParseAddrspec(buffer, cursor, buffer.length, EMPTY_SENTINELS, 'looser');
    return parsed.ok ? parsed.value.addrspec : addrspec;
  }

  private static encodeAddrspecInternal(addrspec: string, at: number): string {
    if (at === -1 || !isInternational(addrspec, at + 1))
      return addrspec;
    return `${addrspec.slice(0, at)}@${punycodeDefault.encode(addrspec, at + 1)}`;
  }

  encode(options: FormatOptions, firstToken: boolean, state: LineState): string {
    let output = '';
    let route = this.route.encode(options);
    if (route.length > 0) route += ':';
    const addrspec = this.getAddress(!options.international);

    if (this.name && this.name.length > 0) {
      const name = options.international
        ? InternetAddress.encodeInternationalizedPhrase(this.name)
        : encodePhraseAsString(options, this.encoding, this.name);
      if (state.lineLength + name.length > options.maxLineLength) {
        if (name.length > options.maxLineLength) {
          output = appendFolded(options, output, firstToken, name, state);
        } else {
          if (!firstToken && state.lineLength > 1) {
            output = lineWrap(options, output);
            state.lineLength = 1;
          }

          state.lineLength += name.length;
          output += name;
        }
      } else {
        state.lineLength += name.length;
        output += name;
      }

      if (state.lineLength + route.length + addrspec.length + 3 > options.maxLineLength) {
        output += `${options.newLine}\t<`;
        state.lineLength = 2;
      } else {
        output += ' <';
        state.lineLength += 2;
      }

      state.lineLength += route.length;
      output += route;

      state.lineLength += addrspec.length + 1;
      output += `${addrspec}>`;
      return output;
    }

    if (route.length > 0) {
      if (!firstToken && state.lineLength + route.length + addrspec.length + 2 > options.maxLineLength) {
        output += `${options.newLine}\t<`;
        state.lineLength = 2;
      } else {
        output += '<';
        state.lineLength++;
      }

      state.lineLength += route.length;
      output += route;

      state.lineLength += addrspec.length + 1;
      output += `${addrspec}>`;
      return output;
    }

    if (!firstToken && state.lineLength + addrspec.length > options.maxLineLength) {
      output = lineWrap(options, output);
      state.lineLength = 1;
    }

    state.lineLength += addrspec.length;
    output += addrspec;
    return output;
  }

  toString(options: FormatOptions = FormatOptions.default, encode = false): string {
    if (encode) {
      const state = { lineLength: 0 };
      return this.encode(options, true, state);
    }

    let route = this.route.toString();
    if (route.length > 0) route += ':';

    if (this.name && this.name.length > 0)
      return `${quote(this.name)} <${route}${this._address}>`;
    if (route.length > 0)
      return `<${route}${this._address}>`;
    return this._address;
  }

  equals(other: InternetAddress | null | undefined): boolean {
    return other instanceof MailboxAddress && this.name === other.name && this.address === other.address;
  }

  static override parse(text: string | Uint8Array, options: ParserOptions = ParserOptions.default): Result<MailboxAddress> {
    const buffer = typeof text === 'string' ? utf8Encoder.encode(text) : text;
    const cursor = { index: 0 };
    const parsed = InternetAddress.tryParseInternal(AddressParserFlags.AllowMailboxAddress | AddressParserFlags.ThrowOnError, options, buffer, cursor, buffer.length, 0);
    if (!parsed.ok) return err(parsed.error);
    if (!(parsed.value instanceof MailboxAddress))
      return err('not-mailbox-address', 'Parsed address is not a mailbox address.', { offset: cursor.index });
    const skip = skipCommentsAndWhiteSpace(buffer, cursor, buffer.length);
    if (!skip.ok) return err(skip.error);
    if (cursor.index !== buffer.length)
      return err('unexpected-token', `Unexpected token at offset ${cursor.index}`, { offset: cursor.index });
    return ok(parsed.value);
  }
}
