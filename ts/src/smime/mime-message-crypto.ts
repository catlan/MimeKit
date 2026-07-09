// Message-level S/MIME crypto for MimeMessage (C#: MimeMessage.Sign/Encrypt/SignAndEncrypt).
//
// In C# these live on MimeMessage guarded by `#if ENABLE_CRYPTO`. The TS core must
// stay crypto-free (the `.` entry has no crypto dependency), so the methods are added
// to MimeMessage.prototype here — they only exist once `mimekit-ts/smime` is imported.
// The signer/recipient resolution helpers (getMessageSigner / getEncryptionRecipients)
// are pure address logic and live in core.

import { MimeMessage } from '../mime-message.js';
import { DigestAlgorithm } from './digest-algorithm.js';
import { MultipartSigned } from './multipart-signed.js';
import { ApplicationPkcs7Mime } from './application-pkcs7-mime.js';
import type { SecureMimeContext } from './secure-mime-context.js';

declare module '../mime-message.js' {
  interface MimeMessage {
    /**
     * Sign the message body in place using the specified S/MIME context.
     *
     * The signer is resolved from the message's Resent-Sender/Resent-From or
     * Sender/From address; the body is replaced with a `multipart/signed`.
     *
     * @param ctx The S/MIME context.
     * @param digestAlgo The digest algorithm (defaults to SHA-1, matching C#).
     */
    sign(ctx: SecureMimeContext, digestAlgo?: DigestAlgorithm): Promise<void>;
    /**
     * Encrypt the message body in place to the sender and all recipients using
     * the specified S/MIME context. The body is replaced with an
     * `application/pkcs7-mime` enveloped-data part.
     *
     * @param ctx The S/MIME context.
     */
    encrypt(ctx: SecureMimeContext): Promise<void>;
    /**
     * Sign and then encrypt the message body in place using the specified
     * S/MIME context.
     *
     * @param ctx The S/MIME context.
     * @param digestAlgo The digest algorithm (defaults to SHA-1, matching C#).
     */
    signAndEncrypt(ctx: SecureMimeContext, digestAlgo?: DigestAlgorithm): Promise<void>;
  }
}

MimeMessage.prototype.sign = async function sign(
  this: MimeMessage,
  ctx: SecureMimeContext,
  digestAlgo: DigestAlgorithm = DigestAlgorithm.Sha1,
): Promise<void> {
  if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
  if (this.body == null) throw new Error('No message body has been set.');
  const signer = this.getMessageSigner();
  if (signer == null) throw new Error('The sender has not been set.');
  this.body = await MultipartSigned.create(ctx, signer, digestAlgo, this.body);
};

MimeMessage.prototype.encrypt = async function encrypt(
  this: MimeMessage,
  ctx: SecureMimeContext,
): Promise<void> {
  if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
  if (this.body == null) throw new Error('No message body has been set.');
  const recipients = this.getEncryptionRecipients();
  if (recipients.length === 0) throw new Error('No recipients have been set.');
  this.body = await ApplicationPkcs7Mime.encryptToMailboxes(ctx, recipients, this.body);
};

MimeMessage.prototype.signAndEncrypt = async function signAndEncrypt(
  this: MimeMessage,
  ctx: SecureMimeContext,
  digestAlgo: DigestAlgorithm = DigestAlgorithm.Sha1,
): Promise<void> {
  if (ctx == null) throw new TypeError('ctx cannot be null or undefined');
  if (this.body == null) throw new Error('No message body has been set.');
  const signer = this.getMessageSigner();
  if (signer == null) throw new Error('The sender has not been set.');
  const recipients = this.getEncryptionRecipients();
  if (recipients.length === 0) throw new Error('No recipients have been set.');
  this.body = await ApplicationPkcs7Mime.signAndEncryptToMailboxes(ctx, signer, digestAlgo, recipients, this.body);
};
