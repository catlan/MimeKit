// The OpenPgpEngine seam over a concrete OpenPGP implementation.
//
// The default OpenPgpJsEngine loads OpenPGP.js through a dynamic `import('openpgp')`
// so that `mimekit-ts/openpgp` is the only entry point that pulls in the (LGPL)
// `openpgp` dependency, and so a future backend (e.g. an rpgp-WASM build) can be
// swapped in without touching the PGP/MIME layer above. All OpenPGP.js specifics
// live behind this interface.

import { DigestAlgorithm } from '../smime/digest-algorithm.js';
import { EncryptionAlgorithm } from '../smime/encryption-algorithm.js';

/** An OpenPGP public key handle (backend-specific). */
export type OpenPgpPublicKey = import('openpgp').PublicKey;
/** An OpenPGP private (secret) key handle (backend-specific). */
export type OpenPgpPrivateKey = import('openpgp').PrivateKey;

/** The result of verifying a single OpenPGP signature. */
export interface OpenPgpVerification {
  /** The hex key id of the signing key. */
  readonly keyId: string;
  /** Whether the signature is cryptographically valid. */
  readonly verified: boolean;
  /** The signature creation time, when available. */
  readonly created: Date | null;
  /** The digest algorithm the signature was made with, when known. */
  readonly digestAlgorithm: DigestAlgorithm;
}

/** The result of decrypting (and optionally verifying) an OpenPGP message. */
export interface OpenPgpDecryptResult {
  /** The decrypted plaintext bytes. */
  readonly data: Uint8Array;
  /** Signature verifications, when verification keys were supplied. */
  readonly signatures: OpenPgpVerification[];
}

/**
 * The minimal set of OpenPGP primitives the PGP/MIME layer needs. Keys are opaque
 * backend handles ({@link OpenPgpPublicKey} / {@link OpenPgpPrivateKey}).
 */
export interface OpenPgpEngine {
  /** Parse one or more public keys from armored text or binary key data. */
  readPublicKeys(input: string | Uint8Array): Promise<OpenPgpPublicKey[]>;
  /** Parse one or more (possibly locked) private keys from armored text or binary key data. */
  readPrivateKeys(input: string | Uint8Array): Promise<OpenPgpPrivateKey[]>;
  /** Unlock a locked private key with the given passphrase. */
  unlock(key: OpenPgpPrivateKey, passphrase: string): Promise<OpenPgpPrivateKey>;
  /** Produce an ASCII-armored detached signature over `data`. */
  signDetached(data: Uint8Array, signingKeys: OpenPgpPrivateKey[], digestAlgo: DigestAlgorithm): Promise<Uint8Array>;
  /** Verify an ASCII-armored detached signature over `data`. */
  verifyDetached(data: Uint8Array, armoredSignature: Uint8Array, verificationKeys: OpenPgpPublicKey[]): Promise<OpenPgpVerification[]>;
  /** Produce an ASCII-armored encrypted (optionally signed) message. */
  encrypt(
    data: Uint8Array,
    encryptionKeys: OpenPgpPublicKey[],
    options?: { cipher?: EncryptionAlgorithm; signingKeys?: OpenPgpPrivateKey[]; digestAlgo?: DigestAlgorithm },
  ): Promise<Uint8Array>;
  /** Decrypt an ASCII-armored message and, if verification keys are supplied, verify its signatures. */
  decrypt(
    armored: Uint8Array,
    decryptionKeys: OpenPgpPrivateKey[],
    verificationKeys?: OpenPgpPublicKey[],
  ): Promise<OpenPgpDecryptResult>;
}

type OpenPgpModule = typeof import('openpgp');
let openpgpPromise: Promise<OpenPgpModule> | null = null;

/** Load OpenPGP.js on demand (and surface a clear error if the optional peer is absent). */
async function loadOpenPgp(): Promise<OpenPgpModule> {
  if (openpgpPromise == null) {
    openpgpPromise = import('openpgp').catch((cause) => {
      throw new Error(
        "The 'openpgp' package is required for OpenPGP support. Install it as a peer dependency: npm install openpgp",
        { cause },
      );
    });
  }
  return openpgpPromise;
}

function hashName(digestAlgo: DigestAlgorithm): 'md5' | 'sha1' | 'ripemd160' | 'sha256' | 'sha384' | 'sha512' | 'sha224' {
  switch (digestAlgo) {
    case DigestAlgorithm.MD5: return 'md5';
    case DigestAlgorithm.Sha1: return 'sha1';
    case DigestAlgorithm.RipeMD160: return 'ripemd160';
    case DigestAlgorithm.Sha224: return 'sha224';
    case DigestAlgorithm.Sha256: return 'sha256';
    case DigestAlgorithm.Sha384: return 'sha384';
    case DigestAlgorithm.Sha512: return 'sha512';
    default:
      throw new RangeError(`digest algorithm ${DigestAlgorithm[digestAlgo] ?? digestAlgo} is not supported by OpenPGP`);
  }
}

function cipherName(cipher: EncryptionAlgorithm): 'tripledes' | 'cast5' | 'aes128' | 'aes192' | 'aes256' {
  switch (cipher) {
    case EncryptionAlgorithm.TripleDes: return 'tripledes';
    case EncryptionAlgorithm.Cast5: return 'cast5';
    case EncryptionAlgorithm.Aes128: return 'aes128';
    case EncryptionAlgorithm.Aes192: return 'aes192';
    case EncryptionAlgorithm.Aes256: return 'aes256';
    default:
      throw new RangeError(`encryption algorithm ${EncryptionAlgorithm[cipher] ?? cipher} is not supported by OpenPGP`);
  }
}

/** Map an OpenPGP.js numeric hash id back to a {@link DigestAlgorithm}. */
function digestFromHashId(hashId: number | null | undefined): DigestAlgorithm {
  switch (hashId) {
    case 1: return DigestAlgorithm.MD5;
    case 2: return DigestAlgorithm.Sha1;
    case 3: return DigestAlgorithm.RipeMD160;
    case 8: return DigestAlgorithm.Sha256;
    case 9: return DigestAlgorithm.Sha384;
    case 10: return DigestAlgorithm.Sha512;
    case 11: return DigestAlgorithm.Sha224;
    default: return DigestAlgorithm.None;
  }
}

/** Resolve OpenPGP.js's `verified` promise (which rejects on an invalid signature) to a boolean. */
async function resolveVerified(verified: Promise<boolean>): Promise<boolean> {
  try {
    return await verified;
  } catch {
    return false;
  }
}

/** The default {@link OpenPgpEngine}, backed by OpenPGP.js. */
export class OpenPgpJsEngine implements OpenPgpEngine {
  async readPublicKeys(input: string | Uint8Array): Promise<OpenPgpPublicKey[]> {
    const openpgp = await loadOpenPgp();
    return typeof input === 'string'
      ? openpgp.readKeys({ armoredKeys: input })
      : openpgp.readKeys({ binaryKeys: input });
  }

  async readPrivateKeys(input: string | Uint8Array): Promise<OpenPgpPrivateKey[]> {
    const openpgp = await loadOpenPgp();
    return typeof input === 'string'
      ? openpgp.readPrivateKeys({ armoredKeys: input })
      : openpgp.readPrivateKeys({ binaryKeys: input });
  }

  async unlock(key: OpenPgpPrivateKey, passphrase: string): Promise<OpenPgpPrivateKey> {
    if (key.isDecrypted()) return key;
    const openpgp = await loadOpenPgp();
    return openpgp.decryptKey({ privateKey: key, passphrase });
  }

  async signDetached(
    data: Uint8Array,
    signingKeys: OpenPgpPrivateKey[],
    digestAlgo: DigestAlgorithm,
  ): Promise<Uint8Array> {
    const openpgp = await loadOpenPgp();
    const message = await openpgp.createMessage({ binary: data });
    const armored = await openpgp.sign({
      message,
      signingKeys,
      detached: true,
      format: 'armored',
      config: { preferredHashAlgorithm: (openpgp.enums.hash as unknown as Record<string, number>)[hashName(digestAlgo)] },
    });
    return new TextEncoder().encode(armored);
  }

  async verifyDetached(
    data: Uint8Array,
    armoredSignature: Uint8Array,
    verificationKeys: OpenPgpPublicKey[],
  ): Promise<OpenPgpVerification[]> {
    const openpgp = await loadOpenPgp();
    const message = await openpgp.createMessage({ binary: data });
    const signature = await openpgp.readSignature({ armoredSignature: new TextDecoder().decode(armoredSignature) });
    const result = await openpgp.verify({ message, signature, verificationKeys });
    return Promise.all(
      result.signatures.map(async (s) => {
        const packet = (await s.signature).packets[0];
        return {
          keyId: s.keyID.toHex(),
          verified: await resolveVerified(s.verified),
          created: packet?.created ?? null,
          digestAlgorithm: digestFromHashId(packet?.hashAlgorithm),
        };
      }),
    );
  }

  async encrypt(
    data: Uint8Array,
    encryptionKeys: OpenPgpPublicKey[],
    options: { cipher?: EncryptionAlgorithm; signingKeys?: OpenPgpPrivateKey[]; digestAlgo?: DigestAlgorithm } = {},
  ): Promise<Uint8Array> {
    const openpgp = await loadOpenPgp();
    const message = await openpgp.createMessage({ binary: data });
    const config: Record<string, number> = {};
    if (options.cipher != null)
      config['preferredSymmetricAlgorithm'] = (openpgp.enums.symmetric as unknown as Record<string, number>)[cipherName(options.cipher)]!;
    if (options.digestAlgo != null && options.signingKeys && options.signingKeys.length > 0)
      config['preferredHashAlgorithm'] = (openpgp.enums.hash as unknown as Record<string, number>)[hashName(options.digestAlgo)]!;
    const armored = await openpgp.encrypt({
      message,
      encryptionKeys,
      ...(options.signingKeys && options.signingKeys.length > 0 ? { signingKeys: options.signingKeys } : {}),
      format: 'armored',
      ...(Object.keys(config).length > 0 ? { config } : {}),
    });
    return new TextEncoder().encode(armored);
  }

  async decrypt(
    armored: Uint8Array,
    decryptionKeys: OpenPgpPrivateKey[],
    verificationKeys?: OpenPgpPublicKey[],
  ): Promise<OpenPgpDecryptResult> {
    const openpgp = await loadOpenPgp();
    const message = await openpgp.readMessage({ armoredMessage: new TextDecoder().decode(armored) });
    const result = await openpgp.decrypt({
      message,
      decryptionKeys,
      ...(verificationKeys && verificationKeys.length > 0 ? { verificationKeys } : {}),
      format: 'binary',
    });
    const signatures = verificationKeys
      ? await Promise.all(
          result.signatures.map(async (s) => {
            const packet = (await s.signature).packets[0];
            return {
              keyId: s.keyID.toHex(),
              verified: await resolveVerified(s.verified),
              created: packet?.created ?? null,
              digestAlgorithm: digestFromHashId(packet?.hashAlgorithm),
            };
          }),
        )
      : [];
    return { data: result.data as Uint8Array, signatures };
  }
}
