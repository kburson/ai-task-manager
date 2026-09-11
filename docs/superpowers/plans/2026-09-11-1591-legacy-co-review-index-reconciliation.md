# Legacy Co-review Index Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, lock-safe, replayable way to remove only proven stale active projections from the legacy co-review index and verify the main index is ready for runtime decommission.

**Architecture:** A pure reconciliation library classifies index rows from conjunctive runtime, test-sandbox, and validated archive evidence. Its apply path writes a prepared journal record, atomically removes proven stale projections under the existing index lock, verifies archive hashes, and writes an applied record; a thin CLI provides inspect, apply, and verify modes.

**Tech Stack:** Node.js ESM, `node:test`, legacy co-review index/archive libraries, Git repository boundary, JSONL operational journal.

## Global Constraints

- Missing runtime or worktree paths alone are never lifecycle authority.
- Never create or alter protocol events, terminal archives, delivery receipts, or GitHub authority.
- Preserve every file under `docs/superpowers/reviews` byte-for-byte.
- Keep unresolved and genuinely live active rows fail-closed.
- Hold the existing co-review index lock for every journal/index mutation.
- Keep `npx aitm co-review`, `scripts/review/**`, and production consumers in place; #1592 owns decommission.
- Execute tasks serially in this session; do not dispatch subagents.

---

### Task 1: Deterministic Inventory and Evidence Classifier

**Files:**

- Create: `scripts/review/lib/reconciliation.mjs`
- Create: `scripts/tests/integration/review/co-review-index-reconciliation.test.mjs`

**Interfaces:**

- Consumes: `readProtocolIndex(indexFile)`, `statusProtocol({cwd, dir})`, `inspectForeignArchive({root, destination, currentProtocolId})`, and `REAL_REPOSITORY_BOUNDARY`.
- Produces: `inventoryLegacyIndex({projectDir, indexFile, journalFile, deps})` returning `{indexFile, journalFile, indexSha256, archiveSnapshot, rows, counts}` with rows ordered by `protocolId`.
- Produces: inventory rows shaped as `{protocolId, lifecycle, sourceCategory, runtimeExists, worktreeExists, evidence, disposition, reason, row}`.

- [ ] **Step 1: Write failing classification tests**

Add fixture builders that create an isolated Git repository, index, runtime,
tracked archive, and journal. Add tests named exactly:

```js
test('inventory accounts for every row in deterministic protocol order', () => {});
test('missing paths alone remain unresolved', () => {});
test('recognized isolated test residue is removable only with fixture identities', () => {});
test('the owner provenance inspection probe is removable only with every probe signal', () => {});
test('an integrity-valid active runtime always remains live', () => {});
test('a missing historical runtime is removable only when a valid archive supersedes its exact artifact', () => {});
test('invalid, unreachable, or ambiguous archive evidence remains unresolved', () => {});
```

Each test asserts the complete inventory row, including category, existence
booleans, evidence, disposition, and reason. The first test also asserts that
the number of output records equals the number of input index rows.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/integration/review/co-review-index-reconciliation.test.mjs
```

Expected: fail because `scripts/review/lib/reconciliation.mjs` does not exist.

- [ ] **Step 3: Implement canonical hashing, path categories, and archive discovery**

In `reconciliation.mjs`, add:

```js
export const RECONCILIATION_SCHEMA = 'aitm.co-review-index-reconciliation/v1';

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
```

Discover tracked archive `README.md` files using repository-boundary Git calls,
validate each directory with `inspectForeignArchive`, require a different
protocol ID, verify the manifest's accepted commit is reachable, and compare
the committed artifact blob and SHA-256 with the manifest. Snapshot every
tracked archive file as sorted `{path, sha256}` records.

- [ ] **Step 4: Implement the row classifier**

Evaluate live runtime evidence before stale patterns. Require all test signals:

```js
const TEST_IDENTITIES = new Set(['author-agent\0reviewer-agent', 'owner-agent\0reviewer-agent']);

const testPath =
  normalized.includes('/.tmp/test/') ||
  normalized.includes('/.scratch/test/') ||
  /\/.scratch\/\.task-test-[^/]+\//.test(normalized);
```

Require `artifact === 'docs/artifact.md'`, an approved identity pair, both
paths missing, and a recognized test path for `remove-test-residue`. Require
exact probe identities, missing paths, and a contained `.tmp/inspect/*/runtime`
path for `remove-inspection-probe`. Require a valid archive for the exact
artifact path and missing paths for `remove-superseded-attempt`. Everything
else active becomes `retain-live` or `retain-unresolved`; terminal lifecycle states
become `retain-terminal`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
node --test scripts/tests/integration/review/co-review-index-reconciliation.test.mjs
```

Expected: all Task 1 tests pass.

- [ ] **Step 6: Commit the inventory slice**

```bash
git add scripts/review/lib/reconciliation.mjs scripts/tests/integration/review/co-review-index-reconciliation.test.mjs
git commit -m "feat(review): inventory legacy index evidence [#1591]"
```

### Task 2: Lock-safe Journaled Apply and Recovery

**Files:**

- Modify: `scripts/review/lib/reconciliation.mjs`
- Modify: `scripts/tests/integration/review/co-review-index-reconciliation.test.mjs`

**Interfaces:**

- Consumes: Task 1 inventory and `withLock(indexFile, operation)`.
- Produces: `reconcileLegacyIndex({projectDir, indexFile, journalFile, deps})` returning `{status, operationId, before, after, removed, blockers, archiveSnapshot}`.
- Produces: append-only `prepared` and `applied` records under schema `aitm.co-review-index-reconciliation/v1`.

- [ ] **Step 1: Write failing apply and recovery tests**

Add tests named exactly:

```js
test('apply removes only proven stale active projections and preserves all other rows', () => {});
test('apply records every removed row and its evidence before changing the index', () => {});
test('archive paths and hashes are identical before and after apply', () => {});
test('lock contention changes neither index nor journal', () => {});
test('retry after prepared journal interruption completes the original operation', () => {});
test('retry after index rename records the missing applied line', () => {});
test('completed replay is idempotent and does not duplicate journal records', () => {});
test('unexpected index drift during recovery fails closed', () => {});
```

Use injected hooks `afterPrepared` and `afterIndexWrite` to simulate the two
crash seams. Assert exact journal line counts, operation IDs, index digests,
and removed protocol IDs.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/integration/review/co-review-index-reconciliation.test.mjs
```

Expected: the Task 2 tests fail because `reconcileLegacyIndex` is absent.

- [ ] **Step 3: Implement canonical operation and journal records**

Compute the expected after-index bytes before mutation. Derive `operationId`
from the canonical model:

```js
const operationModel = {
  schema: RECONCILIATION_SCHEMA,
  beforeIndexSha256,
  afterIndexSha256,
  removed: removable.map(({ protocolId, sourceCategory, evidence, row }) => ({
    protocolId,
    sourceCategory,
    evidence,
    row,
  })),
  blockers: blocked.map(({ protocolId, reason }) => ({ protocolId, reason })),
  archiveSnapshot,
};
const operationId = sha256(canonicalJson(operationModel));
```

Persist one-line JSON records with fixed timestamps retained across retry.
Open, append, and `fsync` the journal before index mutation. Treat malformed
journal lines, duplicate operation phases, and mismatched operation models as
conflicts.

- [ ] **Step 4: Implement lock-scoped atomic apply and replay**

Hold `withLock(indexFile, ...)`, re-read the index, compute the operation, append
`prepared`, write a same-directory temporary file, `fsync` it, rename it over
the index, verify archive snapshot equality, and append `applied`. Recovery
accepts only the prepared operation's exact before or expected-after digest.
Remove entries by protocol ID; do not alter the remaining row objects.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
node --test scripts/tests/integration/review/co-review-index-reconciliation.test.mjs
```

Expected: every Task 1 and Task 2 test passes.

- [ ] **Step 6: Commit the apply slice**

```bash
git add scripts/review/lib/reconciliation.mjs scripts/tests/integration/review/co-review-index-reconciliation.test.mjs
git commit -m "feat(review): reconcile legacy index under lock [#1591]"
```

### Task 3: CLI, Migration Guard Verification, and Test Selection

**Files:**

- Create: `scripts/review/reconcile-legacy-index.mjs`
- Modify: `scripts/review/lib/reconciliation.mjs`
- Modify: `scripts/tests/integration/review/co-review-index-reconciliation.test.mjs`
- Modify: `scripts/tests/integration/review/peer-review-migration-guard.test.mjs`
- Modify: `scripts/task-tracker/test-impact-manifest.json`

**Interfaces:**

- Consumes: `inventoryLegacyIndex`, `reconcileLegacyIndex`, and `assertLegacyReviewMigrationSafe`.
- Produces: `verifyLegacyIndexReconciliation({projectDir, indexFile, journalFile})`.
- Produces: CLI modes `inspect`, `--apply`, and `--verify`, plus fixture-only path overrides.

- [ ] **Step 1: Write failing CLI and migration tests**

Add tests named exactly:

```js
test('CLI inspect prints deterministic counts without mutation', () => {});
test('CLI apply prints the operation and before and after summaries', () => {});
test('CLI verify refuses any remaining active row', () => {});
test('CLI verify validates the applied journal and reaches production consumer checks', () => {});
test('CLI rejects conflicting modes and unknown arguments', () => {});
```

Extend the migration-guard test with a reconciled index fixture and assert its
error names `legacy runtime still has production consumers`, never `active
legacy review`.

- [ ] **Step 2: Run the two focused files and verify RED**

Run:

```bash
node --test scripts/tests/integration/review/co-review-index-reconciliation.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
```

Expected: CLI tests fail because the entrypoint and verifier are absent.

- [ ] **Step 3: Implement verification and the CLI**

Verification requires zero rows whose lifecycle is `active`, a latest valid
`applied` journal record whose after digest and archive snapshot match current
state, and the migration guard's exact production-consumer refusal. The CLI
prints JSON summaries and sets a nonzero exit code for unresolved rows,
journal conflict, archive drift, active-row guard refusal, or argument errors.
The `--index-file` and `--journal-file` flags must be supplied together for
fixtures so production cannot accidentally mix authority locations.

- [ ] **Step 4: Add test-impact coverage**

Extend the existing peer-review boundary rule so changes to either
`scripts/review/lib/reconciliation.mjs` or
`scripts/review/reconcile-legacy-index.mjs` select both reconciliation and
migration-guard integration tests.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
node --test scripts/tests/integration/review/co-review-index-reconciliation.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 6: Run formatting and static checks for the completed shape**

```bash
npx prettier --write scripts/review/lib/reconciliation.mjs scripts/review/reconcile-legacy-index.mjs scripts/tests/integration/review/co-review-index-reconciliation.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs scripts/task-tracker/test-impact-manifest.json docs/superpowers/specs/2026-09-11-1591-legacy-co-review-index-reconciliation-design.md docs/superpowers/plans/2026-09-11-1591-legacy-co-review-index-reconciliation.md
npm run lint
npm run format:check
```

Expected: both repository checks exit 0.

- [ ] **Step 7: Commit the CLI slice**

```bash
git add scripts/review/reconcile-legacy-index.mjs scripts/review/lib/reconciliation.mjs scripts/tests/integration/review/co-review-index-reconciliation.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs scripts/task-tracker/test-impact-manifest.json docs/superpowers/plans/2026-09-11-1591-legacy-co-review-index-reconciliation.md
git commit -m "feat(review): expose governed index reconciliation [#1591]"
```

### Task 4: Governed Main-index Apply and Full Verification

**Files:**

- Runtime authority: `.tmp/aitm/fleet/co-review-index.json`
- Runtime journal: `.tmp/aitm/fleet/co-review-index-reconciliation.jsonl`
- No tracked source file is edited in this task.

**Interfaces:**

- Consumes: the completed CLI and the main checkout's legacy index.
- Produces: an applied reconciliation journal, an index with only durable
  terminal/intervention rows, and exact verification evidence.

- [ ] **Step 1: Run the focused issue command before live apply**

```bash
node --test scripts/tests/integration/review/co-review-index-reconciliation.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 2: Inspect and apply the live main index**

```bash
node scripts/review/reconcile-legacy-index.mjs
node scripts/review/reconcile-legacy-index.mjs --apply
node scripts/review/reconcile-legacy-index.mjs --verify
```

Expected: inspect accounts for every row; apply reports only proven stale
removals; verify reports zero active rows, matching journal/archive evidence,
and the production-consumer migration-guard boundary.

- [ ] **Step 3: Verify the complete repository at the exact commit**

```bash
npm test
npm run lint
npm run format:check
npm run test:slow
git log --oneline -1
```

Expected: every command exits 0. If test execution creates new legacy residue,
repeat inspect, apply, and verify as a new journaled operation before entering
the governed Test stage.

- [ ] **Step 4: Commit any formatting-only tracked correction if required**

If and only if a formatter changed a tracked file, attribute and commit that
exact diff:

```bash
git add --update
git commit -m "style(review): normalize reconciliation files [#1591]"
```

Otherwise leave the verified tracked tree clean and proceed to AITM Test.
