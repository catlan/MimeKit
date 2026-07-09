# Crypto port — C# scoping notes (pre-research)

Captured 2026-07-09 while 4 research agents investigate the JS crypto-library
landscape. This is the C#-side inventory the plan will build on.

## Architectural seam (the good news)

MimeKit's crypto is layered. Only the bottom layer binds to a crypto library:

1. **MIME-integration layer — PORTABLE (ordinary MimeKit-model code, ports
   like waves 3–8, no crypto-lib binding):**
   - `MultipartSigned` (935), `MultipartEncrypted` (2171),
     `ApplicationPkcs7Mime` (1931), `ApplicationPkcs7Signature` (115),
     `ApplicationPgpSignature` (116), `ApplicationPgpEncrypted` (107)
   - `OpenPgpDetectionFilter` / `OpenPgpBlockFilter` (~550)
2. **Abstraction layer — PORTABLE:**
   - `CryptographyContext` (840) + `ICryptographyContext` — the
     Sign/Verify/Encrypt/Decrypt/Import/Export-over-Stream contract
   - `SecureMimeContext` (1349) / `ISecureMimeContext` — much is cert-store
     orchestration that becomes an injectable-store abstraction
   - Value types & enums: `CmsSigner`, `CmsRecipient(Collection)`,
     `EncryptionAlgorithm`, `DigestAlgorithm`, `PublicKeyAlgorithm`,
     `RsaEncryptionPadding`, `RsaSignaturePadding`, `SecureMailboxAddress`,
     the exception types, `IDigitalSignature`/`IDigitalCertificate` +
     collections, `SecureMimeDigitalSignature`/`Certificate`
3. **Crypto-library-bound layer — THE REAL WORK (rewrite, not 1:1 port):**
   - `BouncyCastleSecureMimeContext` (2196) → CMS on a JS lib
   - `OpenPgpContext` (3010) → OpenPGP on a JS lib (or defer/optional)
   - X.509: `X509CertificateStore` (545), `X509CertificateChain` (382),
     `X509CertificateRecord` (340), `BouncyCastleCertificateExtensions` (460)
   - primitive glue: `Ed25519DigestSigner` (128),
     `AsymmetricAlgorithmExtensions` (578)

## DKIM / ARC — confirmed most portable (~4,500 LOC, pure algorithm)

Only touches BouncyCastle at the primitive layer (verified):
`Crypto.Digests` (SHA), `Crypto.Signers` (RSA/Ed25519), `Crypto.Parameters`
(key params), `OpenSsl` (PEM read). All map to WebCrypto/@noble + a PEM
parser + an injectable public-key locator (`IDkimPublicKeyLocator` already
abstracts DNS).
- `DkimSigner` (489), `DkimVerifier` (280), `DkimSignerBase` (467),
  `DkimVerifierBase` (571), `ArcSigner` (716), `ArcVerifier` (822)
- canonicalization: `DkimSimpleBodyFilter` (134),
  `DkimRelaxedBodyFilter` (160), `DkimBodyFilter` (72),
  `DkimHashStream` (370), `DkimSignatureStream` (361)
- `Ed25519DigestSigner` (128), `DkimPublicKeyLocatorBase` (193), enums
- `AuthenticationResults` (1370) — **already ported in wave 8**

## EXCLUDE from an isomorphic port (~7.4k LOC, platform/backend-specific)

Not portable and not needed; replaced by injectable store/context
abstractions:
- `WindowsSecureMimeContext` (1910) — Windows CAPI
- `MacSecureMimeContext` (267) — macOS Security.framework
- `GnuPGContext` (1355) — shells out to `gpg`
- SQL cert-DB backends: `X509CertificateDatabase` (1498),
  `SqlCertificateDatabase` (1014), `SqliteCertificateDatabase` (471),
  `NpgsqlCertificateDatabase` (264), `SQLServerCertificateDatabase` (303)
- `DefaultSecureMimeContext` (981) — SQLite-backed default store (replace
  with an in-memory/injectable default)
- `X509Certificate2Extensions` (294), `WindowsSecureMime*` (368)

## Provisional phasing (to be confirmed by research)

- **Phase A — DKIM/ARC**: most value, most browser-friendly, lightest deps
  (WebCrypto + @noble + injectable key locator). Sign works with zero DNS;
  verify needs the injectable locator (DoH or app-supplied).
- **Phase B — S/MIME**: CMS + X.509 on a JS lib (PKI.js/@peculiar under
  research), injectable cert/trust store. Browser-capable with caveats
  (RSAES-PKCS1-v1.5 key transport, legacy 3DES/RC2 absent from WebCrypto).
- **Phase C — OpenPGP**: heaviest; dependency + license question
  (OpenPGP.js is believed LGPL-3.0) under research; may ship as an optional
  peer-dependency / separate entry point.

## Reused assets

The wave-0 oracle CLI + differential-gate harness extend directly: add
`oracle sign|verify|encrypt|decrypt|dkim-sign|dkim-verify` commands backed
by the C# crypto, and gate the TS output against them over synthesized
key/cert fixtures (crypto output isn't byte-deterministic — signatures
randomize — so gates assert *verifiable-by-oracle* and *round-trip*, not
byte equality; deterministic where a fixed-k / KAT vector allows).
