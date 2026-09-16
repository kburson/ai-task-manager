# Squash-Delivered Lane-Correction Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace #1413's source-branch-only lane-correction authority with exact, trunk-reachable squash-delivery provenance while preserving the frozen test corpus.

**Architecture:** Keep the existing manifest schema and fail-closed Git assertions. Change the focused test to require the canonical squash parent/delivery pair, then mechanically update only the 97 affected provenance records and three squash-sensitive rename scores.

**Tech Stack:** Node.js test runner, Git rename detection, JSON fixture, AITM governed issue workflow.

## Global Constraints

- Do not implement until Kendrick approves this exact plan and `/task plan-approve #1419` records that approval.
- Work only in `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1419-squash-provenance` on `codex/1419-squash-provenance`.
- Preserve `scripts/tests/fixtures/test-corpus-pre-move.json` schema, source commit, 915 test records, counts, paths, digests, lane decisions, reasons, and the pre-#1413 lane correction.
- Do not merge or fetch the #1413 source branch to satisfy reachability.
- Do not weaken `assertCommitReachable`, exact path-pair comparison, or per-record rename-score verification.
- Use the canonical pair `28b28babe6c7d3044dad3c0ea04103ce120d0004..b4e952d11c62ba3978a4dee46d47d53051516d2e`.
- Follow test-driven development and stop if the RED failure is not caused by the stale #1413 provenance.
- Stop before push, pull request, merge, or cleanup-branch resumption unless separately authorized by the governed workflow.

---

### Task 1: Demand canonical squash-delivery authority

**Files:**

- Modify: `scripts/tests/integration/meta/package-test-corpus.test.mjs`
- Test: `scripts/tests/integration/meta/package-test-corpus.test.mjs`

**Interfaces:**

- Consumes: `manifest.laneCorrections[*].provenance` with `baseCommit`, `correctionCommit`, and `renameStatus`.
- Produces: focused assertions that identify exactly 97 #1413 records by the canonical delivery commit and require their single canonical base commit.

- [ ] **Step 1: Add #1419 ownership and canonical constants**

Change the story tag and replace the source-branch correction set with explicit delivery constants:

```js
// @story #876 #1263 #1406 #1419

const ISSUE_1413_DELIVERY_PARENT = '28b28babe6c7d3044dad3c0ea04103ce120d0004';
const ISSUE_1413_DELIVERY_COMMIT = 'b4e952d11c62ba3978a4dee46d47d53051516d2e';
const ISSUE_1413_CORRECTION_COUNT = 97;
```

Delete `ISSUE_1413_CORRECTION_COMMITS` and retain the existing Task 3 constants and `EXPECTED_LANE_CORRECTION` unchanged.

- [ ] **Step 2: Make the census test require the canonical pair**

Replace the `issueCorrections` selection and add the base-authority assertion:

```js
const issueCorrections = manifest.laneCorrections.filter(
  ({ provenance }) => provenance.correctionCommit === ISSUE_1413_DELIVERY_COMMIT
);
assert.equal(issueCorrections.length, ISSUE_1413_CORRECTION_COUNT);
assert.deepEqual(
  new Set(issueCorrections.map(({ provenance }) => provenance.baseCommit)),
  new Set([ISSUE_1413_DELIVERY_PARENT])
);
assert.equal(manifest.laneCorrections.length, ISSUE_1413_CORRECTION_COUNT + 1);
assert.equal(
  new Set(issueCorrections.map(({ migrationPath }) => migrationPath)).size,
  ISSUE_1413_CORRECTION_COUNT
);
```

Do not change `assertCommitReachable` or `every intentional lane correction retains its exact post-migration Git rename`.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/integration/meta/package-test-corpus.test.mjs
```

Expected: non-zero exit. The census test reports `0 !== 97` because the fixture still names source-branch correction commits. The existing exact-rename test may also report that `662c49b7129d795b62e3b62f74b76dab5f10055f` is not reachable from `HEAD`. Stop if the failure has another cause.

---

### Task 2: Rewrite only the stale provenance bytes

**Files:**

- Modify: `scripts/tests/fixtures/test-corpus-pre-move.json`
- Test: `scripts/tests/integration/meta/package-test-corpus.test.mjs`

**Interfaces:**

- Consumes: the four source-branch SHA literals and three named old rename scores.
- Produces: 97 records whose canonical Git authority is the delivery parent/commit pair and whose rename score matches that combined diff.

- [ ] **Step 1: Audit the fixture before mutation**

Run this read-only guard:

```bash
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';

const text = readFileSync('scripts/tests/fixtures/test-corpus-pre-move.json', 'utf8');
const expected = new Map([
  ['662c49b7129d795b62e3b62f74b76dab5f10055f', 1],
  ['b68d2b144170b2f6e51b4fd842d18f240346abdd', 1],
  ['06cc1baddfd26536e7a79538c83a3ae325697464', 96],
  ['8f6eb9ed0196faf1e79befb49e19bfe0e64a0cfb', 96],
]);
for (const [needle, count] of expected) {
  const actual = text.split(needle).length - 1;
  if (actual !== count) throw new Error(`${needle}: expected ${count}, found ${actual}`);
}
console.log('stale provenance occurrence audit: 1/1/96/96');
NODE
```

Expected: exit 0 and `stale provenance occurrence audit: 1/1/96/96`.

- [ ] **Step 2: Apply the guarded mechanical rewrite**

Use a bulk mechanical edit that performs exactly these replacements and refuses unexpected counts:

```js
const replacements = [
  ['662c49b7129d795b62e3b62f74b76dab5f10055f', '28b28babe6c7d3044dad3c0ea04103ce120d0004', 1],
  ['b68d2b144170b2f6e51b4fd842d18f240346abdd', 'b4e952d11c62ba3978a4dee46d47d53051516d2e', 1],
  ['06cc1baddfd26536e7a79538c83a3ae325697464', '28b28babe6c7d3044dad3c0ea04103ce120d0004', 96],
  ['8f6eb9ed0196faf1e79befb49e19bfe0e64a0cfb', 'b4e952d11c62ba3978a4dee46d47d53051516d2e', 96],
];
```

Then update only these named records:

```text
scripts/tests/unit/meta/test-tree-layout.test.mjs: R098 -> R096
scripts/tests/unit/task-tracker/core/assigned-state-residue.test.mjs: R097 -> R095
scripts/tests/unit/task-tracker/lib/test-impact-selector.test.mjs: R098 -> R094
```

Do not serialize the JSON again. Preserve every byte outside the exact SHA and score tokens.

- [ ] **Step 3: Prove the fixture boundary before testing**

Run:

```bash
git diff --word-diff=porcelain -- scripts/tests/fixtures/test-corpus-pre-move.json
```

Expected: only the four obsolete SHA literals, their canonical replacements, and the three named score changes appear. No path, reason, count, source commit, test entry, or unrelated correction changes.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test scripts/tests/integration/meta/package-test-corpus.test.mjs
```

Expected: all tests in the file pass, including the frozen schema/census, source hashes, Task 3 migration renames, all 98 lane corrections, live discovery, and package exclusion checks.

- [ ] **Step 5: Commit the atomic repair**

Run:

```bash
git add scripts/tests/fixtures/test-corpus-pre-move.json scripts/tests/integration/meta/package-test-corpus.test.mjs
git commit -m "fix(test-corpus): bind lane corrections to squash delivery

Closes #1419"
```

Expected: one commit containing only the fixture and focused authority test.

---

### Task 3: Verify exact-SHA readiness and stop at the human delivery gate

**Files:**

- Verify: `scripts/tests/fixtures/test-corpus-pre-move.json`
- Verify: `scripts/tests/integration/meta/package-test-corpus.test.mjs`
- Verify: `docs/superpowers/specs/2026-08-26-1419-squash-delivered-lane-correction-provenance-design.md`
- Verify: `docs/superpowers/plans/2026-08-26-1419-squash-delivered-lane-correction-provenance.md`

**Interfaces:**

- Consumes: the Task 2 implementation commit.
- Produces: exact-SHA verification evidence suitable for independent review; no push, PR, merge, or cleanup-branch mutation.

- [ ] **Step 1: Run formatting and lint gates first**

Run:

```bash
npm run lint
npm run format:check
```

Expected: both commands exit 0 without modifying tracked files.

- [ ] **Step 2: Run the focused authority test**

Run:

```bash
node --test scripts/tests/integration/meta/package-test-corpus.test.mjs
```

Expected: exit 0 with every test passing.

- [ ] **Step 3: Run fast and slow regression floors**

Run:

```bash
npm test
npm run test:slow
```

Expected: both commands exit 0. The canonical trunk ancestry failure must be absent.

- [ ] **Step 4: Verify the exact diff and worktree state**

Run:

```bash
git status --short
git diff --check origin/trunk...HEAD
git diff --stat origin/trunk...HEAD
git log --oneline --decorate origin/trunk..HEAD
```

Expected: no uncommitted tracked changes, no whitespace errors, and only the approved design, plan, fixture, and focused test appear in the branch delta.

- [ ] **Step 5: Record issue evidence through AITM**

Run each root verification command through its governed AC/DoD stamping path. Tick each criterion individually only after its cited command succeeds. Do not bulk-check boxes and do not reuse the blocked cleanup branch's receipts.

- [ ] **Step 6: Request independent review and stop**

Provide the exact branch HEAD, ancestry, diff, and verification receipts for review. Do not push, open a pull request, deliver, merge, or resume the writing-studio cleanup until the relevant human and governed workflow gates separately authorize those actions.
