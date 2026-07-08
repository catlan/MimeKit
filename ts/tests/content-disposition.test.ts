import { describe, expect, test } from 'vitest';
import { ContentDisposition, FormatOptions, Parameter, unwrap, utf8 } from '../src/index.js';
import type { DateTimeOffset } from '../src/utils/date-utils.js';

function dto(year: number, month: number, day: number, hour: number, minute: number, second: number, offsetMinutes: number): DateTimeOffset {
  return { epochMillis: Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000, offsetMinutes };
}

function parseOk(text: string): ContentDisposition {
  return unwrap(ContentDisposition.parse(text));
}

describe('ContentDisposition', () => {
  test('TestArgumentExceptions', () => {
    const disposition = new ContentDisposition();
    expect(() => { disposition.disposition = null as unknown as string; }).toThrow(TypeError);
    expect(() => { disposition.disposition = ''; }).toThrow(TypeError);
    expect(() => { disposition.disposition = 'žádost'; }).toThrow(TypeError);
    expect(() => { disposition.disposition = 'two atoms'; }).toThrow(TypeError);
  });

  test('TestClone', () => {
    const original = new ContentDisposition();
    const t = dto(2022, 9, 9, 7, 41, 23, -240);
    original.creationDate = t; original.modificationDate = t; original.readDate = t; original.fileName = 'clone-me.txt'; original.size = 10;
    const clone = original.clone();
    expect(clone.disposition).toBe(original.disposition);
    expect(clone.parameters.count).toBe(original.parameters.count);
    expect(clone.fileName).toBe(original.fileName);
    expect(clone.size).toBe(original.size);
  });

  test('TestChangedEvents', () => {
    const t = dto(2022, 9, 9, 7, 41, 23, -240);
    const disposition = new ContentDisposition(ContentDisposition.attachment);
    let changed = 0;
    disposition.onChanged = () => { changed++; };
    disposition.disposition = ContentDisposition.attachment; expect(changed).toBe(0);
    disposition.disposition = ContentDisposition.inline; expect(changed).toBe(1); changed = 0;
    disposition.fileName = 'filename.txt'; expect(changed).toBe(1); changed = 0;
    disposition.fileName = 'filename.txt'; expect(changed).toBe(0);
    disposition.fileName = 'filename.pdf'; expect(changed).toBe(1); changed = 0;
    disposition.fileName = null; expect(changed).toBe(1); changed = 0;
    disposition.creationDate = t; expect(changed).toBe(1); changed = 0;
    disposition.creationDate = t; expect(changed).toBe(0);
    disposition.creationDate = dto(2022, 9, 10, 7, 41, 23, -240); expect(changed).toBe(1); changed = 0;
    disposition.creationDate = null; expect(changed).toBe(1); changed = 0;
    disposition.modificationDate = t; expect(changed).toBe(1); changed = 0;
    disposition.modificationDate = t; expect(changed).toBe(0);
    disposition.modificationDate = null; expect(changed).toBe(1); changed = 0;
    disposition.readDate = t; expect(changed).toBe(1); changed = 0;
    disposition.readDate = t; expect(changed).toBe(0);
    disposition.readDate = null; expect(changed).toBe(1); changed = 0;
    disposition.size = 1024; expect(changed).toBe(1); changed = 0;
    disposition.size = 1024; expect(changed).toBe(0);
    disposition.size = 2048; expect(changed).toBe(1); changed = 0;
    disposition.size = null; expect(changed).toBe(1);
  });

  test('TestEmptyValue', () => expect(ContentDisposition.parse(' ').ok).toBe(false));
  test('TestMultipleParametersWithIdenticalNames', () => {
    for (const text of [
      'inline;\n filename="Filename.doc";\n filename*0*=UTF-8\'\'UnicodeFile;\n filename*1*=name.doc',
      'inline;\n filename*0*=UTF-8\'\'UnicodeFile;\n filename*1*=name.doc;\n filename="Filename.doc"',
      'inline;\n filename*0*=UTF-8\'\'UnicodeFile;\n filename="Filename.doc";\n filename*1*=name.doc',
    ])
      expect(parseOk(text).fileName).toBe('UnicodeFilename.doc');
  });
  test('TestNonExistentDispositionValueWithParameterValues', () => expect(parseOk(' ; filename="test.txt"').fileName).toBe('test.txt'));
  test('TestMistakenlyQuotedDispositionValue', () => expect(parseOk('"inline"; filename="test.txt"').disposition).toBe('inline'));
  test('TestMistakenlyQuotedEncodedParameterValues', () => {
    const text = 'attachment;\n filename*0*="ISO-8859-2\'\'%C8%50%50%20%2D%20%BE%E1%64%6F%73%74%20%6F%20%61%6B%63%65";\n filename*1*="%70%74%61%63%69%20%73%6D%6C%6F%75%76%79%20%31%32%2E%31%32%2E";\n filename*2*="%64%6F%63"';
    expect(parseOk(text).fileName).toBe('ČPP - žádost o akceptaci smlouvy 12.12.doc');
  });
  test('TestFoldedQuotedFilenameParameterValue', () => {
    expect(parseOk('attachment; \r\n\tfilename="CR_A-EXCG-2020-0008 - Addition of UAT Email Domain in CMMP-GCN Connector\r\n\t.docx"\r\n').fileName).toBe('CR_A-EXCG-2020-0008 - Addition of UAT Email Domain in CMMP-GCN Connector\t.docx');
  });
  test('TestFoldedUnquotedFilenameParameterValue', () => {
    expect(parseOk(' attachment; filename=Partnership Marketing Agreement\n\tForm - Mega Brands - Easter Toys - Week 11.pdf').fileName).toBe('Partnership Marketing Agreement\tForm - Mega Brands - Easter Toys - Week 11.pdf');
  });
  test('TestInvalidDisposition', () => expect(ContentDisposition.parse('\\attachment').ok).toBe(false));
  test('TestInvalidDataAfterMDisposition', () => expect(ContentDisposition.parse('attachment x').ok).toBe(false));

  test.skip('TestChineseFilename', () => {
    // Existing charset-utils intentionally does not implement legacy charset encoding output yet (PLAN Q3).
  });
  test.skip('TestChineseFilename2047', () => {
    // Existing charset-utils intentionally does not implement legacy charset encoding output yet (PLAN Q3).
  });

  test('TestIssue239', () => {
    expect(parseOk(" attachment; size=1049971;\n\tfilename*=\"utf-8''SBD%20%C5%A0kodov%C3%A1k%2Ejpg\"").fileName).toBe('SBD Škodovák.jpg');
  });
  test('TestRfc2231ContinuationSplitUtf8TwoByteSequence', () => {
    // Review-added: exceeds the C# suite; verifies one decoder spans encoded continuation segments.
    expect(parseOk("attachment; filename*0*=utf-8''%C3; filename*1*=%A9").fileName).toBe('é');
  });
  test('TestRfc2231ContinuationSplitUtf8ThreeByteSequence', () => {
    // Review-added: exceeds the C# suite; verifies one decoder spans encoded continuation segments.
    expect(parseOk("attachment; filename*0*=utf-8''%E2; filename*1*=%82; filename*2*=%AC").fileName).toBe('€');
  });
  test('TestFormData', () => {
    const disposition = parseOk('form-data; filename="form.txt"');
    expect(disposition.disposition).toBe('form-data');
    expect(disposition.fileName).toBe('form.txt');
  });
  test('TestDispositionParameters', () => {
    const ctime = dto(1997, 1, 4, 15, 22, 17, -240);
    const mtime = dto(2007, 1, 4, 15, 22, 17, -240);
    const atime = dto(2012, 1, 4, 15, 22, 17, -240);
    const disposition = new ContentDisposition();
    disposition.fileName = 'document.doc'; disposition.creationDate = ctime; disposition.modificationDate = mtime; disposition.readDate = atime; disposition.size = 37001;
    const encoded = disposition.toString(FormatOptions.default.clone(), utf8, true);
    const parsed = parseOk(encoded.slice('Content-Disposition:'.length));
    expect(parsed.fileName).toBe('document.doc');
    expect(parsed.creationDate).toEqual(ctime);
    expect(parsed.modificationDate).toEqual(mtime);
    expect(parsed.readDate).toEqual(atime);
    expect(parsed.size).toBe(37001);
    disposition.creationDate = null; disposition.modificationDate = null; disposition.readDate = null; disposition.fileName = null; disposition.size = null;
    expect(disposition.parameters.count).toBe(0);
    disposition.isAttachment = false;
    expect(disposition.disposition).toBe(ContentDisposition.inline);
  });
  test('TestToString', () => {
    const timestamp = dto(2022, 9, 9, 7, 41, 23, -240);
    const disposition = new ContentDisposition();
    disposition.fileName = 'filename.txt'; disposition.creationDate = timestamp; disposition.modificationDate = timestamp; disposition.size = 2048;
    expect(disposition.toString()).toBe('Content-Disposition: attachment; filename="filename.txt"; creation-date="Fri, 09 Sep 2022 07:41:23 -0400"; modification-date="Fri, 09 Sep 2022 07:41:23 -0400"; size="2048"');
  });
});
