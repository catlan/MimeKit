// Port of the S/MIME portions of MimeKit/Cryptography/ApplicationPkcs7Mime.cs.
//
// Crypto operations collapse to async (the C# sync methods + their `*Async`
// twins) because the C2b backend runs on WebCrypto. Entity serialization into
// the MemoryStream stays synchronous. The static factories delegate to the
// SecureMimeContext abstraction; every S/MIME test that exercises them
// (ApplicationPkcs7MimeTests, SecureMimeTests) is deferred to C2b.

import { ContentDisposition } from '../content-disposition.js';
import { FormatOptions } from '../format-options.js';
import { MemoryStream } from '../io/stream.js';
import { MimeContent } from '../mime-content.js';
import { MimeEntity, type MimeEntityConstructorArgs } from '../mime-entity.js';
import { MimePart } from '../mime-part.js';
import type { MailboxAddress } from '../mailbox-address.js';
import type { MimeVisitor } from '../mime-visitor.js';
import { Stream } from '../io/stream.js';
import { SecureMimeType } from './secure-mime-type.js';
import type { DigestAlgorithm } from './digest-algorithm.js';
import type { CmsSigner } from './cms-signer.js';
import type { CmsRecipientCollection } from './cms-recipient-collection.js';
import type { DigitalSignatureCollection } from './digital-signature-collection.js';
import { SecureMimeContext, createSecureMimeContext } from './secure-mime-context.js';

function serialize(entity: MimeEntity): Uint8Array {
  const memory = new MemoryStream();
  const options = FormatOptions.default.clone();
  options.newLineFormat = 'dos';
  entity.writeTo(options, memory);
  return memory.toArray();
}

function withDefaultContext<T>(fn: (ctx: SecureMimeContext) => Promise<T>): Promise<T> {
  const ctx = createSecureMimeContext();
  return fn(ctx).finally(() => ctx.dispose());
}

/**
 * An S/MIME part with a Content-Type of application/pkcs7-mime.
 */
export class ApplicationPkcs7Mime extends MimePart {
  /**
   * @param arg The parser constructor args, or the S/MIME type of the content.
   * @param stream The content stream (when constructing from a type).
   */
  constructor(args: MimeEntityConstructorArgs);
  constructor(type: SecureMimeType, stream: Stream);
  constructor(arg: MimeEntityConstructorArgs | SecureMimeType, stream?: Stream) {
    if (typeof arg === 'number') {
      super('application', 'pkcs7-mime');
      if (stream == null) throw new TypeError('stream cannot be null or undefined');
      this.contentDisposition = new ContentDisposition(ContentDisposition.attachment);
      this.contentTransferEncoding = 'base64';
      this.content = new MimeContent(stream);

      switch (arg) {
        case SecureMimeType.CompressedData:
          this.contentType.parameters.set('smime-type', 'compressed-data');
          this.contentDisposition.fileName = 'smime.p7z';
          this.contentType.name = 'smime.p7z';
          break;
        case SecureMimeType.EnvelopedData:
          this.contentType.parameters.set('smime-type', 'enveloped-data');
          this.contentDisposition.fileName = 'smime.p7m';
          this.contentType.name = 'smime.p7m';
          break;
        case SecureMimeType.SignedData:
          this.contentType.parameters.set('smime-type', 'signed-data');
          this.contentDisposition.fileName = 'smime.p7m';
          this.contentType.name = 'smime.p7m';
          break;
        case SecureMimeType.AuthEnvelopedData:
          this.contentType.parameters.set('smime-type', 'authenveloped-data');
          this.contentDisposition.fileName = 'smime.p7m';
          this.contentType.name = 'smime.p7m';
          break;
        case SecureMimeType.CertsOnly:
          this.contentType.parameters.set('smime-type', 'certs-only');
          this.contentDisposition.fileName = 'smime.p7c';
          this.contentType.name = 'smime.p7c';
          break;
        default:
          throw new RangeError(`type ${arg} is out of range`);
      }
      return;
    }
    super(arg);
  }

  /** The value of the "smime-type" parameter. */
  get secureMimeType(): SecureMimeType {
    const type = this.contentType.parameters.get('smime-type') as string | null;
    if (type == null) return SecureMimeType.Unknown;
    switch (type.toLowerCase()) {
      case 'authenveloped-data': return SecureMimeType.AuthEnvelopedData;
      case 'compressed-data': return SecureMimeType.CompressedData;
      case 'enveloped-data': return SecureMimeType.EnvelopedData;
      case 'signed-data': return SecureMimeType.SignedData;
      case 'certs-only': return SecureMimeType.CertsOnly;
      default: return SecureMimeType.Unknown;
    }
  }

  /**
   * Dispatches to the visitor method for application/pkcs7-mime entities.
   *
   * @param visitor The visitor.
   */
  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('ApplicationPkcs7Mime');
    visitor.visitApplicationPkcs7Mime(this);
  }

  private decodedContent(): Uint8Array {
    const memory = new MemoryStream();
    if (this.content != null) this.content.decodeTo(memory);
    return memory.toArray();
  }

  /** Decompress the compressed-data using the specified context. */
  async decompress(ctx?: SecureMimeContext): Promise<MimeEntity> {
    this.checkDisposed('ApplicationPkcs7Mime');
    if (ctx == null) return withDefaultContext((c) => this.decompress(c));
    if (this.secureMimeType !== SecureMimeType.CompressedData && this.secureMimeType !== SecureMimeType.Unknown)
      throw new Error('The smime-type parameter is not compressed-data.');
    return ctx.decompress(this.decodedContent());
  }

  /** Decrypt the enveloped-data using the specified context. */
  async decrypt(ctx?: SecureMimeContext): Promise<MimeEntity> {
    this.checkDisposed('ApplicationPkcs7Mime');
    if (ctx == null) return withDefaultContext((c) => this.decrypt(c));
    if (this.secureMimeType !== SecureMimeType.EnvelopedData && this.secureMimeType !== SecureMimeType.Unknown)
      throw new Error('The smime-type parameter is not enveloped-data.');
    return ctx.decrypt(this.decodedContent());
  }

  /** Import the certificates contained in the certs-only content. */
  async import(ctx: SecureMimeContext): Promise<void> {
    if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
    this.checkDisposed('ApplicationPkcs7Mime');
    return ctx.import(this.decodedContent());
  }

  /** Verify the signed-data and return the signatures and the unwrapped entity. */
  async verify(ctx?: SecureMimeContext): Promise<{ signatures: DigitalSignatureCollection; entity: MimeEntity }> {
    this.checkDisposed('ApplicationPkcs7Mime');
    if (ctx == null) return withDefaultContext((c) => this.verify(c));
    if (this.secureMimeType !== SecureMimeType.SignedData && this.secureMimeType !== SecureMimeType.Unknown)
      throw new Error('The smime-type parameter is not signed-data.');
    return ctx.verifyEncapsulated(this.decodedContent());
  }

  /** Compress the entity using the specified context. */
  static async compress(ctx: SecureMimeContext, entity: MimeEntity): Promise<ApplicationPkcs7Mime>;
  static async compress(entity: MimeEntity): Promise<ApplicationPkcs7Mime>;
  static async compress(
    ctxOrEntity: SecureMimeContext | MimeEntity,
    entity?: MimeEntity,
  ): Promise<ApplicationPkcs7Mime> {
    if (ctxOrEntity instanceof MimeEntity)
      return withDefaultContext((c) => ApplicationPkcs7Mime.compress(c, ctxOrEntity));
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    return ctxOrEntity.compress(serialize(entity));
  }

  /** Encrypt the entity to the specified recipients using the specified context. */
  static async encrypt(
    ctx: SecureMimeContext,
    recipients: CmsRecipientCollection,
    entity: MimeEntity,
  ): Promise<ApplicationPkcs7Mime>;
  static async encrypt(recipients: CmsRecipientCollection, entity: MimeEntity): Promise<ApplicationPkcs7Mime>;
  static async encrypt(
    ctxOrRecipients: SecureMimeContext | CmsRecipientCollection,
    recipientsOrEntity: CmsRecipientCollection | MimeEntity,
    entity?: MimeEntity,
  ): Promise<ApplicationPkcs7Mime> {
    if (ctxOrRecipients instanceof SecureMimeContext) {
      const recipients = recipientsOrEntity as CmsRecipientCollection;
      if (recipients == null) throw new TypeError('recipients cannot be null or undefined');
      if (entity == null) throw new TypeError('entity cannot be null or undefined');
      return ctxOrRecipients.encrypt(recipients, serialize(entity));
    }
    const recipients = ctxOrRecipients;
    const target = recipientsOrEntity as MimeEntity;
    if (recipients == null) throw new TypeError('recipients cannot be null or undefined');
    if (target == null) throw new TypeError('entity cannot be null or undefined');
    return withDefaultContext((c) => c.encrypt(recipients, serialize(target)));
  }

  /** Encrypt the entity to the specified recipient mailboxes (certificates resolved via the store). */
  static async encryptToMailboxes(
    ctx: SecureMimeContext,
    recipients: Iterable<MailboxAddress>,
    entity: MimeEntity,
  ): Promise<ApplicationPkcs7Mime>;
  static async encryptToMailboxes(
    recipients: Iterable<MailboxAddress>,
    entity: MimeEntity,
  ): Promise<ApplicationPkcs7Mime>;
  static async encryptToMailboxes(
    ctxOrRecipients: SecureMimeContext | Iterable<MailboxAddress>,
    recipientsOrEntity: Iterable<MailboxAddress> | MimeEntity,
    entity?: MimeEntity,
  ): Promise<ApplicationPkcs7Mime> {
    if (ctxOrRecipients instanceof SecureMimeContext) {
      const recipients = recipientsOrEntity as Iterable<MailboxAddress>;
      if (entity == null) throw new TypeError('entity cannot be null or undefined');
      return ctxOrRecipients.encryptToMailboxes(recipients, serialize(entity));
    }
    const recipients = ctxOrRecipients;
    const target = recipientsOrEntity as MimeEntity;
    if (target == null) throw new TypeError('entity cannot be null or undefined');
    return withDefaultContext((c) => c.encryptToMailboxes(recipients, serialize(target)));
  }

  /** Sign the entity (encapsulated signed-data) using the specified context. */
  static async sign(ctx: SecureMimeContext, signer: CmsSigner, entity: MimeEntity): Promise<ApplicationPkcs7Mime>;
  static async sign(signer: CmsSigner, entity: MimeEntity): Promise<ApplicationPkcs7Mime>;
  static async sign(
    ctxOrSigner: SecureMimeContext | CmsSigner,
    signerOrEntity: CmsSigner | MimeEntity,
    entity?: MimeEntity,
  ): Promise<ApplicationPkcs7Mime> {
    if (ctxOrSigner instanceof SecureMimeContext) {
      const signer = signerOrEntity as CmsSigner;
      if (signer == null) throw new TypeError('signer cannot be null or undefined');
      if (entity == null) throw new TypeError('entity cannot be null or undefined');
      return ctxOrSigner.encapsulatedSign(signer, serialize(entity));
    }
    const signer = ctxOrSigner;
    const target = signerOrEntity as MimeEntity;
    if (signer == null) throw new TypeError('signer cannot be null or undefined');
    if (target == null) throw new TypeError('entity cannot be null or undefined');
    return withDefaultContext((c) => c.encapsulatedSign(signer, serialize(target)));
  }

  /** Sign the entity using a signer mailbox and digest algorithm (signer resolved via the store). */
  static async signWithMailbox(
    ctx: SecureMimeContext,
    signer: MailboxAddress,
    digestAlgo: DigestAlgorithm,
    entity: MimeEntity,
  ): Promise<ApplicationPkcs7Mime> {
    if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
    if (signer == null) throw new TypeError('signer cannot be null or undefined');
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    return ctx.encapsulatedSignWithMailbox(signer, digestAlgo, serialize(entity));
  }

  /** Sign and then encrypt the entity using the specified context. */
  static async signAndEncrypt(
    ctx: SecureMimeContext,
    signer: CmsSigner,
    recipients: CmsRecipientCollection,
    entity: MimeEntity,
  ): Promise<ApplicationPkcs7Mime> {
    if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
    if (signer == null) throw new TypeError('signer cannot be null or undefined');
    if (recipients == null) throw new TypeError('recipients cannot be null or undefined');
    if (entity == null) throw new TypeError('entity cannot be null or undefined');
    const signed = await ctx.encapsulatedSign(signer, serialize(entity));
    return ctx.encrypt(recipients, serialize(signed));
  }
}
