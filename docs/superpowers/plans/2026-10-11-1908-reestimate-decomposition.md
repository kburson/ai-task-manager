# Ongoing re-estimate decomposition enforcement — Implementation Plan

> For agentic workers: use the subagent-driven-development or executing-plans skill to execute reviewed child deliveries. This preparation run stops before implementation. A fresh implementing agent must read this plan and the accepted specification together.

**Goal:** Record truthful story re-estimates immediately, expose a current decomposition decision and prevent further scoped implementation when the story requires decomposition.

**Architecture:** Reuse the existing pure classifier and project threshold source. Add a strict assessment kernel, current-authority/projection adapter and resumable publication adapter; compose them into actual estimate writers, typed continuation, native effect admission and governed decomposition paths. Preserve the existing issue/forecast locks and optimistic body writer rather than introducing a general transaction service.

**Tech Stack:** Node.js ES modules, existing GitHub CLI/GraphQL adapters, Markdown, Node test runner and injected fixture transports.

**Spec:** `docs/superpowers/specs/2026-10-11-1908-reestimate-decomposition-design.md` @ `acb725feafc26e31bccfd18b96e9b5e517137397`; SHA-256 `3aa7382fdb05c1151d95fb0a74745b0ecf610671086db5e22545682e1ac554d4`. XPR accepted by Claude Opus 5.5; finalization `3d13afc0e1be427485ba5d72000ed090b0b4bb69`.

**Source baseline:** `7a1fa88d95d8cea88c9634239e83c10c2c999965`. No implementation or verifier pass is asserted by this plan.

## Scope

Implement #1908's accepted specification only. The incident #1855 remains immutable evidence; no live incident estimate changes or #1847 transaction implementation. Seven child deliveries below 24 hours carry independent verifiers and explicit interfaces. Parent aggregate is provisionally 49 human hours; refinement replaces that with actual reviewed child estimates. Orchestration overhead and parallel elapsed time are reported separately.

## Story Intent

- **Beneficiary:** delivery owner
- **Capability:** stop continued delivery of oversized re-estimated stories while keeping estimates and recovery actions truthful
- **Need:** estimate changes and existing oversized stories can continue beyond the reviewable delivery boundary without current enforcement
- **Value or failure prevented:** scope growth becomes visible and work is decomposed before days of unreviewable implementation accumulate

## Global Constraints

- Estimate >=24 uses the shared project policy; 23 must not trigger the mandatory estimate condition, 24 and 25 must. Existing independent signals remain.
- Use Node.js scripts and Markdown only; no compiled native binaries, addons or toolchain.
- Keep revised estimates, lifecycle Status, WIP, timing and history truthful. No automatic demotion, scope splitting or waiver.
- All supported non-epic kinds are individual deliveries; only verified epic aggregate effort is exempt.
- No agent/Full-Auto/self-authored or stale prose waiver grants current admission.
- Fresh authority is required for recognized scoped implementation. Pending or unavailable authority denies it; recovery capability does not grant missing ownership/scope authority.
- Preserve #1908's exact requested guard/admission verifier paths and its existing AC/VC/DoD declarations. Never fabricate execution evidence.
- Existing physical containment, installed-guard, ownership and lifecycle requirements remain conjunctive. This plan does not implement #1984 hook relaxation.

## Review Focus

1. Pending intent before the first remote estimate write must survive refresh despite matching old board/body values: Tasks 2, 3 and 7.
2. A document or no-commit delivery must not escape by changing to another non-epic kind: Tasks 1, 5 and 6.
3. A warm hook cache, early allow return, chore mode or wrapper exception must not admit a recognized scoped mutation without current authority: Tasks 4, 5 and 7.
4. A nested adaptive/refinement writer must use one publication owner and avoid repeated issue/claim acquisition: Tasks 2 and 3.
5. A converted epic must retain unresolved readiness until reviewed children materialize; unreadable decomposition inputs cannot be bypassed: Tasks 6 and 7.

## File ownership and parallel waves

| Task | Delivery                                   | Provisional hours | Wave | Dependencies | Exclusive implementation ownership                                                                                              |
| ---- | ------------------------------------------ | ----------------- | ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Strict assessment and codec                | 6                 | 1    | None         | Existing decomposition policy; new assessment and codec modules; requested unit guard suite's kernel cases.                     |
| 2    | Current authority and durable projections  | 7                 | 2    | 1            | New authority/projection modules; marker registry/invariants; dedicated authority/projection tests.                             |
| 3    | Resumable estimate publication and writers | 12                | 3    | 1, 2         | New publication module; estimate/refinement/forecast/tether/migration writers; unit guard suite's writer cases.                 |
| 4    | Typed continuation and restricted binding  | 6                 | 3    | 1, 2         | Action-decision contracts/collectors/catalog; start/resume/Explain; requested integration admission suite's continuation cases. |
| 5    | Native scoped-effect admission             | 9                 | 4    | 3, 4         | Activity/source-edit/mutation-context integration; admission suite's hook cases.                                                |
| 6    | Governed kind/split recovery and guidance  | 4                 | 4    | 3, 4         | Kind/split/epic metadata/Plan-exit guard; dedicated kind/split/Plan-exit tests.                                                 |
| 7    | Complete composition proof and docs        | 5                 | 5    | 5, 6         | Final requested integration-suite extensions, documentation, complete adapter census and final provider verification.           |

Task 3 and Task 4 may execute in parallel after Task 2 lands; Tasks 5 and 6 may execute in parallel after both Wave 3 deliveries land. Never run two active implementing agents on the same child task. No parallel execution occurs in this preparation run. Parent rank is 1; child wave ranks are parent rank plus wave minus one. Native blocked-by relationships encode the exact dependency graph as well as ranks. Shared unit/admission test files have one owner per wave; a later wave extends the prior committed fixture rather than overwriting it. Integrate each completed wave before dispatching the next.

## Shared wire and API contracts

The following proposed interfaces are owned by the named tasks. Consumers use these names and closed types; no caller can pass an admission boolean.

- Task 1: `normalizeDecompositionInputs(snapshot)`, `assessDecomposition(input)`, `validateDecompositionAssessment(value)`, `deriveDecompositionCapabilities(assessment, publication)` and `decompositionInputDigest(input)`.
- Task 1 codec: `readDecompositionRecords(body)` and `replaceDecompositionRecords(body, {assessment, publication})`. Decode strict canonical base64url JSON through existing marker grammar, never executable payloads.
- Task 2: `collectDecompositionAuthority({subject, cfg, projectDir, deps})`, `refreshDecompositionProjection({subject, cfg, projectDir, deps, context})` and `createDecompositionRuntime({cfg, projectDir, deps})`.
- Task 3: `publishEstimateRevision({subject, operationId, expectedInputDigest, proposal, effects, deps, context})`; its privately branded context identifies subject, operation, current input digest and lock owner. Nested helpers accept the same context; users cannot construct it through CLI flags.
- Task 4: `observeDecompositionForAction({actionId, subject, attempt, runtime})` returns typed observations and blockers; it never writes. Bind/resume separately invokes refresh and then reports capability restrictions.
- Task 5: `evaluateDecompositionActivity({activity, targets, assessment, publication})` returns the existing hook allow/block shape, with stable decomposition code and operation identity.
- Task 6 uses the shared collector/refresh API after an authorized kind change; it does not invent an estimate revision.

`subject` is exactly `{repository, issue, projectId, projectItemId}`. Repository is normalized owner/name, issue is a positive safe integer and project identities are current provider IDs. Missing configured membership is unavailable authority, not an implicit exemption.

### Normalized input

`aitm.decomposition-input/v1` contains `schema`, `subject`, `kind`, `estimate`, `size`, `plan`, `policy`, `scopeDigest`, `observations` and `availability`. `kind` is one of code/docs-only/audit/research/spike/epic; absence of a genuine marker means default code, while malformed/duplicate/unknown explicit markers are unavailable. `estimate` is `{basis, hours, proposalId}`: basis is published/proposed/unset; hours is a nonnegative finite whole number or null only for unset; proposalId is null for published/unset. An early unset estimate cannot authorize Develop when its ordinary estimation gate requires a value. Proposals are ceiled using `ceilEstimateHours` before classification and are distinguished from successful board effects.

`plan` is `{path, commit, section, digest, availability, content}`; a genuinely absent optional plan has null identifiers and availability absent. Declared unavailable/invalid/escaping plan paths yield unavailable, never an empty valid plan. If a Source-plan-commit is present, read pinned bytes through the existing plan resolver and prove the selected section corresponds to the current delivery; edited working-copy bytes cannot become silent acceptance authority.

`policy` is `{classifierVersion, thresholds, digest}` from `DECOMPOSITION_THRESHOLDS`. `scopeDigest` hashes normalized User Story/Scope/AC declarations, resolved VC bytes and selected plan identity/content. Extend decomposition identity locally; do not claim `workflow-policy/scope-identity.mjs` already includes VC or plan bytes. Exclude timing, body version, ordinary comments, assessment records and display-only ticks/proof decorations. Include semantic criterion insertion/removal, resolved verifier changes and plan/section changes.

Each observation is `{resource, identity, revision, digest}` without raw bodies, commands, credentials or provider handles. Availability is complete/incomplete with closed reason codes and separately retained observed mandatory estimate signal. A missing required read cannot be converted to null and allowed.

### Assessment and publication records

Assessment `aitm.decomposition-assessment/v1` has exact keys `schema`, `subject`, `inputDigest`, `kind`, `estimate`, `size`, `plan`, `policyDigest`, `scopeDigest`, `signals`, `status`, `capabilities`, `blockers`, `observations`, `assessedAt`. Status is story-ok/needs-decomposition-review/must-decompose/epic-readiness-required/pending/indeterminate. Preserve legacy classifier must-split internally and map centrally to must-decompose. Advisory 16-hour review does not become mandatory refusal; independent task/group signals can still require decomposition at 23.

Publication `aitm.decomposition-publication/v1` has exact keys `schema`, `subject`, `operationId`, `writerId`, `beforeInputDigest`, `intendedInputDigest`, `proposal`, `effects`, `status`, `supersedes`, `createdAt`, `updatedAt`. `operationId` is a UUID; `writerId` is a registered adapter ID. Each effect is `{id, resource, targetIdentity, intendedDigest, status, observedDigest}`. Status is pending/confirmed/failed/unknown; unknown transport outcome is never confirmation. Publication status is pending/complete/superseded; supersedes is null or the exact prior operation identity with reconciled effect outcomes. Ordered effect IDs are sealed before the first write and identify re-entrant named adapter operations, never shell text or arbitrary callbacks persisted in authority.

Use one physical visible `## Decomposition Assessment` section and one marker each named `aitm-decomposition-assessment` and `aitm-decomposition-publication` under the Progress Markers section. Attributes are exactly `schema` and `payload`; payload is unpadded canonical base64url UTF-8 JSON. Reject duplicate attributes before the generic parser can collapse them. Limit each decoded record to 8 KiB and observations/effects to 32 entries each; refuse before the first effect if the complete body cannot fit provider limits. Extra fields, duplicate records, malformed encoding, unsupported schemas, invalid digests/timestamps and mixed subjects are refused. Missing records are distinct from malformed records.

A complete publication can remain as current historical disposition. Pending publication remains independent of the current classifier result and denies scoped effects even when old low values agree. Refresh can repair only a missing assessment after every required publication effect is confirmed; it cannot clear pending by timeout, kind conversion or unchanged fields.

### Locking and effect sequence

Gather/refresh estimation rubric and comparable records before acquiring the target publication issue lock. Under the canonical main-worktree issue lock, acquire the same issue's existing forecast logical claim only where needed; use the existing issue-scoped reentrancy, not a second independent owner. The body writer uses its existing optimistic fresh-base transaction, not a new body mutex. Never acquire a different issue/rubric lock while holding the target publication lock. Reject a foreign nested context or different operation instead of adopting its environment variable.

Within one operation: validate and collect current authority; persist/read back pending intent; apply each registered writer effect with per-effect read-back; persist confirmations without duplicating audit history; recollect and compare all required projections; publish/read back final assessment; mark the publication complete only when the effect set and assessment match. Re-read before each effect and stop on semantic drift. Unknown effects are reconciled by reads before retrying; idempotency keys or exact before/after checks protect comment and forecast creation. Local cooperating processes/worktrees are serialized; the remote provider offers no global CAS across hosts. Detect unsupported concurrent authority and retain a fence; do not claim an atomic hook-to-arbitrary-host-write guarantee.

### Representative kernel assertion

This is proposed test content, not executed evidence; Task 1 supplies the local fixture factory with a complete closed input.

```js
const assessment = assessDecomposition(fixture({ kind: 'code', hours: 24 }));
assert.equal(assessment.status, 'must-decompose');
assert.equal(assessment.capabilities.includes('scoped-implementation'), false);
assert.equal(
  assessDecomposition(fixture({ kind: 'code', hours: 23 })).status,
  'needs-decomposition-review'
);
assert.equal(
  assessDecomposition(fixture({ kind: 'epic', hours: 25 })).signals.some(
    (signal) => signal.code === 'estimate-hours'
  ),
  false
);
```

## Minimum adapter census and coverage

| Adapter                                                          | Publication/assessment behavior                                                                                       | Owning task     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------- |
| inflate-estimate                                                 | Comment audit, board size/estimate and body fields; confirm partial outcomes and keyed history retries.               | 3               |
| adaptive Plan authority/runtime                                  | Appendix, board/body, forecast and ready marker with existing claim; adoption assesses exact existing values.         | 3               |
| compatibility planned appendix                                   | Append/repopulate/upsert/clear/restore proposals, explicit supersession, no false board publication.                  | 3               |
| refine and direct project tether                                 | Initial creation remains outside revision; existing-issue field revisions use one owner even when nested.             | 3               |
| deep-dive re-evaluation/refinement audit                         | Applied estimate versus human-pending proposal; unchanged audit is not a publication.                                 | 3               |
| migrate-project and bind-issues-to-new-project                   | Existing-issue semantic Estimate writes enter publication; identical encoding/copying cannot mint admission.          | 3               |
| ensureIssueFieldDb/formatIssueFieldDb and writeProjectFieldValue | Pure encoders stay pure; enumerate every effectful caller and route semantic estimate changes at the effect boundary. | 3, audited by 7 |
| start/resume and Explain/action decisions                        | Restricted binds, read-only Explain, fresh current inputs and unavailable/pending/stale distinctions.                 | 4               |
| activity/source-edit executable boundaries                       | All-target capability checks before early returns, warm caches, chore mode and exception pass-through.                | 5               |
| kind, epic-metadata, split-plan and child creation               | Exact authorized recovery survives restrictions, reassesses changed kind and preserves pending intent and readiness.  | 6               |
| Plan-exit decomposition and remediation producers                | Shared assessment/WBS parity; no current waiver recommendation or success branch for estimate enforcement.            | 6               |

The completed call-site census below classifies actual references to writeProjectFieldValue/tetherIssueToProject/ensureIssueFieldDb/formatIssueFieldDb. Each caller has an assigned semantic-writer or source-backed exclusion fixture. Unsupported raw GitHub edits are detected on continuation, not presented as cooperative publications. Task 7 rejects an unmapped semantic writer.

## Implementation Tasks

### Task 1: Define strict shared decomposition assessment and record codecs

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** receive one consistent decomposition classification across every supported issue kind and estimate boundary
- **Need:** separate entrypoints can interpret estimate, epic and waiver signals differently
- **Value or failure prevented:** bounded deliveries remain usable while oversized work is visibly identified without policy drift

#### Delivery details

**Estimate:** 6h, M. **Wave:** 1. **Depends on:** None.

**Files:** Modify `scripts/task-tracker/lib/decomposition-policy.mjs`; create `scripts/task-tracker/lib/decomposition-assessment.mjs`, `decomposition-records.mjs`; create `scripts/tests/unit/task-tracker/lib/decomposition-reestimate-guard.test.mjs` kernel cases. Own existing `decomposition-policy.test.mjs` regressions only in this wave.

**Interfaces:** Produce the Task 1 APIs and exact wire contracts above. Continue accepting legacy classifier consumers; only assessment output uses the new status mapping.

- [ ] Step 1: Add table-driven kernel fixtures for 23/24/25 across all six valid kinds and default code, fractional proposal normalization, malformed kind markers, independent XL/task/group signals, optional versus declared unreadable plan, policy/scope/VC changes and unchanged tick/timing inputs. Test duplicate/oversized/unknown-field/invalid-encoding records without I/O.
- [ ] Step 2: Run the declared focused verifier and observe the missing kernel/codec or incorrect boundary failure; record genuine red evidence under the child issue.
- [ ] Step 3: Implement the strict input/record validators and pure assessment mapping exactly as above. Derive capabilities, never accept them from a caller. Preserve must-split internally and use shared thresholds; do not add transport dependencies.
- [ ] Step 4: Run the same verifier, check existing policy behavior, then commit under the hydrated child's issue attribution. End at reviewed code-complete; no self-closing.

Run: `node --test scripts/tests/unit/task-tracker/lib/decomposition-reestimate-guard.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs`

### Task 2: Collect current authority and persist protected pending projections

#### Story Intent

- **Beneficiary:** workspace operator
- **Capability:** distinguish a current decomposition assessment from stale projections and unresolved estimate intent
- **Need:** agreement between old fields can hide an interrupted oversized revision
- **Value or failure prevented:** recovery never silently restores implementation permission from incomplete or contradictory authority

#### Delivery details

**Estimate:** 7h, M. **Wave:** 2. **Depends on:** Task 1.

**Files:** Create `scripts/task-tracker/lib/decomposition-authority.mjs`, `decomposition-projection.mjs`; modify `lib/markers.mjs`, `body-invariants.mjs` and related marker protection definitions; create dedicated `scripts/tests/unit/task-tracker/lib/decomposition-authority.test.mjs` and `decomposition-projection.test.mjs`. Do not edit writer, action-decision or hook files.

**Interfaces:** Produce collector/refresh/runtime APIs. Read-only ports are `readIssue`, `readProject`, `readSelectedPlan`, `readForecast` and `readPolicy`; projection writes use governed `mutateIssueBody`, `readBackIssue` and existing issue-lock ports. Ports return explicit observed/unavailable observations with digests; no effect port reaches the collector.

- [ ] Step 1: Test absent/stale/malformed/duplicate records; board/body/forecast disagreement; missing configured membership; unreadable scope/plan/policy; pending-before-first-effect with matching old fields; failed projection read-back; changed scope/VC versus display-only updates; preserved Status/WIP/timing/history.
- [ ] Step 2: Observe focused red through real production adapter composition over injected provider fixtures.
- [ ] Step 3: Implement current input collection and protected record replacement/read-back. A stale or absent projection needs sanctioned refresh before product admission; Explain gets only collection. Refresh retains pending until all effects are confirmed. Marker protection must allow only exact owner-authorized advances, not generic forgeable payload replacement.
- [ ] Step 4: Exercise same-issue lock reentrancy and unrelated concurrent contenders, provider body-limit refusals and effect-free collection. Commit the independently tested delivery under its child issue.

Run: `node --test scripts/tests/unit/task-tracker/lib/decomposition-authority.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-projection.test.mjs`

### Task 3: Publish estimate revisions through resumable real writer adapters

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** record revised estimates with visible decomposition decisions at the time each supported writer publishes them
- **Need:** inflation and alternate field writers currently persist estimates without ongoing enforcement or complete read-back
- **Value or failure prevented:** scope growth is recorded truthfully and partial publication cannot permit continued implementation

#### Delivery details

**Estimate:** 12h, M. **Wave:** 3. **Depends on:** Tasks 1 and 2.

**Files:** Create `scripts/task-tracker/lib/decomposition-publication.mjs`; modify `verbs/inflate-estimate.mjs`, `plan-estimate.mjs`, `refine.mjs`, `lib/apply-reevaluate.mjs`, `apply-refinement-estimate.mjs`, `refine-estimate-comment.mjs`, `lib/estimation/plan-estimate-authority.mjs`, `runtime-adapter.mjs`, `scripts/gh/project-tether.mjs`, `scripts/gh/lib/project-tether.mjs`, `scripts/gh/migrate-project.mjs`, `scripts/maintenance/bind-issues-to-new-project.mjs`. Add writer cases to the requested unit guard suite and existing writer suites. Extract small new adapter helpers rather than growing existing large modules beyond repository caps.

**Interfaces:** Consume Tasks 1/2 and produce publishEstimateRevision plus registered effect adapters. Writer IDs are inflation/adaptive-plan/legacy-plan/refinement/deep-dive/tether/project-migration. Effect sets follow the actual writer: inflation audit/size/estimate/body; adaptive appendix/estimate/size/body/forecast/ready; compatibility proposal; migration identified fields/body. Persist data only; replay obtains functions from the registered writer, never from authority payloads.

- [ ] Step 1: Add real adapter matrices for applicable Backlog/Refine/R4P/Plan/Develop and already supported later states, each 10→23/24/25. Cover pending proposals, adoption, duplicates, no-refine-comment and initial creation/no-op distinctions. Assert successful revised values and unchanged Status except the refine command's separately requested legal lifecycle edge.
- [ ] Step 2: Inject failure/unknown outcome after each comment/board/body/forecast/ready effect, process interruption before any effect and exact retries. Assert keyed history has one entry, confirmed values are never rolled back and unresolved publication denies implementation.
- [ ] Step 3: Implement one owner with issue→same-issue claim→optimistic body order. Pre-read rubric outside target lock. Reconcile uncertain effects before replay, refresh final assessment and confirm the complete effect set. Return recorded/partial/refused outcomes instead of misleading best-effort success.
- [ ] Step 4: Complete the effectful caller census and source-backed exclusions, run focused verifiers, and commit. Task 4 runs in parallel only because it owns different files and the integration suite.

Run: `node --test scripts/tests/unit/task-tracker/lib/decomposition-reestimate-guard.test.mjs scripts/tests/unit/task-tracker/verbs/inflate-estimate.test.mjs scripts/tests/unit/task-tracker/verbs/plan-estimate.test.mjs scripts/tests/unit/task-tracker/lib/estimation/plan-estimate-authority.test.mjs scripts/tests/unit/task-tracker/gh/lib/project-tether.test.mjs scripts/tests/unit/task-tracker/lib/coverage-apply-reevaluate.test.mjs scripts/tests/unit/task-tracker/lib/apply-refinement-estimate.test.mjs`
Run: `node --test scripts/tests/unit/task-tracker/lib/r4p-jit-boundaries.test.mjs scripts/tests/integration/task-tracker/lib/shelve-transaction.integration.test.mjs scripts/tests/integration/task-tracker/lib/update-event-fields-states.test.mjs`

### Task 4: Expose restricted bind and typed current continuation decisions

#### Story Intent

- **Beneficiary:** workspace operator
- **Capability:** resume inspection and see exact current implementation restrictions through typed lifecycle guidance
- **Need:** successful binding and stale decisions can otherwise be mistaken for permission to continue an oversized story
- **Value or failure prevented:** recovery remains usable while unavailable or changed authority cannot produce false implementation readiness

#### Delivery details

**Estimate:** 6h, M. **Wave:** 3. **Depends on:** Tasks 1 and 2.

**Files:** Modify `scripts/task-tracker/verbs/start.mjs`, `resume.mjs`, `explain.mjs`, `lib/action-decision/session.mjs`, `observations.mjs`, `evaluate.mjs`, `contract.mjs`, `remediations.mjs`, `presentation.mjs`, `lib/guard-registry.mjs` and applicable guidance catalog entries. Create `scripts/tests/integration/task-tracker/lib/decomposition-reestimate-admission.test.mjs` continuation cases; extend existing action-decision contract tests. Do not edit Task 3 writer files.

**Interfaces:** Produce observeDecompositionForAction. Register exact blocker arguments `{issue, operationId}` where operationId is nullable and reason from the closed authority vocabulary. Bind readiness and implementation capability are separate: binding can succeed restricted, while ordinary ownership/session admission still fails independently.

- [ ] Step 1: Test already-bound oversized stories, externally revised fields, absent/stale projections, no-network/skipped reads, blocked membership, read-only Explain with zero effects, advisory 23-hour review, independent must-split signals and restricted bind refresh failure.
- [ ] Step 2: Observe red through actual start/resume/Explain composition, not a stubbed final decision.
- [ ] Step 3: Add the observation/resource/producer/refusal/guidance contracts together. Invoke refresh only in bind/resume; never let Explain mutate. Return exact governed recovery actions and keep admission freshness tied to the current command boundary.
- [ ] Step 4: Run the focused suite and commit. Later Task 5 extends the same integration suite after Wave 3 integration.

Run: `node --test scripts/tests/integration/task-tracker/lib/decomposition-reestimate-admission.test.mjs`

### Task 5: Enforce decomposition at real scoped-effect hook boundaries

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** prevent new scoped mutations when current decomposition authority is unresolved
- **Need:** native tools, compound commands and cached early-allow paths can bypass CLI-only restrictions
- **Value or failure prevented:** no supported effect proceeds under a known oversized or unreadable decision while legitimate recovery remains possible

#### Delivery details

**Estimate:** 9h, M. **Wave:** 4. **Depends on:** Tasks 3 and 4.

**Files:** Create `scripts/task-tracker/lib/decomposition-activity.mjs`; modify `activity-guard.mjs`, `activity-policy.mjs`, `source-edit-gate.mjs` and supported target-discovery composition in `lib/mutation-context.mjs`; extend the requested integration admission suite and existing native hook regressions. Task 6 owns kind/split/Plan-exit files and separate tests.

**Interfaces:** Produce evaluateDecompositionActivity; capabilities are inspect/checkpoint/decomposition-prepare/governed-decomposition/scoped-implementation/scoped-deliverable. Determine capability from the actual declared command and physically resolved complete targets; path names or a caller boolean are insufficient. Recovery descriptors identify the exact governed command/operation and cannot authorize sibling effects.

- [ ] Step 1: Execute fixture hooks for Edit/Write/apply-patch and supported Bash mutation discovery. Cover mixed docs/source targets, scripts/generators, product tests/config, new scoped document/no-commit deliverables, checkpoint-only commits, diagnostics and exact decomposition preparation.
- [ ] Step 2: Add warm-cache, chore-mode, artifact-prefix/early-return, transport timeout/parser error and top-level exception cases. Assert recognized scoped mutation gets zero admitted effects; unrelated read-only or exact recovery targets remain available under original gates.
- [ ] Step 3: Compose fresh assessment before scoped-effect early returns and replace wrapper fail-open for recognized scoped mutation with typed fail-closed output. Keep original containment/installed-guard and lifecycle checks; do not implement broader #1984 relaxation or claim arbitrary interpreter parsing beyond supported target discovery.
- [ ] Step 4: Run actual executable-boundary tests and commit, preserving the check-time cooperative limitation documented above.

Run: `node --test scripts/tests/integration/task-tracker/lib/decomposition-reestimate-admission.test.mjs scripts/tests/integration/task-tracker/lib/source-edit-gate.test.mjs scripts/tests/integration/task-tracker/lib/artifact-write-policy.test.mjs`
Run: `node --test scripts/tests/unit/task-tracker/lib/code-complete-gate-audit-494.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-no-commit.test.mjs`

### Task 6: Preserve governed split and kind recovery with truthful epic readiness

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** decompose restricted stories through reviewed children without erasing pending estimate intent or inventing ready epics
- **Need:** kind conversion and split operations can otherwise be blocked by their own guard or used to clear restrictions prematurely
- **Value or failure prevented:** decomposition produces real delivery boundaries and recovery guidance cannot send agents back to self-authored waivers

#### Delivery details

**Estimate:** 4h, S. **Wave:** 4. **Depends on:** Tasks 3 and 4.

**Files:** Modify `scripts/task-tracker/verbs/kind.mjs`, `split-plan.mjs`, `lib/split-plan.mjs`, `lib/decomposition-plan-exit-guard.mjs`, `scripts/gh/lib/epic-metadata.mjs` and exact sanctioned child-creation assessment integration in `scripts/gh/create-issue.mjs`. Extend `verbs/coverage-kind.test.mjs`, `split-plan.test.mjs`, `lib/decomposition-plan-exit-gate.test.mjs`, `decomposition-delivery-readiness.test.mjs`. Do not edit Task 5's shared integration suite in parallel.

**Interfaces:** Consume shared collector/refresh/publication reconciliation and use exact governed recovery descriptors. Child creation assesses newly created delivery on continuation, not as an existing-parent estimate revision. Keep existing substantive story-intent, child enumeration, parent linkage and materialized WBS checks.

- [ ] Step 1: Test permitted dry-run/reviewed split and kind change under must-decompose/pending/indeterminate only when original operation authority is usable. Test missing scope/plan/ownership refusal and no sibling product effects.
- [ ] Step 2: Test non-epic→non-epic cannot escape, story→epic preserves pending intent and visible unresolved readiness, and real reviewed materialized children satisfy only the existing affected epic boundary.
- [ ] Step 3: Compose reassessment after kind/epic metadata mutation without fake estimate history. Preserve the publication fence until genuine reconciliation/supersession. Replace all current decomposition waiver recommendations and prose-only success branches with exact governed split/refresh/re-estimate actions.
- [ ] Step 4: Run real output regressions showing no waiver recommendation from Plan-exit/Explain/continuation, preserve old text as history, and commit the independently tested recovery delivery.

Run: `node --test scripts/tests/unit/task-tracker/verbs/coverage-kind.test.mjs scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-delivery-readiness.test.mjs`

### Task 7: Prove complete composition and document operational recovery

#### Story Intent

- **Beneficiary:** workspace operator
- **Capability:** use verified estimate revision and recovery behavior consistently across all supported entrypoints
- **Need:** individually correct adapters can still leave omissions or incompatible publication and admission behavior
- **Value or failure prevented:** no uncovered writer or hook produces false permission and operators can recover truthful partial outcomes

#### Delivery details

**Estimate:** 5h, M. **Wave:** 5. **Depends on:** Tasks 5 and 6, transitively Tasks 1–4.

**Files:** Extend both exact requested regression suites as needed after prior owners land; add the complete adapter census and operational recovery documentation under `docs/`; update applicable `skill/shared/references/` decomposition guidance without changing unrelated policy. Runtime product files remain owned by their earlier tasks; discovered defects return to those owning children rather than being hidden in this proof task.

**Interfaces:** Validate all shared contracts and the complete production composition; produce a source-backed adapter/verifier ledger and truthful operational recovery examples.

- [ ] Step 1: Add full writer/state/kind/threshold and publication↔bind↔Explain↔hook↔split fixtures, including pending-before-any-write, each partial effect set, unknown provider outcome, identical retry, current low estimate with unresolved intent, semantic drift and explicit supersession.
- [ ] Step 2: Verify all accepted-spec requirements map to a real adapter test. Test migration and generic callers through actual injected production seams. Reject any unsupported exclusion or mocked final guard result presented as full coverage.
- [ ] Step 3: Document recorded versus partial results, safe refresh/resume/supersession, advisory versus mandatory output, converted-epic readiness and the cooperative concurrency limitation. Retire obsolete current waiver guidance; preserve historical evidence.
- [ ] Step 4: Run targeted composition verifiers and the parent-owned sanctioned full verification provider at final integrated HEAD during implementation. Keep child verifiers targeted; no full runtime suite runs in this planning session. Commit evidence only for executions actually performed.

Run: `node --test scripts/tests/unit/task-tracker/lib/decomposition-reestimate-guard.test.mjs scripts/tests/unit/task-tracker/verbs/inflate-estimate.test.mjs scripts/tests/unit/task-tracker/verbs/plan-estimate.test.mjs`
Run: `node --test scripts/tests/integration/task-tracker/lib/decomposition-reestimate-admission.test.mjs`
Run: `node --test scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-delivery-readiness.test.mjs`

## Acceptance and verifier mapping

AC1: Tasks 1/2/3, full writer/state/kind/23–25 matrix and truthful values. AC2: Tasks 2/4/5/6/7, fresh continuation and recovery composition. AC3: Tasks 1/5/6/7, prior AI/stale waiver and no-waiver output. AC4: Tasks 1/6/7, shared policy, independent signals, bounded and actual epic readiness. Parent issue vc:1–3 remain the exact targeted commands above; vc:4–8 and functional DoD remain implementation/final-delivery obligations through the configured verification provider, not planning evidence.

## Planning, review and hydration execution

Record plan-generation timing; self-review this plan against the accepted spec and commit. Run genuine Astra 6 SPR high with this session as author, revise/disposition every finding and finalize. Then run Claude Opus 5.5 XPR high with this session as author, preserving both review histories and exact accepted artifacts. Record genuine acceptance timing and add accepted-plan path/commit/digest and review records to Plan Metadata.

With the final accepted plan and spec together, perform/post/mirror a deep dive; material divergence returns to plan review. Enumerate existing children again, run split-plan dry-run, then confirm only its reviewed exact proposals. Validate generated children against the accepted task intents and verifiers, set wave ranks and native dependency edges, refine each through Backlog→Refine→Ready for Planning and stop child implementation. Update the parent estimate from confirmed child fields using adaptive Plan estimation and retain explicit orchestration/elapsed distinctions. Prepare Plan approval and parent Develop entry through existing epic/source-binding/WBS readiness gates. Preserve approval provenance from the user's explicit instruction to follow this recipe; never claim peer consensus alone is human approval.

Stop immediately after the verified parent Develop preparation result. Commit/push all collateral and update the existing draft PR #1985. The user will start a fresh agent for implementation. If a gate blocks, follow its exact sanctioned remediation or report the unresolved authority; never relabel a false pass, self-waive or skip states.

## Contract and census completion after SPR

### Runtime plan structure and compact projection

The normalized runtime input's `plan` additionally has `content`: the exact selected UTF-8 Markdown when available, null when absent or unavailable. Task 2 resolves the accepted file and selected child section, validates provenance and computes digest over exactly those selected bytes. Task 1 derives task/group signals using existing `extractPlanTasks(content)`; callers cannot supply counts or allow decisions. Absent optional content is the empty classifier input; declared unreadable content makes authority incomplete. The input digest binds content and identity. Persisted assessment plan retains only path/commit/section/digest/availability; no plan content or unbounded tasks are stored. Plan-exit obtains WBS tasks from the same runtime content. Test M/23 with one versus four tasks and different verifier groups, selected child sections, and XL/group combinations. Collector tests prove exact classified content and digest binding. The kernel remains pure and records bounded.

### Completed generic field call-site census

Every production reference to writeProjectFieldValue, clearProjectFieldValue, tetherIssueToProject, ensureIssueFieldDb and formatIssueFieldDb under scripts/task-tracker, scripts/gh and scripts/maintenance at the source baseline is classified below. Task 7 checks inventory drift; it does not defer these design decisions.

| Production caller                                                                                                      | Disposition and verification owner                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gh/lib/github-projects.mjs; task-tracker/issue-field-db.mjs                                                            | Generic transport and pure codec definitions; no independent publication. Task 3 seals the enclosing caller context at semantic Estimate effects. Task 1/3 guard suite proves encoding/no-op cannot mint admission; transport outcome is not confirmation.                                                                                                                                                                                         |
| gh/lib/project-tether.mjs; gh/project-tether.mjs                                                                       | Existing-issue Estimate setter including rollback: Task 3 owner before enclosing first effect. Creator values are initial values, assessed by Task 6 continuation. Existing project-tether suite plus guard suite.                                                                                                                                                                                                                                 |
| gh/migrate-project.mjs; maintenance/bind-issues-to-new-project.mjs                                                     | Semantic revision when configured membership/Estimate changes. Task 3 project-migration owner confirms membership/board/body. Identical encoding preserves authority without history. Guard suite injects actual migration field seams.                                                                                                                                                                                                            |
| verbs/inflate-estimate.mjs                                                                                             | Task 3 inflation owner covers audit/size/Estimate/body; existing inflation plus guard suites.                                                                                                                                                                                                                                                                                                                                                      |
| lib/estimation/runtime-adapter.mjs; plan-estimate authority                                                            | Task 3 adaptive owner covers appendix/board/body/forecast/ready; existing authority plus guard suites.                                                                                                                                                                                                                                                                                                                                             |
| verbs/refine.mjs; lib/apply-reevaluate.mjs; apply-refinement-estimate; refine-estimate-comment                         | Task 3 refinement/deep-dive/legacy-plan owners distinguish applied values and pending proposals; append/upsert/clear/restore. Existing refinement/reevaluation plus guard suites. Unchanged audits create no publication.                                                                                                                                                                                                                          |
| verbs/cancel-plan.mjs                                                                                                  | Task 3 registered cancel-plan owner before proposal retirement/body invalidation; saved Refine estimate restoration, board/body and compensation share it. Unknown compensation remains pending. Explicit supersession needs read-back reconciliation; restored high proposal cannot restore admission. Preserve separately requested Plan→R4P. Extend unit lib/r4p-jit-boundaries.test.mjs and guard suite using real runCancelPlan dependencies. |
| lib/shelve-transaction.mjs; verbs/shelve.mjs                                                                           | Task 3 registered shelve owner adopts existing journal phases, board/body clear. Unset/Backlog does not erase unresolved intent; reconcile prior pending before explicit supersession. Ordinary re-refinement/admission still required. Extend integration lib/shelve-transaction.integration.test.mjs and guard suite using actual injected transaction.                                                                                          |
| gh/log-issue-time.mjs                                                                                                  | Fixed override keys timing/startTime; Estimate preserved; board only timing. Excluded semantic writer. Task 7 guard composition and existing timing seam prove Estimate/pending unchanged.                                                                                                                                                                                                                                                         |
| gh/set-rank.mjs                                                                                                        | Tether receives rank, no Estimate. Excluded semantic writer; Task 3 tether test proves omitted Estimate stays omitted.                                                                                                                                                                                                                                                                                                                             |
| gh/update-event-fields.mjs                                                                                             | Normally date/text bindings; configurable numeric bindings can target Estimate. Task 3 conditional event-field owner before Estimate effect; other bindings unchanged. Extend integration lib/update-event-fields-states.test.mjs plus guard suite with Estimate configuration and timestamp-only control.                                                                                                                                         |
| heal-backlog.mjs                                                                                                       | STATIC_KEYS preserve Estimate; RECONCILE_KEYS change timing. Excluded semantic writer; Task 7 guard composition and core/heal-backlog-fields.test.mjs prove Estimate/pending preservation.                                                                                                                                                                                                                                                         |
| migrate-fields-encoding.mjs                                                                                            | Identical parsed values rendered; not a revision. Task 7 guard composition and core/migrate-fields-encoding.test.mjs prove unchanged values/fence.                                                                                                                                                                                                                                                                                                 |
| lib/markers.mjs; lib/stage-entry-markers.mjs                                                                           | Pure marker positioning/rendering preserves fields. Task 2 projection tests and existing stage-entry tests prove preservation.                                                                                                                                                                                                                                                                                                                     |
| lib/dependency-disposition.mjs; lib/terminal-disposition.mjs; lib/stamp-start-time.mjs; verbs/migrate-dependencies.mjs | Explicit Disposition/startTime/legacy Blocked-by targets, not Estimate. Task 7 guard composition spies on exact targets and retained pending intent. No estimate history.                                                                                                                                                                                                                                                                          |
| lib/apply-review-delta.mjs                                                                                             | Reference occurs only in a comment declaring absence of imports; no field effect. Excluded on source evidence; Task 7 rejects a later unmapped Estimate effect.                                                                                                                                                                                                                                                                                    |
| preflight-issue.mjs; gh/create-issue.mjs                                                                               | Initial values/rendering, not existing-issue revision. Task 6 creation/continuation tests preserve initial fields without fake history; nested existing-issue tether must adopt its owner.                                                                                                                                                                                                                                                         |

Task 3 owns cancel-plan.mjs, shelve-transaction.mjs and gh/update-event-fields.mjs in addition to its listed files. Its writer-ID set adds cancel-plan/shelve/event-field. Test high Plan→saved low Refine restoration, body/board failure and compensation, high proposal clear/restore, unknown outcomes and retries; shelving pending-before-first-effect and every clear/journal phase, interruption and resume. Its expanded boundary is provisionally 12h instead of 8h; seven-child aggregate is 49h, still bounded below 24h per child. Actual refined fields and adaptive parent calibration replace assumptions.

### Remote no-commit effects and completion boundary

Task 5 additionally owns guard-registry/preflight composition, lib/code-complete-gate.mjs, lib/action-decision/test.mjs, verbs/issue-body.mjs, verbs/comment.mjs, verbs/epic-reconcile.mjs and no-commit verbs/deliver.mjs. Task 4 owns shared observation/catalog definitions and lands first; Task 6 owns kind/split only. No active parallel owner overlaps these remote boundaries.

Register fresh admission before effectful governed body/comment publication and no-commit completion/delivery records. Resolve body-operation input against the fresh issue; identify substantive Scope/AC/deliverable changes and new deliverable/completion evidence. Exact package-owned history/checkpoint or registered estimate publication keeps its recovery capability; arbitrary caller keys cannot claim exemption. Unknown publication purpose is restricted scoped-deliverable with typed preview/recovery, never permissive booleans. Preserve existing genuine evidence; new no-commit publication requires current scoped-deliverable capability. No local file target or unmatched Bash READ fallback is sufficient.

Actual code-complete and Test preflight consume the same fresh observation before accepting no-commit completion evidence. They do not ban Test/Review by state alone: checkpoint/history remain available, while assertions of newly completed scoped work require capability. Converted epics also need current materialized readiness. Deliver checks current capability before its first remote no-commit record effect, conjunctively with review/ownership. Existing requested AITM issue records are the effect boundary; no general messaging action is introduced.

Task 5 admission suite executes actual governed issue-body/comment, epic-reconcile, code-complete/Test and no-commit deliver adapters via injected fixture transports, including no-local-file-target commands. Cover audit/research/spike 23/24/25, initial/external estimates, pending/unavailable authority and converted-epic readiness. Assert zero new remote deliverable/completion effects on refusal and retained diagnostics/checkpoints. Extend unit lib/code-complete-gate-audit-494.test.mjs and verbs/deliver-no-commit.test.mjs for real seams. Task 7 composes publication→Explain→completion across the full matrix.

The remote effect boundary increases Task 5's provisional estimate to 9h. The revised total is 6+7+12+6+9+4+5=49h. The completed census is authoritative for Task 3's expanded files/writer IDs; the remote boundary is authoritative for Task 5's expanded files. Their additional targeted verifiers are part of the respective task sections. These are implementation obligations, not executed planning evidence.
