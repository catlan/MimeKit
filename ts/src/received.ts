import { FormatOptions } from './format-options.js';
import { MailboxAddress } from './mailbox-address.js';
import { err, ok, type Result } from './result.js';
import { isAtom, isDomain, isWhitespace } from './utils/byte-extensions.js';
import { convertToUnicode } from './utils/charset-utils.js';
import { formatDate, parseDate, type DateTimeOffset } from './utils/date-utils.js';
import { tryParseMessageId } from './utils/mime-utils.js';
import { skipWhiteSpace } from './utils/parse-utils.js';

const encoder = new TextEncoder();

export enum ReceivedClauseId {
  None = 0,
  From = 1,
  By = 2,
  Via = 3,
  With = 4,
  Id = 5,
  For = 6,
  Unknown = 7,
}

const keywords = ['from', 'by', 'via', 'with', 'id', 'for'] as const;

export class Received {
  readonly clauses: ReceivedClause[] = [];
  private dateTimeValue: DateTimeOffset | null = null;
  private dateTimeString: string | null = null;

  constructor();
  constructor(from: string, fromTcpInfo: string, by: string, byTcpInfo: string, dateTime: DateTimeOffset);
  constructor(from?: string, fromTcpInfo?: string, by?: string, byTcpInfo?: string, dateTime?: DateTimeOffset) {
    if (arguments.length === 0) return;
    if (from == null) throw new TypeError('from cannot be null or undefined');
    if (fromTcpInfo == null) throw new TypeError('fromTcpInfo cannot be null or undefined');
    if (by == null) throw new TypeError('by cannot be null or undefined');
    if (byTcpInfo == null) throw new TypeError('byTcpInfo cannot be null or undefined');
    this.clauses.push(
      new ReceivedClause(ReceivedClauseId.From, 'from', from, [`[${stripAddressBrackets(fromTcpInfo)}]`], false),
      new ReceivedClause(ReceivedClauseId.By, 'by', by, [`[${stripAddressBrackets(byTcpInfo)}]`], false),
    );
    this.dateTime = dateTime ?? null;
  }

  get Clauses(): ReceivedClause[] { return this.clauses; }

  get dateTime(): DateTimeOffset | null { return this.dateTimeValue; }
  set dateTime(value: DateTimeOffset | null) {
    this.dateTimeValue = value;
    this.dateTimeString = null;
  }
  get DateTime(): DateTimeOffset | null { return this.dateTime; }
  set DateTime(value: DateTimeOffset | null) { this.dateTime = value; }

  get from(): string | null { return this.find(ReceivedClauseId.From)?.value ?? null; }
  set from(value: string | null) { value == null ? this.remove(ReceivedClauseId.From) : this.addOrUpdateValue(ReceivedClauseId.From, value); }
  get From(): string | null { return this.from; }
  set From(value: string | null) { this.from = value; }

  get fromTcpInfo(): string | null { return this.find(ReceivedClauseId.From)?.comments[0] ?? null; }
  set fromTcpInfo(value: string | null) { this.addOrUpdateComment(ReceivedClauseId.From, value); }
  get FromTcpInfo(): string | null { return this.fromTcpInfo; }
  set FromTcpInfo(value: string | null) { this.fromTcpInfo = value; }

  get by(): string | null { return this.find(ReceivedClauseId.By)?.value ?? null; }
  set by(value: string | null) { value == null ? this.remove(ReceivedClauseId.By) : this.addOrUpdateValue(ReceivedClauseId.By, value); }
  get By(): string | null { return this.by; }
  set By(value: string | null) { this.by = value; }

  get byTcpInfo(): string | null { return this.find(ReceivedClauseId.By)?.comments[0] ?? null; }
  set byTcpInfo(value: string | null) { this.addOrUpdateComment(ReceivedClauseId.By, value); }
  get ByTcpInfo(): string | null { return this.byTcpInfo; }
  set ByTcpInfo(value: string | null) { this.byTcpInfo = value; }

  get via(): string | null { return this.find(ReceivedClauseId.Via)?.value ?? null; }
  set via(value: string | null) { value == null ? this.remove(ReceivedClauseId.Via) : this.addOrUpdateValue(ReceivedClauseId.Via, value); }
  get Via(): string | null { return this.via; }
  set Via(value: string | null) { this.via = value; }

  get with(): string | null { return this.find(ReceivedClauseId.With)?.value ?? null; }
  set with(value: string | null) { value == null ? this.remove(ReceivedClauseId.With) : this.addOrUpdateValue(ReceivedClauseId.With, value); }
  get With(): string | null { return this.with; }
  set With(value: string | null) { this.with = value; }

  get id(): string | null { return this.find(ReceivedClauseId.Id)?.value ?? null; }
  set id(value: string | null) { value == null ? this.remove(ReceivedClauseId.Id) : this.addOrUpdateValue(ReceivedClauseId.Id, value); }
  get Id(): string | null { return this.id; }
  set Id(value: string | null) { this.id = value; }

  get for(): string | null { return this.find(ReceivedClauseId.For)?.value ?? null; }
  set for(value: string | null) { value == null ? this.remove(ReceivedClauseId.For) : this.addOrUpdateValue(ReceivedClauseId.For, value); }
  get For(): string | null { return this.for; }
  set For(value: string | null) { this.for = value; }

  private find(id: ReceivedClauseId): ReceivedClause | undefined {
    return this.clauses.find((clause) => clause.id === id);
  }

  private addOrUpdateComment(id: ReceivedClauseId, comment: string | null): void {
    const clause = this.find(id);
    const unfolded = comment == null ? null : unfold(comment);
    if (clause != null) {
      clause.comments.length = 0;
      if (unfolded != null) clause.comments.push(unfolded);
    } else if (unfolded != null) {
      this.clauses.push(new ReceivedClause(id, keywords[id - 1]!, '', [unfolded], false));
      this.clauses.sort((a, b) => a.id - b.id);
    }
  }

  private addOrUpdateValue(id: ReceivedClauseId, value: string): void {
    const clause = this.find(id);
    if (clause != null) clause.value = value;
    else {
      this.clauses.push(new ReceivedClause(id, keywords[id - 1]!, value));
      this.clauses.sort((a, b) => a.id - b.id);
    }
  }

  private remove(id: ReceivedClauseId): void {
    const index = this.clauses.findIndex((clause) => clause.id === id);
    if (index !== -1) this.clauses.splice(index, 1);
  }

  toString(options = FormatOptions.default): string {
    if (options == null) throw new TypeError('options cannot be null or undefined');
    const builder: string[] = [];
    let lineLength = 'Received:'.length;
    for (const clause of this.clauses)
      lineLength = appendClause(options, builder, lineLength, clause);
    if (this.dateTimeValue != null) {
      if (lineLength + 1 > options.maxLineLength) {
        builder.push(options.newLine, '\t');
        lineLength = 1;
      }
      builder.push(';');
      lineLength++;
      const stamp = this.dateTimeString ?? formatDate(this.dateTimeValue);
      builder.push(lineLength + 1 + stamp.length > options.maxLineLength ? `${options.newLine}\t` : ' ', stamp);
    }
    builder.push(options.newLine);
    return builder.join('');
  }

  static parse(buffer: Uint8Array, startIndex = 0, length = buffer?.length - startIndex): Result<Received> {
    if (!(buffer instanceof Uint8Array)) return err('argument-null', 'buffer cannot be null or undefined');
    if (!validRange(buffer, startIndex, length)) return err('argument-out-of-range', 'startIndex and length do not specify a valid range');
    return parseReceived(buffer, startIndex, length, false);
  }

  static tryParse(buffer: Uint8Array | null | undefined, startIndex = 0, length = (buffer?.length ?? 0) - startIndex): Result<Received> {
    if (!(buffer instanceof Uint8Array) || !validRange(buffer, startIndex, length))
      return err('invalid-arguments', 'Invalid arguments.');
    return parseReceived(buffer, startIndex, length, false);
  }

  static fromParsed(clauses: ReceivedClause[], dateTime: DateTimeOffset | null, dateTimeString: string | null): Received {
    const received = new Received();
    received.clauses.push(...clauses);
    received.dateTimeValue = dateTime;
    received.dateTimeString = dateTimeString;
    return received;
  }
}

export class ReceivedClause {
  readonly id: ReceivedClauseId;
  readonly keyword: string;
  readonly comments: string[];
  private valueStorage = '';

  constructor(keyword: string, value: string, comment?: string);
  constructor(id: ReceivedClauseId, keyword: string, value: string, comments?: string[], validate?: boolean);
  constructor(a: string | ReceivedClauseId, b: string, c?: string, d?: string[] | string, validate = true) {
    if (typeof a === 'number') {
      this.id = a;
      this.keyword = b;
      this.comments = Array.isArray(d) ? d : typeof d === 'string' ? [d] : [];
      if (validate) this.value = c ?? '';
      else this.valueStorage = c ?? '';
    } else {
      if (a == null) throw new TypeError('keyword cannot be null or undefined');
      if (b == null) throw new TypeError('value cannot be null or undefined');
      this.keyword = a;
      this.id = keywordToId(a);
      this.comments = typeof c === 'string' ? [c] : [];
      this.value = b;
    }
  }

  get Id(): ReceivedClauseId { return this.id; }
  get Keyword(): string { return this.keyword; }
  get Comments(): string[] { return this.comments; }
  get value(): string { return this.valueStorage; }
  set value(value: string) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    validateClauseValue(this.id, value);
    this.valueStorage = value;
  }
  get Value(): string { return this.value; }
  set Value(value: string) { this.value = value; }
}

function parseReceived(rawValue: Uint8Array, startIndex: number, length: number, _throwOnError: boolean): Result<Received> {
  const clauses: ReceivedClause[] = [];
  let id = ReceivedClauseId.None;
  let clause: ReceivedClause | null = null;
  const endIndex = startIndex + length;
  let index = startIndex;
  let clauseMask = 0;

  while (index < endIndex) {
    const cursor = { index };
    skipWhiteSpace(rawValue, cursor, endIndex);
    index = cursor.index;
    if (index >= endIndex || rawValue[index] !== 0x28) break;
    const comment = parseComment(rawValue, { index }, endIndex);
    if (!comment.ok) return comment;
    index = comment.value.index;
    clause ??= new ReceivedClause(ReceivedClauseId.None, '', '', [], false);
    if (!clauses.includes(clause)) clauses.push(clause);
    clause.comments.push(comment.value.comment);
  }

  while (index < endIndex && rawValue[index] !== 0x3b) {
    const keywordIndex = index;
    const keywordResult = parseKeyword(rawValue, { index }, endIndex);
    const keyword = keywordResult.keyword;
    index = keywordResult.index;
    const state = updateState(clauseMask, keyword, keywordIndex, index);
    if (!state.ok) return state;
    clauseMask = state.value.mask;
    id = state.value.id;

    const comments: string[] = [];
    while (index < endIndex) {
      const cursor = { index };
      skipWhiteSpace(rawValue, cursor, endIndex);
      index = cursor.index;
      if (index >= endIndex || rawValue[index] !== 0x28) break;
      const comment = parseComment(rawValue, { index }, endIndex);
      if (!comment.ok) return comment;
      index = comment.value.index;
      comments.push(comment.value.comment);
    }

    if (index >= endIndex || rawValue[index] === 0x3b) {
      clauses.push(new ReceivedClause(id, keyword, '', comments, false));
      break;
    }

    const first = tryParseValue(rawValue, { index }, endIndex);
    if (!first.ok) {
      clauses.push(new ReceivedClause(id, keyword, '', comments, false));
      continue;
    }
    let value = first.value.value;
    index = first.value.index;

    while (true) {
      const cursor = { index };
      skipWhiteSpace(rawValue, cursor, endIndex);
      index = cursor.index;
      if (index >= endIndex || rawValue[index] === 0x3b || rawValue[index] === 0x28) break;
      const token = tryParseValue(rawValue, { index }, endIndex);
      if (!token.ok) break;
      value += ` ${token.value.value}`;
      index = token.value.index;
    }

    while (index < endIndex) {
      const cursor = { index };
      skipWhiteSpace(rawValue, cursor, endIndex);
      index = cursor.index;
      if (index >= endIndex || rawValue[index] !== 0x28) break;
      const comment = parseComment(rawValue, { index }, endIndex);
      if (!comment.ok) return comment;
      index = comment.value.index;
      comments.push(comment.value.comment);
    }
    clauses.push(new ReceivedClause(id, keyword, value, comments, false));
  }

  if (index < endIndex && rawValue[index] === 0x3b) {
    index++;
    const cursor = { index };
    skipWhiteSpace(rawValue, cursor, endIndex);
    index = cursor.index;
    let dateEnd = endIndex;
    while (dateEnd > index && isWhitespace(rawValue[dateEnd - 1]!)) dateEnd--;
    let dateTime: DateTimeOffset | null = null;
    let dateTimeString: string | null = null;
    if (index < dateEnd) {
      const bytes = rawValue.subarray(index, dateEnd);
      const parsed = parseDate(bytes);
      if (!parsed.ok) return err({ kind: 'invalid-date-time', message: `Invalid date-time format at offset ${index}`, offset: index, tokenIndex: index, errorIndex: dateEnd } as never);
      dateTime = parsed.value;
      dateTimeString = unfold(convertToUnicode(bytes));
    }
    return ok(Received.fromParsed(clauses, dateTime, dateTimeString));
  }

  return ok(Received.fromParsed(clauses, null, null));
}

function parseKeyword(rawValue: Uint8Array, state: { index: number }, endIndex: number): { keyword: string; index: number } {
  const start = state.index;
  while (state.index < endIndex && !isEndOfToken(rawValue[state.index]!)) state.index++;
  return { keyword: convertToUnicode(rawValue.subarray(start, state.index)), index: state.index };
}

function tryParseValue(rawValue: Uint8Array, state: { index: number }, endIndex: number): Result<{ value: string; index: number }> {
  const start = state.index;
  while (state.index < endIndex && !isEndOfToken(rawValue[state.index]!)) state.index++;
  const token = ascii(rawValue, start, state.index).toLowerCase();
  if (keywords.includes(token as never)) return err('keyword', 'keyword');
  return ok({ value: convertToUnicode(rawValue.subarray(start, state.index)), index: state.index });
}

function parseComment(rawValue: Uint8Array, state: { index: number }, endIndex: number): Result<{ comment: string; index: number }> {
  const startIndex = state.index++;
  const bytes: number[] = [];
  let escaped = false;
  let depth = 1;
  while (state.index < endIndex) {
    const c = rawValue[state.index]!;
    if (escaped) {
      if (!isWhitespace(c)) bytes.push(c);
      else if (c !== 0x0d && c !== 0x0a) bytes.push(0x20);
      escaped = false;
    } else if (c === 0x5c) {
      escaped = true;
    } else if (c === 0x28) {
      bytes.push(c);
      depth++;
    } else if (c === 0x29) {
      if (--depth === 0) break;
      bytes.push(c);
    } else if (!isWhitespace(c)) {
      bytes.push(c);
    } else if (c !== 0x0d && c !== 0x0a) {
      bytes.push(0x20);
    }
    state.index++;
  }
  if (state.index >= endIndex)
    return err({ kind: 'incomplete-comment', message: `Incomplete comment token at offset ${startIndex}`, offset: startIndex, tokenIndex: startIndex, errorIndex: endIndex } as never);
  state.index++;
  return ok({ comment: convertToUnicode(Uint8Array.from(bytes)), index: state.index });
}

function updateState(mask: number, keyword: string, keywordIndex: number, index: number): Result<{ mask: number; id: ReceivedClauseId }> {
  for (let i = 0; i < keywords.length; i++) {
    if (keyword.toLowerCase() === keywords[i]) {
      const id = i + 1;
      const bit = 1 << id;
      if ((mask & bit) !== 0)
        return err({ kind: 'duplicate-clause', message: `Duplicate '${keyword.toLowerCase()}' clause at offset ${keywordIndex}`, offset: index, tokenIndex: keywordIndex, errorIndex: index } as never);
      return ok({ mask: mask | bit, id });
    }
  }
  return ok({ mask, id: ReceivedClauseId.Unknown });
}

function appendClause(options: FormatOptions, builder: string[], lineLength: number, clause: ReceivedClause): number {
  if (clause.id !== ReceivedClauseId.None) {
    const commentLength = clause.comments.length > 0 ? getCommentLength(clause.comments[0]!) : 0;
    const keyword = clause.keyword;
    const value = clause.value;
    if (commentLength > 0 && keyword.length + 1 + value.length + 1 + commentLength < options.maxLineLength) {
      if (lineLength + 1 + keyword.length + 1 + value.length + 1 + commentLength > options.maxLineLength) {
        builder.push(options.newLine, '\t'); lineLength = 1;
      } else { builder.push(' '); lineLength++; }
    } else if (keyword.length + 1 + value.length < options.maxLineLength) {
      if (lineLength + 1 + keyword.length + 1 + value.length > options.maxLineLength) {
        builder.push(options.newLine, '\t'); lineLength = 1;
      } else { builder.push(' '); lineLength++; }
    } else if (lineLength + 1 + keyword.length > options.maxLineLength) {
      builder.push(options.newLine, '\t'); lineLength = 1;
    } else { builder.push(' '); lineLength++; }
    builder.push(keyword); lineLength += keyword.length;
    if (lineLength + 1 + value.length > options.maxLineLength) {
      builder.push(options.newLine, '\t'); lineLength = 1;
    } else { builder.push(' '); lineLength++; }
    builder.push(value); lineLength += value.length;
  }
  for (const rawComment of clause.comments) {
    const comment = formatComment(rawComment);
    if (lineLength + 1 + comment.length > options.maxLineLength) {
      builder.push(options.newLine, '\t'); lineLength = 1;
    } else { builder.push(' '); lineLength++; }
    builder.push(comment); lineLength += comment.length;
  }
  return lineLength;
}

function formatComment(comment: string): string {
  return `(${comment.replace(/\\/g, '\\\\')})`;
}

function getCommentLength(comment: string): number {
  return comment.length + (comment.match(/\\/g)?.length ?? 0) + 2;
}

function unfold(text: string): string {
  let value = '';
  for (const ch of text) {
    if (ch === '\r' || ch === '\n') continue;
    value += ch === '\t' ? ' ' : ch;
  }
  return value;
}

function isEndOfToken(c: number): boolean {
  return c === 0x09 || c === 0x0d || c === 0x0a || c === 0x20 || c === 0x28 || c === 0x3b;
}

function keywordToId(keyword: string): ReceivedClauseId {
  const index = keywords.findIndex((value) => value.toLowerCase() === keyword.toLowerCase());
  return index === -1 ? ReceivedClauseId.Unknown : index + 1;
}

function validateClauseValue(id: ReceivedClauseId, value: string): void {
  if (value.length === 0) throw new TypeError('value cannot be empty');
  const bytes = encoder.encode(value);
  if (id === ReceivedClauseId.From || id === ReceivedClauseId.By) {
    if (!isValidDomainOrAddressLiteral(bytes)) throw new TypeError('Invalid domain or address literal.');
  } else if (id === ReceivedClauseId.Via || id === ReceivedClauseId.With) {
    if (![...bytes].every((c) => c >= 0x20 && c !== 0x7f && c !== 0x3b && c !== 0x28 && c !== 0x29))
      throw new TypeError('Invalid atom token.');
  } else if (id === ReceivedClauseId.Id) {
    const parsed = tryParseMessageId(value);
    if (!parsed.ok || parsed.value == null) throw new TypeError('Invalid message identifier.');
  } else if (id === ReceivedClauseId.For) {
    const parsed = MailboxAddress.parse(value);
    if (!parsed.ok) throw new TypeError('Invalid mailbox address.');
  } else if (![...bytes].every((c) => c >= 0x20 && c !== 0x7f && c !== 0x3b && c !== 0x28 && c !== 0x29)) {
    throw new TypeError('Invalid token.');
  }
}

function isValidDomainOrAddressLiteral(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  if (bytes[0] === 0x5b) return bytes[bytes.length - 1] === 0x5d && bytes.length > 2 && ![...bytes].some((c) => c < 0x20 || c === 0x7f);
  if (bytes[0] === 0x2d || bytes[bytes.length - 1] === 0x2d || bytes[0] === 0x2e || bytes[bytes.length - 1] === 0x2e) return false;
  let lastDot = false;
  for (const c of bytes) {
    if (c === 0x2e) {
      if (lastDot) return false;
      lastDot = true;
    } else {
      if (!isDomain(c) || c === 0x5b || c === 0x5d) return false;
      lastDot = false;
    }
  }
  return true;
}

function validRange(buffer: Uint8Array, startIndex: number, length: number): boolean {
  return Number.isInteger(startIndex) && Number.isInteger(length) && startIndex >= 0 && length >= 0 && startIndex <= buffer.length && startIndex + length <= buffer.length;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = '';
  for (let i = start; i < end; i++) value += String.fromCharCode(bytes[i]!);
  return value;
}

function stripAddressBrackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}
