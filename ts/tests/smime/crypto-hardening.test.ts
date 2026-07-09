// Regression tests for the C4 security-review hardening fixes.

import { describe, expect, test } from 'vitest';
import { tripleDesCbcDecrypt, tripleDesCbcEncrypt } from '../../src/smime/crypto/des.js';
import { rc2CbcDecrypt } from '../../src/smime/crypto/rc2.js';
import { buildCompressedData, decompressCompressedData } from '../../src/smime/crypto/cms-compressed.js';

describe('S/MIME crypto hardening', () => {
  test('CBC ciphers reject a wrong-length IV', () => {
    const key = new Uint8Array(24);
    const block = new Uint8Array(8);
    const shortIv = new Uint8Array(4);
    const longIv = new Uint8Array(16);
    const okIv = new Uint8Array(8);
    expect(() => tripleDesCbcDecrypt(key, shortIv, block)).toThrow(RangeError);
    expect(() => tripleDesCbcEncrypt(key, longIv, block)).toThrow(RangeError);
    expect(() => rc2CbcDecrypt(new Uint8Array(16), 128, shortIv, block)).toThrow(RangeError);
    // A correct 8-byte IV is accepted.
    expect(() => tripleDesCbcEncrypt(key, okIv, block)).not.toThrow();
  });

  test('CompressedData inflation is bounded (decompression-bomb guard)', async () => {
    // ~1 MiB of zeros compresses to a tiny part but would inflate past a small cap.
    const content = new Uint8Array(1024 * 1024);
    const der = await buildCompressedData(content);
    expect(der.length).toBeLessThan(content.length); // it really did compress
    await expect(decompressCompressedData(der, 4096)).rejects.toThrow(/decompression bomb/i);
    // Within the cap it round-trips.
    const out = await decompressCompressedData(der, 2 * 1024 * 1024);
    expect(out.length).toBe(content.length);
  });
});
