# Syncing with upstream MimeKit

This repo is a fork of [jstedfast/MimeKit](https://github.com/jstedfast/MimeKit) with the
TypeScript port living in `ts/`, next to the untouched C# sources. Upstream is alive, so
its fixes need to reach the port — and the C# is also what builds the differential oracle
the gates diff against, so a merge changes *both* sides of the comparison at once.

This file records how to do that and what every past sync concluded.

## Why the C# has to be merged, not just read

The gates in `ts/tests/gates/` compare the port against oracle CLIs (`oracle/`,
`oracle-dkim/`, `oracle-smime/`) built from the in-repo C#. Merging upstream and
rebuilding the oracle means the suite re-verifies the port against the *new* reference
implementation. A behavioural fix upstream therefore shows up one of two ways: either the
gates go red (the port needs the same fix), or they stay green (the port already behaves
that way, usually because a C#-specific hazard doesn't exist in TypeScript).

## Procedure

```sh
git fetch upstream
git merge upstream/master              # onto ts-port
```

1. **Review the C# diff for ported files.** `git diff --stat <merge-base> upstream/master`.
   The layout maps 1:1: `MimeKit/ContentType.cs` → `ts/src/content-type.ts`,
   `MimeKit/Text/FlowedToHtml.cs` → `ts/src/text/flowed-to-html.ts`,
   `UnitTests/ContentTypeTests.cs` → `ts/tests/content-type.test.ts`. Anything under
   `.github/`, `nuget/`, `Benchmarks/`, `AotCompatibility/`, `samples/`, or the
   `*.csproj`/`AssemblyInfo` version bumps is upstream packaging and never affects the port.
2. **Classify each port-relevant commit** as: *apply* (behaviour the port shares),
   *no-op* (a C#-language idiom, or a hazard that cannot exist in JS), or *out of scope*
   (a subsystem the port deliberately omits — see the deferrals in `PLAN.md`).
   Write the reasoning into the log below; "looks cosmetic" is not a conclusion.
3. **Apply what's needed**, with its 1:1 test, as a normal commit.
4. **Rebuild the oracle from scratch and re-run everything** — a stale oracle silently
   compares against the old C#:
   ```sh
   rm -rf oracle*/bin oracle*/obj ts/gates/out
   node ts/gates/oracle-gen.mjs
   cd ts && pnpm test
   ```
5. **Record the sync in the log below**, then push. `ts-ci` also triggers on `MimeKit/**`,
   `UnitTests/TestData/**` and `oracle*/**`, so the merge is re-verified in CI.

Conflicts should be rare: the port only *modifies* three upstream files (`.gitattributes`,
two S/MIME fixtures whose CRLF endings it protects) and the repo-root `README.md`, which is
marked `merge=ours` in `.gitattributes` so upstream's README edits never conflict. That
attribute needs its driver defined once per clone: `git config merge.ours.driver true`.

## Log

### 2026-07-30 — synced to `cf6d38dd` (upstream 4.17.1)

Nine commits since `afca9237`. Seven are release-workflow refactoring, the 4.17.1 version
bump, and nuspec edits — no port surface. The two that touch ported code:

- **`8385fe30` Fixed MimeReader to support MimePart content larger than 2GB** (issue #1252)
  — widens `contentLength` from `int` to `long` in `ScanContent`/`ScanContentResult`.
  **No action.** The overflow is a C# fixed-width-integer hazard; `mime-reader.ts` carries
  the same value as a plain JS `number` (exact to 2^53) and does no bitwise coercion
  anywhere in the file, so it cannot truncate at 2GB. The port was already correct.
- **`cf6d38dd` Use the u8 span initializer for RtfCompressedToRtf.DictionaryInitializer**
  — replaces `Encoding.ASCII.GetBytes(...)` with a `"..."u8` literal. **No action.**
  A C# idiom change; verified the port's `DICTIONARY_INITIALIZER` is the same text and the
  same 207 bytes.

Verification: oracle rebuilt from a clean tree, full suite **3076 passed / 20 skipped**,
all gates green.
