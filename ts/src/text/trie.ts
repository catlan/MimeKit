class TrieState {
  next: TrieState | null = null;
  fail: TrieState | null;
  match: TrieMatch | null = null;
  pattern: string | null = null;
  depth = 0;

  constructor(fail: TrieState | null) {
    this.fail = fail;
  }
}

class TrieMatch {
  constructor(
    readonly value: string,
    readonly next: TrieMatch | null,
    readonly state: TrieState,
  ) {}
}

function validateRange(text: string, startIndex: number, count: number): void {
  if (text === null || text === undefined) throw new TypeError('text');
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > text.length) throw new RangeError('startIndex');
  if (!Number.isInteger(count) || count < 0 || count > text.length - startIndex) throw new RangeError('count');
}

function lowerChar(c: string): string {
  return c.toLowerCase();
}

/** The result of searching an Aho-Corasick trie. */
export interface TrieSearchResult {
  /** The first index of a matched pattern, or `-1` if no pattern matched. */
  index: number;
  /** The pattern that matched, or `null` if no pattern matched. */
  pattern: string | null;
}

/** An Aho-Corasick trie graph. */
export class Trie {
  private readonly failStates: Array<TrieState | null> = [];
  private readonly root = new TrieState(null);
  private readonly ignoreCase: boolean;

  /**
   * Creates a new trie.
   *
   * @param ignoreCase `true` if searching should ignore case; otherwise, `false`.
   */
  constructor(ignoreCase = false) {
    this.ignoreCase = ignoreCase;
  }

  private static findMatch(state: TrieState, value: string): TrieMatch | null {
    let match = state.match;
    while (match !== null && match.value !== value) match = match.next;
    return match;
  }

  private insert(state: TrieState, depth: number, value: string): TrieState {
    const inserted = new TrieState(this.root);
    state.match = new TrieMatch(value, state.match, inserted);

    if (this.failStates.length < depth + 1) this.failStates.push(null);

    inserted.next = this.failStates[depth] ?? null;
    this.failStates[depth] = inserted;

    return inserted;
  }

  /**
   * Adds a search pattern.
   *
   * @param pattern The search pattern.
   * @throws {TypeError} `pattern` is `null`, `undefined`, or an empty string.
   */
  add(pattern: string): void {
    if (pattern === null || pattern === undefined) throw new TypeError('pattern');
    if (pattern.length === 0) throw new TypeError('The pattern cannot be empty.');

    let state: TrieState = this.root;
    let depth = 0;

    for (let i = 0; i < pattern.length; i++) {
      const c = this.ignoreCase ? lowerChar(pattern[i]!) : pattern[i]!;
      const match = Trie.findMatch(state, c);
      state = match === null ? this.insert(state, depth, c) : match.state;
      depth++;
    }

    state.pattern = pattern;
    state.depth = depth;

    for (let i = 0; i < this.failStates.length; i++) {
      let failStateList = this.failStates[i];

      while (failStateList !== null) {
        let match = failStateList.match;
        while (match !== null) {
          const matchedState = match.state;
          let failState = failStateList.fail;
          let nextMatch: TrieMatch | null = null;
          const c = match.value;

          while (failState !== null && (nextMatch = Trie.findMatch(failState, c)) === null)
            failState = failState.fail;

          if (failState !== null) {
            matchedState.fail = nextMatch!.state;
            if (matchedState.fail.depth > matchedState.depth)
              matchedState.depth = matchedState.fail.depth;
          } else {
            nextMatch = Trie.findMatch(this.root, c);
            matchedState.fail = nextMatch !== null ? nextMatch.state : this.root;
          }

          match = match.next;
        }

        failStateList = failStateList.next;
      }
    }
  }

  /**
   * Searches text for any of the patterns added to the trie.
   *
   * @param text The text to search.
   * @param startIndex The starting index of the text.
   * @param count The number of characters to search, starting at `startIndex`.
   * @returns The first index of a matched pattern and the pattern that matched.
   * @throws {TypeError} `text` is `null` or `undefined`.
   * @throws {RangeError} `startIndex` and `count` do not specify a valid range in `text`.
   */
  search(text: string, startIndex = 0, count = text?.length - startIndex): TrieSearchResult {
    validateRange(text, startIndex, count);

    const endIndex = Math.min(text.length, startIndex + count);
    let state: TrieState | null = this.root;
    let matched = 0;
    let offset = -1;
    let pattern: string | null = null;

    for (let i = startIndex; i < endIndex; i++) {
      const c = this.ignoreCase ? lowerChar(text[i]!) : text[i]!;
      let match: TrieMatch | null = null;

      while (state !== null && (match = Trie.findMatch(state, c)) === null && matched === 0)
        state = state.fail;

      if (state === this.root) {
        if (matched > 0) return { index: offset, pattern };
        offset = i;
      }

      if (state === null) {
        if (matched > 0) return { index: offset, pattern };
        state = this.root;
        offset = i;
      } else if (match !== null) {
        state = match.state;

        if (state.depth > matched) {
          pattern = state.pattern;
          matched = state.depth;
        }
      } else if (matched > 0) {
        return { index: offset, pattern };
      }
    }

    return matched > 0 ? { index: offset, pattern } : { index: -1, pattern: null };
  }
}
