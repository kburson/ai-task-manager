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

| Path                                         | Contents                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/task-tracker/tests/unit/*.test.mjs` | Unit tests — one file per module, named after the module (e.g., `deep-dive.test.mjs` tests `deep-dive.mjs`)                       |
| `scripts/task-tracker/tests/integration/`    | Integration tests — make real GitHub API calls, spawn real child processes against the live filesystem, or use real git worktrees |
| `scripts/task-tracker/tests/slow/`           | Slow tests — exceed ~5 s wall-clock time but are otherwise unit-style                                                             |
| `scripts/task-tracker/tests/fixtures/`       | Shared fixture data — JSON, markdown, or static files referenced by multiple tests                                                |

The three fast-lane subdirectories (`unit/`, `slow/`, `integration/`) are siblings under
`tests/`. The `tests/` root retains only audit scripts and the subdirectories themselves.

No additional nesting level is introduced unless a single category exceeds 20 files and
a coherent sub-grouping is obvious. Depth is a last resort, not a default.

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

- **Soft target:** 200 lines (including imports, comments, and blank lines).
- **Hard limit:** 400 lines.

When a file exceeds 400 lines:

1. Identify a cohesive sub-suite — a group of tests that share a single concern.
2. Extract it into a sibling file. Name the sibling with a descriptive suffix:
   `deep-dive-gate.test.mjs` → `deep-dive-gate-placement.test.mjs`.
3. Both files carry the same `@story` tag.
4. Move shared fixtures into `tests/fixtures/` rather than duplicating them or creating
   test-scoped helper modules that re-export assertions.

Do not split simply to satisfy the cap if no cohesive sub-suite can be identified.
Prefer splitting at natural seams: separate verbs, separate error paths, setup vs. teardown
complexity.

### 5. Integration vs unit boundary

A test is an **integration test** if and only if it:

- (a) calls a live GitHub API (`gh` subprocess or direct GraphQL), or
- (b) spawns a real child process against the live filesystem, or
- (c) uses a real git worktree.

Everything else is a **unit test**, even if it reads real config files on disk. Disk reads
are fast and deterministic; they do not warrant the overhead of the `integration/` bucket.

Integration tests are excluded from `npm test` (fast lane) and only run under
`npm run test:all`.

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
