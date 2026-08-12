# Language-agnostic Develop-stage verification

**Issue:** #1250 (Phase 1). Phase 2 is #1218.
**Date:** 2026-08-12
**Status:** design approved, not yet planned

## Problem

AITM cannot verify a non-JavaScript project at the Develop stage, and it fails
silently rather than loudly.

Most of AITM's apparent npm coupling is not real coupling. An npm script is
indirection: `npm run test:unit` can invoke `xcodebuild test`, `swift test`,
`pytest`, or `cargo test`. A consuming project that ships a thin `package.json`
wrapping its native toolchain already satisfies the issue-body command
declarations (`definition-of-done.md` and `pickup-directive.md` are
project-configurable templates resolved by `scripts/task-tracker/paths.mjs`), the
Test-stage receipt identities, the command allowlist, cache eligibility, and the
`npm ci` sandbox setup step.

One seam does not yield to that shim. `scripts/task-tracker/verify-develop.mjs`
iteration mode never reads a declared command. It synthesizes its own steps from
hardcoded JavaScript predicates — `JAVASCRIPT_RE`, `FORMATTABLE_RE`,
`selectAffectedTests`'s JS import-graph walk, and `discover-test-files.mjs`'s
pinning to root `scripts` plus `/\.test\.mjs$/` — and spawns `npx eslint`,
`npx prettier`, and `node --test` directly.

On a Swift repository every predicate matches zero files, the step list is empty,
the execution loop never runs, and the function returns `{ ok: true, commands: [] }`.
**Develop reports green having executed nothing.** The failure is silent, which is
the worst available shape. It is latent-but-harmless in this JS repository and
fatal in any non-JS consumer.

## Scope

Close that seam and document the shim. The full swappable provider contract is
Phase 2 (#1218), deliberately deferred until dogfooding on a real Xcode project,
then an Android project, produces data to design against.

Out of scope: the provider/plugin contract; delegating affected-file selection to
an external build graph (Nx, Bazel, SwiftPM); changes to `discover-test-files.mjs`
defaults, coverage tooling, or the lane taxonomy; changes to the allowlist bin
table.

The receipt record gains fields (manifest hash, file count, payload mode) but the
schema identifier stays `aitm.verification-receipt/v1`: the additions are
backward-compatible, and existing parsers ignore unknown keys. No version bump.

## Architecture

### The reserved script-label roster

AITM defines eight reserved labels in `package.json`. A fixed roster is a
stronger contract than a project-supplied step table: the classification is
structural rather than declared, so the core never has to trust a project-supplied
classification string, and the allowlist never has to grow — every step remains
`npm run <label>`, which `BIN_RULES` already permits.

| Label              | Classification        | Stage               | Receives manifest |
| ------------------ | --------------------- | ------------------- | ----------------- |
| `lint`             | `lint-full`           | Test (complete)     | no                |
| `format:check`     | `format-full`         | Test (complete)     | no                |
| `test:unit`        | `test-unit`           | Test (complete)     | no                |
| `test:integration` | `test-integration`    | Test (complete)     | no                |
| `test:slow`        | `test-slow`           | Test (complete)     | no                |
| `lint:affected`    | `lint-affected-fix`   | Develop (iteration) | yes               |
| `format:affected`  | `format-affected-fix` | Develop (iteration) | yes               |
| `test:affected`    | `test-affected`       | Develop (iteration) | yes               |

The five complete lanes already exist and already satisfy the shim; this design
only formalises them as roster members. The three `:affected` labels are new.

**Ordering is the core's, not the project's.** The core always spawns
`lint:affected` → `format:affected` → `test:affected`, aborting on first failure.
This preserves the existing lint-before-format guarantee — the property that makes
the post-verify tree the final committed shape — without asking every project to
re-derive it.

**Empty is legal; absent is not.** A toolchain with no affected-selection concept
points `test:affected` at its full suite: a performance cost, not a correctness
compromise, and visible in the receipt. A toolchain with no formatter declares
that explicitly (see _Explicit no-op_ below) rather than omitting the label.

**Platform templates.** Prefilled script blocks for known toolchains
(`swift-xcode`, `android-gradle`, and so on) ship with the package as data and are
merged at init. No plugin loading, no code execution.

**Accepted cost.** `npm` becomes a hard runtime dependency for every consumer,
including Swift and Android ones. This is inescapable for Phase 1: the AITM skill
is itself JavaScript and requires a Node engine regardless. Revisited in #1218.

### The affected-file manifest

Affected lanes receive the changed-path set through a manifest file, not inline
argv:

```
npm run test:affected -- --file-path-manifest .tmp/aitm/affected-manifest.txt
```

The manifest is written to a **stable path** and is gitignored. Three properties
follow, and each is load-bearing:

1. **Fixed argv restores exact-match identity assertion.** Inline paths would make
   argv variable, forcing `verifyReceipt`'s exact-match check
   (`verification-receipt.mjs:281`) to loosen into a prefix match. The manifest
   deletes that problem instead of accommodating it.
2. **npm `pre` scripts become usable.** npm runs `pretest:affected` automatically
   before `test:affected`, at no cost to the core — but `pre` scripts do not
   receive `--` passthrough args. A pre-script that generates or transforms the
   affected set can only find the manifest at a known constant location.
3. **The receipt gains a bounded, hashable artifact** instead of an unbounded argv
   blob.

Argv-length overflow is a secondary consideration, not the motivation: `ARG_MAX`
is 1048576 on macOS, roughly 13,000 paths at typical length.

**Format:** newline-delimited relative paths, trailing newline, no header, no
escaping. Directly consumable by `xargs`, `while read`, and `xcodebuild` argument
files with zero parser dependency. A structured format (YAML, JSON) would put a
parse step inside every consumer's shim script, which is the exact friction this
design exists to remove. If per-file structure is ever needed, that is a Phase-2
schema change under a versioned filename.

**No include-globs.** A project-declared glob is a filter on the changed set, and
filtering is already the script's job. Supporting both puts the same decision in
two places with no way to resolve disagreement. The manifest removes the length
pressure that would have motivated globs.

**The core stops filtering by extension.** `JAVASCRIPT_RE` and `FORMATTABLE_RE`
leave `verify-develop.mjs`. The full changed-path set goes into the manifest
unfiltered; only the project's toolchain knows which extensions matter.

### Evidence: split payload

The verification receipt is already the right audit artifact. It is SHA-bound
(`commitSha`), carries `lockfileHash`, `configHashes`, node version, platform, and
`sandbox.clean`, is schema-versioned (`aitm.verification-receipt/v1`), and is
persisted as a base64url `<!-- aitm-verification-receipt … -->` marker parsed from
the issue body (`evidence-branch-reachability.mjs:48`).

The manifest is **not** tracked in git. Four reasons, the first decisive:

- **It collides with the clean-tree invariant.** `verify-develop.mjs` finalization
  refuses to start unless the tree is clean (`final-tree-dirty`) and re-checks
  after every step (`final-tree-mutated`); `buildVerificationFingerprint` then
  stamps `sandbox.clean` from `isCleanWorktree` (`verification-receipt.mjs:80`). A
  tracked manifest written by the verifier dirties the tree at exactly the moment
  the verifier demands it be clean. Exempting it would carve a hole in the one
  invariant that makes the exact-SHA receipt meaningful.
- **It is self-referential.** The manifest lists changed paths; tracking it makes
  it a changed path, requiring a carve-out inside the artifact whose purpose is to
  be exhaustive.
- **It is circular at commit time.** The manifest is computed from `git diff HEAD`
  before the commit exists, so it can never be asserted to match the commit that
  carries it — precisely the audit claim tracking it would be meant to support.
- **It would conflict on every merge.** One stable path written by every branch and
  every parallel worktree agent, with content that has no merge semantics.

Instead the evidence splits across two surfaces:

- The **receipt marker stays in the issue body**, unchanged in shape, carrying the
  manifest **hash and file count**. Every existing consumer — `parseVerificationReceipts`,
  `evidence-branch-reachability`, `markers.mjs` — keeps working with no change and
  no size growth. The body is a 65536-character budget already shared by the DoD,
  ACs, deep-dive, and every `aitm-*` marker.
- The **path list goes in its own issue comment** under a separate marker,
  `<!-- aitm-affected-manifest sha="…" hash="…" -->`. The hash in the body binds
  the comment: a comment that does not hash-match its receipt is ignored as
  evidence, so the bulk payload cannot be forged or swapped independently of the
  SHA-bound receipt.

**Degradation.** The full path list is written to the comment when it is under a
size cap; above the cap only the hash and count are recorded, and the receipt
carries a mode flag stating which applied. A reader always knows whether they are
looking at the complete set or a fingerprint — the artifact never silently
truncates.

## Components

Five units, each independently testable.

**`lib/script-label-contract.mjs`** (new) — the roster as data: label,
classification, stage, receives-manifest. Single source of truth; everything else
imports it. Exports `findMissingLabels(pkgScripts)` returning absent-or-empty
required labels.

**`lib/affected-manifest.mjs`** (new) — writes the manifest to the stable path and
returns `{ path, hash, count }`. Owns the file format. A pure function of a path
list and a target directory.

**`verify-develop.mjs`** (modified) — `buildIterationSteps(changedPaths)` stops
filtering by extension and stops emitting `npx eslint` / `npx prettier` /
`node --test`. It writes the manifest, then emits three fixed steps from the
roster. `FORMATTABLE_RE`, `JAVASCRIPT_RE`, and the `selectAffectedTests` call site
all leave this file. `buildFinalSteps()` already emits roster labels and is
unchanged.

**`bin/aitm-noop`** (new) — exits 0 and prints its argument as a reason string for
the receipt. The sanctioned way for a project to declare a lane genuinely has
nothing to do (see _Explicit no-op_ below).

**`lib/verification-receipt.mjs`** (modified) — `VERIFICATION_COMMAND_IDENTITIES`
gains the three affected classifications with their now-fixed argv; the receipt
record gains the manifest hash, file count, and payload mode.

This repository's own `package.json` gains the three `:affected` scripts, and the
existing JS-specific selection logic (`selectAffectedTests`,
`discover-test-files.mjs`) moves behind them. AITM becomes its own first consumer
of the contract rather than a special case with an escape hatch.

## Error handling

### Refusal codes (iteration mode)

- **`script-label-missing`** — a reserved label is absent or empty in
  `package.json`. Checked at stage entry, before any spawn. The message names each
  missing label and prints the prefilled snippet for the detected toolchain.
- **`iteration-no-commands`** — the changed-path set is non-empty but zero commands
  executed. This is the original bug; today that path returns
  `{ ok: true, commands: [] }`.
- **`manifest-write-failed`** — the manifest could not be written. Refuse rather
  than fall back to inline argv, so there is exactly one code path.
- **`command-failed`** — a lane exited non-zero. Reports the label, its exit code,
  and the manifest hash.

### Empty changeset is not a refusal

Zero changed paths returns `ok: true` with an explicit `no-changes` reason
recorded and no manifest written. This is the one honest green-with-nothing-run
case, and it is distinguishable in the receipt from the bug.

### Zero selected tests is not a refusal

If a project's `test:affected` reads the manifest and legitimately selects no
tests, the lane exits 0. This is correct and must not be gated.

Affected-selection at Develop is an **optimization inside a backstopped window**.
A test that escapes selection is still run by `test:unit` / `test:integration` /
`test:slow` at the Test stage, and again by CI at Review before the issue can
close. A missed selection costs a later feedback cycle, not a false close — a
latency bug, not a correctness one. Gating on selected-test count would
manufacture failures for the common case (a changeset touching only
documentation). The fail-closed work is therefore aimed at _zero lanes spawned_,
never at _zero tests selected_.

Coverage-based gating is the durable answer to verification depth and belongs
with #1218's provider work, where a provider can report structured results rather
than only an exit code.

### Explicit no-op

A project with no formatter writes `"format:affected": "aitm-noop no formatter
configured"`, using a small bin shipped with AITM that exits 0 and records its
reason string in the receipt. `"format:affected": "true"` would also pass —
nothing can stop a determined lie — but the sanctioned way to say "nothing to do
here" produces a recorded reason instead of silence, so the honest case and the
stub are distinguishable in the evidence.

### The irreducible limit

A stubbed **complete** lane (`"test:integration": "exit 0"`) is not caught by
anything downstream: it is the final gate, and it is only backstopped if the
project's CI configuration is independently real rather than also calling the npm
label. The manifest hash and the recorded resolved script body move detection from
impossible to manual-but-possible. This boundary is documented rather than
papered over; genuinely closing it is Phase 2's job.

### Migration

Missing labels refuse immediately, with a remediation message containing the exact
snippet to paste. A one-release deprecation window was rejected: it would ship a
release in which the silent-green bug is still live for anyone who does not read
warnings, and in an agent-driven loop warnings are read by nobody. A loud,
immediate, trivially fixable break is the correct shape for a correctness fix.

## Testing

**The load-bearing test is a non-JS fixture project.** A fixture directory
containing a `package.json` whose `:affected` scripts are plain shell — no Swift
toolchain, no Xcode, no CI dependency — plus source files with non-JS extensions.
It proves the contract end to end: manifest written, three lanes spawned in order,
exit codes honored, receipt produced, with zero JavaScript in the verified tree.
Without it, "language agnostic" is an untested claim. This is the test that would
have caught the original bug.

**Regression test for the bug itself.** Iteration mode, a changeset of only non-JS
paths, no `:affected` labels present, must return `script-label-missing`. The same
changeset with labels present must spawn all three lanes. Today's code returns
`{ ok: true, commands: [] }` for both.

**Unit coverage per component:**

- `script-label-contract.mjs` — roster shape; `findMissingLabels` against absent,
  empty-string, and whitespace-only values, and a `package.json` with no `scripts`
  key.
- `affected-manifest.mjs` — exact file format, hash stability across identical
  inputs, hash sensitivity to ordering, and rejection of paths escaping the project
  directory (mirroring the `normalizeRelativePath` guard in
  `verification-receipt.mjs`).
- `verification-receipt.mjs` — the three affected classifications now have fixed
  argv and are exact-match asserted; a mutated argv produces
  `command-identity-mismatch`. This closes the hole where the `identity &&` guard
  silently skipped unmapped classifications.
- Split-payload evidence — a comment whose hash does not match its receipt is
  ignored; the mode flag is recorded correctly above and below the size cap.

**Dogfood parity.** This repository's own `lint:affected` / `format:affected` /
`test:affected` must produce the same verification outcome as today's hardcoded
path for a representative changeset — proof the refactor did not weaken this
repository's own gate while generalising it.

**Lane placement.** All of the above are `test:unit` except the non-JS fixture
end-to-end test, which spawns real child processes and belongs in
`test:integration`.
