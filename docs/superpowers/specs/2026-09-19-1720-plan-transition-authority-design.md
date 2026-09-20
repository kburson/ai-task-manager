# Plan Transition Authority Design

## Problem

The Plan-to-Develop guard can accept `approval.plan` through a current workflow-exception waiver. That decision exists only on the in-memory guard context. After the guard passes, the movement saga records the entry marker, completion sentinel, and transition commit, but none identifies the policy outcome that authorized the move.

Revoking the exception is correctly prospective for current policy. However, because the completed transition carries no historical authority record, later consumers cannot distinguish an ungoverned transition from one that was legitimately waived when it occurred. Issue #1716 can reconstruct Full-Auto approval for legacy incidents, but retrospective recovery is not a safe normal write path.

## Goals

1. Every successful Plan-to-Develop move has durable, transition-bound authorization provenance.
2. Approval, waiver, and a disabled approval gate remain semantically distinct.
3. A waiver records the exact exception record, revision, authority, and scope identity used by the guard.
4. Exception revision or revocation cannot mutate historical transition provenance.
5. Current-policy checks remain prospective and fail closed.
6. Full-Auto can converge from sufficient durable evidence without asking a human to recreate machine-verifiable provenance.
7. Legacy #1716 repair remains supported.

## Non-goals

- Treating a waiver as a passed approval.
- Treating a disabled approval gate as approval.
- Weakening the current workflow-policy evaluator.
- Rewriting workflow-exception history.
- Migrating the historical issue corpus.
- Changing Plan Adjustment semantics.

## Existing flow

1. `move-state/guard-execution.mjs` runs the Plan exit guards.
2. When `plan-exit-plan-approved` refuses, it loads a workflow boundary and re-runs the guards.
3. `planApprovedGuard` returns success when `workflowPolicy.isWaived('approval.plan')` is true.
4. The successful `guardCtx.workflowPolicy` is discarded when `runGuardExecution` returns `{ exit: null }`.
5. `move-state-core.mjs` creates a transition ID only after guard execution, then writes lifecycle evidence and changes board state.
6. `transition-commit.mjs` records source, target, visit, actor, and sentinel fingerprint after the move, but not its authorization.

The defect is therefore an omitted persistence handoff, not a mistaken exception evaluation.

## Decision 1: A separate immutable authority-intent record

Add `aitm.plan-transition-authority/v1` as a canonical GitHub issue comment. It is written and read back after the guard passes but before any lifecycle or board mutation.

The record contains:

```js
{
  schema: 'aitm.plan-transition-authority/v1',
  transitionId: 'move:<uuid>',
  repository: 'owner/repo',
  issue: 1720,
  source: 'plan',
  target: 'develop',
  requirementId: 'approval.plan',
  outcome: 'satisfied' | 'waived' | 'not-required',
  scopeIdentity: 'sha256:<hex>',
  recordedAt: '<ISO-8601>',
  evidence: { /* outcome-specific closed shape */ }
}
```

Outcome evidence is closed and strict:

- `satisfied`: parsed approval mode and timestamp plus a fingerprint of the exact `aitm-plan-approved` marker.
- `waived`: workflow-exception record ID, revision, authority reference, verification level, and the evaluated scope identity.
- `not-required`: the `analysisToDevelopment` gate name and `required: false`. This is not approval evidence.

The record is an authority intent until matching completed-transition evidence exists. An orphan created before a failed board move is durable diagnostic evidence but cannot prove the transition occurred.

## Decision 2: Allocate transition identity before guard execution

`moveState` allocates the transition ID before invoking the guard pipeline. The same identity is then used by:

- the Plan authority record;
- timing rows;
- the Develop entry marker;
- the move-complete sentinel; and
- the transition commit.

A refused move may consume an unused UUID. This has no semantic effect because no completion evidence names it.

## Decision 3: Fail closed before board mutation

For Plan-to-Develop only, the movement saga resolves the authority outcome and creates the immutable comment before emitting lifecycle rows, stamping entry evidence, or writing board status. The writer must read back the exact body, parse it, and confirm the transition identity.

If creation, read-back, parsing, or identity verification fails, the saga returns a non-zero authority phase result. No board mutation occurs.

This ordering chooses the safe partial-failure direction:

- authority record without completed move: harmless orphan, ignored by completion consumers;
- completed move without authority record: forbidden.

## Decision 4: Preserve the guard's exact decision

`runGuardExecution` copies only the Plan authority inputs needed by the writer onto the movement context after the final guard run:

- the locked issue body;
- session and project gate policy;
- the workflow boundary, when one was loaded; and
- the boundary scope identity.

The authority resolver does not query workflow policy again. Re-querying would introduce a time-of-check/time-of-write race in which a revision between the guard and writer could change the recorded authority.

For `satisfied`, the resolver requires the valid marker that made the guard pass. For `waived`, it requires the exact typed `waived` decision. When the approval gate is disabled, it emits `not-required`; it never manufactures `satisfied`.

## Decision 5: Completed authority is a join, not a mutable flag

Historical verification joins the immutable authority record to the issue body's matching transition evidence. At minimum:

- a Develop entry marker names the same transition ID; and
- the latest applicable move-complete sentinel names the same transition ID and state.

The transition commit may strengthen diagnostics but is not required because its existing write is best-effort. This design does not weaken or change the v1 transition-commit contract.

An authority record with no matching completed transition is `pending`, not authorized completion. A mismatched source, target, repository, issue, scope, or transition identity fails closed.

## Decision 6: Revocation is prospective

The live workflow-policy evaluator remains unchanged. A revoked or revised exception no longer waives a future gate. The immutable historical record still says the completed move used `waived`, with the exact revision that was active at the boundary.

Readers must expose these as different questions:

- Was this historical transition governed when it occurred?
- Does the issue satisfy current approval policy now?

The first reads completed transition authority. The second reads current policy and current approval evidence.

## Decision 7: Automatic Full-Auto convergence

When `plan-approve` is invoked in Develop, Test, or Review under explicit Full-Auto authority without `--repair-from-evidence`, it may automatically select evidence repair only when it finds a completed modern `waived` Plan transition authority record.

The existing #1716 evidence predicates remain mandatory: complete planning/lifecycle evidence, compatible scope, valid exception lineage, and no semantic scope drift. The modern record supplies transition-bound proof of the historical waiver; it does not itself create approval.

On success, the new approval is recorded as evidence-derived Full-Auto convergence while the historical transition authority remains `waived`. Human mode and insufficient evidence keep their existing refusal behavior. Explicit `--repair-from-evidence` remains the legacy route for transitions predating the new record.

## Failure and retry semantics

- Comment transport ambiguity is reconciled by listing and parsing records for the transition ID before retrying creation.
- Exact duplicates for one transition ID are an ambiguity and fail closed.
- A failed pre-status attempt may leave an orphan record. A later attempt receives a new transition ID and does not reuse the orphan.
- A post-status replay obtains the completed transition ID from existing lifecycle evidence and does not create a second authority outcome.
- Malformed records are ignored as candidates and surfaced as diagnostics when they collide with the requested transition identity.

## Verification strategy

The focused authority tests exercise real codecs and movement sequencing with external GitHub operations injected at the transport boundary. They prove:

1. approval produces `satisfied`;
2. an exact waiver produces `waived` with record/revision/scope binding;
3. a disabled gate produces `not-required`;
4. persistence failure prevents board mutation;
5. revocation changes current policy but not historical authority;
6. orphan authority does not prove completion; and
7. matching entry/sentinel evidence does.

Plan-approval tests prove automatic modern convergence, human-mode refusal, incomplete-evidence refusal, and unchanged explicit legacy repair.
