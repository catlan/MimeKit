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

Everything in MimeKitLite: the MIME parser (`MimeParser`/`MimeReader`),
message model (`MimeMessage`, `MimePart`, `Multipart`, …), headers and
addresses, rfc2047/rfc2231, all content codecs, text converters
(HTML/flowed), TNEF (winmail.dat), `MimeAnonymizer`, Authentication-Results.
Excluded: S/MIME, OpenPGP, DKIM (BouncyCastle-based cryptography), the async
API surface, and legacy-charset *encoding* (decoding is fully supported;
generation is UTF-8).

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

## Development

```sh
pnpm install
pnpm typecheck && pnpm vitest run   # full suite incl. differential gates
node gates/oracle-gen.mjs           # (re)generate C# oracle outputs (needs dotnet)
```

See `PLAN.md` for the porting method, conventions, and the attributed
deferral list.
