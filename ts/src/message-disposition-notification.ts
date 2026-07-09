import { HeaderList } from './header-list.js';
import { MemoryStream } from './io/stream.js';
import { MimeContent } from './mime-content.js';
import { MimePart } from './mime-part.js';
import type { MimeEntityConstructorArgs } from './mime-entity.js';
import type { MimeVisitor } from './mime-visitor.js';

/**
 * A message/disposition-notification MIME part.
 *
 * Disposition notifications are machine-readable reports denoting the
 * disposition of a message after successful delivery.
 */
export class MessageDispositionNotification extends MimePart {
  private fieldsValue: HeaderList | null = null;

  /** Initializes a new message/disposition-notification part. */
  constructor();
  constructor(args: MimeEntityConstructorArgs);
  constructor(args?: MimeEntityConstructorArgs) {
    if (args !== undefined) {
      super(args);
      return;
    }
    super('message', 'disposition-notification');
  }

  /** Gets the disposition notification fields. */
  get Fields(): HeaderList { return this.fields; }
  /** Gets the disposition notification fields. */
  get fields(): HeaderList {
    this.checkDisposed('MessageDispositionNotification');
    if (this.fieldsValue == null) {
      if (this.content == null) {
        this.content = new MimeContent(new MemoryStream());
        this.fieldsValue = new HeaderList();
      } else {
        const stream = this.content.open();
        const result = HeaderList.load(stream, this.headers.options);
        this.fieldsValue = result.ok ? result.value : new HeaderList();
        stream.dispose();
      }
      this.fieldsValue.onChanged = () => this.onFieldsChanged();
    }
    return this.fieldsValue;
  }

  /**
   * Dispatches to the visitor method for disposition notification parts.
   *
   * @param visitor The visitor.
   */
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
