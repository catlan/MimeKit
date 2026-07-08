// Port of MimeKit/Text/HtmlWriter.cs.
//
// Overload note: C# char[]/string overloads collapse to `string`; the char[]
// range forms are exposed as *Range methods, and WriteText(format, args) as
// writeTextFormat, to stay unambiguous in TS. The TextWriter and (Stream,
// Encoding) constructors are both supported (see text-io StreamTextWriter).

import { Stream } from '../io/stream.js';
import { HtmlAttribute } from './html-attribute.js';
import { HtmlAttributeId, isHtmlAttributeId, toAttributeName } from './html-attribute-id.js';
import { HtmlTagId, isHtmlTagId, toHtmlTagName } from './html-tag-id.js';
import type { HtmlToken } from './html-token.js';
import { htmlAttributeEncode, htmlEncode, isValidAttributeName, isValidTagName } from './html-utils.js';
import { HtmlWriterState } from './html-writer-state.js';
import { type TextWriter, StreamTextWriter } from './text-io.js';

function formatString(format: string, args: unknown[]): string {
  return format.replace(/\{(\d+)\}/g, (_, n: string) => String(args[Number(n)]));
}

/** An HTML writer. */
export class HtmlWriter {
  private readonly html: TextWriter;
  private readonly leaveOpen: boolean;
  private disposed = false;
  private empty = false;
  private state: HtmlWriterState = HtmlWriterState.Default;

  constructor(output: TextWriter, leaveOpen?: boolean);
  constructor(stream: Stream, encoding: unknown, leaveOpen?: boolean);
  constructor(a: TextWriter | Stream, b?: boolean | unknown, c?: boolean) {
    if (typeof b === 'boolean' || b === undefined) {
      // (output: TextWriter, leaveOpen?)
      const output = a as TextWriter;
      if (output === null || output === undefined) throw new TypeError('output');
      this.html = output;
      this.leaveOpen = (b as boolean | undefined) ?? false;
    } else {
      // (stream: Stream, encoding, leaveOpen?)
      const stream = a as Stream;
      if (stream === null || stream === undefined) throw new TypeError('stream');
      const encoding = b;
      if (encoding === null || encoding === undefined) throw new TypeError('encoding');
      this.html = new StreamTextWriter(stream, c ?? false);
      // Note: mirrors the C# quirk where the stream ctor always sets leaveOpen=false.
      this.leaveOpen = false;
    }
  }

  private checkDisposed(): void {
    if (this.disposed) throw new TypeError('HtmlWriter has been disposed.');
  }

  /** Get the current state of the writer. */
  get writerState(): HtmlWriterState {
    return this.state;
  }

  private static validateArguments(buffer: string, index: number, count: number): void {
    if (buffer === null || buffer === undefined) throw new TypeError('buffer');
    if (index < 0 || index > buffer.length) throw new RangeError('index');
    if (count < 0 || count > buffer.length - index) throw new RangeError('count');
  }

  private static validateAttributeName(name: string): void {
    if (name === null || name === undefined) throw new TypeError('name');
    if (name.length === 0) throw new TypeError('The attribute name cannot be empty.');
    if (!isValidAttributeName(name)) throw new TypeError(`Invalid attribute name: ${name}`);
  }

  private static validateTagName(name: string): void {
    if (name === null || name === undefined) throw new TypeError('name');
    if (name.length === 0) throw new TypeError('The tag name cannot be empty.');
    if (!isValidTagName(name)) throw new TypeError(`Invalid tag name: ${name}`);
  }

  private encodeAttributeName(name: string): void {
    if (this.state === HtmlWriterState.Default)
      throw new TypeError('Cannot write attributes in the Default state.');

    this.html.write(' ');
    this.html.write(name);
    this.state = HtmlWriterState.Attribute;
  }

  private encodeAttributeValueRange(value: string, startIndex: number, count: number): void {
    if (this.state !== HtmlWriterState.Attribute)
      throw new TypeError('Attribute values can only be written in the Attribute state.');

    this.html.write('=');
    htmlAttributeEncode(this.html, value, startIndex, count);
    this.state = HtmlWriterState.Tag;
  }

  private encodeAttributeValue(value: string): void {
    if (this.state !== HtmlWriterState.Attribute)
      throw new TypeError('Attribute values can only be written in the Attribute state.');

    this.html.write('=');
    htmlAttributeEncode(this.html, value);
    this.state = HtmlWriterState.Tag;
  }

  // --- WriteAttribute ---

  writeAttribute(attribute: HtmlAttribute): void;
  writeAttribute(idOrName: HtmlAttributeId | string, value: string): void;
  writeAttribute(a: HtmlAttribute | HtmlAttributeId | string, value?: string): void {
    if (a instanceof HtmlAttribute) {
      if (a === null || a === undefined) throw new TypeError('attribute');
      this.encodeAttributeName(a.name);
      if (a.value !== null && a.value !== undefined) this.encodeAttributeValue(a.value);
      return;
    }

    if (isHtmlAttributeId(a)) {
      if (a === HtmlAttributeId.Unknown) throw new TypeError('Invalid attribute.');
      if (value === null || value === undefined) throw new TypeError('value');
      this.checkDisposed();
      this.encodeAttributeName(toAttributeName(a));
      this.encodeAttributeValue(value);
      return;
    }

    HtmlWriter.validateAttributeName(a);
    if (value === null || value === undefined) throw new TypeError('value');
    this.checkDisposed();
    this.encodeAttributeName(a);
    this.encodeAttributeValue(value);
  }

  /** WriteAttribute with a char[]-range value (id or name). */
  writeAttributeRange(idOrName: HtmlAttributeId | string, buffer: string, index: number, count: number): void {
    if (isHtmlAttributeId(idOrName)) {
      if (idOrName === HtmlAttributeId.Unknown) throw new TypeError('Invalid attribute.');
      HtmlWriter.validateArguments(buffer, index, count);
      this.checkDisposed();
      this.encodeAttributeName(toAttributeName(idOrName));
      this.encodeAttributeValueRange(buffer, index, count);
      return;
    }

    HtmlWriter.validateAttributeName(idOrName);
    HtmlWriter.validateArguments(buffer, index, count);
    this.checkDisposed();
    this.encodeAttributeName(idOrName);
    this.encodeAttributeValueRange(buffer, index, count);
  }

  // --- WriteAttributeName ---

  writeAttributeName(idOrName: HtmlAttributeId | string): void {
    if (isHtmlAttributeId(idOrName)) {
      if (idOrName === HtmlAttributeId.Unknown) throw new TypeError('Invalid attribute.');
      if (this.state === HtmlWriterState.Default)
        throw new TypeError('Cannot write attributes in the Default state.');
      this.checkDisposed();
      this.encodeAttributeName(toAttributeName(idOrName));
      return;
    }

    HtmlWriter.validateAttributeName(idOrName);
    if (this.state === HtmlWriterState.Default)
      throw new TypeError('Cannot write attributes in the Default state.');
    this.checkDisposed();
    this.encodeAttributeName(idOrName);
  }

  // --- WriteAttributeValue ---

  writeAttributeValue(value: string): void {
    if (value === null || value === undefined) throw new TypeError('value');
    this.checkDisposed();
    this.encodeAttributeValue(value);
  }

  writeAttributeValueRange(buffer: string, index: number, count: number): void {
    HtmlWriter.validateArguments(buffer, index, count);
    this.checkDisposed();
    this.encodeAttributeValueRange(buffer, index, count);
  }

  private flushWriterState(): void {
    if (this.state !== HtmlWriterState.Default) {
      this.state = HtmlWriterState.Default;
      this.html.write(this.empty ? '/>' : '>');
      this.empty = false;
    }
  }

  // --- WriteEmptyElementTag ---

  writeEmptyElementTag(idOrName: HtmlTagId | string): void {
    if (isHtmlTagId(idOrName)) {
      if (idOrName === HtmlTagId.Unknown) throw new TypeError('Invalid tag.');
      this.checkDisposed();
      this.flushWriterState();
      this.html.write(`<${toHtmlTagName(idOrName)}`);
      this.state = HtmlWriterState.Tag;
      this.empty = true;
      return;
    }

    HtmlWriter.validateTagName(idOrName);
    this.checkDisposed();
    this.flushWriterState();
    this.html.write(`<${idOrName}`);
    this.state = HtmlWriterState.Tag;
    this.empty = true;
  }

  // --- WriteEndTag ---

  writeEndTag(idOrName: HtmlTagId | string): void {
    if (isHtmlTagId(idOrName)) {
      if (idOrName === HtmlTagId.Unknown) throw new TypeError('Invalid tag.');
      this.checkDisposed();
      this.flushWriterState();
      this.html.write(`</${toHtmlTagName(idOrName)}>`);
      return;
    }

    HtmlWriter.validateTagName(idOrName);
    this.checkDisposed();
    this.flushWriterState();
    this.html.write(`</${idOrName}>`);
  }

  // --- WriteMarkupText ---

  writeMarkupText(value: string): void {
    if (value === null || value === undefined) throw new TypeError('value');
    this.checkDisposed();
    this.flushWriterState();
    this.html.write(value);
  }

  writeMarkupTextRange(buffer: string, index: number, count: number): void {
    HtmlWriter.validateArguments(buffer, index, count);
    this.checkDisposed();
    this.flushWriterState();
    this.html.write(buffer.substr(index, count));
  }

  // --- WriteStartTag ---

  writeStartTag(idOrName: HtmlTagId | string): void {
    if (isHtmlTagId(idOrName)) {
      if (idOrName === HtmlTagId.Unknown) throw new TypeError('Invalid tag.');
      this.checkDisposed();
      this.flushWriterState();
      this.html.write(`<${toHtmlTagName(idOrName)}`);
      this.state = HtmlWriterState.Tag;
      return;
    }

    HtmlWriter.validateTagName(idOrName);
    this.checkDisposed();
    this.flushWriterState();
    this.html.write(`<${idOrName}`);
    this.state = HtmlWriterState.Tag;
  }

  // --- WriteText ---

  writeText(value: string): void {
    if (value === null || value === undefined) throw new TypeError('value');
    this.checkDisposed();
    this.flushWriterState();
    if (value.length > 0) htmlEncode(this.html, value, 0, value.length);
  }

  writeTextRange(buffer: string, index: number, count: number): void {
    HtmlWriter.validateArguments(buffer, index, count);
    this.checkDisposed();
    this.flushWriterState();
    if (count > 0) htmlEncode(this.html, buffer, index, count);
  }

  writeTextFormat(format: string, ...args: unknown[]): void {
    this.writeText(formatString(format, args));
  }

  // --- WriteToken ---

  writeToken(token: HtmlToken): void {
    if (token === null || token === undefined) throw new TypeError('token');
    this.checkDisposed();
    this.flushWriterState();
    token.writeTo(this.html);
  }

  /** Flush any remaining state to the output. */
  flush(): void {
    this.checkDisposed();
    this.flushWriterState();
    this.html.flush?.();
  }

  dispose(): void {
    if (!this.disposed && !this.leaveOpen) this.html.dispose?.();
    this.disposed = true;
  }
}
