// Port of the core of MimeKit/Cryptography/MultipartEncrypted.cs (PGP/MIME,
// RFC 3156). A multipart/encrypted has two children: an application/pgp-encrypted
// version part and an application/octet-stream part holding the armored ciphertext.
//
// Deferred (see DEFERRED.md): the raw PgpPublicKey/PgpSecretKey overloads' key-object
// exposure beyond what the round-trip tests need, and keyserver-backed flows.

import { FilteredStream } from '../io/filtered-stream.js';
import { MemoryStream } from '../io/stream.js';
import { ArmoredFromFilter } from '../io/filters/armored-from-filter.js';
import { TrailingWhitespaceFilter } from '../io/filters/trailing-whitespace-filter.js';
import { FormatOptions } from '../format-options.js';
import { MimeParser } from '../mime-parser.js';
import { MimeContent } from '../mime-content.js';
import { MimeEntity, type MimeEntityConstructorArgs } from '../mime-entity.js';
import { MimePart } from '../mime-part.js';
import { Multipart } from '../multipart.js';
import type { MailboxAddress } from '../mailbox-address.js';
import type { MimeVisitor } from '../mime-visitor.js';
import { DigestAlgorithm } from '../smime/digest-algorithm.js';
import { EncryptionAlgorithm } from '../smime/encryption-algorithm.js';
import { DigitalSignatureCollection } from '../smime/digital-signature-collection.js';
import { FormatException, NotSupportedError } from '../smime/errors.js';
import { ApplicationPgpEncrypted } from './application-pgp-encrypted.js';
import type { OpenPgpContext } from './openpgp-context.js';
import type { OpenPgpPublicKey, OpenPgpPrivateKey } from './engine.js';

/** The result of decrypting a {@link MultipartEncrypted} part. */
export interface DecryptResult {
  /** The decrypted MIME entity. */
  readonly entity: MimeEntity;
  /** Signatures verified during decryption, or `null` if the content was not signed. */
  readonly signatures: DigitalSignatureCollection | null;
}

/** A multipart/encrypted MIME part (PGP/MIME, RFC 3156). */
export class MultipartEncrypted extends Multipart {
  constructor(args: MimeEntityConstructorArgs);
  constructor();
  constructor(args?: MimeEntityConstructorArgs) {
    if (args === undefined) {
      super('encrypted');
      return;
    }
    super(args);
  }

  /**
   * Dispatches to the visitor method for multipart/encrypted entities.
   *
   * @param visitor The visitor.
   */
  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MultipartEncrypted');
    visitor.visitMultipartEncrypted(this);
  }

  /** The children are already encrypted, so preparing them would corrupt the content. */
  override prepare(_constraint: string, _maxLineLength = 78): void {
    // Intentionally no-op.
  }

  private static serialize(entity: MimeEntity): Uint8Array {
    const memory = new MemoryStream();
    const filtered = new FilteredStream(memory);
    filtered.add(new ArmoredFromFilter());
    filtered.add(new TrailingWhitespaceFilter());
    const options = FormatOptions.default.clone();
    options.newLineFormat = 'dos';
    entity.writeTo(options, filtered);
    filtered.flush();
    return memory.toArray();
  }

  private static wrap(ctx: OpenPgpContext, armored: Uint8Array): MultipartEncrypted {
    const octet = new MimePart('application', 'octet-stream');
    octet.content = new MimeContent(new MemoryStream(armored));
    octet.contentTransferEncoding = '7bit';

    const encrypted = new MultipartEncrypted();
    encrypted.contentType.parameters.set('protocol', ctx.encryptionProtocol);
    encrypted.add(new ApplicationPgpEncrypted());
    encrypted.add(octet);
    return encrypted;
  }

  /** Encrypt the entity to the given recipients. */
  static async encrypt(
    ctx: OpenPgpContext,
    recipients: Iterable<MailboxAddress> | OpenPgpPublicKey[],
    entity: MimeEntity,
    cipher?: EncryptionAlgorithm,
  ): Promise<MultipartEncrypted> {
    if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
    if (recipients == null) throw new TypeError('recipients cannot be null or undefined');
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    const armored = await ctx.encrypt(recipients, MultipartEncrypted.serialize(entity), cipher);
    return MultipartEncrypted.wrap(ctx, armored);
  }

  /** Sign and encrypt the entity in one pass. */
  static async signAndEncrypt(
    ctx: OpenPgpContext,
    signer: MailboxAddress | OpenPgpPrivateKey,
    digestAlgo: DigestAlgorithm,
    recipients: Iterable<MailboxAddress> | OpenPgpPublicKey[],
    entity: MimeEntity,
    cipher?: EncryptionAlgorithm,
  ): Promise<MultipartEncrypted> {
    if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
    if (signer == null) throw new TypeError('signer cannot be null or undefined');
    if (recipients == null) throw new TypeError('recipients cannot be null or undefined');
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    const armored = await ctx.signAndEncrypt(signer, digestAlgo, recipients, MultipartEncrypted.serialize(entity), cipher);
    return MultipartEncrypted.wrap(ctx, armored);
  }

  /** Decrypt the multipart/encrypted part, verifying any embedded signatures. */
  async decrypt(ctx: OpenPgpContext): Promise<DecryptResult> {
    if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
    this.checkDisposed('MultipartEncrypted');

    const protocol = this.contentType.parameters.get('protocol')?.trim();
    if (protocol == null || protocol === '')
      throw new FormatException('The multipart/encrypted part did not specify a protocol.');
    if (!ctx.supports(protocol))
      throw new NotSupportedError('The specified cryptography context does not support the encryption protocol.');
    if (this.count < 2)
      throw new FormatException('The multipart/encrypted part did not contain the expected children.');

    const version = this.at(0);
    if (!(version instanceof MimePart))
      throw new FormatException('The version part could not be found.');
    const versionType = `${version.contentType.mediaType}/${version.contentType.mediaSubtype}`;
    if (versionType.toLowerCase() !== protocol.toLowerCase())
      throw new FormatException('The version part does not match the protocol.');

    const encrypted = this.at(1);
    if (!(encrypted instanceof MimePart) || encrypted.content == null)
      throw new FormatException('The encrypted part could not be found.');
    if (!encrypted.contentType.isMimeType('application', 'octet-stream'))
      throw new FormatException('The encrypted part is not application/octet-stream.');

    const memory = new MemoryStream();
    encrypted.content.decodeTo(memory);
    const { data, signatures } = await ctx.decrypt(memory.toArray());

    const parser = new MimeParser(new MemoryStream(data), 'entity');
    const result = parser.parseEntity();
    if (!result.ok) throw new FormatException(result.error.message);
    return {
      entity: result.value,
      signatures: signatures.length > 0 ? new DigitalSignatureCollection(signatures) : null,
    };
  }
}
