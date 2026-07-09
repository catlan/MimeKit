import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  Dos2UnixFilter,
  FilteredStream,
  MemoryStream,
  MimeContent,
  MimeMessage,
  MimePart,
  Multipart,
  TextPart,
  TnefAttributeTag,
  TnefComplianceMode,
  TnefComplianceStatus,
  TnefPart,
  TnefReader,
} from '../../src/index.js';

const dataDir = join(process.cwd(), '..', 'UnitTests', 'TestData', 'tnef');
const cases: Array<[string, number]> = [
  ['attachments', TnefComplianceStatus.Compliant],
  ['body', TnefComplianceStatus.Compliant],
  ['christmas', TnefComplianceStatus.UnsupportedPropertyType],
  ['data-before-name', TnefComplianceStatus.Compliant],
  ['garbage-at-end', TnefComplianceStatus.InvalidAttributeLevel | TnefComplianceStatus.StreamTruncated],
  ['long-filename', TnefComplianceStatus.Compliant],
  ['MAPI_ATTACH_DATA_OBJ', TnefComplianceStatus.Compliant],
  ['MAPI_OBJECT', TnefComplianceStatus.Compliant],
  ['missing-filenames', TnefComplianceStatus.Compliant],
  ['multi-name-property', TnefComplianceStatus.Compliant],
  ['multi-value-attribute', TnefComplianceStatus.Compliant],
  ['one-file', TnefComplianceStatus.Compliant],
  ['panic', TnefComplianceStatus.InvalidAttribute | TnefComplianceStatus.InvalidAttributeLevel],
  ['rtf', TnefComplianceStatus.Compliant],
  ['triples', TnefComplianceStatus.Compliant],
  ['two-files', TnefComplianceStatus.Compliant],
  ['unicode-mapi-attr-name', TnefComplianceStatus.Compliant],
  ['unicode-mapi-attr', TnefComplianceStatus.Compliant],
  ['winmail', TnefComplianceStatus.Compliant],
];

function readAll(stream: { read(buffer: Uint8Array, offset: number, count: number): number }, text: boolean): Uint8Array {
  const memory = new MemoryStream();
  const filtered = new FilteredStream(memory);
  if (text) filtered.add(new Dos2UnixFilter(true));
  const buffer = new Uint8Array(4096);
  let n: number;
  while ((n = stream.read(buffer, 0, buffer.length)) > 0) filtered.write(buffer, 0, n);
  filtered.flush();
  return memory.toArray();
}

function expectedName(part: MimePart, untitled: { value: number }): { fileName: string; text: boolean } {
  let text = false;
  if (part instanceof TextPart && !part.fileName) {
    return { fileName: part.isHtml ? 'message.html' : part.isRichText ? 'message.rtf' : 'message.txt', text: true };
  }
  if (part.fileName === 'Untitled Attachment') return { fileName: `Untitled Attachment.${untitled.value++}`, text };
  const fileName = part.fileName ?? '';
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
  if (['.cfg', '.dat', '.htm', '.ini', '.src'].includes(ext) || fileName === 'AUTHORS' || fileName === 'README')
    text = true;
  return { fileName, text };
}

function walkTnef(path: string): TnefReader {
  const reader = new TnefReader(new MemoryStream(readFileSync(path)), 0, TnefComplianceMode.Loose);
  while (reader.readNextAttribute()) {
    if (reader.attributeLevel !== 1 && reader.attributeLevel !== 2)
      break;
    const prop = reader.tnefPropertyReader;
    switch (reader.attributeTag) {
    case TnefAttributeTag.MapiProperties:
    case TnefAttributeTag.Attachment:
    case TnefAttributeTag.RecipientTable:
        while (prop.readNextProperty()) {
          do {
            try {
              prop.readValue();
            } catch {
              break;
            }
          } while (prop.readNextValue());
        }
      break;
    default:
      break;
    }
  }
  return reader;
}

function loadMessage(name: string): MimeMessage {
  const result = MimeMessage.load(readFileSync(join(dataDir, name)));
  if (!result.ok) throw result.error;
  return result.value;
}

function firstTnefPart(message: MimeMessage): TnefPart {
  for (const part of message.bodyParts) {
    if (part instanceof TnefPart) return part;
  }
  throw new Error('No TNEF part found');
}

describe('TNEF corpus', () => {
  test.each(cases)('%s extracts expected files', (name, expectedStatus) => {
    const reader = walkTnef(join(dataDir, `${name}.tnef`));
    expect(reader.complianceStatus, `${name}: compliance`).toBe(expectedStatus);

    const tnef = new TnefPart();
    tnef.content = new MimeContent(new MemoryStream(readFileSync(join(dataDir, `${name}.tnef`))));
    const attachments = Array.from(tnef.extractAttachments()).filter((part): part is MimePart => part instanceof MimePart);
    const expected = readFileSync(join(dataDir, `${name}.list`), 'utf8').trim().split(/\r?\n/).filter(Boolean);

    for (const listed of expected) {
      const found = attachments.some((part) => {
        if (part instanceof TextPart && !part.fileName) {
          const base = listed.replace(/\.[^.]+$/, '');
          const ext = listed.slice(base.length);
          const subtype = ext === '.html' ? 'html' : ext === '.rtf' ? 'rtf' : 'plain';
          return base === 'body' && part.contentType.isMimeType('text', subtype);
        }
        return part.fileName === listed;
      });
      expect(found, `${name}: missing ${listed}`).toBe(true);
    }

    const untitled = { value: 1 };
    for (const part of attachments) {
      if (!part.content) continue;
      const { fileName, text } = expectedName(part, untitled);
      const path = join(dataDir, name, fileName);
      if (!existsSync(path)) continue;
      const expectedData = readAll(new MemoryStream(readFileSync(path)), text);
      const actualData = readAll(part.content.open(), text);
      expect(actualData, `${name}: ${fileName}`).toEqual(expectedData);
    }
  });

  test('extracted binary attachment serializes base64 transfer encoding', () => {
    // extra (not in C#): review B1 regression
    const tnef = new TnefPart();
    tnef.content = new MimeContent(new MemoryStream(readFileSync(join(dataDir, 'attachments.tnef'))));
    const attachment = Array.from(tnef.extractAttachments()).find((part): part is MimePart =>
      part instanceof MimePart && !part.contentType.isMimeType('text', '*') && part.content !== null);
    expect(attachment).toBeDefined();
    const stream = new MemoryStream();
    attachment!.writeTo(stream);
    expect(new TextDecoder().decode(stream.toArray())).toContain('Content-Transfer-Encoding: base64');
  });

  test('TestExtractedCharset', () => {
    const expected = '<html>\n<head>\n<meta http-equiv="Content-Type" content="text/html; charset=koi8-r">\n<style type="text/css" style="display:none;"><!-- P {margin-top:0;margin-bottom:0;} --></style>\n</head>\n<body dir="ltr">\n<div id="divtagdefaultwrapper" style="font-size:12pt;color:#000000;font-family:Calibri,Helvetica,sans-serif;" dir="ltr">\n<p>шостий</p>\n<p><br>\n</p>\n<p>{EMAILSIGNATURE}</p>\n<p><br>\n</p>\n<div id="Signature"><br>\n<font color="#888888" face="Arial, Helvetica, Helvetica, Geneva, Sans-Serif" style="font-size: 10pt;"><br>\n<font color="#888888" face="Arial, Helvetica, Helvetica, Geneva, Sans-Serif" style="font-size: 12pt;"><b>RR Test 1</b></font>\n</font>\n<p><font color="#888888" face="Arial, Helvetica, Helvetica, Geneva, Sans-Serif" style="font-size: 10pt;">&nbsp;</font></p>\n</div>\n</div>\n</body>\n</html>\n';
    const message = loadMessage('ukr.eml');
    const extracted = firstTnefPart(message).convertToMessage();

    expect(extracted.body).toBeInstanceOf(TextPart);
    const text = extracted.body as TextPart;
    expect(text.isHtml).toBe(true);
    expect(text.contentType.charset).toBe('koi8-r');
    expect(text.text).toBe(expected);
  });

  test('TestRichTextEml', () => {
    const message = loadMessage('rich-text.eml');
    const extracted = firstTnefPart(message).convertToMessage();
    const mtime = new Date(Date.UTC(2018, 11, 15, 10, 17, 38));

    expect(extracted.subject).toBe('');
    expect(extracted.messageId).toBe('DM5PR21MB0828DA2B8C88048BC03EFFA6CFA20@DM5PR21MB0828.namprd21.prod.outlook.com');
    expect(extracted.body).toBeInstanceOf(Multipart);

    const multipart = extracted.body as Multipart;
    expect(multipart.count).toBe(6);
    expect(multipart.at(0)).toBeInstanceOf(TextPart);
    for (let i = 1; i < 6; i++) expect(multipart.at(i)).toBeInstanceOf(MimePart);

    const rtf = multipart.at(0) as TextPart;
    expect(rtf.contentType.mimeType).toBe('text/rtf');

    const kitten = multipart.at(1) as MimePart;
    expect(kitten.contentType.mimeType).toBe('application/octet-stream');
    expect(kitten.fileName).toBe('kitten-playing-with-a-christmas-tree.jpg');

    const task1 = multipart.at(2) as MimePart;
    expect(task1.contentType.mimeType).toBe('application/octet-stream');
    expect(task1.contentType.name).toBe('Build a train table');
    expect(task1.contentDisposition?.disposition).toBe('attachment');
    expect(task1.contentDisposition?.fileName).toBe('Untitled Attachment');
    expect(task1.contentDisposition?.modificationDate?.epochMillis).toBe(mtime.getTime());
    expect(task1.contentDisposition?.size).toBe(9217);

    const task2 = multipart.at(3) as MimePart;
    expect(task2.contentType.mimeType).toBe('application/ms-tnef');
    expect(task2.contentType.name).toBe('Build a train table');
    expect(task2.contentDisposition?.disposition).toBe('attachment');
    expect(task2.contentDisposition?.fileName).toBe('Untitled Attachment');
    expect(task2.contentDisposition?.modificationDate?.epochMillis).toBe(mtime.getTime());
    expect(task2.contentDisposition?.size).toBe(9217);

    const appointment1 = multipart.at(4) as MimePart;
    expect(appointment1.contentType.mimeType).toBe('application/octet-stream');
    expect(appointment1.contentType.name).toBe('Christmas Celebration!');
    expect(appointment1.contentDisposition?.disposition).toBe('attachment');
    expect(appointment1.contentDisposition?.fileName).toBe('Untitled Attachment');
    expect(appointment1.contentDisposition?.modificationDate?.epochMillis).toBe(mtime.getTime());
    expect(appointment1.contentDisposition?.size).toBe(387453);

    const appointment2 = multipart.at(5) as MimePart;
    expect(appointment2.contentType.mimeType).toBe('application/ms-tnef');
    expect(appointment2.contentType.name).toBe('Christmas Celebration!');
    expect(appointment2.contentDisposition?.disposition).toBe('attachment');
    expect(appointment2.contentDisposition?.fileName).toBe('Untitled Attachment');
    expect(appointment2.contentDisposition?.modificationDate?.epochMillis).toBe(mtime.getTime());
    expect(appointment2.contentDisposition?.size).toBe(387453);
  });
});
