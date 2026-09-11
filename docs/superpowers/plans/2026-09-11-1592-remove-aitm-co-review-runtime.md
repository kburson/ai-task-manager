# Remove AITM Co-Review Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove AITM's duplicate co-review runtime and command while preserving immutable legacy archives and the exact public `ai-peer-review@0.2.0` integration.

**Architecture:** `ai-peer-review` remains the sole review protocol and CLI authority. AITM keeps strict task occupancy plus a read-only, explicitly non-authoritative package status cache; it no longer owns review discovery, a worktree-sharing exception, protocol schemas, or compatibility commands.

**Tech Stack:** Node.js 22 ESM, Node test runner, AITM command catalog, Git object hashing, Prettier, ESLint, markdownlint, cspell.

## Global Constraints

- Work only in `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1592-remove-co-review-runtime` on `codex/issue-1592-remove-co-review-runtime`.
- Preserve every existing byte under `docs/superpowers/reviews/**`; future additive package review collateral remains allowed.
- Keep `ai-peer-review` exact-pinned at `0.2.0` and import only its public package export.
- Do not add `npx aitm peer-review`, retain `npx aitm co-review`, or recreate global review discovery.
- Do not rewrite historical specifications, plans, research, postmortems, evidence, or archived reviews merely because they describe the retired runtime.
- Repair removal regressions inside #1592; do not create a defect chain beyond the user's two-level limit.

---

### Task 1: Pin terminal migration invariants with a failing structural test

**Files:**

- Create: `scripts/tests/fixtures/legacy-review-archive-sha256.json`
- Create: `scripts/tests/integration/review/peer-review-decommission.test.mjs`

**Interfaces:**

- Consumes: tracked `docs/superpowers/reviews/**` bytes at starting SHA `0988881f5796d19c270e4121a851143bb5046a6f`.
- Produces: an append-friendly per-file digest manifest and one structural absence regression.

- [ ] **Step 1: Generate the immutable archive inventory from Git-tracked bytes**

Use `git ls-files docs/superpowers/reviews` to enumerate the 137 starting files. For each path, record this exact shape in a JSON array sorted by path:

```json
{
  "schema": "aitm.legacy-review-archive-digests/v1",
  "sourceCommit": "0988881f5796d19c270e4121a851143bb5046a6f",
  "files": [
    {
      "path": "docs/superpowers/reviews/README.md",
      "sha256": "9290d1840c8c8cffce67a3dce90efc90398986b1dc180d86d6e2021e2dac4489"
    }
  ]
}
```

Compute each digest from the working-tree byte stream and assert the file list has 137 entries before saving. Do not touch the archive paths.

- [ ] **Step 2: Write the structural regression**

Create `peer-review-decommission.test.mjs` with focused cases that:

```js
assert.equal(existsSync(path.join(repoRoot, 'scripts/review')), false);
assert.equal(commandByName('co-review'), null);
assert.equal(commandByName('reconcile-legacy-index'), null);
assert.equal(kind('co-review'), null);
assert.equal(kind('peer-review'), null);
```

Scan current production source and current operator documentation using explicit allow/exclude roots. Assert there is no `scripts/review` import/path, no owned `aitm.co-review/` schema, no `npx aitm co-review` promise, and no AITM `peer-review` wrapper. Assert `npx aitm co-review --help` exits 2 with `unknown command`, while `npx peer-review --help` exits 0.

- [ ] **Step 3: Run RED and inspect the expected failure**

Run:

```bash
node --test scripts/tests/integration/review/peer-review-decommission.test.mjs
```

Expected: FAIL because `scripts/review` and `co-review` still exist. The archive digest case must already pass.

- [ ] **Step 4: Commit the RED test and immutable manifest**

```bash
git add scripts/tests/fixtures/legacy-review-archive-sha256.json \
  scripts/tests/integration/review/peer-review-decommission.test.mjs
git commit -m '[#1592] test: pin co-review decommission boundary'
```

### Task 2: Remove legacy production authority and command routing

**Files:**

- Modify: `scripts/task-tracker/lib/peer-review-adapter.mjs`
- Modify: `scripts/task-tracker/lib/occupancy.mjs`
- Modify: `scripts/task-tracker/lib/occupancy-lifecycle.mjs`
- Modify: `scripts/task-tracker/paths.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/entrypoints.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Delete: `scripts/review/**`

**Interfaces:**

- Consumes: public exports from `ai-peer-review` and the existing AITM occupancy store.
- Produces: strict single-session worktree occupancy and a command registry with no legacy review commands.

- [ ] **Step 1: Remove the legacy adapter migration guard**

Delete `node:fs`, `node:path`, fleet registry, and `coReviewIndexPath` imports plus `LEGACY_REVIEW_CONSUMERS`, `readLegacyRows`, and `assertLegacyReviewMigrationSafe`. Retain the exact package imports, `AITM_PEER_REVIEW_CONFIG`, `installedPeerReviewApi`, `peerReviewStartArgs`, and `peerReviewStatus` unchanged unless the structural test exposes an import-boundary problem.

- [ ] **Step 2: Make occupancy strictly exclusive**

Remove the optional sharing predicate from `claimOccupancy` and `touchOccupancy`. The conflict branch becomes unconditional when another session already occupies the same resolved worktree:

```js
if (worktreeHolder) {
  throw new OccupancyConflictError(
    `occupancy: worktree is held (${holderDiagnostic(worktreeHolder)}); use an isolated worktree`,
    'occupancy-worktree-held',
    worktreeHolder
  );
}
```

Remove the legacy index import and predicate injection from
`claimBindingOccupancy` and `touchBindingOccupancy`. Keep
`cachePeerReviewStatus` and its `authoritative: false` result.

- [ ] **Step 3: Remove legacy path and command registration**

Delete `FILE.coReviewIndex`, `coReviewIndexPath`, the `co-review` public
entrypoint, the `reconcile-legacy-index` maintenance entrypoint, and both
`SELF_DOC` records. Do not add a replacement command.

- [ ] **Step 4: Delete the runtime**

Delete every tracked file below `scripts/review/**`. Confirm the precondition
was the already-recorded #1591 zero-active-row verification; do not rerun a
deleted utility or mutate the machine-local index.

- [ ] **Step 5: Run the structural test toward GREEN**

```bash
node --test scripts/tests/integration/review/peer-review-decommission.test.mjs
```

Expected: any remaining failure names a specific surviving production or
documentation reference. Do not weaken the scan; resolve the named current
surface in Tasks 3 and 4.

### Task 3: Retire superseded tests and repair retained coverage

**Files:**

- Delete: `scripts/tests/fixtures/co-review-*.mjs`
- Delete: `scripts/tests/unit/review/co-review-index.test.mjs`
- Delete: `scripts/tests/integration/review/co-review*.test.mjs`
- Delete: `scripts/tests/integration/task-tracker/lib/co-review-reviewer-capability.test.mjs`
- Delete: `scripts/tests/slow/review/co-review-boundaries.test.mjs`
- Modify: `scripts/tests/integration/review/peer-review-migration-guard.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/source-edit-gate.test.mjs`
- Modify: `scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/occupancy.test.mjs`
- Modify: `scripts/tests/unit/providers/coverage-provider-adapter.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs`
- Modify: `scripts/tests/integration/meta/package-test-corpus.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`
- Modify: `scripts/tests/unit/meta/slow-lane-partition-policy.test.mjs`
- Modify: `scripts/tests/unit/meta/unit-lane-purity.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/test-corpus-paths.test.mjs`
- Modify: `scripts/tests/fixtures/maintenance-apply-scripts.mjs`
- Modify: `scripts/task-tracker/test-impact-manifest.json`
- Modify: `scripts/tests/integration/meta/test-tree-layout.baseline.json`

**Interfaces:**

- Consumes: Task 2's reduced production tree and Task 1's archive manifest.
- Produces: retained package/occupancy/guard coverage without legacy fixtures.

- [ ] **Step 1: Replace migration-guard tests with terminal invariants**

Keep the filename required by #1592's verifier. Add a manifest loop:

```js
for (const entry of manifest.files) {
  const bytes = readFileSync(path.join(repoRoot, entry.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
}
```

Retain the `cachePeerReviewStatus` case and update test-impact expectations so
adapter/occupancy/decommission sources select package parity, terminal
migration, and decommission tests. Remove tests for active legacy rows and
reconciliation sources, which no longer exist.

- [ ] **Step 2: Delete package-owned suites and fixtures**

Delete all `co-review-*.mjs` fixture modules and all test entrypoints whose
subject is `scripts/review/**` or AITM legacy reviewer capability. In generic
source-edit and activity-guard suites, remove only the helper imports,
environment constants, setup functions, and the single live-reviewer-claim
invariance case; keep every ordinary gate case.

- [ ] **Step 3: Update occupancy and command tests**

Replace sharing-exception cases with one assertion that a second session is
always refused in the same worktree, regardless of provider or issue. Replace
the positive `co-review` command-catalog test with negative assertions for both
retired commands and for an AITM `peer-review` wrapper.

- [ ] **Step 4: Update packaging and corpus authorities**

Remove legacy runtime paths from npm-pack requirements, apply-script lists,
slow parallel inventories, fixture comments, and test-impact rules. Add the
decommission test to the peer-review adapter/occupancy impact rule. Regenerate
the deterministic test-tree layout baseline using its repository-owned update
mechanism, then measure `npm pack --dry-run --json` and lower
`ENTRY_CEILING` to the observed entry count.

- [ ] **Step 5: Run focused retained suites**

```bash
node --test \
  scripts/tests/integration/review/peer-review-decommission.test.mjs \
  scripts/tests/integration/review/peer-review-package-parity.test.mjs \
  scripts/tests/integration/review/peer-review-phase2-compatibility.test.mjs \
  scripts/tests/integration/review/peer-review-migration-guard.test.mjs \
  scripts/tests/unit/task-tracker/lib/occupancy.test.mjs \
  scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs \
  scripts/tests/unit/task-tracker/core/package-boundary.test.mjs \
  scripts/tests/integration/meta/package-test-corpus.test.mjs
```

Expected: PASS with the physical `scripts/review` tree absent.

### Task 4: Replace current operator guidance

**Files:**

- Modify: `README.md`
- Modify: `docs/DESIGN.md`
- Modify: `docs/guides/github-native-coordination.md`
- Modify: `docs/guides/grok-provider.md`
- Modify: `docs/guides/settings-guide.md`
- Modify: `skill/shared/rules/review.md`

**Interfaces:**

- Consumes: Task 2's one-authority architecture.
- Produces: current documentation that directs artifact review only to
  `peer-review` and describes task occupancy independently.

- [ ] **Step 1: Update occupancy documentation**

State that a second task session never shares a physical worktree and must use a
separate seeded worktree. State that peer-review participants remain unbound to
AITM task occupancy and are governed by the package's own workspace/role
contract.

- [ ] **Step 2: Update the review rule**

Replace the transitional legacy-index paragraph with a terminal statement:

```markdown
`peer-review` is the sole supported artifact-review command. AITM does not
expose a compatibility wrapper or own review protocol schemas. Historical
legacy archives remain byte-immutable and are not upgraded.
```

- [ ] **Step 3: Remove current compatibility wording**

Rephrase current settings guidance from “co-review is not approval” to “artifact
peer review is not approval.” Keep historical documents unchanged.

- [ ] **Step 4: Run the structural test GREEN**

```bash
node --test scripts/tests/integration/review/peer-review-decommission.test.mjs
```

Expected: PASS, including current-documentation scans and both CLI routing
assertions.

- [ ] **Step 5: Commit the implementation unit**

```bash
git add -A
git commit -m '[#1592] refactor: remove legacy co-review runtime'
```

### Task 5: Verify, finalize, and deliver the exact removal SHA

**Files:**

- Modify only if generated by repository-owned format/baseline tooling: files
  already listed in Tasks 1-4.

**Interfaces:**

- Consumes: the committed removal tree.
- Produces: exact-SHA AITM Test/Review/delivery receipts and a closed #1592.

- [ ] **Step 1: Run cheap gates before the full suite**

```bash
npm run lint
npm run format:check
git diff --check
```

Expected: PASS with no formatter changes pending.

- [ ] **Step 2: Run issue-specific verification**

```bash
node --test scripts/tests/integration/review/peer-review-decommission.test.mjs
node --test scripts/tests/integration/review/peer-review-package-parity.test.mjs scripts/tests/integration/review/peer-review-phase2-compatibility.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
```

Expected: PASS with `scripts/review` absent and all 137 manifest entries
hash-identical.

- [ ] **Step 3: Run full lanes**

```bash
npm test
npm run test:slow
npm run test:all
```

Expected: every discovered unit, integration, and slow test passes.

- [ ] **Step 4: Finalize a clean exact SHA**

If formatting or baseline tooling changed files, commit those bounded changes
with `[#1592]`, rerun the affected focused checks, then run:

```bash
node scripts/task-tracker/verify-develop.mjs --mode final --issue 1592
git status --short
git log --oneline -1
```

Expected: exact-SHA finalization succeeds and the worktree is clean.

- [ ] **Step 5: Complete governed lifecycle**

Use only `npx aitm test 1592`, per-criterion evidence/stamps,
`npx aitm review 1592`, the Full-Auto approval path, `npx aitm deliver 1592`,
the emitted exact provider action, and `npx aitm close 1592`. Verify hosted CI
for the accepted head and merge SHA, then fast-forward local `trunk` to
`origin/trunk` without rebasing or deleting the governed worktree.
