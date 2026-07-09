// DES / Triple-DES (EDE) in ECB + CBC.
//
// WebCrypto has no DES and none of @noble/{hashes,curves} ship it, but the
// MimeKit S/MIME test PKCS#12 files use the classic
// pbeWithSHAAnd3-KeyTripleDES-CBC key protection (RFC 7292), so a userland
// implementation is required to import them. This is a straight port of the
// FIPS 46-3 DES with the standard permutation/S-box tables; it runs unchanged
// in Node and the browser (no node:crypto).

/* eslint-disable no-bitwise */

// Initial permutation.
const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
  62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
  57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
  61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
];

// Final permutation (inverse of IP).
const FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
  38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
  36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
  34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25,
];

// Expansion (32 -> 48).
const E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11,
  12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19, 20, 21, 20, 21,
  22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];

// Permutation after the S-boxes.
const P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
  2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25,
];

// Permuted choice 1 (64 -> 56).
const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18,
  10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
  63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22,
  14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
];

// Permuted choice 2 (56 -> 48).
const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10,
  23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2,
  41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48,
  44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];

const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

const S = [
  [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11],
];

// Read `count` bits (MSB-first) out of a byte array as a number.
function permute(input: number[], table: number[]): number[] {
  const out = new Array<number>(table.length);
  for (let i = 0; i < table.length; i++) out[i] = input[table[i]! - 1]!;
  return out;
}

function bytesToBits(bytes: Uint8Array, offset: number): number[] {
  const bits = new Array<number>(64);
  for (let i = 0; i < 8; i++) {
    const b = bytes[offset + i]!;
    for (let j = 0; j < 8; j++) bits[i * 8 + j] = (b >> (7 - j)) & 1;
  }
  return bits;
}

function bitsToBytes(bits: number[]): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j]!;
    out[i] = b;
  }
  return out;
}

function generateSubKeys(key: Uint8Array, offset: number): number[][] {
  const keyBits = bytesToBits(key, offset);
  const permuted = permute(keyBits, PC1);
  let c = permuted.slice(0, 28);
  let d = permuted.slice(28, 56);
  const subKeys: number[][] = [];

  for (let round = 0; round < 16; round++) {
    const shift = SHIFTS[round]!;
    c = c.slice(shift).concat(c.slice(0, shift));
    d = d.slice(shift).concat(d.slice(0, shift));
    subKeys.push(permute(c.concat(d), PC2));
  }

  return subKeys;
}

function feistel(rBits: number[], subKey: number[]): number[] {
  const expanded = permute(rBits, E);
  const xored = new Array<number>(48);
  for (let i = 0; i < 48; i++) xored[i] = expanded[i]! ^ subKey[i]!;

  const sboxOut = new Array<number>(32);
  for (let box = 0; box < 8; box++) {
    const base = box * 6;
    const row = (xored[base]! << 1) | xored[base + 5]!;
    const col = (xored[base + 1]! << 3) | (xored[base + 2]! << 2) | (xored[base + 3]! << 1) | xored[base + 4]!;
    const val = S[box]![row * 16 + col]!;
    for (let j = 0; j < 4; j++) sboxOut[box * 4 + j] = (val >> (3 - j)) & 1;
  }

  return permute(sboxOut, P);
}

function desBlock(bytes: Uint8Array, offset: number, subKeys: number[][], decrypt: boolean): Uint8Array {
  const bits = permute(bytesToBits(bytes, offset), IP);
  let l = bits.slice(0, 32);
  let r = bits.slice(32, 64);

  for (let round = 0; round < 16; round++) {
    const subKey = subKeys[decrypt ? 15 - round : round]!;
    const f = feistel(r, subKey);
    const newR = new Array<number>(32);
    for (let i = 0; i < 32; i++) newR[i] = l[i]! ^ f[i]!;
    l = r;
    r = newR;
  }

  return bitsToBytes(permute(r.concat(l), FP));
}

/** A single DES key schedule (16 round sub-keys). */
export class DesKey {
  readonly subKeys: number[][];
  constructor(key: Uint8Array, offset = 0) {
    this.subKeys = generateSubKeys(key, offset);
  }
  encryptBlock(bytes: Uint8Array, offset: number): Uint8Array {
    return desBlock(bytes, offset, this.subKeys, false);
  }
  decryptBlock(bytes: Uint8Array, offset: number): Uint8Array {
    return desBlock(bytes, offset, this.subKeys, true);
  }
}

/**
 * Decrypt data with Triple-DES (EDE, three independent 8-byte keys) in CBC mode.
 * The key must be 24 bytes; the IV 8 bytes. PKCS#7 padding is NOT removed here.
 */
export function tripleDesCbcDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if (key.length !== 24) throw new Error('Triple-DES requires a 24-byte key.');
  if (data.length % 8 !== 0) throw new Error('Triple-DES CBC input must be a multiple of 8 bytes.');

  const k1 = new DesKey(key, 0);
  const k2 = new DesKey(key, 8);
  const k3 = new DesKey(key, 16);
  const out = new Uint8Array(data.length);
  let prev = iv;

  for (let off = 0; off < data.length; off += 8) {
    // EDE decrypt: D_k1(E_k2(D_k3(block))).
    let block = k3.decryptBlock(data, off);
    block = k2.encryptBlock(block, 0);
    block = k1.decryptBlock(block, 0);
    for (let i = 0; i < 8; i++) out[off + i] = block[i]! ^ prev[i]!;
    prev = data.subarray(off, off + 8);
  }

  return out;
}
