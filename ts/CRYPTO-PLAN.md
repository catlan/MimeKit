# MimeKit-TS — Cryptography port plan (S/MIME, OpenPGP, DKIM/ARC)

Status: **researched, not started.** Extends the completed core port (waves
0–9). Method is unchanged: port MimeKit's model/logic 1:1 with a C# oracle +
differential gates; a crypto library binds in only at the concrete-context
layer. Research done 2026-07-09 (4 parallel agents, primary-source-verified;
see the fact tables below — every version/license/dep was checked against npm,
GitHub LICENSE files, and specs, not memory).

---

## 1. Executive summary + the browser question

**Can it be done, browser included? Yes — with a different answer per
subsystem.** Browser feasibility, best → hardest:

| Subsystem | Browser? | Dependency | License | The catch |
|---|---|---|---|---|
| **DKIM / ARC** | **Full** | none (WebCrypto + @noble) | — | verify needs an injected key locator; signing is fully offline |
| **S/MIME** | **Modern: yes. Legacy-receive: caveated** | `pkijs` (+ optional `@peculiar/*`) | BSD-3 / MIT | RSAES-PKCS1-v1.5 key transport + 3DES/RC2 absent from WebCrypto → userland fallback, gated behind opt-in |
| **OpenPGP** | **Yes** | `openpgp` (OpenPGP.js) | **LGPL-3.0** | ships as an *optional* separate entry point to keep our core MIT-clean |

The core library stays **MIT and dependency-light**. DKIM/ARC adds only
audited MIT micro-deps. S/MIME adds BSD/MIT deps. OpenPGP's LGPL dependency is
never in the required graph — it's an optional peer the consumer installs.

**The one honest limitation, stated up front:** decrypting *legacy* real-world
mail in a **browser** (RSA PKCS#1 v1.5 key transport, 3DES/RC2 content
encryption — what old Outlook/Apple Mail archives use) requires a pure-JS RSA
whose timing is not constant-time-audited anywhere in the JS ecosystem. We
gate that path behind an explicit opt-in, exactly as modern MimeKit/BouncyCastle
treat weak algorithms. On **Node** it's safe (OpenSSL implicit rejection).
Everything modern (RSA-OAEP + AES-GCM/CBC + ECDSA/RSA/Ed25519 signing) is clean
WebCrypto in both runtimes.

---

## 2. Scope

**In (portable MimeKit-model code — ports like waves 3–8, no crypto-lib
binding):** the MIME wrappers `MultipartSigned`, `MultipartEncrypted`,
`ApplicationPkcs7Mime/Signature`, `ApplicationPgp*`, the OpenPGP detection/block
filters; the `CryptographyContext`/`SecureMimeContext` abstractions; all value
types & enums (`CmsSigner`, `CmsRecipient`, `EncryptionAlgorithm`,
`DigestAlgorithm`, `RsaEncryption/SignaturePadding`, the exceptions, the
`IDigital*` interfaces + collections); the entire DKIM/ARC subsystem
(~4,841 LOC, pure algorithm). `AuthenticationResults` is **already ported**
(wave 8).

**Out (platform/backend-specific, ~7.4k LOC — replaced by injectable
abstractions, never ported):** `WindowsSecureMimeContext` (CAPI),
`MacSecureMimeContext`, `GnuPGContext` (shells to `gpg`), the five SQL cert-DB
backends (`X509CertificateDatabase`, `Sqlite/Sql/Npgsql/SQLServer…`),
`DefaultSecureMimeContext` (SQLite store), the `X509Certificate2`/Windows
digital-cert glue. In their place: an injectable `X509CertificateStore` /
`KeyStore` / keyring interface (Node backends — filesystem, IndexedDB — shipped
separately; browser default in-memory + app-supplied).

**Descoped for now (revisit on request):** GnuPG on-disk keyring interop
(`pubring.kbx`) — Node-only filesystem territory, separate adapter if ever
wanted. Ed448/X448 PGP (Node-native, @noble in browser — cheap to add later).
RC2 40-bit and IDEA/CAST5 legacy decrypt — opt-in plugins or declined.

---

## 3. Dependency decisions (primary-source-verified 2026-07-09)

### Shared primitive layer — WebCrypto-first, @noble fallback

The OpenPGP.js-proven architecture: native WebCrypto where every current
browser + Node has it; feature-detect and fall back to audited `@noble`
elsewhere.

| Dep | Version | License | Deps | Role |
|---|---|---|---|---|
| WebCrypto (`crypto.subtle`) | platform | — | — | SHA-2, RSASSA-PKCS1-v1.5, RSA-PSS, RSA-OAEP, ECDSA/ECDH, AES-CBC/GCM/KW, **Ed25519/X25519** (Safari 17 / FF 129 / Chrome 137+) |
| `@noble/hashes` | 2.2.0 | MIT | 0 | streaming SHA-1/2 (SubtleCrypto has no incremental digest — DKIM canonicalization needs it), RIPEMD-160/MD5 (PGP), S2K |
| `@noble/curves` | 2.2.0 | MIT | 1 (@noble/hashes) | Ed25519/X25519 **fallback** below the browser floor (~until 2027), Ed448 in browser |
| `@noble/ciphers` | 2.2.0 | MIT | 0 | **AES-CFB (PGP's mode — WebCrypto has NONE)**, AES-KW/KWP sync paths |

Audits: @noble/hashes (Cure53), @noble/curves (Trail of Bits + Cure53 +
Kudelski), @noble/ciphers (Cure53). All MIT, zero-dep, isomorphic, tree-shakeable.

**The RSAES-PKCS1-v1.5 gap** (permanently absent from WebCrypto — removed at
spec Last Call over Bleichenbacher): an injectable `KeyTransport` primitive.
- **Node backend:** `crypto.privateDecrypt` + `RSA_PKCS1_PADDING` — the *safest*
  v1.5 path in JS (OpenSSL ≥3.2 implicit rejection, constant-time).
- **Browser backend:** pure-JS BigInt RSA — `micro-rsa-dsa-dh` (0.3.0, MIT,
  @noble-family) or a vendored ~200-line EME-PKCS1 + modExp, with blinding +
  implicit rejection. **The one unaudited/non-constant-time surface** —
  documented as such, gated behind opt-in, low-frequency user-triggered use.

ASN.1/DER: `asn1js` (3.0.10, BSD-3) + `@peculiar/asn1-schema` (2.8.0, MIT); the
ready-made `@peculiar/asn1-cms` / `asn1-x509` schemas are a large head start.

### S/MIME — `pkijs`

`pkijs` 3.4.0, **BSD-3-Clause**, deps `{@noble/hashes, asn1js, bytestreamjs,
pvtsutils, pvutils, tslib}` (tree bottoms out clean), isomorphic, TypeScript,
**zero OSV vulnerabilities**. The only maintained JS library with **bidirectional
CMS**: `SignedData.sign/verify` (attached + **detached**, verified in source),
`EnvelopedData.encrypt/decrypt` (**all four RFC 5652 recipient types**), and
`CertificateChainValidationEngine` with explicit trust anchors + CRL/OCSP.
Delegates all crypto to an injectable WebCrypto engine (small audit surface).
Optionally pair with `@peculiar/x509` (2.0.0, MIT — but pulls `tsyringe` + a
reflect polyfill; skippable, stay on pkijs's own cert classes if that offends).

Gaps, both solved by pkijs's designed-in `CryptoEngine` injection (`setEngine`
global, `crypto` param per decrypt):
- **v1.5 key transport** → the shared `KeyTransport` primitive above.
- **3DES/RC2 legacy content ciphers** → Node: `@peculiar/webcrypto` (1.7.1,
  MIT — adds DES-EDE3-CBC + RSAES-v1.5, Node-only). Browser: `node-forge`
  primitives (`forge.des`, `forge.rc2`) **as a primitive donor ONLY** — never
  its PKCS#7, chain, or verify paths (its `verify()` literally throws
  "not yet implemented", no ECDSA, 15 OSV advisories).

*Ruled out:* node-forge as the CMS layer (no verify, no ECDSA, no OAEP);
jsrsasign (no EnvelopedData at all, 14 OSV CVEs); @zone-eu/smime-js (EUPL
copyleft, Node-only, v0.1); OpenSSL-CLI wrappers (Node-only shims).

### OpenPGP — `openpgp` (OpenPGP.js), optional peer

`openpgp` 6.3.1, **LGPL-3.0-or-later** (standard text, no linking exception),
**zero runtime deps**, RFC 9580 complete (v6 keys, AEAD), streaming, 128 KB gz,
Proton-maintained + independently audited, browser+Node (needs SubtleCrypto +
Web Streams). **The only production-grade browser+Node OpenPGP in JS** — no
maintained permissive alternative exists.

**License handling (keeps our core MIT-clean):** (1) `openpgp` as an **optional
peerDependency**, never bundled into our dist; (2) a **separate entry point**
(`mimekit-ts/openpgp`) so `import 'mimekit-ts'` never touches LGPL code;
(3) loaded via **dynamic `import('openpgp')`** in the adapter — simultaneously
makes it optional and (per the OpenPGP.js maintainer's own guidance) nudges
consumers' bundlers to chunk-split it, preserving LGPL §4 "replaceability";
(4) an `OpenPgpEngine` interface so a future **rpgp-WASM** (MIT/Apache — the
sanctioned permissive escape hatch, currently pre-npm) can slot in without API
breakage; (5) a README note on downstream obligations (notice + keep the
`openpgp` chunk replaceable — an afternoon, low exposure: rights-holder is
Proton, no JS-bundling enforcement history).

*Ruled out:* rpgp/WASM as primary (bindings are a 4-commit experiment, no npm);
kbpgp (RFC 4880-only, IcedCoffeeScript, life-support); gopenpgp/Sequoia (no JS
bindings / also-LGPL); from-scratch-on-noble (2–6 person-months of *unaudited
crypto-protocol* code — the exact place spoofing/oracle bugs live; fallback only).

### DKIM / ARC — no library, port MimeKit 1:1

Only touches crypto at the primitive layer (SHA, RSA-PKCS1-v1.5, Ed25519 — all
in the shared layer above) + a DNS TXT lookup already abstracted behind
`IDkimPublicKeyLocator`. The one serious JS lib (`mailauth`, MIT) is Node-locked
(hard `node:crypto` PEM signing, `node:dns`, drags nodemailer/undici) **and** a
different implementation than our oracle — so wrapping it forfeits the 1:1
differential relationship. Port MimeKit's logic; keep mailauth as a *second CI
oracle* only.

Browser DNS: an injectable `DkimPublicKeyLocator` (Node → `node:dns`; tests →
fixtures) + a shipped optional **`DohPublicKeyLocator`** (~50 LOC; Cloudflare +
Google DoH JSON — both verified live to send `access-control-allow-origin: *`,
so callable cross-origin from any page). Never hard-wire DoH into the verifier.

---

## 3b. Packaging — "Lite" vs "full" (the MimeKit / MimeKitLite equivalent)

C# ships two DLLs from one source tree (`MimeKitLite.csproj` does
`<Compile Remove="Cryptography\**"/>`) because .NET can't tree-shake IL and
BouncyCastle would otherwise be a forced transitive dep. JS needs neither
trick: **the completed core IS the Lite build** (MIT, `punycode`-only), and
subpath exports + tree-shaking keep it that way as crypto is added.

**Model: one package, subpath exports, crypto deps as optional peers.**

```jsonc
"exports": {
  ".":         "./dist/index.js",          // core = Lite: punycode only, zero crypto
  "./dkim":    "./dist/dkim/index.js",      // → @noble (optional peer)
  "./smime":   "./dist/smime/index.js",     // → pkijs, @noble (optional peers)
  "./openpgp": "./dist/openpgp/index.js"     // → openpgp (optional peer, LGPL)
},
"peerDependenciesMeta": { "pkijs": {"optional":true}, "openpgp": {"optional":true}, ... }
```

- Only the crypto subpaths reach a crypto dep, and they `import()` it
  dynamically. `npm i mimekit-ts` installs core + punycode only — **zero crypto
  at install AND bundle time**, the truest MimeKitLite parity. Consumers opt in
  per feature (`npm i pkijs` for `/smime`), with a clear runtime error if a peer
  is absent.
- Better than the two-DLL split: one package, one version, automatic
  tree-shaking; a core-only consumer ships no crypto even if the deps are
  installed. This is the same mechanism §3's OpenPGP-LGPL isolation needs,
  generalized to all three subsystems.
- **Optional literal two-name parity:** if a discoverable `-lite`/`-full`
  naming is wanted, keep `mimekit-ts` = core/Lite and add a thin
  `mimekit-ts-crypto` meta-package (hard-deps core + pkijs + @noble, re-exports,
  `openpgp` optional) for batteries-included DX. Same source tree; costs one
  extra publish. Recommend shipping the single-package model first; add the
  meta-package only if naming matters.

## 4. Architecture — the injectable seam

```
   MIME wrappers (portable)          MultipartSigned / MultipartEncrypted /
        │                            ApplicationPkcs7Mime / ApplicationPgp*
        ▼
   CryptographyContext (portable)    Sign / Verify / Encrypt / Decrypt /
        │   abstract                 Import / Export  over Uint8Array
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
  SecureMimeContext  OpenPgpContext  Dkim/ArcSigner+Verifier   ← concrete
   (pkijs engine)    (openpgp,        (primitive layer +          contexts
        │             optional entry)  injectable locator)
        ▼
   injectable:  X509CertificateStore · KeyStore · KeyTransport ·
                DkimPublicKeyLocator · TrustAnchors/CRL/OCSP · DnsResolver
        ▼
   primitive layer:  WebCrypto  +  @noble/{hashes,curves,ciphers}  +
                     KeyTransport (Node privateDecrypt | browser BigInt RSA)
```

Everything above the concrete contexts is ordinary model code we've already
proven we can port. Every environment difference (OS trust store, key storage,
DNS, keyrings) becomes a small injected interface with a Node default, a browser
default, and a test/fixture implementation — exactly MimeKit's existing shape.

---

## 5. Phased waves

Each wave: port the portable MimeKit code 1:1 with its tests, build the crypto
adapter, extend the oracle, gate. Independent-review + zero-drop discipline as
before.

**Wave C0 — primitive layer + oracle extension (foundation).** The WebCrypto/
@noble abstraction (`hash`, `sign`, `verify`, `encrypt`, `cipher`, feature-
detect + fallback), the injectable `KeyTransport` (Node + browser backends),
PEM/key import, the shared enums/exceptions/`CryptographyContext` abstraction.
Extend the C# oracle CLI with `crypto` commands. Fixture generator for test
keys/certs (deterministic, checked in).

**Wave C1 — DKIM / ARC (highest value, most portable, ship first).**
`DkimSigner/Verifier(Base)`, `ArcSigner/Verifier`, simple+relaxed body/header
canonicalization, `DkimHashStream`/`DkimSignatureStream`, `Ed25519DigestSigner`,
`DkimPublicKeyLocatorBase` (TXT parsing) + injectable locator +
`DohPublicKeyLocator`. Gates: (a) deterministic **body-hash `bh=`** vectors
(empty-body + corpus — canonicalization is deterministic); (b) TS-signed →
oracle-verifies and oracle-signed → TS-verifies over fixtures; (c) mailauth as
a third cross-check in Node CI. Seed tests from the canonicalization-gotchas
checklist (the `b=`-delete-no-trailing-CRLF trap, `l=`, revoked empty `p=`).

**Wave C2 — S/MIME.** Portable: `MultipartSigned`, `ApplicationPkcs7Mime/
Signature`, `SecureMimeContext` abstraction, `CmsSigner`, `CmsRecipient(Collection)`,
`SecureMimeDigitalSignature/Certificate`, enums, exceptions. Adapter: a
`SecureMimeContext` over pkijs (SignedData sign/verify detached+attached,
EnvelopedData encrypt/decrypt) + the custom `CryptoEngine` (v1.5 + 3DES via the
shared KeyTransport / @peculiar/webcrypto|forge donor) + injectable
`X509CertificateStore` + trust-anchor/CRL/OCSP interfaces. Gates: sign↔verify
cross-checks with the oracle, encrypt→decrypt round-trips (TS↔TS and
TS-decrypt-of-oracle-encrypted), X.509 chain-validation fixtures, legacy-algorithm
opt-in tests. Sub-wave C2b: browser legacy-decrypt (opt-in, documented caveat).

**Wave C3 — OpenPGP (separate entry point, optional dep).** Portable:
`MultipartEncrypted`, `ApplicationPgp*`, OpenPGP detection/block filters, the
`OpenPgpContext` abstraction. Adapter: `mimekit-ts/openpgp` entry with an
`OpenPgpEngine` over dynamically-imported `openpgp` + injectable key source.
Gates: sign↔verify + encrypt→decrypt round-trips vs the C# oracle (and vs `gpg`
where available) over fixtures. GnuPG on-disk keyring interop descoped.

**Wave C4 — close-out.** Witness fixtures for crypto edge paths (algorithm
matrix, malformed signatures, expired/revoked certs, mixed nesting); dual
independent review (fable adversarial + codex behavioral, as in wave 9); dist
+ browser/Node crypto smoke; docs on the injectable interfaces + the browser
legacy-decrypt caveat + downstream LGPL note; the security-review skill over
the whole crypto surface.

---

## 5b. Progress

- 2026-07-09: **Wave C1 (DKIM/ARC) COMPLETE + merged** — first crypto release.
  19 src files (15 ported + primitive layer/locators/index), 5 test suites 1:1
  (272 tests, 2 skips = the [Ignore]'d ARC cases), a full-MimeKit `oracle-dkim`
  C# project, and gates: byte-parity vs oracle (deterministic signing), the
  oracle-independent empty-body KAT constants, cross-verify, and the RFC 8463
  Ed25519 vector. Primitive layer: sync @noble hashing + async WebCrypto
  sign/verify (RSASSA + Ed25519-over-SHA256-digest), pure-JS DER key import (no
  node:crypto). `mimekit-ts/dkim` subpath; `@noble` optional-peer so the core
  install stays crypto-free. Independent opus review: SHIP, no blocking issues;
  it also surfaced a pre-existing core bug (createNewLineFilter default) now
  fixed. Suite: 2877 passed + 17 skipped. Browser: signing offline, verify via
  injected locator (DoH default shipped).
- 2026-07-09: **Wave C2 S/MIME through C2b-2a (CMS engine) COMPLETE + merged.**
  - C2a foundation: enums, value types, exceptions, abstract `SecureMimeContext`,
    MIME wrappers, X.509 structural seams, `ISecureMimeStore`.
  - C2b-1 X.509/crypto substrate: cert impl, asymmetric keys, PKCS#12/PFX loader,
    chain builder, in-memory store, hand-rolled DES/3DES/RC2/PKCS12-KDF validated
    against 29 published KATs (FIPS DES, RFC 2268 RC2, RFC 7292 KDF).
  - C2b-2a engine: `PkijsSecureMimeContext` (sign/verify/encrypt/decrypt), CMS
    SignedData/EnvelopedData/CompressedData builders, RSA key transport with
    implicit rejection (Node privateDecrypt; browser pure-JS never throws on bad
    padding — synthetic key + constant-time mask, RSA-blinded modExp).
  - Gates: 23 bidirectional cross-verify cases vs `oracle-smime`, 12 forgery-
    tamper rejections (RSA + ECDSA-fallback), 9 encrypt KATs (3DES/RC2). Suite:
    2990 passed + 17 skipped, stable across runs. Independent security review:
    SHIP (all 12 tampers rejected; message-digest attr binds content).
  - Deferred to C2b-2b: full PKIX chain/trust + CRL/OCSP, DSA signing, certs-only
    Export, ECDH recipients (see `tests/smime/DEFERRED.md`).
- 2026-07-09: **Wave C2b-2b (full SecureMimeTests + ApplicationPkcs7MimeTests port)
  COMPLETE + merged.** Behavioral-parity port of the two base test classes against
  `PkijsSecureMimeContext` (codex, opus/fable review). Every C# base method PORTED or
  skipped-with-reason (no silent drops); sync/async pairs collapse to one async test.
  Suite: 3026 passed + 24 skipped. Engine fixes surfaced by the port: signAndEncrypt
  now produces multipart/signed-inside-enveloped matching C# (was encapsulated); full
  SMIMECapabilities parsing (RC2/DES); DNS-name domain cert/key resolution; no-ctx
  ApplicationPkcs7Mime overloads. Independent review verdict SHIP-WITH-FIXES — all
  required fixes applied (encapsulated-signing no-ctx-mailbox path, TripleDes capability
  assertion, no-ctx encrypt/decryptTo coverage).
  - **Two verify failures investigated + RESOLVED (both tests now pass, 3028 total):**
    (1) mixed-line-endings was a real port omission — ported C#'s
    `FormatOptions.VerifyingSignature` + the `MimePart.writeTo` verbatim branch for
    mixed-newline content (MimeKit #569). (2) Thunderbird was NOT a code bug: the repo's
    `*.txt text` gitattributes rule normalized `thunderbird-signed.txt`'s CRLF→LF on
    checkout, corrupting the exact bytes the signature covers (the nested multipart/mixed
    boundaries); marked the fixture `-text` + restored CRLF. Confirmed C#'s Multipart
    boundary writer also preserves raw boundaries, so the earlier "regenerate boundaries"
    hypothesis would have DIVERGED from C# — the real fix was the fixture. Core-writer
    change is verify-only (defaults off), byte-parity gates unaffected.
  - Deferred onward to later waves: full PKIX chain/trust + CRL/OCSP, DSA, ECDH
    recipients, certs-only Export, DES-CBC content encryption, C2c message-level
    integration (MimeMessage.sign/encrypt).

### C2b-2 crypto requirements (from the C2b-1 review — MUST honor)

- **EnvelopedData content decryption (CBC)**: padding removal MUST be
  uniform-error / constant-shape (Vaudenay padding-oracle). The C2b-1 ciphers
  keep raw-CBC separate from padding — decrypt to raw, then unpad with a
  single non-branching failure mode.
- **RSA key transport**: modern = RSA-OAEP via WebCrypto (isomorphic). Legacy
  PKCS#1 v1.5 (Bleichenbacher) — per direction B: Node default = `node:crypto`
  privateDecrypt (OpenSSL implicit rejection, constant-time; the /smime subpath
  MAY use node:crypto — unlike core/dkim which stay pure-isomorphic); browser =
  opt-in pure-JS BigInt RSA with uniform errors + implicit rejection. Tests run
  on Node → the safe path, no opt-in needed in tests.
- OAEP `RsaesOaepParameters` needs `pSourceAlgorithm` for exact DER (C2b-1 nit).

## 6. Oracle & gate strategy for non-deterministic crypto

Signatures/encryption randomize, so byte-parity gates don't apply. Instead:
1. **Cross-verification** (primary): TS output must verify under the C# oracle,
   and oracle output under TS — both directions, every algorithm. This proves
   wire-format + semantic parity without determinism.
2. **Round-trip**: TS-encrypt → TS-decrypt; TS-decrypt of oracle-encrypted;
   oracle-decrypt of TS-encrypted.
3. **Deterministic KATs** where fixed inputs allow: DKIM/ARC body-hash `bh=`
   (canonicalization is deterministic), published RFC/interop test vectors,
   fixed-key digests.
4. **Third-party cross-checks** in Node CI: mailauth (DKIM/ARC), `gpg`
   (OpenPGP), OpenSSL (S/MIME) — where present.
Ratchet + attributed-deferral discipline carries over unchanged.

---

## 7. Risks & open questions

- **Browser legacy-decrypt timing** — the only unaudited primitive; mitigated
  by opt-in gating + blinding + implicit rejection + low-frequency use.
  **DECIDED 2026-07-09 — direction B (opt-in legacy):** Node gets full legacy
  decryption on by default (safe via OpenSSL constant-time + implicit
  rejection); the browser is modern-only (RSA-OAEP + AES) by default, with
  legacy v1.5 key-transport + 3DES/RC2 decryption available **only behind an
  explicit opt-in flag** (e.g. `allowLegacyDecryption`) that surfaces the
  unaudited-timing caveat. Sign/verify/encrypt and modern (OAEP+AES) decrypt
  are always clean WebCrypto in both runtimes — this gate is *only* on reading
  legacy-encrypted mail client-side. Rationale: a general-purpose library must
  never make an unaudited-crypto choice silently; this degrades honestly and
  lets consumers who genuinely need browser-side legacy decryption enable it
  with eyes open. Note v1.5 key transport is common in *current* real-world
  S/MIME (Outlook/Apple Mail), not just archives, so the flag matters for broad
  interop, not just old mail.
- **OpenPGP LGPL** — **DECIDED 2026-07-09: OpenPGP.js as an optional
  peerDependency + separate entry point (`mimekit-ts/openpgp`) + dynamic
  import**. Core stays MIT-clean; the LGPL dep is never in the required graph.
  `OpenPgpEngine` interface preserved so rpgp-WASM can replace it later.
- **Effort** — this is a large body of work (~30k C# LOC in scope, minus the
  ~7.4k excluded, plus new adapter/primitive code). Rough order: C0+C1 the
  smallest and highest-value; C2 the largest; C3 medium. Suggest shipping
  **C1 (DKIM/ARC) as its own release first** — it's the most-wanted, fully
  browser-capable, and dependency-light.
- **Ed25519 browser floor** (Safari 17 / FF 129 / Chrome 137) — @noble fallback
  covers older; drop the fallback ~2027.
- **Security posture** — a mail-crypto library is high-stakes; the plan leans on
  audited deps (pkijs/@noble/openpgp) precisely to minimize bespoke crypto, and
  ends with a dedicated security review.

## 8. Recommendation

Ship in this order, as independent releases: **DKIM/ARC first** (browser-ready,
no third-party crypto dep, highest demand), then **S/MIME** (pkijs, the biggest
body of work, modern-clean + legacy-gated), then **OpenPGP** (optional entry,
LGPL-isolated) — or hold OpenPGP for rpgp-WASM if you'd rather stay 100%
permissive. Core library stays MIT and light; browser support is real for all
three, with the single documented caveat on browser legacy-S/MIME-decrypt.
