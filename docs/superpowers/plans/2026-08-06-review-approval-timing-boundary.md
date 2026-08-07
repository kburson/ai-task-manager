# Review Approval Timing Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** End Review timing at the immutable approval marker timestamp and
reconcile exactly one matching Timing Log event before delayed closure.

**Architecture:** A shared reconciler turns the persisted approval marker into
the canonical `review:approved` row. Approval and close both invoke it, while
the locked timing-comment mutation provides chronological insertion and
concurrency-safe deduplication.

**Tech Stack:** Node.js ESM, `node:test`, GitHub issue comments, AITM marker and
Timing Log helpers.

## Global Constraints

- Exactly one git commit for story #1133, per operator instruction.
- `aitm-review-approved` remains the timestamp authority.
- `buildRow` retains its unconditional 60-second anti-backdating rule.
- No approval-policy or general estimation-model change.
- All scratch files remain under the worktree's `.tmp/` tree.
- Reference base commit: `512ef2ced7475db2b92672a1d64f33ff20dd1bc0`.

---

### Task 1: Reproduce the Approval-to-Close Gap

**Files:**

- Create: `scripts/task-tracker/tests/unit/verbs/approve-timing-boundary.test.mjs`
- Read: `scripts/task-tracker/verbs/approve.mjs`
- Read: `scripts/task-tracker/verbs/close.mjs`
- Read: `scripts/task-tracker/lib/timing-rows.mjs`

**Interfaces:**

- Consumes: injected approval/close verb dependencies and Timing Log Markdown.
- Produces: a deterministic #1127 regression proving the pre-fix boundary is
  written at close rather than approval.

- [ ] **Step 1: Build the fixed #1127 fixture**

```js
const REVIEW_STARTED = '2026-08-06T05:56:41Z';
const APPROVED = '2026-08-06T05:58:36Z';
const CLOSED = '2026-08-06T12:50:44Z';
```

Create an in-memory issue body, timing-comment body, and injected read/post
seams. Drive `runApprove` twice and the close reconciliation at `CLOSED`.

- [ ] **Step 2: Assert the required contract**

Assert one `review:approved` row, timestamp `APPROVED`, Review active seconds
`115`, unchanged rollups at `APPROVED` and `CLOSED`, and an unchanged marker
after every retry.

- [ ] **Step 3: Run the focused verifier and confirm RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/verbs/approve-timing-boundary.test.mjs \
  scripts/task-tracker/tests/unit/lib/active-by-phase-spans.test.mjs \
  scripts/task-tracker/tests/unit/core/close-emission-order.test.mjs
```

Expected: the new test fails because `runApprove` never posts a timing event and
the close path supplies its own current timestamp.

### Task 2: Add Marker-Authorized Timing Reconciliation

**Files:**

- Create: `scripts/task-tracker/lib/review-approval-timing.mjs`
- Modify: `scripts/task-tracker/gh-timing-comment.mjs`
- Test: `scripts/task-tracker/tests/unit/verbs/approve-timing-boundary.test.mjs`

**Interfaces:**

- Consumes: `parseReviewApprovedMarker(body)`, discriminated timing-comment
  reads, `computePhaseCloseDelta`, and the locked `postTimingEvent` writer.
- Produces:
  `reconcileReviewApprovedTiming(args): Promise<{ status: 'posted'|'present', ts: string }>`
  and `buildMarkerAuthorizedReviewApprovedRow(args): string`.

- [ ] **Step 1: Add the pure marker-authorized constructor**

Parse the marker from `issueBody`; throw if it or its timestamp is invalid.
Render only the canonical Review-complete row using the parsed timestamp and
the supplied computed duration/word values. Do not add a flag to `buildRow`.

- [ ] **Step 2: Deduplicate and insert under the timing lock**

In `appendRow`, suppress a second `review:approved` in the current terminal
window. For a marker-authorized approval row older than the tail, insert before
the first later data row. Preserve the timestamp clamp for every other event.

- [ ] **Step 3: Implement the reconciler**

Read the timing comment and refuse `status: 'error'`. Compute Review's close
delta at the marker timestamp with `computePhaseCloseDelta`, build the
marker-authorized row, and call `postTimingEvent`. Return `present` when the
locked mutation suppresses a duplicate, otherwise `posted`.

- [ ] **Step 4: Rerun the focused test**

Expected: constructor and reconciler unit cases pass; the end-to-end approval
case remains RED until Task 3 wires the verb.

### Task 3: Wire Approval and Close

**Files:**

- Modify: `scripts/task-tracker/verbs/approve.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/approve-core.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/close-emission-order.test.mjs`
- Test: `scripts/task-tracker/tests/unit/verbs/approve-timing-boundary.test.mjs`

**Interfaces:**

- Consumes: `reconcileReviewApprovedTiming` through injectable dependency seams.
- Produces: approval-owned primary emission and close-time legacy repair.

- [ ] **Step 1: Wire the verified first-approval path**

After `assertMarkerPersisted`, call the reconciler with the verified live body,
the issue number/repository, and the durable Word Marker. Surface failure rather
than reporting approval complete without its timing boundary.

- [ ] **Step 2: Wire the already-approved retry path**

Before returning `already-approved`, invoke the same reconciler with the
existing body. The marker remains byte-identical and supplies the prior time.

- [ ] **Step 3: Wire close repair before wrap emission**

When the live close body has a marker, reconcile first. Retain the explicit
gate-bypass path's existing close-time `review:approved` behavior when no marker
exists. Verify the close helper then emits only the missing `issue:wrap` half.

- [ ] **Step 4: Run focused and affected suites**

```bash
node --test scripts/task-tracker/tests/unit/verbs/approve-timing-boundary.test.mjs \
  scripts/task-tracker/tests/unit/lib/active-by-phase-spans.test.mjs \
  scripts/task-tracker/tests/unit/core/close-emission-order.test.mjs
node --test scripts/task-tracker/tests/unit/verbs/approve-core.test.mjs
node --test scripts/task-tracker/tests/unit/lib/coverage-approve.test.mjs
```

Expected: all commands exit 0 and the #1127 fixture retains 115 Review seconds.

### Task 4: Verify and Create the Single Story Commit

**Files:**

- Include all production, test, design, and plan changes for #1133.

**Interfaces:**

- Consumes: Tasks 1-3 at a dirty but fully reviewed feature worktree.
- Produces: one issue-attributed commit ready for governed Test and Review.

- [ ] **Step 1: Run static checks**

```bash
npm run lint
npm run format:check
```

- [ ] **Step 2: Run complete automated verification**

```bash
npm test
npm run test:slow
```

- [ ] **Step 3: Verify the patch and environment**

```bash
git diff --check
node scripts/dev-env/verify-local-worktree.mjs
git status --short
```

- [ ] **Step 4: Create exactly one story commit**

```bash
git add docs/superpowers/specs/2026-08-06-review-approval-timing-boundary-design.md \
  docs/superpowers/plans/2026-08-06-review-approval-timing-boundary.md \
  scripts/task-tracker/lib/review-approval-timing.mjs \
  scripts/task-tracker/gh-timing-comment.mjs \
  scripts/task-tracker/lib/markers.mjs \
  scripts/task-tracker/verbs/approve.mjs scripts/task-tracker/verbs/close.mjs \
  scripts/task-tracker/tests/unit/verbs/approve-timing-boundary.test.mjs \
  scripts/task-tracker/tests/unit/verbs/approve-core.test.mjs \
  scripts/task-tracker/tests/unit/core/close-emission-order.test.mjs \
  scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs \
  scripts/task-tracker/tests/slow/verbs/coverage-close.test.mjs \
  scripts/task-tracker/tests/unit/core/package-boundary.test.mjs \
  scripts/task-tracker/tests/unit/lib/agent-review/approve-agent-review-complete.test.mjs \
  scripts/task-tracker/tests/unit/lib/coverage-approve.test.mjs \
  scripts/task-tracker/tests/unit/verbs/approve-full-auto-detect.test.mjs \
  scripts/task-tracker/tests/unit/verbs/approve-full-auto-unified.test.mjs \
  scripts/task-tracker/tests/unit/verbs/approve-review-notes.test.mjs \
  scripts/task-tracker/tests/unit/verbs/close-converge-audit-emission.test.mjs \
  scripts/task-tracker/tests/unit/verbs/close-strip-labels.test.mjs
git commit -m "[#1133] fix(timing): end Review at approval"
```

- [ ] **Step 5: Run governed Test and Review**

Run `npx aitm test 1133`, inspect the exact-SHA receipt, complete Agent Review,
record Full-Auto approval, show the exact ref/delta/check evidence, fast-forward
trunk, run the merged-result suite, push, and close through `npx aitm close
1133`.
