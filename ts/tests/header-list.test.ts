import { describe, expect, test } from 'vitest';
import { FormatOptions, Header, HeaderId, HeaderList, MemoryStream, ParserOptions, utf8 } from '../src/index.js';

const decoder = new TextDecoder();

function text(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

describe('HeaderList', () => {
  test('TestArgumentExceptions', () => {
    const list = new HeaderList();
    const stream = new MemoryStream();

    // deferred(wave-4): Load/LoadAsync need MimeReader/MimeParser.

    // Add
    expect(() => list.add(null as never)).toThrow(TypeError);
    expect(() => list.add(HeaderId.Unknown, 'value')).toThrow(RangeError);
    expect(() => list.add(HeaderId.AdHoc, null as never)).toThrow(TypeError);
    expect(() => list.add(null as never, 'value')).toThrow(TypeError);
    expect(() => list.add('field', null as never)).toThrow(TypeError);
    expect(() => list.add(HeaderId.Unknown, utf8, 'value')).toThrow(RangeError);
    expect(() => list.add(HeaderId.AdHoc, null as never, 'value')).toThrow(TypeError);
    expect(() => list.add(HeaderId.AdHoc, utf8, null as never)).toThrow(TypeError);
    expect(() => list.add(null as never, utf8, 'value')).toThrow(TypeError);
    expect(() => list.add('field', null as never, 'value')).toThrow(TypeError);
    expect(() => list.add('field', utf8, null as never)).toThrow(TypeError);

    // Contains
    expect(() => list.contains(HeaderId.Unknown)).toThrow(RangeError);
    expect(() => list.contains(null as never)).toThrow(TypeError);

    // CopyTo
    expect(() => list.copyTo([], -1)).toThrow(RangeError);
    expect(() => list.copyTo(null as never, 0)).toThrow(TypeError);

    // IndexOf
    expect(() => list.indexOf(HeaderId.Unknown)).toThrow(RangeError);
    expect(() => list.indexOf(null as never)).toThrow(TypeError);

    // Insert
    list.add('field', 'value');
    expect(() => list.insert(-1, new Header(HeaderId.AdHoc, 'value'))).toThrow(RangeError);
    expect(() => list.insert(-1, HeaderId.AdHoc, utf8, 'value')).toThrow(RangeError);
    expect(() => list.insert(-1, 'field', utf8, 'value')).toThrow(RangeError);
    expect(() => list.insert(-1, HeaderId.AdHoc, 'value')).toThrow(RangeError);
    expect(() => list.insert(-1, 'field', 'value')).toThrow(RangeError);
    expect(() => list.insert(0, HeaderId.Unknown, utf8, 'value')).toThrow(RangeError);
    expect(() => list.insert(0, HeaderId.Unknown, 'value')).toThrow(RangeError);
    expect(() => list.insert(0, HeaderId.AdHoc, utf8, null as never)).toThrow(TypeError);
    expect(() => list.insert(0, HeaderId.AdHoc, null as never, 'value')).toThrow(TypeError);
    expect(() => list.insert(0, HeaderId.AdHoc, null as never)).toThrow(TypeError);
    expect(() => list.insert(0, null as never, 'value')).toThrow(TypeError);
    expect(() => list.insert(0, 'field', null as never)).toThrow(TypeError);
    expect(() => list.insert(0, null as never)).toThrow(TypeError);

    // LastIndexOf
    expect(() => list.lastIndexOf(HeaderId.Unknown)).toThrow(RangeError);
    expect(() => list.lastIndexOf(null as never)).toThrow(TypeError);

    // Remove
    expect(() => list.remove(HeaderId.Unknown)).toThrow(RangeError);
    expect(() => list.remove(null as never)).toThrow(TypeError);

    // RemoveAll
    expect(() => list.removeAll(HeaderId.Unknown)).toThrow(RangeError);
    expect(() => list.removeAll(null as never)).toThrow(TypeError);

    // RemoveAt
    expect(() => list.removeAt(-1)).toThrow(RangeError);

    // Replace
    expect(() => list.replace(null as never)).toThrow(TypeError);
    expect(() => list.replace(HeaderId.Unknown, 'value')).toThrow(RangeError);
    expect(() => list.replace(HeaderId.AdHoc, null as never)).toThrow(TypeError);
    expect(() => list.replace(null as never, 'value')).toThrow(TypeError);
    expect(() => list.replace('field', null as never)).toThrow(TypeError);
    expect(() => list.replace(HeaderId.Unknown, utf8, 'value')).toThrow(RangeError);
    expect(() => list.replace(HeaderId.AdHoc, null as never, 'value')).toThrow(TypeError);
    expect(() => list.replace(HeaderId.AdHoc, utf8, null as never)).toThrow(TypeError);
    expect(() => list.replace(null as never, utf8, 'value')).toThrow(TypeError);
    expect(() => list.replace('field', null as never, 'value')).toThrow(TypeError);
    expect(() => list.replace('field', utf8, null as never)).toThrow(TypeError);

    // WriteTo
    expect(() => list.writeTo(FormatOptions.default, null as never)).toThrow(TypeError);
    expect(() => list.writeTo(null as never, stream)).toThrow(TypeError);
    expect(() => list.writeTo(null as never)).toThrow(TypeError);
    // deferred(wave-4): async write API is omitted per plan.

    // Indexers -> explicit JS get/set methods.
    expect(() => list.set(-1, new Header(HeaderId.AdHoc, 'value'))).toThrow(RangeError);
    expect(() => list.setValue(HeaderId.Unknown, 'value')).toThrow(RangeError);
    expect(() => list.getValue(HeaderId.Unknown)).toThrow(RangeError);
    expect(() => list.at(-1)).toThrow(RangeError);
    expect(() => list.setValue(HeaderId.AdHoc, null as never)).toThrow(TypeError);
    expect(() => list.getValue(null as never)).toThrow(TypeError);
    expect(() => list.setValue(null as never, 'value')).toThrow(TypeError);
    expect(() => list.setValue('field', null as never)).toThrow(TypeError);
    expect(() => list.set(0, null as never)).toThrow(TypeError);
  });

  test('TestGetEnumerator', () => {
    const headers = new HeaderList();
    headers.add(new Header('From', 'Joe Schmoe <joe.schmoe@example.com>'));
    headers.add(new Header('To', 'Jane Doe <jane@example.com>'));
    headers.add(new Header('Subject', 'Hello, World!'));
    headers.add(new Header('Date', 'Wed, 17 Jul 2019 16:00:00 -0400'));
    const copied = new Array<Header>(headers.count);
    let i = 0;

    headers.copyTo(copied, 0);

    for (const header of headers)
      expect(header).toBe(copied[i++]);
  });

  test('TestRemovingHeaders', () => {
    const headers = new HeaderList();
    headers.add('From', 'sender@localhost');
    headers.add('To', 'first@localhost');
    headers.add('To', 'second@localhost');
    headers.add('To', 'third@localhost');
    headers.add('To', 'fourth@localhost');
    headers.add('Cc', 'carbon.copy@localhost');

    expect(headers.isReadOnly).toBe(false);
    expect(headers.contains(new Header(HeaderId.Received, 'value'))).toBe(false);
    expect(headers.indexOf(new Header(HeaderId.Received, 'value'))).toBe(-1);
    expect(headers.indexOf('Received')).toBe(-1);
    expect(headers.lastIndexOf(HeaderId.Received)).toBe(-1);
    expect(headers.getValue(HeaderId.Received)).toBe(null);

    expect(headers.remove('Cc')).toBe(true);

    expect(headers.remove(new Header(HeaderId.Cc, 'value'))).toBe(false);
    expect(headers.remove(HeaderId.Cc)).toBe(false);
    expect(headers.remove('Cc')).toBe(false);

    expect(headers.getValue(HeaderId.To)).toBe('first@localhost');
    expect(headers.remove(HeaderId.To)).toBe(true);
    expect(headers.getValue(HeaderId.To)).toBe('second@localhost');
    expect(headers.remove('To')).toBe(true);
    expect(headers.getValue(HeaderId.To)).toBe('third@localhost');
    headers.removeAt(headers.indexOf('To'));
    expect(headers.getValue(HeaderId.To)).toBe('fourth@localhost');
  });

  test('TestReplacingHeaders', () => {
    const replacedContentType = 'text/plain; charset=iso-8859-1; name=body.txt';
    const replacedContentDisposition = 'inline; filename=body.txt';
    const replacedContentLocation = 'http://www.example.com/location';
    const replacedContentId = '<content.id.2@localhost>';
    const headers = new HeaderList();
    headers.add(HeaderId.ContentId, '<content-id.1@localhost>');
    headers.add('Content-Location', 'http://www.location.com');

    headers.insert(0, HeaderId.ContentDisposition, 'attachment');
    headers.insert(0, 'Content-Type', 'text/plain');

    expect(headers.contains(HeaderId.ContentType)).toBe(true);
    expect(headers.contains('Content-Type')).toBe(true);
    expect(headers.lastIndexOf(HeaderId.ContentType)).toBe(0);

    headers.replace('Content-Disposition', replacedContentDisposition);
    expect(headers.count).toBe(4);
    expect(headers.getValue('Content-Disposition')).toBe(replacedContentDisposition);
    expect(headers.indexOf('Content-Disposition')).toBe(1);

    headers.replace(HeaderId.ContentType, replacedContentType);
    expect(headers.count).toBe(4);
    expect(headers.getValue('Content-Type')).toBe(replacedContentType);
    expect(headers.indexOf('Content-Type')).toBe(0);

    headers.replace(HeaderId.ContentId, utf8, replacedContentId);
    expect(headers.count).toBe(4);
    expect(headers.getValue('Content-Id')).toBe(replacedContentId);
    expect(headers.indexOf('Content-Id')).toBe(2);

    headers.replace('Content-Location', utf8, replacedContentLocation);
    expect(headers.count).toBe(4);
    expect(headers.getValue('Content-Location')).toBe(replacedContentLocation);
    expect(headers.indexOf('Content-Location')).toBe(3);

    headers.removeAll('Content-Location');
    expect(headers.count).toBe(3);

    headers.clear();

    headers.add(HeaderId.Received, 'received 1');
    headers.add(HeaderId.Received, 'received 2');
    headers.add(HeaderId.Received, 'received 3');
    headers.add(HeaderId.ReturnPath, 'return-path');

    headers.set(0, new Header(HeaderId.ReturnPath, 'new return-path'));
    expect(headers.getValue(HeaderId.ReturnPath)).toBe('new return-path');
    headers.set(0, new Header(HeaderId.Received, 'new received'));
    expect(headers.getValue(HeaderId.Received)).toBe('new received');
  });

  test('TestReplacingMultipleHeaders', () => {
    const combinedRecipients = 'first@localhost, second@localhost, third@localhost';
    const headers = new HeaderList();
    headers.add('From', 'sender@localhost');
    headers.add('To', 'first@localhost');
    headers.add('To', 'second@localhost');
    headers.add('To', 'third@localhost');
    headers.add('Cc', 'carbon.copy@localhost');

    headers.replace('To', combinedRecipients);
    expect(headers.count).toBe(3);
    expect(headers.getValue('To')).toBe(combinedRecipients);
    expect(headers.indexOf('To')).toBe(1);
    expect(headers.indexOf('From')).toBe(0);
    expect(headers.indexOf('Cc')).toBe(2);
  });

  test('TestSetHeaderAtIndex', () => {
    const headers = new HeaderList();
    headers.add(new Header('From', 'Joe Schmoe <joe.schmoe@example.com>'));
    headers.add(new Header('To', 'Jane Doe <jane@example.com>'));
    headers.add(new Header('Subject', 'Hello, World!'));
    headers.add(new Header('Date', 'Wed, 17 Jul 2019 16:00:00 -0400'));
    const index = headers.indexOf(HeaderId.Subject);
    const subject = headers.at(index);
    const changedActions: string[] = [];
    let changedCount = 0;

    expect(subject.id).toBe(HeaderId.Subject);

    headers.onChanged = (_header, action) => {
      changedActions.push(action);
      changedCount++;
    };

    headers.set(index, subject);
    expect(changedCount).toBe(0);

    headers.set(index, new Header(HeaderId.Subject, 'This is a different subject!'));
    expect(changedCount).toBe(1);
    expect(changedActions[0]).toBe('changed');

    headers.set(index, new Header(HeaderId.MessageId, '<msg-id@example.com>'));
    expect(changedCount).toBe(3);
    expect(changedActions[1]).toBe('removed');
    expect(changedActions[2]).toBe('added');
  });

  test('TestLoad', () => {
    const headers = new HeaderList();
    headers.add(new Header('From', 'Joe Schmoe <joe.schmoe@example.com>'));
    headers.add(new Header('To', 'Jane Doe <jane@example.com>'));
    headers.add(new Header('Subject', 'Hello, World!'));
    headers.add(new Header('Date', 'Wed, 17 Jul 2019 16:00:00 -0400'));

    // adapted(node-entry): C# writes to a temp file; the core port round-trips
    // through an in-memory stream instead.
    const stream = new MemoryStream();
    headers.writeTo(stream);

    const result = HeaderList.load(stream.toArray());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const loaded = result.value;

    expect(loaded.count, 'Loaded headers count does not match original headers count').toBe(headers.count);

    for (let i = 0; i < headers.count; i++) {
      expect(loaded.at(i).id, 'Loaded header id does not match original header id').toBe(headers.at(i).id);
      expect(loaded.at(i).value, 'Loaded header value does not match original header value').toBe(headers.at(i).value);
    }
  });

  test.skip('TestLoadAsync', () => {
    // deferred(wave-4): needs MimeReader/MimeParser stream parsing; async API pairs are omitted per plan.
  });

  test('WriteTo', () => {
    const headers = new HeaderList();
    headers.add(new Header('From', 'Joe Schmoe <joe.schmoe@example.com>'));
    headers.add(Header.fromRaw(ParserOptions.default, HeaderId.Subject, 'Subject', new TextEncoder().encode(' raw subject\r\n')));
    const stream = new MemoryStream();

    headers.writeTo(stream);

    expect(text(stream.toArray())).toBe('From: Joe Schmoe <joe.schmoe@example.com>\nSubject: raw subject\n\n');
  });
});
