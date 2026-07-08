/**
 * Differential gate: TS parse trees vs the C# oracle structure dumps.
 *
 * For every corpus file under messages/ (entity) and mbox/ (mbox), the C#
 * oracle emitted a deterministic JSON tree (headers + body tree with
 * content-type/disposition/encoding/decoded+raw sha256/preamble/epilogue/
 * children/message — see oracle/Program.cs DumpMessage/DumpEntity). We parse
 * the same bytes with the TS MimeParser and rebuild the identical structure,
 * then assert deep equality. Divergences must be investigated, never ratcheted
 * here (the parser is expected to be byte/structure-identical to MimeKit).
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MimeParser, type MimeFormat } from '../../src/index.js';
import { MemoryStream } from '../../src/io/stream.js';
import { MimeMessage } from '../../src/mime-message.js';
import { MimeEntity } from '../../src/mime-entity.js';
import { MimePart } from '../../src/mime-part.js';
import { MessagePart } from '../../src/message-part.js';
import { Multipart } from '../../src/multipart.js';
import { corpusFile } from './helpers.js';

const treeDir = join(__dirname, '..', '..', 'gates', 'out', 'oracle', 'tree');

// TS ContentEncoding -> C# ContentEncoding.ToString().
const ENCODING_NAME: Record<string, string> = {
  default: 'Default',
  '7bit': 'SevenBit',
  '8bit': 'EightBit',
  binary: 'Binary',
  base64: 'Base64',
  'quoted-printable': 'QuotedPrintable',
  uuencode: 'UUEncode',
};

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function dumpHeaders(list: Iterable<{ field: string; value: string }>): unknown[] {
  return [...list].map((h) => ({ field: h.field, value: h.value }));
}

function dumpContentType(entity: MimeEntity): unknown {
  return {
    mimeType: entity.contentType.mimeType,
    parameters: [...entity.contentType.parameters].map((p) => ({ name: p.name, value: p.value })),
  };
}

function dumpDisposition(entity: MimeEntity): unknown {
  const d = entity.contentDisposition;
  if (d == null) return null;
  return {
    value: d.disposition,
    parameters: [...d.parameters].map((p) => ({ name: p.name, value: p.value })),
  };
}

function dumpMessage(message: MimeMessage): unknown {
  return {
    headers: dumpHeaders(message.headers),
    body: message.body == null ? null : dumpEntity(message.body),
  };
}

function dumpEntity(entity: MimeEntity): unknown {
  const headers = dumpHeaders(entity.headers);
  const contentType = dumpContentType(entity);
  const disposition = dumpDisposition(entity);
  const type = entity.constructor.name;

  // C# switch order: MessagePart, then Multipart, then MimePart, then default.
  if (entity instanceof MessagePart) {
    return {
      type,
      contentType,
      disposition,
      headers,
      message: entity.message == null ? null : dumpMessage(entity.message),
    };
  }

  if (entity instanceof Multipart) {
    return {
      type,
      contentType,
      disposition,
      headers,
      preamble: entity.preamble,
      epilogue: entity.epilogue,
      children: [...entity].map(dumpEntity),
    };
  }

  if (entity instanceof MimePart) {
    let decodedSha256: string | null = null;
    let decodedLength = -1;
    let rawSha256: string | null = null;

    if (entity.content != null) {
      const decoded = new MemoryStream();
      entity.content.decodeTo(decoded);
      const decodedBytes = decoded.toArray();
      decodedLength = decodedBytes.length;
      decodedSha256 = sha256Hex(decodedBytes);

      const raw = new MemoryStream();
      const open = entity.content.open();
      open.copyTo(raw);
      rawSha256 = sha256Hex(raw.toArray());
    }

    return {
      type,
      contentType,
      disposition,
      headers,
      encoding: ENCODING_NAME[entity.contentTransferEncoding] ?? entity.contentTransferEncoding,
      decodedSha256,
      decodedLength,
      rawSha256,
    };
  }

  return { type, contentType, disposition, headers };
}

function parseAll(bytes: Uint8Array, format: MimeFormat): unknown[] {
  const parser = new MimeParser(new MemoryStream(bytes), format);
  const messages: unknown[] = [];
  while (!parser.isEndOfStream) {
    const result = parser.parseMessage();
    if (!result.ok) throw new Error(`parse error: [${result.error.kind}] ${result.error.message}`);
    messages.push(dumpMessage(result.value));
  }
  return messages;
}

interface OracleDoc {
  file: string;
  format: MimeFormat;
  messages: unknown[];
}

function gateGroup(subdir: string, format: MimeFormat): void {
  const dir = join(treeDir, subdir);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.parse.json'))
    .sort();

  describe(`tree gate: ${subdir}/ (${format})`, () => {
    test.each(files)('%s', (jsonFile) => {
      const oracle = JSON.parse(readFileSync(join(dir, jsonFile), 'utf8')) as OracleDoc;
      const corpusRel = `${subdir}/${jsonFile.replace(/\.parse\.json$/, '')}`;
      const bytes = corpusFile(corpusRel);
      const actual = parseAll(bytes, format);
      expect(actual).toEqual(oracle.messages);
    });
  });
}

gateGroup('messages', 'entity');
gateGroup('partial', 'entity');
gateGroup('mbox', 'mbox');
