import { HeaderList } from './header-list.js';
import { MemoryStream } from './io/stream.js';
import { MimeContent } from './mime-content.js';
import { MimePart } from './mime-part.js';
import type { MimeEntityConstructorArgs } from './mime-entity.js';
import type { MimeVisitor } from './mime-visitor.js';

export class MessageDispositionNotification extends MimePart {
  private fieldsValue: HeaderList | null = null;

  constructor();
  constructor(args: MimeEntityConstructorArgs);
  constructor(args?: MimeEntityConstructorArgs) {
    if (args !== undefined) {
      super(args);
      return;
    }
    super('message', 'disposition-notification');
  }

  get Fields(): HeaderList { return this.fields; }
  get fields(): HeaderList {
    if (this.fieldsValue == null) {
      if (this.content == null) {
        this.content = new MimeContent(new MemoryStream());
        this.fieldsValue = new HeaderList();
      } else {
        // deferred(wave-4): HeaderList.Load from content stream.
        this.fieldsValue = new HeaderList();
      }
      this.fieldsValue.onChanged = () => this.onFieldsChanged();
    }
    return this.fieldsValue;
  }

  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MessageDispositionNotification');
    visitor.visitMessageDispositionNotification(this);
  }

  private onFieldsChanged(): void {
    const stream = new MemoryStream();
    this.fieldsValue!.writeTo(stream);
    stream.position = 0;
    this.content = new MimeContent(stream);
  }
}
