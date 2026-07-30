# Review-Epoch Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development and
> superpowers:test-driven-development. Complete each task RED, GREEN, refactor,
> commit, and independent review before starting the next task.

**Goal:** Make Agent Review proof and final approval authoritative only for the
current Review visit and verified revision.

**Architecture:** A pure review-authority module parses Review visits, Agent
Review proofs, approvals, and invalidations into one projection. Writers emit
versioned epoch-bound markers; approve, lifecycle satisfaction, close, demote,
and reconcile consume the same projection. Historical markers remain
auditable, while ambiguous legacy state fails closed.

**Tech Stack:** Node.js `>=22.15.0`, ECMAScript modules, `node:test`, versioned
GitHub issue-body mutation.

## Global Constraints

- Epoch IDs are `review:<visit>:<entered-review-ts>` and come from structural
  Review-entry history, never the current clock.
- Agent Review proof binds epoch, verified Git SHA, timestamp, validators, and
  result. Approval binds epoch, proof SHA, timestamp, and truthful provenance.
- Current authority requires the latest epoch, its passing proof, matching
  proof SHA, and no later invalidation.
- `approve --human` replaces stale Full-Auto authority; a same-epoch approval
  against the same proof is idempotent.
- Demote and demotion-shaped reconcile invalidate authority identically.
- Legacy markers are accepted only when no later Review re-entry, demotion, or
  invalidation exists; ambiguity fails closed with repair guidance.
- Marker mutation uses `mutateIssueBody` and read-back verification.
- Every production change follows a witnessed failing test.

---

### Task 1: Pure Epoch and Authority Projection

**Files:**

- Create: `scripts/task-tracker/lib/review-authority.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/review-authority.test.mjs`
- Modify: `scripts/task-tracker/lib/markers.mjs`

**Interfaces:**

```js
reviewEpochId({ visit, enteredReviewAt });
parseReviewAuthority(body);
deriveReviewAuthority(body, { verifiedSha });
serializeAgentReviewProof(proof);
serializeReviewApproval(approval);
serializeReviewInvalidation(event);
```

`deriveReviewAuthority` returns
`{ epoch, proof, approval, status, reasons }`, where status is one of
`current`, `missing`, `stale`, `ambiguous`, or `malformed`.

- [ ] Add table tests for initial Review, same-visit retry, re-entry, stale
      proof SHA, later invalidation, human and Full-Auto approval, malformed
      attributes, and legacy current/stale/ambiguous classification.
- [ ] Run
      `node --test scripts/task-tracker/tests/unit/lib/review-authority.test.mjs`.
      Expected RED: module/export not found.
- [ ] Implement strict parsing and deterministic serialization. Preserve
      historical markers; the projection chooses current authority.
- [ ] Run the same command. Expected GREEN: all cases pass.
- [ ] Commit:
      `git commit -m "[#${AITM_REVIEW_EPOCH_ISSUE}] feat(review): model epoch-bound authority"`.

### Task 2: Emit Epoch-Bound Review Entry and Agent Proof

**Files:**

- Modify: `scripts/task-tracker/lib/agent-review/review-gate.mjs`
- Modify: `scripts/task-tracker/verbs/review.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/lib/stage-entry-markers.mjs`
- Modify: `scripts/task-tracker/lib/lifecycle-policy/index.mjs`
- Modify: `scripts/task-tracker/lib/timing-events/index.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/agent-review/approve-agent-review-complete.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/promote-review-close-agent-review-gate.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/review-epoch-entry.test.mjs`

**Interfaces:**

- Review entry obtains the canonical visit counter and entered-Review
  timestamp, then emits one stable epoch ID.
- Test records the revision it actually verified. Agent Review pass emits the
  versioned proof marker against that recorded Test/DoD evidence SHA, never an
  ambient `git rev-parse HEAD`; failure cannot emit a passing proof.

- [ ] Add failing tests proving Review re-entry increments the visit, same-state
      retry reuses it, and Agent Review binds epoch plus SHA.
- [ ] Run both focused test files. Expected RED: current markers lack epoch/SHA.
- [ ] Thread the epoch and verified Test revision through `review`,
      `stage-entry-markers`, Test evidence, and Agent Review completion without
      adding ambient environment authority.
- [ ] Run the focused tests plus
      `node --test scripts/task-tracker/tests/unit/lib/timing-events-policy.test.mjs`.
      Expected GREEN.
- [ ] Commit:
      `git commit -m "[#${AITM_REVIEW_EPOCH_ISSUE}] feat(review): bind agent proof to review epoch"`.

### Task 3: Refresh Approval and Preserve Provenance

**Files:**

- Modify: `scripts/task-tracker/verbs/approve.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/approve-core.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/coverage-approve.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/approve-full-auto-detect.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/approve-full-auto-unified.test.mjs`

**Interfaces:**

- `approve` derives current authority before its no-op decision.
- Current same-proof approval returns `already-approved`.
- Stale approval is historical, not a no-op. Before writing current authority,
  move the stale marker into separate history/invalidation evidence, remove its
  Full-Auto footnote, untick Final Review, and replace the single current
  approval projection only after a current passing Agent Review proof exists.
- `--human` always records human provenance. Full-Auto records only signals
  detected for that invocation.

- [ ] Add failing regression tests for stale human, stale Full-Auto, fresh
      human superseding stale Full-Auto, missing current proof, and same-epoch
      idempotency.
- [ ] Run the four approve test files. Expected RED: stale marker still returns
      `already-approved`.
- [ ] Replace presence-only early return with the shared projection and emit
      the versioned approval marker through the versioned writer.
- [ ] Re-run focused tests. Expected GREEN, including #979 behavior.
- [ ] Commit:
      `git commit -m "[#${AITM_REVIEW_EPOCH_ISSUE}] fix(approve): refresh stale review authority"`.

### Task 4: Invalidate and Consume One Authority Projection

**Files:**

- Modify: `scripts/task-tracker/lib/evidence-invalidation.mjs`
- Modify: `scripts/task-tracker/verbs/demote.mjs`
- Modify: `scripts/task-tracker/verbs/reconcile.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify:
  `scripts/task-tracker/lib/review-exit-review-approved-guard.mjs`
- Modify: `scripts/task-tracker/lib/close-gates.mjs`
- Modify: `scripts/task-tracker/close-gate.mjs`
- Modify: `scripts/task-tracker/lib/lifecycle-dod.mjs`
- Modify: `scripts/task-tracker/lib/human-reviewer-audit.mjs`
- Modify: `scripts/task-tracker/lib/close-convergence.mjs`
- Modify: `scripts/task-tracker/tests/unit/verbs/demote.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/reconcile-verb.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/lifecycle-satisfaction.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/review-authority-close-gates.test.mjs`
- Create:
  `scripts/task-tracker/tests/integration/review-epoch-demotion-cycle.test.mjs`

- [ ] Add failing unit tests proving demote/reconcile append equal invalidation
      events, Test normalization and close convergence consume the same
      projection, stale approval cannot satisfy close/audit/Final Review, and
      unrelated forward reconciliation does not revoke current authority. Add
      the failing hermetic incident sequence now, before production wiring.
- [ ] Run the named test files. Expected RED: consumers remain presence-only.
- [ ] Route every writer/consumer through `review-authority.mjs`; keep the
      existing short-lived body mutation lock around writes.
- [ ] Re-run focused tests plus
      `node --test scripts/task-tracker/tests/unit/lib/test-verb-result.test.mjs`.
      Expected GREEN.
- [ ] Commit:
      `git commit -m "[#${AITM_REVIEW_EPOCH_ISSUE}] fix(review): enforce current authority at lifecycle gates"`.

### Task 5: Hermetic Incident Regression and Documentation

**Files:**

- Verify:
  `scripts/task-tracker/tests/integration/review-epoch-demotion-cycle.test.mjs`
- Modify: `docs/DESIGN.md`
- Modify: `skill/shared/rules/review.md`

- [ ] Re-run the hermetic sequence added in Task 4: Review/approve → demote →
      new commit → Test → Review → verify stale close refusal →
      `approve --human` → close success. Expected GREEN after Task 4 wiring.
- [ ] Document epoch/proof/approval/invalidation authority and repair guidance.
- [ ] Run:

  ```bash
  node --test \
    scripts/task-tracker/tests/unit/lib/review-authority.test.mjs \
    scripts/task-tracker/tests/unit/lib/review-authority-close-gates.test.mjs \
    scripts/task-tracker/tests/unit/verbs/approve-core.test.mjs \
    scripts/task-tracker/tests/unit/verbs/approve-full-auto-detect.test.mjs \
    scripts/task-tracker/tests/unit/verbs/demote.test.mjs \
    scripts/task-tracker/tests/unit/verbs/reconcile-verb.test.mjs \
    scripts/task-tracker/tests/integration/review-epoch-demotion-cycle.test.mjs
  npm run format:check
  npm run lint
  npm test
  git diff --check
  ```

  Expected: exit `0` throughout and no whitespace errors.

- [ ] Commit:
      `git commit -m "[#${AITM_REVIEW_EPOCH_ISSUE}] test(review): lock demotion epoch regression"`.
