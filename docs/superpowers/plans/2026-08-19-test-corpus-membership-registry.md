# Test Corpus Membership Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mutable central post-snapshot test census with exact,
deterministic per-test membership records and run a cheap membership check during
Develop without weakening existing test-impact safety behavior.

**Architecture:** Keep the frozen #1256 manifest as one immutable authority and
add one strict JSON record per post-snapshot canonical test as the second
authority. A test-only library loads records, rejects malformed authority, and
reconciles canonical discovery exactly; a cheap meta test exercises that boundary
while the existing package-corpus test retains expensive migration and packaging
proofs.

**Tech Stack:** Node.js 22+ ESM, `node:test`, `node:assert/strict`, repository
test discovery/lane utilities, JSON fixtures, and the existing declarative
test-impact manifest.

## Global Constraints

- Do not modify `scripts/tests/fixtures/test-corpus-pre-move.json`; its expected
  SHA-256 is
  `2c89b34b33913d2824d1134ae8b5ab6a22436e4c99ceb1855650eec2e2a9a53f`.
- Schema 1 records contain exactly `schema` and `path`; do not add
  `introducedBy`, story ownership, timestamps, or generated counts.
- `@story` remains the many-to-many evidence authority and is not read by the
  membership library.
- `recordPathForTestPath()` accepts only paths recognized by
  `parseCanonicalTestPath()` and never proposes a record for a noncanonical
  discovery path.
- The guard is read-only and fail-closed. It never creates, repairs, moves, or
  deletes records.
- The current selector cannot distinguish test additions from content-only test
  edits; selecting the cheap membership test for both is accepted.
- Existing `deleted-test-lane` escalation remains unchanged for deleted or
  renamed tests.
- Follow strict red-green-refactor: observe the expected failing assertion before
  each implementation change.
- Do not begin implementation until this plan is accepted by the fresh Grok
  co-review protocol.

## File Structure

- Create `scripts/tests/lib/test-corpus-membership.mjs`: record mapping, frozen
  destination resolution, strict registry loading, exact reconciliation, and
  diagnostic formatting. This is test-only code, not a shipped runtime API.
- Create `scripts/tests/unit/meta/test-corpus-membership.test.mjs`: synthetic
  contract tests plus the cheap live-repository exact-membership guard.
- Create
  `scripts/tests/fixtures/test-corpus-post-snapshot/<lane>/<relative>.test.mjs.json`:
  one schema-1 record per live post-snapshot test.
- Modify `scripts/tests/unit/meta/package-test-corpus.test.mjs`: remove every
  mutable post-snapshot list/minimum while retaining frozen schema, hash, rename,
  lane-correction, package-exclusion, and `npm pack` proofs.
- Modify `scripts/task-tracker/test-impact-manifest.json`: select the cheap guard
  for test/record changes and both corpus tests for frozen-authority changes.
- Modify
  `scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs`: prove
  manifest selection, content-edit over-selection, record changes, and unchanged
  deletion/rename lane escalation.

---

### Task 1: Strict Record Paths and Registry Loader

**Files:**

- Create: `scripts/tests/lib/test-corpus-membership.mjs`
- Create: `scripts/tests/unit/meta/test-corpus-membership.test.mjs`

**Interfaces:**

- Consumes: `parseCanonicalTestPath(relPath)` from
  `scripts/task-tracker/lib/test-lanes.mjs` and project-local scratch directories
  from `mkdtempProjectIsolated()`.
- Produces:
  - `POST_SNAPSHOT_REGISTRY_ROOT: string`
  - `recordPathForTestPath(testPath: string): string`
  - `finalizedFrozenPaths(manifest: object): string[]`
  - `loadPostSnapshotRecords({ projectRoot, registryRoot? }): { records, errors,
misplacedRecords, rootPresent }`, where `errors` contains unreadable,
    invalid-JSON, schema, key, and path failures, while `misplacedRecords`
    contains valid records stored at a location other than
    `recordPathForTestPath(path)`.

- [ ] **Step 1: Write a failing module-boundary test**

Create the test file with the story tag and a dynamic import so the missing
module produces an assertion failure rather than an uncaught loader error:

```js
// @story #1263
import assert from 'node:assert/strict';
import { test } from 'node:test';

const membershipModule = new URL('../../lib/test-corpus-membership.mjs', import.meta.url);

test('the membership library exposes a test-only registry boundary', async () => {
  const membership = await import(membershipModule).catch(() => null);
  assert.ok(membership, 'test-corpus-membership.mjs must exist');
});
```

- [ ] **Step 2: Run the test and observe RED**

Run:

```bash
node --test scripts/tests/unit/meta/test-corpus-membership.test.mjs
```

Expected: FAIL at `test-corpus-membership.mjs must exist`.

- [ ] **Step 3: Add the minimal module boundary**

Create the library with the registry constant only:

```js
// @story #1263
export const POST_SNAPSHOT_REGISTRY_ROOT = 'scripts/tests/fixtures/test-corpus-post-snapshot';
```

- [ ] **Step 4: Run the test and observe GREEN**

Run the same focused command. Expected: 1 test passes.

- [ ] **Step 5: Add failing path, frozen-resolution, and loader tests**

Expand the test imports and fixtures:

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  finalizedFrozenPaths,
  loadPostSnapshotRecords,
  POST_SNAPSHOT_REGISTRY_ROOT,
  recordPathForTestPath,
} from '../../lib/test-corpus-membership.mjs';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';

function writeRecord(projectRoot, recordFile, value) {
  const absolute = path.join(projectRoot, recordFile);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}
```

Add separate tests that assert:

```js
assert.equal(
  recordPathForTestPath('scripts/tests/unit/task-tracker/lib/new-policy.test.mjs'),
  `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/task-tracker/lib/new-policy.test.mjs.json`
);
assert.throws(
  () => recordPathForTestPath('scripts/gh/misplaced.test.mjs'),
  /noncanonical test path/
);

assert.deepEqual(
  finalizedFrozenPaths({
    tests: [{ newPath: 'scripts/tests/unit/lib/a.test.mjs' }],
    laneCorrections: [
      {
        migrationPath: 'scripts/tests/unit/lib/a.test.mjs',
        finalPath: 'scripts/tests/integration/lib/a.test.mjs',
      },
    ],
  }),
  ['scripts/tests/integration/lib/a.test.mjs']
);

assert.throws(
  () =>
    finalizedFrozenPaths({
      tests: [
        { newPath: 'scripts/tests/unit/lib/a.test.mjs' },
        { newPath: 'scripts/tests/integration/lib/a.test.mjs' },
      ],
      laneCorrections: [
        {
          migrationPath: 'scripts/tests/unit/lib/a.test.mjs',
          finalPath: 'scripts/tests/integration/lib/a.test.mjs',
        },
      ],
    }),
  /duplicate finalized frozen path/
);
```

Use isolated projects to prove a valid record loads and these independent
records fail closed with their physical file named in `errors`: invalid JSON,
extra key, wrong schema, noncanonical path, duplicate declared path, and a
registry root that is a file rather than a directory. Prove separately that a
valid record stored at the wrong physical path appears in `misplacedRecords`
with both `recordFile` and `expectedRecordFile`, and does not appear in
`errors`.

- [ ] **Step 6: Run the focused test and observe RED**

Expected: FAIL because the three functions are not exported.

- [ ] **Step 7: Implement canonical mapping and strict loading**

Implement these exact rules in the library:

```js
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parseCanonicalTestPath } from '../../task-tracker/lib/test-lanes.mjs';

export const POST_SNAPSHOT_REGISTRY_ROOT = 'scripts/tests/fixtures/test-corpus-post-snapshot';

export function recordPathForTestPath(testPath) {
  const parsed = parseCanonicalTestPath(testPath);
  if (!parsed) {
    throw new TypeError(`test-corpus-membership: noncanonical test path: ${testPath}`);
  }
  return `${POST_SNAPSHOT_REGISTRY_ROOT}/${parsed.lane}/${parsed.relative}.json`;
}

export function finalizedFrozenPaths(manifest) {
  const corrections = new Map(
    (manifest.laneCorrections || []).map(({ migrationPath, finalPath }) => [
      migrationPath,
      finalPath,
    ])
  );
  const paths = (manifest.tests || []).map(({ newPath }) => corrections.get(newPath) || newPath);
  if (new Set(paths).size !== paths.length) {
    throw new TypeError('test-corpus-membership: duplicate finalized frozen path');
  }
  return paths.sort();
}
```

The loader must recursively enumerate only `.json` files in sorted POSIX order,
parse each file independently, require sorted keys to equal `['path', 'schema']`,
require integer schema `1`, and validate canonical `path`. After those checks,
compare the physical location with `recordPathForTestPath(path)` and append a
`{ recordFile, expectedRecordFile, path }` entry to `misplacedRecords` on
mismatch. Collect malformed `errors` and `misplacedRecords` independently rather
than throwing on the first bad record. Return `rootPresent: false` for an absent
root and a named malformed error for an unreadable/non-directory root.

- [ ] **Step 8: Run focused tests and observe GREEN**

Run:

```bash
node --test scripts/tests/unit/meta/test-corpus-membership.test.mjs
```

Expected: all Task 1 tests pass with no warnings.

- [ ] **Step 9: Commit the loader boundary**

```bash
git add scripts/tests/lib/test-corpus-membership.mjs \
  scripts/tests/unit/meta/test-corpus-membership.test.mjs
git commit -m "test(corpus): add strict membership record loader [#1263]"
```

### Task 2: Exact Reconciliation and Actionable Diagnostics

**Files:**

- Modify: `scripts/tests/lib/test-corpus-membership.mjs`
- Modify: `scripts/tests/unit/meta/test-corpus-membership.test.mjs`

**Interfaces:**

- Consumes: validated frozen paths and loader results from Task 1.
- Produces:
  - `reconcileCorpusMembership({ discovered, frozenPaths, records,
recordErrors?, misplacedRecords? }): MembershipResult`
  - `formatCorpusMembershipErrors(result): string`
  - `MembershipResult` contains `ok`, `noncanonicalDiscoveredPaths`,
    `undeclaredPaths`, `missingPaths`, `duplicatePaths`, `overlapPaths`,
    `malformedRecords`, `misplacedRecords`, and derived
    `{ all, unit, integration, slow }` counts.

- [ ] **Step 1: Write failing synthetic reconciliation tests**

Add one-behavior tests using synthetic arrays. Required assertions:

```js
const exact = reconcileCorpusMembership({
  discovered: [
    'scripts/tests/unit/lib/frozen.test.mjs',
    'scripts/tests/integration/lib/new.test.mjs',
  ],
  frozenPaths: ['scripts/tests/unit/lib/frozen.test.mjs'],
  records: [
    {
      recordFile: `${POST_SNAPSHOT_REGISTRY_ROOT}/integration/lib/new.test.mjs.json`,
      schema: 1,
      path: 'scripts/tests/integration/lib/new.test.mjs',
    },
  ],
});
assert.equal(exact.ok, true);
assert.deepEqual(exact.counts, { all: 2, unit: 1, integration: 1, slow: 0 });
```

Add independent RED cases for:

- canonical undeclared addition;
- stale record with missing test;
- missing frozen destination;
- duplicate record declaration;
- record/frozen overlap;
- a valid record stored at the wrong deterministic location;
- noncanonical discovery path; and
- a loader error even when path sets otherwise match.

Assert diagnostics contain every offending path in sorted order. For
`scripts/gh/misplaced.test.mjs`, assert the message contains
`test-tree-layout.test.mjs` and `No membership record can be created`, and does
not contain `test-corpus-post-snapshot/scripts/gh`.

- [ ] **Step 2: Run focused tests and observe RED**

Expected: FAIL because reconciliation and formatting exports are absent.

- [ ] **Step 3: Implement exact canonical-only reconciliation**

Implement set arithmetic in this order:

```js
const noncanonicalDiscoveredPaths = discovered
  .filter((testPath) => !parseCanonicalTestPath(testPath))
  .sort();
const canonicalDiscovered = discovered
  .filter((testPath) => parseCanonicalTestPath(testPath))
  .sort();
const frozen = new Set(frozenPaths);
const declaredRecords = new Map();
```

Then collect duplicate record paths, frozen overlaps, canonical discoveries not
in `frozen union records`, and declared paths missing from canonical discovery.
Represent each missing entry with its authority:

```js
{ path, authority: 'frozen', recordFile: null }
{ path, authority: 'record', recordFile: '<deterministic record path>' }
```

Copy `recordErrors` into `malformedRecords` and preserve `misplacedRecords` as a
distinct result collection. `ok` is true only when every error/delta collection,
including both of those collections, is empty. Counts derive from canonical
discovery through `parseCanonicalTestPath()` and never from authored numbers.

- [ ] **Step 4: Implement deterministic diagnostics**

Render sections in this order: malformed records, misplaced records,
noncanonical layout, duplicates, frozen overlaps, undeclared additions, and
missing declarations. Each misplaced entry names `recordFile` and
`expectedRecordFile` and says to move or repair that record; it is never rendered
as malformed, undeclared, or a test-layout failure. For canonical undeclared
paths, call `recordPathForTestPath()` only after classification succeeds. For
missing frozen paths, say to restore/repair the frozen destination; for missing
record paths, name the record to remove or repair. The formatter performs no
writes.

- [ ] **Step 5: Run focused tests and observe GREEN**

Run the focused file. Expected: all Task 1 and Task 2 tests pass.

- [ ] **Step 6: Commit reconciliation and diagnostics**

```bash
git add scripts/tests/lib/test-corpus-membership.mjs \
  scripts/tests/unit/meta/test-corpus-membership.test.mjs
git commit -m "test(corpus): reconcile exact membership with diagnostics [#1263]"
```

### Task 3: Migrate the Live Corpus and Retire Central Lists

**Files:**

- Modify: `scripts/tests/unit/meta/test-corpus-membership.test.mjs`
- Modify: `scripts/tests/unit/meta/package-test-corpus.test.mjs`
- Create: 25 deterministic files under
  `scripts/tests/fixtures/test-corpus-post-snapshot/` listed below.
- Verify unchanged:
  `scripts/tests/fixtures/test-corpus-pre-move.json`

**Interfaces:**

- Consumes: all Task 1 and Task 2 library exports.
- Produces: one cheap live exact-membership test and a complete 25-record
  post-snapshot registry, including the new cheap test itself.

- [ ] **Step 1: Add the failing live-repository guard**

Add imports for `discoverTestFiles`, `readFileSync`, `path`, `fileURLToPath`, and
all Task 1/2 membership functions used below. Define the root exactly as:

```js
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
```

Then add this live test:

```js
test('live canonical discovery equals frozen destinations union post-snapshot records', () => {
  const discovered = discoverTestFiles({ projectRoot: PROJECT_ROOT });
  const frozenManifest = JSON.parse(
    readFileSync(
      path.join(PROJECT_ROOT, 'scripts/tests/fixtures/test-corpus-pre-move.json'),
      'utf8'
    )
  );
  const frozenPaths = finalizedFrozenPaths(frozenManifest);
  const loaded = loadPostSnapshotRecords({ projectRoot: PROJECT_ROOT });
  const result = reconcileCorpusMembership({
    discovered,
    frozenPaths,
    records: loaded.records,
    recordErrors: loaded.errors,
    misplacedRecords: loaded.misplacedRecords,
  });
  assert.equal(result.ok, true, formatCorpusMembershipErrors(result));
});
```

- [ ] **Step 2: Run the live guard and observe RED**

Run the focused file. Expected: FAIL with sorted undeclared paths and exact
record locations. The result must include the new
`scripts/tests/unit/meta/test-corpus-membership.test.mjs` path and must not be a
numeric mismatch.

- [ ] **Step 3: Add the complete deterministic registry**

Each record is exactly:

```json
{
  "schema": 1,
  "path": "<test path from the left column>"
}
```

with one trailing newline and no other keys. Create every mapping below:

| Test path                                                                        | Record path under `scripts/tests/fixtures/test-corpus-post-snapshot/`   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `scripts/tests/slow/review/co-review-boundaries.test.mjs`                        | `slow/review/co-review-boundaries.test.mjs.json`                        |
| `scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs`        | `slow/task-tracker/lib/action-capture-integration.test.mjs.json`        |
| `scripts/tests/unit/meta/audit-story-tags.test.mjs`                              | `unit/meta/audit-story-tags.test.mjs.json`                              |
| `scripts/tests/unit/meta/package-test-corpus.test.mjs`                           | `unit/meta/package-test-corpus.test.mjs.json`                           |
| `scripts/tests/unit/meta/slow-lane-partition-policy.test.mjs`                    | `unit/meta/slow-lane-partition-policy.test.mjs.json`                    |
| `scripts/tests/unit/meta/test-corpus-membership.test.mjs`                        | `unit/meta/test-corpus-membership.test.mjs.json`                        |
| `scripts/tests/unit/review/co-review-finalization.test.mjs`                      | `unit/review/co-review-finalization.test.mjs.json`                      |
| `scripts/tests/unit/review/co-review-fixture-cost.test.mjs`                      | `unit/review/co-review-fixture-cost.test.mjs.json`                      |
| `scripts/tests/unit/review/co-review-index.test.mjs`                             | `unit/review/co-review-index.test.mjs.json`                             |
| `scripts/tests/unit/review/co-review.test.mjs`                                   | `unit/review/co-review.test.mjs.json`                                   |
| `scripts/tests/unit/task-tracker/core/docs-only-lane-skip-completeness.test.mjs` | `unit/task-tracker/core/docs-only-lane-skip-completeness.test.mjs.json` |
| `scripts/tests/unit/task-tracker/core/run-tests-schedule.test.mjs`               | `unit/task-tracker/core/run-tests-schedule.test.mjs.json`               |
| `scripts/tests/unit/task-tracker/hooks/grok-wire.test.mjs`                       | `unit/task-tracker/hooks/grok-wire.test.mjs.json`                       |
| `scripts/tests/unit/task-tracker/lib/action-capture.test.mjs`                    | `unit/task-tracker/lib/action-capture.test.mjs.json`                    |
| `scripts/tests/unit/task-tracker/lib/cleanup-base-aware.test.mjs`                | `unit/task-tracker/lib/cleanup-base-aware.test.mjs.json`                |
| `scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`            | `unit/task-tracker/lib/co-review-write-policy.test.mjs.json`            |
| `scripts/tests/unit/task-tracker/lib/issue-lock-reentrancy.test.mjs`             | `unit/task-tracker/lib/issue-lock-reentrancy.test.mjs.json`             |
| `scripts/tests/unit/task-tracker/lib/occupancy.test.mjs`                         | `unit/task-tracker/lib/occupancy.test.mjs.json`                         |
| `scripts/tests/unit/task-tracker/lib/test-corpus-paths.test.mjs`                 | `unit/task-tracker/lib/test-corpus-paths.test.mjs.json`                 |
| `scripts/tests/unit/task-tracker/lib/word-counter-grok.test.mjs`                 | `unit/task-tracker/lib/word-counter-grok.test.mjs.json`                 |
| `scripts/tests/unit/task-tracker/lib/worktree-binding-lifecycle.test.mjs`        | `unit/task-tracker/lib/worktree-binding-lifecycle.test.mjs.json`        |
| `scripts/tests/unit/task-tracker/verbs/close-binding-cleanup.test.mjs`           | `unit/task-tracker/verbs/close-binding-cleanup.test.mjs.json`           |
| `scripts/tests/unit/task-tracker/verbs/close-occupancy-cleanup.test.mjs`         | `unit/task-tracker/verbs/close-occupancy-cleanup.test.mjs.json`         |
| `scripts/tests/unit/task-tracker/verbs/fleet-closed-bindings.test.mjs`           | `unit/task-tracker/verbs/fleet-closed-bindings.test.mjs.json`           |
| `scripts/tests/unit/task-tracker/verbs/promote-test-delegation.test.mjs`         | `unit/task-tracker/verbs/promote-test-delegation.test.mjs.json`         |

- [ ] **Step 4: Run the live guard and observe GREEN**

Run the cheap test. Expected: exact reconciliation passes with 940 discovered
tests at this planned branch state: 859 unit, 28 integration, and 53 slow.

- [ ] **Step 5: Retire all central post-snapshot membership claims**

In `package-test-corpus.test.mjs`:

- change the first line to `// @story #876 #1263`;
- delete `EXPECTED_POST_SNAPSHOT_TESTS`;
- keep the live frozen-destination loop but rename its test to
  `live discovery realizes every frozen destination in its final canonical lane`;
- delete `storyOwned`, `liveCounts`, `minimumCounts`, and every minimum assertion;
  and
- delete the complete `live discovery includes the focused Grok provider tests`
  test.

Do not change the frozen schema/count/hash tests, historical blob reader,
migration rename proof, lane-correction proof, package exclusion proof, or
`npm pack` proof.

- [ ] **Step 6: Run both corpus files and observe GREEN**

```bash
node --test scripts/tests/unit/meta/test-corpus-membership.test.mjs
node --test scripts/tests/unit/meta/package-test-corpus.test.mjs
```

Expected: both files pass; no assertion message contains an authored expected
post-snapshot count.

- [ ] **Step 7: Verify frozen bytes and central-list removal**

```bash
shasum -a 256 scripts/tests/fixtures/test-corpus-pre-move.json
rg -n "EXPECTED_POST_SNAPSHOT_TESTS|focused Grok provider tests|minimumCounts" \
  scripts/tests/unit/meta/package-test-corpus.test.mjs
```

Expected: SHA-256 equals the Global Constraints value; `rg` exits 1 with no
matches.

- [ ] **Step 8: Commit live migration**

```bash
git add scripts/tests/lib/test-corpus-membership.mjs \
  scripts/tests/unit/meta/test-corpus-membership.test.mjs \
  scripts/tests/unit/meta/package-test-corpus.test.mjs \
  scripts/tests/fixtures/test-corpus-post-snapshot
git commit -m "test(corpus): migrate exact post-snapshot registry [#1263]"
```

### Task 4: Develop-Stage Membership Selection

**Files:**

- Modify: `scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs`
- Modify: `scripts/task-tracker/test-impact-manifest.json`

**Interfaces:**

- Consumes: unchanged `selectAffectedTests()` manifest behavior and unchanged
  `deleted-test-lane` fallback.
- Produces: two declarative rules named by their `reason` strings:
  `test corpus membership authority change` and
  `frozen test corpus authority change`.

- [ ] **Step 1: Add failing checked-in-manifest selection tests**

Use `selectAffectedTests()` with the real checked-in manifest and a synthetic
discovered set containing:

```js
const cheapMembershipTest = 'scripts/tests/unit/meta/test-corpus-membership.test.mjs';
const expensivePackageTest = 'scripts/tests/unit/meta/package-test-corpus.test.mjs';
const discovered = [
  cheapMembershipTest,
  expensivePackageTest,
  'scripts/tests/unit/lib/live.test.mjs',
  'scripts/tests/integration/lib/live.test.mjs',
  'scripts/tests/slow/lib/live.test.mjs',
];
```

Write separate tests proving:

1. a content edit to `scripts/tests/unit/lib/live.test.mjs` selects itself and
   the cheap test with a `manifest` reason;
2. a deleted integration test selects the cheap test and retains the full
   integration lane with `deleted-test-lane` reasons;
3. an added, modified, or deleted registry JSON selects the cheap test without
   lane escalation;
4. old and new paths of a rename select the cheap test while the old path keeps
   former-lane escalation; and
5. `test-corpus-pre-move.json` selects both cheap and expensive corpus tests.

- [ ] **Step 2: Run selector tests and observe RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs
```

Expected: new assertions fail because no corpus manifest rules exist.

- [ ] **Step 3: Add the two manifest rules**

Append these exact rules without changing selector code:

```json
{
  "sources": [
    "scripts/tests/**/*.test.mjs",
    "scripts/tests/fixtures/test-corpus-post-snapshot/**/*.json"
  ],
  "tests": ["scripts/tests/unit/meta/test-corpus-membership.test.mjs"],
  "reason": "test corpus membership authority change"
},
{
  "sources": ["scripts/tests/fixtures/test-corpus-pre-move.json"],
  "tests": [
    "scripts/tests/unit/meta/test-corpus-membership.test.mjs",
    "scripts/tests/unit/meta/package-test-corpus.test.mjs"
  ],
  "reason": "frozen test corpus authority change"
}
```

- [ ] **Step 4: Run selector and corpus tests and observe GREEN**

```bash
node --test scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs
node --test scripts/tests/unit/meta/test-corpus-membership.test.mjs
node --test scripts/tests/unit/meta/package-test-corpus.test.mjs
```

Expected: all pass; deletion/rename tests still report lane escalation, and JSON
record changes do not.

- [ ] **Step 5: Commit selection rules**

```bash
git add scripts/task-tracker/test-impact-manifest.json \
  scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs
git commit -m "test(impact): select cheap corpus membership guard [#1263]"
```

### Task 5: Repository Verification and Delivery Evidence

**Files:**

- Verify: every file changed in Tasks 1-4
- Verify unchanged:
  `scripts/tests/fixtures/test-corpus-pre-move.json`

**Interfaces:**

- Consumes: completed implementation commits.
- Produces: clean verification evidence for every #1263 acceptance criterion and
  Definition-of-Done command; no additional behavior.

- [ ] **Step 1: Run focused verification**

```bash
node --test scripts/tests/unit/meta/test-corpus-membership.test.mjs
node --test scripts/tests/unit/meta/package-test-corpus.test.mjs
node --test scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs
```

Expected: all focused tests pass with zero warnings.

- [ ] **Step 2: Run repository quality gates**

```bash
npm run lint
npm run format:check
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run the required fast and slow suites**

```bash
npm test
npm run test:slow
```

Expected: all discovered test files pass in their canonical lanes.

- [ ] **Step 4: Re-prove immutable and exact authority**

```bash
shasum -a 256 scripts/tests/fixtures/test-corpus-pre-move.json
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {discoverTestFiles} from './scripts/task-tracker/lib/discover-test-files.mjs'; import {finalizedFrozenPaths,loadPostSnapshotRecords,reconcileCorpusMembership} from './scripts/tests/lib/test-corpus-membership.mjs'; const root=process.cwd(); const frozen=finalizedFrozenPaths(JSON.parse(readFileSync('./scripts/tests/fixtures/test-corpus-pre-move.json','utf8'))); const loaded=loadPostSnapshotRecords({projectRoot:root}); const result=reconcileCorpusMembership({discovered:discoverTestFiles({projectRoot:root}),frozenPaths:frozen,records:loaded.records,recordErrors:loaded.errors,misplacedRecords:loaded.misplacedRecords}); if(!result.ok) process.exit(1); console.log(JSON.stringify(result.counts));"
```

Expected: frozen hash remains
`2c89b34b33913d2824d1134ae8b5ab6a22436e4c99ceb1855650eec2e2a9a53f`
and reconciliation prints the derived live counts.

- [ ] **Step 5: Inspect final history and workspace**

```bash
git status --short
git log --oneline --decorate -8
```

Expected: clean tracked workspace; commits are narrowly attributed to `[#1263]`.

- [ ] **Step 6: Record governed acceptance evidence**

Run each issue-body verification command individually and use the sanctioned
AITM checkbox/evidence verbs. Do not bulk-check acceptance criteria, do not push,
and do not advance beyond the next governed state without the required review
gate.

## Self-Review Checklist

- Spec coverage: Tasks 1-4 cover strict schema/location, canonical-only
  discovery, exact set equality, diagnostics, live migration, removal of both
  central lists, cheap Develop selection, and unchanged lane escalation.
- Frozen authority: no task edits the #1256 manifest; Tasks 3 and 5 verify its
  exact hash.
- Story boundary: no interface or record contains `introducedBy` or reads
  `@story`.
- Type consistency: loader records always use `{ recordFile, schema, path }`;
  reconciliation consumes those fields, accepts malformed loader `errors` as
  `recordErrors`, and carries `{ recordFile, expectedRecordFile, path }`
  `misplacedRecords` without collapsing them into malformed diagnostics.
- Placeholder scan: no `TBD`, `TODO`, deferred implementation, or unnamed error
  handling remains.
- Scope: no general corpus CLI, selector algorithm change, tombstones, generated
  central manifest, or lane reclassification is included.

## Co-Review Gate

Commit this plan, initialize a fresh ignored Grok co-review runtime with 12
review turns and 15 one-minute wait cycles, and iterate until reviewer consensus
accepts the exact plan commit. Publish and commit the accepted plan-review archive
before any Task 1 implementation step.
