import { Trie } from './trie.js';

/** The kind of URL pattern to scan for. */
export enum UrlPatternType {
  /** An email address pattern. */
  Addrspec = 'addrspec',
  /** A `mailto:` URL pattern. */
  MailTo = 'mailto',
  /** A `file:` URL pattern. */
  File = 'file',
  /** A web URL pattern. */
  Web = 'web',
}

/** A URL scanning pattern and the prefix to use for generated links. */
export class UrlPattern {
  /**
   * Creates a new URL pattern.
   *
   * @param type The URL pattern type.
   * @param pattern The text pattern to search for.
   * @param prefix The prefix to prepend to generated links.
  */
  constructor(
    /** The URL pattern type. */
    readonly type: UrlPatternType,
    /** The text pattern to search for. */
    readonly pattern: string,
    /** The prefix to prepend to generated links. */
    readonly prefix: string,
  ) {}
}

/** A URL match found in scanned text. */
export class UrlMatch {
  /** The starting index of the match. */
  startIndex = 0;
  /** The ending index of the match. */
  endIndex = 0;

  /**
   * Creates a new URL match.
   *
   * @param pattern The pattern that matched.
   * @param prefix The prefix to prepend to generated links.
  */
  constructor(
    /** The pattern that matched. */
    readonly pattern: string,
    /** The prefix to prepend to generated links. */
    readonly prefix: string,
  ) {}
}

const AtomCharacters = "!#$%&'*+-/=?^_`{|}~";
const UrlSafeCharacters = "$-_.+!*'(),{}|\\^~[]`#%\";/?:@&=";

function isDigit(c: string): boolean { return c >= '0' && c <= '9'; }
function isLetterOrDigit(c: string): boolean {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || isDigit(c);
}
function isUnicodeLetterOrDecimalDigit(c: string): boolean { return /^[\p{L}\p{Nd}]$/u.test(c); }
function isUrlSafe(c: string): boolean { return c.charCodeAt(0) >= 128 || isLetterOrDigit(c) || UrlSafeCharacters.includes(c); }
function isAtom(c: string): boolean { return c.charCodeAt(0) >= 128 || isLetterOrDigit(c) || AtomCharacters.includes(c); }
function isDomain(c: string): boolean { return c.charCodeAt(0) >= 128 || isLetterOrDigit(c) || c === '-'; }
function isHexDigit(c: string): boolean { return (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f') || isDigit(c); }

function getClosingBrace(match: UrlMatch, text: string, startIndex: number): string {
  if (match.startIndex === startIndex) return '\0';
  switch (text[match.startIndex - 1]) {
  case '(': return ')';
  case '{': return '}';
  case '[': return ']';
  case '<': return '>';
  case '|': return '|';
  default: return '\0';
  }
}

function skipAtom(text: string, endIndex: number, index: { value: number }): boolean {
  const startIndex = index.value;
  while (index.value < endIndex && isAtom(text[index.value]!)) index.value++;
  return index.value > startIndex;
}

function skipAtomBackwards(text: string, startIndex: number, index: { value: number }): boolean {
  if (!isAtom(text[index.value]!)) return false;
  while (index.value > startIndex && isAtom(text[index.value - 1]!)) index.value--;
  return true;
}

function skipSubDomain(text: string, endIndex: number, index: { value: number }): boolean {
  if (!isDomain(text[index.value]!) || text[index.value] === '-') return false;
  index.value++;
  while (index.value < endIndex && isDomain(text[index.value]!)) index.value++;
  return true;
}

function skipDomain(text: string, endIndex: number, index: { value: number }): boolean {
  if (!skipSubDomain(text, endIndex, index)) return false;
  while (index.value < endIndex && text[index.value] === '.') {
    const subdomain = index.value++;
    if (index.value === endIndex || !skipSubDomain(text, endIndex, index)) {
      index.value = subdomain;
      break;
    }
  }
  return true;
}

function skipQuoted(text: string, endIndex: number, index: { value: number }): boolean {
  let escaped = false;
  index.value++;
  while (index.value < endIndex) {
    if (text[index.value] === '\\') escaped = !escaped;
    else if (!escaped) {
      if (text[index.value] === '"') break;
    } else {
      escaped = false;
    }
    index.value++;
  }
  if (index.value >= endIndex || text[index.value] !== '"') return false;
  index.value++;
  return true;
}

function skipQuotedBackwards(text: string, startIndex: number, index: { value: number }): boolean {
  index.value--;
  while (index.value >= startIndex) {
    if (text[index.value] === '"' && (index.value === startIndex || text[index.value - 1] !== '\\')) break;
    index.value--;
  }
  return index.value >= startIndex && text[index.value] === '"';
}

function skipWord(text: string, endIndex: number, index: { value: number }): boolean {
  return text[index.value] === '"' ? skipQuoted(text, endIndex, index) : skipAtom(text, endIndex, index);
}

function skipWordBackwards(text: string, startIndex: number, index: { value: number }): boolean {
  return text[index.value] === '"' ? skipQuotedBackwards(text, startIndex, index) : skipAtomBackwards(text, startIndex, index);
}

function skipIPv4Literal(text: string, endIndex: number, index: { value: number }): boolean {
  let groups = 0;
  while (index.value < endIndex && groups < 4) {
    const startIndex = index.value;
    let value = 0;
    while (index.value < endIndex && isDigit(text[index.value]!)) {
      value = value * 10 + (text.charCodeAt(index.value) - 0x30);
      index.value++;
    }
    if (index.value === startIndex || index.value - startIndex > 3 || value > 255) return false;
    groups++;
    if (groups < 4 && index.value < endIndex && text[index.value] === '.') index.value++;
  }
  return groups === 4;
}

function isIPv6(text: string, startIndex: number): boolean {
  return text.substring(startIndex, startIndex + 5).toLowerCase() === 'ipv6:';
}

function skipIPv6Literal(text: string, endIndex: number, index: { value: number }): boolean {
  let compact = false;
  let colons = 0;
  while (index.value < endIndex) {
    let startIndex = index.value;
    while (index.value < endIndex && isHexDigit(text[index.value]!)) index.value++;
    if (index.value >= endIndex) break;
    if (index.value > startIndex && colons > 2 && text[index.value] === '.') {
      index.value = startIndex;
      if (!skipIPv4Literal(text, endIndex, index)) return false;
      return compact ? colons < 6 : colons === 6;
    }
    let count = index.value - startIndex;
    if (count > 4) return false;
    if (text[index.value] !== ':') break;
    startIndex = index.value;
    while (index.value < endIndex && text[index.value] === ':') index.value++;
    count = index.value - startIndex;
    if (count > 2) return false;
    if (count === 2) {
      if (compact) return false;
      compact = true;
      colons += 2;
    } else {
      colons++;
    }
  }
  if (colons < 2) return false;
  return compact ? colons < 7 : colons === 7;
}

type IndexFn = (match: UrlMatch, text: string, startIndex: number, matchIndex: number, endIndex: number) => boolean;

/** Scans text for URLs and email addresses using configured patterns. */
export class UrlScanner {
  private readonly patterns = new Map<string, UrlPattern>();
  private readonly trie = new Trie(true);

  /**
   * Adds a URL pattern to the scanner.
   *
   * @param pattern The URL pattern.
   */
  add(pattern: UrlPattern): void {
    this.patterns.set(pattern.pattern, pattern);
    this.trie.add(pattern.pattern);
  }

  /**
   * Scans text for the next URL match.
   *
   * @param text The text to scan.
   * @param startIndex The starting index of the text.
   * @param count The number of characters to scan, starting at `startIndex`.
   * @returns The URL match, or `null` if no match was found.
   */
  scan(text: string, startIndex = 0, count = text.length - startIndex): UrlMatch | null {
    const endIndex = startIndex + count;
    const result = this.trie.search(text, startIndex, count);
    if (result.index === -1 || result.pattern === null) return null;
    const url = this.patterns.get(result.pattern);
    if (url === undefined) return null;

    const match = new UrlMatch(url.pattern, url.prefix);
    let getStartIndex: IndexFn;
    let getEndIndex: IndexFn;
    switch (url.type) {
    case UrlPatternType.Addrspec:
      getStartIndex = getAddrspecStartIndex; getEndIndex = getAddrspecEndIndex; break;
    case UrlPatternType.MailTo:
      getStartIndex = getMailToStartIndex; getEndIndex = getMailToEndIndex; break;
    case UrlPatternType.File:
      getStartIndex = getFileStartIndex; getEndIndex = getFileEndIndex; break;
    default:
      getStartIndex = getWebStartIndex; getEndIndex = getWebEndIndex; break;
    }

    if (!getStartIndex(match, text, startIndex, result.index, endIndex)) return null;
    if (!getEndIndex(match, text, startIndex, result.index, endIndex)) return null;
    return match;
  }
}

function getAddrspecStartIndex(match: UrlMatch, text: string, startIndex: number, matchIndex: number): boolean {
  const index = { value: matchIndex - 1 };
  if (matchIndex === startIndex) return false;
  do {
    if (!skipWordBackwards(text, startIndex, index)) return false;
    if (index.value === startIndex) break;
    if (text[index.value - 1] !== '.') break;
    index.value -= 2;
    if (index.value <= startIndex) return false;
  } while (true);
  match.startIndex = index.value;
  return true;
}

function getAddrspecEndIndex(match: UrlMatch, text: string, _startIndex: number, matchIndex: number, endIndex: number): boolean {
  const index = { value: matchIndex + 1 };
  if (index.value === endIndex) return false;
  if (text[index.value] !== '[') {
    if (!skipDomain(text, endIndex, index)) return false;
    match.endIndex = index.value;
    return true;
  }
  index.value++;
  if (index.value + 8 >= endIndex) return false;
  if (isIPv6(text, index.value)) {
    index.value += 'IPv6:'.length;
    if (!skipIPv6Literal(text, endIndex, index)) return false;
  } else if (!skipIPv4Literal(text, endIndex, index)) return false;
  if (index.value >= endIndex || text[index.value++] !== ']') return false;
  match.endIndex = index.value;
  return true;
}

function getFileStartIndex(match: UrlMatch, _text: string, _startIndex: number, matchIndex: number): boolean {
  match.startIndex = matchIndex;
  return true;
}

function getFileEndIndex(match: UrlMatch, text: string, startIndex: number, matchIndex: number, endIndex: number): boolean {
  const close = getClosingBrace(match, text, startIndex);
  let index = matchIndex + match.pattern.length;
  while (index < endIndex && isUrlSafe(text[index]!) && text[index] !== close) index++;
  match.endIndex = index;
  return index > matchIndex + match.pattern.length;
}

function getMailToStartIndex(match: UrlMatch, _text: string, _startIndex: number, matchIndex: number): boolean {
  match.startIndex = matchIndex;
  return true;
}

function skipAddrspec(text: string, endIndex: number, index: { value: number }): boolean {
  if (!skipWord(text, endIndex, index) || index.value >= endIndex) return false;
  while (text[index.value] === '.') {
    index.value++;
    if (index.value >= endIndex) return false;
    if (!skipWord(text, endIndex, index)) return false;
    if (index.value >= endIndex) return false;
  }
  if (index.value + 1 >= endIndex || text[index.value++] !== '@') return false;
  if (text[index.value] !== '[') {
    if (!skipDomain(text, endIndex, index)) return false;
  } else {
    index.value++;
    if (index.value + 8 >= endIndex) return false;
    if (isIPv6(text, index.value)) {
      index.value += 'IPv6:'.length;
      if (!skipIPv6Literal(text, endIndex, index)) return false;
    } else if (!skipIPv4Literal(text, endIndex, index)) return false;
    if (index.value >= endIndex || text[index.value++] !== ']') return false;
  }
  return true;
}

function getMailToEndIndex(match: UrlMatch, text: string, startIndex: number, matchIndex: number, endIndex: number): boolean {
  const close = getClosingBrace(match, text, startIndex);
  const contentIndex = matchIndex + match.pattern.length;
  const index = { value: contentIndex };
  if (contentIndex >= endIndex) return false;
  if (!skipAddrspec(text, endIndex, index)) index.value = contentIndex;
  if (index.value < endIndex && text[index.value] === '?') {
    index.value++;
    while (index.value < endIndex && isUrlSafe(text[index.value]!) && text[index.value] !== close) index.value++;
  }
  match.endIndex = index.value;
  return index.value > contentIndex;
}

function getWebStartIndex(match: UrlMatch, _text: string, _startIndex: number, matchIndex: number): boolean {
  match.startIndex = matchIndex;
  return true;
}

function getWebEndIndex(match: UrlMatch, text: string, startIndex: number, matchIndex: number, endIndex: number): boolean {
  const close = getClosingBrace(match, text, startIndex);
  const index = { value: matchIndex + match.pattern.length };
  if (index.value >= endIndex || !skipDomain(text, endIndex, index)) return false;
  if (index.value + 1 < endIndex && text[index.value] === ':' && isDigit(text[index.value + 1]!)) {
    index.value += 2;
    while (index.value < endIndex && isDigit(text[index.value]!)) index.value++;
  }
  if (index.value < endIndex && (text[index.value] === '/' || text[index.value] === '?')) {
    if (text[index.value] === '/') index.value++;
    while (index.value < endIndex && text[index.value] !== close) {
      if (text[index.value] === '?' || text[index.value] === '&') {
        if (index.value + 1 >= endIndex || !isUnicodeLetterOrDecimalDigit(text[index.value + 1]!)) break;
        index.value++;
      } else if (!isUrlSafe(text[index.value]!)) {
        break;
      }
      index.value++;
    }
  }
  match.endIndex = index.value;
  return true;
}
