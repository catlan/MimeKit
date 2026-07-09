# OpenPGP (C3) — deferred / not-yet-ported tests & features

The C3 wave ships the OpenPGP crypto core (engine + `OpenPgpContext`) and the PGP/MIME
layer (`MultipartSigned` PGP path, `MultipartEncrypted`, `ApplicationPgp*`, message-level
sign/encrypt/signAndEncrypt), backed by OpenPGP.js. Current coverage: 19 tests
(`engine.test.ts` 6, `openpgp-context.test.ts` 7, `pgp-mime.test.ts` 6) — round-trip
sign/verify/encrypt/decrypt/signAndEncrypt (mailbox + explicit cipher), signer-cert
resolution, and tamper rejection, over the real `TestData/openpgp/mimekit.gpg.{pub,sec}`
fixtures.

## Deferred features (not implemented)
- **Key generation** (`TestKeyGeneration`) — DEFER:keygen.
- **Key signing / certification** (`TestKeySigning`) — DEFER:key-signing.
- **Keyserver / HKP lookup + auto-key-retrieve** (`TestAutoKeyRetrieve*`) — DEFER:keyserver.
- **GnuPG on-disk keyring enumeration** (`TestKeyEnumeration`) — DEFER:keyring-enumeration
  (this port uses an in-memory keyring imported from armored/binary key data).
- **Public-key export** (`TestExport*`, application/pgp-keys) — DEFER:export.

## Not-yet-ported 1:1 PgpMimeTests (follow-up: faithful behavioral port)
The crypto operations are covered by the 19 tests above, but the full 1:1 `PgpMimeTests`
port is a follow-up. Notably not yet ported as dedicated tests:
- `TestPreferredAlgorithms`, `TestDefaultEncryptionAlgorithm`, `TestSupports` (model/protocol).
- `TestOpenPgpDetectionFilter` (armored key/block detection — the detection filter is not
  yet ported).
- `TestMultipartSignedVerifyExceptions` / `TestMultipartEncryptedDecryptExceptions`
  (malformed-input negative paths — partially covered by MultipartEncrypted.decrypt guards).
- The raw-`PgpPublicKey`/`PgpSecretKey` ("UsingKeys") overloads exist in `OpenPgpContext`
  (encrypt/sign accept key handles) but lack dedicated ported tests.

## Skipped (not meaningful in TS)
- `TestAlgorithmMappings` — SKIP:BouncyCastle enum mapping.
- `TestArgumentExceptions` — SKIP:.NET/BouncyCastle overload-matrix null guards (the TS type
  system forbids most; runtime guards are covered inline).
