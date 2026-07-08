import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  FormatOptions,
  MessagePartial,
  MimeMessage,
  MimeParser,
  MimePart,
  Multipart,
} from '../src/index.js';
import { MemoryStream } from '../src/io/stream.js';
import { testDataDir } from './gates/helpers.js';

function load(rel: string): MimeMessage {
  const bytes = new Uint8Array(readFileSync(join(testDataDir, 'partial', rel)));
  const parser = new MimeParser(new MemoryStream(bytes), 'entity');
  const result = parser.parseMessage();
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function assertRawMessageStreams(expected: MimeMessage, actual: MimeMessage): void {
  const options = FormatOptions.default.clone();
  options.newLineFormat = 'unix';

  const expectedStream = new MemoryStream();
  expected.writeTo(options, expectedStream);
  const expectedBytes = expectedStream.toArray();

  const actualStream = new MemoryStream();
  actual.writeTo(options, actualStream);
  const actualBytes = actualStream.toArray();

  expect(actualBytes.length).toBe(expectedBytes.length);
  expect([...actualBytes]).toEqual([...expectedBytes]);
}

describe('MessagePartial', () => {
  test('TestArgumentExceptions', () => {
    expect(() => new MessagePartial(null as never, 1, 5)).toThrow(TypeError);
    expect(() => new MessagePartial('id', 0, 5)).toThrow(RangeError);
    expect(() => new MessagePartial('id', 6, 5)).toThrow(RangeError);
    expect(() => new MessagePartial('id', 1, 5).accept(null as never)).toThrow(TypeError);
    // Split/Join argument validation (C#: ArgumentNullException/ArgumentOutOfRangeException).
    expect(() => MessagePartial.split(null as never, 500)).toThrow(TypeError);
    expect(() => MessagePartial.split(new MimeMessage(), 0)).toThrow(RangeError);
    expect(() => MessagePartial.join(null as never, [])).toThrow(TypeError);
    expect(() => MessagePartial.join(new MimeMessage(), null as never)).toThrow(TypeError);
  });

  test('TestNumberAndTotalParameters', () => {
    const partial = new MessagePartial('abc@example.com', 1, 5);
    partial.contentType.parameters.set('number', 'invalid');
    partial.contentType.parameters.set('total', 'invalid');
    expect(partial.number).toBeNull();
    expect(partial.total).toBeNull();
    partial.contentType.parameters.remove('number');
    partial.contentType.parameters.remove('total');
    expect(partial.number).toBeNull();
    expect(partial.total).toBeNull();
    partial.contentType.parameters.set('number', '1');
    partial.contentType.parameters.set('total', '5');
    expect(partial.number).toBe(1);
    expect(partial.total).toBe(5);
  });

  test('TestReassembleGirlOnTrainPhotoExample', () => {
    const message0 = load('message-partial.0.eml');
    const message1 = load('message-partial.1.eml');
    const message2 = load('message-partial.2.eml');
    const original = load('message-partial.eml');

    expect(message0.body).toBeInstanceOf(MessagePartial);
    expect(message1.body).toBeInstanceOf(MessagePartial);
    expect(message2.body).toBeInstanceOf(MessagePartial);

    const partials = [message0.body as MessagePartial, message1.body as MessagePartial, message2.body as MessagePartial];
    expect(() => MessagePartial.join(null as never, message0, partials)).toThrow(TypeError);
    expect(() => MessagePartial.join(null as never, partials)).toThrow(TypeError);

    const message = MessagePartial.join(message0, partials);
    expect(message).not.toBeNull();
    expect(message!.subject).toBe('Photo of a girl with feather earrings');
    expect(message!.body).toBeInstanceOf(Multipart);

    const multipart = message!.body as Multipart;
    expect(multipart.count).toBe(2);

    const part = multipart.at(1) as MimePart;
    expect(part).not.toBeNull();
    expect(part.contentType.isMimeType('image', 'jpeg')).toBe(true);
    expect(part.fileName).toBe('earrings.jpg');

    assertRawMessageStreams(original, message!);
  });

  test('TestReassembleRfc2046Example', () => {
    const message0 = load('rfc2046.0.eml');
    const message1 = load('rfc2046.1.eml');
    const original = load('rfc2046.eml');

    expect(message0.body).toBeInstanceOf(MessagePartial);
    expect(message1.body).toBeInstanceOf(MessagePartial);

    const partials = [message0.body as MessagePartial, message1.body as MessagePartial];
    expect(() => MessagePartial.join(null as never, message0, partials)).toThrow(TypeError);
    expect(() => MessagePartial.join(null as never, partials)).toThrow(TypeError);

    const message = MessagePartial.join(message0, partials);
    expect(message).not.toBeNull();
    expect(message!.subject).toBe('Audio mail');
    expect(message!.body!.contentType.isMimeType('audio', 'basic')).toBe(true);

    assertRawMessageStreams(original, message!);
  });

  test('TestSplit', () => {
    const message = load('message-partial.eml');
    const split = MessagePartial.split(message, 1024 * 16);

    expect(split.length).toBe(11);

    const parts: MessagePartial[] = [];
    for (let i = 0; i < split.length; i++) {
      const partial = split[i]!.body as MessagePartial;
      parts.push(partial);
      expect(partial.total).toBe(11);
      expect(partial.number).toBe(i + 1);
    }

    const combined = MessagePartial.join(message, parts);
    expect(combined).not.toBeNull();
    assertRawMessageStreams(message, combined!);
  });
});
