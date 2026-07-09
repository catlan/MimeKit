# mimekit-ts

A TypeScript port of [MimeKit](https://github.com/jstedfast/MimeKit)
(MimeKitLite scope): MIME parsing and creation with a **non-throwing,
Result-based API**, verified **byte-for-byte against the C# implementation**.

- **Isomorphic** — pure TypeScript on `Uint8Array`; zero Node dependencies in
  the runtime (Node, browsers, Bun, Deno, edge). One runtime dependency
  (`punycode`, zero transitive deps).
- **Non-throwing** — C#'s `Parse`/`TryParse` pairs collapse into one
  `parse(): Result<T>` with lenient (TryParse) semantics; data errors are
  structured values (`{ kind, message, offset }`), never exceptions. Only
  programmer errors (wrong argument types, out-of-range indices) throw.
- **Byte-parity verified** — a C# oracle CLI (`../oracle`) drives
  differential gates over MimeKit's own 22 MB test corpus: parse trees,
  reserialized bytes, codecs, header values, charsets. The known-divergence
  ratchet (`gates/known-divergent.json`) is **empty**.

## Scope

The core (`mimekit-ts`) covers everything in MimeKitLite: the MIME parser
(`MimeParser`/`MimeReader`), message model (`MimeMessage`, `MimePart`,
`Multipart`, …), headers and addresses, rfc2047/rfc2231, all content codecs,
text converters (HTML/flowed), TNEF (winmail.dat), `MimeAnonymizer`,
Authentication-Results. Cryptography — **DKIM/ARC, S/MIME, and OpenPGP** — ships
as **optional subpath entry points** (see below) so the core install stays
MIT-clean and dependency-light. Excluded: legacy-charset *encoding* (decoding is
fully supported; generation is UTF-8).

```ts
import { MimeParser, MemoryStream, FormatOptions } from 'mimekit-ts';

const parser = new MimeParser(new MemoryStream(bytes), 'entity');
const result = parser.parseMessage();
if (!result.ok) {
  console.error(result.error.kind, result.error.message);
} else {
  const message = result.value;
  console.log(message.subject, message.textBody);
  const out = new MemoryStream();
  message.writeTo(FormatOptions.default, out); // byte-preserving round-trip
}
```

## Cryptography (optional entry points)

Crypto lives behind three subpath imports so `import 'mimekit-ts'` never pulls in
a crypto dependency. Each entry declares its libraries as **optional peer
dependencies** — install only what you use.

| Entry | Feature | Install |
|---|---|---|
| `mimekit-ts/dkim` | DKIM & ARC sign/verify | `@noble/hashes @noble/curves` |
| `mimekit-ts/smime` | S/MIME (CMS) sign/verify/encrypt/decrypt | `pkijs asn1js @noble/hashes @noble/curves` |
| `mimekit-ts/openpgp` | OpenPGP (PGP/MIME, RFC 3156) | `openpgp` |

```ts
import { PkijsSecureMimeContext } from 'mimekit-ts/smime';
import 'mimekit-ts/smime'; // installs message-level MimeMessage.sign/encrypt

const ctx = new PkijsSecureMimeContext();
// … import certificates/keys, then:
await message.sign(ctx);            // multipart/signed
await message.encrypt(ctx);         // application/pkcs7-mime

import { OpenPgpContext } from 'mimekit-ts/openpgp';
import 'mimekit-ts/openpgp';        // installs PGP dispatch + parser types
const pgp = new OpenPgpContext({ getPassword: () => 'secret' });
await pgp.import(armoredKeyring);
await message.encrypt(pgp);         // multipart/encrypted (PGP/MIME)
```

The `openpgp` package is **LGPL-3.0**; it is loaded via dynamic `import()` and is
never bundled into `mimekit-ts`, keeping the core MIT-clean.

### Browser: legacy S/MIME decryption

Modern S/MIME (RSA-OAEP + AES) runs on WebCrypto in every runtime. Decrypting
**legacy** mail (RSAES-PKCS#1 v1.5 key transport, 3DES/RC2) needs a pure-JS RSA
path whose timing is not constant-time-audited, so it is **opt-in** in the
browser (on Node the safe OpenSSL path is used automatically):

```ts
const ctx = new PkijsSecureMimeContext(undefined, { allowLegacyDecryption: true });
```

Leave it `false` (the default) unless you must open legacy archives.

## Development

```sh
pnpm install
pnpm typecheck && pnpm vitest run   # full suite incl. differential gates
node gates/oracle-gen.mjs           # (re)generate C# oracle outputs (needs dotnet)
```

See `PLAN.md` for the porting method, conventions, and the attributed
deferral list.

## License

MIT — see [LICENSE](./LICENSE). `mimekit-ts` is a TypeScript port of
[MimeKit](https://github.com/jstedfast/MimeKit) (© .NET Foundation and
Contributors), distributed under the same MIT terms; MimeKit's copyright
notice is retained as the license requires.
