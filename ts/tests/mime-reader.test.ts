/**
 * Port of UnitTests/MimeReaderTests.cs (sync paths only; async variants omitted
 * per the port plan). The CustomMimeReader offset-collecting subclass and the
 * MimeOffsets/AssertMimeOffsets comparison are ported 1:1.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { ContentType, MemoryStream, MimeReader, ParserOptions } from '../src/index.js';
import type { MimeFormat } from '../src/index.js';

const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mboxDataDir = resolve(tsRoot, '..', 'UnitTests', 'TestData', 'mbox');

type NewLineFormat = 'unix' | 'dos';

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

enum MimeType {
  Message,
  MessagePart,
  Multipart,
  MimePart,
}

interface MimeItem {
  offsets: MimeOffsets;
  type: MimeType;
}

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

class CustomMimeReader extends MimeReader {
  readonly offsets: MimeOffsets[] = [];
  private readonly stack: MimeItem[] = [];
  private mboxMarkerBeginOffset = -1;

  protected override onMboxMarkerRead(marker: Uint8Array, startIndex: number, count: number, beginOffset: number, lineNumber: number): void {
    this.mboxMarkerBeginOffset = beginOffset;
    super.onMboxMarkerRead(marker, startIndex, count, beginOffset, lineNumber);
  }

  protected override onMimeMessageBegin(beginOffset: number, beginLineNumber: number): void {
    const offsets: MimeOffsets = { beginOffset, lineNumber: beginLineNumber };

    if (this.stack.length > 0) {
      const parent = this.stack[this.stack.length - 1]!;
      expect(parent.type).toBe(MimeType.MessagePart);
      parent.offsets.message = offsets;
    } else {
      offsets.mboxMarkerOffset = this.mboxMarkerBeginOffset;
      this.offsets.push(offsets);
    }

    this.stack.push({ type: MimeType.Message, offsets });
    super.onMimeMessageBegin(beginOffset, beginLineNumber);
  }

  protected override onMimeMessageEnd(beginOffset: number, beginLineNumber: number, headersEndOffset: number, endOffset: number, lines: number): void {
    const current = this.stack[this.stack.length - 1]!;

    expect(current.type).toBe(MimeType.Message);

    current.offsets.octets = endOffset - headersEndOffset;
    current.offsets.headersEndOffset = headersEndOffset;
    current.offsets.endOffset = endOffset;

    this.stack.pop();
    super.onMimeMessageEnd(beginOffset, beginLineNumber, headersEndOffset, endOffset, lines);
  }

  private push(type: MimeType, contentType: ContentType, beginOffset: number, beginLineNumber: number): void {
    const offsets: MimeOffsets = { mimeType: contentType.mimeType, beginOffset, lineNumber: beginLineNumber };

    if (this.stack.length > 0) {
      const parent = this.stack[this.stack.length - 1]!;

      switch (parent.type) {
        case MimeType.Message:
          parent.offsets.body = offsets;
          break;
        case MimeType.Multipart:
          parent.offsets.children ??= [];
          parent.offsets.children.push(offsets);
          break;
        default:
          throw new Error('unexpected parent type');
      }
    } else {
      this.offsets.push(offsets);
    }

    this.stack.push({ type, offsets });
  }

  private pop(type: MimeType, _contentType: ContentType, _beginOffset: number, _beginLineNumber: number, headersEndOffset: number, endOffset: number, lines: number): void {
    const current = this.stack[this.stack.length - 1]!;

    expect(current.type).toBe(type);

    current.offsets.octets = endOffset - headersEndOffset;
    current.offsets.headersEndOffset = headersEndOffset;
    current.offsets.endOffset = endOffset;
    current.offsets.lines = lines;

    this.stack.pop();
  }

  protected override onMessagePartBegin(contentType: ContentType, beginOffset: number, beginLineNumber: number): void {
    this.push(MimeType.MessagePart, contentType, beginOffset, beginLineNumber);
    super.onMessagePartBegin(contentType, beginOffset, beginLineNumber);
  }

  protected override onMessagePartEnd(contentType: ContentType, beginOffset: number, beginLineNumber: number, headersEndOffset: number, endOffset: number, lines: number): void {
    this.pop(MimeType.MessagePart, contentType, beginOffset, beginLineNumber, headersEndOffset, endOffset, lines);
    super.onMessagePartEnd(contentType, beginOffset, beginLineNumber, headersEndOffset, endOffset, lines);
  }

  protected override onMimePartBegin(contentType: ContentType, beginOffset: number, beginLineNumber: number): void {
    this.push(MimeType.MimePart, contentType, beginOffset, beginLineNumber);
    super.onMimePartBegin(contentType, beginOffset, beginLineNumber);
  }

  protected override onMimePartEnd(contentType: ContentType, beginOffset: number, beginLineNumber: number, headersEndOffset: number, endOffset: number, lines: number): void {
    this.pop(MimeType.MimePart, contentType, beginOffset, beginLineNumber, headersEndOffset, endOffset, lines);
    super.onMimePartEnd(contentType, beginOffset, beginLineNumber, headersEndOffset, endOffset, lines);
  }

  protected override onMultipartBegin(contentType: ContentType, beginOffset: number, beginLineNumber: number): void {
    this.push(MimeType.Multipart, contentType, beginOffset, beginLineNumber);
    super.onMultipartBegin(contentType, beginOffset, beginLineNumber);
  }

  protected override onMultipartEnd(contentType: ContentType, beginOffset: number, beginLineNumber: number, headersEndOffset: number, endOffset: number, lines: number): void {
    this.pop(MimeType.Multipart, contentType, beginOffset, beginLineNumber, headersEndOffset, endOffset, lines);
    super.onMultipartEnd(contentType, beginOffset, beginLineNumber, headersEndOffset, endOffset, lines);
  }
}

function bytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

function assertMboxResults(baseName: string, offsets: MimeOffsets[], newLineFormat: NewLineFormat): void {
  const path = join(mboxDataDir, baseName + '.' + newLineFormat + '-offsets.json');
  const expectedOffsets = JSON.parse(readFileSync(path, 'utf8')) as MimeOffsets[];

  expect(offsets.length, 'message count').toBe(expectedOffsets.length);

  for (let i = 0; i < expectedOffsets.length; i++) assertMimeOffsets(expectedOffsets[i]!, offsets[i]!, i, '');
}

function testMbox(options: ParserOptions | null, baseName: string): void {
  const mbox = join(mboxDataDir, baseName + '.mbox.txt');
  const stream = new MemoryStream(bytes(mbox));
  const reader = options != null ? new CustomMimeReader(options, stream, 'mbox') : new CustomMimeReader(stream, 'mbox');
  const newLineFormat = detectNewLineFormat(mbox);

  while (!reader.isEndOfStream) reader.readMessage();

  assertMboxResults(baseName, reader.offsets, newLineFormat);
}

describe('MimeReader', () => {
  test('TestArgumentExceptions', () => {
    const reader = new MimeReader(new MemoryStream());

    expect(() => new MimeReader(null as never)).toThrow(TypeError);
    expect(() => new MimeReader(null as never, 'entity' as MimeFormat)).toThrow(TypeError);
    expect(() => new MimeReader(ParserOptions.default, null as never)).toThrow(TypeError);
    expect(() => new MimeReader(ParserOptions.default, null as never, 'entity')).toThrow(TypeError);
    expect(() => {
      reader.Options = null as never;
    }).toThrow(TypeError);
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

    const stream = new MemoryStream(new TextEncoder().encode(text));
    const reader = new CustomMimeReader(stream, 'entity');
    reader.readMessage();

    expect(reader.offsets[0]!.body!.lines, 'Line count').toBe(1);
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

    const stream = new MemoryStream(new TextEncoder().encode(text));
    const reader = new CustomMimeReader(stream, 'entity');
    reader.readMessage();

    expect(reader.offsets[0]!.body!.lines, 'Line count').toBe(1);
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
      'Content-DIsposition: attachment; filename="attachment.dat"\n' +
      '\n' +
      'ABC\n' +
      '--boundary-marker--\n';

    const stream = new MemoryStream(new TextEncoder().encode(text));
    const reader = new CustomMimeReader(stream, 'entity');
    reader.readMessage();

    expect(reader.offsets[0]!.body!.children![0]!.lines, 'Line count').toBe(1);
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
      'Content-DIsposition: attachment; filename="attachment.dat"\n' +
      '\n' +
      'ABC\n' +
      '--boundary-marker--\n';

    const stream = new MemoryStream(new TextEncoder().encode(text));
    const reader = new CustomMimeReader(stream, 'entity');
    reader.readMessage();

    expect(reader.offsets[0]!.body!.children![0]!.lines, 'Line count').toBe(1);
  });

  test('TestLineCountNonTerminatedSingleHeader', () => {
    const text = 'From: mimekit@example.org';

    const stream = new MemoryStream(new TextEncoder().encode(text));
    const reader = new CustomMimeReader(stream, 'entity');
    reader.readMessage();

    expect(reader.offsets[0]!.body!.lines, 'Line count').toBe(0);
  });

  test('TestLineCountProperlyTerminatedSingleHeader', () => {
    const text = 'From: mimekit@example.org\r\n';

    const stream = new MemoryStream(new TextEncoder().encode(text));
    const reader = new CustomMimeReader(stream, 'entity');
    reader.readMessage();

    expect(reader.offsets[0]!.body!.lines, 'Line count').toBe(0);
  });
});
