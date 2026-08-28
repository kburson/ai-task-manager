# Quality Blocker Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the historical #708 close-repair test fully offline so #1406's exact aggregate quality verifier is deterministic.

**Architecture:** Keep production close behavior unchanged. Route the existing best-effort review-delta call through an optional context seam, and inject the binding-cleanup and review-delta boundaries in the #708 fixture so the test reaches no real GitHub, Git, fleet, or occupancy authority.

**Tech Stack:** Node.js ESM, `node:test`, existing AITM dependency-injection context.

## Global Constraints

- Create no successor defect and do not touch #1381.
- Do not increase timeouts, add retries, reclassify the test lane, weaken assertions, or change verifier commands.
- Production defaults and close, convergence, timing, lifecycle, delivery, and review-delta behavior remain unchanged.
- Stop if RED evidence requires any file beyond the test and the one existing caller seam.

---

### Task 1: Expose and Isolate the #708 Harness

**Files:**

- Modify: `scripts/tests/unit/task-tracker/lib/close-repair.test.mjs`

**Interfaces:**

- Consumes: `verbClose(ctx)` and the existing flat-context dependency fallbacks.
- Produces: explicit convergence diagnostics plus offline doubles for review delta and terminal binding cleanup.

- [ ] **Step 1: Capture the close result**

Store the value returned by `await verbClose(ctx)` and return it from `runClose`:

```js
let result = null;
try {
  result = await verbClose(ctx);
} catch (err) {
  if (!/__test_exit_\d+__/.test(err.message)) caught = err;
}
return { exitCode, stdout: stdout.join('\n'), caught, result };
```

- [ ] **Step 2: Inject every reached external boundary**

Add these context doubles in `buildCtx`:

```js
applyReviewDelta: async () => {
  sideEffects.push('applyReviewDelta');
  return { status: 'applied' };
},
releaseIssueBindings: () => {
  sideEffects.push('releaseIssueBindings');
  return { released: [] };
},
deregisterTask: () => sideEffects.push('deregisterTask'),
releaseBindingOccupancy: () => {
  sideEffects.push('releaseBindingOccupancy');
  return { status: 'released' };
},
```

- [ ] **Step 3: Add diagnostic and seam assertions**

For both close cases, require `r.caught === null`, `r.exitCode === null`, and `r.result?.status === 'completed'`. For the `--repair` case, require all four injected side-effect names. Keep the existing behavioral assertions unchanged.

- [ ] **Step 4: Run RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/close-repair.test.mjs
```

Expected: FAIL because `verbClose` does not yet consume `ctx.applyReviewDelta`, so the `applyReviewDelta` side effect is absent. The output must show that close behavior itself completed.

---

### Task 2: Add the Minimal Review-Delta Seam

**Files:**

- Modify: `scripts/task-tracker/verbs/close.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/close-repair.test.mjs`

**Interfaces:**

- Consumes: optional `ctx.applyReviewDelta(args)`.
- Produces: unchanged default behavior via the existing dynamically imported `applyReviewDelta`.

- [ ] **Step 1: Route the existing call through the context**

Replace only the best-effort review-delta block's direct call:

```js
const { applyReviewDelta: defaultApplyReviewDelta } = await import('../lib/apply-review-delta.mjs');
const applyReviewDelta = ctx.applyReviewDelta || defaultApplyReviewDelta;
await applyReviewDelta({ cfg, issueNumber: closeIssueNum, body: closeBody });
```

- [ ] **Step 2: Run GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/close-repair.test.mjs
```

Expected: 3 tests pass with no real `gh` warning.

- [ ] **Step 3: Run a fixed stress sample**

Run exactly 20 isolated executions, stopping on the first failure:

```bash
for run in {1..20}; do node --test scripts/tests/unit/task-tracker/lib/close-repair.test.mjs || exit 1; done
```

Expected: all 20 executions pass; no GitHub, fleet, occupancy, or timeout warning appears.

- [ ] **Step 4: Commit the repair**

```bash
git add scripts/task-tracker/verbs/close.mjs scripts/tests/unit/task-tracker/lib/close-repair.test.mjs
git commit -m "[#1406] Isolate close repair verification"
```

---

### Task 3: Reprove #1406 at One Head

**Files:**

- Verify only.

**Interfaces:**

- Consumes: the Task 2 commit.
- Produces: exact-head acceptance and Functional DoD receipts plus a post-implementation review handoff.

- [ ] **Step 1: Run focused and repository gates**

Run the Task 8 focused matrix, then separately run:

```bash
npm test
npm run test:slow
npm run lint
npm run format:check
npm run quality
npm pack --dry-run
```

Expected: every command exits 0 and `git status --short` remains empty.

- [ ] **Step 2: Record sanctioned evidence**

Rerun the exact unstamped #1406 acceptance criteria through `npx aitm ac-stamp`, then run `npx aitm dod-stamp tests`, `lint`, and `commits`. Do not waive or synthesize a marker.

- [ ] **Step 3: Prepare independent result review**

Create an ignored Claude handoff covering `ac892beb..HEAD`, the RED/GREEN receipts, the 20-run sample, and the exact aggregate quality receipt. The reviewer must confirm production-default equivalence and test isolation before delivery.
