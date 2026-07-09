import { MimeFilterBase } from '../io/filters/mime-filter-base.js';
import type { MimeFilterResult } from '../io/filters/mime-filter.js';
import { Crc32 } from '../utils/crc32.js';
import { RtfCompressionMode } from './rtf-compression-mode.js';

const DICTIONARY_INITIALIZER_TEXT = '{\\rtf1\\ansi\\mac\\deff0\\deftab720{\\fonttbl;}'
  + '{\\f0\\fnil \\froman \\fswiss \\fmodern \\fscript \\fdecor MS Sans SerifSymbolArialTimes New RomanCourier'
  + '{\\colortbl\\red0\\green0\\blue0\r\n\\par \\pard\\plain\\f0\\fs20\\b\\i\\u\\tab\\tx';
const DICTIONARY_INITIALIZER = new TextEncoder().encode(DICTIONARY_INITIALIZER_TEXT);

type State = 'compressedSize' | 'uncompressedSize' | 'magic' | 'crc32' | 'beginControlRun' | 'readControlOffset' | 'processControl' | 'readLiteral' | 'complete';

export class RtfCompressedToRtf extends MimeFilterBase {
  compressionMode: number = RtfCompressionMode.Unknown;
  private readonly dict = new Uint8Array(4096);
  private readonly crc32 = new Crc32();
  private state: State = 'compressedSize';
  private uncompressedSize = 0;
  private compressedSize = 0;
  private dictWriteOffset = 0;
  private dictReadOffset = 0;
  private dictEndOffset = 0;
  private flagCount = 0;
  private flags = 0;
  private checksum = 0;
  private saved = 0;
  private size = 0;

  constructor() {
    super();
    this.resetDictionary();
  }

  get isValidCrc32(): boolean {
    return this.crc32.checksum === (this.checksum >>> 0);
  }

  protected override filterInternal(input: Uint8Array, startIndex: number, length: number, _flush: boolean): MimeFilterResult {
    const endIndex = startIndex + length;
    let index = startIndex;

    const read = (): { ok: true; value: number } | { ok: false } => {
      if (index === endIndex) return { ok: false };
      let nread = (this.saved >>> 24) & 0xff;
      this.saved &= 0x00ffffff;
      while (nread < 4 && index < endIndex) {
        this.saved |= input[index++]! << (8 * nread);
        nread++;
      }
      if (nread === 4) {
        const value = this.saved | 0;
        this.saved = 0;
        return { ok: true, value };
      }
      this.saved |= nread << 24;
      return { ok: false };
    };

    if (this.state === 'compressedSize') {
      const r = read(); if (!r.ok) return { buffer: input, index: 0, length: 0 };
      this.compressedSize = r.value - 12;
      this.state = 'uncompressedSize';
    }
    if (this.state === 'uncompressedSize') {
      const r = read(); if (!r.ok) return { buffer: input, index: 0, length: 0 };
      this.uncompressedSize = r.value;
      this.state = 'magic';
    }
    if (this.state === 'magic') {
      const r = read(); if (!r.ok) return { buffer: input, index: 0, length: 0 };
      this.compressionMode = r.value;
      this.state = 'crc32';
    }
    if (this.state === 'crc32') {
      const r = read(); if (!r.ok) return { buffer: input, index: 0, length: 0 };
      this.checksum = r.value >>> 0;
      this.state = 'beginControlRun';
    }

    if (this.compressionMode !== RtfCompressionMode.Compressed) {
      this.crc32.update(input, index, endIndex - index);
      const outputLength = Math.max(Math.min(endIndex - index, this.compressedSize - this.size), 0);
      this.size += outputLength;
      return { buffer: input, index, length: outputLength };
    }

    const extra = Math.abs(this.uncompressedSize - this.compressedSize);
    let output = this.ensureOutputSize(Math.max((endIndex - index) + extra, 4096), false);
    let outputLength = 0;

    while (index < endIndex && this.state !== 'complete') {
      let value = input[index++]!;
      this.crc32.update(value);
      this.size++;
      switch (this.state) {
      case 'beginControlRun':
        this.flags = value;
        this.flagCount = 1;
        this.state = (this.flags & 1) !== 0 ? 'readControlOffset' : 'readLiteral';
        break;
      case 'readLiteral':
        output = this.ensureOutputSize(outputLength + 1, true);
        output[outputLength++] = value;
        this.dict[this.dictWriteOffset++] = value;
        this.dictEndOffset = Math.max(this.dictWriteOffset, this.dictEndOffset);
        this.dictWriteOffset %= 4096;
        this.nextFlag();
        break;
      case 'readControlOffset':
        this.state = 'processControl';
        this.dictReadOffset = value;
        break;
      case 'processControl': {
        this.dictReadOffset = ((this.dictReadOffset << 4) | (value >> 4)) & 0xffff;
        const controlLength = (value & 0x0f) + 2;
        if (this.dictReadOffset === this.dictWriteOffset) {
          this.state = 'complete';
          break;
        }
        output = this.ensureOutputSize(outputLength + controlLength, true);
        const controlEnd = this.dictReadOffset + controlLength;
        while (this.dictReadOffset < controlEnd) {
          value = this.dict[this.dictReadOffset++ % 4096]!;
          output[outputLength++] = value;
          this.dict[this.dictWriteOffset++] = value;
          this.dictEndOffset = Math.max(this.dictWriteOffset, this.dictEndOffset);
          this.dictWriteOffset %= 4096;
        }
        this.nextFlag();
        break;
      }
      }
    }

    return { buffer: output, index: 0, length: outputLength };
  }

  override reset(): void {
    this.resetDictionary();
    this.state = 'compressedSize';
    this.dictReadOffset = 0;
    this.compressedSize = 0;
    this.uncompressedSize = 0;
    this.compressionMode = RtfCompressionMode.Unknown;
    this.crc32.reset();
    this.flagCount = 0;
    this.checksum = 0;
    this.flags = 0;
    this.saved = 0;
    this.size = 0;
    super.reset();
  }

  private resetDictionary(): void {
    this.dict.fill(0);
    this.dict.set(DICTIONARY_INITIALIZER, 0);
    this.dictEndOffset = this.dictWriteOffset = DICTIONARY_INITIALIZER.length;
  }

  private nextFlag(): void {
    if ((this.flagCount++ % 8) !== 0) {
      this.flags >>= 1;
      this.state = (this.flags & 1) !== 0 ? 'readControlOffset' : 'readLiteral';
    } else {
      this.state = 'beginControlRun';
    }
  }
}
