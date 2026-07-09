import { TextFormat } from '../text-part.js';
import { HtmlAttributeId } from './html-attribute-id.js';
import { HtmlTagId } from './html-tag-id.js';
import { HtmlTokenKind } from './html-token-kind.js';
import { HtmlDataToken, HtmlTagToken } from './html-token.js';
import { HtmlTokenizer } from './html-tokenizer.js';
import { TextPreviewer } from './text-previewer.js';

function isWhiteSpace(c: string): boolean {
  const code = c.charCodeAt(0);
  return /\s/.test(c) || (code >= 0x200b && code <= 0x200d);
}

function append(preview: string[], max: number, value: string, state: { lwsp: boolean }): boolean {
  let i = 0;
  for (; i < value.length && preview.length < max; i++) {
    if (isWhiteSpace(value[i]!)) {
      if (!state.lwsp) {
        preview.push(' ');
        state.lwsp = true;
      }
    } else {
      preview.push(value[i]!);
      state.lwsp = false;
    }
  }
  if (i < value.length) {
    if (state.lwsp) preview.pop();
    if (preview.length > 0) preview[preview.length - 1] = '\u2026';
    state.lwsp = false;
    return true;
  }
  return false;
}

class PreviewTagContext {
  listIndex = 0;
  suppressInnerContent = false;
  constructor(readonly tagId: HtmlTagId) {}
}

function pop(stack: PreviewTagContext[], id: HtmlTagId): void {
  for (let i = stack.length; i > 0; i--) {
    if (stack[i - 1]!.tagId === id) {
      stack.splice(i - 1, 1);
      break;
    }
  }
}

function shouldSuppressInnerContent(id: HtmlTagId): boolean {
  switch (id) {
  case HtmlTagId.OL:
  case HtmlTagId.Script:
  case HtmlTagId.Style:
  case HtmlTagId.Table:
  case HtmlTagId.TBody:
  case HtmlTagId.THead:
  case HtmlTagId.TR:
  case HtmlTagId.UL:
    return true;
  default:
    return false;
  }
}

function suppressContent(stack: PreviewTagContext[]): boolean {
  const lastIndex = stack.length - 1;
  return lastIndex >= 0 && stack[lastIndex]!.suppressInnerContent;
}

function getListItemContext(stack: PreviewTagContext[]): PreviewTagContext | null {
  for (let i = stack.length; i > 0; i--) {
    const ctx = stack[i - 1]!;
    if (ctx.tagId === HtmlTagId.OL || ctx.tagId === HtmlTagId.UL) return ctx;
  }
  return null;
}

/** A text previewer for HTML content. */
export class HtmlTextPreviewer extends TextPreviewer {
  /** The input format. */
  override get inputFormat(): TextFormat { return TextFormat.Html; }

  /**
   * Gets a text preview of a string of HTML text.
   *
   * @param text The original HTML text.
   * @returns A shortened preview of the original text.
   */
  protected override getPreviewTextCore(text: string): string {
    const tokenizer = new HtmlTokenizer(text);
    tokenizer.ignoreTruncatedTagsEnabled = true;
    const preview: string[] = [];
    const stack: PreviewTagContext[] = [];
    const state = { lwsp: true };
    let prefix = '';
    let body = false;
    let full = false;

    for (let token = tokenizer.readNextToken(); !full && token !== null; token = tokenizer.readNextToken()) {
      switch (token.kind) {
      case HtmlTokenKind.Tag: {
        const tag = token as HtmlTagToken;
        if (!tag.isEndTag) {
          if (body) {
            switch (tag.id) {
            case HtmlTagId.Image: {
              const attr = tag.attributes.tryGetValue(HtmlAttributeId.Alt);
              if (attr !== null) {
                full = append(preview, this.maximumPreviewLength, prefix + (attr.value ?? ''), state);
                prefix = '';
              }
              break;
            }
            case HtmlTagId.LI: {
              const ctx = getListItemContext(stack);
              if (ctx !== null) {
                if (ctx.tagId === HtmlTagId.OL) {
                  full = append(preview, this.maximumPreviewLength, ` ${++ctx.listIndex}. `, state);
                  prefix = '';
                } else {
                  prefix = ' ';
                }
              }
              break;
            }
            case HtmlTagId.Br:
            case HtmlTagId.P:
              prefix = ' ';
              break;
            }
            if (!tag.isEmptyElement) {
              const ctx = new PreviewTagContext(tag.id);
              ctx.suppressInnerContent = shouldSuppressInnerContent(tag.id);
              stack.push(ctx);
            }
          } else if (tag.id === HtmlTagId.Body && !tag.isEmptyElement) {
            body = true;
          }
        } else if (tag.id === HtmlTagId.Body) {
          stack.length = 0;
          body = false;
        } else {
          pop(stack, tag.id);
        }
        break;
      }
      case HtmlTokenKind.Data:
        if (body && !suppressContent(stack)) {
          full = append(preview, this.maximumPreviewLength, prefix + (token as HtmlDataToken).data, state);
          prefix = '';
        }
        break;
      }
    }

    if (state.lwsp && preview.length > 0) preview.pop();
    return preview.join('');
  }
}
