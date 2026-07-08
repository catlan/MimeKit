import { HeaderListCollection } from './header-list-collection.js';
import { MemoryStream } from './io/stream.js';
import { MimeContent } from './mime-content.js';
import { MimePart } from './mime-part.js';
import type { MimeEntityConstructorArgs } from './mime-entity.js';
import type { MimeVisitor } from './mime-visitor.js';

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
    if (this.groupsValue == null) {
      if (this.content == null) {
        this.content = new MimeContent(new MemoryStream());
        this.groupsValue = new HeaderListCollection();
      } else {
        // deferred(wave-4): HeaderList.Load/MimeParser status-group parsing.
        this.groupsValue = new HeaderListCollection();
      }
      this.groupsValue.onChanged = () => this.onGroupsChanged();
    }
    return this.groupsValue;
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
