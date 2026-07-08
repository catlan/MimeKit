import { describe, expect, test } from 'vitest';
import { ContentType, FormatOptions, Parameter, unwrap, utf8 } from '../src/index.js';
import { latin1 } from '../src/utils/charset-utils.js';

function parseOk(text: string): ContentType {
  return unwrap(ContentType.parse(text));
}

function expectContentType(actual: ContentType, expected: ContentType): void {
  expect(actual.mediaType).toBe(expected.mediaType);
  expect(actual.mediaSubtype).toBe(expected.mediaSubtype);
  expect(actual.parameters.count).toBe(expected.parameters.count);
  for (let i = 0; i < expected.parameters.count; i++) {
    const ep = expected.parameters.get(i) as Parameter;
    const ap = actual.parameters.get(i) as Parameter;
    expect(ap.name).toBe(ep.name);
    expect(ap.value).toBe(ep.value);
    expect(actual.parameters.get(ep.name)).toBe(expected.parameters.get(ep.name));
  }
}

describe('ContentType', () => {
  test('TestArgumentExceptions', () => {
    const type = new ContentType('text', 'plain');
    expect(() => { type.mediaType = null as unknown as string; }).toThrow(TypeError);
    expect(() => { type.mediaSubtype = null as unknown as string; }).toThrow(TypeError);
    expect(() => type.isMimeType(null as unknown as string, 'plain')).toThrow(TypeError);
    expect(() => type.isMimeType('text', null as unknown as string)).toThrow(TypeError);
  });

  test('TestClone', () => {
    const original = new ContentType('text', 'plain');
    original.charset = 'iso-8859-1';
    original.name = 'clone-me.txt';
    const clone = original.clone();
    expectContentType(clone, original);
  });

  test('TestChangedEvents', () => {
    const contentType = new ContentType('text', 'plain');
    let changed = 0;
    contentType.onChanged = () => { changed++; };
    contentType.name = 'filename.txt'; expect(changed).toBe(1); changed = 0;
    contentType.name = 'filename.txt'; expect(changed).toBe(0);
    contentType.name = 'filename.pdf'; expect(changed).toBe(1); changed = 0;
    contentType.name = null; expect(changed).toBe(1); changed = 0;
    contentType.boundary = '=-boundary-marker--'; expect(changed).toBe(1); changed = 0;
    contentType.boundary = '=-boundary-marker--'; expect(changed).toBe(0);
    contentType.boundary = '=-boundary-marker-123--'; expect(changed).toBe(1); changed = 0;
    contentType.boundary = null; expect(changed).toBe(1); changed = 0;
    contentType.charset = 'utf-8'; expect(changed).toBe(1); changed = 0;
    contentType.charset = 'utf-8'; expect(changed).toBe(0);
    contentType.charset = 'iso-8859-1'; expect(changed).toBe(1); changed = 0;
    contentType.charset = null; expect(changed).toBe(1); changed = 0;
    contentType.charsetEncoding = utf8; expect(changed).toBe(1); changed = 0;
    contentType.charsetEncoding = utf8; expect(changed).toBe(0);
    contentType.charsetEncoding = null; expect(changed).toBe(1); changed = 0;
    contentType.format = 'flowed'; expect(changed).toBe(1); changed = 0;
    contentType.format = 'flowed'; expect(changed).toBe(0);
    contentType.format = 'unknown'; expect(changed).toBe(1); changed = 0;
    contentType.format = null; expect(changed).toBe(1);
  });

  test('TestSimpleContentType', () => expectContentType(parseOk('text/plain'), new ContentType('text', 'plain')));
  test('TestSimpleContentTypeWithVendorExtension', () => expectContentType(parseOk('application/x-vnd.msdoc'), new ContentType('application', 'x-vnd.msdoc')));
  test('TestSimpleContentTypeWithParameter', () => {
    const expected = new ContentType('multipart', 'mixed'); expected.boundary = 'boundary-text';
    expectContentType(parseOk('multipart/mixed; boundary="boundary-text"'), expected);
  });
  test('TestMultipartParameterExampleFromRfc2231', () => {
    const type = parseOk('message/external-body; access-type=URL;\n      URL*0="ftp://";\n      URL*1="cs.utk.edu/pub/moore/bulk-mailer/bulk-mailer.tar"');
    expect(type.parameters.get('URL')).toBe('ftp://cs.utk.edu/pub/moore/bulk-mailer/bulk-mailer.tar');
  });
  test('TestContentTypeWithEmptyParameter', () => {
    expect(parseOk('multipart/mixed;;\n Boundary="x"').boundary).toBe('x');
  });
  test('TestContentTypeWithoutSemicolonBetweenParameters', () => {
    const type = parseOk('application/x-pkcs7-mime;\n name="smime.p7m"\n smime-type=enveloped-data');
    expect(type.name).toBe('smime.p7m');
    expect(type.parameters.get('smime-type')).toBe('enveloped-data');
  });
  test('TestContentTypeAndContentTrafserEncodingOnOneLine', () => {
    expect(ContentType.parse('text/plain; charset = "iso-8859-1" Content-Transfer-Encoding: 8bit').ok).toBe(false);
  });
  test('TestEncodedParameterExampleFromRfc2231', () => {
    expect(parseOk("application/x-stuff;\n title*=us-ascii'en-us'This%20is%20%2A%2A%2Afun%2A%2A%2A").parameters.get('title')).toBe('This is ***fun***');
  });
  test('TestMultipartEncodedParameterExampleFromRfc2231', () => {
    expect(parseOk("application/x-stuff;\n title*1*=us-ascii'en'This%20is%20even%20more%20;\n title*2*=%2A%2A%2Afun%2A%2A%2A%20;\n title*3=\"isn't it!\"").parameters.get('title')).toBe("This is even more ***fun*** isn't it!");
  });
  test('TestRfc2047EncodedParameter', () => {
    expect(parseOk('application/x-stuff;\n title="some chinese characters =?utf-8?q?=E4=B8=AD=E6=96=87?= and stuff"\n').parameters.get('title')).toBe('some chinese characters 中文 and stuff');
  });
  test('TestRfc2047EncodedParameterBig5', () => {
    expect(parseOk('application/x-stuff;\n title="some chinese characters =?big5?b?pKSk5Q==?= and stuff"\n').parameters.get('title')).toBe('some chinese characters 中文 and stuff');
  });

  test('TestBreakingOfLongParamValues', () => {
    const format = FormatOptions.default.clone(); format.newLineFormat = 'unix';
    const type = new ContentType('text', 'plain'); type.parameters.add('charset', 'iso-8859-1'); type.parameters.add('name', 'this is a really really long filename that should force MimeKit to break it apart - yay!.html');
    expect(type.encode(format, utf8)).toBe(' text/plain; charset=iso-8859-1;\n\tname*0="this is a really really long filename that should force MimeKit to b";\n\tname*1="reak it apart - yay!.html"\n');
  });
  test('TestBreakingOfLongParamValues2047', () => {
    const format = FormatOptions.default.clone(); format.parameterEncodingMethod = 'rfc2047'; format.newLineFormat = 'unix';
    const type = new ContentType('text', 'plain'); type.parameters.add('charset', 'iso-8859-1'); type.parameters.add('name', 'this is a really really long filename that should force MimeKit to break it apart - yay!.html');
    expect(type.encode(format, utf8)).toBe(' text/plain; charset=iso-8859-1; name="=?us-ascii?q?this_is_?=\n\t=?us-ascii?q?a_really_really_long_filename_that_should_force_MimeKit_to_?=\n\t=?us-ascii?q?break_it_apart_-_yay!=2Ehtml?="\n');
  });
  test('TestEncodingOfParamValues', () => {
    const format = FormatOptions.default.clone(); format.newLineFormat = 'unix';
    const type = new ContentType('text', 'plain'); type.parameters.add('charset', 'iso-8859-1'); type.parameters.add('name', 'Kristoffer Brånemyr');
    expect(type.encode(format, utf8)).toBe(" text/plain; charset=iso-8859-1;\n\tname*=iso-8859-1''Kristoffer%20Br%E5nemyr\n");
  });
  test('TestEncodingOfParamValues2047', () => {
    const format = FormatOptions.default.clone(); format.parameterEncodingMethod = 'rfc2047'; format.newLineFormat = 'unix';
    const type = new ContentType('text', 'plain'); type.parameters.add('charset', 'iso-8859-1'); type.parameters.add('name', 'Kristoffer Brånemyr');
    expect(type.encode(format, utf8)).toBe(' text/plain; charset=iso-8859-1;\n\tname="=?iso-8859-1?q?Kristoffer_Br=E5nemyr?="\n');
  });
  test('TestEncodingOfLongParamValues', () => {
    const format = FormatOptions.default.clone(); format.newLineFormat = 'unix';
    const type = new ContentType('text', 'plain'); type.parameters.add('charset', 'utf-8'); type.parameters.add('name', 'å'.repeat(40));
    expect(type.encode(format, utf8)).toBe(" text/plain; charset=utf-8;\n\tname*0*=iso-8859-1''%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5;\n\tname*1*=%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5%E5\n");
  });
  test('TestEncodingOfLongParamValues2047', () => {
    const format = FormatOptions.default.clone(); format.parameterEncodingMethod = 'rfc2047'; format.newLineFormat = 'unix';
    const type = new ContentType('text', 'plain'); type.parameters.add('charset', 'utf-8'); type.parameters.add('name', 'å'.repeat(40));
    expect(type.encode(format, utf8)).toBe(' text/plain; charset=utf-8; name="=?iso-8859-1?b?5eXl5eXl?=\n\t=?iso-8859-1?b?5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5Q==?="\n');
  });

  test('TestUnquotedParameter', () => expect(parseOk('application/octet-stream; name=Test;').name).toBe('Test'));
  test('TestUnquotedParameterWithSpaces', () => expect(parseOk('application/octet-stream; name=Test Name.pdf;').name).toBe('Test Name.pdf'));
  test('TestUnquotedBoundaryWithTrailingNewLineAndSpace', () => expect(parseOk('multipart/mixed;\n boundary=--boundary_0_8ab0e518-760f-4a94-acc0-66f7cdea5c9f\n ').boundary).toBe('--boundary_0_8ab0e518-760f-4a94-acc0-66f7cdea5c9f'));
  test('TestInternationalParameterValue', () => expect(parseOk(' text/plain; format=flowed; x-eai-please-do-not="abstürzen"').parameters.get('x-eai-please-do-not')).toBe('abstürzen'));
  test('TestMimeTypeWithoutSubtype', () => expect(ContentType.parse('application-x-gzip; name=document.xml.gz').ok).toBe(false));
  test('TestInvalidType', () => expect(ContentType.parse('åpplication/octet-stream').ok).toBe(false));
  test('TestInvalidSubtype', () => expect(ContentType.parse('application/åtom').ok).toBe(false));
  test('TestInvalidDataAfterMimeType', () => expect(ContentType.parse('application/octet-stream x').ok).toBe(false));
  test('TestEmptyParameterName', () => expect(ContentType.parse('text/plain; =').ok).toBe(false));
  test('TestIncompleteParameterName', () => expect(ContentType.parse('text/plain; name').ok).toBe(false));
  test('TestIncompleteParameterNameWithStar', () => expect(ContentType.parse('text/plain; name*').ok).toBe(false));
  test('TestIncompleteParameterNameWithPartId', () => expect(ContentType.parse('text/plain; name*0').ok).toBe(false));
  test('TestIncompleteParameterNameWithPartIdStar', () => expect(ContentType.parse('text/plain; name*0*').ok).toBe(false));
  test('TestInvalidParameterNameWithPartId', () => expect(ContentType.parse('text/plain; name*0*x').ok).toBe(false));
  test('TestInncompleteParameterNameWithPartIdStarEqual', () => expect(ContentType.parse('text/plain; name*0*=').ok).toBe(false));
  test('TestProperties', () => {
    const type = new ContentType('application', 'octet-stream');
    type.mediaType = 'text'; type.mediaSubtype = 'plain'; type.boundary = '--=Boundary=--'; type.format = 'flowed'; type.charset = 'iso-8859-1'; type.name = 'filename.txt';
    expect(type.mimeType).toBe('text/plain');
    type.boundary = null; type.format = null; type.charset = null; type.name = null;
    expect(type.name).toBeNull();
  });
  test('TestToString', () => {
    const type = new ContentType('text', 'plain'); type.format = 'flowed'; type.charset = 'iso-8859-1'; type.name = 'filename.txt';
    expect(type.toString()).toBe('Content-Type: text/plain; format="flowed"; charset="iso-8859-1"; name="filename.txt"');
  });
  test('TestToStringEncode', () => {
    const type = new ContentType('text', 'plain'); type.format = 'flowed'; type.charset = 'utf-8'; type.name = 'Это русское имя файла.txt';
    expect(type.toString(FormatOptions.default, utf8, true).replace(/\r\n/g, '\n')).toBe("Content-Type: text/plain; format=flowed; charset=utf-8;\n\tname*0*=utf-8''%D0%AD%D1%82%D0%BE%20%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%BE;\n\tname*1*=%D0%B5%20%D0%B8%D0%BC%D1%8F%20%D1%84%D0%B0%D0%B9%D0%BB%D0%B0.txt");
  });
  test('TestParseMultipartMultipartMixed', () => {
    const type = parseOk('multipart/multipart/mixed; boundary="boundary-marker"\r\n');
    expect(type.mediaSubtype).toBe('multipart/mixed');
    expect(type.boundary).toBe('boundary-marker');
  });
});
