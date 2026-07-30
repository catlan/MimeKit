# mimekit-ts

`mimekit-ts` parses, creates, edits, and serializes MIME messages: the RFC 822/2045
message model (`MimeMessage`, `MimePart`, `Multipart`), headers and addresses,
rfc2047/rfc2231 encoding, every content transfer codec, text conversion
(HTML ⇄ plain, format=flowed), TNEF (`winmail.dat`), and message anonymization. On
top of that it ports MimeKit's cryptography — **DKIM/ARC, S/MIME, and OpenPGP** —
as optional, opt-in entry points (see [Cryptography](#cryptography)).

It is a TypeScript port of [MimeKit](https://github.com/jstedfast/MimeKit), verified
**byte-for-byte against the original C# implementation**, with a **non-throwing,
Result-based API**.

It **runs anywhere JavaScript does**: pure TypeScript over `Uint8Array` with no Node
built-ins in the core, so the same code works in Node, browsers, Bun, Deno, and edge
runtimes. The core install has a single dependency (`punycode`, zero transitive
deps); crypto libraries are optional peers you install only if you use them.

📖 **API documentation:** <https://catlan.github.io/MimeKit/>

## An AI port, standing on MimeKit's shoulders

This port was written by AI (Claude). That was only possible because of the years
of careful engineering by [Jeffrey Stedfast](https://github.com/jstedfast) and the
many [contributors to MimeKit](https://github.com/jstedfast/MimeKit/graphs/contributors).
Above all, it was possible because of **MimeKit's exhaustive test suite and 22 MB
real-world corpus**: every wire-format decision, edge case, and RFC quirk in this
port was checked against the C# original by running MimeKit's own tests and a
differential oracle. The correctness here is theirs; the translation is the
machine's. Enormous thanks to everyone who built and tested MimeKit.

If this port saves you time, send the thanks upstream: Jeffrey Stedfast accepts
donations through [GitHub Sponsors](https://github.com/sponsors/jstedfast).

[![Sponsor MimeKit](https://img.shields.io/badge/Sponsor-MimeKit-EA4AAA?logo=githubsponsors&logoColor=white&style=flat-square)](https://github.com/sponsors/jstedfast)

## Porting notes

- **Ported in place, beside the C#** — this package lives in the `ts/` directory of a
  fork of MimeKit; the original C# sources stay in the repo untouched. That keeps
  upstream mergeable (`git merge upstream/master` brings in fixes and corpus updates),
  lets the C# build the differential oracle, and makes the port diffable against its
  source: files map 1:1, `MimeKit/ContentType.cs` → `ts/src/content-type.ts`,
  `UnitTests/ContentTypeTests.cs` → `ts/tests/content-type.test.ts`.
- **Non-throwing** — MimeKit's `Parse`/`TryParse` pairs collapse into a single
  `parse(): Result<T>` with lenient (TryParse) semantics. Malformed-data errors are
  structured values (`{ kind, message, offset }`), never exceptions; only programmer
  errors (wrong argument types, out-of-range indices) throw.
- **Byte-parity verified** — a C# oracle CLI drives differential gates over MimeKit's
  own test corpus: parse trees, reserialized bytes, codecs, header values, charsets.
  The known-divergence ratchet is **empty**.
- **One parser: the new one** — upstream ships two, the original
  [`MimeParser.cs`](https://github.com/jstedfast/MimeKit/blob/master/MimeKit/MimeParser.cs)
  and the newer tokenizer-based rewrite built on `MimeReader` (upstream file
  [`ExperimentalMimeParser.cs`](https://github.com/jstedfast/MimeKit/blob/master/MimeKit/ExperimentalMimeParser.cs)
  — experimental in name only; it is the modern implementation). This port ports
  [`MimeReader`](https://github.com/jstedfast/MimeKit/blob/master/MimeKit/MimeReader.cs)
  and that rewrite as the single
  [`MimeParser`](https://github.com/catlan/MimeKit/blob/HEAD/ts/src/mime-parser.ts) /
  [`MimeReader`](https://github.com/catlan/MimeKit/blob/HEAD/ts/src/mime-reader.ts);
  the original parser is not ported. The
  differential gates run the C# oracle on that same rewrite, so the byte-parity
  claims above are against it.
- **Dependency-light & MIT** — the core is MIT with one zero-transitive-dep runtime
  dependency; cryptography ships behind optional subpath entries.

## Install

```sh
npm install mimekit-ts
```

## Parse a message

```ts
import { MimeMessage } from 'mimekit-ts';

const result = MimeMessage.load(bytes); // bytes: Uint8Array of an RFC 822 message
if (!result.ok) {
  console.error(result.error.kind, result.error.message); // data errors are values
} else {
  const message = result.value;
  console.log(message.from.toString(), '—', message.subject);
  console.log(message.textBody);          // decoded text/plain body (or htmlBody)
  for (const attachment of message.attachments) {
    console.log('attachment:', attachment.contentDisposition?.fileName);
  }
}
```

## Parse large files without loading them (mbox, big messages)

The parser core is synchronous and pull-based; it reads through any seekable
`Stream`. For sources bigger than you want in memory, wrap a random-access
reader in `RandomAccessStream` — bytes are pulled through a bounded chunk
cache, so a multi-GB mbox is parsed by seeking, never materialized whole.

In Node, via the `mimekit-ts/node` entry point:

```ts
import { MimeParser, RandomAccessStream } from 'mimekit-ts';
import { NodeFileReader } from 'mimekit-ts/node';

const reader = NodeFileReader.open('archive.mbox');
const parser = new MimeParser(new RandomAccessStream(reader), 'mbox');
while (!parser.isEndOfStream) {
  const result = parser.parseMessage();
  if (!result.ok) break;
  console.log(result.value.subject);
}
reader.close();
```

In the browser, run the parser in a Web Worker — `createFileSliceReader`
returns a `SyncFileSliceReader` there (bounded synchronous reads via the
worker-only `FileReaderSync` API) and an async-only `FileSliceReader` on the
main thread, where you can fall back to buffering (`Blob.arrayBuffer()` +
`MemoryStream`):

```ts
// inside a worker, given a File/Blob posted from the page:
import { MimeParser, RandomAccessStream, createFileSliceReader, isSyncReader } from 'mimekit-ts';

const reader = createFileSliceReader(file);
if (isSyncReader(reader)) {
  const parser = new MimeParser(new RandomAccessStream(reader), 'mbox');
  // ...
}
```

Construct `MimeParser` with `persistent: true` to keep part bodies as bounded
views of the seekable stream (instead of copying them out), and use
`parser.mboxMarkerOffset` / `parser.position` to record each entry's byte
range for lazy re-parsing later.

## Create a message

```ts
import { MimeMessage, MailboxAddress, TextPart, MemoryStream } from 'mimekit-ts';

const message = new MimeMessage();
message.from.add(new MailboxAddress('Alice', 'alice@example.com'));
message.to.add(new MailboxAddress('Bob', 'bob@example.com'));
message.subject = 'Hello from mimekit-ts';

const body = new TextPart('plain');
body.text = 'This is the message body.\r\n';
message.body = body;

const out = new MemoryStream();
message.writeTo(out);                     // serialize
const bytes = out.toArray();              // Uint8Array, ready to send
```

## Cryptography

Cryptography lives behind three subpath imports, so `import 'mimekit-ts'` never
pulls in a crypto dependency. Each entry declares its libraries as **optional peer
dependencies** — install only what you use.

| Entry | Feature | Peer install |
|---|---|---|
| `mimekit-ts/dkim` | DKIM & ARC signing / verification | `@noble/hashes @noble/curves` |
| `mimekit-ts/smime` | S/MIME (CMS) sign / verify / encrypt / decrypt | `pkijs asn1js @noble/hashes @noble/curves` |
| `mimekit-ts/openpgp` | OpenPGP (PGP/MIME, RFC 3156) | `openpgp` |

Importing a crypto entry installs message-level methods on `MimeMessage`
(`sign` / `encrypt` / `signAndEncrypt`) and registers the parser types for that
protocol.

### S/MIME

```ts
import { MimeMessage } from 'mimekit-ts';
import 'mimekit-ts/smime';                            // installs message crypto + types
import { PkijsSecureMimeContext, loadPkcs12 } from 'mimekit-ts/smime';

const ctx = new PkijsSecureMimeContext();
const { certificateChain, privateKey } = loadPkcs12(pfxBytes, 'password');
ctx.certificateStore.addPrivateKey(certificateChain, privateKey);
ctx.certificateStore.addTrustedAnchor(certificateChain.at(-1)!);

await message.sign(ctx);                              // body -> multipart/signed
await message.encrypt(ctx);                           // body -> application/pkcs7-mime

// Verifying a received signed message:
const signatures = await (message.body as MultipartSigned).verify(ctx);
for (const sig of signatures) {
  const valid = await sig.verify(true);               // cryptographic validity — see caveats
  console.log(sig.signerCertificate?.email, valid);
}
```

### OpenPGP

```ts
import { MimeMessage } from 'mimekit-ts';
import 'mimekit-ts/openpgp';
import { OpenPgpContext } from 'mimekit-ts/openpgp';

const pgp = new OpenPgpContext({ getPassword: () => 'passphrase' });
await pgp.import(armoredKeyring);                      // armored or binary public/secret keys

await message.encrypt(pgp);                            // body -> multipart/encrypted (PGP/MIME)
await message.sign(pgp);                               // body -> multipart/signed
```

### Important encryption notes

- **`verify()` means *cryptographically valid*, not *trusted*.** A `true` result
  means the signature matches the content and the signer's key — it does **not**
  assert that the certificate chains to a trusted anchor or that the OpenPGP key is
  in your web of trust. Full X.509 chain/trust (CRL/OCSP) and OpenPGP web-of-trust
  validation are not yet performed; enforce trust separately if you need it.
- **Modern algorithms are the safe default.** S/MIME uses RSA-OAEP + AES on
  WebCrypto in every runtime; encryption defaults to strong ciphers (RC2-40, DES,
  Blowfish, Twofish are disabled by default). OpenPGP.js refuses legacy signing
  hashes, so a SHA-1 request is transparently upgraded to SHA-256.
- **Legacy S/MIME decryption is opt-in in the browser.** Decrypting old mail that
  used RSAES-PKCS#1 v1.5 key transport with 3DES/RC2 needs a pure-JS RSA path whose
  timing is not constant-time-audited, so it is gated behind an explicit flag. On
  Node the safe, constant-time OpenSSL path is used automatically.

  ```ts
  const ctx = new PkijsSecureMimeContext(undefined, { allowLegacyDecryption: true });
  ```

  Leave it `false` (the default) unless you must open legacy archives.
- **OpenPGP is LGPL.** The `openpgp` package (LGPL-3.0) is loaded via dynamic
  `import()` and is never bundled into `mimekit-ts`, keeping the core MIT-clean.

## Development

```sh
pnpm install
pnpm typecheck && pnpm vitest run   # full suite incl. differential gates
node gates/oracle-gen.mjs           # (re)generate C# oracle outputs (needs dotnet)
```

### Releasing

The package lives in `ts/` of a fork of MimeKit, so publishing runs from `ts/`
(`pnpm publish` — `prepack` builds `dist/`). Release tags are prefixed to avoid
colliding with upstream MimeKit's `X.Y.Z` C# tags:

```sh
cd ts && pnpm publish           # packs dist/ + LICENSE + README only
git tag ts/v1.0.0 && git push --tags
```

## License

MIT — see [LICENSE](./LICENSE). `mimekit-ts` is a TypeScript port of
[MimeKit](https://github.com/jstedfast/MimeKit) (© .NET Foundation and Contributors),
distributed under the same MIT terms; MimeKit's copyright notice is retained as the
license requires.

The optional `openpgp` peer dependency is LGPL-3.0 and is never bundled into
`mimekit-ts`.
