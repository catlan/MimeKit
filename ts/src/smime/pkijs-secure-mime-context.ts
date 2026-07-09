// The concrete pkijs/WebCrypto-backed SecureMimeContext (wave C2b-2a).
//
// Implements the abstract async CMS primitives declared by the C2a foundation
// (secure-mime-context.ts) against the crypto/ engine: SignedData sign/verify
// (detached + encapsulated), EnvelopedData encrypt/decrypt, and CompressedData
// compress/decompress. Certificate/key storage is the injectable
// ISecureMimeStore (default: in-memory). Matches BouncyCastleSecureMimeContext
// semantics (OIDs, signed attributes, the detached-content wrapping) so the wire
// format interoperates with MimeKit and the wider S/MIME world.

import { SecureMimeContext, type ISecureMimeStore, type PrivateKeyEntry } from './secure-mime-context.js';
import { InMemorySecureMimeStore } from './in-memory-store.js';
import { ApplicationPkcs7Mime } from './application-pkcs7-mime.js';
import { ApplicationPkcs7Signature } from './application-pkcs7-signature.js';
import { SecureMimeType } from './secure-mime-type.js';
import { DigestAlgorithm } from './digest-algorithm.js';
import { EncryptionAlgorithm } from './encryption-algorithm.js';
import { SubjectIdentifierType } from './subject-identifier-type.js';
import { DigitalSignatureCollection } from './digital-signature-collection.js';
import {
  SecureMimeDigitalSignature, type SignerInformation,
} from './secure-mime-digital-signature.js';
import { X509CertificateImpl } from './x509-certificate-impl.js';
import { buildCertificateChain } from './chain-builder.js';
import { CmsSigner } from './cms-signer.js';
import { CmsRecipient } from './cms-recipient.js';
import { CmsRecipientCollection } from './cms-recipient-collection.js';
import { CertificateNotFoundException, PrivateKeyNotFoundException, FormatException } from './errors.js';
import { MemoryStream } from '../io/stream.js';
import { MimeParser } from '../mime-parser.js';
import type { MimeEntity } from '../mime-entity.js';
import type { MailboxAddress } from '../mailbox-address.js';
import type { X509Certificate } from './x509-certificate.js';
import type { X509PrivateKey } from './asymmetric-key.js';

import {
  buildSignedData, parseSignedData, findSignerCertificate, verifySignerInfo,
  extractSigningTime, extractSmimeCapabilities, extractDigestAlgorithm,
  type SignMaterial, type ParsedSignedData,
} from './crypto/cms-signed.js';
import {
  buildEnvelopedData, decryptEnvelopedData, type EnvelopeRecipient, type DecryptCandidate,
} from './crypto/cms-enveloped.js';
import { buildCompressedData, decompressCompressedData } from './crypto/cms-compressed.js';

/** Options for {@link PkijsSecureMimeContext}. */
export interface PkijsSecureMimeContextOptions {
  /**
   * Browser opt-in for legacy RSA PKCS#1 v1.5 key-transport decryption (unaudited
   * timing — see CRYPTO-PLAN §7). Ignored on Node, which always uses the
   * constant-time OpenSSL path. Default `false`.
   */
  allowLegacyDecryption?: boolean;
}

function streamOf(bytes: Uint8Array): MemoryStream {
  return new MemoryStream(bytes);
}

/** A SignerInformation backed by a parsed pkijs SignedData signer info. */
class PkijsSignerInformation implements SignerInformation {
  constructor(
    private readonly parsed: ParsedSignedData,
    private readonly index: number,
    private readonly detachedContent: Uint8Array | null,
  ) {}

  private get si() {
    return this.parsed.signedData.signerInfos[this.index]!;
  }

  async verify(_certificate: X509Certificate): Promise<boolean> {
    return verifySignerInfo(this.parsed, this.index, this.detachedContent);
  }

  getSigningTime(): Date | null {
    return extractSigningTime(this.si);
  }

  getSmimeCapabilities(): EncryptionAlgorithm[] {
    return extractSmimeCapabilities(this.si);
  }

  getDigestAlgorithm(): DigestAlgorithm {
    return extractDigestAlgorithm(this.si);
  }
}

/** The concrete pkijs/WebCrypto-backed S/MIME context. */
export class PkijsSecureMimeContext extends SecureMimeContext {
  private readonly concreteStore: InMemorySecureMimeStore;
  readonly allowLegacyDecryption: boolean;

  constructor(store?: ISecureMimeStore, options: PkijsSecureMimeContextOptions = {}) {
    const concrete = store instanceof InMemorySecureMimeStore ? store : new InMemorySecureMimeStore();
    super(store ?? concrete);
    this.concreteStore = concrete;
    this.allowLegacyDecryption = options.allowLegacyDecryption ?? false;
  }

  /** The in-memory certificate/key store backing this context. */
  get certificateStore(): InMemorySecureMimeStore {
    return this.concreteStore;
  }

  // ---- signing --------------------------------------------------------------

  private signMaterialFromSigner(signer: CmsSigner): SignMaterial {
    const chain: X509Certificate[] = [];
    for (let i = 0; i < signer.certificateChain.count; i++) chain.push(signer.certificateChain.get(i));
    return {
      certChainDer: chain.map((c) => c.getEncoded()),
      pkcs8: (signer.privateKey as X509PrivateKey).pkcs8,
      publicKeyAlgorithm: signer.certificate.getPublicKeyAlgorithm(),
      digestAlgorithm: signer.digestAlgorithm,
      signerIdentifierType: signer.signerIdentifierType,
      rsaSignaturePadding: signer.rsaSignaturePadding,
      capabilities: this.enabledEncryptionAlgorithms,
    };
  }

  private signMaterialFromEntry(entry: PrivateKeyEntry, digestAlgo: DigestAlgorithm): SignMaterial {
    return {
      certChainDer: entry.chain.map((c) => c.getEncoded()),
      pkcs8: (entry.key as X509PrivateKey).pkcs8,
      publicKeyAlgorithm: entry.certificate.getPublicKeyAlgorithm(),
      digestAlgorithm: digestAlgo,
      signerIdentifierType: SubjectIdentifierType.IssuerAndSerialNumber,
      rsaSignaturePadding: null,
      capabilities: this.enabledEncryptionAlgorithms,
    };
  }

  override async sign(signer: CmsSigner, content: Uint8Array): Promise<ApplicationPkcs7Signature> {
    const der = await buildSignedData(this.signMaterialFromSigner(signer), content, false);
    return new ApplicationPkcs7Signature(streamOf(der));
  }

  override async encapsulatedSign(signer: CmsSigner, content: Uint8Array): Promise<ApplicationPkcs7Mime> {
    const der = await buildSignedData(this.signMaterialFromSigner(signer), content, true);
    return new ApplicationPkcs7Mime(SecureMimeType.SignedData, streamOf(der));
  }

  private async resolveSigner(mailbox: MailboxAddress): Promise<PrivateKeyEntry> {
    const entry = this.store ? await this.store.getPrivateKey(mailbox) : null;
    if (!entry) throw new PrivateKeyNotFoundException(mailbox, `A private key for ${mailbox.address} could not be found.`);
    return entry;
  }

  override async signWithMailbox(
    signer: MailboxAddress,
    digestAlgo: DigestAlgorithm,
    content: Uint8Array,
  ): Promise<ApplicationPkcs7Signature> {
    const entry = await this.resolveSigner(signer);
    const der = await buildSignedData(this.signMaterialFromEntry(entry, digestAlgo), content, false);
    return new ApplicationPkcs7Signature(streamOf(der));
  }

  override async encapsulatedSignWithMailbox(
    signer: MailboxAddress,
    digestAlgo: DigestAlgorithm,
    content: Uint8Array,
  ): Promise<ApplicationPkcs7Mime> {
    const entry = await this.resolveSigner(signer);
    const der = await buildSignedData(this.signMaterialFromEntry(entry, digestAlgo), content, true);
    return new ApplicationPkcs7Mime(SecureMimeType.SignedData, streamOf(der));
  }

  // ---- verifying ------------------------------------------------------------

  private buildSignatures(parsed: ParsedSignedData, detachedContent: Uint8Array | null): DigitalSignatureCollection {
    const signatures: SecureMimeDigitalSignature[] = [];
    const allCerts = parsed.certificates.map((c) => new X509CertificateImpl(new Uint8Array(c.toSchema().toBER(false))));

    for (let i = 0; i < parsed.signedData.signerInfos.length; i++) {
      const signerCert = findSignerCertificate(parsed, i);
      const certImpl = signerCert ? new X509CertificateImpl(new Uint8Array(signerCert.toSchema().toBER(false))) : null;
      const info = new PkijsSignerInformation(parsed, i, detachedContent);
      const signature = new SecureMimeDigitalSignature(info, certImpl);

      if (certImpl) {
        try {
          signature.chain = buildCertificateChain(certImpl, allCerts);
        } catch (ex) {
          signature.chainException = ex as Error;
        }
        void this.concreteStore.addCertificate(certImpl);
      }

      signatures.push(signature);
    }

    return new DigitalSignatureCollection(signatures);
  }

  override async verifyDetached(content: Uint8Array, signatureData: Uint8Array): Promise<DigitalSignatureCollection> {
    const parsed = parseSignedData(signatureData);
    return this.buildSignatures(parsed, content);
  }

  override async verifyEncapsulated(
    signedData: Uint8Array,
  ): Promise<{ signatures: DigitalSignatureCollection; entity: MimeEntity }> {
    const parsed = parseSignedData(signedData);
    if (parsed.eContent === null)
      throw new FormatException('The signed-data does not contain encapsulated content.');
    const signatures = this.buildSignatures(parsed, null);
    const entity = this.parseEntity(parsed.eContent);
    return { signatures, entity };
  }

  // ---- encrypting -----------------------------------------------------------

  private envelopeRecipients(recipients: CmsRecipientCollection): EnvelopeRecipient[] {
    const out: EnvelopeRecipient[] = [];
    for (const recipient of recipients) {
      out.push({
        certDer: recipient.certificate.getEncoded(),
        padding: recipient.rsaEncryptionPadding,
        identifierType: recipient.recipientIdentifierType,
      });
    }
    return out;
  }

  override async encrypt(recipients: CmsRecipientCollection, content: Uint8Array): Promise<ApplicationPkcs7Mime> {
    if (recipients.count === 0) throw new TypeError('No recipients specified.');
    const algorithm = this.getPreferredEncryptionAlgorithm(recipients);
    const der = await buildEnvelopedData(this.envelopeRecipients(recipients), algorithm, content);
    return new ApplicationPkcs7Mime(SecureMimeType.EnvelopedData, streamOf(der));
  }

  override async encryptToMailboxes(
    recipients: Iterable<MailboxAddress>,
    content: Uint8Array,
  ): Promise<ApplicationPkcs7Mime> {
    const collection = new CmsRecipientCollection();
    for (const mailbox of recipients) {
      const cert = this.store ? await this.store.getCertificate(mailbox) : null;
      if (!cert) throw new CertificateNotFoundException(mailbox, `A certificate for ${mailbox.address} could not be found.`);
      collection.add(new CmsRecipient(cert, SubjectIdentifierType.IssuerAndSerialNumber));
    }
    return this.encrypt(collection, content);
  }

  // ---- decrypting -----------------------------------------------------------

  private decryptCandidates(): DecryptCandidate[] {
    return this.concreteStore.getDecryptors().map((e) => ({
      certDer: e.certificate.getEncoded(),
      pkcs8: (e.key as X509PrivateKey).pkcs8,
    }));
  }

  override async decryptTo(data: Uint8Array): Promise<Uint8Array> {
    return decryptEnvelopedData(data, this.decryptCandidates(), { allowLegacyDecryption: this.allowLegacyDecryption });
  }

  override async decrypt(data: Uint8Array): Promise<MimeEntity> {
    return this.parseEntity(await this.decryptTo(data));
  }

  // ---- compression ----------------------------------------------------------

  override async compress(content: Uint8Array): Promise<ApplicationPkcs7Mime> {
    const der = await buildCompressedData(content);
    return new ApplicationPkcs7Mime(SecureMimeType.CompressedData, streamOf(der));
  }

  override async decompress(data: Uint8Array): Promise<MimeEntity> {
    return this.parseEntity(await decompressCompressedData(data));
  }

  // ---- import ---------------------------------------------------------------

  override async import(data: Uint8Array): Promise<void> {
    if (this.store) await this.store.importCertificates(data);
  }

  override async importCertificate(certificate: X509Certificate): Promise<void> {
    if (this.store) await this.store.addCertificate(certificate);
  }

  // ---- helpers --------------------------------------------------------------

  private parseEntity(bytes: Uint8Array): MimeEntity {
    const parser = new MimeParser(streamOf(bytes), 'entity');
    const result = parser.parseEntity();
    if (!result.ok) throw new FormatException(result.error.message);
    return result.value;
  }
}
