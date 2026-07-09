import { describe, expect, test } from 'vitest';
import {
  MessagePart,
  MimeIterator,
  MimeMessage,
  MimePart,
  Multipart,
  MultipartAlternative,
  TextPart,
} from '../src/index.js';
import type { MimeEntity } from '../src/index.js';

function createImapExampleMessageRfc822(parents: Array<MimeEntity | null>): MessagePart {
  const message = new MimeMessage();
  const mixed = new Multipart('mixed');
  const rfc822 = new MessagePart();
  rfc822.message = message;
  parents.push(rfc822);
  message.body = mixed;
  parents.push(mixed);
  mixed.add(new TextPart('plain'));
  parents.push(mixed);
  mixed.add(new MimePart());
  return rfc822;
}

function createImapExampleInnerMessageRfc822(parents: Array<MimeEntity | null>): MessagePart {
  const message = new MimeMessage();
  const mixed = new Multipart('mixed');
  const alternative = new MultipartAlternative();
  const rfc822 = new MessagePart();
  rfc822.message = message;
  parents.push(rfc822);
  message.body = mixed;
  parents.push(mixed);
  mixed.add(new TextPart('plain'));
  parents.push(mixed);
  mixed.add(alternative);
  parents.push(alternative);
  alternative.add(new TextPart('plain'));
  parents.push(alternative);
  alternative.add(new TextPart('richtext'));
  return rfc822;
}

function createImapExampleInnerMultipart(parents: Array<MimeEntity | null>): Multipart {
  const mixed = new Multipart('mixed');
  parents.push(mixed);
  mixed.add(new MimePart('image', 'gif'));
  parents.push(mixed);
  mixed.add(createImapExampleInnerMessageRfc822(parents));
  return mixed;
}

function createImapExampleMessage(parents: Array<MimeEntity | null>): MimeMessage {
  const message = new MimeMessage();
  const mixed = new Multipart('mixed');
  message.body = mixed;
  parents.push(mixed);
  mixed.add(new TextPart('plain'));
  parents.push(mixed);
  mixed.add(new MimePart());
  parents.push(mixed);
  mixed.add(createImapExampleMessageRfc822(parents));
  parents.push(mixed);
  mixed.add(createImapExampleInnerMultipart(parents));
  return message;
}

const expectedTypes = [
  Multipart, TextPart, MimePart, MessagePart, Multipart, TextPart, MimePart, Multipart,
  MimePart, MessagePart, Multipart, TextPart, MultipartAlternative, TextPart, TextPart,
];
const expectedPathSpecifiers = ['0', '1', '2', '3', '3.0', '3.1', '3.2', '4', '4.1', '4.2', '4.2.0', '4.2.1', '4.2.2', '4.2.2.1', '4.2.2.2'];
const expectedDepths = [0, 1, 1, 1, 2, 3, 3, 1, 2, 2, 3, 4, 4, 5, 5];

describe('MimeIterator', () => {
  test('TestArgumentExceptions', () => {
    const iter = new MimeIterator(new MimeMessage());
    expect(() => new MimeIterator(null as never)).toThrow(TypeError);
    expect(() => iter.depth).toThrow(Error);
    expect(() => iter.current).toThrow(Error);
    expect(() => iter.parent).toThrow(Error);
    expect(() => iter.pathSpecifier).toThrow(Error);
    expect(() => iter.moveTo(null as never)).toThrow(TypeError);
    expect(() => iter.moveTo('')).toThrow(TypeError);
    expect(() => iter.moveTo('xyz')).toThrow(Error);
  });

  test('TestPathSpecifiers', () => {
    const expectedParents: Array<MimeEntity | null> = [null];
    const message = createImapExampleMessage(expectedParents);
    const iter = new MimeIterator(message);
    let i = 0;
    expect(iter.moveNext()).toBe(true);
    do {
      expect(iter.depth).toBe(expectedDepths[i]);
      expect(iter.parent).toBe(expectedParents[i]);
      expect(iter.current).toBeInstanceOf(expectedTypes[i]!);
      expect(iter.pathSpecifier).toBe(expectedPathSpecifiers[i]);
      i++;
    } while (iter.moveNext());
    expect(i).toBe(expectedTypes.length);

    iter.reset();
    i = 0;
    expect(iter.moveNext()).toBe(true);
    do {
      expect(iter.depth).toBe(expectedDepths[i]);
      expect(iter.parent).toBe(expectedParents[i]);
      expect(iter.current).toBeInstanceOf(expectedTypes[i]!);
      expect(iter.pathSpecifier).toBe(expectedPathSpecifiers[i]);
      i++;
    } while (iter.moveNext());
  });

  test('TestMoveTo', () => {
    const expectedParents: Array<MimeEntity | null> = [null];
    const message = createImapExampleMessage(expectedParents);
    const iter = new MimeIterator(message);
    for (const path of ['3.1', '3.2', '4', '4.2.1', '4.2.2.2', '4.2', '3.2']) {
      const i = expectedPathSpecifiers.indexOf(path);
      expect(iter.moveTo(path)).toBe(true);
      expect(iter.pathSpecifier).toBe(path);
      expect(iter.parent).toBe(expectedParents[i]);
      expect(iter.current).toBeInstanceOf(expectedTypes[i]!);
      expect(iter.depth).toBe(expectedDepths[i]);
    }
  });
});
