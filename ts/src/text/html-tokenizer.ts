// Port of MimeKit/Text/HtmlTokenizer.cs — the HTML5 tokenizer state machine.
//
// Input model: the C# tokenizer reads chars from a TextReader or decodes bytes
// from a Stream incrementally. The port instead operates over a single decoded
// JS string with an index (UTF-16 code units, matching C# `char` semantics
// exactly). The (Stream, Encoding, detectBOM) construction path is provided via
// the static `fromBytes` factory, which decodes up-front with `decodeHtml`
// (replicating the C# BOM detection / preamble skipping). Both paths converge
// on the identical char stream, so the token output is identical.

import { CharBuffer } from './char-buffer.js';
import { HtmlEntityDecoder } from './html-entity-decoder.js';
import { HtmlNamespace, toHtmlNamespace } from './html-namespace.js';
import { HtmlAttribute } from './html-attribute.js';
import { HtmlAttributeId } from './html-attribute-id.js';
import { HtmlTagId } from './html-tag-id.js';
import {
  HtmlToken,
  HtmlCDataToken,
  HtmlCommentToken,
  HtmlDataToken,
  HtmlDocTypeToken,
  HtmlScriptDataToken,
  HtmlTagToken,
} from './html-token.js';
import { HtmlTokenizerState } from './html-tokenizer-state.js';

const DocTypeName = 'doctype';
const CDataName = '[CDATA[';
const REPLACEMENT = '�';

function isAlphaNumeric(c: string): boolean {
  const cc = c.charCodeAt(0);
  return (
    (cc >= 0x41 && cc <= 0x5a) || // A-Z
    (cc >= 0x61 && cc <= 0x7a) || // a-z
    (cc >= 0x30 && cc <= 0x39) // 0-9
  );
}

function isAsciiLetter(c: string): boolean {
  const cc = c.charCodeAt(0);
  return (cc >= 0x41 && cc <= 0x5a) || (cc >= 0x61 && cc <= 0x7a);
}

function toLower(c: string): string {
  const cc = c.charCodeAt(0);
  if (cc >= 0x41 && cc <= 0x5a) return String.fromCharCode(cc + 0x20);
  return c;
}

// --- byte->string decoding for the fromBytes path ---

function mapLabel(label: string): string {
  switch (label.toLowerCase()) {
    case 'utf-8': case 'utf8': return 'utf-8';
    case 'utf-16': case 'utf-16le': case 'unicode': return 'utf-16le';
    case 'utf-16be': return 'utf-16be';
    case 'utf-32': case 'utf-32le': return 'utf-32le';
    case 'utf-32be': return 'utf-32be';
    case '1252': case 'windows-1252': case 'cp1252': return 'windows-1252';
    default: return label.toLowerCase();
  }
}

function startsWith(bytes: Uint8Array, preamble: number[]): boolean {
  if (bytes.length < preamble.length) return false;
  for (let i = 0; i < preamble.length; i++) if (bytes[i] !== preamble[i]) return false;
  return true;
}

function preambleFor(enc: string): number[] {
  switch (enc) {
    case 'utf-8': return [0xef, 0xbb, 0xbf];
    case 'utf-16le': return [0xff, 0xfe];
    case 'utf-16be': return [0xfe, 0xff];
    case 'utf-32le': return [0xff, 0xfe, 0x00, 0x00];
    case 'utf-32be': return [0x00, 0x00, 0xfe, 0xff];
    default: return [];
  }
}

// Windows-1252 C1 range (0x80-0x9F) mapping. Node's TextDecoder('windows-1252')
// does not apply this mapping (it passes C1 bytes through like Latin-1), so the
// full code page is decoded manually to match .NET's Encoding.GetEncoding(1252).
const cp1252C1: number[] = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

function decodeWindows1252(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    s += b < 0x80 || b > 0x9f ? String.fromCharCode(b) : String.fromCharCode(cp1252C1[b - 0x80]!);
  }
  return s;
}

function decodeUtf32(bytes: Uint8Array, littleEndian: boolean): string {
  let s = '';
  for (let i = 0; i + 4 <= bytes.length; i += 4) {
    const cp = littleEndian
      ? bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! * 0x1000000)
      : bytes[i]! * 0x1000000 + (bytes[i + 1]! << 16) + (bytes[i + 2]! << 8) + bytes[i + 3]!;
    s += cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : REPLACEMENT;
  }
  return s;
}

/**
 * Decode HTML bytes to a string, replicating the C# tokenizer's BOM detection
 * (detectBOM=true) or single-encoding preamble skip (detectBOM=false).
 */
export function decodeHtml(bytes: Uint8Array, label: string, detectBOM: boolean): string {
  let enc: string;
  let skip = 0;

  if (detectBOM) {
    if (startsWith(bytes, [0xef, 0xbb, 0xbf])) {
      enc = 'utf-8';
      skip = 3;
    } else if (startsWith(bytes, [0xff, 0xfe, 0x00, 0x00])) {
      enc = 'utf-32le';
      skip = 4;
    } else if (startsWith(bytes, [0x00, 0x00, 0xfe, 0xff])) {
      enc = 'utf-32be';
      skip = 4;
    } else if (startsWith(bytes, [0xff, 0xfe])) {
      enc = 'utf-16le';
      skip = 2;
    } else if (startsWith(bytes, [0xfe, 0xff])) {
      enc = 'utf-16be';
      skip = 2;
    } else {
      enc = mapLabel(label);
      skip = 0;
    }
  } else {
    enc = mapLabel(label);
    const preamble = preambleFor(enc);
    if (preamble.length > 0 && startsWith(bytes, preamble)) skip = preamble.length;
  }

  const body = skip > 0 ? bytes.subarray(skip) : bytes;

  if (enc === 'utf-32le') return decodeUtf32(body, true);
  if (enc === 'utf-32be') return decodeUtf32(body, false);
  if (enc === 'windows-1252') return decodeWindows1252(body);

  return new TextDecoder(enc).decode(body);
}

/** An HTML tokenizer. */
export class HtmlTokenizer {
  private readonly entity = new HtmlEntityDecoder();
  private readonly data = new CharBuffer(2048);
  private readonly name = new CharBuffer(32);

  private readonly text: string;
  private pos = 0;
  private readonly end: number;
  private c = '\0'; // stands in for C#'s `out char c`

  private readonly cdata: string[] = ['\0', '\0', '\0'];
  private cdataIndex = 0;

  private activeTagName = '';
  private doctype: HtmlDocTypeToken | null = null;
  private attribute: HtmlAttribute | null = null;
  private tag: HtmlTagToken | null = null;
  private quote = '\0';

  private decodeCharacterReferences = true;
  private linePosition = 1;
  private lineNumber = 1;

  private isEndTag = false;
  private bang = false;
  private eof = false;

  private htmlNamespace: HtmlNamespace = HtmlNamespace.Html;
  private ignoreTruncatedTags = false;
  private state: HtmlTokenizerState = HtmlTokenizerState.Data;

  /** Create a tokenizer over the given decoded HTML string. */
  constructor(text: string) {
    if (text === null || text === undefined) throw new TypeError('text');
    this.text = text;
    this.end = text.length;
  }

  /** Create a tokenizer from raw bytes with the given charset and BOM handling. */
  static fromBytes(bytes: Uint8Array, encoding = 'utf-8', detectEncodingFromByteOrderMarks = true): HtmlTokenizer {
    if (bytes === null || bytes === undefined) throw new TypeError('bytes');
    if (encoding === null || encoding === undefined) throw new TypeError('encoding');
    return new HtmlTokenizer(decodeHtml(bytes, encoding, detectEncodingFromByteOrderMarks));
  }

  get decodeCharacterReferencesEnabled(): boolean {
    return this.decodeCharacterReferences;
  }
  set decodeCharacterReferencesEnabled(value: boolean) {
    this.decodeCharacterReferences = value;
  }

  get currentHtmlNamespace(): HtmlNamespace {
    return this.htmlNamespace;
  }

  get ignoreTruncatedTagsEnabled(): boolean {
    return this.ignoreTruncatedTags;
  }
  set ignoreTruncatedTagsEnabled(value: boolean) {
    this.ignoreTruncatedTags = value;
  }

  get currentLineNumber(): number {
    return this.lineNumber;
  }

  get currentLinePosition(): number {
    return this.linePosition;
  }

  get tokenizerState(): HtmlTokenizerState {
    return this.state;
  }

  // --- token/attribute factories (protected virtual in C#) ---

  protected createDocType(): HtmlDocTypeToken {
    return new HtmlDocTypeToken();
  }

  private createDocTypeToken(rawTagName: string): HtmlDocTypeToken {
    const token = this.createDocType();
    token.rawTagName = rawTagName;
    return token;
  }

  protected createCommentToken(comment: string, bogus = false): HtmlCommentToken {
    return new HtmlCommentToken(comment, bogus);
  }

  protected createDataToken(data: string): HtmlDataToken {
    return new HtmlDataToken(data);
  }

  protected createCDataToken(cdata: string): HtmlCDataToken {
    return new HtmlCDataToken(cdata);
  }

  protected createScriptDataToken(scriptData: string): HtmlScriptDataToken {
    return new HtmlScriptDataToken(scriptData);
  }

  protected createTagToken(tagName: string, isEndTag = false): HtmlTagToken {
    return new HtmlTagToken(tagName, isEndTag);
  }

  protected createAttribute(attributeName: string): HtmlAttribute {
    return new HtmlAttribute(attributeName);
  }

  // --- input reading ---

  private fillBuffer(): void {
    if (this.pos >= this.end) this.eof = true;
  }

  private tryPeek(): boolean {
    this.fillBuffer();

    if (this.pos < this.end) {
      this.c = this.text[this.pos]!;
      return true;
    }

    this.c = '\0';
    return false;
  }

  private incrementLineNumber(): void {
    this.linePosition = 1;
    this.lineNumber++;
  }

  private consumeCharacter(c: string): void {
    if (c === '\n') this.incrementLineNumber();
    else this.linePosition++;

    this.pos++;
  }

  private tryRead(): boolean {
    this.fillBuffer();

    if (this.pos < this.end) {
      this.c = this.text[this.pos++]!;

      if (this.c === '\n') this.incrementLineNumber();
      else this.linePosition++;

      return true;
    }

    this.c = '\0';
    return false;
  }

  private nameIs(value: string): boolean {
    if (this.name.length !== value.length) return false;

    for (let i = 0; i < this.name.length; i++) {
      if (toLower(this.name.get(i)) !== toLower(value[i]!)) return false;
    }

    return true;
  }

  private emitTagAttribute(): void {
    this.attribute = this.createAttribute(this.name.toString());
    this.tag!.attributes.add(this.attribute);
    this.name.length = 0;
  }

  private emitCommentToken(comment: string | CharBuffer, bogus = false): HtmlToken {
    const text = typeof comment === 'string' ? comment : comment.toString();
    const token = this.createCommentToken(text, bogus);
    token.isBangComment = this.bang;
    this.data.length = 0;
    this.name.length = 0;
    this.bang = false;
    return token;
  }

  private emitDocType(): HtmlToken | null {
    const token = this.doctype;
    this.data.length = 0;
    this.doctype = null;
    return token;
  }

  private emitDataToken(encodeEntities: boolean, truncated: boolean): HtmlToken | null {
    if (this.data.length === 0) return null;

    if (truncated && this.ignoreTruncatedTags) {
      this.data.length = 0;
      return null;
    }

    const token = this.createDataToken(this.data.toString());
    token.encodeEntities = encodeEntities;
    this.data.length = 0;

    return token;
  }

  private emitCDataToken(): HtmlToken | null {
    if (this.data.length === 0) return null;

    const token = this.createCDataToken(this.data.toString());
    this.data.length = 0;

    return token;
  }

  private emitScriptDataToken(): HtmlToken | null {
    if (this.data.length === 0) return null;

    const token = this.createScriptDataToken(this.data.toString());
    this.data.length = 0;

    return token;
  }

  private emitTagToken(): HtmlToken {
    if (!this.tag!.isEndTag && !this.tag!.isEmptyElement) {
      switch (this.tag!.id) {
        case HtmlTagId.Style: case HtmlTagId.Xmp: case HtmlTagId.IFrame: case HtmlTagId.NoEmbed: case HtmlTagId.NoFrames:
          this.state = HtmlTokenizerState.RawText;
          this.activeTagName = this.tag!.name;
          break;
        case HtmlTagId.Title: case HtmlTagId.TextArea:
          this.state = HtmlTokenizerState.RcData;
          this.activeTagName = this.tag!.name;
          break;
        case HtmlTagId.PlainText:
          this.state = HtmlTokenizerState.PlainText;
          break;
        case HtmlTagId.Script:
          this.state = HtmlTokenizerState.ScriptData;
          break;
        case HtmlTagId.NoScript:
          // TODO: only switch into the RawText state if scripting is enabled
          this.state = HtmlTokenizerState.RawText;
          this.activeTagName = this.tag!.name;
          break;
        case HtmlTagId.Html:
          this.state = HtmlTokenizerState.Data;

          for (let i = this.tag!.attributes.count; i > 0; i--) {
            const attr = this.tag!.attributes.get(i - 1);

            if (attr.id === HtmlAttributeId.XmlNS && attr.value !== null) {
              this.htmlNamespace = toHtmlNamespace(attr.value);
              break;
            }
          }
          break;
        default:
          this.state = HtmlTokenizerState.Data;
          break;
      }
    } else {
      this.state = HtmlTokenizerState.Data;
    }

    const token = this.tag!;
    this.data.length = 0;
    this.tag = null;

    return token;
  }

  // 8.2.4.69 Tokenizing character references
  private readCharacterReference(next: HtmlTokenizerState): HtmlToken | null {
    if (!this.tryPeek()) {
      this.state = HtmlTokenizerState.EndOfFile;
      this.data.append('&');

      return this.emitDataToken(true, false);
    }

    const c = this.c;
    switch (c) {
      case '\t': case '\r': case '\n': case '\f': case ' ': case '<': case '&':
        // no character is consumed, emit '&'
        this.state = next;
        this.data.append('&');
        return null;
    }

    this.entity.push('&');

    while (this.entity.push(this.c)) {
      this.consumeCharacter(this.c);

      if (this.c === ';') break;

      if (!this.tryPeek()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.data.append(this.entity.getPushedInput());
        this.entity.reset();

        return this.emitDataToken(true, false);
      }
    }

    this.state = next;

    this.data.append(this.entity.getValue());
    this.entity.reset();

    return null;
  }

  private readGenericRawTextLessThan(rawText: HtmlTokenizerState, rawTextEndTagOpen: HtmlTokenizerState): HtmlToken | null {
    this.data.append('<');

    if (this.tryPeek() && this.c === '/') {
      this.state = rawTextEndTagOpen;
      this.consumeCharacter(this.c);
      this.data.append('/');
      this.name.length = 0;
    } else {
      this.state = rawText;
    }

    return null;
  }

  private readGenericRawTextEndTagOpen(decoded: boolean, rawText: HtmlTokenizerState, rawTextEndTagName: HtmlTokenizerState): HtmlToken | null {
    if (!this.tryPeek()) {
      this.state = HtmlTokenizerState.EndOfFile;
      return this.emitDataToken(decoded, true);
    }

    if (isAsciiLetter(this.c)) {
      this.state = rawTextEndTagName;
      this.consumeCharacter(this.c);
      this.name.append(this.c);
      this.data.append(this.c);
    } else {
      this.state = rawText;
    }

    return null;
  }

  private readGenericRawTextEndTagName(decoded: boolean, rawText: HtmlTokenizerState): HtmlToken | null {
    const current = this.state;

    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.name.length = 0;

        return this.emitDataToken(decoded, true);
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          if (this.nameIs(this.activeTagName)) {
            this.state = HtmlTokenizerState.BeforeAttributeName;
            break;
          }
          // goto default
          if (!isAsciiLetter(c)) {
            this.state = rawText;
            return null;
          }
          this.name.append(c);
          break;
        case '/':
          if (this.nameIs(this.activeTagName)) {
            this.state = HtmlTokenizerState.SelfClosingStartTag;
            break;
          }
          if (!isAsciiLetter(c)) {
            this.state = rawText;
            return null;
          }
          this.name.append(c);
          break;
        case '>':
          if (this.nameIs(this.activeTagName)) {
            const token = this.createTagToken(this.name.toString(), true);
            this.state = HtmlTokenizerState.Data;
            this.data.length = 0;
            this.name.length = 0;
            return token;
          }
          if (!isAsciiLetter(c)) {
            this.state = rawText;
            return null;
          }
          this.name.append(c);
          break;
        default:
          if (!isAsciiLetter(c)) {
            this.state = rawText;
            return null;
          }
          this.name.append(c === '\0' ? REPLACEMENT : c);
          break;
      }
    } while (this.state === current);

    this.tag = this.createTagToken(this.name.toString(), true);
    this.name.length = 0;

    return null;
  }

  // 8.2.4.1 Data state
  private readData(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        break;
      }

      const c = this.c;
      switch (c) {
        case '&':
          if (this.decodeCharacterReferences) {
            this.state = HtmlTokenizerState.CharacterReferenceInData;
            return null;
          }
          this.data.append(c);
          break;
        case '<':
          this.state = HtmlTokenizerState.TagOpen;
          break;
        default:
          this.data.append(c);
          break;
      }
    } while (this.state === HtmlTokenizerState.Data);

    return this.emitDataToken(this.decodeCharacterReferences, false);
  }

  // 8.2.4.2 Character reference in data state
  private readCharacterReferenceInData(): HtmlToken | null {
    return this.readCharacterReference(HtmlTokenizerState.Data);
  }

  // 8.2.4.3 RCDATA state
  private readRcData(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        break;
      }

      const c = this.c;
      switch (c) {
        case '&':
          if (this.decodeCharacterReferences) {
            this.state = HtmlTokenizerState.CharacterReferenceInRcData;
            return null;
          }
          this.data.append(c);
          break;
        case '<':
          this.state = HtmlTokenizerState.RcDataLessThan;
          return this.emitDataToken(this.decodeCharacterReferences, false);
        default:
          this.data.append(c === '\0' ? REPLACEMENT : c);
          break;
      }
    } while (this.state === HtmlTokenizerState.RcData);

    return this.emitDataToken(this.decodeCharacterReferences, false);
  }

  // 8.2.4.4 Character reference in RCDATA state
  private readCharacterReferenceInRcData(): HtmlToken | null {
    return this.readCharacterReference(HtmlTokenizerState.RcData);
  }

  // 8.2.4.5 RAWTEXT state
  private readRawText(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        break;
      }

      const c = this.c;
      switch (c) {
        case '<':
          this.state = HtmlTokenizerState.RawTextLessThan;
          return this.emitDataToken(false, false);
        default:
          this.data.append(c === '\0' ? REPLACEMENT : c);
          break;
      }
    } while (this.state === HtmlTokenizerState.RawText);

    return this.emitDataToken(false, false);
  }

  // 8.2.4.6 Script data state
  private readScriptData(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        break;
      }

      const c = this.c;
      switch (c) {
        case '<':
          this.state = HtmlTokenizerState.ScriptDataLessThan;
          break;
        default:
          this.data.append(c === '\0' ? REPLACEMENT : c);
          break;
      }
    } while (this.state === HtmlTokenizerState.ScriptData);

    return this.emitScriptDataToken();
  }

  // 8.2.4.7 PLAINTEXT state
  private readPlainText(): HtmlToken | null {
    do {
      while (this.pos < this.end) {
        const c = this.text[this.pos++]!;

        this.linePosition++;

        switch (c) {
          case '\0':
            this.data.append(REPLACEMENT);
            break;
          case '\n':
            this.incrementLineNumber();
            this.data.append(c);
            break;
          default:
            this.data.append(c);
            break;
        }
      }

      this.fillBuffer();
    } while (!this.eof);

    this.state = HtmlTokenizerState.EndOfFile;

    return this.emitDataToken(false, false);
  }

  // 8.2.4.8 Tag open state
  private readTagOpen(): HtmlToken | null {
    if (!this.tryRead()) {
      const token = this.ignoreTruncatedTags ? null : this.createDataToken('<');
      this.state = HtmlTokenizerState.EndOfFile;
      return token;
    }

    const c = this.c;
    // Note: we save the data in case we hit a parse error and have to emit a data token
    this.data.append('<');
    this.data.append(c);

    switch (c) {
      case '!':
        this.state = HtmlTokenizerState.MarkupDeclarationOpen;
        break;
      case '?':
        this.state = HtmlTokenizerState.BogusComment;
        this.data.length = 1;
        this.data.set(0, c);
        break;
      case '/':
        this.state = HtmlTokenizerState.EndTagOpen;
        break;
      default:
        if (isAsciiLetter(c)) {
          this.state = HtmlTokenizerState.TagName;
          this.isEndTag = false;
          this.name.append(c);
        } else {
          this.state = HtmlTokenizerState.Data;
        }
        break;
    }

    return null;
  }

  // 8.2.4.9 End tag open state
  private readEndTagOpen(): HtmlToken | null {
    if (!this.tryRead()) {
      this.state = HtmlTokenizerState.EndOfFile;
      return this.emitDataToken(false, true);
    }

    const c = this.c;
    // Note: we save the data in case we hit a parse error and have to emit a data token
    this.data.append(c);

    switch (c) {
      case '>': // parse error
        this.state = HtmlTokenizerState.Data;
        this.data.length = 0; // FIXME: this is probably wrong
        break;
      default:
        if (isAsciiLetter(c)) {
          this.state = HtmlTokenizerState.TagName;
          this.isEndTag = true;
          this.name.append(c);
        } else {
          this.state = HtmlTokenizerState.BogusComment;
          this.data.length = 1;
          this.data.set(0, c);
        }
        break;
    }

    return null;
  }

  // 8.2.4.10 Tag name state
  private readTagName(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.name.length = 0;

        return this.emitDataToken(false, true);
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          this.state = HtmlTokenizerState.BeforeAttributeName;
          break;
        case '/':
          this.state = HtmlTokenizerState.SelfClosingStartTag;
          break;
        case '>':
          this.tag = this.createTagToken(this.name.toString(), this.isEndTag);
          this.data.length = 0;
          this.name.length = 0;

          return this.emitTagToken();
        default:
          this.name.append(c === '\0' ? REPLACEMENT : c);
          break;
      }
    } while (this.state === HtmlTokenizerState.TagName);

    this.tag = this.createTagToken(this.name.toString(), this.isEndTag);
    this.name.length = 0;

    return null;
  }

  // 8.2.4.11 RCDATA less-than sign state
  private readRcDataLessThan(): HtmlToken | null {
    return this.readGenericRawTextLessThan(HtmlTokenizerState.RcData, HtmlTokenizerState.RcDataEndTagOpen);
  }

  // 8.2.4.12 RCDATA end tag open state
  private readRcDataEndTagOpen(): HtmlToken | null {
    return this.readGenericRawTextEndTagOpen(this.decodeCharacterReferences, HtmlTokenizerState.RcData, HtmlTokenizerState.RcDataEndTagName);
  }

  // 8.2.4.13 RCDATA end tag name state
  private readRcDataEndTagName(): HtmlToken | null {
    return this.readGenericRawTextEndTagName(this.decodeCharacterReferences, HtmlTokenizerState.RcData);
  }

  // 8.2.4.14 RAWTEXT less-than sign state
  private readRawTextLessThan(): HtmlToken | null {
    return this.readGenericRawTextLessThan(HtmlTokenizerState.RawText, HtmlTokenizerState.RawTextEndTagOpen);
  }

  // 8.2.4.15 RAWTEXT end tag open state
  private readRawTextEndTagOpen(): HtmlToken | null {
    return this.readGenericRawTextEndTagOpen(false, HtmlTokenizerState.RawText, HtmlTokenizerState.RawTextEndTagName);
  }

  // 8.2.4.16 RAWTEXT end tag name state
  private readRawTextEndTagName(): HtmlToken | null {
    return this.readGenericRawTextEndTagName(false, HtmlTokenizerState.RawText);
  }

  // 8.2.4.17 Script data less-than sign state
  private readScriptDataLessThan(): HtmlToken | null {
    this.data.append('<');

    if (this.tryPeek() && this.c === '/') {
      this.state = HtmlTokenizerState.ScriptDataEndTagOpen;
      this.consumeCharacter(this.c);
      this.data.append('/');
      this.name.length = 0;
    } else if (this.c === '!') {
      this.state = HtmlTokenizerState.ScriptDataEscapeStart;
      this.consumeCharacter(this.c);
      this.data.append('!');
    } else {
      this.state = HtmlTokenizerState.ScriptData;
    }

    return null;
  }

  // 8.2.4.18 Script data end tag open state
  private readScriptDataEndTagOpen(): HtmlToken | null {
    if (!this.tryPeek()) {
      this.state = HtmlTokenizerState.EndOfFile;
      return this.emitScriptDataToken();
    }

    const c = this.c;
    if (c === 'S' || c === 's') {
      this.state = HtmlTokenizerState.ScriptDataEndTagName;
      this.consumeCharacter(c);
      this.name.append('s');
      this.data.append(c);
    } else {
      this.state = HtmlTokenizerState.ScriptData;
    }

    return null;
  }

  // 8.2.4.19 Script data end tag name state
  private readScriptDataEndTagName(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.name.length = 0;

        return this.emitScriptDataToken();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          if (this.nameIs('script')) {
            this.state = HtmlTokenizerState.BeforeAttributeName;
            break;
          }
          if (!isAsciiLetter(c)) {
            this.state = HtmlTokenizerState.ScriptData;
            this.name.length = 0;
            return null;
          }
          this.name.append(c);
          break;
        case '/':
          if (this.nameIs('script')) {
            this.state = HtmlTokenizerState.SelfClosingStartTag;
            break;
          }
          if (!isAsciiLetter(c)) {
            this.state = HtmlTokenizerState.ScriptData;
            this.name.length = 0;
            return null;
          }
          this.name.append(c);
          break;
        case '>':
          if (this.nameIs('script')) {
            const token = this.createTagToken(this.name.toString(), true);
            this.state = HtmlTokenizerState.Data;
            this.data.length = 0;
            this.name.length = 0;
            return token;
          }
          if (!isAsciiLetter(c)) {
            this.state = HtmlTokenizerState.ScriptData;
            this.name.length = 0;
            return null;
          }
          this.name.append(c);
          break;
        default:
          if (!isAsciiLetter(c)) {
            this.state = HtmlTokenizerState.ScriptData;
            this.name.length = 0;
            return null;
          }
          this.name.append(c === '\0' ? REPLACEMENT : c);
          break;
      }
    } while (this.state === HtmlTokenizerState.ScriptDataEndTagName);

    this.tag = this.createTagToken(this.name.toString(), true);
    this.name.length = 0;

    return null;
  }

  // 8.2.4.20 Script data escape start state
  private readScriptDataEscapeStart(): HtmlToken | null {
    if (this.tryPeek() && this.c === '-') {
      this.state = HtmlTokenizerState.ScriptDataEscapeStartDash;
      this.consumeCharacter(this.c);
      this.data.append('-');
    } else {
      this.state = HtmlTokenizerState.ScriptData;
    }

    return null;
  }

  // 8.2.4.21 Script data escape start dash state
  private readScriptDataEscapeStartDash(): HtmlToken | null {
    if (this.tryPeek() && this.c === '-') {
      this.state = HtmlTokenizerState.ScriptDataEscapedDashDash;
      this.consumeCharacter(this.c);
      this.data.append('-');
    } else {
      this.state = HtmlTokenizerState.ScriptData;
    }

    return null;
  }

  // 8.2.4.22 Script data escaped state
  private readScriptDataEscaped(): HtmlToken | null {
    let token: HtmlToken | null = null;

    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        return this.emitScriptDataToken();
      }

      const c = this.c;
      switch (c) {
        case '-':
          this.state = HtmlTokenizerState.ScriptDataEscapedDash;
          this.data.append('-');
          break;
        case '<':
          this.state = HtmlTokenizerState.ScriptDataEscapedLessThan;
          token = this.emitScriptDataToken();
          this.data.append('<');
          break;
        default:
          this.data.append(c === '\0' ? REPLACEMENT : c);
          break;
      }
    } while (this.state === HtmlTokenizerState.ScriptDataEscaped);

    return token;
  }

  // 8.2.4.23 Script data escaped dash state
  private readScriptDataEscapedDash(): HtmlToken | null {
    if (!this.tryRead()) {
      this.state = HtmlTokenizerState.EndOfFile;
      return this.emitScriptDataToken();
    }

    let token: HtmlToken | null = null;

    const c = this.c;
    switch (c) {
      case '-':
        this.state = HtmlTokenizerState.ScriptDataEscapedDashDash;
        this.data.append('-');
        break;
      case '<':
        this.state = HtmlTokenizerState.ScriptDataEscapedLessThan;
        token = this.emitScriptDataToken();
        this.data.append('<');
        break;
      default:
        this.state = HtmlTokenizerState.ScriptDataEscaped;
        this.data.append(c === '\0' ? REPLACEMENT : c);
        break;
    }

    return token;
  }

  // 8.2.4.24 Script data escaped dash dash state
  private readScriptDataEscapedDashDash(): HtmlToken | null {
    let token: HtmlToken | null = null;

    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        return this.emitScriptDataToken();
      }

      const c = this.c;
      switch (c) {
        case '-':
          this.data.append('-');
          break;
        case '<':
          this.state = HtmlTokenizerState.ScriptDataEscapedLessThan;
          token = this.emitScriptDataToken();
          this.data.append('<');
          break;
        case '>':
          this.state = HtmlTokenizerState.ScriptData;
          this.data.append('>');
          break;
        default:
          this.state = HtmlTokenizerState.ScriptDataEscaped;
          this.data.append(c);
          break;
      }
    } while (this.state === HtmlTokenizerState.ScriptDataEscapedDashDash);

    return token;
  }

  // 8.2.4.25 Script data escaped less-than sign state
  private readScriptDataEscapedLessThan(): HtmlToken | null {
    if (!this.tryPeek()) {
      this.state = HtmlTokenizerState.ScriptDataEscaped;
      return null;
    }

    const c = this.c;
    if (c === '/') {
      this.state = HtmlTokenizerState.ScriptDataEscapedEndTagOpen;
      this.consumeCharacter(c);
      this.data.append(c);
      this.name.length = 0;
    } else if (isAsciiLetter(c)) {
      this.state = HtmlTokenizerState.ScriptDataDoubleEscapeStart;
      this.consumeCharacter(c);
      this.data.append(c);
      this.name.append(c);
    } else {
      this.state = HtmlTokenizerState.ScriptDataEscaped;
    }

    return null;
  }

  // 8.2.4.26 Script data escaped end tag open state
  private readScriptDataEscapedEndTagOpen(): HtmlToken | null {
    if (!this.tryPeek()) {
      this.state = HtmlTokenizerState.EndOfFile;
      return this.emitScriptDataToken();
    }

    const c = this.c;
    if (isAsciiLetter(c)) {
      this.state = HtmlTokenizerState.ScriptDataEscapedEndTagName;
      this.consumeCharacter(c);
      this.data.append(c);
      this.name.append(c);
    } else {
      this.state = HtmlTokenizerState.ScriptDataEscaped;
    }

    return null;
  }

  // 8.2.4.27 Script data escaped end tag name state
  private readScriptDataEscapedEndTagName(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.name.length = 0;

        return this.emitScriptDataToken();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          if (this.nameIs('script')) {
            this.state = HtmlTokenizerState.BeforeAttributeName;
            break;
          }
          if (!isAsciiLetter(c)) {
            this.state = HtmlTokenizerState.ScriptData;
            return null;
          }
          this.name.append(c);
          break;
        case '/':
          if (this.nameIs('script')) {
            this.state = HtmlTokenizerState.SelfClosingStartTag;
            break;
          }
          if (!isAsciiLetter(c)) {
            this.state = HtmlTokenizerState.ScriptData;
            return null;
          }
          this.name.append(c);
          break;
        case '>':
          if (this.nameIs('script')) {
            const token = this.createTagToken(this.name.toString(), true);
            this.state = HtmlTokenizerState.Data;
            this.data.length = 0;
            this.name.length = 0;
            return token;
          }
          if (!isAsciiLetter(c)) {
            this.state = HtmlTokenizerState.ScriptData;
            return null;
          }
          this.name.append(c);
          break;
        default:
          if (!isAsciiLetter(c)) {
            this.state = HtmlTokenizerState.ScriptData;
            return null;
          }
          this.name.append(c);
          break;
      }
    } while (this.state === HtmlTokenizerState.ScriptDataEscapedEndTagName);

    this.tag = this.createTagToken(this.name.toString(), true);
    this.name.length = 0;

    return null;
  }

  // 8.2.4.28 Script data double escape start state
  private readScriptDataDoubleEscapeStart(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.name.length = 0;

        return this.emitScriptDataToken();
      }

      const c = this.c;
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ': case '/': case '>':
          if (this.nameIs('script')) this.state = HtmlTokenizerState.ScriptDataDoubleEscaped;
          else this.state = HtmlTokenizerState.ScriptDataEscaped;
          this.name.length = 0;
          break;
        default:
          if (!isAsciiLetter(c)) this.state = HtmlTokenizerState.ScriptDataEscaped;
          else this.name.append(c);
          break;
      }
    } while (this.state === HtmlTokenizerState.ScriptDataDoubleEscapeStart);

    return null;
  }

  // 8.2.4.29 Script data double escaped state
  private readScriptDataDoubleEscaped(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        return this.emitScriptDataToken();
      }

      const c = this.c;
      switch (c) {
        case '-':
          this.state = HtmlTokenizerState.ScriptDataDoubleEscapedDash;
          this.data.append('-');
          break;
        case '<':
          this.state = HtmlTokenizerState.ScriptDataDoubleEscapedLessThan;
          this.data.append('<');
          break;
        default:
          this.data.append(c === '\0' ? REPLACEMENT : c);
          break;
      }
    } while (this.state === HtmlTokenizerState.ScriptDataEscaped);

    return null;
  }

  // 8.2.4.30 Script data double escaped dash state
  private readScriptDataDoubleEscapedDash(): HtmlToken | null {
    if (!this.tryRead()) {
      this.state = HtmlTokenizerState.EndOfFile;
      return this.emitScriptDataToken();
    }

    const c = this.c;
    switch (c) {
      case '-':
        this.state = HtmlTokenizerState.ScriptDataDoubleEscapedDashDash;
        this.data.append('-');
        break;
      case '<':
        this.state = HtmlTokenizerState.ScriptDataDoubleEscapedLessThan;
        this.data.append('<');
        break;
      default:
        this.state = HtmlTokenizerState.ScriptDataDoubleEscaped;
        this.data.append(c === '\0' ? REPLACEMENT : c);
        break;
    }

    return null;
  }

  // 8.2.4.31 Script data double escaped dash dash state
  private readScriptDataDoubleEscapedDashDash(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        return this.emitScriptDataToken();
      }

      const c = this.c;
      switch (c) {
        case '-':
          this.data.append('-');
          break;
        case '<':
          this.state = HtmlTokenizerState.ScriptDataDoubleEscapedLessThan;
          this.data.append('<');
          break;
        case '>':
          this.state = HtmlTokenizerState.ScriptData;
          this.data.append('>');
          break;
        default:
          this.state = HtmlTokenizerState.ScriptDataDoubleEscaped;
          this.data.append(c);
          break;
      }
    } while (this.state === HtmlTokenizerState.ScriptDataEscapedDashDash);

    return null;
  }

  // 8.2.4.32 Script data double escaped less-than sign state
  private readScriptDataDoubleEscapedLessThan(): HtmlToken | null {
    if (this.tryPeek() && this.c === '/') {
      this.state = HtmlTokenizerState.ScriptDataDoubleEscapeEnd;
      this.consumeCharacter(this.c);
      this.data.append('/');
    } else {
      this.state = HtmlTokenizerState.ScriptDataDoubleEscaped;
    }

    return null;
  }

  // 8.2.4.33 Script data double escape end state
  private readScriptDataDoubleEscapeEnd(): HtmlToken | null {
    do {
      this.tryPeek();
      const c = this.c;

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ': case '/': case '>':
          if (this.nameIs('script')) this.state = HtmlTokenizerState.ScriptDataEscaped;
          else this.state = HtmlTokenizerState.ScriptDataDoubleEscaped;
          this.consumeCharacter(c);
          this.data.append(c);
          break;
        default:
          if (!isAsciiLetter(c)) {
            // Note: EOF also hits this case.
            this.state = HtmlTokenizerState.ScriptDataDoubleEscaped;
          } else {
            this.consumeCharacter(c);
            this.name.append(c);
            this.data.append(c);
          }
          break;
      }
    } while (this.state === HtmlTokenizerState.ScriptDataDoubleEscapeEnd);

    return null;
  }

  // 8.2.4.34 Before attribute name state
  private readBeforeAttributeName(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.tag = null;

        return this.emitDataToken(false, true);
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          break;
        case '/':
          this.state = HtmlTokenizerState.SelfClosingStartTag;
          return null;
        case '>':
          return this.emitTagToken();
        case '"': case '\'': case '<': case '=':
          // parse error -> goto default
          this.state = HtmlTokenizerState.AttributeName;
          this.name.append(c);
          return null;
        default:
          this.state = HtmlTokenizerState.AttributeName;
          this.name.append(c === '\0' ? REPLACEMENT : c);
          return null;
      }
    } while (true);
  }

  // 8.2.4.35 Attribute name state
  private readAttributeName(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.name.length = 0;
        this.tag = null;

        return this.emitDataToken(false, true);
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          this.state = HtmlTokenizerState.AfterAttributeName;
          break;
        case '/':
          this.state = HtmlTokenizerState.SelfClosingStartTag;
          break;
        case '=':
          this.state = HtmlTokenizerState.BeforeAttributeValue;
          break;
        case '>':
          this.emitTagAttribute();

          return this.emitTagToken();
        default:
          this.name.append(c === '\0' ? REPLACEMENT : c);
          break;
      }
    } while (this.state === HtmlTokenizerState.AttributeName);

    this.emitTagAttribute();

    return null;
  }

  // 8.2.4.36 After attribute name state
  private readAfterAttributeName(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.tag = null;

        return this.emitDataToken(false, true);
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          break;
        case '/':
          this.state = HtmlTokenizerState.SelfClosingStartTag;
          return null;
        case '=':
          this.state = HtmlTokenizerState.BeforeAttributeValue;
          return null;
        case '>':
          return this.emitTagToken();
        case '"': case '\'': case '<':
          // parse error -> goto default
          this.state = HtmlTokenizerState.AttributeName;
          this.name.append(c);
          return null;
        default:
          this.state = HtmlTokenizerState.AttributeName;
          this.name.append(c === '\0' ? REPLACEMENT : c);
          return null;
      }
    } while (true);
  }

  // 8.2.4.37 Before attribute value state
  private readBeforeAttributeValue(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.tag = null;

        return this.emitDataToken(false, true);
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          break;
        case '"': case '\'':
          this.state = HtmlTokenizerState.AttributeValueQuoted;
          this.quote = c;
          return null;
        case '&':
          this.state = HtmlTokenizerState.CharacterReferenceInAttributeValue;
          return null;
        case '/':
          this.state = HtmlTokenizerState.SelfClosingStartTag;
          return null;
        case '>':
          return this.emitTagToken();
        case '<': case '=': case '`':
          // parse error -> goto default
          this.state = HtmlTokenizerState.AttributeValueUnquoted;
          this.name.append(c);
          return null;
        default:
          this.state = HtmlTokenizerState.AttributeValueUnquoted;
          this.name.append(c === '\0' ? REPLACEMENT : c);
          return null;
      }
    } while (true);
  }

  // 8.2.4.38 Attribute value (double-quoted) state
  private readAttributeValueQuoted(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.name.length = 0;

        return this.emitDataToken(false, true);
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '&':
          this.state = HtmlTokenizerState.CharacterReferenceInAttributeValue;
          return null;
        case '\0':
          this.name.append(REPLACEMENT);
          break;
        default:
          if (c === this.quote) {
            this.state = HtmlTokenizerState.AfterAttributeValueQuoted;
            this.quote = '\0';
            break;
          }

          this.name.append(c);
          break;
      }
    } while (this.state === HtmlTokenizerState.AttributeValueQuoted);

    this.attribute!.value = this.name.toString();
    this.name.length = 0;

    return null;
  }

  // 8.2.4.40 Attribute value (unquoted) state
  private readAttributeValueUnquoted(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.name.length = 0;

        return this.emitDataToken(false, true);
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          this.state = HtmlTokenizerState.BeforeAttributeName;
          break;
        case '&':
          this.state = HtmlTokenizerState.CharacterReferenceInAttributeValue;
          return null;
        case '>':
          this.attribute!.value = this.name.toString();
          this.name.length = 0;

          return this.emitTagToken();
        case '\'': case '<': case '=': case '`':
          // parse error -> goto default
          this.name.append(c);
          break;
        default:
          this.name.append(c === '\0' ? REPLACEMENT : c);
          break;
      }
    } while (this.state === HtmlTokenizerState.AttributeValueUnquoted);

    this.attribute!.value = this.name.toString();
    this.name.length = 0;

    return null;
  }

  // 8.2.4.41 Character reference in attribute value state
  private readCharacterReferenceInAttributeValue(): HtmlToken | null {
    const additionalAllowedCharacter = this.quote === '\0' ? '>' : this.quote;

    if (!this.tryPeek()) {
      this.state = HtmlTokenizerState.EndOfFile;
      this.name.length = 0;

      return this.emitDataToken(false, true);
    }

    const c = this.c;
    switch (c) {
      case '\t': case '\r': case '\n': case '\f': case ' ': case '<': case '&':
        // no character is consumed, emit '&'
        this.name.append('&');
        break;
      default:
        if (c === additionalAllowedCharacter) {
          // this is not a character reference, nothing is consumed
          this.name.append('&');
          break;
        }

        this.entity.push('&');

        while (this.entity.push(this.c)) {
          this.consumeCharacter(this.c);

          if (this.c === ';') break;

          if (!this.tryPeek()) {
            this.state = HtmlTokenizerState.EndOfFile;
            this.data.length--;
            this.data.append(this.entity.getPushedInput());
            this.entity.reset();

            return this.emitDataToken(false, true);
          }
        }

        {
          const pushed = this.entity.getPushedInput();
          let value: string;

          if (this.c === '=' || isAlphaNumeric(this.c)) value = pushed;
          else value = this.entity.getValue();

          this.data.length--;
          this.data.append(pushed);
          this.name.append(value);
          this.entity.reset();
        }
        break;
    }

    if (this.quote === '\0') this.state = HtmlTokenizerState.AttributeValueUnquoted;
    else this.state = HtmlTokenizerState.AttributeValueQuoted;

    return null;
  }

  // 8.2.4.42 After attribute value (quoted) state
  private readAfterAttributeValueQuoted(): HtmlToken | null {
    let token: HtmlToken | null = null;

    if (!this.tryPeek()) {
      this.state = HtmlTokenizerState.EndOfFile;
      return this.emitDataToken(false, true);
    }

    const c = this.c;
    switch (c) {
      case '\t': case '\r': case '\n': case '\f': case ' ':
        this.state = HtmlTokenizerState.BeforeAttributeName;
        this.consumeCharacter(c);
        this.data.append(c);
        break;
      case '/':
        this.state = HtmlTokenizerState.SelfClosingStartTag;
        this.consumeCharacter(c);
        this.data.append(c);
        break;
      case '>':
        this.consumeCharacter(c);
        token = this.emitTagToken();
        break;
      default:
        this.state = HtmlTokenizerState.BeforeAttributeName;
        break;
    }

    return token;
  }

  // 8.2.4.43 Self-closing start tag state
  private readSelfClosingStartTag(): HtmlToken | null {
    if (!this.tryRead()) {
      this.state = HtmlTokenizerState.EndOfFile;
      return this.emitDataToken(false, true);
    }

    const c = this.c;
    if (c === '>') {
      this.tag!.isEmptyElement = true;

      return this.emitTagToken();
    }

    // parse error
    this.state = HtmlTokenizerState.BeforeAttributeName;

    // Note: we save the data in case we hit a parse error and have to emit a data token
    this.data.append(c);

    return null;
  }

  // 8.2.4.44 Bogus comment state
  private readBogusComment(): HtmlToken {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        break;
      }

      if (this.c === '>') break;

      this.data.append(this.c === '\0' ? REPLACEMENT : this.c);
    } while (true);

    this.state = HtmlTokenizerState.Data;

    return this.emitCommentToken(this.data, true);
  }

  // 8.2.4.45 Markup declaration open state
  private readMarkupDeclarationOpen(): HtmlToken | null {
    let count = 0;
    let c = '\0';

    while (count < 2) {
      if (!this.tryPeek()) {
        this.state = HtmlTokenizerState.EndOfFile;
        return this.emitDataToken(false, true);
      }

      c = this.c;
      if (c !== '-') break;

      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.consumeCharacter(c);
      this.data.append(c);
      count++;
    }

    if (count === 2) {
      // "<!--"
      this.state = HtmlTokenizerState.CommentStart;
      this.name.length = 0;
      return null;
    }

    if (count === 0) {
      // Check for "<!DOCTYPE " or "<![CDATA["
      if (c === 'D' || c === 'd') {
        // Note: we save the data in case we hit a parse error and have to emit a data token
        this.consumeCharacter(c);
        this.data.append(c);
        this.name.append(c);
        count = 1;

        while (count < 7) {
          if (!this.tryRead()) {
            this.state = HtmlTokenizerState.EndOfFile;
            return this.emitDataToken(false, true);
          }

          c = this.c;
          // Note: we save the data in case we hit a parse error and have to emit a data token
          this.data.append(c);
          this.name.append(c);

          if (toLower(c) !== DocTypeName[count]) break;

          count++;
        }

        if (count === 7) {
          this.doctype = this.createDocTypeToken(this.name.toString());
          this.state = HtmlTokenizerState.DocType;
          this.name.length = 0;
          return null;
        }

        this.name.length = 0;
      } else if (c === '[') {
        // Note: we save the data in case we hit a parse error and have to emit a data token
        this.consumeCharacter(c);
        this.data.append(c);
        count = 1;

        while (count < 7) {
          if (!this.tryRead()) {
            this.state = HtmlTokenizerState.EndOfFile;
            return this.emitDataToken(false, true);
          }

          c = this.c;
          // Note: we save the data in case we hit a parse error and have to emit a data token
          this.data.append(c);

          if (c !== CDataName[count]) break;

          count++;
        }

        if (count === 7) {
          this.state = HtmlTokenizerState.CDataSection;
          this.data.length = 0;
          return null;
        }
      }
    }

    // parse error
    this.state = HtmlTokenizerState.BogusComment;

    // trim the leading "<!"
    for (let i = 0; i < this.data.length - 2; i++) this.data.set(i, this.data.get(i + 2));
    this.data.length -= 2;
    this.bang = true;

    return null;
  }

  // 8.2.4.46 Comment start state
  private readCommentStart(): HtmlToken | null {
    if (!this.tryRead()) {
      this.state = HtmlTokenizerState.Data;

      return this.emitCommentToken('');
    }

    const c = this.c;
    this.data.append(c);

    switch (c) {
      case '-':
        this.state = HtmlTokenizerState.CommentStartDash;
        break;
      case '>': // parse error
        this.state = HtmlTokenizerState.Data;
        return this.emitCommentToken('');
      default:
        this.state = HtmlTokenizerState.Comment;
        this.name.append(c === '\0' ? REPLACEMENT : c);
        break;
    }

    return null;
  }

  // 8.2.4.47 Comment start dash state
  private readCommentStartDash(): HtmlToken | null {
    if (!this.tryRead()) {
      this.state = HtmlTokenizerState.Data;
      return this.emitCommentToken(this.name);
    }

    const c = this.c;
    this.data.append(c);

    switch (c) {
      case '-':
        this.state = HtmlTokenizerState.CommentEnd;
        break;
      case '>': // parse error
        this.state = HtmlTokenizerState.Data;
        return this.emitCommentToken(this.name);
      default:
        this.state = HtmlTokenizerState.Comment;
        this.name.append('-');
        this.name.append(c === '\0' ? REPLACEMENT : c);
        break;
    }

    return null;
  }

  // 8.2.4.48 Comment state
  private readComment(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        return this.emitCommentToken(this.name);
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '-':
          this.state = HtmlTokenizerState.CommentEndDash;
          return null;
        default:
          this.name.append(c === '\0' ? REPLACEMENT : c);
          break;
      }
    } while (true);
  }

  // 8.2.4.49 Comment end dash state
  private readCommentEndDash(): HtmlToken | null {
    if (!this.tryRead()) {
      this.state = HtmlTokenizerState.Data;
      return this.emitCommentToken(this.name);
    }

    const c = this.c;
    this.data.append(c);

    switch (c) {
      case '-':
        this.state = HtmlTokenizerState.CommentEnd;
        break;
      default:
        this.state = HtmlTokenizerState.Comment;
        this.name.append('-');
        this.name.append(c === '\0' ? REPLACEMENT : c);
        break;
    }

    return null;
  }

  // 8.2.4.50 Comment end state
  private readCommentEnd(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        return this.emitCommentToken(this.name);
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '>':
          this.state = HtmlTokenizerState.Data;
          return this.emitCommentToken(this.name);
        case '!': // parse error
          this.state = HtmlTokenizerState.CommentEndBang;
          return null;
        case '-':
          this.name.append('-');
          break;
        default:
          this.state = HtmlTokenizerState.Comment;
          this.name.append('--');
          this.name.append(c === '\0' ? REPLACEMENT : c);
          return null;
      }
    } while (true);
  }

  // 8.2.4.51 Comment end bang state
  private readCommentEndBang(): HtmlToken | null {
    if (!this.tryRead()) {
      this.state = HtmlTokenizerState.EndOfFile;
      return this.emitCommentToken(this.name);
    }

    const c = this.c;
    this.data.append(c);

    switch (c) {
      case '-':
        this.state = HtmlTokenizerState.CommentEndDash;
        this.name.append('--!');
        break;
      case '>':
        this.state = HtmlTokenizerState.Data;
        return this.emitCommentToken(this.name);
      default: // parse error
        this.state = HtmlTokenizerState.Comment;
        this.name.append('--!');
        this.name.append(c === '\0' ? REPLACEMENT : c);
        break;
    }

    return null;
  }

  // 8.2.4.52 DOCTYPE state
  private readDocType(): HtmlToken | null {
    if (!this.tryPeek()) {
      this.state = HtmlTokenizerState.EndOfFile;
      this.doctype!.forceQuirksMode = true;
      this.name.length = 0;

      return this.emitDocType();
    }

    this.state = HtmlTokenizerState.BeforeDocTypeName;

    const c = this.c;
    switch (c) {
      case '\t': case '\r': case '\n': case '\f': case ' ':
        this.consumeCharacter(c);
        this.data.append(c);
        break;
    }

    return null;
  }

  // 8.2.4.53 Before DOCTYPE name state
  private readBeforeDocTypeName(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.doctype!.forceQuirksMode = true;
        return this.emitDocType();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          break;
        case '>':
          this.state = HtmlTokenizerState.Data;
          this.doctype!.forceQuirksMode = true;
          return this.emitDocType();
        default:
          this.state = HtmlTokenizerState.DocTypeName;
          this.name.append(c === '\0' ? REPLACEMENT : c);
          return null;
      }
    } while (true);
  }

  // 8.2.4.54 DOCTYPE name state
  private readDocTypeName(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.doctype!.name = this.name.toString();
        this.doctype!.forceQuirksMode = true;
        this.name.length = 0;

        return this.emitDocType();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          this.state = HtmlTokenizerState.AfterDocTypeName;
          break;
        case '>':
          this.state = HtmlTokenizerState.Data;
          this.doctype!.name = this.name.toString();
          this.name.length = 0;

          return this.emitDocType();
        case '\0':
          this.name.append(REPLACEMENT);
          break;
        default:
          this.name.append(c);
          break;
      }
    } while (this.state === HtmlTokenizerState.DocTypeName);

    this.doctype!.name = this.name.toString();
    this.name.length = 0;

    return null;
  }

  // 8.2.4.55 After DOCTYPE name state
  private readAfterDocTypeName(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.doctype!.forceQuirksMode = true;
        return this.emitDocType();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          break;
        case '>':
          this.state = HtmlTokenizerState.Data;
          return this.emitDocType();
        default:
          this.name.append(c);
          if (this.name.length < 6) break;

          if (this.nameIs('public')) {
            this.state = HtmlTokenizerState.AfterDocTypePublicKeyword;
            this.doctype!.publicKeyword = this.name.toString();
          } else if (this.nameIs('system')) {
            this.state = HtmlTokenizerState.AfterDocTypeSystemKeyword;
            this.doctype!.systemKeyword = this.name.toString();
          } else {
            this.state = HtmlTokenizerState.BogusDocType;
          }

          this.name.length = 0;
          return null;
      }
    } while (true);
  }

  // 8.2.4.56 After DOCTYPE public keyword state
  private readAfterDocTypePublicKeyword(): HtmlToken | null {
    if (!this.tryRead()) {
      this.state = HtmlTokenizerState.EndOfFile;
      this.doctype!.forceQuirksMode = true;
      return this.emitDocType();
    }

    const c = this.c;
    // Note: we save the data in case we hit a parse error and have to emit a data token
    this.data.append(c);

    switch (c) {
      case '\t': case '\r': case '\n': case '\f': case ' ':
        this.state = HtmlTokenizerState.BeforeDocTypePublicIdentifier;
        break;
      case '"': case '\'': // parse error
        this.state = HtmlTokenizerState.DocTypePublicIdentifierQuoted;
        this.doctype!.publicIdentifier = '';
        this.quote = c;
        break;
      case '>': // parse error
        this.state = HtmlTokenizerState.Data;
        this.doctype!.forceQuirksMode = true;
        return this.emitDocType();
      default: // parse error
        this.state = HtmlTokenizerState.BogusDocType;
        this.doctype!.forceQuirksMode = true;
        break;
    }

    return null;
  }

  // 8.2.4.57 Before DOCTYPE public identifier state
  private readBeforeDocTypePublicIdentifier(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.doctype!.forceQuirksMode = true;
        return this.emitDocType();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          break;
        case '"': case '\'':
          this.state = HtmlTokenizerState.DocTypePublicIdentifierQuoted;
          this.doctype!.publicIdentifier = '';
          this.quote = c;
          return null;
        case '>': // parse error
          this.state = HtmlTokenizerState.Data;
          this.doctype!.forceQuirksMode = true;
          return this.emitDocType();
        default: // parse error
          this.state = HtmlTokenizerState.BogusDocType;
          this.doctype!.forceQuirksMode = true;
          return null;
      }
    } while (true);
  }

  // 8.2.4.58 DOCTYPE public identifier (double-quoted) state
  private readDocTypePublicIdentifierQuoted(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.doctype!.publicIdentifier = this.name.toString();
        this.doctype!.forceQuirksMode = true;
        this.name.length = 0;

        return this.emitDocType();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\0': // parse error
          this.name.append(REPLACEMENT);
          break;
        case '>': // parse error
          this.state = HtmlTokenizerState.Data;
          this.doctype!.publicIdentifier = this.name.toString();
          this.doctype!.forceQuirksMode = true;
          this.name.length = 0;

          return this.emitDocType();
        default:
          if (c === this.quote) {
            this.state = HtmlTokenizerState.AfterDocTypePublicIdentifier;
            this.quote = '\0';
            break;
          }

          this.name.append(c);
          break;
      }
    } while (this.state === HtmlTokenizerState.DocTypePublicIdentifierQuoted);

    this.doctype!.publicIdentifier = this.name.toString();
    this.name.length = 0;

    return null;
  }

  // 8.2.4.60 After DOCTYPE public identifier state
  private readAfterDocTypePublicIdentifier(): HtmlToken | null {
    if (!this.tryRead()) {
      this.state = HtmlTokenizerState.EndOfFile;
      this.doctype!.forceQuirksMode = true;
      return this.emitDocType();
    }

    const c = this.c;
    // Note: we save the data in case we hit a parse error and have to emit a data token
    this.data.append(c);

    switch (c) {
      case '\t': case '\r': case '\n': case '\f': case ' ':
        this.state = HtmlTokenizerState.BetweenDocTypePublicAndSystemIdentifiers;
        break;
      case '>':
        this.state = HtmlTokenizerState.Data;
        return this.emitDocType();
      case '"': case '\'': // parse error
        this.state = HtmlTokenizerState.DocTypeSystemIdentifierQuoted;
        this.doctype!.systemIdentifier = '';
        this.quote = c;
        break;
      default: // parse error
        this.state = HtmlTokenizerState.BogusDocType;
        this.doctype!.forceQuirksMode = true;
        break;
    }

    return null;
  }

  // 8.2.4.61 Between DOCTYPE public and system identifiers state
  private readBetweenDocTypePublicAndSystemIdentifiers(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.doctype!.forceQuirksMode = true;
        return this.emitDocType();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          break;
        case '>':
          this.state = HtmlTokenizerState.Data;
          return this.emitDocType();
        case '"': case '\'':
          this.state = HtmlTokenizerState.DocTypeSystemIdentifierQuoted;
          this.doctype!.systemIdentifier = '';
          this.quote = c;
          return null;
        default: // parse error
          this.state = HtmlTokenizerState.BogusDocType;
          this.doctype!.forceQuirksMode = true;
          return null;
      }
    } while (true);
  }

  // 8.2.4.62 After DOCTYPE system keyword state
  private readAfterDocTypeSystemKeyword(): HtmlToken | null {
    if (!this.tryRead()) {
      this.state = HtmlTokenizerState.EndOfFile;
      this.doctype!.forceQuirksMode = true;
      return this.emitDocType();
    }

    const c = this.c;
    // Note: we save the data in case we hit a parse error and have to emit a data token
    this.data.append(c);

    switch (c) {
      case '\t': case '\r': case '\n': case '\f': case ' ':
        this.state = HtmlTokenizerState.BeforeDocTypeSystemIdentifier;
        break;
      case '"': case '\'': // parse error
        this.state = HtmlTokenizerState.DocTypeSystemIdentifierQuoted;
        this.doctype!.systemIdentifier = '';
        this.quote = c;
        break;
      case '>': // parse error
        this.state = HtmlTokenizerState.Data;
        this.doctype!.forceQuirksMode = true;
        return this.emitDocType();
      default: // parse error
        this.state = HtmlTokenizerState.BogusDocType;
        this.doctype!.forceQuirksMode = true;
        break;
    }

    return null;
  }

  // 8.2.4.63 Before DOCTYPE system identifier state
  private readBeforeDocTypeSystemIdentifier(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.doctype!.forceQuirksMode = true;
        return this.emitDocType();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          break;
        case '"': case '\'':
          this.state = HtmlTokenizerState.DocTypeSystemIdentifierQuoted;
          this.doctype!.systemIdentifier = '';
          this.quote = c;
          return null;
        case '>': // parse error
          this.state = HtmlTokenizerState.Data;
          this.doctype!.forceQuirksMode = true;
          return this.emitDocType();
        default: // parse error
          this.state = HtmlTokenizerState.BogusDocType;
          this.doctype!.forceQuirksMode = true;
          return null;
      }
    } while (true);
  }

  // 8.2.4.64 DOCTYPE system identifier (double-quoted) state
  private readDocTypeSystemIdentifierQuoted(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.doctype!.systemIdentifier = this.name.toString();
        this.doctype!.forceQuirksMode = true;
        this.name.length = 0;

        return this.emitDocType();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\0': // parse error
          this.name.append(REPLACEMENT);
          break;
        case '>': // parse error
          this.state = HtmlTokenizerState.Data;
          this.doctype!.systemIdentifier = this.name.toString();
          this.doctype!.forceQuirksMode = true;
          this.name.length = 0;

          return this.emitDocType();
        default:
          if (c === this.quote) {
            this.state = HtmlTokenizerState.AfterDocTypeSystemIdentifier;
            this.quote = '\0';
            break;
          }

          this.name.append(c);
          break;
      }
    } while (this.state === HtmlTokenizerState.DocTypeSystemIdentifierQuoted);

    this.doctype!.systemIdentifier = this.name.toString();
    this.name.length = 0;

    return null;
  }

  // 8.2.4.66 After DOCTYPE system identifier state
  private readAfterDocTypeSystemIdentifier(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.doctype!.forceQuirksMode = true;
        return this.emitDocType();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      switch (c) {
        case '\t': case '\r': case '\n': case '\f': case ' ':
          break;
        case '>':
          this.state = HtmlTokenizerState.Data;
          return this.emitDocType();
        default: // parse error
          this.state = HtmlTokenizerState.BogusDocType;
          return null;
      }
    } while (true);
  }

  // 8.2.4.67 Bogus DOCTYPE state
  private readBogusDocType(): HtmlToken | null {
    do {
      if (!this.tryRead()) {
        this.state = HtmlTokenizerState.EndOfFile;
        this.doctype!.forceQuirksMode = true;
        return this.emitDocType();
      }

      const c = this.c;
      // Note: we save the data in case we hit a parse error and have to emit a data token
      this.data.append(c);

      if (c === '>') {
        this.state = HtmlTokenizerState.Data;
        return this.emitDocType();
      }
    } while (true);
  }

  // 8.2.4.68 CDATA section state
  private readCDataSection(): HtmlToken | null {
    do {
      while (this.pos < this.end) {
        const c = this.text[this.pos++]!;

        if (c === '\n') this.incrementLineNumber();
        else this.linePosition++;

        if (this.cdataIndex >= 3) {
          this.data.append(this.cdata[0]!);
          this.cdata[0] = this.cdata[1]!;
          this.cdata[1] = this.cdata[2]!;
          this.cdata[2] = c;

          if (this.cdata[0] === ']' && this.cdata[1] === ']' && this.cdata[2] === '>') {
            this.state = HtmlTokenizerState.Data;
            this.cdataIndex = 0;

            return this.emitCDataToken();
          }
        } else {
          this.cdata[this.cdataIndex++] = c;
        }
      }

      this.fillBuffer();
    } while (!this.eof);

    this.state = HtmlTokenizerState.EndOfFile;

    for (let i = 0; i < this.cdataIndex; i++) this.data.append(this.cdata[i]!);

    this.cdataIndex = 0;

    return this.emitCDataToken();
  }

  /** Read the next token. Returns the token, or null at end-of-file. */
  readNextToken(): HtmlToken | null {
    let token: HtmlToken | null;

    do {
      switch (this.state) {
        case HtmlTokenizerState.Data: token = this.readData(); break;
        case HtmlTokenizerState.CharacterReferenceInData: token = this.readCharacterReferenceInData(); break;
        case HtmlTokenizerState.RcData: token = this.readRcData(); break;
        case HtmlTokenizerState.CharacterReferenceInRcData: token = this.readCharacterReferenceInRcData(); break;
        case HtmlTokenizerState.RawText: token = this.readRawText(); break;
        case HtmlTokenizerState.ScriptData: token = this.readScriptData(); break;
        case HtmlTokenizerState.PlainText: token = this.readPlainText(); break;
        case HtmlTokenizerState.TagOpen: token = this.readTagOpen(); break;
        case HtmlTokenizerState.EndTagOpen: token = this.readEndTagOpen(); break;
        case HtmlTokenizerState.TagName: token = this.readTagName(); break;
        case HtmlTokenizerState.RcDataLessThan: token = this.readRcDataLessThan(); break;
        case HtmlTokenizerState.RcDataEndTagOpen: token = this.readRcDataEndTagOpen(); break;
        case HtmlTokenizerState.RcDataEndTagName: token = this.readRcDataEndTagName(); break;
        case HtmlTokenizerState.RawTextLessThan: token = this.readRawTextLessThan(); break;
        case HtmlTokenizerState.RawTextEndTagOpen: token = this.readRawTextEndTagOpen(); break;
        case HtmlTokenizerState.RawTextEndTagName: token = this.readRawTextEndTagName(); break;
        case HtmlTokenizerState.ScriptDataLessThan: token = this.readScriptDataLessThan(); break;
        case HtmlTokenizerState.ScriptDataEndTagOpen: token = this.readScriptDataEndTagOpen(); break;
        case HtmlTokenizerState.ScriptDataEndTagName: token = this.readScriptDataEndTagName(); break;
        case HtmlTokenizerState.ScriptDataEscapeStart: token = this.readScriptDataEscapeStart(); break;
        case HtmlTokenizerState.ScriptDataEscapeStartDash: token = this.readScriptDataEscapeStartDash(); break;
        case HtmlTokenizerState.ScriptDataEscaped: token = this.readScriptDataEscaped(); break;
        case HtmlTokenizerState.ScriptDataEscapedDash: token = this.readScriptDataEscapedDash(); break;
        case HtmlTokenizerState.ScriptDataEscapedDashDash: token = this.readScriptDataEscapedDashDash(); break;
        case HtmlTokenizerState.ScriptDataEscapedLessThan: token = this.readScriptDataEscapedLessThan(); break;
        case HtmlTokenizerState.ScriptDataEscapedEndTagOpen: token = this.readScriptDataEscapedEndTagOpen(); break;
        case HtmlTokenizerState.ScriptDataEscapedEndTagName: token = this.readScriptDataEscapedEndTagName(); break;
        case HtmlTokenizerState.ScriptDataDoubleEscapeStart: token = this.readScriptDataDoubleEscapeStart(); break;
        case HtmlTokenizerState.ScriptDataDoubleEscaped: token = this.readScriptDataDoubleEscaped(); break;
        case HtmlTokenizerState.ScriptDataDoubleEscapedDash: token = this.readScriptDataDoubleEscapedDash(); break;
        case HtmlTokenizerState.ScriptDataDoubleEscapedDashDash: token = this.readScriptDataDoubleEscapedDashDash(); break;
        case HtmlTokenizerState.ScriptDataDoubleEscapedLessThan: token = this.readScriptDataDoubleEscapedLessThan(); break;
        case HtmlTokenizerState.ScriptDataDoubleEscapeEnd: token = this.readScriptDataDoubleEscapeEnd(); break;
        case HtmlTokenizerState.BeforeAttributeName: token = this.readBeforeAttributeName(); break;
        case HtmlTokenizerState.AttributeName: token = this.readAttributeName(); break;
        case HtmlTokenizerState.AfterAttributeName: token = this.readAfterAttributeName(); break;
        case HtmlTokenizerState.BeforeAttributeValue: token = this.readBeforeAttributeValue(); break;
        case HtmlTokenizerState.AttributeValueQuoted: token = this.readAttributeValueQuoted(); break;
        case HtmlTokenizerState.AttributeValueUnquoted: token = this.readAttributeValueUnquoted(); break;
        case HtmlTokenizerState.CharacterReferenceInAttributeValue: token = this.readCharacterReferenceInAttributeValue(); break;
        case HtmlTokenizerState.AfterAttributeValueQuoted: token = this.readAfterAttributeValueQuoted(); break;
        case HtmlTokenizerState.SelfClosingStartTag: token = this.readSelfClosingStartTag(); break;
        case HtmlTokenizerState.BogusComment: token = this.readBogusComment(); break;
        case HtmlTokenizerState.MarkupDeclarationOpen: token = this.readMarkupDeclarationOpen(); break;
        case HtmlTokenizerState.CommentStart: token = this.readCommentStart(); break;
        case HtmlTokenizerState.CommentStartDash: token = this.readCommentStartDash(); break;
        case HtmlTokenizerState.Comment: token = this.readComment(); break;
        case HtmlTokenizerState.CommentEndDash: token = this.readCommentEndDash(); break;
        case HtmlTokenizerState.CommentEnd: token = this.readCommentEnd(); break;
        case HtmlTokenizerState.CommentEndBang: token = this.readCommentEndBang(); break;
        case HtmlTokenizerState.DocType: token = this.readDocType(); break;
        case HtmlTokenizerState.BeforeDocTypeName: token = this.readBeforeDocTypeName(); break;
        case HtmlTokenizerState.DocTypeName: token = this.readDocTypeName(); break;
        case HtmlTokenizerState.AfterDocTypeName: token = this.readAfterDocTypeName(); break;
        case HtmlTokenizerState.AfterDocTypePublicKeyword: token = this.readAfterDocTypePublicKeyword(); break;
        case HtmlTokenizerState.BeforeDocTypePublicIdentifier: token = this.readBeforeDocTypePublicIdentifier(); break;
        case HtmlTokenizerState.DocTypePublicIdentifierQuoted: token = this.readDocTypePublicIdentifierQuoted(); break;
        case HtmlTokenizerState.AfterDocTypePublicIdentifier: token = this.readAfterDocTypePublicIdentifier(); break;
        case HtmlTokenizerState.BetweenDocTypePublicAndSystemIdentifiers: token = this.readBetweenDocTypePublicAndSystemIdentifiers(); break;
        case HtmlTokenizerState.AfterDocTypeSystemKeyword: token = this.readAfterDocTypeSystemKeyword(); break;
        case HtmlTokenizerState.BeforeDocTypeSystemIdentifier: token = this.readBeforeDocTypeSystemIdentifier(); break;
        case HtmlTokenizerState.DocTypeSystemIdentifierQuoted: token = this.readDocTypeSystemIdentifierQuoted(); break;
        case HtmlTokenizerState.AfterDocTypeSystemIdentifier: token = this.readAfterDocTypeSystemIdentifier(); break;
        case HtmlTokenizerState.BogusDocType: token = this.readBogusDocType(); break;
        case HtmlTokenizerState.CDataSection: token = this.readCDataSection(); break;
        case HtmlTokenizerState.EndOfFile:
        default:
          return null;
      }
    } while (token === null);

    return token;
  }
}
