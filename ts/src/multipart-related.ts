import { Stream } from './io/stream.js';
import { MimeEntity, type MimeEntityConstructorArgs } from './mime-entity.js';
import type { MimeVisitor } from './mime-visitor.js';
import { MimePart } from './mime-part.js';
import { Multipart } from './multipart.js';
import { TextPart, TextFormat } from './text-part.js';
import { enumerateReferences, generateMessageId } from './utils/mime-utils.js';

export class MultipartRelated extends Multipart {
  constructor(...args: unknown[]);
  constructor(args: MimeEntityConstructorArgs);
  constructor(...args: unknown[]) {
    if (args.length === 1 && isConstructorArgs(args[0])) {
      super(args[0]);
      return;
    }
    super('related', ...args);
  }

  get Root(): MimeEntity | null { return this.root; }
  set Root(value: MimeEntity | null) { this.root = value; }
  get root(): MimeEntity | null {
    const index = this.getRootIndex();
    if (index < 0 && this.count === 0)
      return null;
    return this.at(Math.max(index, 0));
  }
  set root(value: MimeEntity | null) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    let index: number;
    if (this.count > 0) {
      index = this.getRootIndex();
      if (index !== -1) {
        this.set(index, value);
      } else {
        this.insert(0, value);
        index = 0;
      }
    } else {
      this.add(value);
      index = 0;
    }
    this.contentType.parameters.set('type', value.contentType.mimeType);
    if (index > 0) {
      if (value.contentId == null || value.contentId.length === 0)
        value.contentId = generateMessageId();
      this.contentType.parameters.set('start', `<${value.contentId}>`);
    } else {
      this.contentType.parameters.remove('start');
    }
  }

  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MultipartRelated');
    visitor.visitMultipartRelated(this);
  }

  override tryGetValue(format: TextFormat): TextPart | null {
    const root = this.root;
    if (root instanceof TextPart)
      return root.isFormat(format) ? root : null;
    if (root instanceof Multipart)
      return root.tryGetValue(format);
    return null;
  }

  containsUri(uri: URL | string): boolean {
    return this.indexOfUri(uri) !== -1;
  }

  indexOfUri(uri: URL | string): number {
    if (uri == null) throw new TypeError('uri cannot be null or undefined');
    this.checkDisposed('MultipartRelated');
    // C# MultipartRelated.IndexOf(Uri): absolute URIs resolve each entity's
    // ContentLocation against its ContentBase (falling back to the
    // multipart's); relative URIs compare ContentLocation directly.
    const text = String(uri);
    const abs = tryParseAbsoluteUrl(text);
    const isCid = abs !== null && abs.protocol === 'cid:';
    for (let index = 0; index < this.count; index++) {
      const entity = this.at(index);
      if (abs !== null) {
        if (isCid) {
          if (entity.contentId === abs.pathname)
            return index;
        } else if (entity.contentLocation != null) {
          const location = String(entity.contentLocation);
          let absolute = tryParseAbsoluteUrl(location);
          if (absolute === null) {
            const base = entity.contentBase ?? this.contentBase;
            if (base == null)
              continue;
            try {
              absolute = new URL(location, String(base));
            } catch {
              continue;
            }
          }
          if (absolute.href === abs.href)
            return index;
        }
      } else if (entity.contentLocation != null && String(entity.contentLocation) === text) {
        return index;
      }
    }
    return -1;
  }

  open(uri: URL | string): Stream {
    const index = this.indexOfUri(uri);
    if (index === -1)
      throw new Error('File not found.');
    const entity = this.at(index);
    if (!(entity instanceof MimePart) || entity.content == null)
      throw new Error('File not found.');
    return entity.content.open();
  }

  openWithInfo(uri: URL | string): { stream: Stream; mimeType: string; charset: string | null } {
    const stream = this.open(uri);
    const part = this.at(this.indexOfUri(uri)) as MimePart;
    return { stream, mimeType: part.contentType.mimeType, charset: part.contentType.charset };
  }

  private getRootIndex(): number {
    const start = this.contentType.parameters.get('start') as string | null;
    if (start != null) {
      const refs = Array.from(enumerateReferences(start));
      const contentId = refs[0] ?? start.replace(/^<|>$/g, '');
      return this.indexOfUri(`cid:${contentId}`);
    }
    const type = this.contentType.parameters.get('type') as string | null;
    if (type == null)
      return -1;
    for (let index = 0; index < this.count; index++) {
      if (this.at(index).contentType.mimeType.toLowerCase() === type.toLowerCase())
        return index;
    }
    return -1;
  }
}


function isConstructorArgs(value: unknown): value is MimeEntityConstructorArgs {
  return typeof value === 'object' && value !== null && 'parserOptions' in value && 'contentType' in value && 'headers' in value;
}

function tryParseAbsoluteUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}
