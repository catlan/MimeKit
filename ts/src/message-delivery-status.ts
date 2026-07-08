import { HeaderId } from './header-id.js';
import { HeaderListCollection } from './header-list-collection.js';
import type { MimeContent as MimeContentType } from './mime-content.js';
import { MemoryStream } from './io/stream.js';
import { MimeContent } from './mime-content.js';
import { newMimeParser } from './parser-hook.js';
import { MimePart } from './mime-part.js';
import type { MimeEntityConstructorArgs } from './mime-entity.js';
import type { MimeVisitor } from './mime-visitor.js';
import { tryParse as tryParseContentEncoding } from './utils/mime-utils.js';

export class MessageDeliveryStatus extends MimePart {
  private groupsValue: HeaderListCollection | null = null;

  constructor();
  constructor(args: MimeEntityConstructorArgs);
  constructor(args?: MimeEntityConstructorArgs) {
    if (args !== undefined) {
      super(args);
      return;
    }
    super('message', 'delivery-status');
  }

  get StatusGroups(): HeaderListCollection { return this.statusGroups; }
  get statusGroups(): HeaderListCollection {
    this.checkDisposed('MessageDeliveryStatus');
    if (this.groupsValue == null) {
      if (this.content == null) {
        this.content = new MimeContent(new MemoryStream());
        this.groupsValue = new HeaderListCollection();
      } else {
        this.groupsValue = this.parseStatusGroups(this.content);
      }
      this.groupsValue.onChanged = () => this.onGroupsChanged();
    }
    return this.groupsValue;
  }

  /**
   * C#: MessageDeliveryStatus.ParseStatusGroups. Per rfc3464 the content is a
   * sequence of status groups (blocks of header/value pairs) separated by blank
   * lines. We parse successive header blocks via the MIME parser and drop empty
   * blocks (equivalent to the C# parser's leading blank-line skip).
   */
  private parseStatusGroups(content: MimeContentType): HeaderListCollection {
    const groups = new HeaderListCollection();

    try {
      const stream = content.open();
      const parser = newMimeParser(this.headers.options, stream, 'entity');

      while (!parser.isEndOfStream) {
        const result = parser.parseHeaders();
        if (!result.ok) break;

        const fields = result.value;
        if (fields.count === 0) continue;

        groups.add(fields);

        // Note: Office365 sometimes base64-encodes everything after the first
        // status group (issue #250). If a group carries a Content-Transfer-Encoding
        // that actually encodes the remainder, stop — decoding that tail is
        // deferred (not present in the messages/ corpus).
        const header = fields.tryGetHeader(HeaderId.ContentTransferEncoding);
        if (header !== null) {
          const enc = tryParseContentEncoding(header.value);
          if (enc.ok && enc.value !== '7bit' && enc.value !== '8bit' && enc.value !== 'binary' && enc.value !== 'default')
            break;
        }
      }

      stream.dispose();
    } catch {
      // FormatException — leave the groups parsed so far (matches C#).
    }

    return groups;
  }

  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MessageDeliveryStatus');
    visitor.visitMessageDeliveryStatus(this);
  }

  private onGroupsChanged(): void {
    const stream = new MemoryStream();
    for (const group of this.groupsValue!)
      group.writeTo(stream);
    stream.position = 0;
    this.content?.dispose();
    this.content = new MimeContent(stream);
  }
}
