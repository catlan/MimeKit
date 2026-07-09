# S/MIME tests deferred to wave C2b-2

Wave **C2a** ported the S/MIME *portable foundation* (enums, value types,
exceptions, the abstract `SecureMimeContext` + its crypto/store seam, and the
MIME wrappers) with **no crypto library** bound.

Wave **C2b-1** (this wave) adds the **X.509 + key-import** crypto backend that
implements those seams: the concrete `X509CertificateImpl`, RSA/ECDSA/DSA public
keys + PKCS#8/PEM/PKCS#12 private-key import, the `Pkcs12Loader`, a name-based
`X509CertificateChain` builder, and an in-memory `ISecureMimeStore`. This
unblocks every test that only needs a *parsed certificate / private key*.

Wave **C2b-2a** (this wave) adds the concrete pkijs/WebCrypto
`PkijsSecureMimeContext` — the CMS engine implementing the C2a async primitives:
`SignedData` sign/verify (detached multipart/signed + encapsulated
application/pkcs7-mime), `EnvelopedData` encrypt/decrypt (AES-CBC via WebCrypto;
3DES/RC2-CBC via the C2b-1 primitives; RSA-OAEP via WebCrypto; RSA PKCS#1 v1.5
key transport via node:crypto on Node, opt-in pure-JS BigInt in the browser;
uniform-error PKCS#7 unpad), and `CompressedData` compress/decompress (zlib via
`CompressionStream`). Shipped with the `oracle-smime` C# trust anchor and the
bidirectional `smime.gate.test.ts` cross-verify gate over the algorithm matrix,
plus a **representative** end-to-end test subset
(`pkijs-secure-mime-context.test.ts`).

Wave **C2b-2b** (next) is the FULL 1:1 port of the two ~5.5k-line suites
(`SecureMimeTests` + `ApplicationPkcs7MimeTests`) and the remaining context
suites below, on top of this engine. They carry the marker:

```
// deferred(C2b-2b): full 1:1 port of SecureMimeTests / ApplicationPkcs7MimeTests
```

### Deferred to C2b-2b — nuances not yet covered by the C2b-2a engine

- **X.509 chain / trust-anchor validation + CRL/OCSP**: `SecureMimeDigitalSignature.chain`
  is populated with a name-ordered chain but full PKIX path validation,
  revocation (`CheckCertificateRevocation`), and the expired/revoked-cert
  fixtures are deferred.
- **DSA signing certificates** (`smdsa*.pem` / `dsa/smime.pfx`): WebCrypto has no
  DSA; deferred (BouncyCastle-only in C#).
- **`Export` / certs-only PKCS#7** production (`ApplicationPkcs7Mime` certs-only)
  and the `Import` of a signed-data cert bundle beyond the C2b-1 `parseCertificates`.
- **EC key-agreement recipients** (ECDH) for `EnvelopedData` — only RSA key
  transport is implemented; the test certs encrypt to RSA recipients.

## Ported now (C2a + C2b-1) — for reference

| C# test file | TS file | Wave | Cases |
|---|---|---|---|
| `RsaSignaturePaddingTests` | `rsa-signature-padding.test.ts` | C2a | 3/3 |
| `RsaEncryptionPaddingTests` | `rsa-encryption-padding.test.ts` | C2a + C2b-1 | 5/5 |
| `DigitalSignatureVerifyExceptionTests` | `digital-signature-verify-exception.test.ts` | C2a | 1/1 |
| `PrivateKeyNotFoundExceptionTests` | `private-key-not-found-exception.test.ts` | C2a | 4/4 |
| `CmsSignerTests` | `cms-signer.test.ts` | C2b-1 | 5/5 (Windows X509Certificate2 overloads N/A) |
| `CmsRecipientTests` | `cms-recipient.test.ts` | C2b-1 | 4/4 |
| `SecureMimeDigitalCertificateTests` | `secure-mime-digital-certificate.test.ts` | C2b-1 | 2/2 (Windows* variants N/A) |
| `X509CertificateChainTests` | `x509-certificate-chain.test.ts` | C2b-1 | 3/3 |

`RsaEncryptionPaddingTests.TestGetAlgorithmIdentifier` (the RSAES-OAEP ASN.1
producer, `getAlgorithmIdentifier` / `getRsaesOaepParameters`) is now
implemented and ported.

Non-1:1 backend smoke coverage (`backend-smoke.test.ts`) guards the chain
builder + in-memory store, which replace MimeKit's excluded SQL cert-store.

## Deferred to C2b-2 — need a concrete `SecureMimeContext` (sign/verify/encrypt/decrypt)

- `SecureMimeTests` (+ the algorithm-specific `SecureMime*Tests` fixtures) —
  full sign/verify/encrypt/decrypt round-trips.
- `ApplicationPkcs7MimeTests` — encapsulated sign/encrypt/compress/import via a
  real context.
- `CryptographyContextTests` — context registration + `Create(protocol)`.
- `TemporarySecureMimeContextTests` — the in-memory concrete context.
- `BouncyCastleSecureMimeContextTests` — the BouncyCastle concrete context.

## Deferred / excluded — SQL backends & platform glue (not ported 1:1)

- `DefaultSecureMimeContextTests`, `SqliteCertificateDatabaseTests`,
  `X509CertificateStoreTests`, `X509CertificateRecordTests` — the SQL/SQLite
  cert-database backends (an *excluded* backend per CRYPTO-PLAN §2; replaced by
  the injectable `ISecureMimeStore`, not ported 1:1).
- `AsymmetricAlgorithmExtensionTests`, `CertificateExtensionTests` — BouncyCastle
  ⇄ .NET key/cert conversion helpers (no TS analogue).
- `LdapUriTests` — LDAP certificate retrieval (out of scope / separate adapter).

## Test helpers

`helpers.ts` (C2b-1) ports the parts of `SecureMimeTestsBase` / `SMimeCertificate`
that the X.509/key suites need (loading the real `.pfx` / `.crt` fixtures). The
signing/CRL generators (`X509CertificateGenerator`, `X509CrlGenerator`,
`UnknownCryptographyContext`, the CMS-round-trip parts of `SecureMimeTestsBase`)
are ported in C2b-2 alongside the suites that use them.
