import { TextFormat } from '../text-part.js';
import { splitLines } from './html-converter-utils.js';
import type { TextWriter } from './text-io.js';
import { TextConverter } from './text-converter.js';

const MaxLineLength = 78;

function unquote(line: string): { line: string; quoteDepth: number } {
  let index = 0;
  let quoteDepth = 0;
  if (line.length === 0 || line[0] !== '>') return { line, quoteDepth };
  do {
    quoteDepth++;
    index++;
    if (index < line.length && line[index] === ' ') index++;
  } while (index < line.length && line[index] === '>');
  return { line: line.substring(index), quoteDepth };
}

function getFlowedLine(line: string, state: { index: number }, quoteDepth: number): string {
  let flowed = quoteDepth > 0 ? '>'.repeat(quoteDepth) : '';
  if (quoteDepth > 0 || (line.length > state.index && line[state.index] === ' ') || line.substring(state.index).startsWith('From '))
    flowed += ' ';
  if (flowed.length + (line.length - state.index) <= MaxLineLength) {
    flowed += line.substring(state.index);
    state.index = line.length;
    return flowed;
  }
  do {
    const nextSpaceRel = line.substring(state.index).indexOf(' ');
    let wordEnd = nextSpaceRel === -1 ? line.length : nextSpaceRel + state.index;
    const softBreak = nextSpaceRel === -1 ? 0 : 2;
    let wordLength = wordEnd - state.index;
    if (flowed.length + wordLength + softBreak <= MaxLineLength) {
      flowed += line.substring(state.index, wordEnd);
      state.index = wordEnd;
    } else if (wordLength > MaxLineLength - (quoteDepth + 1)) {
      wordLength = MaxLineLength - (flowed.length + 1);
      flowed += line.substring(state.index, state.index + wordLength);
      state.index += wordLength;
      break;
    } else {
      break;
    }
    while (flowed.length + 1 < MaxLineLength && state.index < line.length && line[state.index] === ' ')
      flowed += line[state.index++]!;
  } while (state.index < line.length && flowed.length + 1 < MaxLineLength);
  if (state.index < line.length) flowed += ' ';
  return flowed;
}

/**
 * A text to flowed text converter.
 *
 * Converts plain text to the flowed text format described in RFC 3676.
 */
export class TextToFlowed extends TextConverter {
  /** The input format. */
  override get inputFormat(): TextFormat { return TextFormat.Plain; }
  /** The output format. */
  override get outputFormat(): TextFormat { return TextFormat.Flowed; }

  /**
   * Converts the text from the input format to the output format and writes the result.
   *
   * @param text The text to convert.
   * @param writer The text writer.
   * @throws {TypeError} `text` or `writer` is `null` or `undefined`.
   */
  override convertText(text: string, writer: TextWriter): void {
    if (text === null || text === undefined) throw new TypeError('text');
    if (writer === null || writer === undefined) throw new TypeError('writer');
    if (this.header) writer.write(this.header);
    for (const rawLine of splitLines(text)) {
      const trimmed = rawLine.replace(/ +$/g, '');
      const uq = unquote(trimmed);
      const state = { index: 0 };
      do {
        writer.write(getFlowedLine(uq.line, state, uq.quoteDepth));
        writer.write('\n');
      } while (state.index < uq.line.length);
    }
    if (this.footer) writer.write(this.footer);
  }
}
