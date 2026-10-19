# Ongoing decomposition enforcement after re-estimation — #1908

- Issue: [#1908](https://github.com/kburson/ai-task-manager/issues/1908).
- Date: 2026-10-11, America/Chicago.
- Status: revised specification draft after SAR; no Refine acceptance, Plan approval, implementation evidence, or human exception is granted.
- Source baseline: `ec15d0ee80255cff3e1327eec28668bfe1d2e861`.
- Incident: [#1855](https://github.com/kburson/ai-task-manager/issues/1855) and [PR #1907](https://github.com/kburson/ai-task-manager/pull/1907).

## Intent and success criteria

A delivery owner must see when a story grows beyond the project's reviewable delivery boundary. Whenever a supported revision makes an individual story's published estimate at least 24 hours, record the estimate truthfully, visibly flag decomposition, and stop further product implementation. Evaluate at revision time and continuation time, rather than waiting for Plan exit. Keep the lifecycle state intact; allow checkpointing, inspection, decomposition drafting, and governed epic conversion/child creation.

The incident records a 10-hour starting estimate, a later XL/80-hour estimate, and an AI-authored 42-hour waiver. It does not establish which state first received 80 hours. Preserve these as historical evidence; use fixtures for repair tests and do not change #1855's live criteria or estimates.

Every supported writer and implementation admission surface must derive the same current decision. Missing, stale, conflicting, or unreadable authority never grants implementation permission. Distinguish epic aggregate effort from story effort while retaining independent plan complexity signals and materialized-child readiness.

## Current behavior and integration inventory

This inventory describes the source baseline. Follow the actual adapters and direct invocation routes during implementation.

| Surface                                                                                      | Current behavior                                                                                                           | Required integration                                                                                                        |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `scripts/task-tracker/lib/decomposition-policy.mjs`                                          | Shared thresholds review at 16 hours and must-split at 24; independent XL, task-count and verification-group signals.      | Retain the policy source and signals; distinguish story estimate from epic aggregate before collecting the estimate signal. |
| `scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs`                                 | Reads board and selected linked plan; accepts syntactically complete waiver prose; primarily runs at Develop entry.        | Reuse current assessment, remove prose-only admission, preserve epic WBS readiness.                                         |
| `scripts/task-tracker/verbs/inflate-estimate.mjs`                                            | Appends history, writes board Size/Estimate then body fields; catches projection-write failures and can return `appended`. | Assess publication, return explicit partial outcomes, preserve successful writes/history.                                   |
| `scripts/task-tracker/verbs/plan-estimate.mjs`                                               | Adaptive evidence enters authority executor; explicit compatibility mode writes a comment appendix.                        | Assess accepted estimates and published compatibility proposals; distinguish proposal from committed board estimate.        |
| `scripts/task-tracker/lib/estimation/plan-estimate-authority.mjs` and `runtime-adapter.mjs`  | Confirms appendix, board, body, forecast and ready marker; legacy Develop adoption checks parity.                          | Include assessment and final read-back; adoption assesses the existing estimate.                                            |
| `scripts/task-tracker/verbs/refine.mjs` and `scripts/gh/lib/project-tether.mjs`              | Publishes fields through tethering, then performs lifecycle work.                                                          | Assess field publication separately from an explicitly requested lifecycle transition.                                      |
| `scripts/task-tracker/lib/apply-reevaluate.mjs`                                              | Deep-dive heuristic writes estimates; multi-tier changes can require human review.                                         | Assess applied changes and display proposals without falsely applying pending human changes.                                |
| `scripts/task-tracker/lib/apply-refinement-estimate.mjs` and `refine-estimate-comment.mjs`   | Projects refinement/planned comments.                                                                                      | Assess newly published proposals; audit rendering alone creates no estimate authority.                                      |
| Start/resume, `lib/action-decision/session.mjs`, `verbs/explain.mjs`, `lib/action-decision/` | Binding/readiness and typed decisions have no ongoing decomposition observation.                                           | Collect current inputs and report capability-specific restrictions, including already-bound stories.                        |
| `scripts/task-tracker/activity-guard.mjs`, `activity-policy.mjs`, `source-edit-gate.mjs`     | Enforces classified activities, state, markers, ownership and mutation targets.                                            | Assess before product effects, including combined commands and multi-target edits.                                          |

Before implementation, finish a bounded call-site audit of all estimate writes, including generic field/body writers and initial creation. Updating an existing issue through any supported generic writer is a revision and must route through the shared publisher. Initial creation is not a revision, but continuation covers initially oversized stories. Historical rendering and outcome reporting are observations. The implementation plan must contain the final adapter-to-verifier map; no supported revision writer may remain unmapped.

## Selected approach

Compose one pure classifier, one current-authority collector, and one publication adapter into the existing writers and guards. Keep thresholds in the existing policy source. The issue-resident decision is a validated projection, not a reusable permission token.

A Plan-exit-only enhancement misses Develop growth and already oversized stories. Separate writer checks without continuation miss external changes and duplicate policy. Automatic splitting or demotion changes scope/history without reviewed child boundaries. None of those approaches meets this defect's intended behavior.

## Shared assessment contract

Add a focused `lib/decomposition-assessment.mjs` beside the existing policy module. It owns normalized inputs and assessment, not GitHub transport or command parsing. Keep read and publication adapters separate as needed to respect repository module limits.

Inputs identify repository, issue, project item, kind, estimate basis/hours, size, effective policy, selected plan and current scope. Publication uses existing whole-hour normalization; classification uses the published value. 23 does not trigger estimate must-split; 24 and 25 do. A proposed 23.1 becomes published 24 and triggers. Negative, non-finite, malformed or conflicting values cannot normalize to allowed. A genuinely unset early-stage estimate is unset, not zero; absence alone is not an oversized signal.

Policy identity includes `DECOMPOSITION_THRESHOLDS` values and classifier version. No copied 24-hour checks in entrypoints, unrelated new policy configuration, or divergent threshold source. Any future override must resolve through the same policy resolver and invalidate prior projections.

Keep independent XL, task count, verification groups and XL/group signals. A 23-hour story can still require decomposition from those signals. Retain section selection, containment and diagnostics. Absence of an optional early-stage plan permits estimate-only evaluation; a declared unreadable/invalid plan makes full implementation admission indeterminate. An observed estimate >=24 remains visibly flagged even with unreadable plan inputs.

Exclude only aggregate estimate signals for epics. Retain complexity classification and existing materialized WBS readiness at its normal boundary. Story-to-epic conversion is not automatic clearance: ordinary conversion and actual child readiness still apply.

Return a closed versioned result:

- `schema`: `aitm.decomposition-assessment/v1`.
- Repository, issue, project item, kind, estimate basis/hours, size, plan identity/content digest, policy digest and scope digest.
- `status`: `story-ok`, `needs-decomposition-review`, `must-decompose`, `epic-readiness-required`, `pending`, or `indeterminate`.
- Signals with code, value, threshold and severity.
- Observation identities/digests, `assessedAt`, and input digest over normalized semantic inputs; exclude timestamps and display text from that digest.
- Allowed capabilities and typed blockers derived from assessment; callers cannot supply permission booleans.

Use repository canonical JSON normalization. Reject unknown fields, duplicate markers, unsupported versions and invalid digest shapes. Scope identity covers scope/AC/verifier semantics plus selected plan bytes; exclude timing rows and display-only checkbox changes. Reuse the scope-identity helper where suitable, without claiming its baseline output already covers plan/policy.

## Authority and visible projection

Live project Estimate/Size and live issue kind/scope are primary observations. Adaptive estimates also verify the active forecast and ready marker against board/body. Compatibility appendices identify a proposal estimate: a published 24-hour proposal visibly flags decomposition without claiming a board write. Confirmed supersession retires the proposal from current inputs; old proposals remain history, not permanent blockers.

Persist one visible `## Decomposition Assessment` section and one protected `aitm-decomposition-assessment` marker through `mutateIssueBody`. Bind the closed result to inputs, estimate basis and publication operation. Extend the normal marker registry/invariants so generic editing cannot forge a current allowed result. Retain history; normal re-estimation audit entries additionally identify operation and assessment outcome.

The visible section states estimate/basis, threshold, reasons, status and permitted next actions. Waiver prose cannot erase the flag. Admission re-reads inputs and recomputes: the marker alone is never permission. Cached allowed results cannot survive changed estimate, scope, kind, plan or policy. Runtime caches may help display only.

Read-only Explain must not publish markers/history. It derives the current decision even if a marker is absent. Start/resume or sanctioned refresh can heal a genuinely absent projection from complete inputs, with confirmed read-back before advertising implementation. Stale, conflicting, malformed or unreadable authority yields indeterminate despite an old allowed marker. Complete current assessment can heal legacy issues without blanket migration refusal.

## Estimate publication and failure behavior

Compose existing writers with an issue-scoped publication operation. Retain ownership checks, issue locks and forecast claim locks; use stable operation IDs for retries. Threshold crossing must not reject truthful estimate recording.

1. Read issue/project/kind/plan/policy, validate the revision, and normalize exact intended inputs.
2. Before estimate effects, publish a visible pending assessment bound to the operation and proposed value. Pending denies implementation and labels the intended value as proposed.
3. Run existing estimate/history/forecast effects and record individual outcomes. Best-effort projection writes cannot imply complete success.
4. Read back required projections; derive and publish the final assessment through governed mutation.
5. Confirm assessment and live values still match. Return recorded estimate plus bounded/review or must-decompose disposition. Threshold crossing succeeds as a revision while implementation is refused.

These multi-resource writes are not remote atomic transactions. Pending publication, per-effect read-back and admission protect the continuation lane. Serialize cooperative writers under existing issue locks. Unsupported concurrent hosts leave conflicts/divergence fenced for reconciliation; do not claim global serialization. Revalidate before releasing product effects. This is a cooperative CLI/hook boundary, not protection against arbitrary shell bypass.

| Failure/drift                                       | Outcome and recovery                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Pending write fails                                 | No estimate effect starts; return persistence/authority failure.                                              |
| Some effects succeed, later effects fail            | Preserve successful values/history and pending flag; return partial with failed projections and operation ID. |
| Estimate succeeds, assessment write/read-back fails | Preserve estimate; return partial and deny implementation until sanctioned refresh confirms authority.        |
| Matching retry                                      | Read back, finish missing effects, refresh; do not duplicate history.                                         |
| Different estimate/scope/operation on retry         | Refuse replay; require fresh sanctioned revision or reconciliation.                                           |
| External change after publication                   | Reassess on bind, Explain and admission; never reuse prior permission.                                        |
| Estimate reduced below 24                           | Clear estimate signal only after confirmed publication; independent signals or divergence may still block.    |

Refresh repairs only assessment projection. It cannot rewrite estimate, erase history, change Status, or invent publication success. Repair failed estimate/forecast projections through their existing sanctioned operation with the original identity.

## Continuation and capabilities

Start/resume remains available to bind for recovery/inspection, with truthful timing and visibly restricted capabilities. Binding success is distinct from implementation admission. Refresh failure may retain an inspection binding but cannot admit product effects. Preserve Status, WIP and history; ordinary pause/resume remains truthful.

Extend typed action vocabulary, observation/producer registry, guidance/remediation catalog and validation tests together. Introduce `decomposition-required`, `decomposition-assessment-pending`, and `decomposition-authority-unavailable`. Known unresolved decomposition blocks implementation; unavailable authority makes it indeterminate. Explain must distinguish bind readiness from implementation readiness. Existing transition gates retain their requirements.

| State                               | Assessment                                                              | Continuation                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Backlog, Refine, Ready for Planning | Every applicable revision publishes immediately.                        | Existing pre-Develop prohibition remains; inspection and decomposition drafting allowed.                                                      |
| Plan                                | Adaptive and compatibility publication assess accepted/proposed values. | Approval does not suppress flag; Develop entry reuses assessment.                                                                             |
| Develop                             | Every supported revision assesses immediately.                          | Deny new product implementation under unresolved decomposition.                                                                               |
| Test, Review                        | Assess writers already supported here; do not extend their eligibility. | Read-only review/verification/checkpoint remains available; corrective implementation follows normal return path and decomposition admission. |
| Done                                | No implicit reopening/revision permission.                              | No continuation authorized.                                                                                                                   |

Evaluate capability and all mutation targets before effects. Allow reads, timing/issue inspection, pause, checkpoint commits of already present work, regular spec/decomposition Markdown, and exact governed split/epic-conversion operations. Their narrowly required records and branches follow existing contracts, not generic shell allowances. Checkpoint cannot run generators or combine with blocked source mutation. Physical containment and installed-guard protection remain unconditional.

Deny product source/config edits, product-generating builds, product-changing test edits and combined commands containing such effects. Read-only tests of checkpointed work may diagnose under existing state rules; their results do not imply new acceptance/approval. Cover apply-patch, supported shell redirects/interpreters and multi-file targets. Docs/scratch cannot hide sibling product mutation.

## Waivers

Version one offers no waiver of individual-story >=24-hour estimate enforcement. Human-authorized reviewed decomposition or genuine scope/estimate revision uses existing commands. Neither erases history nor allows dishonest estimate reduction. No new exception-authority subsystem is introduced.

Keep `## Decomposition Waiver` as historical context but remove prose-only admission of must-split work. This includes AI, Full-Auto, stale and unverifiable prose and #1855's 42-hour waiver. Independent signals remain visible. If a verified-human adapter genuinely supports a non-estimate exception, scope it to those requirements; it cannot waive estimate enforcement or erase the flag. Syntax alone grants no authority. Prove Plan-exit cannot bypass the ongoing guard.

## Verification and acceptance mapping

Use the requested two regression suites at exact issue paths. Invoke real writer/admission adapters with injected transport and effect spies; classifier-only testing is insufficient. Do not mutate live #1855 or create live children for tests.

| Issue AC         | Evidence                                                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1, `vc:1`      | Applicable writer/state matrix 10→23/24/25, truthful values and unchanged Status, visible/typed result, initially oversized story, epic exemption and normalized fractional input.                                                                        |
| AC2, `vc:2`      | Restricted start/resume, Explain parity, actual activity/source-edit refusal before effects, external changes, absent/stale/duplicate/malformed authority, unreadable board/body/policy/declared plan, mixed targets and permitted checkpoint/split lane. |
| AC3, `vc:1 vc:2` | Prior AI/Full-Auto and stale estimate/scope waivers cannot suppress flags or admission; Plan-exit cannot bypass.                                                                                                                                          |
| AC4, `vc:1 vc:3` | Independent signals at 23, bounded stories, selected plan sections, shared policy change invalidation and materialized epic readiness.                                                                                                                    |

`scripts/tests/unit/task-tracker/lib/decomposition-reestimate-guard.test.mjs` covers schema, threshold/kind/policy and publication failures/retries. Existing `inflate-estimate.test.mjs` and `plan-estimate.test.mjs` prove entrypoint composition, including adaptive/compatibility modes. Add focused refinement, re-evaluation and forecast tests beside existing adapter suites and list them in the plan without removing existing issue verifiers.

`scripts/tests/integration/task-tracker/lib/decomposition-reestimate-admission.test.mjs` exercises real composition over fixture authority, all applicable stages, current input collection, bind/Explain, both effect gates, permitted decomposition and denied mixed effects. Assert zero product effects on refusal while preserving Status/WIP/history/actual estimates. Cover deterministic publication-refresh-admission interleavings, failure after each remote effect and final read-back. Stubbing a final allowed result does not prove coverage.

Retain decomposition policy, Plan-exit gate and delivery-readiness regressions. Implementation must satisfy issue fast/slow, lint and format verifiers through the current sanctioned provider. Draft/SAR validates documents only and stamps no implementation AC or verifier.

## Delivery boundary

No #1847/#1855 transaction implementation, criteria mutation, automatic child creation, compiled native binary/addon/toolchain, or hardcoded project branch names. Implement with Node.js and Markdown. Attribute work to #1908 or reviewed children if refinement requires decomposition.

After SAR, Refine derives honest size/estimate from the complete adapter map. If #1908 itself reaches the story-size boundary, use reviewed decomposition, not a self-exception. The implementation plan pins exact schemas, lock nesting, capability entrypoints, adapter/verifier map and staged regression order. These details cannot weaken the specified contracts or leave a supported writer/admission unguarded.

SAR convergence means document readiness only. Human review, Refine acceptance, plan review/approval, implementation, verification, delivery and closure keep their separate boundaries.

## Admission and recovery decisions

These rules make the assessment statuses and publication protocol above explicit; the assessment can only further restrict capabilities already permitted by lifecycle, ownership and containment rules.

- `story-ok` permits the existing implementation lane when its other gates pass. A genuinely absent optional plan is allowed for estimate-only assessment; a declared but unreadable plan is not.
- `needs-decomposition-review` is advisory, preserving the current classifier's 16-hour review signal and Plan-exit warning behavior. A 23-hour estimate alone must never become `must-decompose`, a mandatory decomposition flag, or an implementation refusal. Reports distinguish advisory review from the mandatory >=24-hour estimate condition. Independent must-split signals still block at 23 hours.
- `must-decompose` denies new implementation and permits the bounded recovery capabilities described above. `pending` and `indeterminate` also deny new implementation. A known >=24-hour observation remains visible even when incomplete inputs make the overall decision indeterminate.
- `epic-readiness-required` is not an individual-story estimate violation. Aggregate hours alone do not block an epic. Preserve materialized WBS checks wherever the existing epic delivery/Plan-exit contracts require them; valid children satisfy that readiness boundary, and missing or unreadable required child evidence cannot authorize the affected action. Do not require epic readiness merely to read, bind, or draft decomposition.

Publication state is separate from the classifier's current-value result. A pending operation cannot be cleared because the old board/body values still agree, including a crash immediately after pending publication and before the first estimate write. Persist the operation identity, intended inputs, required effect set and confirmation evidence in the protected publication record. Admission and refresh inspect that record before deriving capabilities. Refresh may finish only a missing assessment projection after the original operation's required effects are confirmed; otherwise it preserves the pending fence and directs the existing writer to resume. A new sanctioned revision can supersede an abandoned operation only after it reconciles and records the original effect outcomes and explicitly links both identities. No timeout, binding, absent forecast, or unchanged values silently cancels an intent.

Conflicting current inputs or a stale/malformed projection deny implementation until sanctioned reassessment confirms the current input set and publishes a matching projection. An absent projection is similarly healed by start/resume or sanctioned refresh before product admission. Read-only Explain reports the absent/stale projection and computed result separately and never performs that repair. This does not require a blanket migration: complete legacy inputs can be assessed and projected through the same recovery lane.

## Minimum concrete adapter and verifier map

The final implementation plan must expand this map with exact injected ports and any further call sites discovered by audit. These are mandatory baseline surfaces, not optional examples.

| Production surface                                                                            | Required adapter evidence                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verbs/inflate-estimate.mjs`                                                                  | Existing `verbs/inflate-estimate.test.mjs`: comment, Size, Estimate and body effects individually fail/read back; matching retries do not duplicate inflation history.                                                                                                                                                                                           |
| `verbs/plan-estimate.mjs`, `lib/refine-estimate-comment.mjs`                                  | Existing `verbs/plan-estimate.test.mjs` plus the requested guard suite: adaptive dispatch, append, empty-table repopulation, upsert, duplicate/no-op, clear/restore and proposal supersession; comment-only proposals remain distinct from board publication.                                                                                                    |
| `lib/estimation/plan-estimate-authority.mjs`, `lib/estimation/runtime-adapter.mjs`            | Existing `lib/estimation/plan-estimate-authority.test.mjs` plus the requested admission suite: production runtime composition, each appendix/board/body/forecast/ready effect, legacy adoption and nested claim locking.                                                                                                                                         |
| `verbs/refine.mjs`, `scripts/gh/project-tether.mjs`, `scripts/gh/lib/project-tether.mjs`      | Existing `gh/lib/project-tether.test.mjs` plus requested guard/admission suites: direct sanctioned CLI and library estimate writes, Refine entry/refresh, no implicit Status write from assessment, and separately requested lifecycle effects under their original gates.                                                                                       |
| `lib/apply-reevaluate.mjs`, `lib/apply-refinement-estimate.mjs`                               | Existing `lib/coverage-apply-reevaluate.test.mjs` and `lib/apply-refinement-estimate.test.mjs` plus requested guard suite: applied revision, human-pending proposal, unchanged audit projection, failure/retry. A human-pending >=24-hour proposal is visibly labeled and restricts implementation pending resolution without claiming the estimate was applied. |
| `scripts/gh/migrate-project.mjs`, `scripts/maintenance/bind-issues-to-new-project.mjs`        | Requested guard suite: field-sync can publish Estimate on an existing issue; route semantic estimate publication through the shared adapter, preserving each migration's separately authorized operations. Mere field encoding or identical-value copying cannot mint implementation authority.                                                                  |
| `verbs/start.mjs`, `verbs/resume.mjs`, `lib/action-decision/session.mjs`, `verbs/explain.mjs` | Requested admission suite: actual adapters produce restricted bindings and read-only Explain parity, including existing bound sessions, no-network mode and recovery failure.                                                                                                                                                                                    |
| `activity-guard.mjs`, `activity-policy.mjs`, `source-edit-gate.mjs`                           | Requested admission suite plus existing source-edit/activity regressions: warm cache, early returns, chore/bypass modes, top-level read errors, multi-target edits and combined shell commands cannot skip decomposition admission for product effects.                                                                                                          |

Paths abbreviated as `verbs/` and `lib/` are under `scripts/task-tracker/`; existing unit suite paths abbreviated the same way are under `scripts/tests/unit/task-tracker/`. Keep the two issue-specified new suites at their exact paths already given above.

The generic audit follows `writeProjectFieldValue`, `tetherIssueToProject`, `ensureIssueFieldDb` and `formatIssueFieldDb` to effectful callers. Pure rendering, unchanged field encoding and historical reporting are not new estimate writers. New-issue creation is assessed on continuation. Existing-issue body changes that semantically change an estimate are revisions even when made through a generic governed mutation. Unsupported raw GitHub edits are detected on continuation rather than represented as cooperative publications. The implementation plan records each effectful caller's classification and verifier or a source-backed reason for exclusion.

Use one publication owner per operation. Nested tether/body/comment helpers accept the owning operation context instead of recursively reacquiring an issue lock or publishing independent pending records. Preserve the existing forecast claim lock and document a consistent issue/claim/body-lock acquisition order before implementation. This is an extension of existing publication machinery, not a new distributed transaction service or general event store.

Required recovery tests include pending-before-any-write followed by start/resume/refresh, each partially completed effect set, identical-value retry, proposal retirement, explicit supersession and a current low estimate with unresolved older publication intent. Assert no admission merely because board/body happen to agree. For hooks, exercise the executable boundary's exception handling as well as the pure evaluator: a transport/parser failure must refuse a recognized product mutation, even where the old wrapper passed through errors. Preserve read-only and exact documentation recovery lanes without allowing sibling product effects.

## XPR clarification: issue kinds and classifier vocabulary

The estimate condition applies to every supported non-epic delivery issue: `code`, `docs-only`, `audit`, `research` and `spike`. A defect is the issue-creation shape/bug label, not a distinct runtime kind; ordinary defects use `code`. No explicit marker retains the existing default `code` kind. Only a verified current `epic` has the aggregate-estimate exemption. A malformed, duplicate or unsupported explicit kind marker must produce indeterminate admission rather than silently exploit the legacy parser's default; preserve genuine unmarked legacy issues.

All non-epic kinds receive a visible mandatory flag and `must-decompose` at the same normalized 24-hour threshold. For code delivery this restricts the product effects already specified. For `docs-only` and no-commit `audit`/`research`/`spike`, it also restricts new substantive scoped deliverable writes/publication and no-commit completion evidence; lack of product commits is not an exemption from decomposition. Read-only investigation, checkpointing of existing work, status/history records and specification/decomposition preparation remain available. Publishing a new research/audit deliverable is distinct from preserving already performed investigation. These restrictions are capability-specific and must not suppress read-only inspection, thought or ordinary recovery records. Extend the AC1 kind matrix to all five non-epic kinds, default/unmarked code, a code-kind defect and epic aggregates; admission tests cover document/no-commit deliverable effects as well as source effects.

Keep the existing pure classifier statuses and signal severity, including `must-split`, for compatibility. Map a story's classifier `must-split` deterministically to assessment `must-decompose`; preserve `story-ok` and `needs-decomposition-review`. Pending publication, unavailable authority and epic readiness are assessment/admission overlays, not new classifier signals. Every consumer uses the shared mapping; no entrypoint interprets the legacy vocabulary as a separate permission policy. For an epic, exclude its aggregate estimate signal before classifying and apply the existing materialized-readiness contract to the affected action. Visible assessment, typed Explain and guard dispositions use the new assessment vocabulary while diagnostics can explicitly name the underlying classifier signal.

Published compatibility and human-pending proposals use `ceilEstimateHours` before classification too. A 23.5-hour proposal is explicitly proposed 24 and requires decomposition; it is never claimed as a committed board write. At the baseline, compatibility parsing uses `parseFloat`, but `runPlanEstimate` already normalizes through `normalizeEstimateProjection` before append/repopulation. Preserve that effective behavior and test the proposal/publication parity.

## XPR clarification: governed recovery and guidance adapters

The minimum adapter/verifier map also requires:

| Production surface                                                                                                                         | Required adapter evidence                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/task-tracker/verbs/kind.mjs` and `scripts/gh/lib/epic-metadata.mjs`                                                               | Existing `verbs/coverage-kind.test.mjs` and requested guard/admission suites: authorized kind changes run through their existing ownership/body/DoD/epic-metadata contracts, then reassess and refresh the projection for the observed new kind. Failed refresh denies product/deliverable admission. A non-epic kind cannot escape the estimate condition by becoming another non-epic kind.           |
| `scripts/task-tracker/verbs/split-plan.mjs`, its `lib/split-plan.mjs` helpers, and sanctioned `scripts/gh/create-issue.mjs` child creation | Existing `verbs/split-plan.test.mjs` plus requested admission suite: exact dry-run proposal, reviewed confirmation, conversion and child-creation paths are permitted under decomposition restrictions when their original authorities are available; unsupported/mixed sibling effects remain refused. Preserve original child enumeration, scope review, lifecycle, ownership and parent/child gates. |
| `scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs` and all decomposition remediation/guidance producers                          | Existing `lib/decomposition-plan-exit-gate.test.mjs` plus requested guard/admission suites: required actions lead to governed split preparation, current assessment recovery or truthful re-estimation. No >=24-hour estimate refusal, warning or guidance recommends authoring a `Decomposition Waiver`.                                                                                               |

The unit paths abbreviated `verbs/` and `lib/` in this table use the same unit-test base defined above. A kind/body change that affects assessment is not itself an estimate revision; use the shared current collector/projection adapter inside that operation's existing write boundary, not a fabricated estimate history entry.

The permitted recovery lane includes `must-decompose`, `pending` and `indeterminate`, but grants only the exact decomposition capability, not unavailable ownership or scope authority. If an indeterminate result means the split's required live body, plan, children or policy cannot be read, the effectful split/conversion remains refused under its original gates; inspection and preparation from available evidence remain possible. Pending estimate publication is retained across kind changes and split preparation. Reconcile or explicitly supersede its recorded effects through the publication contract before claiming operation completion; a kind refresh cannot cancel the original intent.

Converting an unresolved oversized story to an epic refreshes the current assessment and stops treating the parent's estimate as an individual-story signal. It retains a visible unresolved decomposition/readiness disposition and conversion provenance until the converted scope has reviewed, materialized children satisfying the existing readiness contract. Conversion alone never grants implementation or completion admission, and does not fabricate a ready epic. Existing epics with large aggregate estimates retain their ordinary readiness behavior rather than acquiring a new aggregate-size violation.

Retire the baseline remediation in `decomposition-plan-exit-guard.mjs:122` that says to add a complete visible waiver section, and audit related guidance producers for the same recommendation. Remove the prose-waiver success/warning branch at the shared assessment composition boundary. Historical waiver text remains readable evidence; it is not a suggested action. The no-waiver-remediation regression must exercise real Plan-exit output, typed Explain guidance and ongoing admission, including the known prior AI-waiver fixture. This change does not alter unrelated independently authorized exception policies.

The state table uses the current lifecycle name `Ready for Planning`; the historical On Deck storage slot is not an additional stage.
