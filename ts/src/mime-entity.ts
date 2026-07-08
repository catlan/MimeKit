import { ContentDisposition } from './content-disposition.js';
import type { MimeVisitor } from './mime-visitor.js';
import { ContentType } from './content-type.js';
import { FormatOptions } from './format-options.js';
import { Header } from './header.js';
import { HeaderId } from './header-id.js';
import { HeaderList, type HeaderListChangedAction } from './header-list.js';
import { Stream, MemoryStream } from './io/stream.js';
import { ParserOptions } from './parser-options.js';
import { utf8 } from './utils/charset-utils.js';
import { tryParseMsgId } from './utils/parse-utils.js';

export interface MimeEntityConstructorArgs {
  parserOptions: ParserOptions;
  headers: Iterable<Header>;
  contentType: ContentType;
  hasBodySeparator: boolean;
  isTopLevel: boolean;
}

type LazyField =
  | 'contentBase'
  | 'contentDisposition'
  | 'contentId'
  | 'contentLocation'
  | 'contentDescription'
  | 'contentDuration'
  | 'contentLanguage'
  | 'contentMd5'
  | 'contentTransferEncoding';

const encoder = new TextEncoder();

export abstract class MimeEntity {
  readonly headers: HeaderList;
  readonly contentType: ContentType;
  ensureNewLine = false;
  protected readonly lazyLoaded = new Set<LazyField>();
  private disposed = false;

  /** C#: internal IsDisposed (exposed publicly; upstream tests read it via InternalsVisibleTo). */
  get isDisposed(): boolean {
    return this.disposed;
  }
  private dispositionValue: ContentDisposition | null = null;
  private contentIdValue: string | null = null;
  private contentLocationValue: string | null = null;
  private contentBaseValue: string | null = null;

  protected constructor(mediaType: string, mediaSubtype: string);
  protected constructor(contentType: ContentType);
  protected constructor(args: MimeEntityConstructorArgs);
  protected constructor(a: string | ContentType | MimeEntityConstructorArgs, b?: string) {
    if (isConstructorArgs(a)) {
      this.headers = new HeaderList(a.parserOptions);
      this.contentType = a.contentType;
      for (const header of a.headers) {
        if (a.isTopLevel && !header.field.toLowerCase().startsWith('content-'))
          continue;
        this.headers.add(header);
      }
      this.headers.hasBodySeparator = a.hasBodySeparator;
    } else {
      const contentType = a instanceof ContentType ? a : new ContentType(a, b as string);
      this.headers = new HeaderList();
      this.contentType = contentType;
    }

    this.contentType.onChanged = () => this.serializeContentType();
    this.headers.onChanged = (header, action) => this.onHeadersChanged(action, header);

    if (!isConstructorArgs(a))
      this.serializeContentType();
  }

  get contentDisposition(): ContentDisposition | null {
    this.checkDisposed();
    if (!this.lazyLoaded.has('contentDisposition')) {
      const header = this.headers.tryGetHeader(HeaderId.ContentDisposition);
      if (header !== null) {
        const parsed = ContentDisposition.parse(header.rawValue, this.headers.options);
        if (parsed.ok) {
          this.dispositionValue = parsed.value;
          this.dispositionValue.onChanged = () => this.serializeContentDisposition();
        }
      }
      this.lazyLoaded.add('contentDisposition');
    }
    return this.dispositionValue;
  }

  set contentDisposition(value: ContentDisposition | null) {
    this.checkDisposed();
    if (this.lazyLoaded.has('contentDisposition') && this.dispositionValue === value)
      return;
    if (this.dispositionValue !== null)
      this.dispositionValue.onChanged = null;
    this.dispositionValue = value;
    if (value !== null) {
      value.onChanged = () => this.serializeContentDisposition();
      this.serializeContentDisposition();
    } else {
      this.removeHeader('Content-Disposition');
    }
    this.lazyLoaded.add('contentDisposition');
  }

  get contentBase(): string | null {
    this.checkDisposed();
    if (!this.lazyLoaded.has('contentBase')) {
      const header = this.headers.tryGetHeader(HeaderId.ContentBase);
      const value = header?.value.trim();
      if (value && isAbsoluteUri(value))
        this.contentBaseValue = value;
      this.lazyLoaded.add('contentBase');
    }
    return this.contentBaseValue;
  }

  set contentBase(value: string | URL | null) {
    this.checkDisposed();
    const text = value == null ? null : value.toString();
    if (text !== null && !isAbsoluteUri(text))
      throw new TypeError('The Content-Base URI may only be set to an absolute URI.');
    this.contentBaseValue = text;
    text !== null ? this.setHeader('Content-Base', text) : this.removeHeader('Content-Base');
    this.lazyLoaded.add('contentBase');
  }

  get contentLocation(): string | null {
    this.checkDisposed();
    if (!this.lazyLoaded.has('contentLocation')) {
      const header = this.headers.tryGetHeader(HeaderId.ContentLocation);
      const value = header?.value.trim();
      if (value)
        this.contentLocationValue = value;
      this.lazyLoaded.add('contentLocation');
    }
    return this.contentLocationValue;
  }

  set contentLocation(value: string | URL | null) {
    this.checkDisposed();
    const text = value == null ? null : value.toString();
    this.contentLocationValue = text;
    text !== null ? this.setHeader('Content-Location', text) : this.removeHeader('Content-Location');
    this.lazyLoaded.add('contentLocation');
  }

  get contentId(): string | null {
    this.checkDisposed();
    if (!this.lazyLoaded.has('contentId')) {
      const header = this.headers.tryGetHeader(HeaderId.ContentId);
      if (header !== null) {
        const cursor = { index: 0 };
        const parsed = tryParseMsgId(header.rawValue, cursor, header.rawValue.length, false);
        if (parsed.ok)
          this.contentIdValue = parsed.value;
      }
      this.lazyLoaded.add('contentId');
    }
    return this.contentIdValue;
  }

  set contentId(value: string | null) {
    this.checkDisposed();
    if (value === null) {
      this.contentIdValue = null;
      this.removeHeader('Content-Id');
      this.lazyLoaded.add('contentId');
      return;
    }
    const bytes = encoder.encode(value);
    const cursor = { index: 0 };
    const parsed = tryParseMsgId(bytes, cursor, bytes.length, false);
    if (!parsed.ok)
      throw new TypeError('Invalid Content-Id format.');
    this.contentIdValue = parsed.value;
    this.setHeader('Content-Id', `<${parsed.value}>`);
    this.lazyLoaded.add('contentId');
  }

  get isAttachment(): boolean {
    this.checkDisposed();
    return this.contentDisposition?.isAttachment ?? false;
  }

  set isAttachment(value: boolean) {
    this.checkDisposed();
    if (value) {
      if (this.contentDisposition === null)
        this.contentDisposition = new ContentDisposition(ContentDisposition.attachment);
      else if (!this.contentDisposition.isAttachment)
        this.contentDisposition.disposition = ContentDisposition.attachment;
    } else if (this.contentDisposition?.isAttachment) {
      this.contentDisposition.disposition = ContentDisposition.inline;
    }
  }

  accept(visitor: MimeVisitor): void {
    if (visitor == null)
      throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MimeEntity');
    visitor.visitMimeEntity(this);
  }

  abstract prepare(constraint: string, maxLineLength?: number): void;

  writeTo(stream: Stream): void;
  writeTo(options: FormatOptions, stream: Stream): void;
  writeTo(options: FormatOptions, stream: Stream, contentOnly: boolean): void;
  writeTo(a: FormatOptions | Stream, b?: Stream, contentOnly = false): void {
    const options = a instanceof FormatOptions ? a : FormatOptions.default;
    const stream = a instanceof FormatOptions ? b : a;
    if (options == null) throw new TypeError('options cannot be null or undefined');
    if (stream == null) throw new TypeError('stream cannot be null or undefined');
    this.checkDisposed();
    if (!contentOnly)
      this.headers.writeTo(options, stream);
  }

  toString(): string {
    const memory = new MemoryStream();
    this.writeTo(memory);
    return latin1String(memory.toArray());
  }

  dispose(): void {
    if (this.disposed)
      return;
    this.contentType.onChanged = null;
    this.headers.onChanged = null;
    if (this.dispositionValue !== null)
      this.dispositionValue.onChanged = null;
    this.disposed = true;
  }

  protected checkDisposed(objectName = 'MimeEntity'): void {
    if (this.disposed)
      throw new TypeError(`${objectName} has been disposed`);
  }

  protected tryInit(obj: unknown): boolean {
    if (obj instanceof Header) {
      this.headers.add(obj);
      return true;
    }
    if (isHeaderIterable(obj)) {
      for (const header of obj)
        this.headers.add(header);
      return true;
    }
    return false;
  }

  protected removeHeader(name: string): void {
    const previous = this.headers.onChanged;
    this.headers.onChanged = null;
    try {
      this.headers.removeAll(name);
    } finally {
      this.headers.onChanged = previous;
    }
  }

  protected setHeader(name: string, value: string): void {
    const previous = this.headers.onChanged;
    this.headers.onChanged = null;
    try {
      this.headers.setValue(name, value);
    } finally {
      this.headers.onChanged = previous;
    }
  }

  protected setRawHeader(name: string, rawValue: Uint8Array): void {
    const previous = this.headers.onChanged;
    this.headers.onChanged = null;
    try {
      this.headers.replace(Header.fromRaw(this.headers.options, name, name, rawValue));
    } finally {
      this.headers.onChanged = previous;
    }
  }

  protected onHeadersChanged(action: HeaderListChangedAction, header: Header | null): void {
    if (action === 'cleared') {
      if (this.dispositionValue !== null)
        this.dispositionValue.onChanged = null;
      this.lazyLoaded.clear();
      this.dispositionValue = null;
      this.contentIdValue = null;
      this.contentLocationValue = null;
      this.contentBaseValue = null;
      return;
    }

    if (header == null)
      throw new TypeError('header cannot be null or undefined');

    switch (header.id) {
    case HeaderId.ContentDisposition:
      if (this.dispositionValue !== null)
        this.dispositionValue.onChanged = null;
      this.lazyLoaded.delete('contentDisposition');
      this.dispositionValue = null;
      break;
    case HeaderId.ContentLocation:
      this.lazyLoaded.delete('contentLocation');
      this.contentLocationValue = null;
      break;
    case HeaderId.ContentBase:
      this.lazyLoaded.delete('contentBase');
      this.contentBaseValue = null;
      break;
    case HeaderId.ContentId:
      this.lazyLoaded.delete('contentId');
      this.contentIdValue = null;
      break;
    }
  }

  private serializeContentDisposition(): void {
    if (this.dispositionValue === null)
      return;
    this.setRawHeader('Content-Disposition', utf8.encode(this.dispositionValue.encode(FormatOptions.default, utf8)));
  }

  private serializeContentType(): void {
    this.setRawHeader('Content-Type', utf8.encode(this.contentType.encode(FormatOptions.default, utf8)));
  }
}

function isConstructorArgs(value: unknown): value is MimeEntityConstructorArgs {
  return typeof value === 'object' && value !== null && 'parserOptions' in value && 'contentType' in value && 'headers' in value;
}

function isHeaderIterable(value: unknown): value is Iterable<Header> {
  if (value == null || typeof value === 'string' || value instanceof Uint8Array)
    return false;
  if (typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function')
    return false;
  for (const item of value as Iterable<unknown>)
    return item instanceof Header;
  return true;
}

function isAbsoluteUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol.length > 0;
  } catch {
    return false;
  }
}

function latin1String(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i++)
    text += String.fromCharCode(bytes[i]!);
  return text;
}
