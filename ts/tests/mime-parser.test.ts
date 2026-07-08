/**
 * Port of UnitTests/ExperimentalMimeParserTests.cs (sync paths only; async
 * variants omitted per the port plan). The MimeParser (TS) is the port of
 * C#'s ExperimentalMimeParser.
 *
 * Result semantics: the C# parser throws FormatException on malformed input;
 * the TS parser returns a Result. `Assert.Throws<FormatException>` maps to
 * `expect(result.ok).toBe(false)`; success paths unwrap `result.value`.
 * Programmer errors (ArgumentNullException et al) still throw TypeError.
 *
 * C#'s Environment.NewLine-dependent expectations map to '\n' because the
 * port fixes FormatOptions.default.newLineFormat to 'unix' (plan Q8).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import {
  FilteredStream,
  FormatOptions,
  HeaderId,
  MemoryBlockStream,
  MemoryStream,
  MessagePart,
  MimeMessage,
  MimeParser,
  MimePart,
  Multipart,
  MultipartAlternative,
  ParserOptions,
  Stream,
  TextPart,
  Unix2DosFilter,
  createDateTimeOffset,
  formatDate,
  generateMessageId,
  tryGetEncoding,
} from '../src/index.js';
import type { ContentType, HeaderList, MimeEntity, NewLineFormat } from '../src/index.js';
import { testDataDir } from './gates/helpers.js';

const messagesDataDir = join(testDataDir, 'messages');
const mboxDataDir = join(testDataDir, 'mbox');

/** C#: Environment.NewLine (the port's FormatOptions.default is fixed to unix). */
const environmentNewLine = '\n';

const latin1 = new TextDecoder('latin1');
const asciiEncoder = new TextEncoder();

const unixFormatOptions = FormatOptions.default.clone();
unixFormatOptions.newLineFormat = 'unix';

/** C#: Encoding.ASCII.GetBytes (all inputs are pure ASCII). */
function ascii(text: string): Uint8Array {
  return asciiEncoder.encode(text);
}

function bytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

/** C#: text.Replace ("\n", "\r\n"). */
function dosify(text: string): string {
  return text.replace(/\n/g, '\r\n');
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function parseMessageOk(parser: MimeParser): MimeMessage {
  const result = parser.parseMessage();
  expect(result.ok, result.ok ? undefined : `Failed to parse message: ${result.error.message}`).toBe(true);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}

function parseEntityOk(parser: MimeParser): MimeEntity {
  const result = parser.parseEntity();
  expect(result.ok, result.ok ? undefined : `Failed to parse entity: ${result.error.message}`).toBe(true);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}

function parseHeadersOk(parser: MimeParser): HeaderList {
  const result = parser.parseHeaders();
  expect(result.ok, result.ok ? undefined : `Failed to parse headers: ${result.error.message}`).toBe(true);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}

/** C#: AssertSerialization (MimeMessage / MimeEntity overloads). */
function assertSerialization(source: MimeMessage | MimeEntity, format: NewLineFormat, expected: string): void {
  const memory = new MemoryStream();
  const options = FormatOptions.default.clone();
  options.newLineFormat = format;

  if (source instanceof MimeMessage) {
    if (expected.startsWith('From -')) {
      const eoln = expected.indexOf('\n');
      expected = expected.substring(eoln + 1);
    }
    source.writeTo(options, memory);
  } else {
    source.writeTo(options, memory);
  }

  const actual = latin1.decode(memory.toArray());
  expect(actual).toBe(expected);
}

/** C#: MimeIterator-equivalent depth-first traversal over a message's MIME tree. */
function* mimeIterate(message: MimeMessage, depth = 0): Generator<{ entity: MimeEntity; depth: number }> {
  if (message.body != null) yield* iterateEntity(message.body, depth);
}

function* iterateEntity(entity: MimeEntity, depth: number): Generator<{ entity: MimeEntity; depth: number }> {
  yield { entity, depth };
  if (entity instanceof Multipart) {
    for (const child of entity) yield* iterateEntity(child, depth + 1);
  } else if (entity instanceof MessagePart) {
    if (entity.message != null) yield* mimeIterate(entity.message, depth + 1);
  }
}

/** C#: DumpMimeTree (StringBuilder, MimeMessage). */
function dumpMimeTree(message: MimeMessage): string {
  let builder = '';

  for (const { entity, depth } of mimeIterate(message)) {
    const ctype = entity.contentType;
    builder += `${'   '.repeat(depth)}Content-Type: ${ctype.mediaType}/${ctype.mediaSubtype}\n`;
  }

  return builder;
}

/** C#: AssertSimpleMbox. */
function assertSimpleMbox(stream: Stream): void {
  const parser = new MimeParser(stream, 'mbox');

  while (!parser.isEndOfStream) {
    const message = parseMessageOk(parser);
    let multipart: Multipart;
    let entity: MimeEntity;

    expect(message.body).toBeInstanceOf(Multipart);
    multipart = message.body as Multipart;
    expect(multipart.count).toBe(1);
    entity = multipart.at(0);

    expect(entity).toBeInstanceOf(Multipart);
    multipart = entity as Multipart;
    expect(multipart.count).toBe(1);
    entity = multipart.at(0);

    expect(entity).toBeInstanceOf(Multipart);
    multipart = entity as Multipart;
    expect(multipart.count).toBe(1);
    entity = multipart.at(0);

    expect(entity).toBeInstanceOf(TextPart);

    const memory = new MemoryStream();
    entity.writeTo(unixFormatOptions, memory);

    const text = latin1.decode(memory.toArray());
    expect(text.startsWith('Content-Type: text/plain\n\n'), 'Headers are not properly terminated.').toBe(true);
  }
}

/** C#: DetectNewLineFormat. */
function detectNewLineFormat(fileName: string): NewLineFormat {
  const buffer = readFileSync(fileName);
  const n = Math.min(buffer.length, 1024);

  for (let i = 0; i < n; i++) {
    if (buffer[i] === 0x0a) {
      if (i > 0 && buffer[i - 1] === 0x0d) return 'dos';
      return 'unix';
    }
  }

  return 'dos';
}

interface MimeOffsets {
  mimeType?: string;
  mboxMarkerOffset?: number | null;
  lineNumber?: number;
  beginOffset?: number;
  headersEndOffset?: number;
  endOffset?: number;
  message?: MimeOffsets;
  body?: MimeOffsets;
  children?: MimeOffsets[];
  octets?: number;
  lines?: number | null;
}

/** C#: AssertMimeOffsets. */
function assertMimeOffsets(expected: MimeOffsets, actual: MimeOffsets, message: number, partSpecifier: string): void {
  expect(actual.mimeType, `mime-type differs for message #${message}${partSpecifier}`).toBe(expected.mimeType);
  expect(actual.mboxMarkerOffset ?? null, `mbox marker begin offset differs for message #${message}${partSpecifier}`).toBe(expected.mboxMarkerOffset ?? null);
  expect(actual.beginOffset, `begin offset differs for message #${message}${partSpecifier}`).toBe(expected.beginOffset);
  expect(actual.lineNumber, `begin line differs for message #${message}${partSpecifier}`).toBe(expected.lineNumber);
  expect(actual.headersEndOffset, `headers end offset differs for message #${message}${partSpecifier}`).toBe(expected.headersEndOffset);
  expect(actual.endOffset, `end offset differs for message #${message}${partSpecifier}`).toBe(expected.endOffset);
  expect(actual.octets, `octets differs for message #${message}${partSpecifier}`).toBe(expected.octets);
  expect(actual.lines ?? null, `lines differs for message #${message}${partSpecifier}`).toBe(expected.lines ?? null);

  if (expected.message != null) {
    expect(actual.message, `message content is null for message #${message}${partSpecifier}`).toBeDefined();
    assertMimeOffsets(expected.message, actual.message!, message, partSpecifier + '/message');
  } else if (expected.body != null) {
    expect(actual.body, `body content is null for message #${message}${partSpecifier}`).toBeDefined();
    assertMimeOffsets(expected.body, actual.body!, message, partSpecifier + '/0');
  } else if (expected.children != null) {
    expect(actual.children!.length, `children count differs for message #${message}${partSpecifier}`).toBe(expected.children.length);
    for (let i = 0; i < expected.children.length; i++)
      assertMimeOffsets(expected.children[i]!, actual.children![i]!, message, partSpecifier + `.${i}`);
  }
}

/** C#: CustomMimeParser (ExperimentalMimeParser subclass collecting offsets). */
class CustomMimeParser extends MimeParser {
  readonly offsets: MimeOffsets[] = [];
  private readonly offsetsStack: MimeOffsets[] = [];
  private isMessageBody = false;

  protected override onMimeMessageBegin(beginOffset = 0, beginLineNumber = 0): void {
    const offsets: MimeOffsets = { beginOffset, lineNumber: beginLineNumber };

    if (this.offsetsStack.length > 0) {
      const parentOffsets = this.offsetsStack[this.offsetsStack.length - 1]!;
      parentOffsets.message = offsets;
    } else {
      offsets.mboxMarkerOffset = this.mboxMarkerOffset;
      this.offsets.push(offsets);
    }

    this.isMessageBody = true;
    this.offsetsStack.push(offsets);

    super.onMimeMessageBegin();
  }

  protected override onMimeMessageEnd(_beginOffset = 0, _beginLineNumber = 0, headersEndOffset = 0, endOffset = 0, _lines = 0): void {
    const offsets = this.offsetsStack.pop()!;
    offsets.octets = endOffset - headersEndOffset;
    offsets.headersEndOffset = headersEndOffset;
    offsets.endOffset = endOffset;

    super.onMimeMessageEnd();
  }

  private onMimeEntityBegin(contentType: ContentType, beginOffset: number, beginLineNumber: number): void {
    const offsets: MimeOffsets = { mimeType: contentType.mimeType, beginOffset, lineNumber: beginLineNumber };

    const parentOffsets = this.offsetsStack[this.offsetsStack.length - 1]!;
    if (this.isMessageBody) {
      parentOffsets.body = offsets;
      this.isMessageBody = false;
    } else {
      parentOffsets.children ??= [];
      parentOffsets.children.push(offsets);
    }

    this.offsetsStack.push(offsets);
  }

  private onMimeEntityEnd(headersEndOffset: number, endOffset: number, lines: number): void {
    const offsets = this.offsetsStack.pop()!;
    offsets.octets = endOffset - headersEndOffset;
    offsets.headersEndOffset = headersEndOffset;
    offsets.endOffset = endOffset;
    offsets.lines = lines;
  }

  protected override onMessagePartBegin(contentType: ContentType, beginOffset = 0, beginLineNumber = 0): void {
    this.onMimeEntityBegin(contentType, beginOffset, beginLineNumber);
    super.onMessagePartBegin(contentType);
  }

  protected override onMessagePartEnd(_contentType?: ContentType, _beginOffset = 0, _beginLineNumber = 0, headersEndOffset = 0, endOffset = 0, lines = 0): void {
    this.onMimeEntityEnd(headersEndOffset, endOffset, lines);
    super.onMessagePartEnd();
  }

  protected override onMultipartBegin(contentType: ContentType, beginOffset = 0, beginLineNumber = 0): void {
    this.onMimeEntityBegin(contentType, beginOffset, beginLineNumber);
    super.onMultipartBegin(contentType);
  }

  protected override onMultipartEnd(_contentType?: ContentType, _beginOffset = 0, _beginLineNumber = 0, headersEndOffset = 0, endOffset = 0, lines = 0): void {
    this.onMimeEntityEnd(headersEndOffset, endOffset, lines);
    super.onMultipartEnd();
  }

  protected override onMimePartBegin(contentType: ContentType, beginOffset = 0, beginLineNumber = 0): void {
    this.onMimeEntityBegin(contentType, beginOffset, beginLineNumber);
    super.onMimePartBegin(contentType);
  }

  protected override onMimePartEnd(_contentType?: ContentType, _beginOffset = 0, _beginLineNumber = 0, headersEndOffset = 0, endOffset = 0, lines = 0): void {
    this.onMimeEntityEnd(headersEndOffset, endOffset, lines);
    super.onMimePartEnd();
  }
}

function expectBytesEqual(actual: Uint8Array, expected: Uint8Array, what: string): void {
  const n = Math.min(actual.length, expected.length);
  let diffAt = -1;

  for (let i = 0; i < n; i++) {
    if (actual[i] !== expected[i]) {
      diffAt = i;
      break;
    }
  }
  if (diffAt === -1 && actual.length !== expected.length) diffAt = n;
  if (diffAt === -1) return;

  let lineNumber = 1;
  let columnNumber = 1;
  for (let i = 0; i < diffAt; i++) {
    if (expected[i] === 0x0a) {
      lineNumber++;
      columnNumber = 1;
    } else {
      columnNumber++;
    }
  }

  const context = (buf: Uint8Array) => latin1.decode(buf.subarray(Math.max(0, diffAt - 32), diffAt + 32));
  throw new Error(
    `${what} differs on line ${lineNumber}, column ${columnNumber} (byte ${diffAt}; ` +
      `actual ${actual.length}B vs expected ${expected.length}B)\n` +
      `  actual:   ${JSON.stringify(context(actual))}\n` +
      `  expected: ${JSON.stringify(context(expected))}`,
  );
}

/** C#: AssertMboxResults. */
function assertMboxResults(baseName: string, actual: string, output: MemoryBlockStream, offsets: MimeOffsets[], newLineFormat: NewLineFormat): void {
  // WORKAROUND (ported from C#, where Mono's iso-2022-jp decoder broke on this
  // input): a no-op when the decoder is correct.
  const iso2022jp = tryGetEncoding('iso-2022-jp')?.decode(new Uint8Array(Buffer.from('GyRAOjRGI0stGyhK', 'base64'))) ?? '佐藤豊';
  if (iso2022jp !== '佐藤豊') actual = actual.split(iso2022jp).join('佐藤豊');

  const summary = readFileSync(join(mboxDataDir, `${baseName}-summary.txt`), 'utf8').replace(/\r\n/g, '\n');

  expect(actual, `Summaries do not match for ${baseName}.mbox`).toBe(summary);

  expectBytesEqual(output.toArray(), bytes(join(mboxDataDir, `${baseName}.mbox.txt`)), 'The mbox');

  const path = join(mboxDataDir, `${baseName}.${newLineFormat}-offsets.json`);
  const expectedOffsets = JSON.parse(readFileSync(path, 'utf8')) as MimeOffsets[];

  expect(offsets.length, 'message count').toBe(expectedOffsets.length);

  for (let i = 0; i < expectedOffsets.length; i++)
    assertMimeOffsets(expectedOffsets[i]!, offsets[i]!, i, '');
}

/** C#: TestMbox. */
function testMbox(options: ParserOptions | null, baseName: string): void {
  const mbox = join(mboxDataDir, `${baseName}.mbox.txt`);
  const output = new MemoryBlockStream();
  let builder = '';

  const stream = new MemoryStream(bytes(mbox));
  const parser = options != null ? new CustomMimeParser(options, stream, 'mbox') : new CustomMimeParser(stream, 'mbox');
  const format = FormatOptions.default.clone();
  let count = 0;

  const newLineFormat = detectNewLineFormat(mbox);
  format.newLineFormat = newLineFormat;

  expect(parser.mboxMarkerOffset, 'Initial MboxMarkerOffset').toBe(-1);
  expect(parser.mboxMarker, 'Initial MboxMarker').toBeNull();

  while (!parser.isEndOfStream) {
    const message = parseMessageOk(parser);

    builder += `${parser.mboxMarker}\n`;
    if (message.from.count > 0) builder += `From: ${message.from.toString()}\n`;
    if (message.to.count > 0) builder += `To: ${message.to.toString()}\n`;
    builder += `Subject: ${message.subject ?? ''}\n`;
    builder += `Date: ${formatDate(message.date)}\n`;
    builder += dumpMimeTree(message);
    builder += '\n';

    const marker = asciiEncoder.encode((count > 0 ? format.newLine : '') + parser.mboxMarker + format.newLine);
    output.write(marker, 0, marker.length);
    message.writeTo(format, output);
    count++;
  }

  assertMboxResults(baseName, builder, output, parser.offsets, newLineFormat);
}

/** C#: GenerateDeeplyNestedRfc822Message (dates fixed; values are irrelevant to the test). */
function generateDeeplyNestedRfc822Message(depth: number): Uint8Array {
  const now = createDateTimeOffset(2026, 7, 9, 12, 0, 0, 0);
  const oneHourAgo = createDateTimeOffset(2026, 7, 9, 11, 0, 0, 0);
  let builder = '';

  builder += 'From: tester1@contoso.com\r\n';
  builder += 'To: tester1@contoso.com\r\n';
  builder += 'Subject: test of a deeply nested multipart message\r\n';
  builder += `Date: ${formatDate(now)}\r\n`;
  builder += `Message-ID: <${generateMessageId('contoso.com')}>\r\n`;
  builder += 'MIME-Version: 1.0\r\n';

  for (let i = 0; i < depth; i++) {
    builder += 'Content-Type: message/rfc822\r\n';
    builder += '\r\n';
    builder += 'From: tester1@contoso.com\r\n';
    builder += 'To: tester1@contoso.com\r\n';
    builder += `Subject: embedded message ${i + 1}\r\n`;
    builder += `Date: ${formatDate(oneHourAgo)}\r\n`;
    builder += `Message-ID: <${generateMessageId('contoso.com')}>\r\n`;
    builder += 'MIME-Version: 1.0\r\n';
  }

  builder += 'Content-Type: text/plain; charset="us-ascii"\r\n';
  builder += 'Content-Transfer-Encoding: 7bit\r\n';
  builder += '\r\n';
  builder += 'This is the innermost part of a deeply nested rfc822 message.\r\n';

  return ascii(builder);
}

/** C#: GenerateDeeplyNestedMultipartMessage. Note: C#'s `{i:04}` renders as `${i}4`. */
function generateDeeplyNestedMultipartMessage(depth: number): Uint8Array {
  const now = createDateTimeOffset(2026, 7, 9, 12, 0, 0, 0);
  let builder = '';

  builder += 'From: tester1@contoso.com\r\n';
  builder += 'To: tester1@contoso.com\r\n';
  builder += 'Subject: test of a deeply nested multipart message\r\n';
  builder += `Date: ${formatDate(now)}\r\n`;
  builder += `Message-ID: <${generateMessageId('contoso.com')}>\r\n`;
  builder += 'MIME-Version: 1.0\r\n';

  for (let i = 0; i < depth; i++) {
    builder += `Content-Type: multipart/mixed;\r\n\tboundary="----=_NextPart_000_${i}4_01CE98CE.6E826F90"\r\n`;
    builder += '\r\n';
    builder += `------=_NextPart_000_${i}4_01CE98CE.6E826F90\r\n`;
  }

  builder += 'Content-Type: text/plain; charset="us-ascii"\r\n';
  builder += 'Content-Transfer-Encoding: 7bit\r\n';
  builder += '\r\n';
  builder += 'This is the innermost part of a deeply nested multipart message.\r\n';
  builder += '\r\n';

  for (let i = depth - 1; i >= 0; i--)
    builder += `------=_NextPart_000_${i}4_01CE98CE.6E826F90--\r\n`;

  return ascii(builder);
}

const issue991Template =
  'From: mimekit@example.org\n' +
  'To: mimekit@example.org\n' +
  'Subject: {0}\n' +
  'Message-Id: <1234567890.{1}@example.org>\n' +
  'MIME-Version: 1.0\n' +
  'Content-Type: text/plain; charset=utf-8\n' +
  '\n';

const issue991Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** C#: CreateIssue991Mbox. */
function createIssue991Mbox(): { memory: MemoryStream; expectedOffsets: number[] } {
  const lineLength = 255;
  const subject = 'This message contains long lines that will cause ScanContent() to require a buffer refill';
  const mboxMarker = ascii('From -\n');
  const buffer: number[] = [];
  const expectedOffsets: number[] = [0, 0];
  const write = (data: Uint8Array) => {
    for (const b of data) buffer.push(b);
  };

  // Write the first message
  write(mboxMarker);

  write(ascii(issue991Template.replace('{0}', subject).replace('{1}', '0')));

  let index = 0;

  while (buffer.length <= 4096) {
    const c = issue991Alphabet.charCodeAt(index % issue991Alphabet.length);
    for (let i = 0; i < lineLength && buffer.length < 4096; i++)
      buffer.push(c);

    if (buffer.length < 4096) {
      buffer.push(0x0a);
    } else {
      // fake mbox marker that is midline
      write(mboxMarker);
    }

    index++;
  }

  buffer.push(0x0a);

  expectedOffsets[0] = buffer.length;

  // Write the second message
  write(mboxMarker);

  write(ascii(issue991Template.replace('{0}', subject).replace('{1}', '1')));

  while (buffer.length <= expectedOffsets[0]! + 4096) {
    const c = issue991Alphabet.charCodeAt(index % issue991Alphabet.length);
    for (let i = 0; i < lineLength; i++)
      buffer.push(c);

    buffer.push(0x0a);
    index++;
  }

  buffer.push(0x0a);

  expectedOffsets[1] = buffer.length;

  return { memory: new MemoryStream(Uint8Array.from(buffer)), expectedOffsets };
}

/** C#: CreateMboxWithLinesExceedingMaxSmtpLineLength. */
function createMboxWithLinesExceedingMaxSmtpLineLength(): { memory: MemoryStream; expectedOffsets: number[] } {
  const lineLength = 255;
  const subject = 'This message contains long lines that will cause ScanContent() to require a buffer refill';
  const mboxMarker = ascii('From -\n');
  const buffer: number[] = [];
  const expectedOffsets: number[] = [0, 0];
  const write = (data: Uint8Array) => {
    for (const b of data) buffer.push(b);
  };

  // Write the first message
  write(mboxMarker);

  write(ascii(issue991Template.replace('{0}', subject).replace('{1}', '0')));

  let index = 0;
  let c: number;

  while (buffer.length <= 4096 - 1001) {
    c = issue991Alphabet.charCodeAt(index % issue991Alphabet.length);

    for (let i = 0; i < lineLength && buffer.length < 4096 - 1001; i++)
      buffer.push(c);

    buffer.push(0x0a);
    index++;
  }

  // Write the line that will exceed SmtpMaxLineLength *and* span across read boundaries
  c = issue991Alphabet.charCodeAt(index % issue991Alphabet.length);

  while (buffer.length < 4096)
    buffer.push(c);

  write(mboxMarker);
  index++;

  // Write another line data
  c = issue991Alphabet.charCodeAt(index % issue991Alphabet.length);

  for (let i = 0; i < lineLength; i++)
    buffer.push(c);

  write(mboxMarker);
  index++;

  buffer.push(0x0a);

  expectedOffsets[0] = buffer.length;

  // Write the second message
  write(mboxMarker);

  write(ascii(issue991Template.replace('{0}', subject).replace('{1}', '1')));

  while (buffer.length <= expectedOffsets[0]! + 4096) {
    c = issue991Alphabet.charCodeAt(index % issue991Alphabet.length);
    for (let i = 0; i < lineLength; i++)
      buffer.push(c);

    buffer.push(0x0a);
    index++;
  }

  buffer.push(0x0a);

  expectedOffsets[1] = buffer.length;

  return { memory: new MemoryStream(Uint8Array.from(buffer)), expectedOffsets };
}

describe('ExperimentalMimeParser', () => {
  test('TestArgumentExceptions', () => {
    const stream = new MemoryStream();
    const parser = new MimeParser(stream);

    expect(parser.position, 'Position').toBe(0);

    expect(() => new MimeParser(null as never)).toThrow(TypeError);
    expect(() => new MimeParser(null as never, stream)).toThrow(TypeError);
    expect(() => new MimeParser(null as never, 'entity')).toThrow(TypeError);
    expect(() => new MimeParser(ParserOptions.default, null as never)).toThrow(TypeError);
    expect(() => new MimeParser(null as never, stream, 'entity')).toThrow(TypeError);
    expect(() => new MimeParser(ParserOptions.default, null as never, 'entity')).toThrow(TypeError);

    expect(() => parser.setStream(null as never)).toThrow(TypeError);
    expect(() => parser.setStream(null as never, 'entity')).toThrow(TypeError);
    expect(() => parser.setStream(null as never, 'entity', false)).toThrow(TypeError);

    expect(() => {
      parser.Options = null as never;
    }).toThrow(TypeError);
  });

  test('TestHeaderParser', () => {
    const data = ascii('Header-1: value 1\r\nHeader-2: value 2\r\nHeader-3: value 3\r\n\r\n');

    const memory = new MemoryStream(data);
    const parser = new MimeParser(memory, 'entity');
    const headers = parseHeadersOk(parser);

    expect(headers.count, 'Unexpected header count.').toBe(3);

    expect(headers.getValue('Header-1'), 'Unexpected header value.').toBe('value 1');
    expect(headers.getValue('Header-2'), 'Unexpected header value.').toBe('value 2');
    expect(headers.getValue('Header-3'), 'Unexpected header value.').toBe('value 3');
  });

  test('TestTruncatedHeaderName', () => {
    const data = ascii('Header-1');

    const memory = new MemoryStream(data);
    const parser = new MimeParser(memory, 'entity');

    const result = parser.parseHeaders();
    expect(result.ok, 'Parsing headers should fail.').toBe(false);
  });

  test('TestTruncatedHeader', () => {
    const data = ascii('Header-1: value 1');

    const memory = new MemoryStream(data);
    const parser = new MimeParser(memory, 'entity');
    const headers = parseHeadersOk(parser);

    expect(headers.count, 'Unexpected header count.').toBe(1);
    expect(headers.getValue('Header-1'), 'Unexpected header value.').toBe('value 1');
  });

  test('TestSingleHeaderNoTerminator', () => {
    const data = ascii('Header-1: value 1\r\n');

    const memory = new MemoryStream(data);
    const parser = new MimeParser(memory, 'entity');
    const headers = parseHeadersOk(parser);

    expect(headers.count, 'Unexpected header count.').toBe(1);
    expect(headers.getValue('Header-1'), 'Unexpected header value.').toBe('value 1');
  });

  test('TestEmptyHeaders', () => {
    const data = ascii('\r\n');

    const memory = new MemoryStream(data);
    const parser = new MimeParser(memory, 'entity');
    const headers = parseHeadersOk(parser);

    expect(headers.count, 'Unexpected header count.').toBe(0);
  });

  test('TestHeadersEndWithBareCarriageReturn', () => {
    const data = ascii('From: <mimekit@example.com>\r\nTo: <mimekit@example.com>\r\nSubject: Test of headers ending with bare carriage-return\r\n\r');

    const memory = new MemoryStream(data);
    const parser = new MimeParser(memory, 'entity');
    const headers = parseHeadersOk(parser);

    expect(headers.count, 'Unexpected header count.').toBe(3);
    expect(headers.at(0).id).toBe(HeaderId.From);
    expect(headers.at(0).value).toBe('<mimekit@example.com>');
    expect(headers.at(1).id).toBe(HeaderId.To);
    expect(headers.at(1).value).toBe('<mimekit@example.com>');
    expect(headers.at(2).id).toBe(HeaderId.Subject);
    expect(headers.at(2).value).toBe('Test of headers ending with bare carriage-return');
  });

  test('TestHeadersWithBareCarriageReturn', () => {
    const data = ascii("From: <mimekit@example.com>\r\nTo: <mimekit@example.com>\r\nSubject: Test of headers ending with bare carriage-return\r\n\rYou might expect this to be a body, but it's really an invalid header.\r\n");

    const memory = new MemoryStream(data);
    const parser = new MimeParser(memory, 'entity');
    const headers = parseHeadersOk(parser);

    expect(headers.count, 'Unexpected header count.').toBe(4);
    expect(headers.at(0).id).toBe(HeaderId.From);
    expect(headers.at(0).value).toBe('<mimekit@example.com>');
    expect(headers.at(1).id).toBe(HeaderId.To);
    expect(headers.at(1).value).toBe('<mimekit@example.com>');
    expect(headers.at(2).id).toBe(HeaderId.Subject);
    expect(headers.at(2).value).toBe('Test of headers ending with bare carriage-return');
    expect(headers.at(3).isInvalid).toBe(true);
    expect(headers.at(3).field).toBe("\rYou might expect this to be a body, but it's really an invalid header.\r\n");
  });

  test('TestPartialByteOrderMarkEOF', () => {
    const bom = new Uint8Array([0xef, 0xbb /*, 0xbf */]);

    const stream = new MemoryStream(bom);
    const parser = new MimeParser(stream, 'entity');

    expect(parser.parseMessage().ok, 'ParseMessage').toBe(false);

    stream.position = 0;

    parser.setStream(stream, 'entity');

    expect(parser.parseMessage().ok, 'ParseMessage (after SetStream)').toBe(false);
  });

  test('TestPartialByteOrderMark', () => {
    const bom = new Uint8Array([0xef, 0xbb /*, 0xbf */]);

    const stream = new MemoryStream(concat(bom, bytes(join(mboxDataDir, 'simple.mbox.txt'))));
    const parser = new MimeParser(stream, 'entity');

    expect(parser.parseMessage().ok, 'ParseMessage').toBe(false);

    stream.position = 0;

    parser.setStream(stream, 'entity');

    expect(parser.parseMessage().ok, 'ParseMessage (after SetStream)').toBe(false);
  });

  test('TestByteOrderMarkEOF', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);

    const stream = new MemoryStream(bom);
    const parser = new MimeParser(stream, 'entity');

    const result = parser.parseMessage();
    expect(result.ok, 'ParseMessage: Parsing an empty stream should fail.').toBe(false);
    if (!result.ok)
      expect(result.error.message, 'ParseMessage').toBe('End of stream.');
  });

  test('TestParsingGarbageMbox', () => {
    const line = ascii('This is just a standard test file... nothing to see here. No MIME anywhere to be found\r\n');
    const chunks: Uint8Array[] = [];

    for (let i = 0; i < 200; i++)
      chunks.push(line);

    const stream = new MemoryStream(concat(...chunks));
    const parser = new MimeParser(stream, 'mbox');

    const result = parser.parseMessage();
    if (!result.ok)
      expect(result.error.message).toBe('Failed to find mbox From marker.');
  });

  test('TestParsingGarbageEntity', () => {
    const line = ascii('This is just a standard test file... nothing to see here. No MIME anywhere to be found\r\n');
    const chunks: Uint8Array[] = [];

    for (let i = 0; i < 200; i++)
      chunks.push(line);

    const stream = new MemoryStream(concat(...chunks));
    const parser = new MimeParser(stream, 'entity');

    const result = parser.parseEntity();
    if (!result.ok)
      expect(result.error.message).toBe('Failed to parse entity headers.');
  });

  test('TestParsingGarbageMessage', () => {
    const line = ascii('This is just a standard test file... nothing to see here. No MIME anywhere to be found\r\n');
    const chunks: Uint8Array[] = [];

    for (let i = 0; i < 200; i++)
      chunks.push(line);

    const stream = new MemoryStream(concat(...chunks));
    const parser = new MimeParser(stream, 'entity');

    const result = parser.parseMessage();
    if (!result.ok)
      expect(result.error.message).toBe('Failed to parse message headers.');
  });

  test('TestDoubleMboxMarker', () => {
    const content = ascii('From - \r\nFrom -\r\nFrom: sender@example.com\r\nTo: recipient@example.com\r\nSubject: test message\r\n\r\nBody text\r\n');

    const stream = new MemoryStream(content);
    const parser = new MimeParser(stream, 'mbox');

    let message = parseMessageOk(parser);
    expect(message.headers.count).toBe(0);

    message = parseMessageOk(parser);
    expect(message.headers.count).toBe(3);
  });

  test('TestReallyLongMboxMarker', () => {
    const content = ascii('\r\nFrom: sender@example.com\r\nTo: recipient@example.com\r\nSubject: test message\r\n\r\nBody text\r\n');
    const marker = 'From ' + 'X'.repeat(4092);

    const stream = new MemoryStream(concat(ascii(marker), content));
    const parser = new MimeParser(stream, 'mbox');

    const message = parseMessageOk(parser);
    expect(message.headers.count).toBe(3);
    expect(parser.mboxMarker).toBe(marker);
  });

  test('TestTruncatedMboxMarker', () => {
    const data = ascii('From <incomplete mbox marker>');

    const memory = new MemoryStream(data);
    const parser = new MimeParser(memory, 'mbox');

    expect(parser.parseMessage().ok).toBe(false);
  });

  test('TestEmptyMboxStream', () => {
    const memory = new MemoryStream(new Uint8Array(0));
    const parser = new MimeParser(memory, 'mbox');

    const result = parser.parseMessage();
    expect(result.ok, 'Parsing an empty stream should fail.').toBe(false);
    if (!result.ok)
      expect(result.error.message).toBe('End of stream.');
  });

  test('TestEmptyEntityStream', () => {
    const memory = new MemoryStream(new Uint8Array(0));
    const parser = new MimeParser(memory, 'entity');

    const result = parser.parseEntity();
    expect(result.ok, 'Parsing an empty stream should fail.').toBe(false);
    if (!result.ok)
      expect(result.error.message).toBe('End of stream.');
  });

  test('TestEmptyMessageStream', () => {
    const memory = new MemoryStream(new Uint8Array(0));
    const parser = new MimeParser(memory, 'entity');

    const result = parser.parseMessage();
    expect(result.ok, 'Parsing an empty stream should fail.').toBe(false);
    if (!result.ok)
      expect(result.error.message).toBe('End of stream.');
  });

  test('TestEmptyMessage', () => {
    const data = ascii('\r\n');

    const memory = new MemoryStream(data);
    const parser = new MimeParser(memory, 'entity');
    const message = parseMessageOk(parser);

    expect(message.headers.count, 'Unexpected header count.').toBe(0);
  });

  test.each(['garbage', '!%^#&^!\\t  '])('TestInvalidContentType', (mimeType) => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of recovery from invalid media-type in Content-Type header
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: ${mimeType}; charset=utf-8

This is the message body.
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a MimePart').toBeInstanceOf(MimePart);
      const part = message.body as MimePart;
      expect(part.contentType.mimeType, 'Expected application/octet-stream').toBe('application/octet-stream');
      expect(part.contentType.charset, 'Expected to keep Content-Type parameters').toBe('utf-8');

      const body = new TextPart('plain');
      body.content = part.content;

      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a MimePart').toBeInstanceOf(MimePart);
      const part = message.body as MimePart;
      expect(part.contentType.mimeType, 'Expected application/octet-stream').toBe('application/octet-stream');
      expect(part.contentType.charset, 'Expected to keep Content-Type parameters').toBe('utf-8');

      const body = new TextPart('plain');
      body.content = part.content;

      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestHeaderFieldNameBeginsWithColon', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of a header line starting with ':'
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: text/plain; charset=utf-8
: What header is this?

This is the message body.
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a TextPart').toBeInstanceOf(TextPart);
      const header = message.headers.at(message.headers.count - 1);

      // FIXME: Should this really be "valid"?
      expect(header.isInvalid, 'IsInvalid is expected to be false').toBe(false);
      expect(header.field, 'Field is expected to be empty').toBe('');
      expect(header.value).toBe('What header is this?');

      const body = message.body as TextPart;
      expect(body.contentType.mimeType, 'Expected text/plain').toBe('text/plain');
      expect(body.contentType.charset, 'Expected to keep Content-Type parameters').toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a TextPart').toBeInstanceOf(TextPart);
      const header = message.headers.at(message.headers.count - 1);

      // FIXME: Should this really be "valid"?
      expect(header.isInvalid, 'IsInvalid is expected to be false').toBe(false);
      expect(header.field, 'Field is expected to be empty').toBe('');
      expect(header.value).toBe('What header is this?');

      const body = message.body as TextPart;
      expect(body.contentType.mimeType, 'Expected text/plain').toBe('text/plain');
      expect(body.contentType.charset, 'Expected to keep Content-Type parameters').toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestHeaderFieldNameColonColon', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of a Content-Transfer-Encoding header with double ':'s
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding:: base64
Content-Disposition: inline; name=body.txt

This is the message body.
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a TextPart').toBeInstanceOf(TextPart);
      const body = message.body as TextPart;

      const header = body.headers.at(body.headers.count - 2);

      expect(header.id, 'Expected Content-Transfer-Encoding header').toBe(HeaderId.ContentTransferEncoding);
      expect(header.isInvalid, 'IsInvalid is expected to be false').toBe(false);
      expect(header.value).toBe(': base64');
      expect(body.contentTransferEncoding, 'Expected Content-Transfer-Encoding to be Default').toBe('default');

      expect(body.contentType.mimeType, 'Expected text/plain').toBe('text/plain');
      expect(body.contentType.charset, 'Expected to keep Content-Type parameters').toBe('utf-8');

      expect(body.contentDisposition, 'Expected Content-Disposition to not be null').not.toBeNull();
      expect(body.contentDisposition!.disposition, 'Expected Content-Disposition to be inline').toBe('inline');
      expect(body.contentDisposition!.parameters.get('name'), 'Expected Content-Disposition name parameter to be body.txt').toBe('body.txt');

      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a TextPart').toBeInstanceOf(TextPart);
      const body = message.body as TextPart;

      const header = body.headers.at(body.headers.count - 2);

      expect(header.id, 'Expected Content-Transfer-Encoding header').toBe(HeaderId.ContentTransferEncoding);
      expect(header.isInvalid, 'IsInvalid is expected to be false').toBe(false);
      expect(header.value).toBe(': base64');
      expect(body.contentTransferEncoding, 'Expected Content-Transfer-Encoding to be Default').toBe('default');

      expect(body.contentType.mimeType, 'Expected text/plain').toBe('text/plain');
      expect(body.contentType.charset, 'Expected to keep Content-Type parameters').toBe('utf-8');

      expect(body.contentDisposition, 'Expected Content-Disposition to not be null').not.toBeNull();
      expect(body.contentDisposition!.disposition, 'Expected Content-Disposition to be inline').toBe('inline');
      expect(body.contentDisposition!.parameters.get('name'), 'Expected Content-Disposition name parameter to be body.txt').toBe('body.txt');

      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartTruncatedAtEndOfFirstBoundary', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of multipart truncated at the end of the first boundary
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count).toBe(0);

      // FIXME: output is missing last boundary
      assertSerialization(message, 'unix', text.substring(0, text.length - '------=_NextPart_000_003F_01CE98CE.6E826F90'.length));
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count).toBe(0);

      // FIXME: output is missing last boundary
      assertSerialization(message, 'dos', text.substring(0, text.length - '------=_NextPart_000_003F_01CE98CE.6E826F90'.length));
    }
  });

  test('TestMultipartTruncatedAtEndOfSecondBoundary', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of a multipart truncated at the end of the second boundary
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the message body.

------=_NextPart_000_003F_01CE98CE.6E826F90`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count).toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      // FIXME: output is missing last boundary
      assertSerialization(message, 'unix', text.substring(0, text.length - '------=_NextPart_000_003F_01CE98CE.6E826F90'.length));
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count).toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      // FIXME: output is missing last boundary
      assertSerialization(message, 'dos', text.substring(0, text.length - '------=_NextPart_000_003F_01CE98CE.6E826F90'.length));
    }
  });

  test('TestMultipartTruncatedImmediatelyAfterFirstBoundary', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of multipart truncated immedately after first boundary
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count).toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.text).toBe('');

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count).toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.text).toBe('');

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartTruncatedImmediatelyAfterSecondBoundary', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of a multipart truncated immediately after the second boundary
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the message body.

------=_NextPart_000_003F_01CE98CE.6E826F90
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.text).toBe('');

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.text).toBe('');

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartBoundaryWithoutTrailingNewline', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of multipart boundary w/o trailing newline
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the message body.

------=_NextPart_000_003F_01CE98CE.6E826F90`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count).toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      // FIXME: output is missing last boundary
      assertSerialization(message, 'unix', text.substring(0, text.length - '------=_NextPart_000_003F_01CE98CE.6E826F90'.length));
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count).toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      // FIXME: output is missing last boundary
      assertSerialization(message, 'dos', text.substring(0, text.length - '------=_NextPart_000_003F_01CE98CE.6E826F90'.length));
    }
  });

  test('TestTruncatedMultipartSubpartHeaders', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of truncated multipart subpart headers
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 1 child').toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('');

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 1 child').toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('');

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestTruncatedMultipartSubpartHeaderFieldName', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of truncated multipart subpart header field name
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8
Content-Dis`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 1 child').toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.count, 'Expected 2 headers').toBe(2);
      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.headers.at(1).isInvalid).toBe(true);
      expect(body.headers.at(1).field).toBe('Content-Dis');
      expect(body.text).toBe('');

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 1 child').toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.count, 'Expected 2 headers').toBe(2);
      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.headers.at(1).isInvalid).toBe(true);
      expect(body.headers.at(1).field).toBe('Content-Dis');
      expect(body.text).toBe('');

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartSubpartHeadersEndWithBoundary', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of multipart subpart headers ending with a boundary
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8
------=_NextPart_000_003F_01CE98CE.6E826F90--
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 1 child').toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('');

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 1 child').toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('');

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartSubpartHeadersLineStartsWithDashDash', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of multipart subpart headers line starting with --
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8
--not-the-boundary-muhahaha

This is the message body.

------=_NextPart_000_003F_01CE98CE.6E826F90--
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 1 child').toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.headers.count).toBe(2);
      expect(body.headers.at(1).isInvalid, 'IsInvalid').toBe(true);
      expect(body.headers.at(1).field).toBe('--not-the-boundary-muhahaha\n');

      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 1 child').toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.headers.count).toBe(2);
      expect(body.headers.at(1).isInvalid, 'IsInvalid').toBe(true);
      expect(body.headers.at(1).field).toBe('--not-the-boundary-muhahaha\r\n');

      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartSubpartHeadersLineStartsWithDashDashEOF', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of multipart subpart headers line starting with -- <EOF>
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8
--not-the-boundary-muhahaha`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 1 child').toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.headers.count).toBe(2);
      expect(body.headers.at(1).isInvalid, 'IsInvalid').toBe(true);
      expect(body.headers.at(1).field).toBe('--not-the-boundary-muhahaha');

      expect(body.text).toBe('');

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 1 child').toBe(1);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.headers.count).toBe(2);
      expect(body.headers.at(1).isInvalid, 'IsInvalid').toBe(true);
      expect(body.headers.at(1).field).toBe('--not-the-boundary-muhahaha');

      expect(body.text).toBe('');

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartWithoutEndBoundary', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of a multipart without an end boundary
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the first part.

------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the second part.
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      // FIXME: output includes an extra newline at the end
      assertSerialization(message, 'unix', text + '\n');
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      // FIXME: output includes an extra newline at the end
      assertSerialization(message, 'dos', text + '\r\n');
    }
  });

  test('TestMultipartBoundaryLineWithTrailingSpaces', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of a multipart boundary followed by trailing whitespace
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90${'   '}
Content-Type: text/plain; charset=utf-8

This is the first part.

------=_NextPart_000_003F_01CE98CE.6E826F90${'       '}
Content-Type: text/plain; charset=utf-8

This is the second part.

------=_NextPart_000_003F_01CE98CE.6E826F90--${'  '}
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartBoundaryLineWithTrailingSpacesAndThenMoreCharacters', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of a multipart boundary followed by trailing whitespace and then more characters
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the first part.

------=_NextPart_000_003F_01CE98CE.6E826F90       oops, not it.
------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the second part.

------=_NextPart_000_003F_01CE98CE.6E826F90--
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine + environmentNewLine + '------=_NextPart_000_003F_01CE98CE.6E826F90       oops, not it.');

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine + environmentNewLine + '------=_NextPart_000_003F_01CE98CE.6E826F90       oops, not it.');

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartDoubleBoundary', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of double multipart boundaries
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the first part.

------=_NextPart_000_003F_01CE98CE.6E826F90
------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is technically the third part.

------=_NextPart_000_003F_01CE98CE.6E826F90--
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 3 children').toBe(3);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in second child of multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected second child of multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      expect(multipart.at(2), 'Expected third child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(2) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is technically the third part.' + environmentNewLine);

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 3 children').toBe(3);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in second child of multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected second child of multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      expect(multipart.at(2), 'Expected third child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(2) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is technically the third part.' + environmentNewLine);

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartDoubleBoundaryEndBoundary', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of double multipart boundaries and then an end boundary
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the first part.

------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the second part.

------=_NextPart_000_003F_01CE98CE.6E826F90
------=_NextPart_000_003F_01CE98CE.6E826F90
------=_NextPart_000_003F_01CE98CE.6E826F90--
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 4 children').toBe(4);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      expect(multipart.at(2), 'Expected third child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(2) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in third child of multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected third child of multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      expect(multipart.at(3), 'Expected fourth child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(3) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in fourth child of multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected fourth child of multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 4 children').toBe(4);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      expect(multipart.at(2), 'Expected third child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(2) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in third child of multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected third child of multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      expect(multipart.at(3), 'Expected fourth child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(3) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in fourth child of multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected fourth child of multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartDoubleBoundaryEof', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of multipart ending with a double boundary
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the first part.

------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the second part.

------=_NextPart_000_003F_01CE98CE.6E826F90
------=_NextPart_000_003F_01CE98CE.6E826F90
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 4 children').toBe(4);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      expect(multipart.at(2), 'Expected third child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(2) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in third child of multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected third child of multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      expect(multipart.at(3), 'Expected fourth child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(3) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in fourth child of multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected fourth child of multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 4 children').toBe(4);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      expect(multipart.at(2), 'Expected third child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(2) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in third child of multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected third child of multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      expect(multipart.at(3), 'Expected fourth child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(3) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in fourth child of multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected fourth child of multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartDoubleBoundaryParentBoundary', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of multipart with double boundaries and then a parent boundary
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
Content-Type: multipart/mixed;
\tboundary="outer-boundary"

--outer-boundary
Content-Type: multipart/mixed;
\tboundary="inner-boundary"

--inner-boundary
Content-Type: text/plain; charset=utf-8

This is the first part.

--inner-boundary
Content-Type: text/plain; charset=utf-8

This is the second part.

--inner-boundary
--inner-boundary
--outer-boundary
Content-Type: image/jpeg

<base64 data>
--outer-boundary--
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const outer = message.body as Multipart;
      expect(outer.count, 'Expected 2 outer children').toBe(2);
      expect(outer.at(0), 'Expected first child of the outer multipart to be multipart/mixed').toBeInstanceOf(Multipart);
      expect(outer.at(1), 'Expected second child of the outer multipart to be image/jpeg').toBeInstanceOf(MimePart);

      const multipart = outer.at(0) as Multipart;
      expect(multipart.count, 'Expected 4 inner children').toBe(4);
      expect(multipart.at(0), 'Expected first child of the inner multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the inner multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      expect(multipart.at(2), 'Expected third child of the inner multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(2) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in third child of inner multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected third child of inner multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      expect(multipart.at(3), 'Expected fourth child of the inner multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(3) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in fourth child of inner multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected fourth child of inner multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const outer = message.body as Multipart;
      expect(outer.count, 'Expected 2 outer children').toBe(2);
      expect(outer.at(0), 'Expected first child of the outer multipart to be multipart/mixed').toBeInstanceOf(Multipart);
      expect(outer.at(1), 'Expected second child of the outer multipart to be image/jpeg').toBeInstanceOf(MimePart);

      const multipart = outer.at(0) as Multipart;
      expect(multipart.count, 'Expected 4 inner children').toBe(4);
      expect(multipart.at(0), 'Expected first child of the inner multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the first part.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the inner multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(1) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the second part.' + environmentNewLine);

      expect(multipart.at(2), 'Expected third child of the inner multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(2) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in third child of inner multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected third child of inner multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      expect(multipart.at(3), 'Expected fourth child of the inner multipart to be text/plain').toBeInstanceOf(TextPart);
      body = multipart.at(3) as TextPart;

      expect(body.headers.count, 'Expected 0 headers in fourth child of inner multipart').toBe(0);
      expect(body.contentType.mimeType, 'Expected fourth child of inner multipart to be treated as text/plain').toBe('text/plain');
      expect(body.text).toBe('');

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMultipartWithoutBoundaryParameter', () => {
    let text = `Content-Type: multipart/mixed

------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the first part.

------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the second part.

------=_NextPart_000_003F_01CE98CE.6E826F90--
`;
    const dashes = text.indexOf('--');
    const preamble = text.substring(dashes);

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const multipart = parseEntityOk(parser) as Multipart;

      expect(multipart.boundary, 'Boundary').toBeNull();
      expect(multipart.count, 'Expected 0 children').toBe(0);
      expect(multipart.preamble, 'Preamble').toBe(preamble);

      assertSerialization(multipart, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const multipart = parseEntityOk(parser) as Multipart;

      expect(multipart.boundary, 'Boundary').toBeNull();
      expect(multipart.count, 'Expected 0 children').toBe(0);
      expect(multipart.preamble, 'Preamble').toBe(dosify(preamble));

      assertSerialization(multipart, 'dos', text);
    }
  });

  test('TestTruncatedImmediatelyAfterMessageRfc822Headers', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of message/rfc822 part truncated immediately after the MIME headers
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the message body.

------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: message/rfc822

`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be message/rfc822').toBeInstanceOf(MessagePart);
      const rfc822 = multipart.at(1) as MessagePart;
      expect(rfc822.message, 'Message').toBeNull();

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be message/rfc822').toBeInstanceOf(MessagePart);
      const rfc822 = multipart.at(1) as MessagePart;
      expect(rfc822.message, 'Message').toBeNull();

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMessageRfc822WithoutMessage', () => {
    let text = `From: mimekit@example.com
To: mimekit@example.com
Subject: test of message/rfc822 part without a message
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"
Content-Length: 420


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the message body.

------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: message/rfc822

------=_NextPart_000_003F_01CE98CE.6E826F90--
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be message/rfc822').toBeInstanceOf(MessagePart);
      const rfc822 = multipart.at(1) as MessagePart;
      expect(rfc822.message, 'Message').toBeNull();

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      const body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be message/rfc822').toBeInstanceOf(MessagePart);
      const rfc822 = multipart.at(1) as MessagePart;
      expect(rfc822.message, 'Message').toBeNull();

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMessageRfc822WithFromMarkerBeforeMessage', () => {
    let text = `From -
From: mimekit@example.com
To: mimekit@example.com
Subject: test of message/rfc822 part with a From-marker before the message
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Message-ID: <54AD68C9E3B0184CAC6041320424FD1B5B81E74D@localhost.localdomain>
X-Mailer: Microsoft Office Outlook 12.0
Content-Type: multipart/mixed;
\tboundary="----=_NextPart_000_003F_01CE98CE.6E826F90"
Content-Length: 420


------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: text/plain; charset=utf-8

This is the message body.

------=_NextPart_000_003F_01CE98CE.6E826F90
Content-Type: message/rfc822

From -
From: mimekit@example.com
To: mimekit@example.com
Subject: embedded message
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

This is the embedded message body.
`;

    {
      const stream = new MemoryStream(ascii(text));
      const options = ParserOptions.default.clone();
      options.respectContentLength = true;

      const parser = new MimeParser(options, stream, 'mbox');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be message/rfc822').toBeInstanceOf(MessagePart);
      const rfc822 = multipart.at(1) as MessagePart;

      expect(rfc822.message!.body, 'Expected child of the embedded message to be text/plain').toBeInstanceOf(TextPart);
      body = rfc822.message!.body as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the embedded message body.' + environmentNewLine);

      // FIXME: This is adding an extra newline to the end of the message
      assertSerialization(message, 'unix', text + '\n');
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const options = ParserOptions.default.clone();
      options.respectContentLength = true;

      const parser = new MimeParser(options, stream, 'mbox');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a multipart').toBeInstanceOf(Multipart);
      const multipart = message.body as Multipart;
      expect(multipart.count, 'Expected 2 children').toBe(2);
      expect(multipart.at(0), 'Expected first child of the multipart to be text/plain').toBeInstanceOf(TextPart);
      let body = multipart.at(0) as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the message body.' + environmentNewLine);

      expect(multipart.at(1), 'Expected second child of the multipart to be message/rfc822').toBeInstanceOf(MessagePart);
      const rfc822 = multipart.at(1) as MessagePart;

      expect(rfc822.message!.body, 'Expected child of the embedded message to be text/plain').toBeInstanceOf(TextPart);
      body = rfc822.message!.body as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the embedded message body.' + environmentNewLine);

      // FIXME: This is adding an extra newline to the end of the message
      assertSerialization(message, 'dos', text + '\r\n');
    }
  });

  test('TestMessageRfc822WithMungedFromMarkerBeforeMessage', () => {
    let text = `From - Fri Mar  7 02:51:22 1997
Return-Path: <jwz@netscape.com>
Received: from gruntle ([205.217.227.10]) by dredd.mcom.com
          (Netscape Mail Server v2.02) with SMTP id AAA4040
          for <jwz@netscape.com>; Fri, 7 Mar 1997 02:50:37 -0800
Sender: jwz@netscape.com (Jamie Zawinski)
Message-ID: <331FF2FF.FF6@netscape.com>
Date: Fri, 07 Mar 1997 02:50:39 -0800
From: Jamie Zawinski <jwz@netscape.com>
Organization: Netscape Communications Corporation, Mozilla Division
X-Mailer: Mozilla 3.01 (X11; U; IRIX 6.2 IP22)
MIME-Version: 1.0
To: Jamie Zawinski <jwz@netscape.com>
Subject: forwarded encrypted message
Content-Type: message/rfc822; name="smime18-encrypted.msg"
Content-Transfer-Encoding: 7bit
Content-Disposition: inline; filename="smime18-encrypted.msg"
X-Mozilla-Status: 0001
Content-Length: 2812

>From - Fri Dec 13 15:01:21 1996
Return-Path: <blaker@craswell.com>
Received: from maleman.mcom.com ([198.93.92.3]) by dredd.mcom.com
          (Netscape Mail Server v2.02) with SMTP id AAA19742
          for <jwz@dredd.mcom.com>; Fri, 13 Dec 1996 14:59:31 -0800
Received: from xwing.netscape.com (xwing.mcom.com [205.218.156.54]) by maleman.mcom.com (8.6.9/8.6.9) with ESMTP id OAA23726 for <jwz@netscape.com>; Fri, 13 Dec 1996 14:58:13 -0800
Received: from peapod.deming.com (host20.deming.com [206.63.131.20]) by xwing.netscape.com (8.7.6/8.7.3) with SMTP id OAA00270 for <jwz@netscape.com>; Fri, 13 Dec 1996 14:59:27 -0800 (PST)
Received: by peapod.deming.com from localhost
    (router,SLmail V2.0); Fri, 13 Dec 1996 15:01:48 Pacific Standard Time
Received: by peapod.deming.com from seth
    (206.63.131.30::mail daemon; unverified,SLmail V2.0); Fri, 13 Dec 1996 15:01:02 Pacific Standard Time
Message-Id: <3.0.32.19961213150855.009172e0@mail.craswell.com>
X-Sender: blaker@mail.craswell.com
X-Mailer: Windows Eudora Pro Version 3.0 (32)
Date: Fri, 13 Dec 1996 15:09:42 -0800
To: Jamie Zawinski <jwz@netscape.com>
From: "Blake Ramsdell" <blaker@craswell.com>
Subject: Re: can you send me an encrypted message?
MIME-Version: 1.0
Content-Type: application/x-pkcs7-mime; name="smime.p7m"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="smime.p7m"

MIAGCSqGSIb3DQEHA6CAMIACAQAxgDCBzAIBADB2MGIxETAPBgNVBAcTCEludGVybmV0MRcw
FQYDVQQKEw5WZXJpU2lnbiwgSW5jLjE0MDIGA1UECxMrVmVyaVNpZ24gQ2xhc3MgMSBDQSAt
IEluZGl2aWR1YWwgU3Vic2NyaWJlcgIQKQ/GF/RumodE+WtXiPJmhDANBgkqhkiG9w0BAQEF
AARAb0tthyav05ce7KBWdlfN1M0R6wLQ2FWPVQynuWo/yHUoo3hiII7j15FXNgnxF7QkY5/p
mZXg0P2eJ1iYQy1vZDCBzAIBADB2MGIxETAPBgNVBAcTCEludGVybmV0MRcwFQYDVQQKEw5W
ZXJpU2lnbiwgSW5jLjE0MDIGA1UECxMrVmVyaVNpZ24gQ2xhc3MgMSBDQSAtIEluZGl2aWR1
YWwgU3Vic2NyaWJlcgIQDOtpec1+JM3EpqAMVqgtjzANBgkqhkiG9w0BAQEFAARAuqnsnz1O
qEdx7NEMJDEdjccjdEuCM8x2euTYlU/GWNY+s2iKVahbT3/R8E8hp3YfrHd2sjvgy6teTOPO
ZI2SxwAAMIAGCSqGSIb3DQEHATAUBggqhkiG9w0DBwQIlhWqtbsElaWggASCAjBooYYTWSBz
7A4l0Aho7mK85zpMyAR0xTKqHXT0zL9XpHbKPAcETaBTh1n7e8aJeQ93ONGAs6tVVlA6bpUN
F3Q5O+ZuNXOMT83HIKRYEO1l8a+CH7XtUiQWtu/aBt12GQDX475WhPULKEJs7kLS2DwToRX/
ctwEPNwc6zfsOZoVTQ5HOwisvDZ2QGwa08Psj38SaQ0Y+ryk5FeiAtKQUZ0uuJWI/rRu64yj
KmVs1DDId18coftA2rv/u2/zABEX8u5ckEkwS7fO7UHv6XMCQ3kqgqIZZE1zIGohfUdtOYYo
M4eki3QDyovHPxEjBbnmpUw2xDN7/DdxYEZ4CteWurQ+VoP0PUM2qwi6EgM6MpVKg8KzOWdb
aV51a1oQKtpJJFZqZtFf9SQ4OW6NKXHsJ2AF8W4OQ+ySWQN43wMk8dGJYlPrREqn5RufPg3k
QM+s4VwTrS2TrU+ELZCYnJFfH+N7tE8ILrFMAteVxtqjat7OJRyDxy0cnBP+oG81Sr0zvbdC
jUPUDFlrPgFjDrswX1UpkEE2OgKWmfc134AbysJFOuCIze2XqKB96rJvxS76ygzVvrU/4sI1
6VDlZUEuUPaBUOimFxRk/rqPJDI1M8rNKykw9qsoWQMRnvrODfzo7iVWQ0TQHiwfoBhs6Dvm
UgrMwopFnzRdSHvT1acSqVfMYWm5nXImvtCuFAavkjDutE9+Y/LLFLBUpAVeu3rwW3wV0Tcv
9I6Afej0ntfbH9vlRwQIl7MeXMqoBV0AAAAAAAAAAAAA
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(ParserOptions.default, stream, 'mbox');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a MessagePart').toBeInstanceOf(MessagePart);
      const rfc822 = message.body as MessagePart;

      expect(rfc822.contentType.name, 'MessagePart.ContentType.Name').toBe('smime18-encrypted.msg');
      expect(rfc822.contentDisposition!.disposition, 'MessagePart.ContentDisposition.Disposition').toBe('inline');
      expect(rfc822.contentDisposition!.fileName, 'MessagePart.ContentDisposition.FileName').toBe('smime18-encrypted.msg');
      //expect(rfc822.contentTransferEncoding, 'MessagePart.ContentTransferEncoding').toBe('7bit');

      expect(rfc822.message, 'MessagePart.Message').not.toBeNull();
      expect(rfc822.message!.mboxMarker, 'MessagePart.Message.MboxMarker').not.toBeNull();
      expect(latin1.decode(rfc822.message!.mboxMarker!)).toBe('>From - Fri Dec 13 15:01:21 1996\n');
      expect(rfc822.message!.headers.count, 'MessagePart.Message.Headers.Count').toBe(14);
      expect(rfc822.message!.body!.headers.count, 'MessagePart.Message.Body.Headers.Count').toBe(3);

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(ParserOptions.default, stream, 'mbox');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a MessagePart').toBeInstanceOf(MessagePart);
      const rfc822 = message.body as MessagePart;

      expect(rfc822.contentType.name, 'MessagePart.ContentType.Name').toBe('smime18-encrypted.msg');
      expect(rfc822.contentDisposition!.disposition, 'MessagePart.ContentDisposition.Disposition').toBe('inline');
      expect(rfc822.contentDisposition!.fileName, 'MessagePart.ContentDisposition.FileName').toBe('smime18-encrypted.msg');
      //expect(rfc822.contentTransferEncoding, 'MessagePart.ContentTransferEncoding').toBe('7bit');

      expect(rfc822.message, 'MessagePart.Message').not.toBeNull();
      expect(rfc822.message!.mboxMarker, 'MessagePart.Message.MboxMarker').not.toBeNull();
      expect(latin1.decode(rfc822.message!.mboxMarker!)).toBe('>From - Fri Dec 13 15:01:21 1996\r\n');
      expect(rfc822.message!.headers.count, 'MessagePart.Message.Headers.Count').toBe(14);
      expect(rfc822.message!.body!.headers.count, 'MessagePart.Message.Body.Headers.Count').toBe(3);

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMessageRfc822WithMungedFromMarkerEOF', () => {
    let text = `From - Fri Mar  7 02:51:22 1997
Return-Path: <jwz@netscape.com>
Received: from gruntle ([205.217.227.10]) by dredd.mcom.com
          (Netscape Mail Server v2.02) with SMTP id AAA4040
          for <jwz@netscape.com>; Fri, 7 Mar 1997 02:50:37 -0800
Sender: jwz@netscape.com (Jamie Zawinski)
Message-ID: <331FF2FF.FF6@netscape.com>
Date: Fri, 07 Mar 1997 02:50:39 -0800
From: Jamie Zawinski <jwz@netscape.com>
Organization: Netscape Communications Corporation, Mozilla Division
X-Mailer: Mozilla 3.01 (X11; U; IRIX 6.2 IP22)
MIME-Version: 1.0
To: Jamie Zawinski <jwz@netscape.com>
Subject: forwarded encrypted message
Content-Type: message/rfc822; name="smime18-encrypted.msg"
Content-Transfer-Encoding: 7bit
Content-Disposition: inline; filename="smime18-encrypted.msg"
X-Mozilla-Status: 0001
Content-Length: 2812

>From - Fri Dec 13 15:01:21 1996`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(ParserOptions.default, stream, 'mbox');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a MessagePart').toBeInstanceOf(MessagePart);
      const rfc822 = message.body as MessagePart;

      expect(rfc822.contentType.name, 'MessagePart.ContentType.Name').toBe('smime18-encrypted.msg');
      expect(rfc822.contentDisposition!.disposition, 'MessagePart.ContentDisposition.Disposition').toBe('inline');
      expect(rfc822.contentDisposition!.fileName, 'MessagePart.ContentDisposition.FileName').toBe('smime18-encrypted.msg');
      //expect(rfc822.contentTransferEncoding, 'MessagePart.ContentTransferEncoding').toBe('7bit');

      expect(rfc822.message, 'MessagePart.Message').not.toBeNull();
      expect(rfc822.message!.mboxMarker, 'MessagePart.Message.MboxMarker').not.toBeNull();
      expect(latin1.decode(rfc822.message!.mboxMarker!)).toBe('>From - Fri Dec 13 15:01:21 1996');
      expect(rfc822.message!.headers.count, 'MessagePart.Message.Headers.Count').toBe(0);
      expect(rfc822.message!.body!.headers.count, 'MessagePart.Message.Body.Headers.Count').toBe(0);

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(ParserOptions.default, stream, 'mbox');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a MessagePart').toBeInstanceOf(MessagePart);
      const rfc822 = message.body as MessagePart;

      expect(rfc822.contentType.name, 'MessagePart.ContentType.Name').toBe('smime18-encrypted.msg');
      expect(rfc822.contentDisposition!.disposition, 'MessagePart.ContentDisposition.Disposition').toBe('inline');
      expect(rfc822.contentDisposition!.fileName, 'MessagePart.ContentDisposition.FileName').toBe('smime18-encrypted.msg');
      //expect(rfc822.contentTransferEncoding, 'MessagePart.ContentTransferEncoding').toBe('7bit');

      expect(rfc822.message, 'MessagePart.Message').not.toBeNull();
      expect(rfc822.message!.mboxMarker, 'MessagePart.Message.MboxMarker').not.toBeNull();
      expect(latin1.decode(rfc822.message!.mboxMarker!)).toBe('>From - Fri Dec 13 15:01:21 1996');
      expect(rfc822.message!.headers.count, 'MessagePart.Message.Headers.Count').toBe(0);
      expect(rfc822.message!.body!.headers.count, 'MessagePart.Message.Body.Headers.Count').toBe(0);

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMessageRfc822WithTruncatedMungedFromMarker', () => {
    let text = `From - Fri Mar  7 02:51:22 1997
Return-Path: <jwz@netscape.com>
Received: from gruntle ([205.217.227.10]) by dredd.mcom.com
          (Netscape Mail Server v2.02) with SMTP id AAA4040
          for <jwz@netscape.com>; Fri, 7 Mar 1997 02:50:37 -0800
Sender: jwz@netscape.com (Jamie Zawinski)
Message-ID: <331FF2FF.FF6@netscape.com>
Date: Fri, 07 Mar 1997 02:50:39 -0800
From: Jamie Zawinski <jwz@netscape.com>
Organization: Netscape Communications Corporation, Mozilla Division
X-Mailer: Mozilla 3.01 (X11; U; IRIX 6.2 IP22)
MIME-Version: 1.0
To: Jamie Zawinski <jwz@netscape.com>
Subject: forwarded encrypted message
Content-Type: message/rfc822; name="smime18-encrypted.msg"
Content-Transfer-Encoding: 7bit
Content-Disposition: inline; filename="smime18-encrypted.msg"
X-Mozilla-Status: 0001
Content-Length: 2812

>From`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(ParserOptions.default, stream, 'mbox');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a MessagePart').toBeInstanceOf(MessagePart);
      const rfc822 = message.body as MessagePart;

      expect(rfc822.contentType.name, 'MessagePart.ContentType.Name').toBe('smime18-encrypted.msg');
      expect(rfc822.contentDisposition!.disposition, 'MessagePart.ContentDisposition.Disposition').toBe('inline');
      expect(rfc822.contentDisposition!.fileName, 'MessagePart.ContentDisposition.FileName').toBe('smime18-encrypted.msg');
      //expect(rfc822.contentTransferEncoding, 'MessagePart.ContentTransferEncoding').toBe('7bit');

      expect(rfc822.message, 'MessagePart.Message').not.toBeNull();
      expect(rfc822.message!.mboxMarker, 'MessagePart.Message.MboxMarker').not.toBeNull();
      expect(latin1.decode(rfc822.message!.mboxMarker!)).toBe('>From');
      expect(rfc822.message!.headers.count, 'MessagePart.Message.Headers.Count').toBe(0);
      expect(rfc822.message!.body!.headers.count, 'MessagePart.Message.Body.Headers.Count').toBe(0);

      assertSerialization(message, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(ParserOptions.default, stream, 'mbox');
      const message = parseMessageOk(parser);

      expect(message.body, 'Expected top-level to be a MessagePart').toBeInstanceOf(MessagePart);
      const rfc822 = message.body as MessagePart;

      expect(rfc822.contentType.name, 'MessagePart.ContentType.Name').toBe('smime18-encrypted.msg');
      expect(rfc822.contentDisposition!.disposition, 'MessagePart.ContentDisposition.Disposition').toBe('inline');
      expect(rfc822.contentDisposition!.fileName, 'MessagePart.ContentDisposition.FileName').toBe('smime18-encrypted.msg');
      //expect(rfc822.contentTransferEncoding, 'MessagePart.ContentTransferEncoding').toBe('7bit');

      expect(rfc822.message, 'MessagePart.Message').not.toBeNull();
      expect(rfc822.message!.mboxMarker, 'MessagePart.Message.MboxMarker').not.toBeNull();
      expect(latin1.decode(rfc822.message!.mboxMarker!)).toBe('>From');
      expect(rfc822.message!.headers.count, 'MessagePart.Message.Headers.Count').toBe(0);
      expect(rfc822.message!.body!.headers.count, 'MessagePart.Message.Body.Headers.Count').toBe(0);

      assertSerialization(message, 'dos', text);
    }
  });

  test('TestMessageRfc822', () => {
    let text = `Content-Type: message/rfc822

From: mimekit@example.com
To: mimekit@example.com
Subject: embedded message
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

This is the rfc822 message body.
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const entity = parseEntityOk(parser);

      expect(entity, 'Expected message/rfc822').toBeInstanceOf(MessagePart);
      const rfc822 = entity as MessagePart;

      expect(rfc822.message!.body, 'Expected child of the message/rfc822 to be text/plain').toBeInstanceOf(TextPart);
      const body = rfc822.message!.body as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the rfc822 message body.' + environmentNewLine);

      assertSerialization(entity, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const entity = parseEntityOk(parser);

      expect(entity, 'Expected message/rfc822').toBeInstanceOf(MessagePart);
      const rfc822 = entity as MessagePart;

      expect(rfc822.message!.body, 'Expected child of the message/rfc822 to be text/plain').toBeInstanceOf(TextPart);
      const body = rfc822.message!.body as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the rfc822 message body.' + environmentNewLine);

      assertSerialization(entity, 'dos', text);
    }
  });

  test('TestMessageRfc822WithContentTransferEncoding', () => {
    // Note: the Content-Transfer-Encoding header value is a single space (C# source has a trailing space).
    let text = `Content-Type: message/rfc822
Content-Transfer-Encoding:${' '}

From: mimekit@example.com
To: mimekit@example.com
Subject: embedded message
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

This is the rfc822 message body.
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const entity = parseEntityOk(parser);

      expect(entity, 'Expected message/rfc822').toBeInstanceOf(MessagePart);
      const rfc822 = entity as MessagePart;

      expect(rfc822.message!.body, 'Expected child of the message/rfc822 to be text/plain').toBeInstanceOf(TextPart);
      const body = rfc822.message!.body as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the rfc822 message body.' + environmentNewLine);

      assertSerialization(entity, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const entity = parseEntityOk(parser);

      expect(entity, 'Expected message/rfc822').toBeInstanceOf(MessagePart);
      const rfc822 = entity as MessagePart;

      expect(rfc822.message!.body, 'Expected child of the message/rfc822 to be text/plain').toBeInstanceOf(TextPart);
      const body = rfc822.message!.body as TextPart;

      expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
      expect(body.contentType.charset).toBe('utf-8');
      expect(body.text).toBe('This is the rfc822 message body.' + environmentNewLine);

      assertSerialization(entity, 'dos', text);
    }
  });

  test('TestMessageRfc822WithContentTransferEncodingBase64', () => {
    let text = `Content-Type: message/rfc822
Content-Transfer-Encoding: base64

RnJvbTogbWltZWtpdEBleGFtcGxlLmNvbQpUbzogbWltZWtpdEBleGFtcGxlLmNvbQpTdWJqZWN0
OiBlbWJlZGRlZCBtZXNzYWdlCkRhdGU6IFR1ZSwgMTIgTm92IDIwMTMgMDk6MTI6NDIgLTA1MDAK
TUlNRS1WZXJzaW9uOiAxLjAKQ29udGVudC1UeXBlOiB0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04
CgpUaGlzIGlzIHRoZSByZmM4MjIgbWVzc2FnZSBib2R5Lgo=
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const entity = parseEntityOk(parser);

      expect(entity, 'Expected message/rfc822 as a MimePart').toBeInstanceOf(MimePart);
      const part = entity as MimePart;

      {
        const content = part.content!.open();
        const contentParser = new MimeParser(content, 'entity');
        const message = parseMessageOk(contentParser);

        expect(message.body, 'Expected child of the message/rfc822 to be text/plain').toBeInstanceOf(TextPart);
        const body = message.body as TextPart;

        expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
        expect(body.contentType.charset).toBe('utf-8');
        expect(body.text).toBe('This is the rfc822 message body.' + environmentNewLine);
      }

      assertSerialization(entity, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const entity = parseEntityOk(parser);

      expect(entity, 'Expected message/rfc822 as a MimePart').toBeInstanceOf(MimePart);
      const part = entity as MimePart;

      {
        const content = part.content!.open();
        const contentParser = new MimeParser(content, 'entity');
        const message = parseMessageOk(contentParser);

        expect(message.body, 'Expected child of the message/rfc822 to be text/plain').toBeInstanceOf(TextPart);
        const body = message.body as TextPart;

        expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
        expect(body.contentType.charset).toBe('utf-8');
        expect(body.text).toBe('This is the rfc822 message body.' + environmentNewLine);
      }

      assertSerialization(entity, 'dos', text);
    }
  });

  test('TestMimePartBasic', () => {
    let text = `Content-Type: application/octet-stream; name=rawData.dat
Content-Disposition: inline; filename=rawData.dat
Content-Transfer-Encoding: quoted-printable

This is some raw data.
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const entity = parseEntityOk(parser);

      expect(entity, 'Expected MimePart').toBeInstanceOf(MimePart);
      expect(entity.contentType.mimeType, 'MimeType').toBe('application/octet-stream');
      expect(entity.contentType.name, 'Name').toBe('rawData.dat');
      const part = entity as MimePart;

      const plain = new TextPart('plain');
      plain.content = part.content;

      expect(plain.text).toBe('This is some raw data.' + environmentNewLine);

      assertSerialization(entity, 'unix', text);
    }

    text = dosify(text);
    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');
      const entity = parseEntityOk(parser);

      expect(entity, 'Expected MimePart').toBeInstanceOf(MimePart);
      expect(entity.contentType.mimeType, 'MimeType').toBe('application/octet-stream');
      expect(entity.contentType.name, 'Name').toBe('rawData.dat');
      const part = entity as MimePart;

      const plain = new TextPart('plain');
      plain.content = part.content;

      expect(plain.text).toBe('This is some raw data.' + environmentNewLine);

      assertSerialization(entity, 'dos', text);
    }
  });

  test('TestMimePartContentWithMixedLineEndings', () => {
    const text = 'From: mimekit@example.com\r\nTo: mimekit@example.com\r\nSubject: content with mixed line endings\r\nDate: Sat, Dec 21 2024 09:12:42 -0500\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nThis is a normal line of text.\r\nThis line ends with a bare LF.\nAnd this line ends with CRLF.\r\n';

    const stream = new MemoryStream(ascii(text));
    const parser = new MimeParser(stream, 'entity');
    const message = parseMessageOk(parser);

    expect(message.body, 'Expected body of the message to be text/plain').toBeInstanceOf(TextPart);
    const body = message.body as TextPart;

    expect(body.headers.getValue(HeaderId.ContentType)).toBe('text/plain; charset=utf-8');
    expect(body.contentType.charset).toBe('utf-8');
    // C#: "...".ReplaceLineEndings () — Environment.NewLine is '\n' here.
    expect(body.text).toBe('This is a normal line of text.\nThis line ends with a bare LF.\nAnd this line ends with CRLF.\n');
    expect(body.content!.newLineFormat).toBe('mixed');
  });

  test('TestGarbageBeforeMessageHeaders', () => {
    const text = `>F!&^#%&^
From: mimekit@example.com
To: mimekit@example.com
Subject: This message has garbage before the headers
Date: Tue, 12 Nov 2013 09:12:42 -0500
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

This is the message body.
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');

      expect(parser.parseMessage().ok).toBe(false);
    }

    {
      const stream = new MemoryStream(ascii(dosify(text)));
      const parser = new MimeParser(stream, 'entity');

      expect(parser.parseMessage().ok).toBe(false);
    }
  });

  test('TestGarbageBeforeEntityHeaders', () => {
    const text = `>F!&^#%&^
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

This is the message body.
`;

    {
      const stream = new MemoryStream(ascii(text));
      const parser = new MimeParser(stream, 'entity');

      expect(parser.parseEntity().ok).toBe(false);
    }

    {
      const stream = new MemoryStream(ascii(dosify(text)));
      const parser = new MimeParser(stream, 'entity');

      expect(parser.parseEntity().ok).toBe(false);
    }
  });

  test('TestSimpleMbox', () => {
    const stream = new MemoryStream(bytes(join(mboxDataDir, 'simple.mbox.txt')));
    assertSimpleMbox(stream);
  });

  test('TestSimpleMboxWithByteOrderMark', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const stream = new MemoryStream(concat(bom, bytes(join(mboxDataDir, 'simple.mbox.txt'))));

    assertSimpleMbox(stream);
  });

  test.each([
    80,
    4094, // tests the not-enough-data code-path in MimeReader.StepMboxMarker()
    4096,
    4097, // tests midline code-paths in MimeReader.StepMboxMarkerStart()
    8193, // tests the not-enough-data midline code-path in MimeReader.StepMboxMarkerStart()
  ])('TestSimpleMboxWithGarbageBeforeMboxMarker', (garbageLength) => {
    const garbage = new Uint8Array(garbageLength);

    for (let i = 0; i < garbageLength - 2; i++)
      garbage[i] = 0x58; // 'X'
    garbage[garbage.length - 2] = 0x0d; // '\r'
    garbage[garbage.length - 1] = 0x0a; // '\n'

    const stream = new MemoryStream(concat(garbage, bytes(join(mboxDataDir, 'simple.mbox.txt'))));

    assertSimpleMbox(stream);
  });

  test('TestEmptyMultipartAlternative', () => {
    const expected = `Content-Type: multipart/mixed
   Content-Type: multipart/alternative
   Content-Type: text/plain
`;

    const stream = new MemoryStream(bytes(join(messagesDataDir, 'empty-multipart.txt')));
    const parser = new MimeParser(stream, 'entity');
    const message = parseMessageOk(parser);

    expect(dumpMimeTree(message), 'Unexpected MIME tree structure.').toBe(expected);
  });

  test('TestContentLengthMbox', () => {
    const options = ParserOptions.default.clone();
    options.respectContentLength = true;

    testMbox(options, 'content-length');
  });

  test('TestIssue1189Mbox', () => {
    testMbox(null, 'issue1189');
  });

  test('TestJwzMbox', () => {
    testMbox(null, 'jwz');
  });

  test('TestJwzPersistentMbox', () => {
    const summary = readFileSync(join(mboxDataDir, 'jwz-summary.txt'), 'utf8').replace(/\r\n/g, '\n');
    let builder = '';

    const stream = new MemoryStream(bytes(join(mboxDataDir, 'jwz.mbox.txt')));
    const parser = new MimeParser(stream, 'mbox', true);

    expect(parser.mboxMarkerOffset, 'Initial MboxMarkerOffset').toBe(-1);
    expect(parser.mboxMarker, 'Initial MboxMarker').toBeNull();

    while (!parser.isEndOfStream) {
      const message = parseMessageOk(parser);

      builder += `${parser.mboxMarker}\n`;
      if (message.from.count > 0) builder += `From: ${message.from.toString()}\n`;
      if (message.to.count > 0) builder += `To: ${message.to.toString()}\n`;
      builder += `Subject: ${message.subject ?? ''}\n`;
      builder += `Date: ${formatDate(message.date)}\n`;
      builder += dumpMimeTree(message);
      builder += '\n';

      // Force the various MimePart objects to write their content streams.
      // The idea is that by forcing the MimeParts to seek in their content,
      // we will test to make sure that the parser correctly deals with it.
      message.writeTo(new MemoryStream()); // C#: Stream.Null
    }

    let actual = builder;

    // WORKAROUND (ported from C#, where Mono's iso-2022-jp decoder broke on
    // this input): a no-op when the decoder is correct.
    const iso2022jp = tryGetEncoding('iso-2022-jp')?.decode(new Uint8Array(Buffer.from('GyRAOjRGI0stGyhK', 'base64'))) ?? '佐藤豊';
    if (iso2022jp !== '佐藤豊') actual = actual.split(iso2022jp).join('佐藤豊');

    expect(actual, 'Summaries do not match for jwz.mbox').toBe(summary);
  });

  test('TestJapaneseMessage', () => {
    const subject = '日本語メールテスト (testing Japanese emails)';
    const body = "Let's see if both subject and body works fine...\n\n日本語が\n正常に\n送れているか\nテスト.\n";

    const stream = new MemoryStream(bytes(join(messagesDataDir, 'japanese.txt')));
    const parser = new MimeParser(stream, 'entity');
    const message = parseMessageOk(parser);

    expect(message.subject, 'Subject values do not match').toBe(subject);
    expect(message.textBody!.replace(/\r\n/g, '\n'), 'Message text does not match.').toBe(body);
  });

  test('TestUnmungedFromLines', () => {
    let count = 0;

    const stream = new MemoryStream(bytes(join(mboxDataDir, 'unmunged.mbox.txt')));
    const parser = new MimeParser(stream, 'mbox');

    while (!parser.isEndOfStream) {
      parseMessageOk(parser);
      const marker = parser.mboxMarker!;

      if (count % 2 === 0) {
        expect(marker.trimEnd(), `Message #${count}`).toBe('From -');
      } else {
        expect(marker.trimEnd(), `Message #${count}`).toBe('From Russia with love');
      }

      count++;
    }

    expect(count, 'Expected to find 4 messages.').toBe(4);
  });

  test('TestMultipartEpilogueWithText', () => {
    const epilogue = 'Peter Urka <pcu@umich.edu>\nDept. of Chemistry, Univ. of Michigan\nNewt-thought is right-thought.  Go Newt!\n\n';

    const stream = new MemoryStream(bytes(join(messagesDataDir, 'epilogue.txt')));
    const parser = new MimeParser(stream, 'entity');
    const message = parseMessageOk(parser);
    const multipart = message.body as Multipart;

    expect(multipart.epilogue!.replace(/\r\n/g, '\n'), 'The epilogue does not match').toBe(epilogue);

    expect(
      multipart.rawEpilogue![0] === 0x0d || multipart.rawEpilogue![0] === 0x0a,
      'The RawEpilogue does not start with a new-line.',
    ).toBe(true);
  });

  test('TestMissingSubtype', () => {
    const stream = new MemoryStream(bytes(join(messagesDataDir, 'missing-subtype.txt')));
    const parser = new MimeParser(stream, 'entity');
    const message = parseMessageOk(parser);
    const type = message.body!.contentType;

    expect(type.mediaType, 'The media type is not the default.').toBe('application');
    expect(type.mediaSubtype, 'The media subtype is not the default.').toBe('octet-stream');
    expect(type.name, 'The parameters do not seem to have been parsed.').toBe('document.xml.gz');
  });

  test('TestMissingMessageBody', () => {
    const text =
      'Date: Sat, 19 Apr 2014 13:13:23 -0700\r\n' +
      'From: Jeffrey Stedfast <notifications@github.com>\r\n' +
      'Subject: Re: [MimeKit] Allow parsing of message with 0 byte body. (#51)\r\n';

    const stream = new MemoryStream(ascii(text));
    const parser = new MimeParser(stream, 'entity');
    const result = parser.parseMessage();

    expect(result.ok, 'A message with 0 bytes of content should not fail to parse.').toBe(true);
  });

  test('TestDeeplyNestedMessageRfc822Parts', () => {
    const maxDepth = 64;

    const messageData = generateDeeplyNestedRfc822Message(maxDepth);

    {
      const stream = new MemoryStream(messageData);
      const options = ParserOptions.default.clone();
      options.maxMimeDepth = maxDepth;

      const parser = new MimeParser(options, stream, 'entity');
      const message = parseMessageOk(parser);

      let body: string | null = null;
      let depth = -1;

      for (const item of mimeIterate(message)) {
        if (item.entity instanceof TextPart) {
          depth = item.depth;
          body = item.entity.text;
        }
      }

      expect(depth, 'The maximum depth did not match.').toBe(maxDepth);
      expect(body, 'Did not find the message body.').not.toBeNull();
      expect(body, 'Message body did not match.').toBe('This is the innermost part of a deeply nested rfc822 message.' + environmentNewLine);
    }

    {
      const stream = new MemoryStream(messageData);
      const options = ParserOptions.default.clone();
      options.maxMimeDepth = maxDepth - 1;

      const parser = new MimeParser(options, stream, 'entity');
      const message = parseMessageOk(parser);

      let body: MimePart | null = null;
      let depth = -1;

      for (const item of mimeIterate(message)) {
        if (item.entity instanceof MimePart) {
          depth = item.depth;
          body = item.entity;
        }
      }

      expect(depth, 'The maximum depth did not match.').toBe(maxDepth - 1);
      expect(body, 'Did not find the message body.').not.toBeNull();
      expect(body!.contentType.mimeType, 'Message body did not match.').toBe('message/rfc822');
    }
  });

  test('TestDeeplyNestedMultiparts', () => {
    const maxDepth = 64;

    const messageData = generateDeeplyNestedMultipartMessage(maxDepth);

    {
      const stream = new MemoryStream(messageData);
      const options = ParserOptions.default.clone();
      options.maxMimeDepth = maxDepth;

      const parser = new MimeParser(options, stream, 'entity');
      const message = parseMessageOk(parser);

      let body: string | null = null;
      let depth = -1;

      for (const item of mimeIterate(message)) {
        if (item.entity instanceof TextPart) {
          depth = item.depth;
          body = item.entity.text;
        }
      }

      expect(depth, 'The maximum depth did not match.').toBe(maxDepth);
      expect(body, 'Did not find the message body.').not.toBeNull();
      expect(body, 'Message body did not match.').toBe('This is the innermost part of a deeply nested multipart message.' + environmentNewLine);
    }

    {
      const stream = new MemoryStream(messageData);
      const options = ParserOptions.default.clone();
      options.maxMimeDepth = maxDepth - 1;

      const parser = new MimeParser(options, stream, 'entity');
      const message = parseMessageOk(parser);

      let body: MimePart | null = null;
      let depth = -1;

      for (const item of mimeIterate(message)) {
        if (item.entity instanceof MimePart) {
          depth = item.depth;
          body = item.entity;
        }
      }

      expect(depth, 'The maximum depth did not match.').toBe(maxDepth - 1);
      expect(body, 'Did not find the message body.').not.toBeNull();
      expect(body!.contentType.mimeType, 'Message body did not match.').toBe('multipart/mixed');
    }
  });

  test('TestIssue358', () => {
    // Note: This particular message has a badly folded header value for "x-microsoft-exchange-diagnostics:"
    // which was causing MimeParser.StepHeaders[Async]() to abort because ReadAhead() already had more than
    // ReadAheadSize bytes buffered, so it assumed it had reached EOF when in fact it had not.
    const stream = new MemoryStream(bytes(join(messagesDataDir, 'issue358.txt')));
    const filtered = new FilteredStream(stream);
    filtered.add(new Unix2DosFilter());

    const parser = new MimeParser(filtered, 'entity');
    const message = parseMessageOk(parser);

    // make sure that the top-level MIME part is a multipart/alternative
    expect(message.body).toBeInstanceOf(MultipartAlternative);
  });

  test('TestLineCountSingleLine', () => {
    const text =
      'From: mimekit@example.org\n' +
      'To: mimekit@example.org\n' +
      'Subject: This is a message with a single line of text\n' +
      'Message-Id: <123@example.org>\n' +
      'MIME-Version: 1.0\n' +
      'Content-Type: text/plain; charset=us-ascii\n' +
      '\n' +
      'This is a single line of text';

    const stream = new MemoryStream(ascii(text));
    const parser = new CustomMimeParser(stream, 'entity');
    parseMessageOk(parser);

    const lines = parser.offsets[0]!.body!.lines;

    expect(lines, 'Line count').toBe(1);
  });

  test('TestLineCountSingleLineCRLF', () => {
    const text =
      'From: mimekit@example.org\n' +
      'To: mimekit@example.org\n' +
      'Subject: This is a message with a single line of text\n' +
      'Message-Id: <123@example.org>\n' +
      'MIME-Version: 1.0\n' +
      'Content-Type: text/plain; charset=us-ascii\n' +
      '\n' +
      'This is a single line of text\n';

    const stream = new MemoryStream(ascii(text));
    const parser = new CustomMimeParser(stream, 'entity');
    parseMessageOk(parser);

    const lines = parser.offsets[0]!.body!.lines;

    expect(lines, 'Line count').toBe(1);
  });

  test('TestLineCountSingleLineInMultipart', () => {
    const text =
      'From: mimekit@example.org\n' +
      'To: mimekit@example.org\n' +
      'Subject: This is a message with a single line of text\n' +
      'Message-Id: <123@example.org>\n' +
      'MIME-Version: 1.0\n' +
      'Content-Type: multipart/mixed; boundary="boundary-marker"\n' +
      '\n' +
      '--boundary-marker\n' +
      'Content-Type: text/plain; charset=us-ascii\n' +
      '\n' +
      'This is a single line of text\n' +
      '--boundary-marker\n' +
      'Content-Type: application/octet-stream; name="attachment.dat"\n' +
      'Content-Disposition: attachment; filename="attachment.dat"\n' +
      '\n' +
      'ABC\n' +
      '--boundary-marker--\n';

    const stream = new MemoryStream(ascii(text));
    const parser = new CustomMimeParser(stream, 'entity');
    parseMessageOk(parser);

    const lines = parser.offsets[0]!.body!.children![0]!.lines;

    expect(lines, 'Line count').toBe(1);
  });

  test('TestLineCountOneLineOfTextFollowedByBlankLineInMultipart', () => {
    const text =
      'From: mimekit@example.org\n' +
      'To: mimekit@example.org\n' +
      'Subject: This is a message with a single line of text\n' +
      'Message-Id: <123@example.org>\n' +
      'MIME-Version: 1.0\n' +
      'Content-Type: multipart/mixed; boundary="boundary-marker"\n' +
      '\n' +
      '--boundary-marker\n' +
      'Content-Type: text/plain; charset=us-ascii\n' +
      '\n' +
      'This is a single line of text followed by a blank line\n' +
      '\n' +
      '--boundary-marker\n' +
      'Content-Type: application/octet-stream; name="attachment.dat"\n' +
      'Content-Disposition: attachment; filename="attachment.dat"\n' +
      '\n' +
      'ABC\n' +
      '--boundary-marker--\n';

    const stream = new MemoryStream(ascii(text));
    const parser = new CustomMimeParser(stream, 'entity');
    parseMessageOk(parser);

    const lines = parser.offsets[0]!.body!.children![0]!.lines;

    expect(lines, 'Line count').toBe(1);
  });

  test('TestLineCountNonTerminatedSingleHeader', () => {
    const text = 'From: mimekit@example.org';

    const stream = new MemoryStream(ascii(text));
    const parser = new CustomMimeParser(stream, 'entity');
    parseMessageOk(parser);

    const lines = parser.offsets[0]!.body!.lines;

    expect(lines, 'Line count').toBe(0);
  });

  test('TestLineCountProperlyTerminatedSingleHeader', () => {
    const text = 'From: mimekit@example.org\r\n';

    const stream = new MemoryStream(ascii(text));
    const parser = new CustomMimeParser(stream, 'entity');
    parseMessageOk(parser);

    const lines = parser.offsets[0]!.body!.lines;

    expect(lines, 'Line count').toBe(0);
  });

  test('TestIssue991', () => {
    const { memory, expectedOffsets } = createIssue991Mbox();
    const parser = new MimeParser(memory, 'mbox');
    let i = 0;

    while (!parser.isEndOfStream) {
      const message = parseMessageOk(parser);

      expect(parser.position, 'The parser did not stop at the end of the first message.').toBe(expectedOffsets[i]);
      expect(message.messageId).toBe(`1234567890.${i}@example.org`);
      i++;
    }
  });

  test('TestMboxWithLinesExceedingMaxSmtpLineLength', () => {
    const { memory, expectedOffsets } = createMboxWithLinesExceedingMaxSmtpLineLength();
    const parser = new MimeParser(memory, 'mbox');
    let i = 0;

    while (!parser.isEndOfStream) {
      const message = parseMessageOk(parser);

      expect(parser.position, 'The parser did not stop at the end of the first message.').toBe(expectedOffsets[i]);
      expect(message.messageId).toBe(`1234567890.${i}@example.org`);
      i++;
    }
  });
});
