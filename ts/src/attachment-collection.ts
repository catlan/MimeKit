// Port of MimeKit/AttachmentCollection.cs.
//
// Adaptation notes (wave-3):
//  * The pure-filesystem Add overloads (Add(fileName), Add(fileName, contentType)
//    that open a file) are Node-only and omitted from the isomorphic core;
//    callers pass bytes or a stream instead. The byte-array and stream Add
//    overloads (which C# also provides) are ported faithfully.
//  * The *Async variants are not ported (sync core; plan Q4).
//  * The message/rfc822 code path calls MimeMessage.load, which is deferred to
//    wave-4 (parser); until then that branch throws for real message content.
import { ContentDisposition } from './content-disposition.js';
import { ContentType } from './content-type.js';
import { BestEncodingFilter } from './io/filters/best-encoding-filter.js';
import { MemoryBlockStream } from './io/memory-block-stream.js';
import { MemoryStream, Stream } from './io/stream.js';
import { MessagePart } from './message-part.js';
import { MimeContent } from './mime-content.js';
import { MimeEntity } from './mime-entity.js';
import { MimeMessage } from './mime-message.js';
import { MimePart } from './mime-part.js';
import { getMimeType } from './mime-types.js';
import { TextPart } from './text-part.js';

const BUFFER_LENGTH = 4096;

/**
 * A mutable collection of MIME attachments or linked resources.
 */
export class AttachmentCollection implements Iterable<MimeEntity> {
  private readonly attachments: MimeEntity[] = [];
  private readonly linked: boolean;

  /**
   * Initializes a new attachment collection.
   *
   * @param linkedResources Whether new attachments should be marked as linked resources.
   */
  constructor(linkedResources = false) {
    this.linked = linkedResources;
  }

  /** Gets the number of attachments in the collection. */
  get count(): number {
    return this.attachments.length;
  }

  /** Gets whether this collection is read-only. */
  get isReadOnly(): boolean {
    return false;
  }

  /**
   * Gets the attachment at the specified index.
   *
   * @param index The zero-based index.
   * @returns The attachment.
   */
  at(index: number): MimeEntity {
    if (!Number.isInteger(index) || index < 0 || index >= this.count)
      throw new RangeError('index out of range');
    return this.attachments[index]!;
  }

  /**
   * Replaces the attachment at the specified index.
   *
   * @param index The zero-based index.
   * @param value The replacement attachment.
   */
  set(index: number, value: MimeEntity): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.count)
      throw new RangeError('index out of range');
    if (value == null) throw new TypeError('value cannot be null or undefined');
    this.attachments[index] = value;
  }

  /**
   * Adds an attachment to the collection.
   *
   * @param attachment The attachment entity.
   * @param fileName The file name for a new attachment.
   * @param data Attachment bytes.
   * @param stream Attachment content stream.
   * @param contentType The attachment content type.
   * @returns The created attachment for content overloads.
   */
  add(attachment: MimeEntity): void;
  add(fileName: string, data: Uint8Array): MimeEntity;
  add(fileName: string, stream: Stream): MimeEntity;
  add(fileName: string, data: Uint8Array, contentType: ContentType): MimeEntity;
  add(fileName: string, stream: Stream, contentType: ContentType): MimeEntity;
  add(...args: unknown[]): void | MimeEntity {
    if (args.length === 1) {
      const attachment = args[0];
      if (attachment instanceof MimeEntity) {
        this.attachments.push(attachment);
        return;
      }
      if (attachment == null)
        throw new TypeError('attachment cannot be null or undefined');
      // Add(fileName) opens a file: Node-only overload, omitted from core.
      throw new TypeError('AttachmentCollection.add(fileName) requires the Node filesystem overload (omitted from core).');
    }

    const fileName = args[0];
    const source = args[1];
    const hasContentType = args.length >= 3;
    const contentType = args[2];

    if (fileName == null) throw new TypeError('fileName cannot be null or undefined');
    if (typeof fileName !== 'string') throw new TypeError('fileName must be a string');
    if (fileName.length === 0) throw new TypeError('The specified file path is empty.');

    if (args.length === 2 && source instanceof ContentType) {
      // Add(fileName, contentType) opens a file: Node-only overload, omitted.
      throw new TypeError('AttachmentCollection.add(fileName, contentType) requires the Node filesystem overload (omitted from core).');
    }

    if (source == null) throw new TypeError('data/stream cannot be null or undefined');
    if (hasContentType && contentType == null) throw new TypeError('contentType cannot be null or undefined');
    if (hasContentType && !(contentType instanceof ContentType)) throw new TypeError('contentType must be a ContentType');

    const stream = source instanceof Stream ? source : new MemoryStream(source as Uint8Array);
    const copyStream = source instanceof Stream;
    const type = hasContentType ? (contentType as ContentType) : getMimeContentType(fileName);
    const autoDetected = !hasContentType;

    const attachment = this.createAttachment(type, autoDetected, fileName, stream, copyStream);
    this.attachments.push(attachment);
    return attachment;
  }

  /**
   * Removes all attachments.
   *
   * @param dispose Whether to dispose removed attachments.
   */
  clear(dispose = false): void {
    if (dispose) {
      for (const attachment of this.attachments)
        attachment.dispose();
    }
    this.attachments.length = 0;
  }

  /**
   * Tests whether the collection contains an attachment.
   *
   * @param attachment The attachment to locate.
   * @returns `true` if present; otherwise `false`.
   */
  contains(attachment: MimeEntity): boolean {
    if (attachment == null) throw new TypeError('attachment cannot be null or undefined');
    return this.attachments.includes(attachment);
  }

  /**
   * Copies attachments into an array.
   *
   * @param array The destination array.
   * @param arrayIndex The starting index in `array`.
   */
  copyTo(array: MimeEntity[], arrayIndex: number): void {
    if (array == null) throw new TypeError('array cannot be null or undefined');
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= array.length)
      throw new RangeError('arrayIndex out of range');
    for (let i = 0; i < this.attachments.length; i++)
      array[arrayIndex + i] = this.attachments[i]!;
  }

  /**
   * Gets the index of an attachment.
   *
   * @param attachment The attachment to locate.
   * @returns The zero-based index, or `-1` if not found.
   */
  indexOf(attachment: MimeEntity): number {
    if (attachment == null) throw new TypeError('attachment cannot be null or undefined');
    return this.attachments.indexOf(attachment);
  }

  /**
   * Inserts an attachment at the specified index.
   *
   * @param index The insertion index.
   * @param attachment The attachment to insert.
   */
  insert(index: number, attachment: MimeEntity): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.count)
      throw new RangeError('index out of range');
    if (attachment == null) throw new TypeError('attachment cannot be null or undefined');
    this.attachments.splice(index, 0, attachment);
  }

  /**
   * Removes an attachment.
   *
   * @param attachment The attachment to remove.
   * @returns `true` if removed; otherwise `false`.
   */
  remove(attachment: MimeEntity): boolean {
    if (attachment == null) throw new TypeError('attachment cannot be null or undefined');
    const index = this.attachments.indexOf(attachment);
    if (index === -1) return false;
    this.attachments.splice(index, 1);
    return true;
  }

  /**
   * Removes the attachment at the specified index.
   *
   * @param index The zero-based index.
   */
  removeAt(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.count)
      throw new RangeError('index out of range');
    this.attachments.splice(index, 1);
  }

  /** Returns an iterator over the attachments. */
  [Symbol.iterator](): Iterator<MimeEntity> {
    return this.attachments[Symbol.iterator]();
  }

  private createAttachment(contentType: ContentType, autoDetected: boolean, path: string, stream: Stream, copyStream: boolean): MimeEntity {
    const fileName = getFileName(path);
    let attachment: MimeEntity | null = null;
    let type = contentType;

    if (type.isMimeType('message', 'rfc822')) {
      const position = stream.canSeek ? stream.position : 0;
      const result = MimeMessage.load(stream);
      if (result.ok) {
        if (!copyStream) stream.dispose();
        const part = new MessagePart();
        part.message = result.value;
        attachment = part;
      } else {
        // C#: only a FormatException (here: a parse-error Result) triggers the
        // octet-stream fallback, and only when the content type was auto-detected
        // and the stream is seekable; otherwise the error propagates.
        if (autoDetected && stream.canSeek) {
          type = new ContentType('application', 'octet-stream');
          stream.position = position;
        } else {
          throw new Error(result.error.message);
        }
      }
    }

    if (attachment == null) {
      const part = type.isMimeType('text', '*') ? new TextPart(type) : new MimePart(type);
      AttachmentCollection.loadContent(part, stream, copyStream);
      attachment = part;
    }

    const disposition = new ContentDisposition(this.linked ? ContentDisposition.inline : ContentDisposition.attachment);
    disposition.fileName = fileName;
    attachment.contentDisposition = disposition;
    attachment.contentType.name = fileName;

    if (this.linked)
      attachment.contentLocation = fileName;

    return attachment;
  }

  private static loadContent(attachment: MimePart, stream: Stream, copyStream: boolean): void {
    const content: MemoryBlockStream | null = copyStream ? new MemoryBlockStream() : null;

    try {
      if (attachment.contentType.isMimeType('text', '*')) {
        const buf = new Uint8Array(BUFFER_LENGTH);
        const filter = new BestEncodingFilter();
        let nread: number;

        while ((nread = stream.read(buf, 0, BUFFER_LENGTH)) > 0) {
          filter.filter(buf, 0, nread);
          content?.write(buf, 0, nread);
        }

        filter.flush(buf, 0, 0);

        attachment.contentTransferEncoding = filter.getBestEncoding('7bit');
      } else {
        attachment.contentTransferEncoding = 'base64';

        if (content != null)
          stream.copyTo(content, BUFFER_LENGTH);
      }

      if (content != null)
        content.position = 0;
      else
        stream.position = 0;

      attachment.content = new MimeContent(content ?? stream);
    } catch (ex) {
      attachment.dispose();
      content?.dispose();
      throw ex;
    }
  }
}

function getMimeContentType(fileName: string): ContentType {
  const parsed = ContentType.parse(getMimeType(fileName));
  // getMimeType always returns a well-formed "type/subtype"; parse cannot fail.
  if (!parsed.ok) throw new TypeError(parsed.error.message);
  return parsed.value;
}

// C#: Path.GetFileName using DirectorySeparatorChar; the oracle host is Unix,
// so mirror with '/'. Note the C# quirk: a separator at index 0 keeps the whole
// path (index > 0, not >= 0).
function getFileName(path: string): string {
  const index = path.lastIndexOf('/');
  return index > 0 ? path.substring(index + 1) : path;
}
