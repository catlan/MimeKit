/**
 * Port of UnitTests/MultipartTests.cs — full 1:1 (11 C# test methods).
 *
 * Adaptations (noted inline): ArgumentNullException → TypeError via
 * `null as never`; WriteTo(string fileName) overloads are Node-only file
 * APIs not present in the isomorphic core; WriteToAsync overloads omitted
 * per plan (sync core); TestDispose constructs a real MimeMessage —
 * deferred(wave-3e). TestWriteToOrdering is extra (not in C#), kept for
 * write-path coverage until the wave-5 serializer gates land.
 */
import { describe, expect, test } from 'vitest';
import {
  FormatOptions,
  MemoryStream,
  MimeContent,
  MimeEntity,
  MimePart,
  Multipart,
  setBoundaryGenerator,
  TextPart,
} from '../src/index.js';

const decoder = new TextDecoder();

function streamText(stream: MemoryStream): string {
  return decoder.decode(stream.toArray());
}

describe('Multipart', () => {
  test('TestArgumentExceptions', () => {
    const multipart = new Multipart();

    expect(() => new Multipart(null as never)).toThrow(TypeError);
    expect(() => new Multipart('mixed', null as never)).toThrow(TypeError);
    expect(() => new Multipart('mixed', 5 as never)).toThrow(TypeError);

    expect(() => { multipart.boundary = null as never; }).toThrow(TypeError);

    expect(() => multipart.add(null as never)).toThrow(TypeError);
    expect(() => multipart.insert(-1, new TextPart('plain'))).toThrow(RangeError);
    expect(() => multipart.insert(0, null as never)).toThrow(TypeError);
    expect(() => multipart.remove(null as never)).toThrow(TypeError);
    expect(() => multipart.removeAt(-1)).toThrow(RangeError);

    expect(() => multipart.contains(null as never)).toThrow(TypeError);
    expect(() => multipart.indexOf(null as never)).toThrow(TypeError);

    expect(() => multipart.set(0, new TextPart('plain'))).toThrow(RangeError);
    expect(() => multipart.set(0, null as never)).toThrow(TypeError);

    expect(() => multipart.accept(null as never)).toThrow(TypeError);

    expect(() => multipart.copyTo([], -1)).toThrow(RangeError);
    expect(() => multipart.copyTo(null as never, 0)).toThrow(TypeError);

    expect(() => multipart.prepare('7bit', 1)).toThrow(RangeError);

    // C# WriteTo(Stream)/WriteTo(FormatOptions, Stream) null variants.
    // WriteTo(string fileName) overloads: Node-only, not in isomorphic core.
    // WriteToAsync variants: omitted per plan (sync core).
    expect(() => multipart.writeTo(null as never)).toThrow(TypeError);
    expect(() => multipart.writeTo(FormatOptions.default, null as never)).toThrow(TypeError);
    expect(() => multipart.writeTo(null as never, new MemoryStream())).toThrow(TypeError);
    expect(() => multipart.writeTo(FormatOptions.default, null as never, false)).toThrow(TypeError);
  });

  test('TestBasicFunctionality', () => {
    const multipart = new Multipart();

    expect(multipart.boundary, 'Boundary != null').not.toBeNull();
    expect(multipart.boundary, 'Boundary').not.toBe('');
    expect(multipart.isReadOnly, 'IsReadOnly').toBe(false);

    multipart.boundary = '__Next_Part_123';

    expect(multipart.boundary).toBe('__Next_Part_123');

    const generic = new MimePart('application', 'octet-stream');
    generic.content = new MimeContent(new MemoryStream());
    generic.isAttachment = true;
    const plain = new TextPart('plain');
    plain.text = 'This is some plain text.';

    multipart.add(generic);
    multipart.insert(0, plain);

    expect(multipart.count, 'Count').toBe(2);

    expect(multipart.contains(generic), 'Contains').toBe(true);
    expect(multipart.indexOf(plain), 'IndexOf').toBe(0);

    const copied = new Array<MimeEntity>(2);
    multipart.copyTo(copied, 0);
    expect(copied.includes(generic), 'CopyTo Contains').toBe(true);
    expect(copied[0], 'CopyTo [0]').toBe(plain);
    expect(copied[1], 'CopyTo [1]').toBe(generic);

    expect(multipart.remove(generic), 'Remove').toBe(true);
    expect(multipart.remove(generic), 'Remove 2nd time').toBe(false);

    multipart.removeAt(0);

    expect(multipart.count, 'Count').toBe(0);

    multipart.add(generic);
    multipart.add(plain);

    expect(multipart.at(0)).toBe(generic);
    expect(multipart.at(1)).toBe(plain);

    multipart.set(0, plain);
    multipart.set(1, generic);

    expect(multipart.at(0)).toBe(plain);
    expect(multipart.at(1)).toBe(generic);

    multipart.clear();

    expect(multipart.count, 'Count').toBe(0);

    multipart.add(plain);
    multipart.add(generic);

    // Clear & dispose the MimeParts
    multipart.clear(true);

    expect(plain.isDisposed, 'Expected plain part to be disposed after Clear(true)').toBe(true);
    expect(generic.isDisposed, 'Expected generic part to be disposed after Clear(true)').toBe(true);
  });

  test.skip('TestDispose', () => {
    // deferred(wave-3e): constructs a real MimeMessage for the rfc822 part
    // (dispose cascade through MessagePart.Message.Body).
  });

  test('TestMultiLinePreamble', () => {
    const multipart = new Multipart('alternative');
    const multiline =
      'This is a part in a (multipart) message generated with the MimeKit library.\n\n' +
      "All of the parts of this message are identical, however they've been encoded " +
      'for transport using different methods.\n';
    let expected =
      'This is a part in a (multipart) message generated with the MimeKit library.\n\n' +
      "All of the parts of this message are identical, however they've been encoded\n" +
      'for transport using different methods.\n';

    if (FormatOptions.default.newLineFormat !== 'unix')
      expected = expected.replace(/\n/g, '\r\n');

    multipart.preamble = multiline;

    expect(multipart.preamble).toBe(expected);

    multipart.preamble = null;

    expect(multipart.preamble).toBeNull();
  });

  test('TestLongPreamble', () => {
    const multipart = new Multipart('alternative');
    const multiline =
      'This is a part in a (multipart) message generated with the MimeKit library. ' +
      "All of the parts of this message are identical, however they've been encoded " +
      'for transport using different methods.';
    let expected =
      'This is a part in a (multipart) message generated with the MimeKit library.\n' +
      "All of the parts of this message are identical, however they've been encoded\n" +
      'for transport using different methods.\n';

    if (FormatOptions.default.newLineFormat !== 'unix')
      expected = expected.replace(/\n/g, '\r\n');

    multipart.preamble = multiline;

    expect(multipart.preamble).toBe(expected);

    multipart.preamble = null;

    expect(multipart.preamble).toBeNull();
  });

  test('TestMultiLineEpilogue', () => {
    const multipart = new Multipart('alternative');
    const multiline =
      'This is a part in a (multipart) message generated with the MimeKit library.\n\n' +
      "All of the parts of this message are identical, however they've been encoded " +
      'for transport using different methods.\n';
    let expected =
      'This is a part in a (multipart) message generated with the MimeKit library.\n\n' +
      "All of the parts of this message are identical, however they've been encoded\n" +
      'for transport using different methods.\n';

    if (FormatOptions.default.newLineFormat !== 'unix')
      expected = expected.replace(/\n/g, '\r\n');

    multipart.epilogue = multiline;

    expect(multipart.epilogue).toBe(expected);

    multipart.epilogue = null;

    expect(multipart.epilogue).toBeNull();
  });

  test('TestLongEpilogue', () => {
    const multipart = new Multipart('alternative');
    const multiline =
      'This is a part in a (multipart) message generated with the MimeKit library. ' +
      "All of the parts of this message are identical, however they've been encoded " +
      'for transport using different methods.';
    let expected =
      'This is a part in a (multipart) message generated with the MimeKit library.\n' +
      "All of the parts of this message are identical, however they've been encoded\n" +
      'for transport using different methods.\n';

    if (FormatOptions.default.newLineFormat !== 'unix')
      expected = expected.replace(/\n/g, '\r\n');

    multipart.epilogue = multiline;

    expect(multipart.epilogue).toBe(expected);

    multipart.epilogue = null;

    expect(multipart.epilogue).toBeNull();
  });

  test('TestPreambleFolding', () => {
    const text =
      'This is a multipart MIME message. If you are reading this text, then it means that your mail client does not support MIME.\n';
    const expected =
      'This is a multipart MIME message. If you are reading this text, then it means\nthat your mail client does not support MIME.\n';
    const options = FormatOptions.default.clone();

    options.newLineFormat = 'unix';

    const actual = Multipart.foldPreambleOrEpilogue(options, text, false);

    expect(actual, 'Folded multipart preamble does not match.').toBe(expected);
  });

  test('TestEpilogueFolding', () => {
    const text = 'This is a multipart epilogue.';
    const expected = '\nThis is a multipart epilogue.\n';
    const options = FormatOptions.default.clone();

    options.newLineFormat = 'unix';

    const actual = Multipart.foldPreambleOrEpilogue(options, text, true);

    expect(actual, 'Folded multipart preamble does not match.').toBe(expected);
  });

  test('TestSettingPreambleHasExpectedSideEffects', () => {
    const preamble = 'This is the preamble';
    const expected = `${preamble}${FormatOptions.default.newLine}`;
    const multipart = new Multipart('mixed');

    expect(multipart.preamble, 'Preamble should be null by default').toBeNull();
    expect(multipart.writeEndBoundary, 'WriteEndBoundary should be true by default').toBe(true);

    multipart.preamble = preamble;
    expect(multipart.preamble, `Preamble should now be set to '${preamble}' + newline`).toBe(expected);

    multipart.preamble = expected;
    expect(multipart.preamble, 'Preamble should not have changed').toBe(expected);
  });

  test('TestSettingEpilogueHasExpectedSideEffects', () => {
    const epilogue = 'This is the epilogue';
    const expected = `${epilogue}${FormatOptions.default.newLine}`;
    let multipart = new Multipart('mixed');

    expect(multipart.epilogue, 'Epilogue should be null by default').toBeNull();
    expect(multipart.writeEndBoundary, 'WriteEndBoundary should be true by default').toBe(true);

    multipart.epilogue = epilogue;
    expect(multipart.epilogue, `Epilogue should now be set to '${epilogue}' + newline`).toBe(expected);
    expect(multipart.writeEndBoundary, 'WriteEndBoundary should now be true after setting the Epilogue').toBe(true);

    multipart.epilogue = expected;
    expect(multipart.epilogue, 'Epilogue should not have changed').toBe(expected);
    expect(multipart.writeEndBoundary, 'WriteEndBoundary should not have changed').toBe(true);

    // Now test to see what we'd get if the Multipart was parsed by the parser and did not include an end boundary
    multipart = new Multipart('mixed');
    multipart.rawEndBoundary = new Uint8Array(0);

    expect(multipart.epilogue, 'Epilogue should be null by default').toBeNull();
    expect(multipart.writeEndBoundary, 'WriteEndBoundary should be false when RawEndBoundary is empty').toBe(false);

    multipart.epilogue = epilogue;
    expect(multipart.epilogue, `Epilogue should now be set to '${epilogue}' + newline`).toBe(expected);
    expect(multipart.writeEndBoundary, 'WriteEndBoundary should now be true after setting the Epilogue').toBe(true);

    multipart.epilogue = expected;
    expect(multipart.epilogue, 'Epilogue should not have changed').toBe(expected);
    expect(multipart.writeEndBoundary, 'WriteEndBoundary should not have changed').toBe(true);
  });

  // extra (not in C#): write-path smoke until the wave-5 serializer gates land
  test('TestWriteToOrdering', () => {
    setBoundaryGenerator(() => '=-boundary');
    const multipart = new Multipart('mixed');
    multipart.preamble = 'preamble';
    const plain = new TextPart('plain');
    plain.text = 'body';
    multipart.add(plain);
    const stream = new MemoryStream();
    multipart.writeTo(stream);
    const text = streamText(stream);
    expect(text).toContain('Content-Type: multipart/mixed; boundary="=-boundary"');
    expect(text).toContain('preamble\n--=-boundary\nContent-Type: text/plain; charset=utf-8\n\nbody\n--=-boundary--\n');
    setBoundaryGenerator(null);
  });
});
