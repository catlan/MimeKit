export interface MimeFilterResult {
  buffer: Uint8Array;
  index: number;
  length: number;
}

export interface IMimeFilter {
  filter(input: Uint8Array, startIndex: number, length: number): MimeFilterResult;
  flush(input: Uint8Array, startIndex: number, length: number): MimeFilterResult;
  reset(): void;
}
