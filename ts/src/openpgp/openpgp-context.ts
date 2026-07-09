// Port of the crypto core of MimeKit/Cryptography/OpenPgpContext.cs, backed by the
// OpenPgpEngine. This is an in-memory keyring context (analogous to the S/MIME
// PkijsSecureMimeContext): keys are imported from armored/binary key data and looked
// up by the email address in their user ids.
//
// Out of scope (deferred, see DEFERRED.md): key generation, key signing/certification,
// keyserver / HKP lookup + auto-key-retrieve, GnuPG on-disk keyring enumeration, and
// public-key export variants.

import type { MailboxAddress } from '../mailbox-address.js';
import { MemoryStream } from '../io/stream.js';
import { DigestAlgorithm } from '../smime/digest-algorithm.js';
import { EncryptionAlgorithm } from '../smime/encryption-algorithm.js';
import { CertificateNotFoundException, PrivateKeyNotFoundException, NotSupportedError } from '../smime/errors.js';
import { DigitalSignatureCollection } from '../smime/digital-signature-collection.js';
import { ApplicationPgpSignature } from './application-pgp-signature.js';
import {
  OpenPgpJsEngine,
  type OpenPgpEngine,
  type OpenPgpPublicKey,
  type OpenPgpPrivateKey,
} from './engine.js';
import { OpenPgpDigitalCertificate, parseUserId } from './openpgp-digital-certificate.js';
import { OpenPgpDigitalSignature } from './openpgp-digital-signature.js';

/** Callback that supplies the passphrase for a locked secret key, by key id. */
export type OpenPgpPasswordProvider = (keyId: string) => string | null;

/** Options for constructing an {@link OpenPgpContext}. */
export interface OpenPgpContextOptions {
  /** The engine backend (defaults to OpenPGP.js). */
  engine?: OpenPgpEngine;
  /** Supplies passphrases for locked secret keys (defaults to none). */
  getPassword?: OpenPgpPasswordProvider;
}

function emailMatches(key: OpenPgpPublicKey | OpenPgpPrivateKey, address: string): boolean {
  const target = address.toLowerCase();
  return key.getUserIDs().some((id) => parseUserId(id).email?.toLowerCase() === target);
}

/** An in-memory OpenPGP (PGP/MIME) cryptography context. */
export class OpenPgpContext {
  private readonly engine: OpenPgpEngine;
  private readonly getPassword: OpenPgpPasswordProvider;
  private readonly publicKeys: OpenPgpPublicKey[] = [];
  private readonly secretKeys: OpenPgpPrivateKey[] = [];

  constructor(options: OpenPgpContextOptions = {}) {
    this.engine = options.engine ?? new OpenPgpJsEngine();
    this.getPassword = options.getPassword ?? (() => null);
  }

  /** The MIME protocol used for detached signatures. */
  get signatureProtocol(): string {
    return 'application/pgp-signature';
  }

  /** The MIME protocol used for encrypted content. */
  get encryptionProtocol(): string {
    return 'application/pgp-encrypted';
  }

  /** The MIME protocol used for key exchange. */
  get keyExchangeProtocol(): string {
    return 'application/pgp-keys';
  }

  /** Whether MultipartSigned should prepare (7bit/CRLF) the entity before signing. */
  get prepareBeforeSigning(): boolean {
    return true;
  }

  /**
   * The `micalg` parameter name for the digest algorithm (RFC 3156 §5).
   *
   * @param micalg The digest algorithm.
   */
  getDigestAlgorithmName(micalg: DigestAlgorithm): string {
    switch (micalg) {
      case DigestAlgorithm.MD5: return 'pgp-md5';
      case DigestAlgorithm.Sha1: return 'pgp-sha1';
      case DigestAlgorithm.RipeMD160: return 'pgp-ripemd160';
      case DigestAlgorithm.Sha256: return 'pgp-sha256';
      case DigestAlgorithm.Sha384: return 'pgp-sha384';
      case DigestAlgorithm.Sha512: return 'pgp-sha512';
      case DigestAlgorithm.Sha224: return 'pgp-sha224';
      default:
        throw new NotSupportedError(`${DigestAlgorithm[micalg] ?? micalg} is not supported by OpenPGP.`);
    }
  }

  /**
   * Whether this context supports the given MIME protocol.
   *
   * @param protocol The protocol content-type (e.g. `application/pgp-signature`).
   */
  supports(protocol: string): boolean {
    if (protocol == null) throw new TypeError('protocol cannot be null or undefined');
    const type = protocol.trim().toLowerCase();
    return (
      type === 'application/pgp-signature' ||
      type === 'application/pgp-encrypted' ||
      type === 'application/pgp-keys' ||
      type === 'application/x-pgp-signature' ||
      type === 'application/x-pgp-encrypted' ||
      type === 'application/x-pgp-keys'
    );
  }

  /** Import public and/or secret keys from armored text or binary key data. */
  async import(input: string | Uint8Array): Promise<void> {
    if (input == null) throw new TypeError('input cannot be null or undefined');
    const text = typeof input === 'string' ? input : null;
    // Try secret keys first (a secret keyring also yields the public halves).
    if (text == null || text.includes('PRIVATE KEY')) {
      try {
        for (const key of await this.engine.readPrivateKeys(input)) this.addSecretKey(key);
      } catch {
        /* not a private keyring */
      }
    }
    if (text == null || text.includes('PUBLIC KEY')) {
      try {
        for (const key of await this.engine.readPublicKeys(input)) this.addPublicKey(key);
      } catch {
        /* not a public keyring */
      }
    }
  }

  /** Add a public key to the keyring. */
  addPublicKey(key: OpenPgpPublicKey): void {
    if (!this.publicKeys.some((k) => k.getFingerprint() === key.getFingerprint())) this.publicKeys.push(key);
  }

  /** Add a secret key (and its public half) to the keyring. */
  addSecretKey(key: OpenPgpPrivateKey): void {
    if (!this.secretKeys.some((k) => k.getFingerprint() === key.getFingerprint())) this.secretKeys.push(key);
    this.addPublicKey(key.toPublic());
  }

  /** Get the public keys for the given recipient mailboxes (throws if any is missing). */
  async getPublicKeys(mailboxes: Iterable<MailboxAddress>): Promise<OpenPgpPublicKey[]> {
    const keys: OpenPgpPublicKey[] = [];
    for (const mailbox of mailboxes) {
      const key = this.publicKeys.find((k) => emailMatches(k, mailbox.address));
      if (key == null)
        throw new CertificateNotFoundException(mailbox, `A public key for ${mailbox.address} could not be found.`);
      keys.push(key);
    }
    return keys;
  }

  /** Get the (unlocked) signing key for the given mailbox. */
  async getSigningKey(mailbox: MailboxAddress): Promise<OpenPgpPrivateKey> {
    const key = this.secretKeys.find((k) => emailMatches(k, mailbox.address));
    if (key == null)
      throw new PrivateKeyNotFoundException(mailbox, `A secret key for ${mailbox.address} could not be found.`);
    return this.unlock(key);
  }

  private async unlock(key: OpenPgpPrivateKey): Promise<OpenPgpPrivateKey> {
    if (key.isDecrypted()) return key;
    const passphrase = this.getPassword(key.getKeyID().toHex());
    if (passphrase == null) return key;
    return this.engine.unlock(key, passphrase);
  }

  private async resolveSigner(signer: MailboxAddress | OpenPgpPrivateKey): Promise<OpenPgpPrivateKey> {
    return 'getUserIDs' in signer ? this.unlock(signer) : this.getSigningKey(signer);
  }

  private async resolveRecipients(
    recipients: Iterable<MailboxAddress> | OpenPgpPublicKey[],
  ): Promise<OpenPgpPublicKey[]> {
    const list = [...recipients];
    if (list.length > 0 && 'getUserIDs' in list[0]!) return list as OpenPgpPublicKey[];
    return this.getPublicKeys(list as MailboxAddress[]);
  }

  /** Produce an ASCII-armored detached signature over `content`. */
  async sign(
    signer: MailboxAddress | OpenPgpPrivateKey,
    digestAlgo: DigestAlgorithm,
    content: Uint8Array,
  ): Promise<Uint8Array> {
    const key = await this.resolveSigner(signer);
    return this.engine.signDetached(content, [key], digestAlgo);
  }

  /**
   * Sign `content` with the signer mailbox and return the detached signature as an
   * `application/pgp-signature` MIME part (used by {@link MultipartSigned}).
   */
  async signWithMailbox(
    signer: MailboxAddress,
    digestAlgo: DigestAlgorithm,
    content: Uint8Array,
  ): Promise<ApplicationPgpSignature> {
    const armored = await this.sign(signer, digestAlgo, content);
    return new ApplicationPgpSignature(new MemoryStream(armored));
  }

  /** Verify an ASCII-armored detached signature over `content`. */
  async verify(content: Uint8Array, signatureData: Uint8Array): Promise<OpenPgpDigitalSignature[]> {
    const verifications = await this.engine.verifyDetached(content, signatureData, this.publicKeys);
    return Promise.all(verifications.map((v) => this.toDigitalSignature(v)));
  }

  /**
   * Verify a detached signature and return the results as a {@link DigitalSignatureCollection}
   * (the shape {@link MultipartSigned} expects).
   */
  async verifyDetached(content: Uint8Array, signatureData: Uint8Array): Promise<DigitalSignatureCollection> {
    return new DigitalSignatureCollection(await this.verify(content, signatureData));
  }

  private async toDigitalSignature(
    verification: { keyId: string; verified: boolean; created: Date | null },
  ): Promise<OpenPgpDigitalSignature> {
    const key = this.publicKeys.find((k) => k.getKeyID().toHex() === verification.keyId);
    const cert = key != null ? await OpenPgpDigitalCertificate.create(key) : null;
    return new OpenPgpDigitalSignature(verification, cert);
  }

  /** Produce an ASCII-armored encrypted message to the given recipients. */
  async encrypt(
    recipients: Iterable<MailboxAddress> | OpenPgpPublicKey[],
    content: Uint8Array,
    cipher?: EncryptionAlgorithm,
  ): Promise<Uint8Array> {
    const keys = await this.resolveRecipients(recipients);
    return this.engine.encrypt(content, keys, cipher != null ? { cipher } : {});
  }

  /** Sign and encrypt `content` in one pass. */
  async signAndEncrypt(
    signer: MailboxAddress | OpenPgpPrivateKey,
    digestAlgo: DigestAlgorithm,
    recipients: Iterable<MailboxAddress> | OpenPgpPublicKey[],
    content: Uint8Array,
    cipher?: EncryptionAlgorithm,
  ): Promise<Uint8Array> {
    void digestAlgo;
    const signingKey = await this.resolveSigner(signer);
    const keys = await this.resolveRecipients(recipients);
    return this.engine.encrypt(content, keys, { signingKeys: [signingKey], ...(cipher != null ? { cipher } : {}) });
  }

  /** Decrypt an ASCII-armored message, verifying any embedded signatures. */
  async decrypt(
    encryptedData: Uint8Array,
  ): Promise<{ data: Uint8Array; signatures: OpenPgpDigitalSignature[] }> {
    const unlocked = await Promise.all(this.secretKeys.map((k) => this.unlock(k)));
    const result = await this.engine.decrypt(encryptedData, unlocked, this.publicKeys);
    const signatures = await Promise.all(result.signatures.map((v) => this.toDigitalSignature(v)));
    return { data: result.data, signatures };
  }
}
