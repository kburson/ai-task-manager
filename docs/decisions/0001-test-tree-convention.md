# ADR 0001 — Test Tree Convention

**Date:** 2026-06-17
**Status:** Accepted

---

## Context

The repository had test files scattered across three roots (`./test/`, `./tests/`, and
`scripts/task-tracker/tests/`) with no documented convention for where new tests should
live, how subdirectories should be named, how to attribute tests to the story that
introduced them, or when a test file is large enough to be split.

Without an explicit convention:

- New contributors default to whatever root looks familiar, perpetuating the sprawl.
- The test runner (`scripts/run-tests.mjs`) discovers tests via hard-coded paths that do
  not cover all roots, causing tests to silently drop out of CI.
- Large test files accumulate without a split trigger, making per-story archaeology
  difficult.

This ADR establishes the authoritative convention used by all subsequent refactoring
epics (C2–C6 of #274).

---

## Decision

### 1. Canonical test root

The single canonical root for task-tracker subsystem tests is:

```
scripts/task-tracker/tests/
```

All unit, integration, and slow tests for code under `scripts/task-tracker/` live here.

**Exception — `scripts/providers/tests/`:** Provider tests remain co-located in
`scripts/providers/tests/`. Providers are a self-contained package designed for future
extraction; moving their tests to the task-tracker test root would couple two packages
that are intentionally independent. This exception must be re-evaluated if providers are
extracted into a separate npm package.

The orphan roots `./test/` and `./tests/` are eliminated by #306. After that migration
there are exactly two test roots: `scripts/task-tracker/tests/` and
`scripts/providers/tests/`.

### 2. Subdirectory taxonomy under `scripts/task-tracker/tests/`

| Path                                                  | Contents                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/task-tracker/tests/unit/<subsystem>/`        | Unit tests — module-oriented by default, or feature-oriented when measured shared-fixture consolidation is faster, nested by subsystem |
| `scripts/task-tracker/tests/integration/<subsystem>/` | Integration tests — make real GitHub API calls, spawn real child processes against the live filesystem, or use real git worktrees      |
| `scripts/task-tracker/tests/slow/<subsystem>/`        | Slow tests — exceed ~5 s wall-clock time but are otherwise unit-style                                                                  |
| `scripts/task-tracker/tests/fixtures/`                | Shared fixture data and helper modules; lane-owned fixture tests live under `<lane>/fixtures/` so discovery executes them              |

The three fast-lane subdirectories (`unit/`, `slow/`, `integration/`) are siblings under
`tests/`. The `tests/` root retains only audit scripts and the subdirectories themselves.

#### Subsystem nesting (amended by #868)

Within each lane directory, test files are **nested into subsystem subdirectories that
mirror the source tree**, rather than sitting flat in the lane root. The original
convention ("no additional nesting … depth is a last resort") is superseded: the flat
`tests/unit/` had grown to 622 files in one directory, at which point mirroring the
source layout is what makes the source→test mapping mechanical rather than archaeological.

The mapping is: for a test named `<module>.test.mjs`, its subsystem subdirectory is the
directory of the source `<module>.mjs` relative to its package root under `scripts/` —
e.g. a test covering `scripts/task-tracker/lib/foo.mjs` lives at
`tests/unit/lib/foo.test.mjs`, and one covering `scripts/gh/create-issue.mjs` (were it
under a lane) mirrors to `gh/`. The subsystem set is exactly the source subsystems:
`lib/`, `lib/agent-review/`, `lib/agent-review/validators/`, `lib/move-state/`,
`lib/config-init/`, `verbs/`, `gh/`, `gh/lib/`, `states/`, `hooks/`, `maintenance/`,
`maintenance/lib/`, `tools/`, `migrate/lib/`. Three buckets have no 1:1 source directory:

- **`core/`** — tests for modules at a package root (e.g. `scripts/task-tracker/*.mjs`)
  or with no single source module.
- **`meta/`** — tests about the test tree itself (e.g. `test-tree-layout.test.mjs`, the
  layout-invariant verifier).
- **`fixtures/`** — tests that prove shared feature-fixture contracts.

Each lane (`unit/`, `integration/`, `slow/`) is nested identically. **No `*.test.mjs`
file lives directly in a lane root** — every file is under a subsystem or bucket
subdirectory. Lane classification is unchanged by the nesting: `laneOf` is path-segment
based, so `tests/unit/lib/foo.test.mjs` is still a unit test. The layout is enforced at
runtime by `tests/unit/meta/test-tree-layout.test.mjs`; a per-directory file cap (source
`lib/` is itself flat) is deferred to #946.

### 3. Story-ID tagging

Every test file carries a first-line attribution comment:

```js
// @story #NNN
```

where `NNN` is the GitHub issue that introduced or owns the test. This is the
authoritative attribution mechanism; filename suffixes and directory groupings are
supplementary.

**Example:**

```js
// @story #307
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// ...
```

When a test file is split (see §4), both the original and the sibling carry the same
`@story` tag. If ownership transfers to a later story, update the tag in that commit so
`git log -S '@story #NNN'` remains accurate.

### 4. Per-file line cap and split policy

Both limits are measured in **lines of code**, excluding comments and blank lines.
A line counts only if it carries code: blank / whitespace-only lines, `//` line
comments, and `/* … */` block comments (including every line a multi-line block
spans) do not count. A line with code plus a trailing comment counts as one code
line. The scan is line-oriented and does not tokenize string literals — a `//` or
`/*` inside a string literal on an otherwise-code line does not exempt that line.
The gate is enforced by `scripts/task-tracker/tests/audit-line-cap.mjs` via
`countCodeLines` (`scripts/task-tracker/lib/count-code-lines.mjs`).

- **Soft review target:** 400 code lines.
- **Hard limit:** 800 code lines.

When a file exceeds 400 code lines, reviewers confirm that its scenarios still
share one feature owner and lifecycle. When it exceeds 800 code lines:

1. Identify a cohesive sub-suite — a group of tests that share a single concern.
2. Extract it into a sibling file. Name the sibling with a descriptive suffix:
   `deep-dive-gate.test.mjs` → `deep-dive-gate-placement.test.mjs`.
3. Both files carry the same `@story` tag.
4. Move setup mechanics into `tests/fixtures/` rather than duplicating them.
   Helper modules may register assertions only when one discovered feature file
   remains the semantic owner and the helper exposes no cross-file mutable state.

Do not split simply to satisfy the cap if no cohesive sub-suite can be identified.
Prefer splitting at natural seams: different feature owners, incompatible fixture
lifecycles, concurrency-sensitive resources, or failure scopes that need independent
diagnosis. Assertion shape or a shared mock alone is not a semantic split trigger.

#### Feature-oriented consolidation (amended by #1090)

Module-per-file remains the default because Node can run independent files in
parallel. A measured cluster may instead use a feature-level `*.test.mjs`, nested
`describe` suites, and stateless helper modules when the feature boundary is clearer
and repeated cold and warm benchmarks show a net performance gain.

Each feature file creates at most one immutable repository skeleton in `before`,
resets observations, fake transports, environment objects, and other mutable state in
`beforeEach`, and performs idempotent teardown in `after`. Live fleet registries,
temporary worktrees, child processes, and other concurrency-sensitive resources remain
per test. Helpers accept or return explicit fixture handles; they never publish a
cross-file mutable singleton or mutate global `process.env` without bounded restoration.

Retention is empirical. Compare five cold and five warm samples against the exact
baseline commit. Both combined median and P80 must improve by at least 25%, with no
failed sample. After two compositions miss the threshold, restore the clearer baseline
layout and retain the negative JSON evidence. A loaded full-lane comparison must also
show no repeatable material regression; above 5% is material unless a separately
approved benefit justifies it. Production-file line limits are unchanged by this
test-only amendment.

### 5. Integration vs unit boundary

A test is an **integration test** if and only if it:

- (a) calls a live GitHub API (`gh` subprocess or direct GraphQL), or
- (b) spawns a real child process against the live filesystem, or
- (c) uses a real git worktree.

Everything else is a **unit test**, even if it reads real config files on disk. Disk reads
are fast and deterministic; they do not warrant the overhead of the `integration/` bucket.

Integration tests are excluded from `npm test` (fast lane) and only run under
`npm run test:all`.

### 6. Impact selection and verification ownership (amended by #1089)

Develop iteration does not rediscover tests by basename alone. The repository
selector builds a deterministic graph of repository-local static ESM imports and
unions direct imports, transitive imports, changed tests, shared fixtures, the
legacy basename signal, and explicit high-blast-radius manifest rules. Every
selection carries an explanation. Invalid manifest paths, unknown lanes, empty
reasons, or unmatched high-blast-radius rules fail closed instead of silently
shrinking coverage.

The selector is a Develop feedback optimization, not a Test substitute. A new
committed implementation always receives one complete unit, integration, and
slow Test pass. Develop finalization owns full lint and format; Test owns the
complete lanes; Review validates Test evidence without repeating either set.
The exact contract and recovery loop are documented in
[`docs/guides/workflow.md`](../guides/workflow.md#stage-owned-verification-and-exact-sha-receipts).

Shared fixture modules remain inside `tests/fixtures/` and must be mapped by
the selector. Changing a shared fixture selects every dependent test; changing
a global fixture helper or test runner escalates to its declared complete lane.

---

## Consequences

- All new test files must be placed under `scripts/task-tracker/tests/` (or
  `scripts/providers/tests/` for provider code) and carry a `// @story #NNN` first-line
  comment.
- C2 (#309) backfills the `@story` tag into all existing files.
- C3 (#310) enforces the line cap by splitting god-files.
- C4 (#311) reconciles `scripts/providers/tests/` against this ADR (confirms or migrates
  per the exception criteria above).
- C5 (#312) updates tooling and CI config to reflect the single-root discovery path.
- C6 (#313) updates `CONTRIBUTING.md` with the Test Convention section that links to
  this document.
- The `scripts/run-tests.mjs` discovery paths are updated by #306 so that
  `scripts/task-tracker/tests/integration/` is the only integration root.
