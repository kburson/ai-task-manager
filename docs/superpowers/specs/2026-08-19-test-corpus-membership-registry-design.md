# Test Corpus Membership Registry Design

**Issue:** #1263
**Date:** 2026-08-19
**Status:** Draft for Grok co-review
**Branch:** `codex/1263-test-corpus-registry`

## Problem

The #1256 migration moved the package test corpus into three canonical lanes and
froze the 915-file migration boundary in
`scripts/tests/fixtures/test-corpus-pre-move.json`. That immutable manifest is
still useful: it proves that the migration preserved every source path, target
path, lane, and digest.

The mutable post-migration census is not useful in its current shape.
`scripts/tests/unit/meta/package-test-corpus.test.mjs` originally repeated the
same changing fact as:

1. `EXPECTED_POST_SNAPSHOT_TESTS`, a literal path list;
2. a separately authored `storyOwned.length` equality; and
3. separately authored absolute per-lane totals.

Later work removed the redundant cardinality and absolute totals, but the live
guard now treats the literal list as a minimum. A newly discovered test that is
absent from the list passes. The repository traded a three-site maintenance
hazard for a weakened undeclared-addition guard.

The current `origin/trunk` corpus contains 939 tests: 858 unit, 28 integration,
and 53 slow. Every test has an `@story` tag, and 43 test files cite multiple
stories. Unit tests can accumulate regressions from later stories. Integration
and slow tests intentionally span source modules, commands, repositories,
worktrees, and lifecycle boundaries. A story identifier is therefore evidence
provenance, not exclusive ownership of a test file.

The replacement must retain strict corpus membership without recreating shared
counter edits, central append conflicts, or a false one-story-to-one-test model.

## Goals

1. Preserve the frozen #1256 migration manifest byte-for-byte.
2. Make post-snapshot membership exact: undeclared additions and stale
   declarations both fail.
3. Give each post-snapshot test an independent, deterministic declaration so
   parallel stories do not edit the same registry line.
4. Keep story evidence many-to-many and independent from corpus membership.
5. Derive every count and lane total from authoritative paths.
6. Produce path-specific diagnostics that name the exact repair location.
7. Run the membership guard during Develop whenever a test or membership record
   is added, deleted, or renamed.
8. Fail closed on malformed, duplicate, noncanonical, overlapping, or
   incorrectly located records.

## Non-goals

- Rewriting or regenerating `test-corpus-pre-move.json`.
- Assigning exclusive ownership of a shared test to one story.
- Replacing `@story` tags or the audit that requires them.
- Automatically accepting every discovered test into the registry.
- Adding a general corpus-management CLI in #1263.
- Redesigning repository-wide test-impact analysis.
- Reclassifying existing unit, integration, or slow tests.
- Requiring a membership-record edit when a later story only changes the
  contents or story tags of an existing test file.

## Decision

Keep two complementary authorities:

```text
frozen migration membership
  scripts/tests/fixtures/test-corpus-pre-move.json

post-snapshot membership
  scripts/tests/fixtures/test-corpus-post-snapshot/**/*.json
```

The frozen manifest owns the files present at the #1256 boundary. Each test
introduced after that boundary has one independent JSON membership record. The
record describes a path's presence in the corpus and records introduction
provenance. It does not own the behavior tested by that path.

The live corpus is valid only when:

```text
discoverTestFiles()
  = finalized frozen migration destinations
  union post-snapshot membership-record paths
```

Equality is exact set equality, not a minimum or count comparison.

## Authority Boundaries

### Frozen migration authority

`scripts/tests/fixtures/test-corpus-pre-move.json` remains the immutable source
for the original 915 files. Lane-correction entries continue to resolve a
migration destination to its final canonical path before membership comparison.
The existing schema, count, hash, rename, and lane-correction assertions remain
unchanged.

A post-snapshot record may not declare a path already represented by a finalized
frozen destination. Such a record is an authority overlap and fails.

### Post-snapshot membership authority

The registry root is:

```text
scripts/tests/fixtures/test-corpus-post-snapshot/
```

There is exactly one record per post-snapshot test file. The record location is
derived from the test path:

```text
test path:
  scripts/tests/unit/task-tracker/lib/issue-lock-reentrancy.test.mjs

record path:
  scripts/tests/fixtures/test-corpus-post-snapshot/
    unit/task-tracker/lib/issue-lock-reentrancy.test.mjs.json
```

Formally:

```text
recordPath(testPath) =
  "scripts/tests/fixtures/test-corpus-post-snapshot/" +
  testPath.removePrefix("scripts/tests/") +
  ".json"
```

Keeping `.test.mjs` in the record basename makes the mapping reversible and
avoids collisions with future test suffixes.

### Story evidence authority

The test file's `@story` tag remains the authority for which stories the test
supports. A test may cite one story or many. Later stories may add tags and
assertions without changing the membership record.

The record's `introducedBy` value answers only, "Which issue introduced this
path into the post-snapshot corpus?" It does not answer, "Which issue owns this
test now?"

## Record Schema

Every record is UTF-8 JSON with one trailing newline and this exact shape:

```json
{
  "schema": 1,
  "path": "scripts/tests/unit/task-tracker/lib/issue-lock-reentrancy.test.mjs",
  "introducedBy": 1261
}
```

Rules:

- `schema` is exactly integer `1`.
- `path` is a repository-relative POSIX path accepted by
  `parseCanonicalTestPath()`.
- `path` begins with exactly one of `scripts/tests/unit/`,
  `scripts/tests/integration/`, or `scripts/tests/slow/`.
- `path` ends in `.test.mjs`.
- `introducedBy` is a positive GitHub issue number.
- No additional keys are accepted in schema 1.
- The physical record path equals `recordPath(path)` exactly.
- No two records declare the same logical path.
- No record path overlaps a finalized frozen-manifest destination.

The strict physical-location rule makes duplicate, misplaced, or stale records
actionable without a second index.

## Membership Lifecycle

### Add a test

A story that adds a new `*.test.mjs` file also adds its deterministic record in
the same commit. That is the only additional declaration location. A story that
adds several tests adds several independent records, preventing two parallel
stories from editing one shared array or counter.

The adding issue becomes `introducedBy`. The test's `@story` tag normally
includes that issue, but the existing story-tag audit remains responsible for
that relationship.

### Change a test

Changing assertions, imports, fixtures, story tags, or covered components does
not change membership. The record stays untouched while the path stays the
same.

This is the normal case for shared tests. A later story can extend an integration
test across another boundary and add its own `@story` tag without acquiring or
rewriting the introducing story's record.

### Delete a test

An intentional deletion removes the test and its record in the same commit.
Deleting only the test leaves a stale declaration and fails with a missing-file
diagnostic. Deleting only the record leaves an undeclared live test and fails
with an undeclared-path diagnostic.

Deleting both is an explicit corpus change visible in the Git diff. The registry
does not attempt to veto a reviewed intentional deletion; it prevents silent or
half-applied deletion.

### Rename or change lane

A rename removes the old record and creates the deterministic record for the new
path. The JSON `path` changes; `introducedBy` remains the issue that originally
introduced the test file. A lane move follows the same rule because the lane is
part of both canonical paths.

Git rename detection and review provide history. The registry represents current
membership, not an append-only event log.

### Add a story without tests

No membership record is created. Stories are not corpus members; test paths are.

## Loader and Reconciliation Model

The implementation exposes a small pure boundary whose exact file placement is
decided in the implementation plan:

```js
loadPostSnapshotRecords({ projectRoot })
  -> { records, errors }

reconcileCorpusMembership({ discovered, frozenPaths, records })
  -> {
       ok,
       undeclaredPaths,
       missingPaths,
       duplicatePaths,
       overlapPaths,
       malformedRecords,
       misplacedRecords,
       counts
     }
```

The loader recursively reads `.json` records under the registry root in sorted
POSIX-path order. It validates JSON, exact keys, schema, path grammar,
`introducedBy`, deterministic record location, and uniqueness. An absent root is
equivalent to zero records only when discovery contains no post-snapshot paths.

The reconciler:

1. resolves every frozen entry through its optional lane correction;
2. rejects duplicate finalized frozen paths;
3. rejects records that overlap frozen paths;
4. compares discovered paths with the union of both authorities;
5. reports all independent membership differences in one result; and
6. derives `{ all, unit, integration, slow }` from the reconciled paths.

Malformed authority never becomes an empty set that permits success. Loader
errors make `ok` false even when the remaining paths happen to match.

## Diagnostics

Failures list every offending path in sorted order. They do not lead with a
numeric mismatch.

An undeclared addition renders:

```text
Undeclared test files:
+ scripts/tests/unit/task-tracker/lib/new-policy.test.mjs

Create:
scripts/tests/fixtures/test-corpus-post-snapshot/
  unit/task-tracker/lib/new-policy.test.mjs.json
```

A stale declaration renders:

```text
Declared tests missing from disk:
- scripts/tests/integration/task-tracker/lib/removed-flow.test.mjs

Remove or repair:
scripts/tests/fixtures/test-corpus-post-snapshot/
  integration/task-tracker/lib/removed-flow.test.mjs.json
```

Duplicate, overlap, malformed-schema, invalid-path, and misplaced-record
diagnostics name every involved record file. The meta test may summarize derived
counts after the path diagnostics, but no authored expected count appears in
code or prose.

The guard never writes, moves, creates, or deletes records.

## Develop-Stage Fail-fast Selection

`scripts/task-tracker/test-impact-manifest.json` gains one explainable rule that
selects `scripts/tests/unit/meta/package-test-corpus.test.mjs` for changes to:

```text
scripts/tests/**/*.test.mjs
scripts/tests/fixtures/test-corpus-post-snapshot/**/*.json
scripts/tests/fixtures/test-corpus-pre-move.json
```

The selector already evaluates manifest rules for paths that no longer exist,
so a deleted test or deleted record still selects the meta test. A rename
supplies both old and new paths and therefore also selects it.

This rule is deliberately narrow. It does not add a new selection algorithm or
escalate a full lane. It runs one meta test early enough to turn a minutes-later
Test-sandbox failure into a Develop-iteration failure.

## Migration

The current central `EXPECTED_POST_SNAPSHOT_TESTS` array is removed only after
all current post-snapshot paths have records.

Migration procedure:

1. compute finalized frozen paths from the immutable manifest;
2. compute `discoverTestFiles() - frozenPaths`;
3. require that result to equal the current central list before migration;
4. determine `introducedBy` from the path's Git introduction commit and its
   attributed issue token;
5. fail the migration plan on missing or ambiguous introduction provenance
   rather than guessing;
6. write one deterministic record per path;
7. run exact reconciliation against the records;
8. remove the central list and all derived minimum-count logic; and
9. verify that the frozen manifest file has no diff.

The implementation plan must include the resolved path-to-issue migration table
so Grok can review provenance before implementation.

## Concurrency Model

Parallel stories that add different tests create different record files and do
not edit one array, count, or prose assertion. Git can merge those additions
independently.

Two branches that add the same test path collide at both the test and its
deterministic record, which is desirable: they are not independent additions.
Two branches that rename or delete the same test likewise conflict on the same
authority and require reconciliation.

The design does not promise conflict-free edits to the same corpus member. It
removes false conflicts between different members.

## Failure and Recovery Semantics

- Invalid JSON, schema, keys, issue number, or path: fail closed and name the
  record.
- Record stored at the wrong deterministic location: fail closed and print the
  expected location.
- Duplicate record path: fail closed and name all duplicates.
- Record overlaps the frozen manifest: fail closed; the frozen authority wins.
- Live test lacks a record: fail as an undeclared addition.
- Record lacks a live test: fail as a stale declaration.
- Registry directory unreadable: fail closed; do not infer an empty registry.
- Frozen manifest unreadable or invalid: retain the existing hard failure.
- Develop selection misses a changed test path: focused selector tests fail.

Recovery is an ordinary reviewed repository edit. There is no self-healing or
environment override.

## Considered Alternatives

### Keep one in-test array and derive everything else

This is smaller and can restore exact set comparison. It still gives every
parallel test-adding story one shared insertion point and leaves membership data
embedded in an assertion file. Rejected because it fixes redundant counters but
not the merge-conflict or authority-shape defect.

### Store one post-snapshot JSON manifest

This separates data from assertions and removes count edits. It still centralizes
every addition in one array. Rejected because independent story additions remain
needlessly coupled.

### Store one fragment per story

This avoids most concurrent edits but implies that a story owns a test. The live
corpus disproves that model: tests accumulate story tags and shared integration
coverage. Deletion and rename ownership also become ambiguous. Rejected in favor
of one record per corpus member.

### Use only co-located `@story` tags

Tags make additions self-describing, but a deleted test takes its tag with it,
leaving no authority against which to detect the deletion. Tags also describe
evidence relationships rather than membership. Rejected as the membership
authority; retained for story evidence.

### Generate and commit one manifest automatically

Generation can remove manual work but silently accepting discovery output makes
accidental additions indistinguishable from deliberate ones. A generated file
also recreates broad shared diffs. Rejected for #1263. A future opt-in authoring
command may create one deterministic record, but must never run as self-healing
validation.

## Verification Strategy

Focused corpus tests will prove:

- the frozen manifest schema, census, hashes, renames, and lane correction are
  unchanged;
- every current post-snapshot path has exactly one deterministic record;
- undeclared additions and stale declarations both fail;
- diagnostics contain the offending paths and repair locations;
- malformed, misplaced, duplicate, overlapping, and noncanonical records fail;
- shared tests with multiple `@story` tags require only one membership record;
- counts and lanes are derived from the exact reconciled set; and
- registry traversal is deterministic.

Focused test-impact tests will prove:

- added unit, integration, and slow tests select the corpus meta test;
- deleted tests select it even though the path no longer exists;
- added, changed, and deleted registry records select it;
- renames select it through old and new paths; and
- the explanation names the manifest rule rather than an unexplained lane
  escalation.

Repository verification remains:

```text
node --test scripts/tests/unit/meta/package-test-corpus.test.mjs
node --test scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs
npm run lint
npm run format:check
npm test
npm run test:slow
```

## Review Focus for Grok

Grok should challenge these boundaries specifically:

1. whether per-test records are the smallest authority that preserves deletion
   detection without false story ownership;
2. whether deterministic record paths and strict schema make concurrent changes
   safer or merely move complexity;
3. whether deleting both a test and its record is the correct explicit-deletion
   boundary;
4. whether `introducedBy` is valuable provenance without becoming duplicated
   story authority;
5. whether the migration can establish every current `introducedBy` value
   without inference; and
6. whether the Develop manifest rule catches additions, deletions, renames, and
   registry changes without broad lane escalation.

The implementation plan must not begin until this spec is accepted and its
co-review evidence is published.
