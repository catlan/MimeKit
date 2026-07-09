import { HeaderList } from './header-list.js';
import { MemoryBlockStream } from './io/memory-block-stream.js';
import { MimeContent } from './mime-content.js';
import { MimePart } from './mime-part.js';
import type { MimeEntityConstructorArgs } from './mime-entity.js';
import type { MimeVisitor } from './mime-visitor.js';

/**
 * A message/feedback-report MIME part.
 *
 * Feedback reports are machine-readable reports describing message feedback
 * such as abuse reports.
 */
export class MessageFeedbackReport extends MimePart {
  private fieldsValue: HeaderList | null = null;

  /** Initializes a new message/feedback-report part. */
  constructor();
  constructor(args: MimeEntityConstructorArgs);
  constructor(args?: MimeEntityConstructorArgs) {
    if (args !== undefined) {
      super(args);
      return;
    }
    super('message', 'feedback-report');
  }

  /** Gets the feedback report fields. */
  get Fields(): HeaderList { return this.fields; }
  /** Gets the feedback report fields. */
  get fields(): HeaderList {
    this.checkDisposed('MessageFeedbackReport');
    if (this.fieldsValue == null) {
      if (this.content == null) {
        this.content = new MimeContent(new MemoryBlockStream());
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
   * Dispatches to the visitor method for feedback report parts.
   *
   * @param visitor The visitor.
   */
  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MessageFeedbackReport');
    visitor.visitMessageFeedbackReport(this);
  }

  private onFieldsChanged(): void {
    const stream = new MemoryBlockStream();
    this.fieldsValue!.writeTo(stream);
    stream.position = 0;
    this.content = new MimeContent(stream);
  }
}
