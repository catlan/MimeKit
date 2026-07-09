// Public surface of the S/MIME foundation (mimekit-ts/smime).
//
// This is wave C2a — the portable foundation. It binds NO crypto library; the
// concrete pkijs/WebCrypto-backed SecureMimeContext + certificate store arrive
// in wave C2b and implement the abstractions exported here. Importing this
// module registers the S/MIME MIME types with the core parser (via
// create-entity's registration seam), so `application/pkcs7-*` and
// `multipart/signed` parse into their concrete wrapper classes.

import { registerEntityType } from '../create-entity.js';
import { MultipartSigned } from './multipart-signed.js';
import { ApplicationPkcs7Mime } from './application-pkcs7-mime.js';
import { ApplicationPkcs7Signature } from './application-pkcs7-signature.js';

// Enums
export { EncryptionAlgorithm, encryptionAlgorithmCount } from './encryption-algorithm.js';
export { DigestAlgorithm, digestAlgorithmValues } from './digest-algorithm.js';
export { PublicKeyAlgorithm } from './public-key-algorithm.js';
export { RsaEncryptionPaddingScheme } from './rsa-encryption-padding-scheme.js';
export { RsaSignaturePaddingScheme } from './rsa-signature-padding-scheme.js';
export { SecureMimeType } from './secure-mime-type.js';
export { SubjectIdentifierType } from './subject-identifier-type.js';
export { X509KeyUsageFlags, X509KeyUsageBits } from './x509-key-usage-flags.js';

// Value types
export { RsaEncryptionPadding, AlgorithmIdentifier, RsaesOaepParameters } from './rsa-encryption-padding.js';
export { RsaSignaturePadding } from './rsa-signature-padding.js';
export { CmsSigner, canSign, type AttributeTable, type Pkcs12Loader } from './cms-signer.js';
export { CmsRecipient } from './cms-recipient.js';
export { CmsRecipientCollection } from './cms-recipient-collection.js';
export { SecureMimeDigitalCertificate } from './secure-mime-digital-certificate.js';
export { SecureMimeDigitalSignature, type SignerInformation } from './secure-mime-digital-signature.js';
export { SecureMailboxAddress } from './secure-mailbox-address.js';
export { DigitalSignatureCollection } from './digital-signature-collection.js';
export type { IDigitalSignature, IDigitalCertificate } from './digital-signature.js';
export type { X509Certificate, AsymmetricKey } from './x509-certificate.js';
export { X509CertificateChain } from './x509-certificate-chain.js';

// Exceptions
export {
  NotSupportedError,
  FormatException,
  CmsRecipientException,
  CmsEnvelopeException,
  PrivateKeyNotFoundException,
  CertificateNotFoundException,
  DigitalSignatureVerifyException,
} from './errors.js';

// The abstraction + crypto/store seams
export {
  SecureMimeContext,
  registerSecureMimeContext,
  createSecureMimeContext,
  type ISecureMimeStore,
  type PrivateKeyEntry,
} from './secure-mime-context.js';

// MIME wrappers
export { MultipartSigned } from './multipart-signed.js';
export { ApplicationPkcs7Mime } from './application-pkcs7-mime.js';
export { ApplicationPkcs7Signature } from './application-pkcs7-signature.js';

// ---- Concrete crypto backend (wave C2b-1: X.509 + key import) ----------------
//
// These bind pkijs / asn1js / @noble and back the C2a structural seams. Importing
// this subpath (`mimekit-ts/smime`) pulls the S/MIME crypto peers; the core
// (`mimekit-ts`) entry never imports this module, so it stays crypto-free.
export {
  X509CertificateImpl,
} from './x509-certificate-impl.js';
export {
  X509PrivateKey,
  X509PublicKey,
  importPrivateKeyFromPkcs8,
  importPublicKeyFromSpki,
  loadPrivateKeyFromPem,
  loadPublicKeyFromPem,
  publicKeyAlgorithmFromOid,
  type X509AsymmetricKey,
} from './asymmetric-key.js';
export { DefaultPkcs12Loader, loadPkcs12 } from './pkcs12-loader.js';
export { buildCertificateChain } from './chain-builder.js';
export { InMemorySecureMimeStore, canEncrypt, parseCertificates } from './in-memory-store.js';

// ---- Concrete crypto engine (wave C2b-2a: CMS SignedData/EnvelopedData/CompressedData)
export {
  PkijsSecureMimeContext,
  type PkijsSecureMimeContextOptions,
} from './pkijs-secure-mime-context.js';

// Register the concrete PKCS#12 loader so `CmsSigner.load(...)` works.
import { CmsSigner } from './cms-signer.js';
import { DefaultPkcs12Loader } from './pkcs12-loader.js';
CmsSigner.pkcs12Loader = new DefaultPkcs12Loader();

// Register the default S/MIME context factory so the no-context wrapper
// overloads (multipartSigned.verify(), pkcs7.decrypt(), ...) work.
import { registerSecureMimeContext } from './secure-mime-context.js';
import { PkijsSecureMimeContext } from './pkijs-secure-mime-context.js';
registerSecureMimeContext(() => new PkijsSecureMimeContext());

// Wire the S/MIME MIME types into the core parser's create-entity dispatch.
registerEntityType('multipart', 'signed', (args) => new MultipartSigned(args));
registerEntityType('application', 'pkcs7-mime', (args) => new ApplicationPkcs7Mime(args));
registerEntityType('application', 'x-pkcs7-mime', (args) => new ApplicationPkcs7Mime(args));
registerEntityType('application', 'pkcs7-signature', (args) => new ApplicationPkcs7Signature(args));
registerEntityType('application', 'x-pkcs7-signature', (args) => new ApplicationPkcs7Signature(args));
