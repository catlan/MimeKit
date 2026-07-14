/**
 * Port of MimeKit/Utils/CharsetUtils.cs.
 *
 * .NET's Encoding machinery is replaced by a small Encoding abstraction:
 * decoding is backed by WHATWG TextDecoder where its semantics match .NET
 * (+CodePages provider — the parity target, since MimeKitLite references it
 * and the upstream test suite registers it), with two hand-rolled decoders
 * where WHATWG deliberately diverges:
 *   - us-ascii: WHATWG maps every ASCII label to windows-1252; .NET's is
 *     strict 7-bit with '?' replacement.
 *   - iso-8859-1: WHATWG maps it to windows-1252; .NET 28591 maps bytes
 *     0x80-0x9F to U+0080-U+009F control characters (identity mapping).
 *
 * Per plan Q3, ENCODING to legacy charsets is not supported — encode() is
 * implemented for utf-8/us-ascii/iso-8859-1 only; everything else throws.
 *
 * `countInvalid` approximates .NET's DecoderFallback invocation count by
 * counting U+FFFD replacements. Inputs that legitimately contain encoded
 * U+FFFD inflate the count; ConvertToUnicode only compares counts across
 * candidate charsets, where the bias applies to all candidates that decode
 * the sequence, so selection is unaffected in practice. Divergences surface
 * in the rfc2047 gates and get investigated there.
 */

import { SINGLE_BYTE_TABLES } from './single-byte-tables.js';

/**
 * Small encoding abstraction used in place of .NET's Encoding type.
 */
export interface CharsetEncoding {
  /** Numeric code page identifier. */
  readonly codePage: number;
  /** Canonical MIME charset name (C#: Encoding.WebName, lowercase). */
  readonly webName: string;
  /** Decode bytes; fatal=true throws on invalid input (C#: ExceptionFallback). */
  decode(bytes: Uint8Array, fatal?: boolean): string;
  /** Number of replacement-triggering sequences when decoding non-fatally. */
  countInvalid(bytes: Uint8Array): number;
  /** Encode text; only utf-8 / us-ascii / iso-8859-1 support this (plan Q3). */
  encode(text: string): Uint8Array;
}

/**
 * Stateful decoder for streaming charset conversion.
 */
export interface CharsetStreamDecoder {
  /**
   * Decode a chunk of bytes.
   *
   * @param bytes - Bytes to decode.
   * @param flush - Whether this is the final chunk.
   * @returns Decoded text.
   */
  decode(bytes: Uint8Array, flush?: boolean): string;
}

class DecodeError extends Error {}

class Utf8Encoding implements CharsetEncoding {
  readonly codePage = 65001;
  readonly webName = 'utf-8';
  private readonly fatalDecoder = new TextDecoder('utf-8', { fatal: true });
  private readonly encoder = new TextEncoder();

  decode(bytes: Uint8Array, fatal = false): string {
    if (fatal) {
      try {
        return this.fatalDecoder.decode(bytes);
      } catch {
        throw new DecodeError('invalid utf-8 sequence');
      }
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  countInvalid(bytes: Uint8Array): number {
    try {
      this.fatalDecoder.decode(bytes);
      return 0;
    } catch {
      const decoded = new TextDecoder('utf-8').decode(bytes);
      let count = 0;
      for (const ch of decoded) if (ch === '�') count++;
      return count;
    }
  }

  encode(text: string): Uint8Array {
    return this.encoder.encode(text);
  }
}

class Utf8StreamDecoder implements CharsetStreamDecoder {
  private readonly decoder = new TextDecoder('utf-8');

  decode(bytes: Uint8Array, flush = false): string {
    return this.decoder.decode(bytes, { stream: !flush });
  }
}

class AsciiEncoding implements CharsetEncoding {
  readonly codePage = 20127;
  readonly webName = 'us-ascii';

  decode(bytes: Uint8Array, fatal = false): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]!;
      if (b > 0x7f) {
        if (fatal) throw new DecodeError(`invalid us-ascii byte 0x${b.toString(16)} at ${i}`);
        out += '?';
      } else {
        out += String.fromCharCode(b);
      }
    }
    return out;
  }

  countInvalid(bytes: Uint8Array): number {
    let count = 0;
    for (let i = 0; i < bytes.length; i++) if (bytes[i]! > 0x7f) count++;
    return count;
  }

  encode(text: string): Uint8Array {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      out[i] = c > 0x7f ? 0x3f /* '?' */ : c;
    }
    return out;
  }
}

class AsciiStreamDecoder implements CharsetStreamDecoder {
  decode(bytes: Uint8Array, _flush = false): string {
    return new AsciiEncoding().decode(bytes);
  }
}

class Latin1Encoding implements CharsetEncoding {
  readonly codePage = 28591;
  readonly webName = 'iso-8859-1';

  decode(bytes: Uint8Array, _fatal = false): string {
    // Every byte maps to the same code point; no invalid input exists.
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
    return out;
  }

  countInvalid(_bytes: Uint8Array): number {
    return 0;
  }

  encode(text: string): Uint8Array {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      out[i] = c > 0xff ? 0x3f /* '?' */ : c;
    }
    return out;
  }
}

class Latin1StreamDecoder implements CharsetStreamDecoder {
  decode(bytes: Uint8Array, _flush = false): string {
    return new Latin1Encoding().decode(bytes);
  }
}

const UTF7_BASE64_VALUES = (() => {
  const values = new Int8Array(256).fill(-1);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < alphabet.length; i++) values[alphabet.charCodeAt(i)] = i;
  return values;
})();

/**
 * UTF-7 decoding with .NET `UTF7Encoding` semantics (C# resolves the
 * charset through the runtime, gated behind `EnableUnsafeUTF7Encoding`;
 * decoding legacy mail is exactly this port's use case): `+-` is a literal
 * `+`, a base64 run ends at `-` (consumed) or any invalid character
 * (processed as itself), leftover bits are dropped silently, and invalid
 * bytes pass through as their own code unit. The state machine lives in the
 * stream decoder so runs survive chunk boundaries; the one-shot decode is a
 * single flushed chunk. Decode-only, like every non-Unicode charset here.
 */
class Utf7StreamDecoder implements CharsetStreamDecoder {
  private inBase64 = false;
  private justShifted = false;
  private bits = 0;
  private bitCount = 0;

  decode(bytes: Uint8Array, _flush = false): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i]!;
      if (this.inBase64) {
        const value = UTF7_BASE64_VALUES[byte]!;
        if (value >= 0) {
          this.justShifted = false;
          this.bits = (this.bits << 6) | value;
          this.bitCount += 6;
          if (this.bitCount >= 16) {
            this.bitCount -= 16;
            out += String.fromCharCode((this.bits >> this.bitCount) & 0xffff);
          }
          continue;
        }
        this.inBase64 = false;
        this.bits = 0;
        this.bitCount = 0;
        if (byte === 0x2d) { // '-'
          if (this.justShifted) out += '+';
          this.justShifted = false;
          continue;
        }
        this.justShifted = false;
        // Fall through: the terminating character is data of its own.
      }
      if (byte === 0x2b) { // '+'
        this.inBase64 = true;
        this.justShifted = true;
        this.bits = 0;
        this.bitCount = 0;
      } else {
        out += String.fromCharCode(byte);
      }
    }
    return out;
  }
}

class Utf7Encoding implements CharsetEncoding {
  readonly codePage = 65000;
  readonly webName = 'utf-7';

  decode(bytes: Uint8Array, _fatal = false): string {
    // .NET's UTF-7 decoder never rejects input (its fallback passes invalid
    // bytes through), so fatal mode has nothing to throw on.
    return new Utf7StreamDecoder().decode(bytes, true);
  }

  countInvalid(_bytes: Uint8Array): number {
    return 0;
  }

  encode(_text: string): Uint8Array {
    throw new TypeError("encoding to 'utf-7' is not supported (utf-8-only generation, see plan Q3)");
  }
}

/**
 * Table-driven single-byte decoder generated from the C# oracle — exact
 * .NET parity for every byte (host TextDecoders deviate: Node/ICU passes
 * windows-1252 C1 bytes through as control characters).
 */
class SingleByteEncoding implements CharsetEncoding {
  constructor(
    readonly codePage: number,
    readonly webName: string,
    private readonly table: string,
  ) {}

  decode(bytes: Uint8Array, fatal = false): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      const ch = this.table[bytes[i]!]!;
      if (fatal && ch === '\ufffd')
        throw new DecodeError(`invalid ${this.webName} byte 0x${bytes[i]!.toString(16)} at ${i}`);
      out += ch;
    }
    return out;
  }

  countInvalid(bytes: Uint8Array): number {
    let count = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (this.table[bytes[i]!] === '\ufffd')
        count++;
    }
    return count;
  }

  encode(_text: string): Uint8Array {
    throw new TypeError(`encoding to '${this.webName}' is not supported (utf-8-only generation, see plan Q3)`);
  }
}

class TextDecoderEncoding implements CharsetEncoding {
  constructor(
    readonly codePage: number,
    readonly webName: string,
    private readonly label: string,
  ) {}

  decode(bytes: Uint8Array, fatal = false): string {
    if (fatal) {
      try {
        return new TextDecoder(this.label, { fatal: true }).decode(bytes);
      } catch {
        throw new DecodeError(`invalid ${this.webName} sequence`);
      }
    }
    return new TextDecoder(this.label).decode(bytes);
  }

  countInvalid(bytes: Uint8Array): number {
    try {
      new TextDecoder(this.label, { fatal: true }).decode(bytes);
      return 0;
    } catch {
      const decoded = new TextDecoder(this.label).decode(bytes);
      let count = 0;
      for (const ch of decoded) if (ch === '�') count++;
      return count;
    }
  }

  encode(_text: string): Uint8Array {
    throw new TypeError(`encoding to '${this.webName}' is not supported (utf-8-only generation, see plan Q3)`);
  }
}

class TextDecoderStreamDecoder implements CharsetStreamDecoder {
  private readonly decoder: TextDecoder;

  constructor(label: string) {
    this.decoder = new TextDecoder(label);
  }

  decode(bytes: Uint8Array, flush = false): string {
    return this.decoder.decode(bytes, { stream: !flush });
  }
}

/**
 * codepage → (webName, WHATWG TextDecoder label). Mirrors the .NET
 * (+CodePages, ICU) mapping for every codepage MimeKit's alias table and
 * ParseCodePage can produce. 28591/20127/65001 are handled by dedicated
 * classes above.
 */
const CODEPAGE_LABELS: Record<number, [webName: string, label: string]> = {
  874: ['windows-874', 'windows-874'],
  932: ['shift_jis', 'shift_jis'],
  936: ['gb2312', 'gbk'], // .NET 936 = GBK; WHATWG's gb2312 label is an alias of gbk
  949: ['ks_c_5601-1987', 'euc-kr'],
  950: ['big5', 'big5'],
  1200: ['utf-16', 'utf-16le'],
  1201: ['utf-16be', 'utf-16be'],
  1250: ['windows-1250', 'windows-1250'],
  1251: ['windows-1251', 'windows-1251'],
  1252: ['windows-1252', 'windows-1252'],
  1253: ['windows-1253', 'windows-1253'],
  1254: ['windows-1254', 'windows-1254'],
  1255: ['windows-1255', 'windows-1255'],
  1256: ['windows-1256', 'windows-1256'],
  1257: ['windows-1257', 'windows-1257'],
  1258: ['windows-1258', 'windows-1258'],
  10000: ['macintosh', 'macintosh'],
  20866: ['koi8-r', 'koi8-r'],
  21866: ['koi8-u', 'koi8-u'],
  28592: ['iso-8859-2', 'iso-8859-2'],
  28593: ['iso-8859-3', 'iso-8859-3'],
  28594: ['iso-8859-4', 'iso-8859-4'],
  28595: ['iso-8859-5', 'iso-8859-5'],
  28596: ['iso-8859-6', 'iso-8859-6'],
  28597: ['iso-8859-7', 'iso-8859-7'],
  28598: ['iso-8859-8', 'iso-8859-8'],
  28599: ['iso-8859-9', 'iso-8859-9'],
  28603: ['iso-8859-13', 'iso-8859-13'],
  28605: ['iso-8859-15', 'iso-8859-15'],
  38598: ['iso-8859-8-i', 'iso-8859-8-i'],
  50220: ['iso-2022-jp', 'iso-2022-jp'],
  50221: ['iso-2022-jp', 'iso-2022-jp'],
  50222: ['iso-2022-jp', 'iso-2022-jp'],
  51932: ['euc-jp', 'euc-jp'],
  51949: ['euc-kr', 'euc-kr'],
  54936: ['gb18030', 'gb18030'],
};

const encodingCache = new Map<number, CharsetEncoding | null>();

function createEncoding(codepage: number): CharsetEncoding | null {
  switch (codepage) {
  case 65001: return new Utf8Encoding();
  case 65000: return new Utf7Encoding();
  case 20127: return new AsciiEncoding();
  case 28591: return new Latin1Encoding();
  default: {
    const entry = CODEPAGE_LABELS[codepage];
    if (!entry) return null;
    const [webName, label] = entry;
    const table = SINGLE_BYTE_TABLES[codepage];
    if (table !== undefined)
      return new SingleByteEncoding(codepage, webName, table);
    try {
      new TextDecoder(label); // probe runtime support
    } catch {
      return null;
    }
    return new TextDecoderEncoding(codepage, webName, label);
  }
  }
}

/**
 * The WHATWG TextDecoder label backing an encoding, or null for the
 * hand-rolled us-ascii/iso-8859-1 decoders (stateless — callers needing
 * streaming semantics can decode those per-part safely). Used by rfc2231
 * continuation decoding to thread one stateful decoder across segments.
 */
export function getTextDecoderLabel(encoding: CharsetEncoding): string | null {
  if (encoding.codePage === 65001)
    return 'utf-8';
  const entry = CODEPAGE_LABELS[encoding.codePage];
  return entry ? entry[1] : null;
}

/**
 * Resolve a code page into a charset encoding.
 *
 * @param codepage - Numeric code page.
 * @returns The encoding, or `null` when unsupported.
 */
export function getEncodingForCodePage(codepage: number): CharsetEncoding | null {
  let cached = encodingCache.get(codepage);
  if (cached === undefined) {
    cached = createEncoding(codepage);
    encodingCache.set(codepage, cached);
  }
  return cached;
}

// C# static ctor: alias table. AddAliases probes charset availability and
// falls back (ProbeCharset) — here availability = createEncoding !== null.
const aliases = new Map<string, number>();

function addAliases(codepage: number, fallback: number, ...names: string[]): number {
  const value = getEncodingForCodePage(codepage) !== null ? codepage : fallback;
  for (const name of names) aliases.set(name, value);
  return value;
}

addAliases(65001, -1, 'utf-8', 'utf8', 'unicode');
// C# resolves these through Encoding.GetEncoding at runtime; the port needs
// them registered explicitly (IANA aliases per RFC 2152 registration).
addAliases(65000, -1, 'utf-7', 'utf7', 'csunicode11utf7', 'unicode-1-1-utf-7', 'unicode-2-0-utf-7', 'x-unicode-2-0-utf-7');
addAliases(20127, -1, 'ansi_x3.4-1968');
addAliases(28591, -1, 'ansi_x3.110-1983', 'latin1');
addAliases(10000, -1, 'macintosh');
addAliases(10079, -1, 'x-mac-icelandic');
addAliases(51949, -1,
  'ks_c_5601-1987', 'ksc-5601-1987', 'ksc-5601_1987', 'ksc-5601', '5601',
  'ks_c_5861-1992', 'ksc-5861-1992', 'ksc-5861_1992', 'euckr-0', 'euc-kr');
addAliases(950, -1, 'big5', 'big5-0', 'big5-hkscs', 'big5.eten-0', 'big5hkscs-0');
const gb2312 = addAliases(936, -1, 'gb2312', 'gb-2312', 'gb2312-0', 'gb2312-80', 'gb2312.1980-0');
addAliases(51936, gb2312, 'euc-cn', 'gbk-0', 'x-gbk', 'gbk');
addAliases(52936, gb2312, 'hz-gb-2312', 'hz-gb2312');
addAliases(54936, -1, 'gb18030-0', 'gb18030');
addAliases(51932, -1, 'eucjp-0', 'euc-jp', 'ujis-0', 'ujis');
addAliases(932, -1, 'shift_jis', 'jisx0208.1983-0', 'jisx0212.1990-0', 'pck');
addAliases(50220, -1, 'iso-2022-jp');

function tryParseInt(text: string, startIndex: number, count: number): number | null {
  if (count <= 0) return null;
  const slice = text.slice(startIndex, startIndex + count);
  if (!/^[0-9]+$/.test(slice)) return null;
  const value = Number.parseInt(slice, 10);
  return Number.isSafeInteger(value) ? value : null;
}

function parseIsoCodePage(charset: string, startIndex: number): number {
  if (charset.length - startIndex < 5)
    return -1;

  let dash = -1;
  for (let i = startIndex; i < charset.length; i++) {
    if (charset[i] === '-' || charset[i] === '_') { dash = i; break; }
  }
  if (dash === -1)
    dash = charset.length;

  const iso = tryParseInt(charset, startIndex, dash - startIndex);
  if (iso === null)
    return -1;

  if (iso === 10646)
    return 1201;

  if (dash + 2 > charset.length)
    return -1;

  const codepageIndex = dash + 1;

  switch (iso) {
  case 8859: {
    const codepage = tryParseInt(charset, codepageIndex, charset.length - codepageIndex);
    if (codepage === null)
      return -1;
    if (codepage <= 0 || (codepage > 9 && codepage < 13) || codepage > 15)
      return -1;
    return codepage + 28590;
  }
  case 2022: {
    const rest = charset.slice(codepageIndex).toLowerCase();
    if (rest === 'jp') return 50220;
    if (rest === 'kr') return 50225;
    return -1;
  }
  default:
    return -1;
  }
}

/**
 * Parse a code page number from a charset name.
 *
 * @param charset - Charset name.
 * @returns The parsed code page, or `-1` if the name cannot be parsed.
 */
export function parseCodePage(charset: string): number {
  const lower = charset.toLowerCase();
  let i: number;

  if (lower.startsWith('windows')) {
    i = 7;
    if (i === charset.length) return -1;
    if (charset[i] === '-' || charset[i] === '_') {
      if (i + 1 === charset.length) return -1;
      i++;
    }
    if (i + 2 < charset.length && lower[i] === 'c' && lower[i + 1] === 'p')
      i += 2;
    return tryParseInt(charset, i, charset.length - i) ?? -1;
  } else if (lower.startsWith('ibm')) {
    i = 3;
    if (i === charset.length) return -1;
    if (charset[i] === '-' || charset[i] === '_') i++;
    return tryParseInt(charset, i, charset.length - i) ?? -1;
  } else if (lower.startsWith('iso')) {
    i = 3;
    if (i === charset.length) return -1;
    if (charset[i] === '-' || charset[i] === '_') i++;
    return parseIsoCodePage(lower, i);
  } else if (lower.startsWith('cp')) {
    i = 2;
    if (i === charset.length) return -1;
    if (charset[i] === '-' || charset[i] === '_') i++;
    return tryParseInt(charset, i, charset.length - i) ?? -1;
  } else if (lower === 'latin1') {
    return 28591;
  }

  return -1;
}

// WHATWG label lookup for names the alias table and ParseCodePage don't
// resolve (C# falls through to Encoding.GetEncoding(name)). Probe TextDecoder
// directly; map the label back to a codepage where we know one.
const WHATWG_NAME_CODEPAGES: Record<string, number> = {
  'utf-16': 1200, 'utf-16le': 1200, 'utf-16be': 1201,
  'us-ascii': 20127, 'ascii': 20127, 'iso-8859-1': 28591,
  'iso-2022-jp': 50220, 'shift-jis': 932, 'sjis': 932,
  'windows-874': 874, 'koi8-r': 20866, 'koi8-u': 21866, 'koi8': 20866,
};

/**
 * Get the code page for a charset name using MimeKit aliases and runtime
 * charset lookup.
 *
 * @param charset - Charset name.
 * @returns The code page, or `-1` when unsupported.
 */
export function getCodePage(charset: string): number {
  const key = charset.toLowerCase();
  const cached = aliases.get(key);
  if (cached !== undefined)
    return cached;

  let codepage = parseCodePage(key);

  if (codepage === -1)
    codepage = WHATWG_NAME_CODEPAGES[key] ?? -1;

  if (codepage !== -1 && getEncodingForCodePage(codepage) === null)
    codepage = -1;

  aliases.set(key, codepage);

  return codepage;
}

/**
 * Resolve a charset name into an encoding.
 *
 * @param charset - Charset name.
 * @returns The encoding, or `null` when unsupported.
 */
export function tryGetEncoding(charset: string): CharsetEncoding | null {
  const codepage = getCodePage(charset);
  if (codepage === -1)
    return null;
  return getEncodingForCodePage(codepage);
}

/**
 * Get the canonical MIME charset name for an encoding or charset name.
 *
 * @param charset - Charset name or encoding.
 * @returns The MIME charset name.
 */
export function getMimeCharset(charset: string | CharsetEncoding): string {
  const encoding = typeof charset === 'string' ? tryGetEncoding(charset) : charset;
  if (encoding === null)
    return charset as string;

  switch (encoding.codePage) {
  case 932: return 'shift_jis';
  case 949: return 'euc-kr';
  case 50220: return 'iso-2022-jp';
  case 50221: return 'iso-2022-jp';
  case 50225: return 'euc-kr';
  default:
    return encoding.webName.toLowerCase();
  }
}

/** ISO-8859-1 encoding instance. */
export const latin1 = new Latin1Encoding();
/** UTF-8 encoding instance. */
export const utf8 = new Utf8Encoding();

/**
 * Streaming decoder used by CharsetFilter. TextDecoder's stream mode preserves
 * partial multibyte sequences across chunks; us-ascii and latin1 are stateless
 * byte maps, so their streaming form is just per-chunk decoding.
 */
export function createStreamDecoder(encoding: CharsetEncoding): CharsetStreamDecoder {
  switch (encoding.codePage) {
  case 65001: return new Utf8StreamDecoder();
  case 65000: return new Utf7StreamDecoder();
  case 20127: return new AsciiStreamDecoder();
  case 28591: return new Latin1StreamDecoder();
  default: {
    // Single-byte decodes are stateless per byte — the one-shot decoder IS
    // the streaming decoder.
    if (SINGLE_BYTE_TABLES[encoding.codePage] !== undefined)
      return { decode: (bytes: Uint8Array, _flush = false) => encoding.decode(bytes) };
    const entry = CODEPAGE_LABELS[encoding.codePage];
    if (!entry)
      throw new TypeError(`streaming decode for '${encoding.webName}' is not supported`);
    return new TextDecoderStreamDecoder(entry[1]);
  }
  }
}

/**
 * C#: CharsetUtils.ConvertToUnicode(ParserOptions, ...) — probe utf-8, the
 * user-supplied charset, then latin1; pick the first with the fewest invalid
 * sequences (strict '<', so earlier candidates win ties), then decode with
 * '?'-style replacement (here: U+FFFD normalized to match TextDecoder;
 * C# uses '?' — normalized at the gate layer if it ever matters).
 *
 * @param bytes - Bytes to decode.
 * @param userCharset - Optional user-supplied fallback charset.
 * @returns Unicode text decoded using the best candidate charset.
 */
export function convertToUnicode(bytes: Uint8Array, userCharset?: CharsetEncoding | null): string {
  const candidates: CharsetEncoding[] = [];

  if (userCharset && userCharset.codePage !== 65001 && userCharset.codePage !== 28591)
    candidates.push(utf8, userCharset, latin1);
  else
    candidates.push(utf8, latin1);

  let best: CharsetEncoding = candidates[0]!;
  let min = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const invalid = candidate.countInvalid(bytes);
    if (invalid < min) {
      min = invalid;
      best = candidate;
      if (min === 0)
        break;
    }
  }

  return best.decode(bytes);
}

/**
 * Try to detect a Unicode byte-order mark.
 *
 * @param buffer - Buffer to inspect.
 * @param length - Number of bytes from `buffer` to inspect.
 * @returns The detected encoding, or `null` when no supported BOM is present.
 */
export function tryGetBomEncoding(buffer: Uint8Array, length = buffer.length): CharsetEncoding | null {
  if (length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe)
    return getEncodingForCodePage(1200); // UTF-16LE
  if (length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff)
    return getEncodingForCodePage(1201); // UTF-16BE
  if (length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf)
    return utf8;
  return null;
}
