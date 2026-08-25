# Full-Auto Review Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pause Review only for human approval and keep Full-Auto review, approval, and delivery on one active timing session.

**Architecture:** Move the existing pause from Review entry to the successful human-handoff exit. Use one exported pure policy helper to distinguish a human wait from explicit Full-Auto or a disabled human gate; leave approval and delivery contracts unchanged.

**Tech Stack:** Node.js ESM, `node:test`, AITM task state and timing lifecycle.

## Global Constraints

- Keep `deliver`'s running-timer preflight unchanged.
- Keep `/task approve` as a separate provenance-producing verb.
- Do not emit synthetic `resumed` or `stop` events after `review:passed`.
- Do not create a successor defect.

---

### Task 1: Make Review pause conditional

**Files:**

- Modify: `scripts/task-tracker/verbs/review.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs`
- Test: `scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs`

**Interfaces:**

- Consumes: `cfg.gateReviewToDone`, `env.TT_FULL_AUTO`, the current task state, and the successful Review result.
- Produces: `reviewNeedsHumanApproval({ cfg, env }) -> boolean` and mode-correct Review terminal behavior.

- [ ] **Step 1: Write failing tests**

Add unit cases proving human mode requires a handoff, while `TT_FULL_AUTO=1` and `gateReviewToDone=false` do not. Update the pre-network Review test to require the entry clock to remain unchanged. Add CLI cases proving human success pauses and prompts, while explicit Full-Auto success remains active and emits no prompt.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs
```

Expected: FAIL because Review currently pauses before agent validation and always emits the human prompt.

- [ ] **Step 3: Implement the minimal policy and ordering change**

Export a pure `reviewNeedsHumanApproval({ cfg, env })` helper. Remove the early unconditional pause. After successful agent Review and timing synchronization, call `pauseTimingKeepBinding` and set fleet status to paused only when the helper returns true; otherwise preserve the live state and emit no `PROMPT_REQUIRED` line.

- [ ] **Step 4: Verify GREEN and regressions**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/deliver-default-deps.test.mjs scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs
```

Expected: PASS with human pause behavior preserved, Full-Auto active, and downstream delivery/timing contracts unchanged.

- [ ] **Step 5: Commit**

```bash
git add scripts/task-tracker/verbs/review.mjs scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs docs/superpowers/specs/2026-08-25-1413-full-auto-review-continuation-design.md docs/superpowers/plans/2026-08-25-1413-full-auto-review-continuation.md
git commit -m "[#1413] Keep Full-Auto review active"
```
