# Plan Transition Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the exact authority used by every Plan-to-Develop transition so later exception revocation cannot erase historical governance and Full-Auto can converge from durable evidence.

**Architecture:** Introduce a strict immutable `aitm.plan-transition-authority/v1` GitHub record keyed by the existing move transition ID. Allocate that ID before guard execution, preserve the guard's final policy decision, and require record creation/read-back before board mutation. A separate reader joins the record to matching entry/sentinel evidence; `plan-approve` uses a completed modern waiver to select the existing evidence-repair path automatically while retaining explicit legacy repair.

**Tech Stack:** Node.js ESM, `node:test`, GitHub issue comments, canonical JSON/base64url marker codecs, existing AITM move-state saga and workflow-policy evaluator.

**Spec:** `docs/superpowers/specs/2026-09-19-1720-plan-transition-authority-design.md`

## Global Constraints

- Issue authority is #1720's User Story, Scope, Fix Direction, Acceptance Criteria, and governed Deep-Dive Analysis.
- `waived` never means `passed`; a disabled approval gate is `not-required`, not approval.
- A completed Plan-to-Develop move without durable authority is forbidden; an orphan authority intent does not prove completion.
- Current workflow policy remains prospective and fail-closed.
- Existing `aitm.transition-commit/v1` records and explicit #1716 `--repair-from-evidence` behavior remain backward compatible.
- Use strict TDD: each production behavior must first be demonstrated by a focused failing test.

## Story Intent

- **Beneficiary:** maintainer of governed lifecycle records
- **Capability:** retain durable authority for every Plan-to-Develop transition
- **Need:** exception revocation can erase the only visible historical authority
- **Value or failure prevented:** completed governed transitions remain auditable

---

## Implementation Tasks

### Task 1: Persist and verify transition-bound Plan authority

#### Story Intent

- **Beneficiary:** lifecycle audit maintainer
- **Capability:** identify the authority used for a Plan-to-Develop move
- **Need:** the guard currently discards its final typed policy decision
- **Value or failure prevented:** revocation cannot erase historical governance

#### Files

- Create: `scripts/task-tracker/lib/plan-transition-authority.mjs`
- Modify: `scripts/task-tracker/lib/move-state/guard-execution.mjs`
- Modify: `scripts/task-tracker/lib/move-state/move-state-core.mjs`
- Test: `scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs`

#### Interfaces

- Produces: `resolvePlanTransitionAuthority(input) -> frozen authority record`
- Produces: `renderPlanTransitionAuthorityComment(record) -> string`
- Produces: `parsePlanTransitionAuthorityComment(body) -> frozen authority record`
- Produces: `writePlanTransitionAuthority(ctx) -> { verified, commentId, record, body }`
- Produces: `classifyCompletedPlanTransitionAuthority({ record, issueBody }) -> { status, record, diagnostics }`
- Adds to movement context: `ctx.planTransitionAuthorityInput = { body, workflowPolicy, sessionPolicy, scopeIdentity }`
- Consumes: `createTransitionId`, `parsePlanApprovedMarker`, `resolveGate`, `parseEntryMarkers`, and `readMoveCompleteMarker`

- [ ] **Step 1: Write failing codec and resolver tests**

Create the test file with literal fixtures for the three truthful outcomes. Name the production regressions explicitly: dropping the waiver revision, relabeling a disabled gate as approval, accepting a wrong transition ID, and accepting malformed evidence.

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePlanTransitionAuthorityComment,
  renderPlanTransitionAuthorityComment,
  resolvePlanTransitionAuthority,
} from '../../../../task-tracker/lib/plan-transition-authority.mjs';

const TRANSITION_ID = 'move:11111111-1111-4111-8111-111111111111';
const RECORD_ID = '01JZZZZZZZZZZZZZZZZZZZZZZZ';
const SCOPE = `sha256:${'a'.repeat(64)}`;

test('waived authority preserves the exact exception revision and evaluated scope', () => {
  const workflowPolicy = {
    scopeIdentity: SCOPE,
    decision(id) {
      assert.equal(id, 'approval.plan');
      return {
        id,
        outcome: 'waived',
        authority: {
          recordId: RECORD_ID,
          revision: 2,
          reference: 'https://github.com/example/repo/issues/61#issuecomment-1',
          verificationLevel: 'github-author',
        },
      };
    },
  };

  const record = resolvePlanTransitionAuthority({
    repository: 'example/repo',
    issue: 61,
    transitionId: TRANSITION_ID,
    body: 'planned body',
    workflowPolicy,
    sessionPolicy: { gates: { analysisToDevelopment: true } },
    cfg: {},
    recordedAt: '2026-09-19T15:22:16.645Z',
  });

  assert.equal(record.outcome, 'waived');
  assert.equal(record.scopeIdentity, SCOPE);
  assert.deepEqual(record.evidence, {
    kind: 'workflow-exception',
    recordId: RECORD_ID,
    revision: 2,
    reference: 'https://github.com/example/repo/issues/61#issuecomment-1',
    verificationLevel: 'github-author',
  });
  assert.deepEqual(
    parsePlanTransitionAuthorityComment(renderPlanTransitionAuthorityComment(record)),
    record
  );
});

test('disabled approval gate is not represented as satisfied approval', () => {
  const record = resolvePlanTransitionAuthority({
    repository: 'example/repo',
    issue: 61,
    transitionId: TRANSITION_ID,
    body: 'planned body without approval marker',
    workflowPolicy: null,
    sessionPolicy: { gates: { analysisToDevelopment: false } },
    cfg: {},
    scopeIdentity: SCOPE,
    recordedAt: '2026-09-19T15:22:16.645Z',
  });
  assert.equal(record.outcome, 'not-required');
  assert.deepEqual(record.evidence, {
    kind: 'gate-policy',
    gate: 'analysisToDevelopment',
    required: false,
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs`

Expected: FAIL because `plan-transition-authority.mjs` does not exist.

- [ ] **Step 3: Implement the strict schema, resolver, and codec**

Use the repository's canonical JSON helpers and a closed evidence shape. Validation must reject unknown outcomes, invalid transition IDs, non-ULID waiver IDs, non-positive revisions, malformed scope hashes, invalid timestamps, and outcome/evidence mismatches.

```js
export const PLAN_TRANSITION_AUTHORITY_SCHEMA = 'aitm.plan-transition-authority/v1';

export function resolvePlanTransitionAuthority({
  repository,
  issue,
  transitionId,
  body,
  workflowPolicy,
  sessionPolicy,
  cfg,
  scopeIdentity,
  recordedAt = new Date().toISOString(),
} = {}) {
  const waived = workflowPolicy?.decision?.('approval.plan');
  const approved = parsePlanApprovedMarker(body);
  const required = resolveGate('analysisToDevelopment', {
    session: sessionPolicy,
    projectConfig: cfg || {},
  });

  if (waived?.outcome === 'waived') {
    return validateRecord({
      schema: PLAN_TRANSITION_AUTHORITY_SCHEMA,
      transitionId,
      repository,
      issue: Number(issue),
      source: 'plan',
      target: 'develop',
      requirementId: 'approval.plan',
      outcome: 'waived',
      scopeIdentity: workflowPolicy.scopeIdentity,
      recordedAt,
      evidence: {
        kind: 'workflow-exception',
        recordId: waived.authority?.recordId,
        revision: waived.authority?.revision,
        reference: waived.authority?.reference,
        verificationLevel: waived.authority?.verificationLevel,
      },
    });
  }
  if (approved)
    return satisfiedRecord({
      approved,
      body,
      repository,
      issue,
      transitionId,
      scopeIdentity,
      recordedAt,
    });
  if (!required)
    return notRequiredRecord({ repository, issue, transitionId, scopeIdentity, recordedAt });
  throw new TypeError('plan-transition-authority:approval-missing');
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `node --test scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs`

Expected: PASS for codec/resolver cases.

- [ ] **Step 5: Add failing completion and persistence-order tests**

Add tests that use the real resolver/codec and inject only comment transport and board mutation. Assert consumer-visible behavior, not mock existence:

```js
test('authority write failure prevents Plan-to-Develop board mutation', async () => {
  let boardWrites = 0;
  const result = await moveState(
    movementFixture({
      from: 'plan',
      to: 'develop',
      writeAuthority: async () => {
        throw new Error('readback mismatch');
      },
      writeStatus: async () => {
        boardWrites += 1;
        return { itemId: 'item-1', exit: null };
      },
    })
  );
  assert.equal(result.phase, 'authority');
  assert.notEqual(result.exit, null);
  assert.equal(boardWrites, 0);
});

test('orphan authority intent does not prove a completed transition', () => {
  const result = classifyCompletedPlanTransitionAuthority({
    record: waivedRecord,
    issueBody: '<!-- aitm-last-known-state: plan -->',
  });
  assert.equal(result.status, 'pending');
});
```

Also add an integration-shaped test whose issue body contains a matching `aitm-entered-develop` marker and `aitm-move-complete` sentinel; it must return `completed`. Changing either move ID to a literal different value must return `mismatch`.

- [ ] **Step 6: Run the focused test and confirm RED**

Run: `node --test scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs`

Expected: FAIL because movement does not allocate the transition ID before guards, does not persist authority, and has no completion classifier.

- [ ] **Step 7: Implement pre-status authority persistence and movement integration**

Move transition-ID allocation ahead of guard execution, but retain the existing completion probe before creating new evidence on an already-complete replay. Preserve the final Plan authority inputs in `guard-execution.mjs`, then fail closed in the saga before timing, entry, or board writes:

```js
ctx.transitionId = ctx.transitionId || createTransitionId();
const guard = await runGuardExecution(ctx);
if (guard.exit !== null && guard.exit !== undefined) return guardFailure(guard);

if (ctx.resolvedFromState === 'plan' && ctx.stateArg === 'develop') {
  try {
    ctx.planTransitionAuthority = await writePlanTransitionAuthority(ctx);
  } catch (error) {
    process.stderr.write(
      `⛔ #${ctx.issueArg} plan→develop authority was not durably verified: ${error.message}\n`
    );
    return {
      exit: PLAN_TRANSITION_AUTHORITY_EXIT,
      itemId: '',
      tail: { failures: [] },
      phase: 'authority',
      sentinelPresent: false,
      boardMoved: false,
    };
  }
}
```

The writer must reconcile ambiguous comment creation by listing records for the same transition ID. Exactly one exact record succeeds; zero or more than one fails closed.

- [ ] **Step 8: Run focused movement and existing saga tests**

Run: `node --test scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs scripts/tests/unit/task-tracker/lib/move-state-core.test.mjs scripts/tests/unit/task-tracker/lib/move-state-transition-commit.test.mjs`

Expected: PASS. If current filenames differ, use the repository's existing focused move-state core and transition-commit test files discovered with `rg --files scripts/tests/unit/task-tracker/lib | rg 'move-state|transition-commit'` and record the exact command in the commit message.

- [ ] **Step 9: Commit Task 1**

```bash
git add scripts/task-tracker/lib/plan-transition-authority.mjs \
  scripts/task-tracker/lib/move-state/guard-execution.mjs \
  scripts/task-tracker/lib/move-state/move-state-core.mjs \
  scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs
git commit -m "[#1720] fix: persist plan transition authority"
```

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs
```

### Task 2: Consume completed authority for automatic Full-Auto convergence

#### Story Intent

- **Beneficiary:** Full-Auto workflow operator
- **Capability:** converge approval from completed historical transition evidence
- **Need:** current consumers do not recognize modern transition authority
- **Value or failure prevented:** no human rubber stamp or rewritten waiver history

#### Files

- Modify: `scripts/task-tracker/lib/plan-approval-evidence-repair.mjs`
- Modify: `scripts/task-tracker/verbs/plan-approve.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs`
- Modify if the split core owns the behavior: `scripts/tests/unit/task-tracker/verbs/plan-approve-core.test.mjs`
- Modify: `scripts/task-tracker/test-impact-manifest.json`
- Modify: `docs/guides/workflow.md`

#### Interfaces

- Consumes: `classifyCompletedPlanTransitionAuthority({ record, issueBody })`
- Produces: modern repair evidence with `source: 'plan-transition-authority'`, historical outcome `waived`, transition ID, exception record ID, and revision
- Preserves: explicit `repairFromEvidence=true` legacy evaluation and audit fields

- [ ] **Step 1: Add the #61 revoke-after-transition failing test**

Build a literal comment corpus containing:

1. an active revision-2 workflow exception that waived `approval.plan`;
2. a matching `aitm.plan-transition-authority/v1` record with outcome `waived`;
3. matching Develop entry and move-complete markers in the issue body; and
4. a later revision-4 revocation.

Invoke `runPlanApprove` in Develop with explicit Full-Auto environment and no repair flag. Assert that the implementation selects evidence convergence, writes a Full-Auto repair marker/audit, and preserves the historical authority record as `waived`.

```js
test('completed waived transition auto-converges after prospective exception revocation', async () => {
  const result = await runPlanApprove({
    issueNumber: 61,
    cfg: CFG,
    projectDir: ROOT,
    deps: modernWaiverFixture({
      state: 'develop',
      env: { TT_FULL_AUTO: '1' },
      currentExceptionDisposition: 'revoked',
    }),
  });

  assert.equal(result.status, 'repaired-from-transition-authority');
  assert.equal(result.historicalOutcome, 'waived');
  assert.equal(result.transitionId, 'move:11111111-1111-4111-8111-111111111111');
  assert.equal(result.revokedRecordId, '01JZZZZZZZZZZZZZZZZZZZZZZZ');
});
```

Add companion cases proving human mode refuses, incomplete planning evidence refuses, mismatched scope refuses, an orphan authority refuses, and an explicit legacy repair fixture still returns `repaired-from-evidence`.

- [ ] **Step 2: Run plan-approval tests and confirm RED**

Run: `node --test scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs`

Expected: FAIL because ordinary invocation outside Plan returns `wrong-state` and modern authority is not collected.

- [ ] **Step 3: Extend evidence collection with modern completed authority**

Parse candidate authority comments, reject ambiguity, join the exact transition ID to issue-body completion evidence, compare the recorded scope identity with the current computed identity, and return a frozen modern evidence object. Keep the legacy workflow-exception/history evaluator unchanged for issues without modern records.

```js
export function evaluateModernPlanTransitionEvidence({
  body,
  authorityRecords,
  repository,
  issue,
} = {}) {
  const completed = authorityRecords
    .map((record) => classifyCompletedPlanTransitionAuthority({ record, issueBody: body }))
    .filter(({ status }) => status === 'completed');
  if (completed.length !== 1) {
    return { status: 'unavailable', blockers: ['plan-transition-authority-ambiguous'] };
  }
  const [{ record }] = completed;
  if (record.repository !== repository || record.issue !== Number(issue)) {
    return { status: 'unavailable', blockers: ['plan-transition-authority-scope'] };
  }
  return {
    status: 'available',
    source: 'plan-transition-authority',
    historicalOutcome: record.outcome,
    transitionId: record.transitionId,
    revokedRecordId: record.outcome === 'waived' ? record.evidence.recordId : null,
    authorityRevision: record.outcome === 'waived' ? record.evidence.revision : null,
  };
}
```

- [ ] **Step 4: Implement automatic selection without weakening legacy repair**

After reading state and body, select automatic repair only for explicit Full-Auto calls in Develop/Test/Review with exactly one completed modern `waived` authority record. Route it through the same planning/lifecycle and scope-drift predicates used by #1716. Return a distinct status and audit source so no output says the historical waiver passed.

Human calls, `satisfied`, `not-required`, pending/orphan, ambiguous, stale-scope, or incomplete evidence retain `wrong-state`/evidence refusal. Explicit `--repair-from-evidence` continues to use the legacy path when no modern record exists.

- [ ] **Step 5: Run focused plan approval and authority tests**

Run: `node --test scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs scripts/tests/unit/task-tracker/verbs/plan-approve-core.test.mjs`

Expected: PASS with the modern and legacy status assertions both intact.

- [ ] **Step 6: Update operator documentation and test-impact routing**

Document that Plan-to-Develop writes immutable typed authority before board mutation, that revocation is prospective, and that later Full-Auto convergence preserves the historical `waived` outcome. Add the new production module to the test-impact manifest with the focused authority and plan-approval tests.

- [ ] **Step 7: Run formatting, lint, and the complete required suites**

Run: `npm run format:check`

Run: `npm run lint`

Run: `npm test`

Run: `npm run test:slow`

Expected: every command exits 0. Review full output before stamping issue evidence.

- [ ] **Step 8: Commit Task 2**

```bash
git add scripts/task-tracker/lib/plan-approval-evidence-repair.mjs \
  scripts/task-tracker/verbs/plan-approve.mjs \
  scripts/task-tracker/test-impact-manifest.json \
  scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs \
  scripts/tests/unit/task-tracker/verbs/plan-approve-core.test.mjs \
  docs/guides/workflow.md
git commit -m "[#1720] feat: auto-converge plan approval evidence"
```

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs
npm test
npm run test:slow
```

## Self-review record

- Spec coverage: both historical transition validity and current-policy convergence are assigned to explicit tasks; ordinary approval, waiver, disabled-gate, revocation, retry/orphan, and legacy behavior all have named tests.
- Placeholder scan: no deferred implementation placeholders remain.
- Type consistency: `transitionId`, `scopeIdentity`, `outcome`, exception `recordId`/`revision`, and completed-authority statuses use the same names across producer and consumer tasks.
- Decomposition: two cohesive tasks preserve one transactional invariant and remain below the repository's plan split threshold.
