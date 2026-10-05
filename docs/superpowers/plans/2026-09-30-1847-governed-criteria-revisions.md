# Governed criteria revisions implementation plan — #1847

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. The registered decomposition gate requires sanctioned children under #1847 before implementation.

**Goal:** Deliver a reasoned, exactly authorized criteria-revision command that retires stale current proof, preserves history, and safely recovers interrupted corrections.

**Architecture:** A closed deterministic proposal describes every resource change. A GitHub event chain owns transaction authority; a strict common-directory interlock serializes cooperative local writers, and a local deny-before-effect projection controls per-tool-call admission. Legacy and canonical adapters share this transaction protocol while retaining different proof-preservation rules.

**Tech Stack:** Node.js ESM, built-in node:test, existing GitHub comment/envelope transport, existing AITM lifecycle and body mutation APIs; no new production dependency.

**Spec:** `docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md` at `3bb590b5702754f4d222ce43262291083eb28b99`.

## Global constraints

- Preserve normal marker, checkbox, proof-introduction, section, ownership, stage and delivery guards.
- Mutation request schema is `aitm.criteria-revision/v1`; proposal modes are exactly revision, resume, abort and forward-repair.
- Approval is one exact raw human user-message block, never forwarded agent text, normalized substring, Full-Auto inference or an old proposal approval.
- Revision event comments have a complete rendered 60,000 UTF-8-byte ceiling; never truncate archives.
- Both host session and message IDs are bounded at 256 ASCII bytes.
- One cooperative registered host/common-directory domain; independent clones, cross-host writers and mixed unsupported writers refuse.
- Pending or uncertain transactions fail closed. No rollback resurrects retired proof.
- Keep #124 live criteria and #1841 review records untouched. Use fixtures.
- Existing interrupted XPR evidence and installed verified APR build remain preserved.
- Normal GitHub lifecycle gates remain required. No implementation before child Plan/Develop admission and posted/mirrored deep dive.
- Tasks 1–4 expose no reachable CLI, registered action, public API export or enabled workflow route to transaction mutation. Each child tests this absence against command/action/export catalogs. Task 5 installs all fences before Task 6 registers the first production mutation entrypoint; child merges cannot expose partial unsafe behavior.

## Scope and accepted Refine decisions

Implement the complete accepted specification, including canonical amendment persistence, canonical Plan approval, bounded Develop revision reapproval, full-chain gate validation, and shared local hook admission. The operator bootstrap is `aitm criteria-revise enable`: explicitly register the runtime-derived common-directory writer domain and perform authoritative admission refresh. It is default-disabled and cannot silently run from installation, prepare or bind. Domain movement/disabling while a revision is pending refuses.

The Refine evidence report is `docs/superpowers/reviews/1847/2026-09-30-1847-refine-evidence.md`. The measured #124 archive fixture plus a 16,000-byte proposal reserve is 42,141 bytes; production prepare must still measure its complete concrete rendering. Criteria-only Test/Review replanning is unsupported; normal truthful code-rework demotion remains necessary there. Actual Codex user records have host-issued message IDs and raw input_text blocks, but the existing loader's trimming must not establish raw equality.

## Plan metadata

- **Parent issue:** #1847
- **Priority:** P1
- **Size:** XL
- **Rough necessary human estimate:** 48 hours
- **Labels:** bug
- **Decomposition:** mandatory; registered decompose-check returned must-split at 48h versus 24h threshold.
- **Delivery:** all six child units must integrate under #1847; a partial utility or plan is not parent completion.
- **Sequence:** 1 → 2 → 3 → 4 → 5 → 6. Later tasks consume named interfaces, not copies or divergent implementations.

## Story Intent

- **Beneficiary:** delivery owner
- **Capability:** revise obsolete acceptance criteria through an exactly authorized, recoverable operation
- **Need:** approved requirement changes can contradict protected verifier declarations and prior proof
- **Value or failure prevented:** corrected delivery can be verified without proof laundering, history loss or lifecycle bypass

## Acceptance criteria coverage

| Parent obligation                                                         | Delivering tasks |
| ------------------------------------------------------------------------- | ---------------- |
| Authorized #124-shaped correction with unchecked replacement declarations | 1, 3, 6          |
| Durable attributable archive and declaration/proof distinction            | 1, 3, 4          |
| Precise current-proof retirement and fresh lifecycle approval             | 3, 4, 5          |
| Stale/foreign/ambiguous input refusal and exact crash recovery            | 1, 2, 3, 4, 6    |
| Ordinary invariants and no generic bypass/stage skip                      | 2, 3, 5, 6       |
| Help, Explain, supported recovery and normal verification                 | 5, 6             |

## Concrete producer/consumer inventory

| Surface                | Exact baseline entry points                                                                                                                                                                                                                                                               | Required integration                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body authority         | `lib/issue-body-mutate.mjs::mutateIssueBody`, `lib/versioned-issue-write.mjs::versionedWriteBody`, compatibility `lib/issue-body-push.mjs`                                                                                                                                                | Guard low-level direct paths as well as wrapper; exact internal retirement capability; all ordinary invariants retained.                                             |
| Existing lock owners   | `issue-mutator-lock.mjs::withIssueLock`; promote, reconcile, approve, test, assign/unassign, pull-next, shelve, cancel-plan, action-ledger, estimation/record-claim, draft-branch; `lib/repository-adapter.mjs::withBoundaryLock`                                                         | Strict common-directory interlock must be outermost; determine multi-issue lock set before acquisition.                                                              |
| Body-producing helpers | deep-dive/markers/state-recording, verification-receipt-retirement, functional-dod-derive, evidence-v2/runtime-adapter, estimation/runtime-adapter, resident-action-ledger-write, shelve-transaction, discuss markers, close-disposition; scaffold-web-issue/log-issue-time/epic-metadata | Enumerate through shared body chokepoint and direct-import/call audit; timing/history-only content must not be mistaken for current semantic authority.              |
| Canonical authority    | `github-records/contract-write.mjs::writeDirectoryContractOperation`, `capsule-chain.mjs::appendCapsule`, lifecycle-transition, adopt-github-records, singleton-initializer                                                                                                               | Interlock before pre-write reads; exact grant/epoch/revision; update/read-back projections; cover direct capsule/projection routes.                                  |
| Comment semantics      | github-comment-store create/update and owned-comment upsert                                                                                                                                                                                                                               | Authority-bearing writers require semantic capability; unrelated historical/timing comments do not acquire false current authority and are not unnecessarily fenced. |
| Projection repair      | `github-records/projection-repair.mjs::repairIssueProjections`, lifecycle-transition authority, reconciliation/adoption                                                                                                                                                                   | Existing durable transition capability plus revision fence/interlock; no synthesized fence clearance or epoch rollback.                                              |
| Plan                   | plan-approve, story-approval-binding-guard, plan-transition-authority, action-decision Plan guards                                                                                                                                                                                        | Shared fresh source validation plus current revision/digest and real canonical persistence.                                                                          |
| Proof/Test             | ac-stamp, dod-stamp/check, evidence-v2 eligibility/subject/runtime-adapter, develop-exit-receipt-guard, Develop finalization, verification receipt parsing                                                                                                                                | Pending fence; subject/command/revision binding; only exact legacy preserved-individual exception.                                                                   |
| Review/completion      | Review projected guards/exact Test receipt/functional DoD; approve; deliver verification/authority; close delivery/review/projections; canonical lifecycle-gate-source                                                                                                                    | Shared complete chain observation and fresh current authority; reject pre-revision aggregate proof.                                                                  |
| Local activity/session | activity-guard, source-edit-gate, bind/reconcile, resident-action-runner and delegated ledger paths                                                                                                                                                                                       | Read atomic shared admission on each local mutation; refresh under strict interlock at bind/gates; no GitHub request on every edit.                                  |

Paths in this table are under `scripts/task-tracker/` unless identified as
GitHub scaffolding. Tests must exercise the real adapters with effect spies.
A source walker/import-call audit checks coverage against concrete root seams,
ignoring comment text and fixture pseudo-calls. Listing command names alone is
not sufficient. Task 5 owns closing any discovered direct path before enablement
can report ready.

## Shared interfaces

`RevisionObservation` is a closed value containing repository, issue,
writerDomain, stage, delivery state, source kind, exact body/version, canonical
contract/capsule/grant when present, protected source bindings, and completely
paginated revision records. `RevisionProposal` is the exact closed shape in the
specification. `RevisionStatus` is one of absent, pending-before,
pending-prefix, pending-after, applied, aborted, conflict or indeterminate,
with the observed resource vector and current effective operation.

All I/O is injected at module boundaries through named dependencies: readIssue,
readAuthority, listRevisionComments, createRevisionComment, readComment,
writeBody, writeCanonical, loadUserMessage, now, and getExecutor. Production
adapters invoke existing sanctioned transports; unit fakes record ordered effects
and never reach GitHub. Unknown or partial results are not normalized to absence.

## Implementation tasks

### Task 1: 🐞 [BUG] Seal exact proposals, evidence identities and human authorization

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** inspect and approve the exact contract correction and invalidation before mutation
- **Need:** caller-controlled proof, ambiguous criteria and loosely matched approvals can authorize unintended changes
- **Value or failure prevented:** only the intended correction receives attributable authority

#### Delivery steps

**Estimate:** 6 human hours. **Depends on:** none.

**Files:** create `scripts/task-tracker/lib/criteria-revision/schema.mjs`,
`proposal.mjs`, `authorization.mjs` in that directory; create
`scripts/tests/fixtures/criteria-revision.mjs` and unit tests
`scripts/tests/unit/task-tracker/lib/criteria-revision/schema.test.mjs`,
`proposal.test.mjs`, `authorization.test.mjs`.
Inspect and reuse `acceptance-criteria.mjs`, `ac-evidence.mjs`,
`workflow-policy/authority-resolver.mjs`, and record-envelope canonical JSON;
modify `scripts/task-tracker/lib/workflow-policy/authority-resolver.mjs` to export
`loadRawCodexUserMessage({sessionId,messageId})`. Return the original record ID,
role and unmodified content blocks; preserve its trusted transcript resolution and
injection classification. Existing normalized loader callers remain unchanged.
The new authorization adapter requires exactly one original input_text block.

**Interfaces:** export validateRevisionRequest(value), deriveProposal({observation,
edits,reason,mode,priorTransaction,executor,operationId,transactionId}),
hashSemanticContract(definitions), renderApprovalStatement(proposal), and
resolveRevisionAuthorization({proposal,authorizationSource,loadUserMessage}).
Fixture exports makeLegacyRevisionFixture() and makeCanonicalRevisionFixture()
return full observations, context, declaration-only edits, deterministic IDs, canonical contract/grant/proposal and current/old revision-bound approval payloads,
valid synthetic requests/resumeRequests, and fake raw user-message observations
for injected unit tests. The
fixtures contain no production human approval.

- [ ] Write failing tests for closed nested keys, duplicate sections/identities,
      ambiguous occurrences, missing VC roots, malformed declarations, shared-VC
      dependency retirement, and rejection of supplied proof or arbitrary body text.
      A representative real test shape is:

  ```javascript
  const { observation, edits } = makeLegacyRevisionFixture();
  const proposal = deriveProposal({
    observation,
    edits,
    reason: 'Replace obsolete model hooks',
    mode: 'revision',
    priorTransaction: null,
    executor: observation.executor,
    operationId: 'op-1',
    transactionId: 'tx-1',
  });
  assert.equal(proposal.observedResourceVector, null);
  assert.equal(
    proposal.invalidation.some(
      (item) => item.kind === 'plan-approval' && item.disposition === 'retired'
    ),
    true
  );
  assert.throws(() =>
    validateRevisionRequest({
      schema: 'aitm.criteria-revision/v1',
      action: 'apply',
      proposal,
      authorizationSource: {},
      allowMarkerLoss: true,
    })
  );
  ```

- [ ] Run the unit command below and confirm missing exports or unmet assertions fail.
- [ ] Implement canonical hashing and complete identity maps. Exclude execution
      properties/checkboxes from semantic digests while separately binding their
      exact archived bytes. Replacement IDs derive from transaction and ordinal;
      no normalized-label IDs or implicit resurrection.
- [ ] Validate authorization against exactly one original raw user input_text
      block and host-issued message ID. Retain injection filtering, exact executor,
      256-byte ID bounds, and whole-message byte equality. Refuse surrounding spaces,
      multiple blocks, unsupported hosts, assistant/tool/forwarded content, missing
      raw observations, mismatched mode or recovery-vector digest.
- [ ] Run all three focused files green and commit only this child's files under
      its sanctioned issue ID. Preserve public invariants; no executable mutation
      command exists yet.

**Verification Commands:**

Run: `node --test scripts/tests/unit/task-tracker/lib/criteria-revision/schema.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/proposal.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/authorization.test.mjs`

### Task 2: 🐞 [BUG] Serialize the registered writer domain and local activity admission

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** prevent linked worktrees from concurrently mutating a corrected contract or using stale approval
- **Need:** worktree-local locks and cached activity state cannot coordinate a shared issue safely
- **Value or failure prevented:** one writer's revision cannot be bypassed by another worktree's stale permission

#### Delivery steps

**Estimate:** 8 human hours. **Depends on:** Task 1.

**Files:** create `scripts/task-tracker/lib/criteria-revision/interlock.mjs`,
`admission.mjs`, `domain.mjs`; create focused tests
`scripts/tests/unit/task-tracker/lib/criteria-revision/interlock.test.mjs`,
`admission.test.mjs`, `domain.test.mjs` (pure injected-fs/process logic only);
create `scripts/tests/integration/task-tracker/lib/criteria-revision-interlock.test.mjs`
for real linked worktrees, sibling processes, subprocess delegation and holder
liveness. No unit file or transitive fixture may import a Git sandbox or spawn
git/node; preserve `scripts/tests/unit/meta/unit-lane-purity.test.mjs` unchanged.
Modify `scripts/task-tracker/issue-mutator-lock.mjs` only for explicit ordering
and delegation integration; keep ordinary disabled-domain behavior unchanged.

**Interfaces:** export registerRevisionDomain({repository,commonDir,host,
quiescenceConfirmed}), resolveRevisionDomain(context),
withRevisionInterlock({repository,issues,domain,executor},fn),
assertRevisionCapability(capability,context),
publishAdmission({capability,observation,state}), readAdmission(context), and
refreshAdmission({context,observe}). The interlock passes a non-public capability
to fn. A serializable environment flag cannot mint one.

- [ ] In the new integration file, write red tests with two real temporary linked worktrees sharing one common
      directory, sibling async calls, inherited fake flags, dead/live/unknown holder
      liveness, multiple-issue ordering and symlink/path normalization.

  ```javascript
  await withRevisionInterlock(context, async (capability) => {
    await publishAdmission({ capability, observation, state: 'deny' });
    assert.equal(readAdmission(secondWorktreeContext).state, 'deny');
    await assert.rejects(competingWriter(), new RegExp('revision-lock-held'));
  });
  ```

- [ ] Run the focused command and observe the expected failures.
- [ ] Implement owner-only atomic directory acquisition and holder identity.
      Never reclaim by age; reclaim only a proved-dead unchanged local holder.
      Acquire sorted strict interlocks before existing issue/resource locks;
      descendants reuse a real capability and siblings contend.
- [ ] Implement atomic per-issue admission files under the common directory.
      Missing/corrupt/version-mismatched/dirty/domain-mismatched state denies.
      Bind/gates refresh under the interlock from full remote authority; unavailable
      reads write deny. Domain restart invalidates admission until refreshed.
- [ ] Unit-test pending-domain move/disable refusal through `resolveRevisionDomain`
      and registration policy with injected observations; integration-test that
      neither an independent clone nor another host can register the same domain.
- [ ] Prove a never-revised allow requires verified empty-chain observation, not
      body pointer absence, and an old allow cannot overwrite a newer deny.
- [ ] Run green and commit the child slice.

**Verification Commands:**

Run: `node --test scripts/tests/unit/task-tracker/lib/criteria-revision/interlock.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/admission.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/domain.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-interlock.test.mjs scripts/tests/unit/meta/unit-lane-purity.test.mjs`

### Task 3: 🐞 [BUG] Apply and recover archived legacy revisions through one event chain

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** correct legacy criteria with a durable archive and recover interrupted writes
- **Need:** ordinary body replacement cannot retire protected obsolete declarations or distinguish uncertain partial application
- **Value or failure prevented:** corrected criteria remain auditable without duplicated writes, lost history or revived proof

#### Delivery steps

**Estimate:** 10 human hours. **Depends on:** Tasks 1 and 2.

**Files:** create `scripts/task-tracker/lib/criteria-revision/records.mjs`,
`store.mjs`, `reducer.mjs`, `legacy.mjs`, `engine.mjs`;
modify `scripts/task-tracker/lib/issue-body-mutate.mjs` and
`versioned-issue-write.mjs` for the exact internal transaction capability;
create unit tests `records.test.mjs`, `reducer.test.mjs`, `legacy.test.mjs`
under the new unit directory and
`scripts/tests/integration/task-tracker/lib/criteria-revision-recovery.test.mjs`.

**Interfaces:** export renderRevisionEvent(event), readRevisionChain({context,
transport}), reduceRevisionEvents(events), deriveLegacyWrites(proposal),
observeRevision({context,deps}), prepareRevision({context,input,deps}),
applyRevision({context,request,deps}), and recoverRevision({context,request,deps}).
prepare returns proposal, exact approval statement, complete rendering and size;
apply/recover return a typed verified status or refusal without optimistic success.

- [ ] Write red tests for duplicate IDs/different bytes, forks, missing pages,
      incomplete archives, exact-cap/over-cap Unicode events, lost reads and each
      legal/illegal transition. Preserve every actual required byte, not just hashes.

  ```javascript
  const scenario = makeLegacyRevisionFixture();
  const { context, request, resumeRequest } = scenario;
  const deps = createRecordedTransport(scenario);
  deps.failAfter = 'body-write';
  await assert.rejects(applyRevision({ context, request, deps }), new RegExp('interrupted'));
  const pending = await observeRevision({ context, deps });
  assert.equal(pending.status, 'pending-after');
  const terminal = await recoverRevision({ context, request: resumeRequest, deps });
  assert.equal(terminal.status, 'applied');
  assert.equal(deps.createdEvents.filter((e) => e.type === 'prepared').length, 1);
  ```

  Implement createRecordedTransport in the integration test itself with an
  in-memory comment list, body, effect log, and injected failAfter step; every
  read returns a deep clone and every write/read-back has an explicit seam.

- [ ] Run the focused command red.
- [ ] Publish deny before remote preparation. Append/read back prepared, validate
      unique chain head, apply deterministic legacy write set, verify complete
      after-state, append/read back applied. Event identity is fixed before retries.
- [ ] Retire changed/shared-dependent proof, aggregate evidence and approvals;
      preserve unaffected individual proof only with exact event-backed disposition
      and all dependency bindings. New ACs are unchecked declarations.
- [ ] Implement resource-vector prefix recovery, current effective operation,
      new executor approval, untouched abort, and authorized forward repair.
      Original-session retry does not mint a new proposal. Never reverse retired proof.
- [ ] Add internal capability validation at both body mutation layers: exact
      allowed retirements/resets only; existing ordinary callers cannot request it.
      Test generic marker-loss, forged proof and unrelated section removal still fail.
- [ ] Run green across focused tests plus existing issue-body guard tests; commit.

**Verification Commands:**

Run: `node --test scripts/tests/unit/task-tracker/lib/criteria-revision/records.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/reducer.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/legacy.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-recovery.test.mjs scripts/tests/unit/task-tracker/verbs/issue-body.test.mjs scripts/tests/unit/task-tracker/lib/mutate-issue-body-marker-loss.test.mjs`

### Task 4: 🐞 [BUG] Amend canonical contracts and record current revision Plan approval

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** revise canonical contracts and obtain fresh approval against their new epoch
- **Need:** canonical amendment is currently a pure helper and Plan approval refuses directory authority
- **Value or failure prevented:** corrected canonical work cannot retain old accepted records or become stranded without legitimate approval

#### Delivery steps

**Estimate:** 8 human hours. **Depends on:** Tasks 1–3.

**Files:** create `scripts/task-tracker/lib/criteria-revision/canonical.mjs`,
`plan-approval.mjs`; modify the shared
`scripts/task-tracker/lib/criteria-revision/engine.mjs`, `reducer.mjs`, and
`store.mjs` to own canonical dispatch, status classification and recovery through
the existing `applyRevision`, `observeRevision` and `recoverRevision` exports;
modify
`scripts/task-tracker/lib/github-records/contract-write.mjs`,
`delivery-contract.mjs`, `record-envelope.mjs`, `capsule-chain.mjs`,
`scripts/task-tracker/verbs/plan-approve.mjs`, and
`scripts/task-tracker/lib/plan-approved-guard.mjs`;
create `canonical.test.mjs`, `plan-approval.test.mjs` in the new unit directory,
and `scripts/tests/integration/task-tracker/lib/criteria-revision-canonical.test.mjs`.

**Interfaces:** export deriveCanonicalWrites({proposal,contract,grant}),
applyCanonicalRevision({capability,proposal,deps}),
validateRevisionPlanApproval(payload,observation), and
approveCurrentRevision({context,observation,planningEvidence,provenance,deps}).
Register `aitm.plan-approval-binding/v1` payload exactly as specified.
Use existing amendment validation and capsule ordering rather than custom
canonical contract reconstruction.

- [ ] Red-test draft and sealed amendments, full proof/accepted-record reset,
      grant expiry/replacement, capsule-before-projection interruption, and
      exact source/revision/contract/authority epoch approval binding.

  ```javascript
  const { proposal, contract, grant, observation, validApproval, oldRevision } =
    makeCanonicalRevisionFixture();
  const amended = deriveCanonicalWrites({ proposal, contract, grant });
  assert.equal(amended.after.contractEpoch, contract.contractEpoch + 1);
  assert.deepEqual(amended.after.acceptedRecordIds, []);
  assert.throws(
    () => validateRevisionPlanApproval({ ...validApproval, revisionId: oldRevision }, observation),
    new RegExp('binding')
  );
  ```

  This assertion checks binding against current authority, not merely payload shape.

- [ ] Red-test each canonical recovery row through shared `recoverRevision`:
      capsule-present/contract-before resumes only projections, contract-after/body-before
      resumes only the remaining deterministic writes, and expired/replaced/revoked
      grants refuse `revision-authority-unavailable` with zero new authority effects.
      Verify capsule → contract projection → other projections → body ordering and
      fail/read-back seams at every prefix. `applyCanonicalRevision` is an adapter
      invoked only by the shared engine, never a second transaction orchestrator.
- [ ] Run the focused command red.
- [ ] Add semantic-amendment persistence using appendCapsule and exact projection
      read-back. Preserve draft/sealed status and existing coordinator authorization.
      A revoked grant cannot be repaired by rewriting coordinator fields.
- [ ] Separate common Plan checks from authority persistence. Canonical writes
      registered approval capsule and accepted-record projection; legacy writes
      revision/digest-bound supported marker/record. Body markers are projections.
- [ ] Permit bounded Develop reapproval only for latest verified applied revision
      with no pending transaction and fresh normal planning/source/provenance checks.
      No old-evidence repair, fictitious Plan visit, blanket later-stage admission or
      automatic approval of a criteria proposal.
- [ ] Prove real adapters (not seeded approval stubs) take revised legacy and
      canonical fixtures through fresh approval; run green and commit.

**Verification Commands:**

Run: `node --test scripts/tests/unit/task-tracker/lib/criteria-revision/canonical.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/plan-approval.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-canonical.test.mjs`

### Task 5: 🐞 [BUG] Enforce revision fences across all writers and lifecycle consumers

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** prevent ordinary writers and lifecycle gates from bypassing pending revision or stale approval
- **Need:** correct transaction code alone cannot protect independent stampers, repairs, hooks and delivery paths
- **Value or failure prevented:** no alternate route can launder retired evidence or continue unapproved code work

#### Delivery steps

**Estimate:** 10 human hours. **Depends on:** Tasks 1–4.

**Files:** create `scripts/task-tracker/lib/criteria-revision/policy.mjs` and
`coverage.mjs`; modify concrete chokepoints
`scripts/task-tracker/issue-mutator-lock.mjs`,
`scripts/task-tracker/lib/versioned-issue-write.mjs`,
`scripts/task-tracker/lib/github-records/contract-write.mjs`,
`scripts/task-tracker/lib/github-records/capsule-chain.mjs`,
`scripts/task-tracker/activity-guard.mjs`,
`scripts/task-tracker/source-edit-gate.mjs`,
`scripts/task-tracker/verbs/start.mjs`, `scripts/task-tracker/verbs/resume.mjs`,
`scripts/task-tracker/lib/bind-context.mjs`, `scripts/task-tracker/lib/bind-event.mjs`,
`scripts/task-tracker/lib/worktree-binding-lifecycle.mjs`,
`scripts/task-tracker/verbs/ac-stamp.mjs`, `plan-approve.mjs`, `test.mjs`,
`approve.mjs`, `demote.mjs`, `deliver.mjs`, `close.mjs`,
`scripts/gh/move-state.mjs`;
`scripts/task-tracker/verbs/promote.mjs`, `scripts/task-tracker/verbs/review.mjs`,
`scripts/task-tracker/verbs/dod-stamp.mjs`, `scripts/task-tracker/verbs/check.mjs`,
`scripts/task-tracker/verbs/reconcile.mjs`, `scripts/task-tracker/verbs/adopt-github-records.mjs`;
`scripts/task-tracker/lib/github-records/lifecycle-transition.mjs`,
`scripts/task-tracker/lib/github-records/projection-repair.mjs`,
`scripts/task-tracker/lib/github-records/singleton-initializer.mjs`,
`scripts/task-tracker/lib/github-records/lifecycle-gate-source.mjs`;
`scripts/task-tracker/lib/evidence-v2/eligibility.mjs`,
`scripts/task-tracker/lib/evidence-v2/subject.mjs`,
`scripts/task-tracker/lib/evidence-v2/subject-inputs.mjs`,
`scripts/task-tracker/lib/evidence-v2/runtime-adapter.mjs`;
`scripts/task-tracker/lib/develop-exit-receipt-guard.mjs`,
`scripts/task-tracker/lib/develop-exit-code-complete-guard.mjs`,
`scripts/task-tracker/lib/verification-receipt.mjs`,
`scripts/task-tracker/lib/verification-receipt-retirement.mjs`,
`scripts/task-tracker/lib/functional-dod-derive.mjs`,
`scripts/task-tracker/lib/story-approval-binding-guard.mjs`,
`scripts/task-tracker/lib/plan-transition-authority.mjs`,
`scripts/task-tracker/lib/review-exit-review-approved-guard.mjs`,
`scripts/task-tracker/lib/review-exit-close-gates-guard.mjs`,
`scripts/task-tracker/lib/action-decision/observations.mjs`,
`scripts/task-tracker/lib/action-decision/promote.mjs`,
`scripts/task-tracker/lib/action-decision/test.mjs`,
`scripts/task-tracker/lib/action-decision/review.mjs`,
`scripts/task-tracker/lib/action-decision/deliver.mjs`,
`scripts/task-tracker/lib/action-decision/close.mjs`, and
`scripts/task-tracker/lib/action-decision/session.mjs`. Register policy at the
actual action/guard catalog rather than shell command-name matching.
Create `policy.test.mjs` and `coverage.test.mjs` in the new unit directory and
`scripts/tests/integration/task-tracker/lib/criteria-revision-consumers.test.mjs`.

**Interfaces:** export evaluateRevisionPolicy({activity,observation,capability}),
withGovernedRevisionMutation({context,observe},fn), and
REVISION_CONSUMER_COVERAGE (entrypoint → common guard/lock route).
Result is ready, blocked or indeterminate with exact typed reason and supported
action; no caller translates unavailable authority to ready.

- [ ] Red-test every inventory row with pending, applied/stale approval,
      current approval, malformed chain and unavailable authority fixtures.

  ```javascript
  for (const consumer of REVISION_CONSUMER_COVERAGE) {
    const result = await exerciseConsumer(consumer, pendingFixture);
    assert.equal(result.effects.length, 0, consumer.entrypoint);
    assert.equal(result.status, 'blocked', consumer.entrypoint);
  }
  ```

  exerciseConsumer is a test harness invoking the real public adapter with
  injected transport/effect spies, not a second copy of the policy evaluator.

- [ ] Make `coverage.test.mjs` compare the coverage registry with an independently
      discovered source import/call graph rooted at body writes, capsule/comment
      authority writes, lifecycle evaluators and activity/session gates. An unlisted
      root seam or direct bypass fails; the registry cannot define its own universe.
      Invoke each discovered semantic entrypoint with effect spies and verify
      proof read-side revision binding as well as zero writes while pending.
      Keep graph tests pure; real A/B worktree, subprocess delegation and holder
      liveness cases belong only in the consumer integration test.
- [ ] Run the consumer command red.
- [ ] Acquire strict interlock at public mutation boundaries before existing
      issue locks. Low-level delegates require/reuse the capability and cannot
      first-acquire below an existing lock. Cover subprocess delegation with
      authenticated holder-bound capability, never a bare inherited environment flag.
- [ ] Publish local deny before relevant source/contract/approval/stage effects.
      Hook reads local current entry per call; bind and lifecycle gates validate full
      remote chain under interlock. Never-revised issues keep compatible semantics
      only after verified empty-chain initialization in enabled domains.
- [ ] Apply current revision/digest checks to Plan, AC/VC/DoD proof, Test,
      Agent Review, Final Review, delivery and close. Only exact preserved-individual
      disposition can qualify an old legacy individual receipt; never aggregates.
- [ ] Test A applies while B remains Develop-bound; B's next code write/commit
      denies. Test no code laundering through mixed documentation commits.
      Audit direct body, canonical, repair and subprocess routes for omission.
- [ ] Run green and commit.

**Verification Commands:**

Run: `node --test scripts/tests/unit/task-tracker/lib/criteria-revision/policy.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/coverage.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-consumers.test.mjs`

### Task 6: 🐞 [BUG] Expose the supported command, Explain recovery and end-to-end delivery

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** prepare, inspect, authorize, apply and recover a criteria correction through supported AITM commands
- **Need:** protected obsolete declarations currently have no legitimate user-facing correction route
- **Value or failure prevented:** the motivating consumer can proceed through normal verification without raw edits or bypass flags

#### Delivery steps

**Estimate:** 6 human hours. **Depends on:** Tasks 1–5.

**Files:** create `scripts/task-tracker/verbs/criteria-revise.mjs`;
modify `bin/aitm-registry.mjs`,
`scripts/task-tracker/lib/command-surface/catalog.mjs`,
`scripts/task-tracker/lib/action-decision/contract.mjs`,
`scripts/task-tracker/lib/action-decision/remediations.mjs`,
`instructions/aitm-guidance.yml`, CLI routing/help catalog,
`skill/shared/router.md`, create
`skill/shared/rules/criteria-revise.md`, update workflow guidance and installed
guidance generation through repository-owned tooling; create
`scripts/tests/unit/task-tracker/verbs/criteria-revise.test.mjs`,
`scripts/tests/integration/task-tracker/lib/criteria-revision-delivery.test.mjs`.
Integrate focused verifiers into the parent's root Verification Commands through
registered exact issue-body operations before using them as proof.

**Interfaces:** registered `criteria-revise enable|prepare|apply|status|recover`.
prepare/status are read-only with explicit issue/context and no binding changes.
apply/recover accept an operation file containing the closed mutation request.
enable is operator configuration with runtime-derived domain and quiescence;
it never changes an issue contract. Help prints exact statement, preview,
invalidation, archive size and typed refusal/recovery without executing verifiers.

- [ ] Red-test CLI argument rejection, zero side effects for prepare/status,
      no arbitrary paths/flags/proof, and typed Explain mapping.
- [ ] Register all six outcomes in action-decision `contract.mjs`, their closed
      remediation entries in `remediations.mjs`, and human/agent guidance in
      `instructions/aitm-guidance.yml`: `criteria-revision-required` → prepare;
      `revision-pending` → status then exact recover; `revision-conflict` → status
      then prepared forward-repair only when authorized; `revision-authorization-required`
      → obtain the exact statement/source before apply or recover;
      `revision-approval-stale` → normal current-revision plan-approve;
      `revision-topology-unsupported` → explicit enable only for supported quiescent
      topology, otherwise a typed operator decision without mutation. Bind every
      action to issue and closed arguments. No apply/recover authorization becomes
      Full-Auto merely because a remediation is registered.
      Table-test each code, registered action and refusal branch in the CLI test;
      assert guidance contains no marker-loss bypass, stage jump or old-receipt
      reconstruction recommendation.
- [ ] Run the focused command red.
- [ ] Wire production dependencies to existing GitHub envelope/comment transport,
      trusted host session loader, binding/ownership and stage policies.
      Keep recovery conditional on valid current coordinator authority.
- [ ] Exercise a full #124-shaped legacy correction from obsolete unchecked
      declarations through fresh reapproval, genuine verifier execution, Test and
      Review evidence. Exercise equivalent canonical flow through the real adapter.
      Seed fixtures, never change live #124.
- [ ] Run all focused revision tests and parent-declared existing regression
      commands. Run lint/format and normal exact-clean-SHA Test gates, using genuine
      receipts for every AC/DoD; no fabricated green or manual bulk ticking.
- [ ] Review the exact integrated SHA; fix material findings and rerun affected
      checks. Report CODE_COMPLETE to the #1847 orchestrator with all child evidence.
      Orchestrator owns Review/approval/delivery/close and final consumer unblock.

**Verification Commands:**

Run: `node --test scripts/tests/unit/task-tracker/verbs/criteria-revise.test.mjs scripts/tests/integration/task-tracker/lib/criteria-revision-delivery.test.mjs`

## Parent validation and operational handoff

Each child must carry valid standalone story intent, exact source-plan-section,
normal Refine/Plan/Develop gates, its own bounded estimate and proof, and
dependency links. Parent #1847 must not count the same implementation hours as
orchestration. Use `aitm split-plan 1847 --dry-run --plan docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md --json`
after this committed plan is reviewed, then the sanctioned confirmed operation.
Create children only through the registered split-plan operation.

Immediately after the confirmed split, bind and assign each generated child in
its own recorded worktree, then run the registered `aitm refine <child> --size
<task-size> --estimate <task-hours> --priority p1 --rank <child-rank> --labels bug
--reason <scope-derived-reason>` for normal Refine entry and completion. This
explicitly supplies the kind label; split-plan does not inherit it. Before
accepting child readiness, read back each live child label and title: require
`bug` and equality with `ensureKindPrefix(task.title, ['bug'])`, containing
exactly one `🐞 [BUG]` prefix followed by a space. The prefix in these task headings is intentional;
label-driven reconciliation idempotently preserves it. If title, label or pinned
section disagree, stop and repair the governed linkage before further planning.
For the existing #1851–#1856 children, retain their completed Refine evidence and
verify the already-applied labels rather than recreate or re-refine them merely
to replay this instruction.

Before parent completion, integrate all child changes and use the parent root
Verification Commands plus the new revision integration commands at the exact
clean accepted SHA. Evidence must show legacy and canonical end-to-end success,
all false-authority/refusal cases, every crash prefix, A/B worktree contention,
and continued ordinary-marker protection. Delivery requires normal CI and the
sanctioned provider merge action; no local merge bypass.

Plan self-review: all specification sections map to tasks above; no unknown
capability is treated as baseline. All new public interfaces are named and their
test ownership assigned. The Refine report's measurement is deliberately not a
production prepare receipt. Model/review infrastructure is a verified local
dependency, not a reason to wait for PR #125.
