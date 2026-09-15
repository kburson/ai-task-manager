# False-Delivery Close Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a fail-closed protected-base recovery for #1624's completed false-delivery close, preserve its historical accepted SHA, close against the delivered integration SHA, and re-verify all seven audit findings.

**Architecture:** A pure recovery module owns the closed evidence schema, predicates, persistence correlation, and close-transaction replacement. `close.mjs` supplies only live, independently resolved inputs and resumes the existing eight-step saga after durable evidence is written. The protected-base amendment admits either the historical same-SHA shape or one exact two-parent integration head whose first parent is the historical accepted SHA and whose second parent is reachable from verified trunk. Operational recovery first lands this amendment, then delivers #1624 through that integration head and applies the terminal correction.

**Tech Stack:** Node.js ESM, `node:test`, Git/GitHub CLI, AITM governed lifecycle and delivery records.

**Spec:** `docs/superpowers/specs/2026-09-15-1635-false-delivery-close-recovery-design.md`

## Global Constraints

- Do not create another defect issue; absorb in-scope findings into #1635 or stop for planning.
- Do not rewrite, rebase, amend, discard, or delete `feature/epic/1624` or its historical accepted head `2158a289a63b27b9b4d08b8701a16f0b9d3e805d`; only add the approved current-trunk merge commit.
- Do not edit or delete #1624's completed close transaction or no-commit delivery comment by hand.
- Keep `--restart-stale-transaction`, `--restart-reopened-transaction`, unauthorized-close convergence, and ordinary close behavior unchanged.
- Require Test, Review, PR intent, PR receipt, and independently verified trunk delivery to agree on the current delivery head before correction.
- Persist and read back immutable correction evidence before replacing the protected close marker.
- Preserve unrelated working-tree changes, including the main checkout's untracked `.vscode/` directory.

## Decomposition Waiver

- **Rationale**: The recovery capability, exact #1624 branch delivery, terminal correction, and seven-row audit proof form one atomic incident-recovery boundary; completing only a subset would leave either unusable recovery code or known false-Done records.
- **Expected-focused-duration**: 4 hours
- **Milestone-checkpoint-plan**: Review the pure authority red-green cycle, close wiring red-green cycle, public command contract, #1635 capability delivery, exact #1624 delivery, then terminal and audit convergence.
- **Why-no-nested-children**: The user has reached the defect-chain limit and explicitly requires any further discovery to be fixed inside #1635 or returned to planning; new child defects would violate that authority and split one stateful recovery across competing owners.
- **Approved-by**: kburson via explicit Full-Auto authorization and defect-chain constraint
- **Approved-at**: 2026-09-15T16:10:51Z

---

### Task 1: Pure false-delivery correction authority

**Files:**

- Create: `scripts/task-tracker/lib/false-delivery-close-recovery.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/false-delivery-close-recovery.test.mjs`

**Interfaces:**

- Consumes: canonical delivered-close transactions, no-commit delivery projection, PR delivery intent/receipt records, audit and recovery issue snapshots.
- Produces: `authorizeFalseDeliveryCloseRestart(input)`, `createFalseDeliveryCloseRecoveryRecord(authorization, deps)`, `renderFalseDeliveryCloseRecoveryComment(record)`, `parseFalseDeliveryCloseRecoveryComment(comment, context)`, `resolveFalseDeliveryCloseRecovery(input)`, `replacementFalseDeliveryTransaction(authorization, record)`, `classifyFalseDeliveryRecoveryProgress(body, authorization, record)`, and `replaceFalseDeliveredCloseTransaction(body, authorization, record)`.

- [x] **Step 1: Write schema and predicate tests**

Create fixtures with one complete old transaction at `OLD_SHA`, one valid no-commit record at `OLD_SHA`, and one merged PR/intent/receipt bundle at the current delivery SHA with exact Test/Review evidence, audit #1633 evidence, recovery #1635 evidence, and OPEN/REOPENED Review live state. Assert both the legacy same-SHA shape and the exact approved two-parent integration shape authorize and return deeply frozen values.

Add table-driven refusals for partial/reordered close steps, an unproven different current SHA, reversed or extra integration parents, unreachable trunk parent, missing or duplicate no-commit record, malformed delivery bundle, mismatched PR/intent/receipt, stale Test or Review SHA, non-reopened issue, non-Review board, non-Delivered disposition, dirty worktree, foreign binding, wrong audit finding, and wrong recovery marker.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/false-delivery-close-recovery.test.mjs
```

Expected: failure because the module does not exist.

- [ ] **Step 3: Implement the closed schema and authorizer**

Use exact-key validation and constants:

```js
export const FALSE_DELIVERY_CLOSE_RECOVERY_SCHEMA = 'aitm.false-delivery-close-recovery/v2';
export const FALSE_DELIVERY_CLOSE_RECOVERY_REASON = 'historical-no-commit-false-delivery';
```

Validate the complete old transaction, the exact historical no-commit record, current delivery-head authority, the exact two-parent integration topology when the heads differ, audit/recovery snapshots, and prefix-aware live state. Never accept asserted `verified: true` booleans.

- [ ] **Step 4: Add deterministic record and canonical comment tests**

Assert the recovery ID is a fingerprint of the authorization intent, the replacement ID is preserved on retry, exact parser correlation includes repository/issue/comment URL, quoted or malformed markers refuse, duplicate evidence refuses, and create/read-back ordering is representable without mutating the issue body.

- [ ] **Step 5: Implement persistence and replacement helpers**

Follow the audited codec and retry pattern in `reopened-close-recovery.mjs`. The replacement transaction must be:

```js
{
  schema: 'aitm.delivered-close/v1',
  transactionId: record.replacementTransactionId,
  issueNumber: authorization.issueNumber,
  acceptedSha: record.deliveryHeadSha,
  reviewAuthority: authorization.currentReviewAuthority,
  completedSteps: [],
}
```

Recognize the replacement by identity plus any canonical terminal-step prefix. Recognize the original only by exact full-value equality.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/false-delivery-close-recovery.test.mjs
```

Expected: all tests pass.

Commit:

```bash
git add scripts/task-tracker/lib/false-delivery-close-recovery.mjs scripts/tests/unit/task-tracker/lib/false-delivery-close-recovery.test.mjs
git commit -m "[#1635] feat: authorize false delivery close recovery"
```

### Task 2: Wire the explicit close mode

**Files:**

- Modify: `scripts/task-tracker/verbs/close.mjs`
- Create: `scripts/tests/unit/task-tracker/verbs/close-false-delivery-recovery-wiring.test.mjs`
- Modify: `scripts/tests/helpers/close-convergence-wiring-helpers.mjs`

**Interfaces:**

- Consumes: Task 1's authorizer, record resolver, renderer, progress classifier, and body replacement.
- Produces: `runFalseDeliveryCloseRecovery(args)` plus `verbClose` handling for `--restart-false-delivery-transaction --audit-issue N --recovery-issue N`.

- [ ] **Step 1: Write injected-boundary wiring tests**

Build production-shaped delivery records with the real builders. Assert `runFalseDeliveryCloseRecovery` sources:

```js
{
  acceptedSha: gate.gateInput.acceptedSha,
  testReceiptSha: gate.testReceiptSha,
  reviewApprovedSha: gate.recoveryReviewApprovedSha,
  verifiedDelivery: gate.receipt.verification.receiptInput,
}
```

Assert it reads the no-commit projection, audit deliverable, recovery issue marker, issue state reason, board state, disposition, dirty status, and binding ownership through injected live boundaries.

- [ ] **Step 2: Prove RED and implement the runner**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/close-false-delivery-recovery-wiring.test.mjs
```

Expected: failure because the runner/export is missing.

Implement evidence-first ordering: list/parse all evidence, authorize, resolve or create the immutable correction comment, re-read it, classify the body, replace through `mutateIssueBody`, then verify mutation readback.

- [ ] **Step 3: Add CLI flag and incompatibility tests**

Assert the new flag requires both positive issue-number flags and refuses combination with `--force`, `--repair`, `--restart-stale-transaction`, `--restart-reopened-transaction`, `--as`, or `--answer`. Assert ordinary close ignores the new code path.

- [ ] **Step 4: Integrate before ordinary close convergence**

When the target is OPEN and carries a completed transaction, call the new runner only under the explicit flag. Feed its zero-step replacement back into `decisionInput`, retain its durable record for outcome supersession and binding-release authorization, and then use the unchanged normal saga.

- [ ] **Step 5: Add interruption and idempotence tests**

Cover interruption after correction-comment creation, after body replacement, after timing, after board move, and after issue close. Every retry must reuse one recovery record and one replacement transaction and execute only the missing suffix.

- [ ] **Step 6: Run the focused close suite and commit**

Run:

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/false-delivery-close-recovery.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-false-delivery-recovery-wiring.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-reopened-recovery-wiring.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-delivered-idempotence.test.mjs
```

Expected: all tests pass.

Commit:

```bash
git add scripts/task-tracker/verbs/close.mjs scripts/tests/helpers/close-convergence-wiring-helpers.mjs scripts/tests/unit/task-tracker/verbs/close-false-delivery-recovery-wiring.test.mjs
git commit -m "[#1635] feat: restart false delivery close transactions"
```

### Task 3: Document and regress the public command contract

**Files:**

- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/help.test.mjs`
- Modify: `skill/shared/rules/close.md`
- Modify: `docs/guides/workflow.md`

**Interfaces:**

- Consumes: the exact CLI contract delivered by Task 2.
- Produces: discoverable help and operator rules that keep false-delivery recovery distinct from every other close mode.

- [ ] **Step 1: Add failing help/catalog assertions**

Assert usage includes all three new flags, examples name #1624/#1633/#1635, preconditions state the same-SHA or exact protected-base integration shape plus audit/no-commit/PR evidence, and effects state audit-first immutable replacement.

- [ ] **Step 2: Run help tests and confirm RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/help.test.mjs
```

Expected: missing flag/help assertions fail.

- [ ] **Step 3: Update help, rules, and workflow**

Document the human-only command, exact predicates, incompatibilities, retry contract, and historical-evidence preservation. Explicitly state that it is not a generic delivery backfill.

- [ ] **Step 4: Run docs checks and commit**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/help.test.mjs
npm run lint
npm run format:check
```

Expected: all commands exit 0.

Commit:

```bash
git add scripts/task-tracker/verbs/help-data.mjs scripts/task-tracker/lib/command-surface/catalog.mjs scripts/tests/unit/task-tracker/verbs/help.test.mjs skill/shared/rules/close.md docs/guides/workflow.md
git commit -m "[#1635] docs: define false delivery recovery contract"
```

### Task 4: Verify and deliver #1635 capability

**Files:**

- Modify only as required by failures in Tasks 1-3; keep any fix inside #1635.

**Interfaces:**

- Consumes: completed implementation and docs.
- Produces: exact tested #1635 SHA, governed PR, hosted checks, merge receipt, and trunk verification.

**Merged-receipt amendment:** When GitHub's `messageHeadline` truncates a long source
subject, delivery reconciliation derives the canonical first line from the already-fetched
full commit `message`. A focused adapter test must prove the full `[#1635]` token survives;
the truncated display field is never delivery authority.

- [ ] **Step 1: Run complete local verification**

Run:

```bash
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check origin/trunk...HEAD
```

Expected: every command exits 0.

- [ ] **Step 2: Drive #1635 through Test and Review**

Use `npx aitm test 1635`, verify every command-backed AC/DoD item at the exact head, run `npx aitm review 1635`, and require exact-SHA Agent Review evidence. Fix any finding in #1635 or stop for planning if it exceeds the stop condition.

- [ ] **Step 3: Deliver through the governed provider action**

Run `npx aitm deliver 1635`, execute only its emitted PR/push/merge action, verify hosted checks at the exact SHA, rerun `deliver` for the receipt, and confirm current `origin/trunk` contains the merged capability.

### Task 5: Deliver the preserved #1624 history through a protected-base integration head

**Files:**

- Do not modify files or rewrite existing commits on `feature/epic/1624`; add only the approved `--no-ff` merge of current `origin/trunk`.

**Interfaces:**

- Consumes: historical accepted head, current trunk, and the newly delivered recovery runtime.
- Produces: one exact two-parent integration head, updated governed PR, hosted checks, merge receipt, and trunk content preserving historical accepted SHA `2158a289...`.

- [ ] **Step 1: Recheck immutable preflight**

Run:

```bash
git rev-parse feature/epic/1624
git rev-list --left-right --count origin/trunk...feature/epic/1624
git merge-tree --write-tree --messages origin/trunk feature/epic/1624
git status --short
```

Expected: pre-integration head `2158a289a63b27b9b4d08b8701a16f0b9d3e805d`, no source changes, and a conflict-free merge tree.

- [ ] **Step 2: Create and publish the exact integration head**

Demote #1624 to Develop before changing its head. Merge current `origin/trunk` with `--no-ff`, verify the new commit has exactly `[2158a289..., pre-merge trunk]` as its ordered parents, and push without force. PR #1638 remains the single governed PR and updates to that integration head.

- [ ] **Step 3: Verify hosted checks and merge with merge-commit topology**

Require all configured checks on the integration head. Execute only the provider action emitted by `npx aitm deliver 1624` through the sanctioned connector, rerun `deliver` for the receipt, and verify current `origin/trunk` incorporates the source head.

- [ ] **Step 4: Record #1624's real delivery bundle**

Restore #1624 to OPEN/REOPENED Review through the documented recovery boundary, bind the preserved worktree, refresh exact-SHA Test/Review evidence at the integration head, and require one superseding intent plus correlated receipt for PR #1638.

### Task 6: Correct #1624 and close the audit recovery

**Files:**

- Update: `docs/audits/2026-09-15-done-delivery-14-day-survey.md` only if its live rerun evidence section requires a recovery result; do not rewrite the frozen population.

**Interfaces:**

- Consumes: completed false-delivery recovery capability and #1624's real delivery bundle.
- Produces: corrected #1624 terminal transaction, seven delivered audit classifications, and #1635 Done.

- [ ] **Step 1: Run the explicit false-delivery close correction**

Run:

```bash
npx aitm close 1624 --restart-false-delivery-transaction \
  --audit-issue 1633 --recovery-issue 1635
```

Expected: one immutable `aitm.false-delivery-close-recovery/v2` record naming both the historical and delivery heads, one completed replacement `aitm.delivered-close/v1` transaction at the delivered integration SHA, #1624 CLOSED/Done/Delivered, and preserved old records.

- [ ] **Step 2: Rerun the delivery audit against current trunk**

Run:

```bash
node scripts/maintenance/audit-done-delivery.mjs \
  --since 2026-09-01 \
  --snapshot 2026-09-15T14:17:57.000Z \
  --output .scratch/inspect/1635-post-recovery-audit.md
rg '^\| \[#(1624|1625|1626|1627|1628|1629|1630)\]' \
  .scratch/inspect/1635-post-recovery-audit.md
```

Expected: exactly seven rows and every row contains `**verified**`; none contains `false-Done` or `indeterminate`.

- [ ] **Step 3: Verify #1635 acceptance commands**

Run:

```bash
git rev-parse feature/epic/1624
git log origin/trunk --fixed-strings --grep='[#1624]' -1 --format=%H
gh issue view 1624 -R kburson/ai-task-manager --json state,body
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
```

Expected: all commands succeed and the issue/trunk evidence agrees.

- [ ] **Step 4: Post the #1635 deliverable and close**

Post one URL-bearing governed deliverable comment containing the #1635 capability PR/merge, #1624 PR/merge/intent/receipt, replacement transaction ID, and seven-row audit result. Drive #1635 through Test, Review, approval, and `/task close 1635`. Then confirm #1631's blocker list is clear before resuming it.
