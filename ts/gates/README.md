# Differential gates

The TS port is verified against the C# oracle (`../oracle`, backed by
MimeKitLite) over the upstream test corpus (`../UnitTests/TestData`).

## Flow

1. `node gates/oracle-gen.mjs [mode...]` — builds the oracle (Release) and
   writes its outputs to `gates/out/oracle/` (gitignored).
2. Gate tests in `tests/gates/*.test.ts` compare the TS implementation's
   output byte-for-byte / value-for-value against those files. They FAIL
   (not skip) when oracle outputs are missing.

Modes: `encoders` (corpus + deterministic xorshift fuzz round-trips),
`messages` / `mbox` (structure dumps + reserialized bytes), `headers`
(value dumps over extracted header inputs; extractor lands with wave 2).

## Parity direction

Gates compare **TS vs oracle**, never TS vs corpus input. MimeKit's
round-trip is *almost* byte-preserving; the oracle inherits its
normalizations and the TS side must reproduce them exactly. Known
input-vs-oracle normalizations observed on `messages/` (2026-07-08):

- missing final newline gets added (`bounce.txt`)
- a leading U+FEFF BOM is stripped (`feedback-report.txt`)
- an mbox `From ` line is dropped when parsing as `Entity` and a
  trailing space after a boundary marker is not preserved
  (`multipart-digest.txt`)
- blank-line normalization in delivery-status parts
  (`delivery-status-multiple-blank-lines.txt`)

## Ratchet

`known-divergent.json` lists every accepted TS-vs-oracle divergence as
`{ "gate": ..., "case": ..., "reason": ..., "blockedOn": ... }`. The gate
helper asserts each listed divergence STILL diverges — fixing one flips a
test loudly and the entry must be removed. The list may only shrink.
Skips must name the unported feature that causes them (`blockedOn`).
