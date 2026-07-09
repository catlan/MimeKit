// Port of the portable orchestration in MimeKit/Cryptography/SecureMimeContext.cs
// (+ the relevant bits of CryptographyContext.cs and ISecureMimeContext.cs).
//
// DESIGN — the S/MIME crypto seam (wave C2b implements against this):
//
//   MIME wrappers (MultipartSigned / ApplicationPkcs7Mime / ...Signature)
//        │  delegate to
//        ▼
//   SecureMimeContext (this file, abstract)
//        ├─ portable orchestration (concrete here): protocol strings, Supports,
//        │  micalg<->DigestAlgorithm maps, digest OIDs, the enabled-algorithm
//        │  bitmask, GetPreferredEncryptionAlgorithm.
//        ├─ abstract crypto primitives (async — WebCrypto/pkijs CMS in C2b):
//        │  sign / encapsulatedSign / verify(Detached|Encapsulated) /
//        │  encrypt / decrypt / compress / decompress / import.
//        └─ injectable store ({@link ISecureMimeStore}): find a certificate by
//           recipient mailbox, find a signing key by signer mailbox, trust
//           anchors, import. C2b passes a concrete store (in-memory / IndexedDB
//           / filesystem) into its context; this file never touches storage.
//
// Crypto is async here (unlike C#'s synchronous BouncyCastle) because the C2b
// backend runs on WebCrypto. The core `entity.writeTo(...)` stays synchronous:
// wrappers serialize into a MemoryStream synchronously, then await the context.

import { EncryptionAlgorithm, encryptionAlgorithmCount } from './encryption-algorithm.js';
import { DigestAlgorithm } from './digest-algorithm.js';
import { NotSupportedError } from './errors.js';
import type { CmsSigner } from './cms-signer.js';
import type { CmsRecipientCollection } from './cms-recipient-collection.js';
import type { DigitalSignatureCollection } from './digital-signature-collection.js';
import type { AsymmetricKey, X509Certificate } from './x509-certificate.js';
import type { MailboxAddress } from '../mailbox-address.js';
import type { MimeEntity } from '../mime-entity.js';
import type { ApplicationPkcs7Mime } from './application-pkcs7-mime.js';
import type { ApplicationPkcs7Signature } from './application-pkcs7-signature.js';

// Digest OIDs (C#: CmsSignedGenerator.Digest* / PkcsObjectIdentifiers.MD2/MD4).
const DIGEST_MD5 = '1.2.840.113549.2.5';
const DIGEST_SHA1 = '1.3.14.3.2.26';
const DIGEST_SHA224 = '2.16.840.1.101.3.4.2.4';
const DIGEST_SHA256 = '2.16.840.1.101.3.4.2.1';
const DIGEST_SHA384 = '2.16.840.1.101.3.4.2.2';
const DIGEST_SHA512 = '2.16.840.1.101.3.4.2.3';
const DIGEST_RIPEMD160 = '1.3.36.3.2.1';
const OID_MD2 = '1.2.840.113549.2.2';
const OID_MD4 = '1.2.840.113549.2.4';

const PROTOCOL_SUBTYPES = [
  'pkcs7-signature',
  'pkcs7-mime',
  'pkcs7-keys',
  'x-pkcs7-signature',
  'x-pkcs7-mime',
  'x-pkcs7-keys',
];

/**
 * The result of resolving a signer's mailbox to a signing key (C2b store).
 */
export interface PrivateKeyEntry {
  /** The signer's certificate. */
  certificate: X509Certificate;
  /** The signer's certificate chain (leaf first). */
  chain: X509Certificate[];
  /** The signer's private key. */
  key: AsymmetricKey;
}

/**
 * The injectable X.509 certificate / private-key store. This is the environment
 * seam: C2b ships an in-memory default, a browser (IndexedDB) store, and a Node
 * (filesystem) store; tests supply a fixture store. Everything is async so a
 * remote or IO-backed store fits without changing the abstraction.
 */
export interface ISecureMimeStore {
  /** Find the encryption certificate for a recipient mailbox. */
  getCertificate(mailbox: MailboxAddress): Promise<X509Certificate | null>;

  /** Find the signing certificate + private key for a signer mailbox. */
  getPrivateKey(mailbox: MailboxAddress): Promise<PrivateKeyEntry | null>;

  /** The trust anchors used for certificate-chain validation. */
  getTrustedAnchors(): Promise<X509Certificate[]>;

  /** Import a single certificate into the store. */
  addCertificate(certificate: X509Certificate): Promise<void>;

  /** Import the certificates (and CRLs) contained in the DER/PKCS#7 data. */
  importCertificates(data: Uint8Array): Promise<void>;
}

/**
 * An S/MIME cryptography context. The portable orchestration lives here; the
 * crypto primitives and certificate/key storage are abstract and implemented by
 * the concrete pkijs-backed context in wave C2b.
 */
export abstract class SecureMimeContext {
  private enabledEncryptionAlgorithmsMask = 0;

  /** The encryption algorithms in ranked (strongest-first) order. */
  protected readonly encryptionAlgorithmRank: EncryptionAlgorithm[];

  /**
   * The injectable certificate/key store (set by the concrete C2b context).
   * `null` on contexts that resolve everything from an explicit CmsSigner /
   * CmsRecipient and never do mailbox lookups.
   */
  protected readonly store: ISecureMimeStore | null;

  /**
   * Whether entities should be canonically prepared (armored "From " lines,
   * trailing whitespace trimmed) before signing (C#: `PrepareBeforeSigning`,
   * default `true`).
   */
  prepareBeforeSigning = true;

  protected constructor(store: ISecureMimeStore | null = null) {
    this.store = store;
    this.encryptionAlgorithmRank = [
      EncryptionAlgorithm.Aes256,
      EncryptionAlgorithm.Aes192,
      EncryptionAlgorithm.Aes128,
      EncryptionAlgorithm.Seed,
      EncryptionAlgorithm.Camellia256,
      EncryptionAlgorithm.Camellia192,
      EncryptionAlgorithm.Camellia128,
      EncryptionAlgorithm.Cast5,
      EncryptionAlgorithm.Blowfish,
      EncryptionAlgorithm.TripleDes,
      EncryptionAlgorithm.Idea,
      EncryptionAlgorithm.RC2128,
      EncryptionAlgorithm.RC264,
      EncryptionAlgorithm.Des,
      EncryptionAlgorithm.RC240,
    ];

    for (const algorithm of this.encryptionAlgorithmRank) {
      this.enable(algorithm);
      // Don't enable anything weaker than Triple-DES by default.
      if (algorithm === EncryptionAlgorithm.TripleDes) break;
    }

    // Disable Blowfish and Twofish by default for now.
    this.disable(EncryptionAlgorithm.Blowfish);
    this.disable(EncryptionAlgorithm.Twofish);
  }

  // ---- protocols -----------------------------------------------------------

  /** The signature protocol (multipart/signed `protocol` parameter). */
  get signatureProtocol(): string {
    return 'application/pkcs7-signature';
  }

  /** The encryption protocol (multipart/encrypted `protocol` parameter). */
  get encryptionProtocol(): string {
    return 'application/pkcs7-mime';
  }

  /** The key exchange protocol. */
  get keyExchangeProtocol(): string {
    return 'application/pkcs7-mime';
  }

  /** Whether the specified protocol is supported by this context. */
  supports(protocol: string): boolean {
    if (protocol == null) throw new TypeError('protocol cannot be null or undefined');
    const prefix = 'application/';
    if (!protocol.toLowerCase().startsWith(prefix)) return false;
    const subtype = protocol.substring(prefix.length).toLowerCase();
    return PROTOCOL_SUBTYPES.includes(subtype);
  }

  // ---- micalg <-> digest algorithm -----------------------------------------

  /** The micalg name for a digest algorithm (multipart/signed `micalg`). */
  getDigestAlgorithmName(micalg: DigestAlgorithm): string {
    switch (micalg) {
      case DigestAlgorithm.MD5: return 'md5';
      case DigestAlgorithm.Sha1: return 'sha-1';
      case DigestAlgorithm.RipeMD160: return 'ripemd160';
      case DigestAlgorithm.MD2: return 'md2';
      case DigestAlgorithm.Tiger192: return 'tiger192';
      case DigestAlgorithm.Haval5160: return 'haval-5-160';
      case DigestAlgorithm.Sha256: return 'sha-256';
      case DigestAlgorithm.Sha384: return 'sha-384';
      case DigestAlgorithm.Sha512: return 'sha-512';
      case DigestAlgorithm.Sha224: return 'sha-224';
      case DigestAlgorithm.MD4: return 'md4';
      case DigestAlgorithm.DoubleSha:
        throw new NotSupportedError(`${DigestAlgorithm[micalg]} is not supported.`);
      default:
        throw new RangeError(`Unknown DigestAlgorithm: ${micalg}`);
    }
  }

  /** The digest algorithm from a micalg parameter value. */
  getDigestAlgorithm(micalg: string): DigestAlgorithm {
    if (micalg == null) throw new TypeError('micalg cannot be null or undefined');
    switch (micalg.toLowerCase()) {
      case 'md5': return DigestAlgorithm.MD5;
      case 'sha1':
      case 'sha-1': return DigestAlgorithm.Sha1;
      case 'ripemd160': return DigestAlgorithm.RipeMD160;
      case 'md2': return DigestAlgorithm.MD2;
      case 'tiger192': return DigestAlgorithm.Tiger192;
      case 'haval-5-160': return DigestAlgorithm.Haval5160;
      case 'sha256':
      case 'sha-256': return DigestAlgorithm.Sha256;
      case 'sha384':
      case 'sha-384': return DigestAlgorithm.Sha384;
      case 'sha512':
      case 'sha-512': return DigestAlgorithm.Sha512;
      case 'sha224':
      case 'sha-224': return DigestAlgorithm.Sha224;
      case 'md4': return DigestAlgorithm.MD4;
      default: return DigestAlgorithm.None;
    }
  }

  /** The OID for a digest algorithm (C#: `GetDigestOid`). */
  static getDigestOid(digestAlgo: DigestAlgorithm): string {
    switch (digestAlgo) {
      case DigestAlgorithm.MD5: return DIGEST_MD5;
      case DigestAlgorithm.Sha1: return DIGEST_SHA1;
      case DigestAlgorithm.MD2: return OID_MD2;
      case DigestAlgorithm.Sha256: return DIGEST_SHA256;
      case DigestAlgorithm.Sha384: return DIGEST_SHA384;
      case DigestAlgorithm.Sha512: return DIGEST_SHA512;
      case DigestAlgorithm.Sha224: return DIGEST_SHA224;
      case DigestAlgorithm.MD4: return OID_MD4;
      case DigestAlgorithm.RipeMD160: return DIGEST_RIPEMD160;
      case DigestAlgorithm.DoubleSha:
      case DigestAlgorithm.Tiger192:
      case DigestAlgorithm.Haval5160:
        throw new NotSupportedError(`${DigestAlgorithm[digestAlgo]} is not supported.`);
      default:
        throw new RangeError(`Unknown DigestAlgorithm: ${digestAlgo}`);
    }
  }

  /** Maps a digest OID back to a {@link DigestAlgorithm} (C#: `TryGetDigestAlgorithm`). */
  static tryGetDigestAlgorithm(id: string | null): { ok: true; algorithm: DigestAlgorithm } | { ok: false } {
    switch (id) {
      case DIGEST_SHA1: return { ok: true, algorithm: DigestAlgorithm.Sha1 };
      case DIGEST_SHA224: return { ok: true, algorithm: DigestAlgorithm.Sha224 };
      case DIGEST_SHA256: return { ok: true, algorithm: DigestAlgorithm.Sha256 };
      case DIGEST_SHA384: return { ok: true, algorithm: DigestAlgorithm.Sha384 };
      case DIGEST_SHA512: return { ok: true, algorithm: DigestAlgorithm.Sha512 };
      case DIGEST_RIPEMD160: return { ok: true, algorithm: DigestAlgorithm.RipeMD160 };
      case DIGEST_MD5: return { ok: true, algorithm: DigestAlgorithm.MD5 };
      case OID_MD4: return { ok: true, algorithm: DigestAlgorithm.MD4 };
      case OID_MD2: return { ok: true, algorithm: DigestAlgorithm.MD2 };
      default: return { ok: false };
    }
  }

  // ---- enabled encryption algorithms (bitmask) -----------------------------

  /** The enabled encryption algorithms, in ranked order. */
  get enabledEncryptionAlgorithms(): EncryptionAlgorithm[] {
    return this.encryptionAlgorithmRank.filter((a) => this.isEnabled(a));
  }

  /** Enable an encryption algorithm. */
  enable(algorithm: EncryptionAlgorithm): void {
    this.enabledEncryptionAlgorithmsMask |= 1 << algorithm;
  }

  /** Disable an encryption algorithm. */
  disable(algorithm: EncryptionAlgorithm): void {
    this.enabledEncryptionAlgorithmsMask &= ~(1 << algorithm);
  }

  /** Whether the specified encryption algorithm is enabled. */
  isEnabled(algorithm: EncryptionAlgorithm): boolean {
    return (this.enabledEncryptionAlgorithmsMask & (1 << algorithm)) !== 0;
  }

  /**
   * The preferred encryption algorithm for the specified recipients, based on
   * each recipient's supported algorithms, the enabled algorithms, and the rank.
   * If a recipient's supported algorithms are unknown, Triple-DES is assumed.
   */
  protected getPreferredEncryptionAlgorithm(recipients: CmsRecipientCollection): EncryptionAlgorithm {
    const votes = new Array<number>(encryptionAlgorithmCount).fill(0);
    const need = recipients.count;

    for (const recipient of recipients) {
      for (const algorithm of recipient.encryptionAlgorithms) votes[algorithm]++;
    }

    let chosen = EncryptionAlgorithm.TripleDes;
    let nvotes = 0;

    votes[EncryptionAlgorithm.TripleDes] = need;

    for (const algorithm of this.encryptionAlgorithmRank) {
      if (!this.isEnabled(algorithm)) continue;
      if (votes[algorithm]! > nvotes) {
        nvotes = votes[algorithm]!;
        chosen = algorithm;
      }
    }

    return chosen;
  }

  // ---- abstract crypto primitives (implemented by the C2b backend) ---------

  /** Compress a MIME stream into an application/pkcs7-mime part. */
  abstract compress(content: Uint8Array): Promise<ApplicationPkcs7Mime>;

  /** Decompress compressed-data into a MIME entity. */
  abstract decompress(data: Uint8Array): Promise<MimeEntity>;

  /** Create a detached CMS signature (application/pkcs7-signature) from a CmsSigner. */
  abstract sign(signer: CmsSigner, content: Uint8Array): Promise<ApplicationPkcs7Signature>;

  /** Create a detached CMS signature resolving the signer via the store. */
  abstract signWithMailbox(
    signer: MailboxAddress,
    digestAlgo: DigestAlgorithm,
    content: Uint8Array,
  ): Promise<ApplicationPkcs7Signature>;

  /** Create an encapsulated (application/pkcs7-mime, signed-data) signature from a CmsSigner. */
  abstract encapsulatedSign(signer: CmsSigner, content: Uint8Array): Promise<ApplicationPkcs7Mime>;

  /** Create an encapsulated signature resolving the signer via the store. */
  abstract encapsulatedSignWithMailbox(
    signer: MailboxAddress,
    digestAlgo: DigestAlgorithm,
    content: Uint8Array,
  ): Promise<ApplicationPkcs7Mime>;

  /** Verify a detached signature over `content` (multipart/signed path). */
  abstract verifyDetached(content: Uint8Array, signatureData: Uint8Array): Promise<DigitalSignatureCollection>;

  /** Verify encapsulated signed-data and return the signatures + unwrapped entity. */
  abstract verifyEncapsulated(
    signedData: Uint8Array,
  ): Promise<{ signatures: DigitalSignatureCollection; entity: MimeEntity }>;

  /** Encrypt a MIME stream to an explicit recipient collection. */
  abstract encrypt(recipients: CmsRecipientCollection, content: Uint8Array): Promise<ApplicationPkcs7Mime>;

  /** Encrypt a MIME stream to recipient mailboxes, resolving certificates via the store. */
  abstract encryptToMailboxes(
    recipients: Iterable<MailboxAddress>,
    content: Uint8Array,
  ): Promise<ApplicationPkcs7Mime>;

  /** Decrypt enveloped-data into a MIME entity. */
  abstract decrypt(data: Uint8Array): Promise<MimeEntity>;

  /** Decrypt enveloped-data, writing the decrypted MIME stream to `output`. */
  abstract decryptTo(data: Uint8Array): Promise<Uint8Array>;

  /** Import the certificates (and CRLs) contained in the DER/PKCS#7 stream. */
  abstract import(data: Uint8Array): Promise<void>;

  /** Import a single certificate. */
  abstract importCertificate(certificate: X509Certificate): Promise<void>;

  /** Release any resources held by the context (C#: IDisposable). Default no-op. */
  dispose(): void {}
}

// ---- default-context registry -----------------------------------------------
//
// The no-context wrapper overloads (e.g. `multipartSigned.verify()`,
// `pkcs7.decrypt()`) create a default S/MIME context via
// `CryptographyContext.Create("application/pkcs7-mime")` in C#. Here the concrete
// C2b context registers a factory; without a backend registered the overloads
// throw, exactly as an unconfigured C# install would.

let defaultContextFactory: (() => SecureMimeContext) | null = null;

/** Register the factory that produces the default S/MIME context (wave C2b). */
export function registerSecureMimeContext(factory: (() => SecureMimeContext) | null): void {
  defaultContextFactory = factory;
}

/** Create the default S/MIME context, or throw if no backend is registered. */
export function createSecureMimeContext(): SecureMimeContext {
  if (defaultContextFactory == null)
    throw new NotSupportedError(
      'No S/MIME cryptography context is registered (requires the S/MIME crypto backend).',
    );
  return defaultContextFactory();
}
