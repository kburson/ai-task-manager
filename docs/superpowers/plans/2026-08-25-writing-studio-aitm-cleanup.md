# Writing Studio AITM Cleanup Implementation Plan

<!-- cspell:words readlink reflogs -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** After `kburson/writing-studio` is independently verified, remove the
duplicated writing subsystem from AITM and pilot history-backed retirement of
the four frozen publisher tests.

**Architecture:** A focused retirement loader validates active receipts and
hydrates graduated receipts only from complete `origin/trunk` history. Existing
corpus reconciliation subtracts validated retirements without modifying the
immutable manifest or tree baseline; a repository-owned weekly command and
workflow later remove delivered receipts from HEAD through one reviewable pull
request.

**Tech Stack:** Node.js 22 ESM, `node:test`, Git CLI, GitHub Actions, GitHub CLI,
JSON, SHA-256, Prettier, ESLint, CSpell, markdownlint-cli2.

## Global Constraints

- Implement only after every migration gate in
  `docs/superpowers/plans/2026-08-25-writing-studio-extraction.md` passes and the
  private studio remote, SHA, CI run, and fresh-clone evidence are recorded.
- Bind the existing
  `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe`
  worktree; do not create a substitute worktree or branch.
- This is a chore: do not create or bind a GitHub issue.
- Seed the worktree and verify `node_modules/ai-task-manager -> ..` before tests.
- Preserve unrelated worktree changes. Stop if the worktree is unexpectedly
  dirty or its ancestry differs from the verified extraction source.
- Never edit or regenerate
  `scripts/tests/fixtures/test-corpus-pre-move.json` or
  `scripts/tests/integration/meta/test-tree-layout.baseline.json`.
- Frozen retirements are limited to exactly four publisher tests during this
  pilot.
- Post-snapshot book-test removal keeps the existing paired test/record rule;
  it does not use frozen receipts.
- Historical authority is only complete, reachable `origin/trunk` history.
  Missing refs, shallow history, missing commits, blobs, or evidence fail closed.
- Automation may delete only active receipt files and now-unreferenced files
  under `docs/evidence/temporary-test-retirements/`.
- Automation never pushes directly to `trunk`, never auto-merges, and never
  rewrites a human-owned branch.
- The first automated graduation pull request is an observation checkpoint.
  Do not generalize the mechanism before the user reviews it.
- Use TDD and one focused conventional commit per completed task.

## Authoritative inputs

- Retirement design:
  `docs/superpowers/specs/2026-08-25-frozen-test-retirement-design.md`
- Extraction design:
  `docs/superpowers/specs/2026-08-25-writing-studio-extraction-design.md`
- Verified extraction plan:
  `docs/superpowers/plans/2026-08-25-writing-studio-extraction.md`
- Immutable frozen manifest:
  `scripts/tests/fixtures/test-corpus-pre-move.json`
- Current membership authority:
  `scripts/tests/lib/test-corpus-membership.mjs`

---

### Task 1: Prove the cross-repository cleanup gate

**Files:**

- Read only: `docs/migration-provenance.md` in the fresh writing-studio clone
- Read only: AITM branch, worktree, and remote refs

**Interfaces:**

- Consumes: the verified writing-studio remote and source commit.
- Produces: a recorded, immutable cleanup authorization point; no AITM mutation.

- [ ] **Step 1: Seed and verify the AITM worktree**

```bash
cd /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.claude/worktrees/articles-book-publication-6a7dfe
node scripts/task-tracker/ensure-worktree-seeded.mjs
node scripts/dev-env/verify-local-worktree.mjs
test "$(readlink node_modules/ai-task-manager)" = ".."
git status --short
git branch --show-current
git rev-parse HEAD
git merge-base --is-ancestor origin/trunk HEAD
```

Expected: prepared linked worktree, expected branch, clean status, and branch
descended from `origin/trunk`.

- [ ] **Step 2: Re-read studio verification evidence**

From the fresh studio clone created by the extraction plan, run:

```bash
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/trunk
gh repo view kburson/writing-studio --json nameWithOwner,visibility,defaultBranchRef,url
gh run list --repo kburson/writing-studio --branch trunk --limit 3
sed -n '1,260p' docs/migration-provenance.md
```

Expected: private visibility, local and remote `trunk` SHAs match, CI is green,
the provenance document names the AITM source SHA, and status is clean.

- [ ] **Step 3: Verify the migrated corpus before deleting its source**

```bash
npm ci
npm run quality
npm run publish:articles -- --collection agentic-delivery --skip-diagrams
npm run book -- --collection agentic-delivery --target manuscript --target html --target epub
git status --short -- collections
```

Expected: all commands pass and the collection remains unmodified.

- [ ] **Step 4: Stop on any mismatch**

If any SHA, visibility, CI, fresh-clone, corpus, or provenance check fails, do
not mutate AITM. Report the exact mismatch and preserve both repositories.

---

### Task 2: Validate active frozen-retirement receipts

**Files:**

- Create: `scripts/tests/lib/frozen-test-retirements.mjs`
- Create: `scripts/tests/unit/meta/frozen-test-retirements.test.mjs`
- Create: `scripts/tests/fixtures/test-corpus-post-snapshot/unit/meta/frozen-test-retirements.test.mjs.json`

**Interfaces:**

- Consumes: project root, finalized frozen paths, post-snapshot record paths,
  live discovered paths, and optional injected Git runner.
- Produces:
  `retirementReceiptPathForTestPath(testPath) -> string`,
  `loadActiveFrozenRetirements(options) -> {retirements, errors,
misplacedReceipts, rootPresent}`, and exact schema/evidence validation.

- [ ] **Step 1: Write failing deterministic-path and schema tests**

Create the test with `// @chore` on line 1. Assert:

```js
assert.equal(
  retirementReceiptPathForTestPath('scripts/tests/unit/articles/publish-articles.test.mjs'),
  'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/articles/publish-articles.test.mjs.json'
);
```

Cover exact keys, integer schema `1`, canonical frozen-only paths, 64-character
lowercase SHA-256, non-empty sentence reason, deterministic physical location,
and evidence restricted beneath
`docs/evidence/temporary-test-retirements/*.md` without `..` or absolute paths.

Fixtures must cover malformed JSON, extra/missing keys, duplicate declarations,
post-snapshot overlap, non-frozen paths, missing evidence, receipt/test overlap,
shared evidence, and sorted diagnostics.

- [ ] **Step 2: Add the membership record and verify red**

```json
{
  "schema": 1,
  "path": "scripts/tests/unit/meta/frozen-test-retirements.test.mjs"
}
```

Run:

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement active receipt loading**

Export constants:

```js
export const FROZEN_RETIREMENT_ROOT = 'scripts/tests/fixtures/test-corpus-frozen-retirements';
export const TEMPORARY_RETIREMENT_EVIDENCE_ROOT = 'docs/evidence/temporary-test-retirements';
```

Normalize every repository path to POSIX form and reject absolute or escaping
paths. Accept exactly:

```js
['evidence', 'lastLiveSha256', 'path', 'reason', 'schema'];
```

Return normalized retirement objects with `receiptFile`, `evidenceFile`,
`source: 'active'`, and the receipt fields. Never throw for one malformed file;
collect deterministic errors so all repair targets are visible in one run.

- [ ] **Step 4: Verify active loading**

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
node --test scripts/tests/integration/meta/test-corpus-membership.test.mjs
```

Expected: new tests pass and existing membership behavior remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs scripts/tests/fixtures/test-corpus-post-snapshot/unit/meta/frozen-test-retirements.test.mjs.json
git commit -m "feat(test-corpus): validate frozen retirement receipts"
```

---

### Task 3: Hydrate graduated receipts from canonical history

**Files:**

- Modify: `scripts/tests/lib/frozen-test-retirements.mjs`
- Modify: `scripts/tests/unit/meta/frozen-test-retirements.test.mjs`

**Interfaces:**

- Consumes: a missing frozen test path, deterministic receipt path, and
  complete `origin/trunk` ancestry.
- Produces:
  `hydrateHistoricalFrozenRetirement(options) -> Retirement`, and
  `loadFrozenRetirements(options) -> {retirements, errors,
misplacedReceipts}` combining active and historical authority.

- [ ] **Step 1: Add synthetic-history tests**

Create isolated Git repositories with a bare `origin`, explicit `trunk`, and
feature branches. Test these histories separately:

- fast-forward/rebased delivery commit deletes the test and adds receipt plus
  evidence;
- squash-shaped delivery has no feature commit reachable but has the final
  deletion/receipt tree;
- a merge commit has at least one parent with the pre-deletion blob and a merge
  result with receipt/evidence and no test;
- a later canonical commit deletes the receipt and evidence;
- an undelivered feature-only receipt cannot authorize retirement;
- receipt digest differs from every live parent blob;
- evidence is absent in the receipt tree;
- receipt graduation deletion is not reachable;
- `origin/trunk` is absent;
- repository is shallow; and
- required parent blob is missing.

Assert active receipts do not invoke historical Git inspection.

- [ ] **Step 2: Run and verify red**

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Expected: history cases fail because hydration is not implemented.

- [ ] **Step 3: Add a fail-closed Git adapter**

Use `execFileSync('git', args, {cwd, encoding})`, never a shell string. Check:

```text
git rev-parse --is-shallow-repository
git rev-parse --verify origin/trunk^{commit}
```

Search only commits reachable from `origin/trunk` and relevant to the receipt
or test path. For each candidate commit, inspect the tree with `git cat-file -e`
and `git show ${commit}:${repositoryPath}`. A delivered-retirement tree is valid
only when:

- the tree contains a valid receipt and its evidence;
- the tree does not contain the test;
- at least one direct parent contains the test;
- that parent blob hashes to `lastLiveSha256`; and
- the candidate is reachable from `origin/trunk`.

For graduated authority, additionally prove a reachable later transition whose
parent contains the receipt and whose tree does not. Do not trust local `HEAD`,
feature refs, reflogs, commit messages, or embedded feature SHAs.

- [ ] **Step 4: Return actionable errors**

Missing or shallow history errors must include:

```text
fetch complete canonical history for origin/trunk and retry
```

Digest errors must name the test and expected digest. Missing evidence, receipt
graduation, or parent blobs must name the deterministic receipt path.

- [ ] **Step 5: Verify every history shape**

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs
```

Expected: all active, squash, rebase, fast-forward, merge, graduated, and
fail-closed cases pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/tests/lib/frozen-test-retirements.mjs scripts/tests/unit/meta/frozen-test-retirements.test.mjs
git commit -m "feat(test-corpus): hydrate historical retirements"
```

---

### Task 4: Reconcile active membership without changing frozen data

**Files:**

- Modify: `scripts/tests/lib/test-corpus-membership.mjs`
- Modify: `scripts/tests/integration/meta/test-corpus-membership.test.mjs`
- Modify: `scripts/tests/integration/meta/package-test-corpus.test.mjs`
- Modify: `scripts/tests/integration/meta/test-tree-layout.test.mjs`

**Interfaces:**

- Consumes: validated `retirements` and retirement diagnostics.
- Produces: active frozen membership equal to frozen paths minus retirement
  paths, while post-snapshot semantics remain unchanged.

- [ ] **Step 1: Add failing reconciliation cases**

Extend `reconcileCorpusMembership()` tests with:

```js
retirements: [
  {
    path: 'scripts/tests/unit/lib/retired.test.mjs',
    receiptFile:
      'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/lib/retired.test.mjs.json',
    source: 'active',
  },
];
```

Prove a retired frozen path may be absent, but a live test plus receipt is an
error. Prove retirement/non-frozen and retirement/post-snapshot overlap are
errors, duplicates are deterministic, malformed retirement errors reach the
formatted diagnostic, and existing post-snapshot cases are unchanged.

- [ ] **Step 2: Run and verify red**

```bash
node --test scripts/tests/integration/meta/test-corpus-membership.test.mjs
```

Expected: FAIL because reconciliation ignores retirements.

- [ ] **Step 3: Integrate retirement subtraction**

Add optional inputs:

```js
retirements = [],
retirementErrors = [],
misplacedRetirements = [],
```

Compute:

```js
const retired = new Set(retirements.map(({ path: testPath }) => testPath));
const activeFrozen = new Set(frozenPaths.filter((testPath) => !retired.has(testPath)));
```

Use `activeFrozen`, not the immutable full set, when declaring live membership.
Add explicit result sections for receipt/test overlap, invalid retirement
authority overlap, malformed retirement records, and misplaced receipts.

- [ ] **Step 4: Update the live authority tests**

In the repository-root membership test, load retirements before reconciliation.
In `package-test-corpus.test.mjs`, require each frozen path to be either live or
validated retired; retain all immutable census, hash, lane-correction, and Git
rename tests unchanged.

In `test-tree-layout.test.mjs`, subtract only the validated retired basenames in
their original lanes from the AC3/AC4 dropped-file result. Do not write or
regenerate its baseline JSON.

- [ ] **Step 5: Verify focused authority tests**

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs scripts/tests/integration/meta/test-corpus-membership.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs scripts/tests/integration/meta/test-tree-layout.test.mjs
git diff --exit-code -- scripts/tests/fixtures/test-corpus-pre-move.json scripts/tests/integration/meta/test-tree-layout.baseline.json
```

Expected: tests pass and both frozen data files are byte-for-byte untouched.

- [ ] **Step 6: Commit**

```bash
git add scripts/tests/lib/test-corpus-membership.mjs scripts/tests/integration/meta/test-corpus-membership.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs scripts/tests/integration/meta/test-tree-layout.test.mjs
git commit -m "feat(test-corpus): reconcile retired frozen tests"
```

---

### Task 5: Add the atomic graduation command

**Files:**

- Create: `scripts/maintenance/graduate-frozen-test-retirements.mjs`
- Create: `scripts/tests/unit/maintenance/graduate-frozen-test-retirements.test.mjs`
- Create: `scripts/tests/fixtures/test-corpus-post-snapshot/unit/maintenance/graduate-frozen-test-retirements.test.mjs.json`
- Modify: `package.json`

**Interfaces:**

- Consumes: active receipts in a checked-out canonical trunk tree.
- Produces: `--check` eligibility report or `--apply` deletion of the complete
  validated batch and only now-unreferenced temporary evidence.

- [ ] **Step 1: Write failing command tests**

Create the test with `// @chore`. Inject filesystem and history dependencies or
use isolated repositories. Cover:

- no receipt root is a successful no-op;
- zero, one, and multiple eligible receipts;
- shared evidence retained until its final receipt graduates;
- one invalid receipt aborts the whole batch;
- no deletion occurs during `--check`;
- no deletion occurs before the full `--apply` batch validates;
- paths outside the two owned roots are rejected;
- JSON output is stable and human output lists receipt, test, digest, evidence,
  and canonical delivery commit; and
- unknown/missing/multiple modes fail with usage text.

- [ ] **Step 2: Add the membership record and package script; verify red**

Create:

```json
{
  "schema": 1,
  "path": "scripts/tests/unit/maintenance/graduate-frozen-test-retirements.test.mjs"
}
```

Add:

```json
"graduate:frozen-tests": "node scripts/maintenance/graduate-frozen-test-retirements.mjs"
```

Run:

```bash
node --test scripts/tests/unit/maintenance/graduate-frozen-test-retirements.test.mjs
```

Expected: FAIL because the command does not exist.

- [ ] **Step 3: Implement check/apply modes**

Use the retirement loader's active validation plus canonical delivery proof.
Compute the complete deletion list in memory. Before applying, assert every
target is still beneath one of:

```text
scripts/tests/fixtures/test-corpus-frozen-retirements/
docs/evidence/temporary-test-retirements/
```

Use `unlinkSync` only after all candidates validate. Remove empty owned
directories bottom-up but never remove either root's parent. `--json` may be
combined with `--check` and `--apply` for workflow consumption.

- [ ] **Step 4: Verify command behavior**

```bash
node --test scripts/tests/unit/maintenance/graduate-frozen-test-retirements.test.mjs
npm run graduate:frozen-tests -- --check
```

Expected: tests pass; the current tree is a successful no-op before pilot
receipts exist.

- [ ] **Step 5: Commit**

```bash
git add scripts/maintenance/graduate-frozen-test-retirements.mjs scripts/tests/unit/maintenance/graduate-frozen-test-retirements.test.mjs scripts/tests/fixtures/test-corpus-post-snapshot/unit/maintenance/graduate-frozen-test-retirements.test.mjs.json package.json package-lock.json
git commit -m "feat(test-corpus): graduate delivered retirements"
```

---

### Task 6: Add the weekly cleanup pull-request workflow

**Files:**

- Create: `.github/workflows/graduate-frozen-test-retirements.yml`
- Create: `scripts/tests/unit/meta/graduate-frozen-test-retirements-workflow.test.mjs`
- Create: `scripts/tests/fixtures/test-corpus-post-snapshot/unit/meta/graduate-frozen-test-retirements-workflow.test.mjs.json`

**Interfaces:**

- Consumes: the graduation command on full `trunk` history.
- Produces: at most one refreshed PR from
  `automation/graduate-frozen-test-retirements` to `trunk`.

- [ ] **Step 1: Write the failing workflow contract test**

Create the test with `// @chore`. Assert the YAML text contains:

- weekly `schedule` and `workflow_dispatch`;
- `contents: write` and `pull-requests: write`, with no broader permission;
- checkout `ref: trunk` and `fetch-depth: 0`;
- Node 22 and `npm ci`;
- check mode before apply mode;
- focused corpus tests and `npm run quality`;
- fixed branch `automation/graduate-frozen-test-retirements`;
- remote-head discovery and `--force-with-lease` scoped to that branch;
- `gh pr create` and `gh pr edit` support;
- no `git push origin trunk`, `gh pr merge`, or auto-merge command; and
- a successful exit before branch creation when the JSON eligibility count is
  zero.

- [ ] **Step 2: Add the membership record and verify red**

```json
{
  "schema": 1,
  "path": "scripts/tests/unit/meta/graduate-frozen-test-retirements-workflow.test.mjs"
}
```

Run:

```bash
node --test scripts/tests/unit/meta/graduate-frozen-test-retirements-workflow.test.mjs
```

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Create the workflow**

Use a weekly UTC cron plus manual dispatch. The workflow must:

1. check out full `trunk` history;
2. install with `npm ci`;
3. write check JSON beneath `.tmp/`;
4. exit successfully when eligible count is zero;
5. switch to the fixed automation branch only after eligibility is non-zero;
6. run apply mode;
7. run focused membership, package-corpus, tree-layout, test-impact, graduation,
   and workflow tests;
8. run `npm run quality`;
9. generate a PR body from the check JSON with exact paths, commits, digests,
   evidence, and verification commands;
10. commit as `github-actions[bot]`;
11. discover the current remote automation-branch SHA;
12. push with a ref-specific force-with-lease, or create the branch normally
    when absent; and
13. create or edit one open PR without merging it.

Use `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` only for the push/PR step.

- [ ] **Step 4: Verify workflow contract and formatting**

```bash
node --test scripts/tests/unit/meta/graduate-frozen-test-retirements-workflow.test.mjs
npx prettier --check .github/workflows/graduate-frozen-test-retirements.yml
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/graduate-frozen-test-retirements.yml scripts/tests/unit/meta/graduate-frozen-test-retirements-workflow.test.mjs scripts/tests/fixtures/test-corpus-post-snapshot/unit/meta/graduate-frozen-test-retirements-workflow.test.mjs.json
git commit -m "ci: batch frozen test retirement cleanup"
```

---

### Task 7: Teach test-impact selection about retirement authority

**Files:**

- Modify: `scripts/task-tracker/test-impact-manifest.json`
- Modify: `scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs`

**Interfaces:**

- Consumes: changed receipt, temporary evidence, graduation command, or workflow
  paths.
- Produces: focused selection of membership, package-corpus, tree-layout,
  graduation, and workflow guards without unnecessary lane escalation.

- [ ] **Step 1: Add failing selection cases**

For added, modified, and deleted retirement JSON, expect the cheap membership
guard plus frozen-retirement tests. For temporary evidence, select those same
tests. For the graduation command and workflow, select their dedicated tests
and membership guards. A deleted real test must continue escalating its former
lane.

- [ ] **Step 2: Verify red**

```bash
node --test scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs
```

Expected: FAIL because the new roots have no manifest rule.

- [ ] **Step 3: Extend manifest rules**

Add source globs for:

```text
scripts/tests/fixtures/test-corpus-frozen-retirements/**/*.json
docs/evidence/temporary-test-retirements/**/*.md
scripts/maintenance/graduate-frozen-test-retirements.mjs
.github/workflows/graduate-frozen-test-retirements.yml
```

Map them to the exact focused tests introduced in Tasks 2, 5, and 6 plus
existing corpus guards. Keep the immutable frozen-manifest rule unchanged.

- [ ] **Step 4: Verify and commit**

```bash
node --test scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs
git add scripts/task-tracker/test-impact-manifest.json scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs
git commit -m "test-impact: select retirement authority guards"
```

---

### Task 8: Create the four pilot receipts and remove the migrated subsystem

**Files:**

- Create: `docs/evidence/temporary-test-retirements/2026-08-25-writing-studio-extraction.md`
- Create: four deterministic files beneath
  `scripts/tests/fixtures/test-corpus-frozen-retirements/`
- Delete: `docs/articles/**`
- Delete: `scripts/articles/**`
- Delete: dedicated article/book tests and post-snapshot records
- Delete: `scripts/maintenance/lint-article-citations.mjs`
- Delete: `scripts/maintenance/lint-book-markers.mjs`
- Delete: `.github/puppeteer-ci.json`
- Modify: `package.json`
- Modify: `package-lock.json` only through npm when package metadata changes
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/tests/slow/task-tracker/core/ci-lane-wiring.test.mjs`
- Modify: `scripts/tests/unit/meta/slow-lane-partition-policy.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/test-corpus-paths.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`
- Modify: `docs/introduction/install-and-setup.md`
- Delete: the nine writing-owned specifications/plans verified in the studio

**Interfaces:**

- Consumes: a working retirement authority and verified studio migration.
- Produces: AITM without a second writable writing subsystem, with exactly four
  active frozen-retirement receipts.

- [ ] **Step 1: Capture exact pre-deletion digests**

```bash
shasum -a 256 scripts/tests/unit/articles/publish-articles.test.mjs scripts/tests/unit/articles/diagram-drift.test.mjs scripts/tests/slow/articles/publish-articles-e2e.test.mjs scripts/tests/integration/task-tracker/maintenance/lint-article-citations.test.mjs
git status --short
```

Record each 64-character digest. Do not delete until the evidence file and all
four receipt bodies are prepared.

- [ ] **Step 2: Write migration/retirement evidence**

The evidence document must name:

- private repository `kburson/writing-studio` without presenting its private
  URL as public user documentation;
- verified studio `trunk` SHA and CI run URL;
- AITM source branch and source SHA;
- fresh-clone verification commands and outcomes;
- all removed source/tool/test/document path groups;
- all four frozen test paths and pre-deletion SHA-256 values;
- every paired post-snapshot record group removed; and
- the statement that the receipt/evidence TTL ends through the weekly
  graduation PR after canonical delivery.

- [ ] **Step 3: Create exactly four receipts**

Generate the four exact receipt bodies from the still-live files:

```bash
node --input-type=module -e '
  import { createHash } from "node:crypto";
  import { readFileSync } from "node:fs";
  import { retirementReceiptPathForTestPath } from "./scripts/tests/lib/frozen-test-retirements.mjs";
  const paths = [
    "scripts/tests/unit/articles/publish-articles.test.mjs",
    "scripts/tests/unit/articles/diagram-drift.test.mjs",
    "scripts/tests/slow/articles/publish-articles-e2e.test.mjs",
    "scripts/tests/integration/task-tracker/maintenance/lint-article-citations.test.mjs",
  ];
  for (const testPath of paths) {
    const receipt = {
      schema: 1,
      path: testPath,
      reason: "Publishing subsystem extracted from the AITM package repository.",
      lastLiveSha256: createHash("sha256").update(readFileSync(testPath)).digest("hex"),
      evidence: "docs/evidence/temporary-test-retirements/2026-08-25-writing-studio-extraction.md",
    };
    console.log(retirementReceiptPathForTestPath(testPath));
    console.log(`${JSON.stringify(receipt, null, 2)}\n`);
  }
'
```

Use `apply_patch` to add those exact emitted bodies at their printed
deterministic paths. Re-run `shasum -a 256` and compare each value with the
corresponding receipt before continuing.

- [ ] **Step 4: Validate receipts before deletion**

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs scripts/tests/integration/meta/test-corpus-membership.test.mjs
```

Expected: FAIL specifically because each receipt overlaps a still-live test.
This proves the safety guard before the destructive half of the change.

- [ ] **Step 5: Remove the writing-owned source and dedicated tests**

First list exact targets:

```bash
git ls-files docs/articles scripts/articles scripts/tests/unit/articles scripts/tests/slow/articles scripts/tests/integration/task-tracker/maintenance/lint-article-citations.test.mjs scripts/maintenance/lint-article-citations.mjs scripts/maintenance/lint-book-markers.mjs
git ls-files 'scripts/tests/fixtures/test-corpus-post-snapshot/unit/articles/**'
```

Verify the output contains no AITM-owned path. Then remove those tracked path
groups and the dedicated frozen citation test. Remove every post-snapshot record
paired with a removed book test, including the chapter-opener test added by the
book-formatting plan. Do not remove the four frozen manifest entries.

- [ ] **Step 6: Remove the nine migrated writing-history documents**

Delete exactly:

```text
docs/superpowers/specs/2026-08-17-article-ending-sections-design.md
docs/superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md
docs/superpowers/specs/2026-08-25-book-composition-path-design.md
docs/superpowers/specs/2026-08-25-book-chapter-openers-design.md
docs/superpowers/plans/2026-07-16-article-deepening.md
docs/superpowers/plans/2026-08-17-article-ending-sections.md
docs/superpowers/plans/2026-08-20-exclude-draft-articles-from-publisher.md
docs/superpowers/plans/2026-08-25-book-composition-path.md
docs/superpowers/plans/2026-08-25-book-chapter-openers.md
```

Before deletion, verify every one exists in the studio collection history at
the verified remote SHA.

- [ ] **Step 7: Remove stale package and CI wiring**

From `package.json`, remove `publish:articles`, `book`, `doctor:book`,
`lint:book-markers`, `lint:article-citations`, and the now-meaningless
`!scripts/articles/**` files exclusion. Remove both article lints from the
`lint` chain. Keep Puppeteer because `scripts/reports/generate-value-report.mjs`
still imports it.

Remove `AITM_MERMAID_PUPPETEER_CONFIG` from the slow CI job and delete
`.github/puppeteer-ci.json`. In `ci-lane-wiring.test.mjs`, remove only the two
article/Mermaid #1388 tests and the `buildMmdcArgs` import; retain the AITM lane
tests. Remove the publisher E2E path from the audited parallel-slow list.
Replace obsolete publisher paths used only as canonical-layout examples with
live AITM paths. Remove the `scripts/articles` package-boundary special case and
update install-and-setup package prose.

- [ ] **Step 8: Reconcile the deleted corpus**

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs scripts/tests/integration/meta/test-corpus-membership.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs scripts/tests/integration/meta/test-tree-layout.test.mjs scripts/tests/unit/meta/slow-lane-partition-policy.test.mjs scripts/tests/unit/task-tracker/core/package-boundary.test.mjs scripts/tests/unit/task-tracker/lib/test-corpus-paths.test.mjs
```

Expected: PASS. The four frozen paths are accepted only through active receipts;
post-snapshot book tests and records are both absent.

- [ ] **Step 9: Prove no current publisher remains**

```bash
test ! -e docs/articles
test ! -e scripts/articles
test ! -e scripts/maintenance/lint-article-citations.mjs
test ! -e scripts/maintenance/lint-book-markers.mjs
rg -n "docs/articles|scripts/articles|publish:articles|doctor:book|lint:book-markers|lint:article-citations|AITM_MERMAID_PUPPETEER_CONFIG|puppeteer-ci" package.json .github scripts docs/README.md docs/QUICKSTART.md docs/DESIGN.md docs/guides docs/introduction || true
```

Expected: no current operational reference remains. Historical AITM-owned
plans may still mention the former subsystem.

- [ ] **Step 10: Commit the pilot cleanup**

```bash
git add -A
git diff --cached --name-status
git commit -m "refactor: move writing studio out of AITM"
```

Before committing, verify the staged deletion list contains no path outside the
approved cleanup scope and retirement-owned additions.

---

### Task 9: Run complete verification and prepare delivery

**Files:**

- Verify only: complete AITM repository

**Interfaces:**

- Consumes: Tasks 1-8.
- Produces: evidence suitable for the branch's governed integration decision.

- [ ] **Step 1: Run focused retirement and cleanup tests**

```bash
node --test scripts/tests/unit/meta/frozen-test-retirements.test.mjs scripts/tests/integration/meta/test-corpus-membership.test.mjs scripts/tests/integration/meta/package-test-corpus.test.mjs scripts/tests/integration/meta/test-tree-layout.test.mjs scripts/tests/unit/maintenance/graduate-frozen-test-retirements.test.mjs scripts/tests/unit/meta/graduate-frozen-test-retirements-workflow.test.mjs scripts/tests/integration/task-tracker/lib/test-impact-selector.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Prove frozen data immutability**

```bash
git diff origin/trunk...HEAD -- scripts/tests/fixtures/test-corpus-pre-move.json scripts/tests/integration/meta/test-tree-layout.baseline.json
```

Expected: empty diff.

- [ ] **Step 3: Run full quality and slow verification**

```bash
npm run quality
npm run test:slow
npm pack --dry-run --json > .tmp/aitm-cleanup-pack.json
```

Expected: all checks pass and the package contains no test, maintenance, or
writing-studio source.

- [ ] **Step 4: Verify receipt check mode before delivery**

```bash
npm run graduate:frozen-tests -- --check --json
git status --short
```

Expected: the four active receipts validate but are not yet eligible for
graduation because their delivery commit is not in `origin/trunk`; check mode
does not modify the worktree.

- [ ] **Step 5: Show exact integration evidence and stop for approval**

```bash
git status --short
git log --oneline --decorate origin/trunk..HEAD
git diff --stat origin/trunk...HEAD
git diff --name-status origin/trunk...HEAD
git rev-parse HEAD
git rev-parse origin/trunk
```

Report the exact refs, ancestry, file delta, verification outcomes, four
receipt paths/digests, verified studio SHA/CI, and the fact that the weekly
workflow has not yet run. Do not rewrite, push, merge, or open a PR without the
user's explicit delivery approval.

---

### Task 10: Verify canonical delivery and observe the first weekly PR

**Files:**

- Read only after delivery: canonical AITM and GitHub state
- Changed later only by automation PR: active receipts and temporary evidence

**Interfaces:**

- Consumes: user-approved squash, rebase, fast-forward, or merge delivery.
- Produces: canonical-history proof and the bounded-pilot observation report.

- [ ] **Step 1: Verify the delivered canonical SHA**

After approved delivery, fetch and run:

```bash
git fetch origin trunk
git rev-parse origin/trunk
git log -1 --oneline origin/trunk
npm run graduate:frozen-tests -- --check --json
```

Expected: the delivered tree is reachable from `origin/trunk`; all four receipts
are now eligible; digest/evidence/deletion proof succeeds.

- [ ] **Step 2: Trigger or wait for the workflow**

The user may wait for the weekly schedule or manually dispatch:

```bash
gh workflow run graduate-frozen-test-retirements.yml --ref trunk
gh run list --workflow graduate-frozen-test-retirements.yml --limit 5
```

Expected: one workflow run opens or refreshes one PR from the fixed automation
branch and does not merge it.

- [ ] **Step 3: Review the first graduation PR**

Confirm the PR removes exactly four receipts and the now-unreferenced evidence
file, lists every digest and delivery commit, and reports focused plus full
verification. Confirm no test, frozen manifest, baseline, source, or unrelated
documentation change is present.

- [ ] **Step 4: Stop at the pilot review gate**

Report clarity, churn, history-hydration behavior under the actual delivery
strategy, workflow runtime, diagnostics, and maintenance cost. Do not
generalize the mechanism or auto-merge the PR. The user decides whether to
merge, revise, or retire the pilot.
