# Nested Epic Close After Merge-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an epic prove its derived child trail on the nearest surviving ancestor after governed merge-back deletes the epic's own branch.

**Architecture:** Keep the existing epic branch as the preferred proof target. When that branch is absent, reuse `resolveDoneTargetBranch` with the same graph, branch-existence, and trunk inputs already used for leaf delivery, then run the unchanged child grouping check against the selected target. A nonexistent selected ref still fails closed through the existing trail-log error path.

**Tech Stack:** Node.js ESM, `node:test`, injected Git/GitHub I/O seams.

## Global Constraints

- Preserve the documented nearest-surviving-ancestor delivery contract in `docs/guides/workflow.md`.
- Preserve recursive nested-epic behavior from `docs/superpowers/specs/2026-07-20-epic-aware-git-branching-design.md`.
- Do not change merge-back cleanup, branch naming, remote-ref policy, or close approval semantics.
- Produce exactly one `[#1137]` commit containing the plan, regression tests, and production fix.

---

### Task 1: Select an epic's surviving delivery target

**Files:**

- Modify: `scripts/task-tracker/lib/close-gates-lineage.mjs`
- Test: `scripts/task-tracker/lib/close-gates-lineage.test.mjs`
- Create: `docs/superpowers/plans/2026-08-06-1137-nested-epic-close-after-merge.md`

**Interfaces:**

- Consumes: `resolveDoneTargetBranch({ issueNumber, deps: { graph, branchExists, trunk } }) -> string`.
- Produces: `lineageDoneGate(...)` results whose `epicHead` is the own branch when present or the resolved ancestor target when absent.

- [ ] **Step 1: Add the failing nested-epic fallback test**

Add a test that calls `lineageDoneGate` for nested epic `#860`, reports only `feature/epic/859` as a surviving branch, and returns a `[#872]` trail from the injected logger. Assert `ok === true` and `epicHead === 'feature/epic/859'`.

- [ ] **Step 2: Add fail-closed and trunk-terminal tests**

Add a matching `#860` case whose parent trail is empty and assert `close-epic-child-trail-incomplete` plus `unreachable: [872]`. Add root epic `#912` with absent own branch and custom trunk `origin/trunk`; return both `[#913]` and `[#914]` commits and assert the logger receives `origin/trunk`.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node --test scripts/task-tracker/lib/close-gates-lineage.test.mjs`

Expected: the three new cases fail because the current implementation returns `close-epic-branch-missing` before calling the injected trail logger.

- [ ] **Step 4: Implement the minimal target selection**

In the epic branch of `lineageDoneGate`, select the target as follows:

```js
let epicHead = lineage.branch;
if (!branchExists(epicHead)) {
  try {
    epicHead = resolveDoneTargetBranch({
      issueNumber,
      deps: { graph, branchExists, trunk },
    });
  } catch (err) {
    return { ok: false, blocker: `close-lineage-target-unresolved: ${err.message}` };
  }
}
```

Pass `epicHead` to `epicDerivedTrailGate`. Remove that helper's redundant own-branch existence refusal so the selected target is evaluated by the existing log and grouping paths; an invalid target remains fail-closed as `close-epic-trail-log-failed`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --test scripts/task-tracker/lib/close-gates-lineage.test.mjs`

Expected: all existing and new cases pass, including own-branch compatibility, nested fallback, incomplete fallback refusal, and root-trunk fallback.

- [ ] **Step 6: Run formatting and focused diff checks**

Run: `npm run lint && npm run format:check && git diff --check`

Expected: exit 0 with no formatting or whitespace errors.

- [ ] **Step 7: Create the single story commit**

```bash
git add docs/superpowers/plans/2026-08-06-1137-nested-epic-close-after-merge.md \
  scripts/task-tracker/lib/close-gates-lineage.mjs \
  scripts/task-tracker/lib/close-gates-lineage.test.mjs
git commit -m "[#1137] fix(close): verify merged epics on surviving ancestors"
```

Expected: exactly one commit ahead of `feature/epic/1118`, attributed to `#1137`.
