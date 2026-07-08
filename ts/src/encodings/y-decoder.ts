/**
 * Port of MimeKit/Encodings/YDecoder.cs.
 */
import type { ContentEncoding } from '../content-encoding.js';
import { Crc32 } from '../utils/crc32.js';
import type { MimeDecoder } from './types.js';
import { validateCodecArguments } from './types.js';

const enum YDecoderState {
  ExpectYBegin,
  YBeginEqual,
  YBeginEqualY,
  YBeginEqualYB,
  YBeginEqualYBe,
  YBeginEqualYBeg,
  YBeginEqualYBegi,
  YBeginEqualYBegin,
  ExpectYBeginNewLine,
  ExpectYPartOrPayload,
  YPartEqual,
  YPartEqualY,
  YPartEqualYP,
  YPartEqualYPa,
  YPartEqualYPar,
  YPartEqualYPart,
  ExpectYPartNewLine,
  Payload,
  Ended,
}

export class YDecoder implements MimeDecoder {
  readonly encoding: ContentEncoding = 'default';
  private state: YDecoderState;
  private escaped = false;
  private octet = 0x0a;
  private eoln = true;
  private crc: Crc32;
  private readonly initial: YDecoderState;

  constructor(payloadOnly = false) {
    this.initial = payloadOnly ? YDecoderState.Payload : YDecoderState.ExpectYBegin;
    this.state = this.initial;
    this.crc = new Crc32(-1);
    this.reset();
  }

  get checksum(): number {
    return this.crc.checksum;
  }

  clone(): MimeDecoder {
    const decoder = new YDecoder(this.initial === YDecoderState.Payload);
    decoder.crc = this.crc.clone();
    decoder.escaped = this.escaped;
    decoder.state = this.state;
    decoder.octet = this.octet;
    decoder.eoln = this.eoln;
    return decoder;
  }

  estimateOutputLength(inputLength: number): number {
    return inputLength;
  }

  private scanYBeginMarker(input: Uint8Array, inptr: number, inend: number): number {
    while (inptr < inend) {
      if (this.state === YDecoderState.ExpectYBegin) {
        if (this.octet !== 0x0a) {
          while (inptr < inend && input[inptr] !== 0x0a)
            inptr++;
          if (inptr === inend) {
            this.octet = input[inptr - 1]!;
            break;
          }
          this.octet = input[inptr++]!;
          if (inptr === inend)
            break;
        }

        this.octet = input[inptr++]!;
        if (this.octet !== 0x3d)
          continue;

        this.state = YDecoderState.YBeginEqual;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YBeginEqual) {
        this.octet = input[inptr++]!;
        if (this.octet !== 0x79) {
          this.state = YDecoderState.ExpectYBegin;
          continue;
        }
        this.state = YDecoderState.YBeginEqualY;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YBeginEqualY) {
        this.octet = input[inptr++]!;
        if (this.octet !== 0x62) {
          this.state = YDecoderState.ExpectYBegin;
          continue;
        }
        this.state = YDecoderState.YBeginEqualYB;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YBeginEqualYB) {
        this.octet = input[inptr++]!;
        if (this.octet !== 0x65) {
          this.state = YDecoderState.ExpectYBegin;
          continue;
        }
        this.state = YDecoderState.YBeginEqualYBe;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YBeginEqualYBe) {
        this.octet = input[inptr++]!;
        if (this.octet !== 0x67) {
          this.state = YDecoderState.ExpectYBegin;
          continue;
        }
        this.state = YDecoderState.YBeginEqualYBeg;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YBeginEqualYBeg) {
        this.octet = input[inptr++]!;
        if (this.octet !== 0x69) {
          this.state = YDecoderState.ExpectYBegin;
          continue;
        }
        this.state = YDecoderState.YBeginEqualYBegi;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YBeginEqualYBegi) {
        this.octet = input[inptr++]!;
        if (this.octet !== 0x6e) {
          this.state = YDecoderState.ExpectYBegin;
          continue;
        }
        this.state = YDecoderState.YBeginEqualYBegin;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YBeginEqualYBegin) {
        this.octet = input[inptr++]!;
        if (this.octet !== 0x20) {
          this.state = YDecoderState.ExpectYBegin;
          continue;
        }
        this.state = YDecoderState.ExpectYBeginNewLine;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.ExpectYBeginNewLine) {
        while (inptr < inend && input[inptr] !== 0x0a)
          inptr++;
        if (inptr === inend) {
          this.octet = input[inptr - 1]!;
          break;
        }
        this.state = YDecoderState.ExpectYPartOrPayload;
        this.octet = input[inptr++]!;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.ExpectYPartOrPayload) {
        if (input[inptr] !== 0x3d) {
          this.state = YDecoderState.Payload;
          this.escaped = false;
          this.eoln = true;
          break;
        }

        this.state = YDecoderState.YPartEqual;
        this.octet = input[inptr++]!;
        this.escaped = true;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YPartEqual) {
        if (input[inptr] !== 0x79) {
          this.state = YDecoderState.Payload;
          this.escaped = false;
          this.eoln = true;
          return inptr;
        }
        this.state = YDecoderState.YPartEqualY;
        this.octet = input[inptr++]!;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YPartEqualY) {
        if (input[inptr] === 0x65) {
          this.state = YDecoderState.Ended;
          return inptr;
        }
        if (input[inptr] !== 0x70) {
          this.state = YDecoderState.ExpectYBeginNewLine;
          continue;
        }
        this.state = YDecoderState.YPartEqualYP;
        this.octet = input[inptr++]!;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YPartEqualYP) {
        if (input[inptr] !== 0x61) {
          this.state = YDecoderState.ExpectYBeginNewLine;
          continue;
        }
        this.state = YDecoderState.YPartEqualYPa;
        this.octet = input[inptr++]!;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YPartEqualYPa) {
        if (input[inptr] !== 0x72) {
          this.state = YDecoderState.ExpectYBeginNewLine;
          continue;
        }
        this.state = YDecoderState.YPartEqualYPar;
        this.octet = input[inptr++]!;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YPartEqualYPar) {
        if (input[inptr] !== 0x74) {
          this.state = YDecoderState.ExpectYBeginNewLine;
          continue;
        }
        this.state = YDecoderState.YPartEqualYPart;
        this.octet = input[inptr++]!;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.YPartEqualYPart) {
        if (input[inptr] !== 0x20) {
          this.state = YDecoderState.ExpectYBeginNewLine;
          continue;
        }
        this.state = YDecoderState.ExpectYPartNewLine;
        this.octet = input[inptr++]!;
        if (inptr === inend)
          break;
      }

      if (this.state === YDecoderState.ExpectYPartNewLine) {
        while (inptr < inend && input[inptr] !== 0x0a)
          inptr++;
        if (inptr === inend) {
          this.octet = input[inptr - 1]!;
          break;
        }
        this.state = YDecoderState.Payload;
        this.octet = input[inptr++]!;
        this.escaped = false;
        this.eoln = true;
        break;
      }
    }

    return inptr;
  }

  decode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));

    let inptr = startIndex;
    const inend = startIndex + length;
    let out = 0;

    if (this.state < YDecoderState.Payload) {
      inptr = this.scanYBeginMarker(input, inptr, inend);
      if (inptr === inend)
        return 0;
    }

    if (this.state === YDecoderState.Ended)
      return 0;

    while (inptr < inend) {
      this.octet = input[inptr++]!;

      if (this.octet === 0x0d) {
        this.escaped = false;
        continue;
      }

      if (this.octet === 0x0a) {
        this.escaped = false;
        this.eoln = true;
        continue;
      }

      if (this.escaped) {
        if (this.eoln && this.octet === 0x79) {
          this.state = YDecoderState.Ended;
          break;
        }

        this.escaped = false;
        this.eoln = false;
        this.octet = (this.octet - 64) & 0xff;
      } else if (this.octet === 0x3d) {
        this.escaped = true;
        continue;
      } else {
        this.eoln = false;
      }

      this.octet = (this.octet - 42) & 0xff;
      this.crc.update(this.octet);
      output[out++] = this.octet;
    }

    return out;
  }

  reset(): void {
    this.octet = 0x0a;
    this.state = this.initial;
    this.escaped = false;
    this.eoln = true;
    this.crc.reset();
  }
}
