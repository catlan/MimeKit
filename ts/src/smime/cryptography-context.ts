// The minimal cryptography-context surface shared by S/MIME and OpenPGP for
// detached multipart/signed signing and verification (mirrors the relevant slice
// of C#'s CryptographyContext base). Both SecureMimeContext and OpenPgpContext
// satisfy this structurally; MultipartSigned depends only on this interface so it
// works for either protocol.

import type { MailboxAddress } from '../mailbox-address.js';
import type { MimePart } from '../mime-part.js';
import type { DigestAlgorithm } from './digest-algorithm.js';
import type { DigitalSignatureCollection } from './digital-signature-collection.js';

/** A cryptography context capable of detached signing and verification. */
export interface CryptographyContext {
  /** The MIME protocol used for detached signatures (e.g. `application/pkcs7-signature`). */
  readonly signatureProtocol: string;
  /** The MIME protocol used for encrypted content (e.g. `application/pkcs7-mime`). */
  readonly encryptionProtocol: string;
  /** Whether the entity should be prepared (7bit/CRLF) before signing. */
  readonly prepareBeforeSigning: boolean;
  /** Whether this context supports the given MIME protocol. */
  supports(protocol: string): boolean;
  /** The `micalg` parameter name for the digest algorithm. */
  getDigestAlgorithmName(micalg: DigestAlgorithm): string;
  /** Sign `content` with the signer mailbox, returning the detached signature MIME part. */
  signWithMailbox(signer: MailboxAddress, digestAlgo: DigestAlgorithm, content: Uint8Array): Promise<MimePart>;
  /** Verify a detached signature over `content`. */
  verifyDetached(content: Uint8Array, signatureData: Uint8Array): Promise<DigitalSignatureCollection>;
}
