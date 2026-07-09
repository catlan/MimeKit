// Port of the S/MIME portions of MimeKit/Cryptography/MultipartSigned.cs.
//
// The PGP overloads (Create from PgpSecretKey / OpenPgpContext) are out of scope
// for this wave. Crypto operations collapse to async (the C# sync `Create` /
// `Verify` + their `*Async` twins become single async methods) because the C2b
// backend signs/verifies on WebCrypto. Serialization into the MemoryStream stays
// synchronous.

import { FilteredStream } from '../io/filtered-stream.js';
import { MemoryStream } from '../io/stream.js';
import { ArmoredFromFilter } from '../io/filters/armored-from-filter.js';
import { TrailingWhitespaceFilter } from '../io/filters/trailing-whitespace-filter.js';
import { FormatOptions, MINIMUM_LINE_LENGTH, MAXIMUM_LINE_LENGTH } from '../format-options.js';
import { MimeParser } from '../mime-parser.js';
import { MimeEntity, type MimeEntityConstructorArgs } from '../mime-entity.js';
import { MimePart } from '../mime-part.js';
import { Multipart } from '../multipart.js';
import type { MailboxAddress } from '../mailbox-address.js';
import type { MimeVisitor } from '../mime-visitor.js';
import type { DigestAlgorithm } from './digest-algorithm.js';
import type { CmsSigner } from './cms-signer.js';
import type { DigitalSignatureCollection } from './digital-signature-collection.js';
import { SecureMimeContext, createSecureMimeContext } from './secure-mime-context.js';
import { FormatException, NotSupportedError } from './errors.js';

/**
 * A signed multipart (multipart/signed), as used by S/MIME (and PGP/MIME). The
 * first child is the content; the second child is the detached signature.
 */
export class MultipartSigned extends Multipart {
  constructor(args: MimeEntityConstructorArgs);
  constructor();
  constructor(args?: MimeEntityConstructorArgs) {
    if (args === undefined) {
      super('signed');
      return;
    }
    super(args);
  }

  /**
   * Dispatches to the visitor method for multipart/signed entities.
   *
   * @param visitor The visitor.
   */
  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MultipartSigned');
    visitor.visitMultipartSigned(this);
  }

  private static prepare(ctx: SecureMimeContext, entity: MimeEntity, memory: MemoryStream): MimeEntity {
    if (ctx.prepareBeforeSigning)
      entity.prepare('7bit', 78);

    const filtered = new FilteredStream(memory);
    if (ctx.prepareBeforeSigning) {
      // rfc3156, section 3 (second note) + section 5.4.
      filtered.add(new ArmoredFromFilter());
      filtered.add(new TrailingWhitespaceFilter());
    }

    // rfc2015 / rfc3156, section 5.1 — sign with canonical CRLF line endings.
    const options = FormatOptions.default.clone();
    options.newLineFormat = 'dos';

    entity.writeTo(options, filtered);
    filtered.flush();

    memory.position = 0;

    // Parse the modified entity structure to preserve any modifications.
    const parser = new MimeParser(memory, 'entity');
    const result = parser.parseEntity();
    if (!result.ok) throw new FormatException(result.error.message);
    return result.value;
  }

  private static build(
    ctx: SecureMimeContext,
    digestAlgo: DigestAlgorithm,
    entity: MimeEntity,
    signature: MimeEntity,
  ): MultipartSigned {
    const micalg = ctx.getDigestAlgorithmName(digestAlgo);
    const signed = new MultipartSigned();

    signed.contentType.parameters.set('protocol', ctx.signatureProtocol);
    signed.contentType.parameters.set('micalg', micalg);

    signed.add(entity);
    signed.add(signature);

    return signed;
  }

  /**
   * Create a new multipart/signed by signing the entity with a {@link CmsSigner}.
   *
   * @param ctx The S/MIME context to use for signing.
   * @param signer The signer.
   * @param entity The entity to sign.
   */
  static async create(ctx: SecureMimeContext, signer: CmsSigner, entity: MimeEntity): Promise<MultipartSigned>;
  /**
   * Create a new multipart/signed by signing the entity with a signer mailbox
   * and digest algorithm (the signing certificate is resolved via the context's
   * certificate store).
   */
  static async create(
    ctx: SecureMimeContext,
    signer: MailboxAddress,
    digestAlgo: DigestAlgorithm,
    entity: MimeEntity,
  ): Promise<MultipartSigned>;
  static async create(
    ctx: SecureMimeContext,
    signer: CmsSigner | MailboxAddress,
    entityOrDigest: MimeEntity | DigestAlgorithm,
    maybeEntity?: MimeEntity,
  ): Promise<MultipartSigned> {
    if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
    if (signer == null) throw new TypeError('signer cannot be null or undefined');

    if (maybeEntity !== undefined) {
      // (ctx, mailbox, digestAlgo, entity)
      const mailbox = signer as MailboxAddress;
      const digestAlgo = entityOrDigest as DigestAlgorithm;
      const entity = maybeEntity;
      if (entity == null) throw new TypeError('entity cannot be null or undefined');

      const memory = new MemoryStream();
      const prepared = MultipartSigned.prepare(ctx, entity, memory);
      memory.position = 0;
      const signature = await ctx.signWithMailbox(mailbox, digestAlgo, memory.toArray());
      return MultipartSigned.build(ctx, digestAlgo, prepared, signature);
    }

    // (ctx, cmsSigner, entity)
    const cmsSigner = signer as CmsSigner;
    const entity = entityOrDigest as MimeEntity;
    if (entity == null) throw new TypeError('entity cannot be null or undefined');

    const memory = new MemoryStream();
    const prepared = MultipartSigned.prepare(ctx, entity, memory);
    memory.position = 0;
    const signature = await ctx.sign(cmsSigner, memory.toArray());
    return MultipartSigned.build(ctx, cmsSigner.digestAlgorithm, prepared, signature);
  }

  /**
   * Create a new multipart/signed using the default S/MIME context (requires a
   * registered crypto backend, wave C2b).
   */
  static async createDefault(signer: CmsSigner, entity: MimeEntity): Promise<MultipartSigned> {
    const ctx = createSecureMimeContext();
    try {
      return await MultipartSigned.create(ctx, signer, entity);
    } finally {
      ctx.dispose();
    }
  }

  /** The children are already signed, so preparing them would break the signature. */
  override prepare(_constraint: string, maxLineLength = 78): void {
    if (maxLineLength < MINIMUM_LINE_LENGTH || maxLineLength > MAXIMUM_LINE_LENGTH)
      throw new RangeError('maxLineLength is out of range');
    // Intentionally no-op: do not re-prepare already-signed children.
  }

  /**
   * Verify the multipart/signed part using the supplied S/MIME context.
   *
   * @param ctx The S/MIME context to use for verifying the signature.
   * @throws {FormatException} The multipart is malformed.
   * @throws {NotSupportedError} The context does not support the protocol.
   */
  async verify(ctx: SecureMimeContext): Promise<DigitalSignatureCollection>;
  /** Verify using the default S/MIME context (requires a registered backend). */
  async verify(): Promise<DigitalSignatureCollection>;
  async verify(ctx?: SecureMimeContext): Promise<DigitalSignatureCollection> {
    this.checkDisposed('MultipartSigned');

    if (ctx === undefined) {
      const protocol = this.contentType.parameters.get('protocol')?.trim();
      if (protocol == null || protocol === '')
        throw new FormatException('The multipart/signed part did not specify a protocol.');
      const created = createSecureMimeContext();
      try {
        return await this.verify(created);
      } finally {
        created.dispose();
      }
    }

    const protocol = this.contentType.parameters.get('protocol')?.trim();
    if (protocol == null || protocol === '')
      throw new FormatException('The multipart/signed part did not specify a protocol.');

    if (!ctx.supports(protocol))
      throw new NotSupportedError('The specified cryptography context does not support the signature protocol.');

    if (this.count < 2)
      throw new FormatException('The multipart/signed part did not contain the expected children.');

    const signature = this.at(1);
    if (!(signature instanceof MimePart) || signature.content == null)
      throw new FormatException('The signature part could not be found.');

    const ctype = signature.contentType;
    const value = `${ctype.mediaType}/${ctype.mediaSubtype}`;
    if (!ctx.supports(value))
      throw new NotSupportedError(`The specified cryptography context does not support '${value}'.`);

    const signatureData = new MemoryStream();
    signature.content.decodeTo(signatureData);

    const cleartext = new MemoryStream();
    // rfc2015 / rfc3156, section 5.1.
    const options = FormatOptions.default.clone();
    options.newLineFormat = 'dos';
    this.at(0).writeTo(options, cleartext);

    return ctx.verifyDetached(cleartext.toArray(), signatureData.toArray());
  }
}
