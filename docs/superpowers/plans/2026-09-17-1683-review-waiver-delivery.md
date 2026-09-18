# Authorized Review Waiver Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. No subagent delegation is authorized for this story.

**Goal:** Let legacy delivery accept an exact, current semantic-review waiver as typed review authority without creating Agent Review Passed evidence or weakening any other delivery gate.

**Architecture:** Add a pure review-authority resolver that returns a frozen `passed` or `waived` result bound to the accepted Test SHA. Delivery runtime will continue using existing pass evidence first; only the waived branch will require both a durable open `review:waived` terminal event and a freshly loaded `review.semantic-resident` workflow-policy decision whose authority matches that event. PR, historical, merged, and no-commit paths will consume the same typed result.

**Tech Stack:** Node.js ESM, `node:test`, GitHub-native AITM workflow-exception records, legacy delivery v1.

**Spec:** GitHub issue #1683 and its governed Deep-Dive Analysis comment.

## Global Constraints

- A waived review remains `waived`; never set or stamp Agent Review Passed for that branch.
- Full-Auto alone is not waiver authority.
- Revalidate repository, issue, scope identity, expiry, revision, requirement, authority record, and exact accepted head at delivery time.
- A managed-provider denial remains stronger than Full-Auto; delivery must not launch a provider to replace a waived review.
- Preserve Test receipts, completion approval, ownership, dependency, binding, state-contiguity, CI, PR, merge, attribution, and delivery-receipt gates.
- Evidence-v2 behavior is unchanged unless it already calls the shared legacy authority seam.

---

### Task 1: Define typed review authority and terminal outcome

**Files:**

- Create: `scripts/task-tracker/lib/delivery-review-authority.mjs`
- Modify: `scripts/task-tracker/lib/terminal-review-handoff.mjs`
- Modify: `scripts/task-tracker/lib/delivery-authority.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/delivery-authority.test.mjs`

**Interfaces:**

- Consumes: Test receipt SHA, accepted Review SHA, ordinary Agent Review pass boolean, latest open terminal review outcome, and a live workflow-boundary decision for `review.semantic-resident`.
- Produces: `resolveDeliveryReviewAuthority(input)` returning a frozen `{ outcome, acceptedSha, authority }`, where `outcome` is exactly `passed` or `waived`; `terminalReviewHandoffOutcome(body)` returning `passed`, `waived`, or `null`; and `resolveAcceptedDeliveryAuthority` consuming the typed result rather than inferring waiver truth from a pass boolean.

- [ ] **Step 1: Write failing terminal-outcome tests**

Add cases proving the helper returns `passed` for the latest open `review:passed`, `waived` for the latest open `review:waived`, and `null` after any canonical terminal-handoff closer. Preserve `isTerminalReviewHandoffOpen` as a boolean wrapper over the new outcome helper.

- [ ] **Step 2: Run the terminal helper test and verify RED**

Run:

```bash
node --test scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs
```

Expected: the new named export or outcome assertions fail before production changes.

- [ ] **Step 3: Add failing review-authority tests**

Cover these exact inputs:

```js
{
  agentReviewPassed: false,
  terminalReviewOutcome: 'waived',
  testReceiptSha: HEAD,
  acceptedReviewSha: HEAD,
  workflowPolicy: {
    status: 'policy-compatible',
    isWaived: (id) => id === 'review.semantic-resident',
    decision: () => ({
      outcome: 'waived',
      authority: { recordId: '01M2H000000000000000000001', revision: 1 },
    }),
  },
  recordedWaiver: {
    requirementId: 'review.semantic-resident',
    authority: { recordId: '01M2H000000000000000000001', revision: 1 },
  },
}
```

Assert a frozen waived result. Add table cases for no terminal event, `passed` event with no pass evidence, non-compatible policy, non-waived requirement, mismatched authority ID/revision, missing accepted SHA, and Test/Review SHA mismatch. Preserve the ordinary passed result when `agentReviewPassed === true` and both SHAs agree.

- [ ] **Step 4: Implement the minimal pure resolver and terminal parser**

Use exact-key validation for the authority carrier, canonical 40-character lowercase SHA validation, and deterministic `delivery-review-authority:<category>` errors. The waived result must carry the workflow-exception identity; the passed result may use `authority: null`.

- [ ] **Step 5: Update accepted delivery-head resolution**

Change `resolveAcceptedDeliveryHead` and `resolveAcceptedDeliveryAuthority` to require the typed result's `acceptedSha`. Keep branch and unique exact-head PR selection unchanged.

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-authority.test.mjs scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs
```

Expected: all focused tests pass and no waiver is represented as `agentReviewPassed: true`.

### Task 2: Wire live waiver revalidation into every legacy delivery path

**Files:**

- Modify: `scripts/task-tracker/lib/delivery-preflight.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver-test-harness.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver-no-commit.test.mjs`

**Interfaces:**

- Consumes: `terminalReviewHandoffOutcome`, `loadWorkflowBoundary`, exhaustive issue comments, and the Task 1 typed resolver.
- Produces: one delivery-runtime dependency `resolveDeliveryReviewAuthority({ issue, issueNumber, testReceiptSha, acceptedReviewSha })`; all legacy preflight variants receive `issue.reviewAuthority` and validate it without consulting an Agent Review pass boolean.

- [ ] **Step 1: Write failing pure preflight tests**

In `delivery-provider-action.test.mjs`, replace fixture-only review booleans with typed passed authority, add a valid waived authority case, and add invalid outcome/SHA/authority-shape cases. Assert the returned immutable plan preserves `issue.reviewAuthority.outcome === 'waived'`.

- [ ] **Step 2: Write failing PR orchestration tests**

Extend the harness with terminal outcome, recorded waiver evidence, and injected workflow policy. Prove a matching current waiver reaches the normal provider-action result while absent, revoked, unavailable, wrong-requirement, mismatched-record, mismatched-revision, and wrong-head cases reject before an intent comment or provider action is emitted.

- [ ] **Step 3: Write failing no-commit tests**

Add one matching waiver success and table-driven invalid waiver refusals. Assert the resulting no-commit receipt records the accepted Test SHA and no pass marker is created.

- [ ] **Step 4: Implement the runtime resolver**

For ordinary pass evidence, return `passed` after exact Test/Review SHA agreement. Otherwise read the latest open terminal outcome and recorded waiver identity from the canonical timing/event carrier, then call `loadWorkflowBoundary` with:

```js
{
  repository: cfg.repo,
  issue: issueNumber,
  body: issue.body,
  requirementIds: ['review.semantic-resident'],
  activity: 'delivery:review-authority',
  state: 'review',
  now: new Date().toISOString(),
  runtime: createGithubWorkflowBoundaryRuntime({ repository: cfg.repo }),
}
```

Feed only that fresh decision and the durable Review carrier to `resolveDeliveryReviewAuthority`. Policy read failures must become a review-authority refusal, never a passed or waived result.

- [ ] **Step 5: Pass typed authority through every legacy preflight mode**

Update ordinary open/merged delivery, advanced-head historical recovery, historical reconstruction, and no-commit delivery. Keep exact-head, unique-PR, state, owner, completion authorization, CI, merge, attribution, and receipt code byte-for-byte unless its call signature must change.

- [ ] **Step 6: Run focused delivery tests and verify GREEN**

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-no-commit.test.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

Expected: all valid passed/waived cases pass, every invalid waiver fails before mutation, and ordinary delivery regressions remain green.

### Task 3: Verify, commit, review, and deliver

**Files:**

- Modify only if test evidence requires: files listed in Tasks 1 and 2.
- Track: `docs/superpowers/plans/2026-09-17-1683-review-waiver-delivery.md`

**Interfaces:**

- Consumes: completed Tasks 1 and 2.
- Produces: exact-SHA Test receipt, review evidence, delivery receipt, and governed close for #1683.

- [ ] **Step 1: Run issue-specific verification**

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-provider-action.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-no-commit.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs
```

- [ ] **Step 2: Run repository verification**

```bash
npm run precommit
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check
node scripts/dev-env/verify-local-worktree.mjs
```

- [ ] **Step 3: Commit implementation with issue attribution**

Stage only #1683 files and commit with a subject ending in `[#1683]`. Confirm the rolling commit-trail comment contains every story commit.

- [ ] **Step 4: Run governed Test and review**

Use `npx aitm test 1683`, stamp each acceptance criterion from its declared verification commands, and run the orchestrator Review action. Do not reuse evidence from another SHA.

- [ ] **Step 5: Deliver and close #1683**

Open the governed pull request, wait for required hosted CI on the exact accepted head, execute the provider-action merge bytes, verify the delivery receipt, record Full-Auto completion approval, and close through `npx aitm close 1683`.

- [ ] **Step 6: Resume the blocked consumer sequence**

Return to `kburson/ai-peer-review#60`, update the installed AITM package/runtime to the delivered #1683 release or source revision through the repository's supported dependency path, rerun delivery, close #60, then pick up and drive #61 to Done.
