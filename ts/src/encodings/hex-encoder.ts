/**
 * Port of MimeKit/Encodings/HexEncoder.cs.
 *
 * Upstream marks this obsolete, but ParameterList still uses it in this port
 * plan's scope.
 */
import type { ContentEncoding } from '../content-encoding.js';
import type { MimeEncoder } from './types.js';
import { validateCodecArguments } from './types.js';

const hexAlphabet = new Uint8Array([0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46]);
const tokenSpecials = new Set([...`()<>@,;:\\"/[]?=`].map((c) => c.charCodeAt(0)));
const attrSpecials = new Set([0x2a, 0x27, 0x25]);

function isAttr(c: number): boolean {
  return c > 32 && c < 127 && !tokenSpecials.has(c) && !attrSpecials.has(c);
}

export class HexEncoder implements MimeEncoder {
  readonly encoding: ContentEncoding = 'default';

  clone(): MimeEncoder {
    return new HexEncoder();
  }

  estimateOutputLength(inputLength: number): number {
    return inputLength * 3;
  }

  encode(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    validateCodecArguments(input, startIndex, length, output, this.estimateOutputLength(length));

    let out = 0;
    const end = startIndex + length;
    for (let i = startIndex; i < end; i++) {
      const c = input[i]!;
      if (isAttr(c)) {
        output[out++] = c;
      } else {
        output[out++] = 0x25;
        output[out++] = hexAlphabet[(c >> 4) & 0x0f]!;
        output[out++] = hexAlphabet[c & 0x0f]!;
      }
    }

    return out;
  }

  flush(input: Uint8Array, startIndex: number, length: number, output: Uint8Array): number {
    return this.encode(input, startIndex, length, output);
  }

  reset(): void {
  }
}
