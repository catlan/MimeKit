// Port of MimeKit/Text/HtmlEntityDecoder.cs (+ HtmlEntityDecoder.g.cs).
// The generated trie tables live in html-entity-data.ts, emitted by
// gates/tools/gen-html-entities.mjs from the C# .g.cs.

import { maxEntityLength, namedEntities, transitionTables } from './html-entity-data.js';

const MaxEntityLength = maxEntityLength;

const INT_MAX = 0x7fffffff;

function binarySearchNextState(transitions: readonly number[], state: number): number {
  // transitions is a flat [from, to, from, to, ...] array sorted ascending by `from`.
  let min = 0;
  let max = transitions.length / 2;

  do {
    const i = min + Math.floor((max - min) / 2);
    const from = transitions[i * 2]!;

    if (state > from) {
      min = i + 1;
    } else if (state < from) {
      max = i;
    } else {
      return transitions[i * 2 + 1]!;
    }
  } while (min < max);

  return -1;
}

/**
 * An HTML entity decoder.
 *
 * Port of MimeKit's HtmlEntityDecoder: push characters one at a time starting
 * with '&', then read the decoded value.
 */
export class HtmlEntityDecoder {
  private readonly pushed: string[] = new Array<string>(MaxEntityLength).fill('\0');
  private readonly states: number[] = new Array<number>(MaxEntityLength).fill(0);
  private semicolon = false;
  private numeric = false;
  private digits = 0;
  private xbase = 0;
  private index = 0;

  private pushNumericEntity(c: string): boolean {
    const cc = c.charCodeAt(0);
    let v: number;

    if (this.xbase === 0) {
      if (c === 'X' || c === 'x') {
        this.states[this.index] = 0;
        this.pushed[this.index] = c;
        this.xbase = 16;
        this.index++;
        return true;
      }

      this.xbase = 10;
    }

    if (cc <= 0x39 /* '9' */) {
      if (cc < 0x30 /* '0' */) return false;
      v = cc - 0x30;
    } else if (this.xbase === 16) {
      if (cc >= 0x61 /* 'a' */) {
        v = cc - 0x61 + 10;
      } else if (cc >= 0x41 /* 'A' */) {
        v = cc - 0x41 + 10;
      } else {
        return false;
      }
    } else {
      return false;
    }

    if (v >= this.xbase) return false;

    let state = this.states[this.index - 1]!;

    // check for overflow
    if (state > Math.floor(INT_MAX / this.xbase)) return false;

    if (state === Math.floor(INT_MAX / this.xbase) && v > INT_MAX % this.xbase) return false;

    state = state * this.xbase + v;
    this.states[this.index] = state;
    this.pushed[this.index] = c;
    this.digits++;
    this.index++;

    return true;
  }

  private pushNamedEntity(c: string): boolean {
    const state = this.states[this.index - 1]!;
    const table = transitionTables[c];

    if (table === undefined) return false;

    const next = binarySearchNextState(table, state);
    if (next === -1) return false;

    this.states[this.index] = next;
    this.pushed[this.index] = c;
    this.index++;

    return true;
  }

  /**
   * Push the specified character into the HTML entity decoder.
   * The first character pushed MUST be the '&' character.
   * Returns true if the character was accepted; otherwise, false.
   */
  push(c: string): boolean {
    if (this.semicolon) return false;

    if (this.index === 0) {
      if (c !== '&')
        throw new RangeError("The first character that is pushed MUST be the '&' character.");

      this.pushed[this.index] = '&';
      this.states[this.index] = 0;
      this.index++;
      return true;
    }

    if (this.index + 1 > MaxEntityLength) return false;

    if (this.index === 1 && c === '#') {
      this.pushed[this.index] = '#';
      this.states[this.index] = 0;
      this.numeric = true;
      this.index++;
      return true;
    }

    this.semicolon = c === ';';

    if (this.numeric) {
      if (c === ';') {
        this.states[this.index] = this.states[this.index - 1]!;
        this.pushed[this.index] = ';';
        this.index++;
        return true;
      }

      return this.pushNumericEntity(c);
    }

    return this.pushNamedEntity(c);
  }

  private pushedString(count: number): string {
    let s = '';
    for (let i = 0; i < count; i++) s += this.pushed[i];
    return s;
  }

  private getNumericEntityValue(): string {
    if (this.digits === 0 || !this.semicolon) return this.pushedString(this.index);

    const state = this.states[this.index - 1]!;

    // the following states are parse errors
    switch (state) {
      case 0x00: return '�'; // REPLACEMENT CHARACTER
      case 0x80: return '€'; // EURO SIGN
      case 0x82: return '‚';
      case 0x83: return 'ƒ';
      case 0x84: return '„';
      case 0x85: return '…';
      case 0x86: return '†';
      case 0x87: return '‡';
      case 0x88: return 'ˆ';
      case 0x89: return '‰';
      case 0x8A: return 'Š';
      case 0x8B: return '‹';
      case 0x8C: return 'Œ';
      case 0x8E: return 'Ž';
      case 0x91: return '‘';
      case 0x92: return '’';
      case 0x93: return '“';
      case 0x94: return '”';
      case 0x95: return '•';
      case 0x96: return '–';
      case 0x97: return '—';
      case 0x98: return '˜';
      case 0x99: return '™';
      case 0x9A: return 'š';
      case 0x9B: return '›';
      case 0x9C: return 'œ';
      case 0x9E: return 'ž';
      case 0x9F: return 'Ÿ';
      case 0x0000b: case 0x0fffe: case 0x1fffe: case 0x1ffff: case 0x2fffe: case 0x2ffff: case 0x3fffe:
      case 0x3ffff: case 0x4fffe: case 0x4ffff: case 0x5fffe: case 0x5ffff: case 0x6fffe: case 0x6ffff:
      case 0x7fffe: case 0x7ffff: case 0x8fffe: case 0x8ffff: case 0x9fffe: case 0x9ffff: case 0xafffe:
      case 0xaffff: case 0xbfffe: case 0xbffff: case 0xcfffe: case 0xcffff: case 0xdfffe: case 0xdffff:
      case 0xefffe: case 0xeffff: case 0xffffe: case 0xfffff: case 0x10fffe: case 0x10ffff:
        // parse error
        return this.pushedString(this.index);
      default:
        if ((state >= 0xd800 && state <= 0xdfff) || state > 0x10ffff) {
          // parse error, emit REPLACEMENT CHARACTER
          return '�';
        }

        if (
          (state >= 0x0001 && state <= 0x0008) ||
          (state >= 0x000d && state <= 0x001f) ||
          (state >= 0x007f && state <= 0x009f) ||
          (state >= 0xfdd0 && state <= 0xfdef)
        ) {
          return this.pushedString(this.index);
        }
        break;
    }

    return String.fromCodePoint(state);
  }

  private getNamedEntityValue(): string {
    let startIndex = this.index;
    let decoded: string | undefined;

    while (startIndex > 0) {
      decoded = namedEntities[this.states[startIndex - 1]!];
      if (decoded !== undefined) break;

      startIndex--;
    }

    if (decoded === undefined) decoded = '';

    if (startIndex < this.index) {
      for (let i = startIndex; i < this.index; i++) decoded += this.pushed[i];
    }

    return decoded;
  }

  /** Get the decoded entity value. */
  getValue(): string {
    return this.numeric ? this.getNumericEntityValue() : this.getNamedEntityValue();
  }

  getPushedInput(): string {
    return this.pushedString(this.index);
  }

  /** Reset the entity decoder. */
  reset(): void {
    this.semicolon = false;
    this.numeric = false;
    this.digits = 0;
    this.xbase = 0;
    this.index = 0;
  }
}
