# S/MIME tests deferred to wave C2b

Wave **C2a** (this wave) ports the S/MIME *portable foundation* — enums, value
types, exceptions, the abstract `SecureMimeContext` (+ its crypto/store seam),
and the MIME wrappers. It binds **no crypto library**. The concrete pkijs /
WebCrypto-backed `SecureMimeContext` and the X.509 certificate/private-key
parsing + store arrive in **wave C2b** and implement the abstractions defined
here.

A test can only run in C2a if it needs neither a concrete crypto context nor a
parsed X.509 certificate / private key. Everything below is blocked on C2b and
carries the marker:

```
// deferred(C2b): needs concrete SecureMimeContext
```

## Ported now (C2a) — for reference

| C# test file | TS file | Cases |
|---|---|---|
| `RsaSignaturePaddingTests` | `rsa-signature-padding.test.ts` | 3/3 |
| `RsaEncryptionPaddingTests` | `rsa-encryption-padding.test.ts` | 4/5 (see below) |
| `DigitalSignatureVerifyExceptionTests` | `digital-signature-verify-exception.test.ts` | 1/1 |
| `PrivateKeyNotFoundExceptionTests` | `private-key-not-found-exception.test.ts` | 4/4 |

## Deferred to C2b

### Partially deferred (rest of the file is ported)

- `RsaEncryptionPaddingTests.TestGetAlgorithmIdentifier` — asserts on a
  BouncyCastle DER `AlgorithmIdentifier` / `RsaesOaepParameters`. The
  ASN.1-producing members (`GetAlgorithmIdentifier`, `GetRsaesOaepParameters`)
  live with the crypto backend, so this one method is deferred while the other
  four cases in the file run now.

### Fully deferred — need a parsed X.509 certificate / private key

These are value-type tests, but every case loads a real certificate (PEM/DER) or
a PKCS#12 key store, which requires C2b's X.509 parser:

- `CmsSignerTests` — loads `.pfx`/PEM signer certs + keys; checks key-usage /
  `CanSign`.
- `CmsRecipientTests` — loads `StartComCertificationAuthority.crt`; reads S/MIME
  encryption capabilities.
- `SecureMimeDigitalCertificateTests` — loads DSA/RSA/EC PEM certs; asserts
  `PublicKeyAlgorithm` detection.
- `X509CertificateChainTests` — loads real cert chains
  (`SecureMimeTestsBase.RsaCertificate.Chain`, `LoadCertificate`).

### Fully deferred — need a concrete `SecureMimeContext` (sign/verify/encrypt/decrypt)

- `SecureMimeTests` (+ the algorithm-specific `SecureMime*Tests` fixtures) —
  full sign/verify/encrypt/decrypt round-trips.
- `ApplicationPkcs7MimeTests` — encapsulated sign/encrypt/compress/import via a
  real context.
- `CryptographyContextTests` — context registration + `Create(protocol)`.
- `TemporarySecureMimeContextTests` — the in-memory concrete context.
- `BouncyCastleSecureMimeContextTests` — the BouncyCastle concrete context.
- `DefaultSecureMimeContextTests`, `SqliteCertificateDatabaseTests`,
  `X509CertificateStoreTests`, `X509CertificateRecordTests` — the SQL/SQLite
  cert-database backends (an *excluded* backend per CRYPTO-PLAN §2; will be
  replaced by an injectable store, not ported 1:1).
- `AsymmetricAlgorithmExtensionTests`, `CertificateExtensionTests` — BouncyCastle
  key/cert conversion helpers (crypto backend).
- `LdapUriTests` — LDAP certificate retrieval (out of scope / separate adapter).

### Test helpers (ported alongside the tests that use them, in C2b)

`X509CertificateGenerator`, `X509CrlGenerator`, `UnknownCryptographyContext`,
`SecureMimeTestsBase` — fixtures/oracles for the deferred suites above.
