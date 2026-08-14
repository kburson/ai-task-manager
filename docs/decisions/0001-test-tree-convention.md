# ADR 0001 — Test Tree Convention

**Date:** 2026-06-17
**Status:** Accepted

---

## Context

The repository originally had test files scattered across `./test/`, `./tests/`,
domain-local `tests/` directories, and files co-located with production modules. It
publishes one npm package, so those locations did not represent independent package
boundaries. They instead made discovery, lane ownership, package exclusion, and
source-to-test mapping disagree.

Without an explicit convention:

- New contributors default to whatever root looks familiar, perpetuating the sprawl.
- A runner or audit that knew only selected roots could silently drop tests from CI.
- Large test files accumulate without a split trigger, making per-story archaeology
  difficult.

This ADR establishes the authoritative convention used by all subsequent refactoring
epics (C2–C6 of #274).

---

## Decision

### 1. Canonical test root and lane declaration

Every package test lives at exactly one path of this form:

```text
scripts/tests/<unit|integration|slow>/<source-relative-subtree>/<name>.test.mjs
```

The lane segment is a required declaration. `laneOf()` rejects a test outside this
tree or below a support-only subtree; unit is not a catch-all. Co-located tests such
as `scripts/gh/create-issue.test.mjs` and domain-local roots such as
`scripts/providers/tests/` are retired and rejected.

Discovery deliberately remains rooted at all of `scripts/`. This is the fail-closed
part of the convention: a misplaced `*.test.mjs` stays visible to audits, then
`npm run lint:test-layout` reports its path and exits nonzero. Narrowing discovery to
the canonical root would turn a layout mistake into a silently omitted test. Test
discovery also descends into `fixtures/` and `__fixtures__/`: those names may hide
static data from general source scans, but they never hide an executable test from
the runner or audits.

There is one npm deliverable and therefore no provider or domain-root exception. If a
subtree becomes a separately published package later, its test boundary requires a new
decision rather than an implicit directory exception.

### 2. Canonical tree and source-relative taxonomy

| Path                                                   | Contents                                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `scripts/tests/unit/<source-relative-subtree>/`        | Unit tests — one bounded module or feature, including isolated local filesystem, Git, and child-process fixtures |
| `scripts/tests/integration/<source-relative-subtree>/` | Integration tests — end-to-end coordination across independent repositories/remotes or live external systems     |
| `scripts/tests/slow/<source-relative-subtree>/`        | Tests whose measured runtime belongs outside the fast development loop                                           |
| `scripts/tests/{fixtures,helpers,tools}/`              | Package-level test support, shared fixtures, and audit tools; never test lanes or npm package content            |
| `scripts/tests/<lane>/{core,meta,fixtures}/`           | Lane-owned buckets for package-root behavior, test-tree contracts, and executable fixture tests                  |

The three lane directories and the package-level support directories are siblings.
Only files below `unit/`, `integration/`, or `slow/` may end in `.test.mjs`.

#### Subsystem nesting (amended by #868)

Within each lane directory, test files are **nested into subsystem subdirectories that
mirror the source tree**, rather than sitting flat in the lane root. The original
convention ("no additional nesting … depth is a last resort") is superseded: the flat
`tests/unit/` had grown to 622 files in one directory, at which point mirroring the
source layout is what makes the source→test mapping mechanical rather than archaeological.

The mapping is: for a test named `<module>.test.mjs`, its subsystem subdirectory is the
directory of the source `<module>.mjs` relative to `scripts/`. For example,
`scripts/task-tracker/lib/foo.mjs` maps to
`scripts/tests/unit/task-tracker/lib/foo.test.mjs`, and
`scripts/gh/create-issue.mjs` maps to
`scripts/tests/unit/gh/create-issue.test.mjs`. The subsystem set is exactly the source subsystems:
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
subdirectory. `laneOf()` parses the exact canonical path rather than inferring a
default. The layout is enforced by `npm run lint:test-layout` and
`scripts/tests/unit/meta/test-tree-layout.test.mjs`; a per-directory file cap (source
`lib/` is itself flat) is deferred to #946.

### 3. Story-ID tagging

Every test file carries a mandatory attribution header:

```js
// @story #NNN
```

where `NNN` is the GitHub issue that introduced or owns the test. The tag is line 1,
or line 2 immediately after a shebang. A bounded `cspell:ignore` preamble follows
the story tag and never precedes it. This is the authoritative attribution
mechanism; filename suffixes and directory groupings are supplementary.

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
The gate is enforced by `scripts/tests/tools/audit-line-cap.mjs` via
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
life cycles, concurrency-sensitive resources, or failure scopes that need independent
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

A test is an **integration test** when its subject is end-to-end coordination across
independent systems: for example, a live GitHub API boundary or synchronization
across multiple repositories and a remote. `trunk-ref.integration.test.mjs` belongs
here because it coordinates an origin, two clones, push/fetch behavior, and the close
gate while proving remote-trunk synchronization.

An isolated local Git repository or worktree, a deterministic filesystem fixture,
or invoking a real child process does not by itself make a test integration. Those
mechanics may remain in the unit lane when they exercise one bounded module or
feature. Lane choice follows the behavior under test, not the mere presence of
`git`, a subprocess, or filesystem I/O.

Unit and integration tests form the fast lane. Slow tests run separately with
`npm run test:slow`.

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

- All new test files must be placed under
  `scripts/tests/<unit|integration|slow>/<source-relative-subtree>/` and carry a
  permitted `// @story #NNN` header.
- Co-located and domain-local test roots are rejected; there are no retained
  package-boundary exceptions.
- `scripts/tests/{fixtures,helpers,tools}/` are support-only and excluded from the
  published npm package with an explicit `!scripts/tests/**` rule.
- C2 (#309) backfills the `@story` tag into all existing files.
- C3 (#310) enforces the line cap by splitting god-files.
- C4 (#311) originally reconciled provider placement; #876 retires that exception.
- C5 (#312) updates tooling and CI config to reflect the single-root discovery path.
- C6 (#313) updates `CONTRIBUTING.md` with the Test Convention section that links to
  this document.
- Discovery scans all of `scripts/`; strict classification ensures only canonical
  lane paths can execute.
