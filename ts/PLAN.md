# MimeKit → TypeScript port plan

Status: **COMPLETE** — all 9 waves done (2026-07-09). 2,605 tests + 15
policy-attributed skips; every differential gate byte/value-identical to the
C# oracle over corpus + witnesses; known-divergent ratchet EMPTY; dist
verified in Node + web-platform-only VM. Final adversarial + behavioral
reviews: SHIP-READY, all findings addressed or attributed.
Method: [csharp-to-typescript-port-playbook.md](csharp-to-typescript-port-playbook.md) (docxodus port, 2026-07)
Working title: `mimekit-ts` (final npm name → follow-up Q1)

## Locked decisions (2026-07-08)

1. **Scope: full MimeKitLite** — everything upstream ships in the Lite package:
   core MIME (parser, message model, headers, addresses), Utils/IO/Encodings,
   Text converters, TNEF, plus `Cryptography/AuthenticationResults.cs` (the one
   crypto file Lite includes). **Cryptography excluded** (S/MIME, PGP, DKIM/ARC —
   BouncyCastle-based; a possible later project, not this one).
2. **Repo: fork of jstedfast/MimeKit** with the port as a `ts/` package next to
   the C# (playbook rule #2 — upstream is alive; `git merge upstream/main`
   brings fixes + corpus). Fork under catlan's GitHub account via `gh repo fork`.
3. **Runtime: isomorphic.** Pure TS on `Uint8Array` + Web Streams. Node/Bun/Deno/
   browser/edge. Node conveniences (fs helpers, Buffer interop) as a separate
   `mimekit-ts/node` entry point. No Node APIs in core.
4. **Errors: Result union, no throwing public API.**
   ```ts
   type Result<T> = { ok: true; value: T } | { ok: false; error: MimeError }
   // MimeError: { kind: string; message: string; offset?: number; cause?: MimeError }
   ```
   C#'s `Parse`/`TryParse` pairs collapse into one `parse(): Result<T>`
   with **TryParse (lenient) semantics** — on the rare inputs where C#'s
   strict Parse throws but TryParse succeeds with a workaround (e.g. quoted
   Content-Disposition values), the port follows TryParse; this matches the
   oracle dumps, which use TryParse.
   C# tests asserting `Throws<FormatException>` are ported as `ok: false` +
   error-kind assertions. Programmer errors (wrong argument types, out-of-range
   indices — C#'s `ArgumentException` family) throw native `TypeError`/`RangeError`
   as idiomatic JS contract violations; *data* errors never throw.
5. **Commit discipline: small, single-purpose commits** that are easy to
   reason about. One logical unit per commit — a ported source file (plus its
   inseparable helpers) is one commit, its ported test file the next; scaffold,
   oracle, gate-runner pieces land as separate commits, not an "infra" blob.
   Review fixes commit per finding (or per tightly related group), with the
   finding quoted in the message body. Never mix concerns in one commit.

## Size and test inventory (audited 2026-07-08)

| Area | C# LOC | Tests (LOC) | Corpus |
|---|---:|---:|---|
| Core (MimeKit root) | ~43k | ~30.7k (top-level UnitTests) | messages/, mbox/, partial/, yenc/ |
| Utils / IO / Encodings | ~15.5k | ~7.2k | encoders/ |
| Text | ~25k | ~6.6k | text/, html/ |
| Tnef | ~13k | ~2.0k | tnef/ |
| **In-scope total** | **~97k** | **~47k** | TestData 22 MB |

~2,476 NUnit `[Test]`/`[TestCase]` attributes repo-wide (incl. crypto);
in-scope estimate ~1,700–1,900 cases. **Every in-scope test file ports 1:1**
(`[TestCase]` → `test.each`), zero dropped cases without an attributed-skip entry.

## Architecture

- Layout: `MimeKit/ContentType.cs` → `ts/src/content-type.ts`;
  `MimeKit/Text/FlowedToHtml.cs` → `ts/src/text/flowed-to-html.ts`;
  `UnitTests/ContentTypeTests.cs` → `ts/tests/content-type.test.ts`.
  File-structure 1:1 for upstream diffability; camelCase members, type names
  stay close to C# (`MimeMessage`, `HeaderList`).
- Toolchain: pnpm + TypeScript (ES2022 target, NodeNext modules) + vitest.
  Built `dist/` for bundler smoke (Turbopack lesson from playbook).
- Binary substrate: `Uint8Array` everywhere; no `Buffer` in core. Streams:
  small internal reader/writer abstractions; Web Streams adapters at the edge.
- Charsets: `TextDecoder` covers the WHATWG set (≈ all real-world email
  charsets). .NET-codepage-only stragglers get ported decode tables *when a
  corpus/test file actually needs one*; otherwise ratcheted as known-divergent.
  Encoding out: UTF-8 always; legacy encoders only where tests force it (Q3).
- Async: port the sync core logic; async API variants only where genuine I/O
  streaming exists (Web Streams-based `parseStream`/`writeToStream`). C#'s
  mirrored `*Async` method pairs do NOT get 1:1 ports (Q4).

## Oracle (playbook rule #4 — build before porting anything)

`oracle/` C# console app (dotnet 10, references the in-repo MimeKit project):

- `oracle parse <file>` → deterministic JSON dump: full MIME tree, byte offsets
  (MimeReader events), all parsed header values, charsets, encodings, errors.
- `oracle roundtrip <file>` → reserialized bytes (MimeKit preserves input bytes
  on round-trip — this is the primary byte-parity surface).
- `oracle decode <file> <part-path>` → decoded content bytes of one part.
- `oracle addr|ctype|cdisp|date|rfc2047 <input>` → parsed-value JSON for
  header-primitive differential fuzzing.
- `oracle text <converter> <file>`, `oracle tnef <file>` → converter/TNEF output.
- Determinism: pinned Message-Ids/boundaries/dates via explicit values in the
  harness (never `Guid.NewGuid()`/`DateTime.Now` observable in output).

First gate before any port code (playbook rule #5, identity first): TS reads
every corpus message and reproduces the oracle's **structure dump + round-trip
bytes**... which requires the parser — so the practical identity key here is
staged: wave-1 encoders match oracle byte-for-byte on encoders corpus, wave-2
header primitives match value dumps, wave-4 parser matches structure dumps and
round-trip bytes over the full corpus.

## Parity gates & ratchet

- `ts/gates/` runner: executes oracle (cached outputs checked in or generated
  on demand) vs TS over TestData; per-artifact escalation: encoder bytes →
  header-value JSON → structure dumps → round-trip bytes → full-corpus map →
  text/tnef outputs.
- `KNOWN_DIVERGENT.json` ratchet from day one: every divergence asserted to
  still exist; fixes flip loudly; list only shrinks. Skips must be attributed
  to a named unported feature and honesty-probed (byte-match up to the scope).
- Facade detection on every delegated slice: diff-size plausibility vs C# LOC,
  and gates assert the TS side cannot reach the oracle.

## Waves (each lands with its 1:1 tests + gates green)

| # | Wave | Content | Gate |
|---|---|---|---|
| 0 | Infrastructure | `gh repo fork --clone` (replace current shallow audit clone), `ts/` scaffold, oracle harness + determinism, corpus inventory, gate runner + ratchet, CI-less local gate script | oracle runs on full corpus; identity-write of gate runner |
| 1 | Substrate | Encodings (base64/QP/UU/yEnc/hex/punycode), IO streams+filters, Utils (except header-coupled) | encoder/decoder byte parity over encoders corpus + fuzz vs oracle |
| 2 | Header primitives | rfc2047 encode/decode, ContentType, ContentDisposition, Parameter, DateUtils, MimeUtils, InternetAddress/Mailbox/Group/InternetAddressList | value-dump parity vs oracle on all corpus headers + primitive fuzzing |
| 3 | Message model | Header, HeaderList, MimeEntity, MimePart, Multipart(+subclasses), MessagePart, MimeMessage, AttachmentCollection, BodyBuilder, ParserOptions/FormatOptions | ported unit tests; generation parity w/ pinned ids |
| 4 | Parser | MimeReader, MimeParser (port the modern/Experimental one as THE parser — Q5), mbox support | structure-dump + round-trip byte parity over messages/ + mbox/ + partial/ |
| 5 | Serializer parity | The playbook's hidden boss, budgeted as its own wave: reserialization byte-exactness, FormatOptions variants, MimeAnonymizer | full-corpus part-map byte parity; ratchet convergence |
| 6 | Text | HtmlEntityDecoder (+generated tables), Html tokenizer/parser, converters (TextToHtml, HtmlToText, Flowed*, RTF*, enriched) | converter output parity over text/ + html/ corpus |
| 7 | TNEF | TnefReader/PropertyReader/etc | extraction parity over tnef corpus |
| 8 | Lite extras | AuthenticationResults, Received parsing, MimeTypes map, remaining top-level | ported tests green |
| 9 | Close-out | Witness synthesis for corpus-uncovered paths (playbook: expect real bugs here), ratchet → 0 or attributed, independent final review, npm packaging, README/API docs, browser+Node smoke via built dist/ | everything green, review findings resolved |

Waves 6 and 7 are independent of each other (both depend on ≤5) and can run as
parallel workflow batches.

## Delegation & model policy (per CLAUDE.md rubric)

- **gpt-5.5/codex implements** mechanical slices (a C# file + its test file,
  1:1) — via codex-implementation skill mechanics: pin HEAD, self-contained
  prompt naming sources/dests/conventions, `-s workspace-write`,
  `< /dev/null`, background + poll past the 10-min Bash cap, audit
  `git log pinned..HEAD` after (codex has committed+pushed despite prose).
- **Supervised (not delegated): semantically dense files** — MimeReader/
  MimeParser core loop, rfc2047, ParameterList encoding, serializer parity
  work. Claude (me/fable) implements or pair-reviews these line-level.
- **opus-4.8 reviews every delegated slice** line-level against the C#
  original (playbook: reviews caught real bugs on every "green" delivery);
  **fable-5 reviews each wave** before it merges. gpt-5.5 as an extra
  independent perspective on the final review (codex-review skill).
- Parallel codex slices run in **separate git worktrees** (CLAUDE.md
  requirement); a serial integrator merges slice branches and runs the wave
  gate.

## Workflow

`.claude/workflows/port-wave.js` (created alongside this plan) — parameterized
per wave: takes `{repo, wave, baseBranch, slices[]}`, then per slice
implement (gpt-5.5 wrapper in its own worktree) → review (opus-4.8, line-level
vs C#, facade check) → fix (gpt-5.5, same worktree) → slice gate, as a
pipeline (no barriers), then a serial integrate+wave-gate stage and a fable-5
wave review. Wave 0 will exercise and refine it on a small slice set.

## Sequencing note

Unlike docxodus there is no product waiting on this, so no WASM-ship step; the
oracle is a local dotnet CLI only. Rollback/soak concerns don't apply until
publish (Q2).

## Progress log (living)

- 2026-07-08: Wave 0 complete. Fork catlan/MimeKit, `ts-port` branch, ts/
  scaffold (pnpm/tsc-strict/vitest), Result core, Stream/MemoryStream
  substrate shim, C# oracle CLI (validated: 26/26 messages parse, 22/26
  round-trips byte-identical to input — 4 divergences are MimeKit
  normalizations, documented in gates/README.md), gate runner + ratchet,
  header extractor (1609 corpus inputs). Wave 1 running via port-wave
  workflow (pilot slice: IO filters core).

- 2026-07-08 (later): Wave 1 batches A+B merged — all Encodings codecs
  (base64, QP, Q/rfc2047 encoders, UU, yEnc, hex, passthrough, Crc32), IO
  streams (MemoryBlockStream, BoundStream, ChainedStream, MeasuringStream),
  FilteredStream + core filters, byte utils. 254 tests green incl. byte-parity
  differential gates vs oracle (corpus + fuzz). Review catches worth noting:
  base64 clone() validation semantics (fixed), MemoryBlockStream re-ported
  faithfully by hand after codex substituted an undocumented interning scheme.
  Workflow now has a dedicated commit stage (codex wrappers kept racing the
  commit step). Batch C (remaining filters + Create factories) in flight.

- 2026-07-08 (later still): **Wave 2 complete — 1583 tests green + 7
  attributed skips (51 files).** All header primitives ported and merged:
  DateUtils, ParseUtils, MimeUtils, CharsetUtils (+streaming), Rfc2047,
  Punycode (punycode dep + empirical IdnMapping wrapper), ContentType/
  ContentDisposition/Parameter/ParameterList, the full address family,
  CharsetFilter, options bags. Differential gates: codecs (corpus+fuzz),
  361 dates, 394 rfc2047 (incl. adversarial unknown charsets), 440
  ctype/cdisp, 419 addresses (deep tree + canonical), 27 IDN. Review
  blockers caught & fixed: rfc2047 unknown-codepage probe, rfc2231
  segment-straddle decoding, group-parse error swallowing, encode
  line-folding, isDomain byte bound. Full 1:1 test parity restored for
  the address suites (62+24+49 methods), which exposed two more runtime
  fixes (DomainList route IDN encode, ctor validation).

- 2026-07-08/09: **Wave 3 complete — 1772 tests + 41 attributed skips
  (66 files).** Full message model merged: Header/HeaderId (raw-byte
  preservation), HeaderList, MimeEntity/MimePart/TextPart/MimeContent
  (pure-JS MD5 for ContentMd5), the Multipart+MessagePart family (visitor
  double-dispatch, preamble/epilogue raw fidelity), MimeMessage (10-list
  address sync, BodyBuilder, AttachmentCollection + 552-entry MimeTypes
  map, MessageIdList). Codex quota outage mid-wave: multipart fix round
  done by fable, message slice implemented by opus-4.8 per the escalation
  rubric. ~40 parser-dependent test cases deferred(wave-4) — they light up
  with MimeReader. Next: wave 4 parser (supervised).

- 2026-07-09: **Wave 4 complete — the parser.** MimeReader (2893-line
  tokenizer, buffer arithmetic byte-faithful) + MimeParser
  (ExperimentalMimeParser per Q5) merged. Tree differential gate 38/38
  (messages+mbox+partial corpora structurally identical to the oracle,
  decoded-content sha256 included); 25 deferred tests un-skipped; parser
  test suite 79 methods 1:1. Root-caused an oracle bug: it had used the
  LEGACY MimeParser — switched to ExperimentalMimeParser (the port
  target). Suite: 1922 passed + 16 skipped. Next: wave 5 serializer
  byte-parity (roundtrip artifacts already generated).

- 2026-07-09 (close-out): **Wave 9 complete — PORT DONE.** Witness corpus
  (9 synthesized edge files) 9/9 parity first-run. Debt sweep: every skip
  policy-attributed. dist built (zero node: imports), Node smoke + browser
  VM smoke pass. Final reviews: opus adversarial (SHIP-READY, 13 minor/
  note findings — all fixed or attributed) + codex behavioral (20
  adversarial fixtures, zero true divergences). Q5 closed: the legacy
  MimeParserTests suite is NOT ported — the Experimental suite (the port
  target) is 1:1 and the corpus tree/roundtrip gates subsume the legacy
  assertions; veto if you want it anyway.

- 2026-07-12: **I/O edge adapters shipped** (the deferred wave-9 surface,
  lifted back from the Letter Opener web app's mbox v2 work where the design
  was proven): random-access reader contract + `RandomAccessStream` bridge to
  the sync parser core, browser `File`/`Blob` readers (async +
  worker-`FileReaderSync` sync variant), and `NodeFileReader` behind a new
  `mimekit/node` subpath export. 20 new tests incl. mbox parse-parity
  (RandomAccessStream vs MemoryStream) and persistent-listing entry re-parse;
  suite 3074 passed / 130 files; dist main entry verified still free of
  `node:` imports.

## Attributed deferrals (living — each names its blocking feature)

- `UnitTests/Encodings/YEncodingTests.cs` → wave 4 (needs MimeMessage.Load).
- `ChainedStreamTests.TestChainedHeadersAndContent` → wave 4 (needs
  MimeEntity.Load).
- `canTimeout` assertions in stream tests — omitted with the timeout surface.
- `FilterTests.cs` cases exercising CharsetFilter → wave 2, AnonymizeFilter
  → wave 5.
- `MimeKit/IO/Filters/CharsetFilter.cs` + CharsetUtils → wave 2 (charset
  decoding layer).
- `MimeKit/IO/Filters/AnonymizeFilter.cs` → wave 5 (MimeAnonymizer).
- `MimeKit/Utils/OptimizedOrdinalComparer.cs` — NOT ported: excluded from
  MimeKitLite net8.0+/net10.0 builds upstream (compile-conditional legacy shim).
- `idnDecode` in mime-utils is a no-op (C#: IdnMapping.Decode in msg-id
  parsing) → Q7 punycode work; idnEncode's interim new URL() hack is
  replaced by the same work.
- mime-utils privately inlined most ParseUtils helpers (parallel-slice
  necessity) → dedup against parse-utils.ts before wave 2 closes.
- `MimePart.writeTo` VerifyingSignature/Mixed pass-through branch +
  `FormatOptions.VerifyingSignature` — deferred with signature crypto
  (out of Lite scope; restore if S/MIME ever lands).
- Multipart-family test debt (review-accepted minors): `multipart-related`
  and `multipart-alternative` each combine 2 C# cases into 1;
  `TestGenericArgsConstructor` unported for related; `MultipartTests.
  TestDispose` deferred(wave-3e). Sweep in wave 9 or next codex window.
- Mutation of a `Multipart` during iteration is not fail-fast (C#'s
  `List<T>` enumerator throws) — accepted deviation; JS array iteration
  has no versioning and adding it buys nothing real.
- **Deliberate divergences (C# reference bugs fixed, final-review):**
  (a) rfc2231 encode of non-charset chunks decodes with the chunk's best
  encoding, not hard-coded UTF-8 — C# Parameter.cs:490-497 emits U+FFFD
  garbage for latin1-able values under international=true; (b) formatDate
  emits RFC-5322-correct '-0330' for negative fractional offsets — C#
  DateUtils.cs:654-658 emits malformed '-03-30'; (c) rfc2231 undecodable
  bytes yield U+FFFD (TextDecoder) where C# GetEncoding fallback yields
  '?'. None corpus-reachable; recorded here since the ratchet only covers
  gate-visible cases.
- `MimeMessage.WriteTo(fileName)` overloads — the Node adapter entry point
  now exists (`mimekit/node`, 2026-07-12); the WriteTo(fileName) convenience
  overloads themselves remain unported.
- ~~idnDecode no-op / mime-utils-parse-utils dedup~~ RESOLVED (Punycode
  wrapper gated 27/27; dedup executed wave-2C; survivors carry documented
  contract rationale).
- Async API pairs, Stream timeout/cancellation members — omitted per plan
  (sync core). Edge adapters shipped 2026-07-12 as random-access readers
  rather than Web Streams: `RandomAccessReader`/`SyncRandomAccessReader` +
  `RandomAccessStream` (chunk-cached sync Stream over a reader),
  `FileSliceReader`/`SyncFileSliceReader`/`createFileSliceReader` (browser
  File/Blob; sync reads via worker-only FileReaderSync), and `NodeFileReader`
  behind the new `mimekit/node` subpath (fd-backed, keeps the main entry free
  of `node:` imports). Still open: incremental parse of a *non-seekable async*
  source (network stream) — today's answer is buffer-then-parse; a
  Web-Streams `parseStream` would need an async or push-parser surface.

## Follow-up questions (living section — answered entries move to Locked decisions)

- ~~Q7: Punycode strategy~~ **RESOLVED 2026-07-08**: took `punycode@2.3.1`
  (MIT, zero deps — first and only runtime dependency). tr46 was not needed:
  the bake-off showed .NET IdnMapping semantics are reproducible with a thin
  empirical wrapper (all-ASCII passthrough; per-label UTS46 separator map +
  NFKC + casefold with ASCII-landing rule; input-unchanged failure
  fallback) — validated 27/27 against oracle idn dumps and gated
  (gates/idn-inputs.list). mime-utils idnEncode/idnDecode now use it.
- ~~Q8: default NewLineFormat~~ **RESOLVED 2026-07-09**: replicate C#'s
  `Environment.NewLine` faithfully via runtime detection
  (`platformNewLineFormat()` in format-options.ts): LF on Unix/macOS, CRLF on
  Windows (Node/Bun `process.platform`, Deno `Deno.build.os`); OS-less runtimes
  (browser/edge) default to CRLF (wire-canonical). On the Unix hosts the port is
  verified against, this resolves to LF — so the whole suite + byte-parity gates
  pass unchanged, Windows users get native CRLF like C#, and no fixed-default
  compromise was needed.
- **Q1: npm package name?** Placeholder `mimekit-ts`. `mimekit` appears
  plausibly free on npm — want me to claim it? Scoped `@catlan/mimekit`?
- **Q2: publish to npm at the end, or local-only until you review?**
  Plan assumes local-only; wave 9 prepares but does not `npm publish`.
- **Q3: legacy charset ENCODING (not decoding) support** — needed only for
  generating non-UTF-8 messages. Plan: UTF-8-only generation, ratchet the
  rest. OK?
- **Q4: async API surface** — plan ports sync core + Web Streams at I/O
  edges, skipping C#'s mirrored `*Async` pairs. OK?
- **Q5: MimeKit has MimeParser AND ExperimentalMimeParser (plus MimeReader).**
  Upstream's Experimental one is the MimeReader-based rewrite. Plan: port
  MimeReader + the Experimental parser as the one TS parser, keep old-parser
  tests as extra gate inputs. Confirm?
- **Q6: obsolete/deprecated C# members** (`[Obsolete]`) — plan: skip them,
  recorded per-file in an OMITTED.md. OK?
