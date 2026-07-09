import { Multipart } from './multipart.js';
import type { MimeEntityConstructorArgs } from './mime-entity.js';
import type { MimeVisitor } from './mime-visitor.js';
import { TextPart, TextFormat } from './text-part.js';

/**
 * A multipart/alternative MIME entity.
 *
 * The child parts are ordered from least faithful to most faithful
 * representation of the same content.
 */
export class MultipartAlternative extends Multipart {
  /**
   * Initializes a new multipart/alternative entity.
   *
   * @param args Initialization arguments: headers and MIME entities.
   */
  constructor(...args: unknown[]);
  constructor(args: MimeEntityConstructorArgs);
  constructor(...args: unknown[]) {
    if (args.length === 1 && isConstructorArgs(args[0])) {
      super(args[0]);
      return;
    }
    super('alternative', ...args);
  }

  /** Gets the plain text body, if present. */
  get TextBody(): string | null { return this.textBody; }
  /** Gets the plain text body, if present. */
  get textBody(): string | null { return this.getTextBody(TextFormat.Plain); }
  /** Gets the HTML body, if present. */
  get HtmlBody(): string | null { return this.htmlBody; }
  /** Gets the HTML body, if present. */
  get htmlBody(): string | null { return this.getTextBody(TextFormat.Html); }

  /**
   * Dispatches to the visitor method for multipart/alternative entities.
   *
   * @param visitor The visitor.
   */
  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MultipartAlternative');
    visitor.visitMultipartAlternative(this);
  }

  /**
   * Gets the text body in the preferred format.
   *
   * @param format The preferred text format.
   * @returns The body text, or `null` if not available.
   */
  getTextBody(format: TextFormat): string | null {
    const body = this.tryGetValue(format);
    return body == null ? null : MultipartAlternative.getText(body);
  }

  /**
   * Finds the preferred text part for the requested format.
   *
   * @param format The preferred text format.
   * @returns The matching text part, or `null`.
   */
  override tryGetValue(format: TextFormat): TextPart | null {
    for (let i = this.count - 1; i >= 0; i--) {
      const child = this.at(i);
      if (child instanceof Multipart) {
        const body = child.tryGetValue(format);
        if (body != null) return body;
      }
      if (child instanceof TextPart && child.isFormat(format))
        return child;
    }
    return null;
  }

  /**
   * Gets decoded display text from a text part.
   *
   * @param text The text part.
   * @returns The decoded text, with flowed text unwrapped when applicable.
   */
  static getText(text: TextPart): string {
    if (text.isFlowed) {
      const delsp = text.contentType.parameters.get('delsp');
      return flowedToText(text.text, typeof delsp === 'string' && delsp.toLowerCase() === 'yes');
    }
    return text.text;
  }
}

function isConstructorArgs(value: unknown): value is MimeEntityConstructorArgs {
  return typeof value === 'object' && value !== null && 'parserOptions' in value && 'contentType' in value && 'headers' in value;
}

function flowedToText(input: string, deleteSpace: boolean): string {
  const lines = input.split(/\r\n|\n|\r/);
  if (lines.length > 0 && lines[lines.length - 1] === '')
    lines.pop();

  const output: string[] = [];
  let paragraph = '';
  let paragraphQuoteDepth = -1;

  for (const line of lines) {
    const { text, quoteDepth } = unquoteFlowedLine(line);
    let unquoted = text;

    if (quoteDepth === 0 && unquoted.length > 0 && unquoted[0] === ' ')
      unquoted = unquoted.slice(1);

    if (paragraphQuoteDepth === -1) {
      paragraphQuoteDepth = quoteDepth;
    } else if (quoteDepth !== paragraphQuoteDepth) {
      output.push(`${paragraphQuoteDepth > 0 ? `${'>'.repeat(paragraphQuoteDepth)} ` : ''}${paragraph}\n`);
      paragraphQuoteDepth = quoteDepth;
      paragraph = '';
    }

    paragraph += unquoted;

    if (unquoted.length === 0 || unquoted[unquoted.length - 1] !== ' ') {
      output.push(`${paragraphQuoteDepth > 0 ? `${'>'.repeat(paragraphQuoteDepth)} ` : ''}${paragraph}\n`);
      paragraphQuoteDepth = -1;
      paragraph = '';
    } else if (deleteSpace) {
      paragraph = paragraph.slice(0, -1);
    }
  }

  if (paragraph.length > 0)
    output.push(`${paragraphQuoteDepth > 0 ? `${'>'.repeat(paragraphQuoteDepth)} ` : ''}${paragraph}`);

  return output.join('');
}

function unquoteFlowedLine(line: string): { text: string; quoteDepth: number } {
  let index = 0;
  while (index < line.length && line[index] === '>')
    index++;
  const quoteDepth = index;
  if (index > 0 && index < line.length && line[index] === ' ')
    index++;
  return { text: index > 0 ? line.slice(index) : line, quoteDepth };
}
