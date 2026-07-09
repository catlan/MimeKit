import { describe, expect, test } from 'vitest';
import { Trie } from '../../src/index.js';

const TriePatterns = ['news://', 'nntp://', 'telnet://', 'file://', 'ftp://', 'http://', 'https://', 'http://www.', 'www.', 'ftp.', 'mailto:', '@'];
const TestCases = [
  'apple developer portal is at http://developer.apple.com',
  'make sure greedy matching works http://www.xamarin.com',
  'or, feel free to email me at jeff@xamarin.com',
  "don't forget to check out www.xamarin.com",
  "I've attached a file (file:///cvs/gmime/gmime/gtrie.c)",
];

describe('TrieTests', () => {
  test('TestArgumentExceptions', () => {
    const text = TestCases[0]!;
    const trie = new Trie();
    expect(() => trie.add(null as unknown as string)).toThrow(TypeError);
    expect(() => trie.add('')).toThrow(TypeError);
    for (const pattern of TriePatterns) trie.add(pattern);
    expect(() => trie.search(null as unknown as string)).toThrow(TypeError);
    expect(() => trie.search(text, -1)).toThrow(RangeError);
    expect(() => trie.search(text, 0, -1)).toThrow(RangeError);
  });

  test('TestTrie', () => {
    const trie = new Trie(true);
    for (const pattern of TriePatterns) trie.add(pattern);
    for (const input of TestCases) {
      const result = trie.search(input);
      expect(result.index).not.toBe(-1);
      expect(input.substring(result.index).toLowerCase().startsWith(result.pattern!.toLowerCase())).toBe(true);
    }
  });
});
