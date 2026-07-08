import { ContentDisposition } from './content-disposition.js';
import { ContentType } from './content-type.js';
import { FormatOptions } from './format-options.js';
import { HeaderId, toHeaderId, toHeaderName } from './header-id.js';
import { InternetAddressList } from './internet-address-list.js';
import { ParserOptions } from './parser-options.js';
import { err, ok, type Result } from './result.js';
import { isBlank, isFieldText, WHITESPACE } from './utils/byte-extensions.js';
import { utf8, tryGetEncoding, type CharsetEncoding } from './utils/charset-utils.js';
import { enumerateReferences } from './utils/mime-utils.js';
import { skipComment, skipCommentsAndWhiteSpace, skipWhiteSpace } from './utils/parse-utils.js';
import { decodeText, encodeComment, encodeText, foldUnstructuredHeader } from './utils/rfc2047.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ascii = tryGetEncoding('us-ascii') ?? utf8;

type HeaderCtor =
  | [HeaderId | string, string]
  | [string, string]
  | [string | CharsetEncoding, HeaderId | string, string]
  | [string | CharsetEncoding, string, string];

interface Word {
  text: string;
  start: number;
  length: number;
}

export class Header {
  readonly options: ParserOptions;
  readonly rawField: Uint8Array;
  private rawValueStorage: Uint8Array;
  private explicitRawValue = false;
  private textValue: string | null = null;

  offset: number | null = null;
  readonly field: string;
  readonly id: HeaderId;
  readonly isInvalid: boolean;
  onChanged: (() => void) | null = null;

  constructor(...args: HeaderCtor) {
    this.options = ParserOptions.default.clone();
    this.isInvalid = false;

    let charset: CharsetEncoding = utf8;
    let field: string;
    let value: string;
    if (args.length === 2) {
      const id = normalizeHeaderId(args[0]);
      if (id !== null) {
        if (id === HeaderId.Unknown) throw new RangeError('id is not a valid HeaderId');
        field = toHeaderName(id);
        this.id = id;
      } else {
        validateFieldName(args[0]);
        field = args[0];
        this.id = toHeaderId(field);
      }
      value = args[1];
    } else {
      if (args[0] == null) throw new TypeError('charset cannot be null or undefined');
      charset = normalizeCharset(args[0]);
      const id = normalizeHeaderId(args[1]);
      if (id !== null) {
        if (id === HeaderId.Unknown) throw new RangeError('id is not a valid HeaderId');
        field = toHeaderName(id);
        this.id = id;
      } else {
        validateFieldName(args[1]);
        field = args[1];
        this.id = toHeaderId(field);
      }
      value = args[2];
    }

    if (value == null) throw new TypeError('value cannot be null or undefined');
    this.field = field;
    this.rawField = asciiBytes(field);
    this.rawValueStorage = this.formatRawValue(FormatOptions.default, charset, Header.unfold(value.trim()));
    this.textValue = Header.unfold(value.trim());
  }

  static fromRaw(options: ParserOptions, id: HeaderId | string, field: string, rawValue: Uint8Array, invalid = false, rawField?: Uint8Array): Header {
    const headerId = normalizeHeaderId(id) ?? toHeaderId(field);
    const header = Object.create(Header.prototype) as Header;
    (header as { options: ParserOptions }).options = options.clone();
    (header as { id: HeaderId }).id = headerId;
    (header as { field: string }).field = field;
    // C# keeps the raw field bytes verbatim (incl. trailing blanks before the
    // colon); only the Field STRING is trimmed. Byte-parity surface (wave 5).
    (header as { rawField: Uint8Array }).rawField = rawField ?? asciiBytes(field);
    header.rawValueStorage = rawValue;
    header.explicitRawValue = false;
    header.textValue = null;
    header.offset = null;
    (header as { isInvalid: boolean }).isInvalid = invalid;
    header.onChanged = null;
    return header;
  }

  clone(): Header {
    const clone = Header.fromRaw(this.options, this.id, this.field, copyBytes(this.rawValueStorage), this.isInvalid);
    clone.explicitRawValue = this.explicitRawValue;
    clone.textValue = this.textValue;
    clone.offset = this.offset;
    return clone;
  }

  get rawValue(): Uint8Array {
    return this.rawValueStorage;
  }

  get value(): string {
    this.textValue ??= Header.unfold(decodeText(this.options, this.rawValueStorage));
    return this.textValue;
  }

  set value(value: string) {
    this.setValue(FormatOptions.default, utf8, value);
  }

  getValue(charset: string | CharsetEncoding): string {
    if (charset == null) throw new TypeError('charset cannot be null or undefined');
    const options = this.options.clone();
    options.charsetEncoding = normalizeCharset(charset);
    return Header.unfold(decodeText(options, this.rawValueStorage));
  }

  setValue(format: FormatOptions, charset: string | CharsetEncoding, value: string): void;
  setValue(charset: string | CharsetEncoding, value: string): void;
  setValue(a: FormatOptions | string | CharsetEncoding, b: string | CharsetEncoding, c?: string): void {
    const format = a instanceof FormatOptions ? a : FormatOptions.default;
    const charset = normalizeCharset(a instanceof FormatOptions ? b : a);
    const value = a instanceof FormatOptions ? c : b as string;
    if (format == null) throw new TypeError('format cannot be null or undefined');
    if (value == null) throw new TypeError('value cannot be null or undefined');
    this.textValue = Header.unfold(value.trim());
    this.rawValueStorage = this.formatRawValue(format, charset, this.textValue);
    this.explicitRawValue = false;
    this.onChanged?.();
  }

  setRawValue(value: Uint8Array): void {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (value.length === 0 || value[value.length - 1] !== 0x0a)
      throw new TypeError('The raw value MUST end with a new-line character.');
    this.explicitRawValue = true;
    this.rawValueStorage = value;
    this.textValue = null;
    this.onChanged?.();
  }

  getRawValue(format: FormatOptions): Uint8Array {
    if (format.international && !this.explicitRawValue) {
      switch (this.id) {
      case 'DispositionNotificationTo':
      case 'ResentReplyTo':
      case 'ResentSender':
      case 'ResentFrom':
      case 'ResentBcc':
      case 'ResentCc':
      case 'ResentTo':
      case 'ReplyTo':
      case 'Sender':
      case 'From':
      case 'Bcc':
      case 'Cc':
      case 'To':
        return Header.reformatAddressHeader(this.options, format, this.field, this.rawValueStorage);
      case 'Received':
      case 'OriginalMessageId':
      case 'ResentMessageId':
      case 'InReplyTo':
      case 'MessageId':
      case 'ContentId':
      case 'References':
      case 'DispositionNotificationOptions':
      case 'ArcAuthenticationResults':
      case 'AuthenticationResults':
      case 'ArcMessageSignature':
      case 'ArcSeal':
      case 'DkimSignature':
        return this.rawValueStorage;
      case 'ContentDisposition':
        return reformatContentDisposition(this.options, format, utf8, this.rawValueStorage);
      case 'ContentType':
        return reformatContentType(this.options, format, utf8, this.rawValueStorage);
      case 'ListArchive':
      case 'ListHelp':
      case 'ListOwner':
      case 'ListPost':
      case 'ListSubscribe':
      case 'ListUnsubscribe':
        return encodeMailingListCommandHeader(format, utf8, this.field, this.value);
      default:
        return encodeUnstructuredHeader(this.options, format, utf8, this.field, this.value);
      }
    }
    return this.rawValueStorage;
  }

  toString(): string {
    return this.isInvalid ? this.field : `${this.field}: ${this.value}`;
  }

  private formatRawValue(format: FormatOptions, charset: CharsetEncoding, value: string): Uint8Array {
    switch (this.id) {
    case 'DispositionNotificationTo':
    case 'ResentReplyTo':
    case 'ResentSender':
    case 'ResentFrom':
    case 'ResentBcc':
    case 'ResentCc':
    case 'ResentTo':
    case 'ReplyTo':
    case 'Sender':
    case 'From':
    case 'Bcc':
    case 'Cc':
    case 'To':
      return encodeAddressHeader(this.options, format, charset, this.field, value);
    case 'Received':
      return encodeReceivedHeader(format, charset, this.field, value);
    case 'OriginalMessageId':
    case 'ResentMessageId':
    case 'InReplyTo':
    case 'MessageId':
    case 'ContentId':
      return charset.encode(` ${value}${format.newLine}`);
    case 'References':
      return encodeReferencesHeader(format, charset, this.field, value);
    case 'ContentDisposition':
      return encodeContentDisposition(this.options, format, charset, value);
    case 'ContentType':
      return encodeContentType(this.options, format, charset, value);
    case 'DispositionNotificationOptions':
      return encodeDispositionNotificationOptions(format, charset, this.field, value);
    case 'ArcAuthenticationResults':
    case 'AuthenticationResults':
      // deferred(wave-8): AuthenticationResults parser/formatter is not in this TS tree yet.
      return encodeUnstructuredHeader(this.options, format, charset, this.field, value);
    case 'ArcMessageSignature':
    case 'ArcSeal':
    case 'DkimSignature':
      return encodeDkimOrArcSignatureHeader(format, charset, this.field, value);
    case 'ListArchive':
    case 'ListHelp':
    case 'ListOwner':
    case 'ListPost':
    case 'ListSubscribe':
    case 'ListUnsubscribe':
      return encodeMailingListCommandHeader(format, charset, this.field, value);
    default:
      return encodeUnstructuredHeader(this.options, format, charset, this.field, value);
    }
  }

  static unfold(text: string | null | undefined): string {
    if (text == null) return '';
    let i = 0;
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i === text.length) return '';
    const start = i;
    let end = i;
    while (i < text.length) {
      if (!/\s/.test(text[i++]!)) end = i;
    }
    let value = '';
    for (i = start; i < end; i++) {
      if (text[i] !== '\r' && text[i] !== '\n') value += text[i];
    }
    return value;
  }

  static fold(format: FormatOptions, field: string, value: string): string {
    const folded: string[] = [' '];
    let lineLength = field.length + 2;
    let lastLwsp = -1;
    for (const word of tokenizeText(value)) {
      const text = value.slice(word.start, word.start + word.length);
      if (isCharWhiteSpace(text[0]!)) {
        if (lineLength + word.length > format.maxLineLength) {
          for (let i = 0; i < text.length; i++) {
            if (lineLength > format.maxLineLength) {
              folded.push(format.newLine);
              lineLength = 0;
            }
            folded.push(text[i]!);
            lineLength++;
          }
        } else {
          lineLength += word.length;
          folded.push(text);
        }
        lastLwsp = joinedLength(folded) - 1;
        continue;
      }
      if (lastLwsp !== -1 && lineLength + word.length > format.maxLineLength) {
        insertAt(folded, lastLwsp, format.newLine);
        lineLength = 1;
        lastLwsp = -1;
      }
      if (word.length > format.maxLineLength) {
        for (const broken of breakWord(value, word, format, lineLength)) {
          const chunk = value.slice(broken.start, broken.start + broken.length);
          if (lineLength + broken.length > format.maxLineLength) {
            folded.push(format.newLine, ' ');
            lineLength = 1;
          }
          folded.push(chunk);
          lineLength += broken.length;
        }
      } else {
        folded.push(text);
        lineLength += word.length;
      }
    }
    folded.push(format.newLine);
    return folded.join('');
  }

  static reformatAddressHeader(options: ParserOptions, format: FormatOptions, field: string, rawValue: Uint8Array): Uint8Array {
    const parsed = InternetAddressList.parse(rawValue, options);
    if (!parsed.ok) return rawValue;
    const state = { lineLength: field.length + 2 };
    return (format.international ? utf8 : ascii).encode(` ${parsed.value.encode(format, true, state)}${format.newLine}`);
  }

  static parse(input: string | Uint8Array, options = ParserOptions.default, startIndex = 0, length?: number): Result<Header> {
    if (input == null) throw new TypeError('input cannot be null or undefined');
    const buffer = typeof input === 'string' ? encoder.encode(input) : input;
    if (startIndex < 0 || startIndex > buffer.length) throw new RangeError('startIndex out of range');
    const count = length ?? buffer.length - startIndex;
    if (count < 0 || startIndex + count > buffer.length) throw new RangeError('length out of range');
    return parseHeader(options.clone(), buffer.subarray(startIndex, startIndex + count), true);
  }
}

function parseHeader(options: ParserOptions, input: Uint8Array, strict: boolean): Result<Header> {
  let index = 0;
  while (index < input.length && isFieldText(input[index]!)) index++;
  while (index < input.length && isBlank(input[index]!)) index++;
  if (index === input.length || input[index] !== 0x3a) {
    if (strict) return err('invalid-header', 'Header does not contain a field/value separator.', { offset: index });
    const field = asciiString(input);
    return ok(Header.fromRaw(options, 'Unknown', field, new Uint8Array(), true));
  }
  const fieldBytes = copyBytes(input.subarray(0, index));
  const field = asciiString(fieldBytes).replace(/[ \t]+$/g, '');
  index++;
  let value: Uint8Array = copyBytes(input.subarray(index));
  if (strict && (value.length === 0 || value[value.length - 1] !== 0x0a))
    value = concat(value, asciiBytes(FormatOptions.default.newLine));
  return ok(Header.fromRaw(options, toHeaderId(field), field, value, false, fieldBytes));
}

function encodeAddressHeader(options: ParserOptions, format: FormatOptions, charset: CharsetEncoding, field: string, value: string): Uint8Array {
  const parsed = InternetAddressList.parse(value, options);
  if (!parsed.ok) return encodeUnstructuredHeader(options, format, charset, field, value);
  const state = { lineLength: field.length + 2 };
  return (format.international ? utf8 : ascii).encode(` ${parsed.value.encode(format, true, state)}${format.newLine}`);
}

function encodeUnstructuredHeader(_options: ParserOptions, format: FormatOptions, charset: CharsetEncoding, field: string, value: string): Uint8Array {
  if (format.international) return utf8.encode(Header.fold(format, field, value));
  return foldUnstructuredHeader(format, field, encodeText(format, charset, value));
}

function encodeContentDisposition(options: ParserOptions, format: FormatOptions, charset: CharsetEncoding, value: string): Uint8Array {
  const parsed = ContentDisposition.parse(value, options);
  return utf8.encode(parsed.ok ? parsed.value.encode(format, charset) : value);
}

function reformatContentDisposition(options: ParserOptions, format: FormatOptions, charset: CharsetEncoding, rawValue: Uint8Array): Uint8Array {
  const parsed = ContentDisposition.parse(rawValue, options);
  return parsed.ok ? utf8.encode(parsed.value.encode(format, charset)) : rawValue;
}

function encodeContentType(options: ParserOptions, format: FormatOptions, charset: CharsetEncoding, value: string): Uint8Array {
  const parsed = ContentType.parse(value, options);
  return utf8.encode(parsed.ok ? parsed.value.encode(format, charset) : value);
}

function reformatContentType(options: ParserOptions, format: FormatOptions, charset: CharsetEncoding, rawValue: Uint8Array): Uint8Array {
  const parsed = ContentType.parse(rawValue, options);
  return parsed.ok ? utf8.encode(parsed.value.encode(format, charset)) : rawValue;
}

function encodeReceivedHeader(format: FormatOptions, charset: CharsetEncoding, field: string, value: string): Uint8Array {
  const tokens: Array<{ start: number; length: number }> = [];
  let index = 0;
  while (index < value.length) {
    const cursor = strCursor(index);
    skipStringWhiteSpace(value, cursor);
    index = cursor.index;
    if (index >= value.length || value[index] !== '(') break;
    const start = index;
    skipStringComment(value, cursor);
    index = cursor.index;
    tokens.push({ start, length: index - start });
  }
  while (index < value.length && value[index] !== ';') {
    const start = index;
    index = receivedSkipToken(value, index);
    index = skipStringCommentsAndWhiteSpaceLoose(value, index);
    if (index >= value.length || value[index] === ';') {
      const end = trimEnd(value, index);
      tokens.push({ start, length: end - start });
      break;
    }
    index = receivedSkipToken(value, index);
    index = skipStringCommentsAndWhiteSpaceLoose(value, index);
    const end = trimEnd(value, index);
    tokens.push({ start, length: end - start });
  }
  if (index < value.length && value[index] === ';') {
    tokens.push({ start: index, length: 1 });
    index++;
    while (index < value.length && isCharWhiteSpace(value[index]!)) index++;
    if (index < value.length) tokens.push({ start: index, length: trimEnd(value, value.length) - index });
  }

  const out: string[] = [];
  let lineLength = field.length + 1;
  let count = 0;
  for (const token of tokens) {
    const text = value.slice(token.start, token.start + token.length);
    if (count > 0 && lineLength + text.length + 1 > format.maxLineLength) {
      out.push(format.newLine, '\t');
      lineLength = 1;
      count = 0;
    } else if (count === 0 || text !== ';') {
      out.push(' ');
      lineLength++;
    }
    lineLength += text.length;
    out.push(text);
    count++;
  }
  out.push(format.newLine);
  return charset.encode(out.join(''));
}

function encodeReferencesHeader(format: FormatOptions, charset: CharsetEncoding, field: string, value: string): Uint8Array {
  const out: string[] = [];
  let lineLength = field.length + 1;
  let count = 0;
  for (const reference of enumerateReferences(value)) {
    if (count > 0 && lineLength + reference.length + 3 > format.maxLineLength) {
      out.push(format.newLine, '\t');
      lineLength = 1;
      count = 0;
    } else {
      out.push(' ');
      lineLength++;
    }
    out.push('<', reference, '>');
    lineLength += reference.length + 2;
    count++;
  }
  out.push(format.newLine);
  return charset.encode(out.join(''));
}

function encodeDkimOrArcSignatureHeader(format: FormatOptions, charset: CharsetEncoding, field: string, value: string): Uint8Array {
  const out: string[] = [];
  let lineLength = field.length + 1;
  let index = 0;
  while (index < value.length) {
    let token = '';
    while (index < value.length && isCharWhiteSpace(value[index]!)) index++;
    const nameStart = index;
    while (index < value.length && value[index] !== '=') {
      if (!isCharWhiteSpace(value[index]!)) token += value[index];
      index++;
    }
    const name = value.slice(nameStart, index);
    while (index < value.length && value[index] !== ';') {
      if (!isCharWhiteSpace(value[index]!)) token += value[index];
      index++;
    }
    if (index < value.length && value[index] === ';') {
      token += ';';
      index++;
    }
    if (lineLength + token.length + 1 > format.maxLineLength || name === 'bh' || name === 'b') {
      out.push(format.newLine, '\t');
      lineLength = 1;
    } else {
      out.push(' ');
      lineLength++;
    }
    if (token.length > format.maxLineLength) {
      if (name === 'z') lineLength = encodeDkimHeaderList(format, out, lineLength, token, '|');
      else if (name === 'h') lineLength = encodeDkimHeaderList(format, out, lineLength, token, ':');
      else lineLength = encodeDkimLongValue(format, out, lineLength, token);
    } else {
      out.push(token);
      lineLength += token.length;
    }
  }
  out.push(format.newLine);
  return charset.encode(out.join(''));
}

function encodeDkimLongValue(format: FormatOptions, out: string[], lineLength: number, value: string): number {
  let start = 0;
  while (true) {
    const lineLeft = format.maxLineLength - lineLength;
    const index = Math.min(start + lineLeft, value.length);
    out.push(value.slice(start, index));
    lineLength += index - start;
    if (index === value.length) break;
    out.push(format.newLine, '\t');
    lineLength = 1;
    start = index;
  }
  return lineLength;
}

function encodeDkimHeaderList(format: FormatOptions, out: string[], lineLength: number, value: string, delim: string): number {
  const tokens = value.split(delim);
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0) {
      out.push(delim);
      lineLength++;
    }
    const token = tokens[i]!;
    if (lineLength + token.length + 1 > format.maxLineLength) {
      out.push(format.newLine, '\t');
      lineLength = 1;
    }
    out.push(token);
    lineLength += token.length;
  }
  return lineLength;
}

function encodeDispositionNotificationOptions(format: FormatOptions, charset: CharsetEncoding, field: string, value: string): Uint8Array {
  const out: string[] = [];
  let lineLength = field.length + 1;
  let index = 0;
  while (index < value.length) {
    let parameter = '';
    while (index < value.length && isCharWhiteSpace(value[index]!)) index++;
    while (index < value.length && value[index] !== '=') {
      if (!isCharWhiteSpace(value[index]!)) parameter += value[index];
      index++;
    }
    while (index < value.length && value[index] !== ';') {
      if (!isCharWhiteSpace(value[index]!)) parameter += value[index];
      index++;
    }
    if (index < value.length && value[index] === ';') {
      parameter += ';';
      index++;
    }
    if (lineLength + parameter.length + 1 > format.maxLineLength && out.length > 0) {
      out.push(format.newLine, '\t');
      lineLength = 1;
    } else {
      out.push(' ');
      lineLength++;
    }
    out.push(parameter);
    lineLength += parameter.length;
  }
  out.push(format.newLine);
  return charset.encode(out.join(''));
}

function encodeMailingListCommandHeader(format: FormatOptions, charset: CharsetEncoding, field: string, value: string): Uint8Array {
  const out: string[] = [];
  let lineLength = field.length + 1;
  let index = 0;
  while (index < value.length) {
    while (index < value.length && isCharWhiteSpace(value[index]!)) index++;
    if (index >= value.length) break;
    const start = index;
    if (value[index] === '<') {
      while (index < value.length && value[index] !== '>') index++;
      if (index < value.length) {
        index++;
        const url = value.slice(start, index);
        if (lineLength + url.length + 1 < format.maxLineLength) {
          out.push(' ');
          lineLength++;
        } else {
          out.push(format.newLine, ' ');
          lineLength = 1;
        }
        out.push(url);
        lineLength += url.length;
        continue;
      }
    } else if (value[index] === '(') {
      const cursor = strCursor(index);
      if (skipStringComment(value, cursor)) {
        const state = { value: lineLength };
        appendComment(format, charset, out, state, value, start, cursor.index - start);
        lineLength = state.value;
        index = cursor.index;
        continue;
      }
    } else if (value[index] === ',') {
      while (index < value.length && (value[index] === ',' || isCharWhiteSpace(value[index]!))) index++;
      out.push(',');
      lineLength++;
      continue;
    }
    while (index < value.length && !isCharWhiteSpace(value[index]!) && !isMailingListCommandSpecial(value[index]!)) index++;
    lineLength = appendWord(format, out, lineLength, value.slice(start, index));
  }
  out.push(format.newLine);
  return charset.encode(out.join(''));
}

function appendWord(format: FormatOptions, out: string[], lineLength: number, word: string): number {
  if (lineLength + word.length + 1 <= format.maxLineLength) {
    out.push(' ', word);
    return lineLength + word.length + 1;
  }
  if (word.length + 1 <= format.maxLineLength) {
    out.push(format.newLine, ' ', word);
    return word.length + 1;
  }
  let remaining = word.length;
  let index = 0;
  while (true) {
    const wordLength = Math.min(remaining, format.maxLineLength - (lineLength + 1));
    out.push(' ', word.slice(index, index + wordLength));
    lineLength += wordLength + 1;
    remaining -= wordLength;
    index += wordLength;
    if (remaining === 0) break;
    out.push(format.newLine);
    lineLength = 0;
  }
  return lineLength;
}

function appendComment(format: FormatOptions, charset: CharsetEncoding, out: string[], state: { value: number }, value: string, start: number, length: number): void {
  const comment = format.international ? value.slice(start, start + length) : encodeComment(format, charset, value, start + 1, length - 2);
  if (state.value + comment.length + 1 <= format.maxLineLength) {
    out.push(' ', comment);
    state.value += comment.length + 1;
  } else if (comment.length + 1 <= format.maxLineLength) {
    out.push(format.newLine, ' ', comment);
    state.value = comment.length + 1;
  } else {
    let index = 0;
    while (index < comment.length) {
      let wsp = findAny(comment, WHITESPACE, index);
      if (wsp === -1) wsp = comment.length;
      state.value = appendWord(format, out, state.value, comment.slice(index, wsp));
      index = wsp;
      while (index < comment.length && isCharWhiteSpace(comment[index]!)) index++;
    }
  }
}

function normalizeHeaderId(value: HeaderId | string): HeaderId | null {
  if (value === 'Unknown')
    return HeaderId.Unknown;
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(value) && value in HeaderId) {
    const id = HeaderId[value as keyof typeof HeaderId];
    if (typeof id === 'string')
      return id;
  }
  return null;
}

function validateFieldName(field: string): void {
  if (field == null) throw new TypeError('field cannot be null or undefined');
  if (field.length === 0) throw new TypeError('Header field names are not allowed to be empty.');
  for (let i = 0; i < field.length; i++) {
    const c = field.charCodeAt(i);
    if (c >= 127 || !isFieldText(c)) throw new TypeError('Illegal characters in header field name.');
  }
}

function normalizeCharset(charset: string | CharsetEncoding): CharsetEncoding {
  if (charset == null) throw new TypeError('charset cannot be null or undefined');
  if (typeof charset === 'string') return tryGetEncoding(charset) ?? utf8;
  return charset;
}

function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0x7f;
  return bytes;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}

function asciiString(bytes: Uint8Array): string {
  let value = '';
  for (let i = 0; i < bytes.length; i++) value += String.fromCharCode(bytes[i]!);
  return value;
}

function concat(a: Uint8Array<ArrayBufferLike>, b: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
  const c = new Uint8Array(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}

function tokenizeText(text: string): Word[] {
  const words: Word[] = [];
  let index = 0;
  while (index < text.length) {
    let start = index;
    while (index < text.length && !isCharWhiteSpace(text[index]!)) index++;
    if (index > start) words.push({ text, start, length: index - start });
    if (index === text.length) break;
    start = index;
    while (index < text.length && isCharWhiteSpace(text[index]!)) index++;
    words.push({ text, start, length: index - start });
  }
  return words;
}

function breakWord(text: string, word: Word, format: FormatOptions, lineLength: number): Word[] {
  const broken: Word[] = [];
  const end = word.start + word.length;
  let index = word.start;
  lineLength = Math.max(lineLength, 1);
  while (index < end) {
    let len = Math.min(format.maxLineLength - lineLength, end - index);
    if (len <= 0) len = Math.min(format.maxLineLength - 1, end - index);
    const code = text.charCodeAt(index + len - 1);
    if (code >= 0xd800 && code <= 0xdbff) len--;
    broken.push({ text, start: index, length: len });
    index += len;
    lineLength = 1;
  }
  return broken;
}

function joinedLength(parts: string[]): number {
  let length = 0;
  for (const part of parts) length += part.length;
  return length;
}

function insertAt(parts: string[], index: number, value: string): void {
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (index <= offset + part.length) {
      const local = index - offset;
      parts.splice(i, 1, part.slice(0, local), value, part.slice(local));
      return;
    }
    offset += part.length;
  }
  parts.push(value);
}

function isCharWhiteSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\r' || c === '\n';
}

function trimEnd(value: string, index: number): number {
  while (index > 0 && WHITESPACE.includes(value[index - 1]!)) index--;
  return index;
}

function receivedSkipToken(value: string, index: number): number {
  while (index < value.length && !'\t\r\n ( ;'.replace(' ', '').includes(value[index]!) && value[index] !== ' ') index++;
  return index;
}

function strCursor(index: number): { index: number } {
  return { index };
}

function skipStringWhiteSpace(value: string, cursor: { index: number }): void {
  while (cursor.index < value.length && isCharWhiteSpace(value[cursor.index]!)) cursor.index++;
}

function skipStringComment(value: string, cursor: { index: number }): boolean {
  let escaped = false;
  let depth = 1;
  cursor.index++;
  while (cursor.index < value.length && depth > 0) {
    const ch = value[cursor.index]!;
    if (ch === '\\') escaped = !escaped;
    else if (!escaped) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    } else {
      escaped = false;
    }
    cursor.index++;
  }
  return depth === 0;
}

function skipStringCommentsAndWhiteSpaceLoose(value: string, index: number): number {
  // C# runs ParseUtils.SkipCommentsAndWhiteSpace directly on the string —
  // char-wise, not on UTF-8 bytes (review fix: byte/char index confusion).
  let i = index;
  while (i < value.length) {
    const c = value[i]!;
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      i++;
    } else if (c === '(') {
      let depth = 0;
      let escaped = false;
      while (i < value.length) {
        const ch = value[i]!;
        if (ch === '\\') {
          escaped = !escaped;
        } else if (!escaped) {
          if (ch === '(') depth++;
          else if (ch === ')') { depth--; if (depth === 0) { i++; break; } }
        } else {
          escaped = false;
        }
        i++;
      }
      if (depth !== 0) return value.length;
    } else {
      break;
    }
  }
  return i;
}

function isMailingListCommandSpecial(c: string): boolean {
  return c === '<' || c === '(' || c === ',';
}

function findAny(text: string, chars: string, start: number): number {
  for (let i = start; i < text.length; i++) if (chars.includes(text[i]!)) return i;
  return -1;
}
