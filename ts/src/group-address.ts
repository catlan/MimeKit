import { FormatOptions } from './format-options.js';
import { ParserOptions } from './parser-options.js';
import { err, ok, type Result } from './result.js';
import {
  AddressParserFlags,
  InternetAddress,
  appendFolded,
  lineWrap,
  registerAddressConstructors,
  type LineState,
} from './internet-address.js';
import { InternetAddressList } from './internet-address-list.js';
import { MailboxAddress } from './mailbox-address.js';
import { encodePhraseAsString } from './utils/rfc2047.js';
import { skipCommentsAndWhiteSpace } from './utils/parse-utils.js';

const utf8Encoder = new TextEncoder();

/**
 * Represents a named group of internet addresses.
 */
export class GroupAddress extends InternetAddress {
  /** The members of the group address. */
  readonly members: InternetAddressList;

  /**
   * Creates a new group address.
   *
   * @param name The group display name.
   * @param members The group members.
   */
  constructor(name: string | null | undefined, members?: Iterable<InternetAddress>) {
    super(name ?? null);
    this.members = new InternetAddressList(members);
    this.members.onChanged = () => this.onChanged?.();
  }

  /** Clones this group address. */
  clone(): GroupAddress {
    return new GroupAddress(this.name, Array.from(this.members, (member) => member.clone()));
  }

  /** Encodes this group address. */
  encode(options: FormatOptions, firstToken: boolean, state: LineState): string {
    let output = '';
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
    }
    output += ': ';
    state.lineLength += 2;
    output += this.members.encode(options, false, state);
    output += ';';
    state.lineLength++;
    return output;
  }

  /** Serializes this group address. */
  toString(options: FormatOptions = FormatOptions.default, encode = false): string {
    if (encode) {
      const state = { lineLength: 0 };
      return this.encode(options, true, state);
    }

    return `${this.name ?? ''}: ${Array.from(this.members, (m) => m.toString(options, false)).join(', ')};`;
  }

  /** Determines whether this group address equals another address. */
  equals(other: InternetAddress | null | undefined): boolean {
    return other instanceof GroupAddress && this.name === other.name && this.members.equals(other.members);
  }

  /**
   * Parses a group address.
   *
   * @returns A {@link Result}; `{ ok: false }` with a `MimeError` on malformed input.
   */
  static override parse(text: string | Uint8Array, options: ParserOptions = ParserOptions.default): Result<GroupAddress> {
    const buffer = typeof text === 'string' ? utf8Encoder.encode(text) : text;
    const cursor = { index: 0 };
    const parsed = InternetAddress.tryParseInternal(AddressParserFlags.AllowGroupAddress | AddressParserFlags.ThrowOnError, options, buffer, cursor, buffer.length, 0);
    if (!parsed.ok) return err(parsed.error);
    if (!(parsed.value instanceof GroupAddress))
      return err('not-group-address', 'Parsed address is not a group address.', { offset: cursor.index });
    const skip = skipCommentsAndWhiteSpace(buffer, cursor, buffer.length);
    if (!skip.ok) return err(skip.error);
    if (cursor.index !== buffer.length)
      return err('unexpected-token', `Unexpected token at offset ${cursor.index}`, { offset: cursor.index });
    return ok(parsed.value);
  }
}

registerAddressConstructors({
  mailbox: MailboxAddress as unknown as new (name: string | null | undefined, address: string, route?: Iterable<string>, at?: number) => InternetAddress,
  group: GroupAddress,
});
