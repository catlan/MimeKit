// Message-level S/MIME crypto for MimeMessage (C#: MimeMessage.Sign/Encrypt/SignAndEncrypt).
//
// In C# these live on MimeMessage guarded by `#if ENABLE_CRYPTO`. The TS core must
// stay crypto-free (the `.` entry has no crypto dependency), so the methods are added
// to MimeMessage.prototype here — they only exist once `mimekit/smime` is imported.
// The signer/recipient resolution helpers (getMessageSigner / getEncryptionRecipients)
// are pure address logic and live in core.

import { MimeMessage } from '../mime-message.js';
import type { MailboxAddress } from '../mailbox-address.js';
import type { MimeEntity } from '../mime-entity.js';
import { DigestAlgorithm } from './digest-algorithm.js';
import { MultipartSigned } from './multipart-signed.js';
import { ApplicationPkcs7Mime } from './application-pkcs7-mime.js';
import type { CryptographyContext } from './cryptography-context.js';
import type { SecureMimeContext } from './secure-mime-context.js';

/**
 * The OpenPGP message-encryption operations, registered by the `mimekit/openpgp`
 * entry so `MimeMessage.encrypt`/`signAndEncrypt` can dispatch to PGP/MIME without the
 * (crypto-free-of-OpenPGP) S/MIME layer importing it.
 */
export interface PgpMessageCrypto {
  encrypt(ctx: CryptographyContext, recipients: MailboxAddress[], body: MimeEntity): Promise<MimeEntity>;
  signAndEncrypt(
    ctx: CryptographyContext,
    signer: MailboxAddress,
    digestAlgo: DigestAlgorithm,
    recipients: MailboxAddress[],
    body: MimeEntity,
  ): Promise<MimeEntity>;
}

let pgpMessageCrypto: PgpMessageCrypto | null = null;

/** Register the OpenPGP message-encryption handler (called by the openpgp entry). */
export function registerPgpMessageCrypto(handler: PgpMessageCrypto | null): void {
  pgpMessageCrypto = handler;
}

function requirePgp(ctx: CryptographyContext): PgpMessageCrypto {
  if (pgpMessageCrypto == null)
    throw new Error(
      `The cryptography context uses the '${ctx.encryptionProtocol}' protocol, which requires the 'mimekit/openpgp' entry to be imported.`,
    );
  return pgpMessageCrypto;
}

/** Whether the context encrypts via S/MIME (application/pkcs7-mime) rather than PGP. */
function isSecureMime(ctx: CryptographyContext): boolean {
  return ctx.encryptionProtocol === 'application/pkcs7-mime';
}

declare module '../mime-message.js' {
  interface MimeMessage {
    /**
     * Sign the message body in place using the specified S/MIME or OpenPGP context.
     *
     * The signer is resolved from the message's Resent-Sender/Resent-From or
     * Sender/From address; the body is replaced with a `multipart/signed`.
     *
     * @param ctx The cryptography context.
     * @param digestAlgo The digest algorithm (defaults to SHA-1, matching C#).
     */
    sign(ctx: CryptographyContext, digestAlgo?: DigestAlgorithm): Promise<void>;
    /**
     * Encrypt the message body in place to the sender and all recipients. The body
     * is replaced with an `application/pkcs7-mime` (S/MIME) or `multipart/encrypted`
     * (PGP/MIME) part, depending on the context.
     *
     * @param ctx The cryptography context.
     */
    encrypt(ctx: CryptographyContext): Promise<void>;
    /**
     * Sign and then encrypt the message body in place using the specified context.
     *
     * @param ctx The cryptography context.
     * @param digestAlgo The digest algorithm (defaults to SHA-1, matching C#).
     */
    signAndEncrypt(ctx: CryptographyContext, digestAlgo?: DigestAlgorithm): Promise<void>;
  }
}

MimeMessage.prototype.sign = async function sign(
  this: MimeMessage,
  ctx: CryptographyContext,
  digestAlgo: DigestAlgorithm = DigestAlgorithm.Sha1,
): Promise<void> {
  // multipart/signed signing is protocol-agnostic (S/MIME and PGP both go through
  // MultipartSigned.create with a mailbox signer).
  if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
  if (this.body == null) throw new Error('No message body has been set.');
  const signer = this.getMessageSigner();
  if (signer == null) throw new Error('The sender has not been set.');
  this.body = await MultipartSigned.create(ctx, signer, digestAlgo, this.body);
};

MimeMessage.prototype.encrypt = async function encrypt(
  this: MimeMessage,
  ctx: CryptographyContext,
): Promise<void> {
  if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
  if (this.body == null) throw new Error('No message body has been set.');
  const recipients = this.getEncryptionRecipients();
  if (recipients.length === 0) throw new Error('No recipients have been set.');
  this.body = isSecureMime(ctx)
    ? await ApplicationPkcs7Mime.encryptToMailboxes(ctx as unknown as SecureMimeContext, recipients, this.body)
    : await requirePgp(ctx).encrypt(ctx, recipients, this.body);
};

MimeMessage.prototype.signAndEncrypt = async function signAndEncrypt(
  this: MimeMessage,
  ctx: CryptographyContext,
  digestAlgo: DigestAlgorithm = DigestAlgorithm.Sha1,
): Promise<void> {
  if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
  if (this.body == null) throw new Error('No message body has been set.');
  const signer = this.getMessageSigner();
  if (signer == null) throw new Error('The sender has not been set.');
  const recipients = this.getEncryptionRecipients();
  if (recipients.length === 0) throw new Error('No recipients have been set.');
  this.body = isSecureMime(ctx)
    ? await ApplicationPkcs7Mime.signAndEncryptToMailboxes(
        ctx as unknown as SecureMimeContext,
        signer,
        digestAlgo,
        recipients,
        this.body,
      )
    : await requirePgp(ctx).signAndEncrypt(ctx, signer, digestAlgo, recipients, this.body);
};
