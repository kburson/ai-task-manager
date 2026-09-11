# Package Boundary Ceiling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the package-boundary guard accept the reviewed 779-entry branch surface while explicitly requiring #1546's shipped peer-review adapter.

**Architecture:** Preserve the existing six-case `npm pack --dry-run --json` guard and change only its attribution, ceiling history, required-entry list, and exact ceiling. Govern live issue authority through `npx aitm issue-body` operation files under `.scratch/gh`, satisfy every Plan-exit prerequisite before Develop, and require a full-repository lint baseline before implementation.

**Tech Stack:** Node.js 25, ECMAScript modules, built-in `node:test`, npm pack manifests, AITM governed issue-body and verification workflows.

## Global Constraints

- Governing design: `docs/superpowers/specs/2026-09-10-1578-package-boundary-ceiling-design.md` accepted at `4e96a7a8ff39444d69580a3ee2f331572966d8ab`.
- Modify no tracked implementation file except `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`.
- Do not change `package.json`, `package-lock.json`, package allowlists, exclusions, production code, or any existing package-boundary assertion except to extend the required runtime-entry list with `scripts/task-tracker/lib/peer-review-adapter.mjs`.
- Keep the working-tree pack measurement exact at 779; add no contingency headroom and do not filter through `git ls-files`.
- Run exact-count checks with no untracked package-eligible files or concurrent repository writers.
- Do not integrate or cherry-pick #1578 independently of #1546's adapter commit `311cef526`.
- Task 15/#1546 owns any later remeasurement required by legacy-runtime removal.
- Use `npx aitm issue-body` with `aitm.issue-body-operation/v1` files under `.scratch/gh` for live issue-body changes; do not create a one-off direct `mutateIssueBody` caller.
- Before Plan approval, publish the adaptive estimate forecast and populate flat `Plan Metadata` with the governing spec, implementation plan, and accepted plan commit.
- Do not dispatch implementation until full repository lint and formatting pass. If unrelated tracked content fails, hydrate a blocking defect, add the native dependency, and stop.

## File Structure

- Governed record: GitHub issue #1578 — align Scope, Fix Direction, deep-dive steps, and the second acceptance criterion with the ratified required-entry decision.
- Temporary: `.scratch/gh/1578-*.json` — canonical issue-body operation files; delete after verified read-back.
- Temporary: `.scratch/plan/1578-estimation.json` — adaptive Plan-estimation evidence; retain only as ignored execution evidence.
- Temporary: `.scratch/test/1578-*` — falsification probe and captured output; delete after restoration and verification.
- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` — record #1578, require the adapter, and raise the exact ceiling.
- Test: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs` — existing six-case regression; no new test file.

## Reopened Execution State

- The original plan was accepted at `a6e23fbb78068bf8181c4e13f5560534fcee6a42`; review was terminal before execution.
- The live issue was aligned successfully at body version 16, but the one-off `.scratch/gh` script bypassed the governed `aitm issue-body` verb. Repository guidance also conflicts over `.scratch/gh` versus `.tmp/gh`; defect #1579 owns reconciling that convention. Do not replay the direct-library mechanism.
- Execution supplied the missing adaptive forecast and flat Plan Metadata, recorded Plan approval, and moved #1578 to Develop.
- Task 1 produced commit `c7a4fe5a38d5a97809068cd1a6f183ed6d91e553`; focused RED/GREEN, the mandatory adapter-removal falsification, Develop iteration verification, and task-scoped review all passed.
- Develop finalization exposed pre-existing MD038 in immutable round-2 reviewer collateral; the reopened round-4 response added two MD018 findings and another MD038. #1578 is blocked by backlog defect #1580 until all four immediate failures are resolved without changing reviewer bytes.
- Backlog defect #1581 owns the durable reviewer-collateral lint policy exposed by #1580; #1580 remains the one-off unblock for this execution.
- This revision governs recovery from the current state. Completed RED/GREEN work must not be replayed or recommitted.

---

## Pre-Implementation Authority Gate and Execution Errata

The original execution completed the live-body alignment and implementation, but exposed three missing workflow prerequisites. The corrected sequence below is normative for review and recovery; historical commands are retained only where explicitly labeled.

- [x] **Step 1: Verify the live issue carries the ratified alignment**

Run:

```bash
gh issue view 1578 --repo kburson/ai-task-manager --json body --jq .body
```

Expected: Scope and Fix Direction name the required adapter, the deep-dive sequence has seven steps including the adapter assertion, and the second acceptance criterion preserves existing entries while requiring the adapter. If any field is stale, use one exact `npx aitm issue-body` operation per change from `.scratch/gh`; do not use a direct-library script.

- [x] **Step 2: Preserve the historical alignment record without replaying it**

The superseded direct-library writer remains available at accepted-plan commit `a6e23fbb78068bf8181c4e13f5560534fcee6a42` and in the round-1/round-2 review history. Do not reproduce or execute it from this live plan.

Expected: no `.scratch/gh/1578-align-body.mjs` file exists. Any future issue-body change is expressed as an `aitm.issue-body-operation/v1` file under `.scratch/gh` and executed with `npx aitm issue-body 1578 --operation-file .scratch/gh/1578-body-operation.json`.

- [x] **Step 3: Verify the completed alignment; do not rerun the historical writer**

Run:

```bash
gh issue view 1578 --repo kburson/ai-task-manager --json body --jq .body
```

Expected: the aligned Scope, Fix Direction, seven-step deep dive, and second acceptance criterion remain present with every AITM marker intact.

- [x] **Step 4: Prove historical and canonical operation files are absent**

```bash
test ! -e .scratch/gh/1578-align-body.mjs
test -z "$(find .scratch/gh -maxdepth 1 -name '1578-*.json' -print 2>/dev/null)"
git status --short
```

Expected: both absence checks exit 0 and Git reports no tracked change from issue-body operations.

- [x] **Step 5: Satisfy every Plan-exit prerequisite before entering Develop**

Before approval, create `.scratch/plan/1578-estimation.json` with the exact evidence below:

```json
{
  "schema": "aitm.plan-estimation-input/v1",
  "wbs": [
    {
      "id": "package-boundary-ceiling",
      "description": "Apply and verify the four ratified package-boundary guard edits",
      "baseHumanHours": 1,
      "signals": {
        "modules": ["package-boundary-test", "peer-review-adapter"],
        "dependencies": ["issue-1546-adapter", "exact-npm-pack-manifest"]
      },
      "independentlyReviewable": true
    }
  ],
  "testImpact": {
    "lanes": ["package-boundary-focused", "develop-iteration"],
    "isolation": "one existing unit guard file in the recorded governed worktree",
    "expectedMinutes": 10
  },
  "risks": [
    "Concurrent package-eligible files could perturb the exact npm pack count",
    "A ceiling-only change would fail to require the shipped adapter"
  ],
  "comparableIssueIds": [1577]
}
```

Populate flat Plan Metadata through a canonical `.scratch/gh` operation with these exact values:

```markdown
- **Governing-spec**: docs/superpowers/specs/2026-09-10-1578-package-boundary-ceiling-design.md
- **Implementation-plan**: docs/superpowers/plans/2026-09-10-1578-package-boundary-ceiling.md
- **Plan-commit**: a6e23fbb78068bf8181c4e13f5560534fcee6a42
```

The executed operation file was `.scratch/gh/1578-plan-metadata-operation.json`:

```json
{
  "schema": "aitm.issue-body-operation/v1",
  "kind": "replace-exact",
  "expected": "## Plan Metadata\n\n## Pickup Directive",
  "replacement": "## Plan Metadata\n\n- **Governing-spec**: docs/superpowers/specs/2026-09-10-1578-package-boundary-ceiling-design.md\n- **Implementation-plan**: docs/superpowers/plans/2026-09-10-1578-package-boundary-ceiling.md\n- **Plan-commit**: a6e23fbb78068bf8181c4e13f5560534fcee6a42\n\n## Pickup Directive"
}
```

Run the canonical body operation, delete its file with `apply_patch`, then run the adaptive forecast, human approval, and one-step promotion. Do not use `move-state.mjs` directly.

```bash
npx aitm issue-body 1578 --operation-file .scratch/gh/1578-plan-metadata-operation.json
test ! -e .scratch/gh/1578-plan-metadata-operation.json
npx aitm plan-estimate 1578 --evidence-file .scratch/plan/1578-estimation.json
npx aitm plan-approve 1578
npx aitm promote 1578
npx aitm status 1578
```

Expected: #1578 carries the converged forecast, the Plan-approval marker, substantive flat Plan Metadata, and enters Develop in the recorded `codex/ai-peer-review-design` worktree before Task 1 begins.

- [x] **Step 6: Record the missed baseline and create the native blocker**

Run:

```bash
npm run lint
npx aitm block 1578 --by 1580
gh issue view 1580 --repo kburson/ai-task-manager --json number,projectItems,state,url
```

Expected for this recovery: lint reports MD038 at round-2 line 81, MD018 at round-4 lines 100 and 232, and MD038 at round-4 line 259; #1580 exists in Backlog with all four immediate failures in scope; and #1578 has a native blocked-by edge to #1580. Backlog defect #1581 separately owns the durable reviewer-collateral lint policy. No implementation resumes until #1580 is Done. For any fresh execution, the Global Constraints require both `npm run lint` and `npm run format:check` to pass before Task 1; do not narrow either check to the planned file.

---

### Task 1: Require and Account for the Peer-Review Adapter

**Files:**

- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs:1`
- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs:116-121`
- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs:204-218`
- Test: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`

**Interfaces:**

- Consumes: `packedFiles() -> string[]`, the actual `npm pack --dry-run --json` manifest, and #1546's existing adapter at commit `311cef526`.
- Produces: the same six-case guard with `ENTRY_CEILING = 779` and an explicit required-entry assertion for `scripts/task-tracker/lib/peer-review-adapter.mjs`.

- [x] **Step 1: Verify the clean 779-entry implementation base**

Run:

```bash
git status --short
git merge-base --is-ancestor 311cef526 HEAD
node --version
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const manifest = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' })
)[0];
const paths = manifest.files.map(({ path }) => path);
console.log(JSON.stringify({
  count: paths.length,
  adapter: paths.includes('scripts/task-tracker/lib/peer-review-adapter.mjs'),
}));
NODE
```

Expected: `git status --short` prints nothing; the ancestry command exits 0; Node reports `v25.6.0`; the manifest result is `{"count":779,"adapter":true}`. Stop if the tree is dirty, the adapter commit is absent, or the count differs.

- [x] **Step 2: Reproduce the focused RED guard**

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
```

Expected: exit nonzero; five tests pass and only `package-boundary: total entry count stays under the ceiling` fails with `packed entry count 779 exceeds ceiling 778`.

- [x] **Step 3: Apply the four ratified guard edits**

Use `apply_patch` to change the story line to:

```js
// @story #551 #1279 #1497 #1501 #1578
```

Append this history immediately after the #1562 note and replace the ceiling:

```js
// #1578 accounts for #1546's shipped peer-review adapter. The synchronized
// branch surface was 778 before that one required runtime entry; raise by one
// and retain no contingency headroom.
const ENTRY_CEILING = 779;
```

Add this string to the existing required array without changing another entry:

```js
'scripts/task-tracker/lib/peer-review-adapter.mjs',
```

Expected: only the `@story` attribution, ceiling-history tail, ceiling value, and required array change.

- [x] **Step 4: Verify the focused guard is GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
```

Expected: exit 0; all six tests pass, including the exact count and required runtime-entry cases.

- [x] **Step 5: Falsify adapter presence and prove the required-entry assertion bites**

Run this trap-protected probe from the repository root:

```bash
set -e
adapter_path='scripts/task-tracker/lib/peer-review-adapter.mjs'
mkdir -p .scratch/test
probe_path='.scratch/test/1578-peer-review-adapter.falsification.mjs'
output_path='.scratch/test/1578-required-entry-falsification.txt'

test ! -e "$probe_path"
mv -- "$adapter_path" "$probe_path"
restore_adapter() {
  if test -e "$probe_path"; then
    mv -- "$probe_path" "$adapter_path"
  fi
}
trap restore_adapter EXIT INT TERM

set +e
node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs >"$output_path" 2>&1
probe_rc=$?
set -e

test "$probe_rc" -ne 0
rg -F '✔ package-boundary: total entry count stays under the ceiling' "$output_path"
rg -F '✖ package-boundary: runtime entry points are still shipped' "$output_path"
rg -F \
  'required runtime file missing from package: scripts/task-tracker/lib/peer-review-adapter.mjs' \
  "$output_path"

node - <<'NODE'
const { execFileSync } = require('node:child_process');
const manifest = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' })
)[0];
if (manifest.files.length !== 778) {
  throw new Error(`expected 778 entries without adapter, found ${manifest.files.length}`);
}
console.log('package-boundary falsification: count passes at 778 without adapter');
NODE

restore_adapter
trap - EXIT INT TERM
test -f "$adapter_path"
test ! -e "$probe_path"
git diff --quiet -- "$adapter_path"
node -e "const fs=require('node:fs'); if(fs.existsSync(process.argv[1])) fs.unlinkSync(process.argv[1])" "$output_path"
test ! -e "$output_path"
git status --short
```

Expected: the focused command exits nonzero only because the required-entry case names the missing adapter; the count case passes at 778 under the new 779 ceiling. The trap restores the adapter even on an early failure. Final checks prove the tracked adapter is byte-identical, both scratch probe files are absent, and `git status --short` names only the intentional package-boundary test modification.

- [x] **Step 6: Prove the diff and packed surface are exact**

Run:

```bash
git diff --check
git diff -- scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
git diff --name-only
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const manifest = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' })
)[0];
const paths = manifest.files.map(({ path }) => path);
if (paths.length !== 779) throw new Error(`expected 779 entries, found ${paths.length}`);
if (!paths.includes('scripts/task-tracker/lib/peer-review-adapter.mjs')) {
  throw new Error('required peer-review adapter is absent from package');
}
console.log('package-boundary: 779 entries; adapter present');
NODE
```

Expected: whitespace check passes; `git diff --name-only` prints only the package-boundary test; the diff contains exactly the four ratified edits; the manifest check reports 779 entries and adapter presence.

- [x] **Step 7: Run governed Develop iteration verification**

Run:

```bash
node scripts/task-tracker/verify-develop.mjs --mode iteration
```

Expected: exit 0 with no package-boundary failure.

- [x] **Step 8: Commit the implementation boundary**

Run:

```bash
git add scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
git diff --cached --check
git diff --cached --name-only
git commit -m "[#1578] test: account for peer-review adapter package entry"
```

Expected: the cached path check names only `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`; the attributed commit succeeds without amending or rewriting #1546 or #1577 history.

- [ ] **Step 9: Refresh the accepted Plan-commit authority before implementation resumes**

After this reopened review reaches agreement, identify the commit that contains the accepted amended plan:

```bash
plan_path='docs/superpowers/plans/2026-09-10-1578-package-boundary-ceiling.md'
accepted_plan_commit="$(git log -1 --format=%H -- "$plan_path")"
test "${#accepted_plan_commit}" -eq 40
printf '%s\n' "$accepted_plan_commit"
```

Use `apply_patch` to create `.scratch/gh/1578-plan-commit-operation.json` with schema `aitm.issue-body-operation/v1`, kind `replace-exact`, the current full `- **Plan-commit**: ...` line as `expected`, and the printed accepted amendment SHA as `replacement`. Put the literal 40-character SHA in the JSON; do not embed a shell expression. Then run:

```bash
plan_path='docs/superpowers/plans/2026-09-10-1578-package-boundary-ceiling.md'
accepted_plan_commit="$(git log -1 --format=%H -- "$plan_path")"
test "${#accepted_plan_commit}" -eq 40
npx aitm issue-body 1578 --operation-file .scratch/gh/1578-plan-commit-operation.json
gh issue view 1578 --repo kburson/ai-task-manager --json body --jq .body | rg -F -- "- **Plan-commit**: $accepted_plan_commit"
```

Delete the operation file with `apply_patch`, prove it is absent, and confirm the worktree has no tracked change from the authority update.

```bash
test ! -e .scratch/gh/1578-plan-commit-operation.json
git status --short
```

Expected: live Plan Metadata names the commit containing the newly accepted plan text, and no operation file remains.

- [ ] **Step 10: Resolve the native blocker and run clean descendant-SHA Develop finalization**

Run:

```bash
test "$(gh issue view 1580 --repo kburson/ai-task-manager --json projectItems --jq '.projectItems[] | select(.title == "aitm backlog") | .status.name')" = Done
npx aitm start 1578
git status --short
git merge-base --is-ancestor c7a4fe5a38d5a97809068cd1a6f183ed6d91e553 HEAD
git diff-tree --no-commit-id --name-only -r c7a4fe5a38d5a97809068cd1a6f183ed6d91e553
node --test scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
npx aitm commit-trace 1578
gh issue view 1578 --repo kburson/ai-task-manager --json comments --jq '[.comments[].body | select(test("^### 🔗 Commits"))] | last'
node scripts/task-tracker/verify-develop.mjs --mode final --issue 1578
git log --oneline --decorate -3
```

Expected: #1580 is Done and #1578's BLOCKED disposition has cleared; the worktree is clean; the #1578 implementation commit remains an ancestor and names only `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`; the focused guard passes 6/6; and the `### 🔗 Commits` trail includes `c7a4fe5a38d5a97809068cd1a6f183ed6d91e553` plus every later `[#1578]` plan-review commit. A `[#1580]` remediation commit may be the current descendant HEAD; `commit-trace` must leave no reachable `[#1578]` commit unrecorded. Finalization exits 0 at that clean descendant SHA. Report `CODE_COMPLETE` with both the final verified SHA and implementation commit `c7a4fe5a38d5a97809068cd1a6f183ed6d91e553`, plus the preserved RED/GREEN and falsification evidence. The orchestrator owns promotion, Test, independent review, delivery, and close.

## Delivery Recovery Amendment — 2026-09-11

The #1578 implementation remains commit
`c7a4fe5a38d5a97809068cd1a6f183ed6d91e553`. It was included in shared PR
PR #1582 at head `369934e676c88727033cc012bd23eddba2453f47`, which GitHub
squash-merged as `fd2b0830d9c214aac087de4c29efbd13f4c85b0d`.

Issue #1583 and PR #1584 delivered the bounded recovery for secondary issue
tokens in GitHub-default multi-source squash messages. PR #1585 then carried
the #1580 recovery amendment at head
`1cc84346676f69f3c2ae8646eececf264c0d7aac` and landed as
`efca9bc903512cbd186d0ca57b9e6440c0f6a600`. Its canonical attribution
trailer is intentionally byte-ordered for #1580, so it does not authorize a
Issue #1578 receipt even though it contains the #1578 token.

The preserved `codex/ai-peer-review-design` branch incorporated that landed
commit with the normal, non-rewriting merge
`c1e81b2a83f31df4ec916801d47bb27700781a2f`. The merge tree
`955099e131010895e05e6b76976cf89f2a542079` exactly equals the
`efca9bc903512cbd186d0ca57b9e6440c0f6a600` trunk tree. No rebase, reset,
force-push, substitute branch, issue-lineage change, or fabricated delivery
record was used.

The next PR for #1578 carries only this audit amendment relative to current
trunk. It does not replace or reinterpret the original implementation; it
provides a real, target-specific accepted head and canonical delivery boundary
for the already-reviewed change.
