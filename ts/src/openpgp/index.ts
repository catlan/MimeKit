// The `mimekit-ts/openpgp` entry point: OpenPGP (PGP/MIME, RFC 3156) support.
//
// Importing this module installs the OpenPGP MIME types into the parser, wires the
// message-level PGP encryption handler, and re-exports the public OpenPGP API. It is
// the only entry that pulls in the (LGPL) `openpgp` dependency, via the OpenPgpEngine.

import { registerEntityType } from '../create-entity.js';
import { registerPgpMessageCrypto } from '../smime/mime-message-crypto.js';
import { MultipartSigned } from '../smime/multipart-signed.js';
import { MultipartEncrypted } from './multipart-encrypted.js';
import { ApplicationPgpEncrypted } from './application-pgp-encrypted.js';
import { ApplicationPgpSignature } from './application-pgp-signature.js';
import type { OpenPgpContext } from './openpgp-context.js';

// Wire the PGP/MIME types into the core parser's create-entity dispatch. multipart/signed
// is also registered here (a map overwrite; harmless if the S/MIME entry registered it too)
// so that importing only `mimekit-ts/openpgp` still parses received PGP-signed mail as a
// MultipartSigned (the class is protocol-agnostic).
registerEntityType('multipart', 'signed', (args) => new MultipartSigned(args));
registerEntityType('multipart', 'encrypted', (args) => new MultipartEncrypted(args));
registerEntityType('application', 'pgp-encrypted', (args) => new ApplicationPgpEncrypted(args));
registerEntityType('application', 'pgp-signature', (args) => new ApplicationPgpSignature(args));

// Register the message-level PGP encryption handler so MimeMessage.encrypt/signAndEncrypt
// dispatch to PGP/MIME when given an OpenPgpContext.
registerPgpMessageCrypto({
  async encrypt(ctx, recipients, body) {
    return MultipartEncrypted.encrypt(ctx as unknown as OpenPgpContext, recipients, body);
  },
  async signAndEncrypt(ctx, signer, digestAlgo, recipients, body) {
    return MultipartEncrypted.signAndEncrypt(ctx as unknown as OpenPgpContext, signer, digestAlgo, recipients, body);
  },
});

export { OpenPgpContext, type OpenPgpContextOptions, type OpenPgpPasswordProvider } from './openpgp-context.js';
export {
  OpenPgpJsEngine,
  type OpenPgpEngine,
  type OpenPgpPublicKey,
  type OpenPgpPrivateKey,
  type OpenPgpVerification,
  type OpenPgpDecryptResult,
} from './engine.js';
export { MultipartEncrypted, type DecryptResult } from './multipart-encrypted.js';
export { ApplicationPgpEncrypted } from './application-pgp-encrypted.js';
export { ApplicationPgpSignature } from './application-pgp-signature.js';
export { OpenPgpDigitalSignature } from './openpgp-digital-signature.js';
export { OpenPgpDigitalCertificate } from './openpgp-digital-certificate.js';
