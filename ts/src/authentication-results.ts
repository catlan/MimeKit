import { FormatOptions } from './format-options.js';
import { ParserOptions } from './parser-options.js';
import { err, ok, type Result } from './result.js';
import { isWhitespace, TOKEN_SPECIALS } from './utils/byte-extensions.js';
import { utf8 } from './utils/charset-utils.js';
import { quote, unquote } from './utils/mime-utils.js';
import { skipComment, skipCommentsAndWhiteSpace, skipToken, skipWhiteSpace, tryParseInt32 } from './utils/parse-utils.js';
import { encodeUnstructuredHeader } from './utils/rfc2047.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class AuthenticationResults {
  authenticationServiceIdentifier: string | null = null;
  instance: number | null = null;
  version: number | null = null;
  readonly results: AuthenticationMethodResult[] = [];

  constructor(authservid?: string) {
    if (arguments.length > 0) {
      if (authservid == null) throw new TypeError('authservid cannot be null or undefined');
      this.authenticationServiceIdentifier = authservid;
    }
  }

  get AuthenticationServiceIdentifier(): string | null { return this.authenticationServiceIdentifier; }
  get Instance(): number | null { return this.instance; }
  set Instance(value: number | null) { this.instance = value; }
  get Version(): number | null { return this.version; }
  set Version(value: number | null) { this.version = value; }
  get Results(): AuthenticationMethodResult[] { return this.results; }

  encode(options: FormatOptions, builder: string[], lineLength: number): void {
    let space = 1;
    if (this.instance != null) {
      const i = `${this.instance}`;
      builder.push(` i=${i};`);
      lineLength += 4 + i.length;
    }
    if (this.authenticationServiceIdentifier != null) {
      if (lineLength + space + this.authenticationServiceIdentifier.length > options.maxLineLength) {
        builder.push(options.newLine, '\t');
        lineLength = 1;
        space = 0;
      }
      if (space > 0) {
        builder.push(' ');
        lineLength++;
      }
      builder.push(this.authenticationServiceIdentifier);
      lineLength += this.authenticationServiceIdentifier.length;
      if (this.version != null) {
        const version = `${this.version}`;
        if (lineLength + 1 + version.length > options.maxLineLength) {
          builder.push(options.newLine, '\t');
          lineLength = 1;
        } else {
          builder.push(' ');
          lineLength++;
        }
        builder.push(version);
        lineLength += version.length;
      }
      builder.push(';');
      lineLength++;
    }
    if (this.results.length > 0) {
      for (let i = 0; i < this.results.length; i++) {
        if (i > 0) {
          builder.push(';');
          lineLength++;
        }
        lineLength = this.results[i]!.encode(options, builder, lineLength);
      }
    } else {
      builder.push(' none');
    }
    builder.push(options.newLine);
  }

  toString(): string {
    const builder: string[] = [];
    if (this.instance != null) builder.push(`i=${this.instance}; `);
    if (this.authenticationServiceIdentifier != null) {
      builder.push(this.authenticationServiceIdentifier);
      if (this.version != null) builder.push(` ${this.version}`);
      builder.push('; ');
    }
    if (this.results.length > 0) {
      for (let i = 0; i < this.results.length; i++) {
        if (i > 0) builder.push('; ');
        builder.push(this.results[i]!.toString());
      }
    } else {
      builder.push('none');
    }
    return builder.join('');
  }

  static parse(buffer: Uint8Array, startIndex = 0, length = buffer?.length - startIndex): Result<AuthenticationResults> {
    if (!(buffer instanceof Uint8Array)) throw new TypeError('buffer cannot be null or undefined');
    if (!validRange(buffer, startIndex, length)) throw new RangeError('startIndex and length do not specify a valid range');
    const cursor = { index: startIndex };
    return parseAuthenticationResults(buffer, cursor, startIndex + length);
  }

  static tryParse(buffer: Uint8Array | null | undefined, startIndex = 0, length = (buffer?.length ?? 0) - startIndex): Result<AuthenticationResults> {
    if (!(buffer instanceof Uint8Array) || !validRange(buffer, startIndex, length))
      return err('invalid-arguments', 'Invalid arguments.');
    const cursor = { index: startIndex };
    return parseAuthenticationResults(buffer, cursor, startIndex + length);
  }
}

export class AuthenticationMethodResult {
  office365AuthenticationServiceIdentifier: string | null = null;
  readonly method: string;
  version: number | null = null;
  result: string;
  resultComment: string | null = null;
  action: string | null = null;
  reason: string | null = null;
  readonly properties: AuthenticationMethodProperty[] = [];

  constructor(method: string, result = '') {
    if (method == null) throw new TypeError('method cannot be null or undefined');
    if (result == null) throw new TypeError('result cannot be null or undefined');
    this.method = method;
    this.result = result;
  }

  get Office365AuthenticationServiceIdentifier(): string | null { return this.office365AuthenticationServiceIdentifier; }
  set Office365AuthenticationServiceIdentifier(value: string | null) { this.office365AuthenticationServiceIdentifier = value; }
  get Method(): string { return this.method; }
  get Version(): number | null { return this.version; }
  set Version(value: number | null) { this.version = value; }
  get Result(): string { return this.result; }
  set Result(value: string) { this.result = value; }
  get ResultComment(): string | null { return this.resultComment; }
  set ResultComment(value: string | null) { this.resultComment = value; }
  get Action(): string | null { return this.action; }
  set Action(value: string | null) { this.action = value; }
  get Reason(): string | null { return this.reason; }
  set Reason(value: string | null) { this.reason = value; }
  get Properties(): AuthenticationMethodProperty[] { return this.properties; }

  encode(options: FormatOptions, builder: string[], lineLength: number): number {
    const complete = this.toString();
    if (complete.length + 1 < options.maxLineLength) {
      if (lineLength + complete.length + 1 > options.maxLineLength) {
        builder.push(options.newLine, '\t');
        lineLength = 1;
      } else {
        builder.push(' ');
        lineLength++;
      }
      builder.push(complete);
      return lineLength + complete.length;
    }

    const tokens = [' '];
    if (this.office365AuthenticationServiceIdentifier != null)
      tokens.push(this.office365AuthenticationServiceIdentifier, ';', ' ');
    if (this.version != null) {
      const version = `${this.version}`;
      if (this.method.length + 1 + version.length + 1 + this.result.length < options.maxLineLength)
        tokens.push(`${this.method}/${version}=${this.result}`);
      else if (this.method.length + 1 + version.length < options.maxLineLength)
        tokens.push(`${this.method}/${version}`, '=', this.result);
      else
        tokens.push(this.method, '/', version, '=', this.result);
    } else if (this.method.length + 1 + this.result.length < options.maxLineLength) {
      tokens.push(`${this.method}=${this.result}`);
    } else {
      tokens.push(this.method, '=', this.result);
    }
    if (this.resultComment) tokens.push(' ', `(${this.resultComment})`);
    if (this.reason) {
      const value = quote(this.reason);
      tokens.push(' ', 'reason='.length + value.length < options.maxLineLength ? `reason=${value}` : 'reason=', ...('reason='.length + value.length < options.maxLineLength ? [] : [value]));
    } else if (this.action) {
      const value = quote(this.action);
      tokens.push(' ', 'action='.length + value.length < options.maxLineLength ? `action=${value}` : 'action=', ...('action='.length + value.length < options.maxLineLength ? [] : [value]));
    }
    for (const property of this.properties) property.appendTokens(options, tokens);
    return appendTokens(builder, options, lineLength, tokens);
  }

  toString(): string {
    const builder: string[] = [];
    if (this.office365AuthenticationServiceIdentifier != null) builder.push(this.office365AuthenticationServiceIdentifier, '; ');
    builder.push(this.method);
    if (this.version != null) builder.push('/', `${this.version}`);
    builder.push('=', this.result);
    if (this.resultComment) builder.push(' (', this.resultComment, ')');
    if (this.reason) builder.push(' reason=', quote(this.reason));
    else if (this.action) builder.push(' action=', quote(this.action));
    for (const property of this.properties) builder.push(' ', property.toString());
    return builder.join('');
  }
}

export class AuthenticationMethodProperty {
  readonly propertyType: string;
  readonly property: string;
  readonly value: string;
  private readonly quoted: boolean | null;

  constructor(ptype: string, property: string, value: string, quoted: boolean | null = null) {
    if (ptype == null) throw new TypeError('ptype cannot be null or undefined');
    if (property == null) throw new TypeError('property cannot be null or undefined');
    if (value == null) throw new TypeError('value cannot be null or undefined');
    this.propertyType = ptype;
    this.property = property;
    this.value = value;
    this.quoted = quoted;
  }

  get PropertyType(): string { return this.propertyType; }
  get Property(): string { return this.property; }
  get Value(): string { return this.value; }

  appendTokens(options: FormatOptions, tokens: string[]): void {
    const value = (this.quoted ?? containsTokenSpecials(this.value)) ? quote(this.value) : this.value;
    tokens.push(' ');
    if (this.propertyType.length + 1 + this.property.length + 1 + value.length < options.maxLineLength)
      tokens.push(`${this.propertyType}.${this.property}=${value}`);
    else if (this.propertyType.length + 1 + this.property.length + 1 < options.maxLineLength)
      tokens.push(`${this.propertyType}.${this.property}=`, value);
    else
      tokens.push(this.propertyType, '.', this.property, '=', value);
  }

  toString(): string {
    const value = (this.quoted ?? containsTokenSpecials(this.value)) ? quote(this.value) : this.value;
    return `${this.propertyType}.${this.property}=${value}`;
  }
}

export function encodeAuthenticationResultsValue(format: FormatOptions, field: string, value: string): Uint8Array {
  const parsed = AuthenticationResults.parse(encoder.encode(value));
  if (!parsed.ok) return encodeUnstructuredHeader(ParserOptions.default, format, utf8, field, value);
  const builder: string[] = [];
  parsed.value.encode(format, builder, `${field}:`.length);
  return encoder.encode(builder.join(''));
}

function parseAuthenticationResults(text: Uint8Array, index: { index: number }, endIndex: number): Result<AuthenticationResults> {
  let instance: number | null = null;
  let srvid: string | null = null;

  const ws = skipCommentsAndWhiteSpace(text, index, endIndex);
  if (!ws.ok) return ws;

  do {
    const start = index.index;
    const valueToken = skipValue(text, index, endIndex);
    if (!valueToken.ok) return err('incomplete-authserv-id', `Incomplete authserv-id token at offset ${start}`, { offset: start });
    let value = decode(text, start, index.index);
    if (valueToken.value) {
      srvid = unquote(value, true);
    } else {
      const ws2 = skipCommentsAndWhiteSpace(text, index, endIndex);
      if (!ws2.ok) return ws2;
      if (index.index < endIndex && text[index.index] === 0x3d) {
        if (instance != null) return err({ kind: 'invalid-token', message: `Invalid token at offset ${start}`, offset: index.index, tokenIndex: start } as never);
        if (value !== 'i') {
          const authres = new AuthenticationResults();
          index.index = 0;
          const methods = tryParseMethods(text, index, endIndex, authres);
          return methods.ok ? ok(authres) : methods;
        }
        index.index++;
        const ws3 = skipCommentsAndWhiteSpace(text, index, endIndex);
        if (!ws3.ok) return ws3;
        const instanceIndex = index.index;
        const parsed = tryParseInt32(text, index, endIndex);
        if (!parsed.ok) return err('invalid-instance', `Invalid instance value at offset ${instanceIndex}`, { offset: instanceIndex });
        instance = parsed.value;
        const ws4 = skipCommentsAndWhiteSpace(text, index, endIndex);
        if (!ws4.ok) return ws4;
        if (index.index >= endIndex) return err('missing-instance-semi', `Missing semi-colon after instance value at offset ${instanceIndex}`, { offset: instanceIndex });
        if (text[index.index] !== 0x3b) return err('unexpected-instance-token', `Unexpected token after instance value at offset ${index.index}`, { offset: index.index });
        index.index++;
        const ws5 = skipCommentsAndWhiteSpace(text, index, endIndex);
        if (!ws5.ok) return ws5;
      } else {
        srvid = value;
      }
    }
  } while (srvid == null);

  const authres = new AuthenticationResults(srvid);
  authres.instance = instance;
  const ws6 = skipCommentsAndWhiteSpace(text, index, endIndex);
  if (!ws6.ok) return ws6;
  if (index.index >= endIndex) return ok(authres);
  if (text[index.index] !== 0x3b) {
    const start = index.index;
    const parsed = tryParseInt32(text, index, endIndex);
    if (!parsed.ok) return err('invalid-authres-version', `Invalid authres-version at offset ${start}`, { offset: start });
    authres.version = parsed.value;
    const ws7 = skipCommentsAndWhiteSpace(text, index, endIndex);
    if (!ws7.ok) return ws7;
    if (index.index >= endIndex) return ok(authres);
    if (text[index.index] !== 0x3b) return err('unknown-token', `Unknown token at offset ${index.index}`, { offset: index.index });
  }
  index.index++;
  const methods = tryParseMethods(text, index, endIndex, authres);
  return methods.ok ? ok(authres) : methods;
}

function tryParseMethods(text: Uint8Array, index: { index: number }, endIndex: number, authres: AuthenticationResults): Result<true> {
  while (index.index < endIndex) {
    let srvid: string | null = null;
    methodToken: while (true) {
      const ws = skipCommentsAndWhiteSpace(text, index, endIndex);
      if (!ws.ok) return ws;
      if (index.index >= endIndex) return ok(true);
      const methodIndex = index.index;
      if (!skipKeyword(text, index, endIndex)) return err('invalid-method', `Invalid method token at offset ${methodIndex}`, { offset: methodIndex });
      if (srvid == null && index.index < endIndex && text[index.index] === 0x2e) {
        index.index++;
        if (!skipDotMethodOrOffice365AuthServId(text, index, endIndex))
          return err('invalid-office365-authserv-id', `Invalid Office365 authserv-id token at offset ${methodIndex}`, { offset: methodIndex });
        const ws2 = skipCommentsAndWhiteSpace(text, index, endIndex);
        if (!ws2.ok) return ws2;
        if (index.index >= endIndex) return err('missing-office365-semi', `Missing semi-colon after Office365 authserv-id token at offset ${methodIndex}`, { offset: methodIndex });
        if (text[index.index] === 0x3b) {
          srvid = decode(text, methodIndex, index.index);
          index.index++;
          continue methodToken;
        }
        if (text[index.index] !== 0x3d && text[index.index] !== 0x2f)
          return err('unexpected-office365-token', `Unexpected token after Office365 authserv-id token at offset ${index.index}`, { offset: index.index });
      }
      const method = ascii(text, methodIndex, index.index);
      const ws3 = skipCommentsAndWhiteSpace(text, index, endIndex);
      if (!ws3.ok) return ws3;
      if (index.index >= endIndex) {
        if (method !== 'none') return err('incomplete-methodspec', `Incomplete methodspec token at offset ${methodIndex}`, { offset: methodIndex });
        if (authres.results.length > 0) return err('invalid-no-result', `Invalid no-result token at offset ${methodIndex}`, { offset: methodIndex });
        return ok(true);
      }
      const resinfo = new AuthenticationMethodResult(method);
      resinfo.office365AuthenticationServiceIdentifier = srvid;
      authres.results.push(resinfo);
      if (text[index.index] === 0x2f) {
        index.index++;
        const ws4 = skipCommentsAndWhiteSpace(text, index, endIndex);
        if (!ws4.ok) return ws4;
        const tokenIndex = index.index;
        const parsed = tryParseInt32(text, index, endIndex);
        if (!parsed.ok) return err('invalid-method-version', `Invalid method-version token at offset ${tokenIndex}`, { offset: tokenIndex });
        resinfo.version = parsed.value;
        const ws5 = skipCommentsAndWhiteSpace(text, index, endIndex);
        if (!ws5.ok) return ws5;
        if (index.index >= endIndex) return err('incomplete-methodspec', `Incomplete methodspec token at offset ${methodIndex}`, { offset: methodIndex });
      }
      if (text[index.index] !== 0x3d) return err('invalid-methodspec', `Invalid methodspec token at offset ${methodIndex}`, { offset: methodIndex });
      index.index++;
      const ws6 = skipCommentsAndWhiteSpace(text, index, endIndex);
      if (!ws6.ok) return ws6;
      if (index.index >= endIndex) return err('incomplete-methodspec', `Incomplete methodspec token at offset ${methodIndex}`, { offset: methodIndex });
      let tokenIndex = index.index;
      if (!skipKeyword(text, index, endIndex)) return err('invalid-result', `Invalid result token at offset ${tokenIndex}`, { offset: tokenIndex });
      resinfo.result = ascii(text, tokenIndex, index.index);
      skipWhiteSpace(text, index, endIndex);
      if (index.index < endIndex && text[index.index] === 0x28) {
        const commentIndex = index.index;
        if (!skipComment(text, index, endIndex)) return err('incomplete-comment', `Incomplete comment token at offset ${commentIndex}`, { offset: commentIndex });
        resinfo.resultComment = unfold(decode(text, commentIndex + 1, index.index - 1));
        const ws7 = skipCommentsAndWhiteSpace(text, index, endIndex);
        if (!ws7.ok) return ws7;
      }
      if (index.index >= endIndex) return ok(true);
      if (text[index.index] === 0x3b) {
        index.index++;
        break;
      }
      tokenIndex = index.index;
      if (!skipKeyword(text, index, endIndex)) return err('invalid-reason-or-prop', `Invalid reasonspec or propspec token at offset ${tokenIndex}`, { offset: tokenIndex });
      let value = ascii(text, tokenIndex, index.index);
      if (value === 'reason' || value === 'action') {
        const result = parseReasonOrAction(text, index, endIndex, tokenIndex, value, resinfo);
        if (!result.ok) return result;
        if (index.index >= endIndex) return ok(true);
        if (text[index.index] === 0x3b) {
          index.index++;
          break;
        }
        tokenIndex = index.index;
        if (!skipKeyword(text, index, endIndex)) return err('invalid-propspec', `Invalid propspec token at offset ${tokenIndex}`, { offset: tokenIndex });
        value = ascii(text, tokenIndex, index.index);
      }
      while (true) {
        const parsed = parseProperty(text, index, endIndex, tokenIndex, value, resinfo);
        if (!parsed.ok) return parsed;
        if (index.index >= endIndex || text[index.index] === 0x3b) break;
        tokenIndex = index.index;
        if (!skipKeyword(text, index, endIndex)) return err('invalid-propspec', `Invalid propspec token at offset ${tokenIndex}`, { offset: tokenIndex });
        value = ascii(text, tokenIndex, index.index);
      }
      index.index++;
      break;
    }
  }
  return ok(true);
}

function parseReasonOrAction(text: Uint8Array, index: { index: number }, endIndex: number, tokenIndex: number, kind: string, result: AuthenticationMethodResult): Result<true> {
  let ws = skipCommentsAndWhiteSpace(text, index, endIndex); if (!ws.ok) return ws;
  if (index.index >= endIndex) return err(`incomplete-${kind}`, `Incomplete ${kind}spec token at offset ${tokenIndex}`, { offset: tokenIndex });
  if (text[index.index] !== 0x3d) return err(`invalid-${kind}`, `Invalid ${kind}spec token at offset ${tokenIndex}`, { offset: tokenIndex });
  index.index++;
  ws = skipCommentsAndWhiteSpace(text, index, endIndex); if (!ws.ok) return ws;
  const valueIndex = index.index;
  const skipped = skipValue(text, index, endIndex);
  if (!skipped.ok || index.index === valueIndex) return err(`invalid-${kind}-value`, `Invalid ${kind}spec value token at offset ${valueIndex}`, { offset: valueIndex });
  const value = skipped.value ? unquote(decode(text, valueIndex, index.index), true) : decode(text, valueIndex, index.index);
  if (kind === 'action') result.action = value;
  else result.reason = value;
  ws = skipCommentsAndWhiteSpace(text, index, endIndex); if (!ws.ok) return ws;
  return ok(true);
}

function parseProperty(text: Uint8Array, index: { index: number }, endIndex: number, tokenIndex: number, ptype: string, result: AuthenticationMethodResult): Result<true> {
  let ws = skipCommentsAndWhiteSpace(text, index, endIndex); if (!ws.ok) return ws;
  if (index.index >= endIndex) return err('incomplete-propspec', `Incomplete propspec token at offset ${tokenIndex}`, { offset: tokenIndex });
  if (text[index.index] !== 0x2e) return err('invalid-propspec', `Invalid propspec token at offset ${tokenIndex}`, { offset: tokenIndex });
  index.index++;
  ws = skipCommentsAndWhiteSpace(text, index, endIndex); if (!ws.ok) return ws;
  if (index.index >= endIndex) return err('incomplete-propspec', `Incomplete propspec token at offset ${tokenIndex}`, { offset: tokenIndex });
  const propertyIndex = index.index;
  if (!skipKeyword(text, index, endIndex)) return err('invalid-property', `Invalid property token at offset ${propertyIndex}`, { offset: propertyIndex });
  const property = ascii(text, propertyIndex, index.index);
  ws = skipCommentsAndWhiteSpace(text, index, endIndex); if (!ws.ok) return ws;
  if (index.index >= endIndex) return err('incomplete-propspec', `Incomplete propspec token at offset ${tokenIndex}`, { offset: tokenIndex });
  if (text[index.index] !== 0x3d) return err('invalid-propspec', `Invalid propspec token at offset ${tokenIndex}`, { offset: tokenIndex });
  index.index++;
  ws = skipCommentsAndWhiteSpace(text, index, endIndex); if (!ws.ok) return ws;
  const valueIndex = index.index;
  const skipped = skipPropertyValue(text, index, endIndex);
  if (!skipped.ok) return err('incomplete-propspec', `Incomplete propspec token at offset ${tokenIndex}`, { offset: tokenIndex });
  const value = skipped.value ? unquote(decode(text, valueIndex, index.index), true) : decode(text, valueIndex, index.index);
  result.properties.push(new AuthenticationMethodProperty(ptype, property, value, skipped.value));
  ws = skipCommentsAndWhiteSpace(text, index, endIndex); if (!ws.ok) return ws;
  return ok(true);
}

function skipKeyword(text: Uint8Array, index: { index: number }, endIndex: number): boolean {
  const start = index.index;
  while (index.index < endIndex && isKeyword(text[index.index]!)) index.index++;
  return index.index > start;
}

function skipValue(text: Uint8Array, index: { index: number }, endIndex: number): Result<boolean> {
  if (index.index >= endIndex) return err('eof', 'Unexpected end of input.');
  if (text[index.index] === 0x22) {
    const result = skipQuotedLoose(text, index, endIndex);
    return result ? ok(true) : err('incomplete-quoted', 'Incomplete quoted-string.');
  }
  return skipToken(text, index, endIndex) ? ok(false) : err('invalid-token', 'Invalid token.');
}

function skipPropertyValue(text: Uint8Array, index: { index: number }, endIndex: number): Result<boolean> {
  if (index.index >= endIndex) return err('eof', 'Unexpected end of input.');
  if (text[index.index] === 0x22) {
    const result = skipQuotedLoose(text, index, endIndex);
    return result ? ok(true) : err('incomplete-quoted', 'Incomplete quoted-string.');
  }
  while (index.index < endIndex && !isWhitespace(text[index.index]!) && text[index.index] !== 0x3b && text[index.index] !== 0x28)
    index.index++;
  return ok(false);
}

function skipDotMethodOrOffice365AuthServId(text: Uint8Array, index: { index: number }, endIndex: number): boolean {
  const start = index.index;
  while (skipKeyword(text, index, endIndex) && index.index < endIndex && text[index.index] === 0x2e)
    index.index++;
  return index.index > start && text[index.index - 1] !== 0x2e;
}

function skipQuotedLoose(text: Uint8Array, index: { index: number }, endIndex: number): boolean {
  let escaped = false;
  index.index++;
  while (index.index < endIndex) {
    const c = text[index.index]!;
    if (c === 0x5c) escaped = !escaped;
    else if (!escaped && c === 0x22) {
      index.index++;
      return true;
    } else escaped = false;
    index.index++;
  }
  return false;
}

function isKeyword(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c === 0x2d || c === 0x5f;
}

function containsTokenSpecials(value: string): boolean {
  for (const ch of value) {
    if (TOKEN_SPECIALS.includes(ch)) return true;
  }
  return false;
}

function appendTokens(builder: string[], options: FormatOptions, lineLength: number, tokens: string[]): number {
  let spaces = '';
  for (const token of tokens) {
    if (token.trim().length === 0) {
      spaces = token;
      continue;
    }
    if (lineLength + spaces.length + token.length > options.maxLineLength) {
      builder.push(options.newLine, '\t');
      spaces = '';
      lineLength = 1;
    } else {
      builder.push(spaces);
      lineLength += spaces.length;
      spaces = '';
    }
    builder.push(token);
    lineLength += token.length;
  }
  return lineLength;
}

function validRange(buffer: Uint8Array, startIndex: number, length: number): boolean {
  return Number.isInteger(startIndex) && Number.isInteger(length) && startIndex >= 0 && length >= 0 && startIndex <= buffer.length && startIndex + length <= buffer.length;
}

function decode(text: Uint8Array, start: number, end: number): string {
  return decoder.decode(text.subarray(start, end));
}

function ascii(text: Uint8Array, start: number, end: number): string {
  let value = '';
  for (let i = start; i < end; i++) value += String.fromCharCode(text[i]!);
  return value;
}

function unfold(text: string): string {
  let value = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\r' || ch === '\n') continue;
    value += ch === '\t' ? ' ' : ch;
  }
  return value;
}
