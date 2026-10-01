# #1857 Complete Outcomes Revised Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to execute this plan sequentially. No helper agents or new issue graph. The user explicitly replaces per-file and 2–5-minute checkpoint ceremony with complete, reviewable outcomes. Checkboxes track outcome completion, not authorization to bypass normal gates.

**Goal:** Finish all of #1857: unrestricted artifact authoring, trustworthy multi-actor engagement through lawful delivery, durable recoverable runtime, and usable safe cleanup with a shipped skill.

**Architecture:** Preserve the implemented shared artifact policy and validated physical-root resolver. Finish timing as one producer-to-consumer contract, then deploy storage relocation together with its complete migration/recovery path, then ship cleanup and provider skill integration as one usable capability. GitHub and native host evidence retain their canonical roles; local caches do not become authority by relocation.

**Tech Stack:** Existing Node.js ESM package (Node >=24), Git, GitHub canonical records, node:test, current package installer and registered AITM CLI. No new service or dependency is assumed.

**Spec:** `docs/superpowers/specs/2026-09-30-1857-durable-runtime-cleanup-design.md`, accepted digest `bafb27685858804b7cac62870cbf260439575d5c925903337ef0cfc05e21f4f0`. Read with the immutable earlier plan `docs/superpowers/plans/2026-09-30-1857-durable-runtime-cleanup.md` (digest `1f2a325b3dd709da4fa5cf3e4de606768d76c1692ccd42550911b4ad3e09fe13`) and `docs/superpowers/specs/2026-09-30-1857-actor-timing-contract-addendum.md`.

## Status and authority

This is the requested revised **draft**, prepared from the accepted documents, current source, six-path WIP and stopping evidence. It is not a renewed Plan approval, completed implementation, or authorization for live migration/deletion. The issue remains Develop. Fresh Explain reports unticked original ACs, pending finalization and an unclassified Develop-exit refusal; resolve those through normal workflow at the actual exit, not an arbitrary Develop-to-Plan jump.

The accepted documents remain byte-for-byte unchanged. This master execution sequence replaces their fragmented task/checkpoint order once reviewed; it preserves every R1–R9 requirement and the later actor/Close compatibility obligations. One future independent review of this complete revised plan is required before source resumes; no review is launched by drafting it. Keep genuine Astra source authorship and normal independent code review at the delivery boundary.

The historical Refine estimate was 4h; the live issue field is 7h and its original adaptive forecast covers original scope. The expanded 24–36h advisory range is stale and is neither a remaining estimate nor an elapsed-time measurement.

## Global constraints

- Ordinary physical docs artifacts remain writable regardless of binding/lifecycle; prohibited script formats remain prohibited in docs. Every format in .scratch and .tmp remains freely authorable. Neither volatile directory may hold AITM-owned durable authority.
- All durable AITM runtime is below .ai-task-manager/runtime, with explicit local/main anchoring. Preserve native transcript and GitHub canonical authority, originals, queued work, recovery/audit data and genuine identities.
- No volatile auto-import/fallback, fabricated timing, backdated engagement, forged receipt, missing-command exemption, caller-crafted unavailable grant, guard editing, or automatic destructive cleanup.
- No real worktree/branch removal or live runtime cutover is authorized now. Later migration needs an observed exact plan, explicit trust and quiescence approval. Later cleanup needs exact approved candidate selections and fresh evidence.
- Keep original four protected AC declarations/markers unchanged. Record expanded evidence against R1–R9 and ordinary VC IDs through sanctioned metadata routes; do not create a dependency on #1847.
- Unit tests remain pure with scoped injected adapters; subprocess/Git/host integration belongs in integration/slow fixtures. No environment switch that weakens production validation.
- Protect exact own timer, worktree and branch; record test/review work as engagement. Parallel actors add independently. Unknown observations and interrupted ends remain unknown.
- Preserve seven dirty APR operational files, their .bak copies and loose APR startup/invitation files. Do not stage, reset, stash or archive them as part of this plan.

## Current code and evidence baseline

Production baseline HEAD: `c096289ab7fae845871a2eafb471b2e34f842349`; reviewed HEAD `ba5d00817fd387181d9a264f7687c186a3370f9e` adds only plan/SAR documents, so the production census and six-path WIP remain applicable. Branch `codex/1857-draft`. All paths below are repository-relative. Current runtime-adapter estimationOutcomeSamples/listComparableOutcomes, reports storyRow null-variance access, and log-issue-time's legacy-only numeric fields are explicit unfinished consumers. “Complete targeted behavior” means demonstrated behavior at the named checkpoint, not whole-issue completion.

| Requirement / surface                | Current status and evidence                                                                                                                                                                                                                                                                          | Remaining outcome                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| R1 artifact authoring                | Complete targeted behavior: shared artifact policy/guards at 26ccdd57 and review corrections at 825b5e34. Physical aliases, installed guard sensitivity, docs suffixes, research script relocation and packaging/coverage corrections exist.                                                         | Preserve and reverify with Outcome 2's new runtime protection; final original AC/VC gates still pending.                    |
| R2/R4 root selection                 | Complete targeted root identity behavior at 3233f22c: runtime-storage resolveRuntimeRoot/readPhysicalRuntimeIdentity, centralized aliases, scoped test adapters and reader conversions.                                                                                                              | Storage paths still use volatile defaults. Root validation alone does not relocate stores.                                  |
| R2 production storage                | Not deployed: paths.mjs TMP_AITM_REL is .tmp/aitm; tmpAitmDir/sessionDir/state/queue/cache still use it. legacyPathFor/existingRuntimePath and loadState fallback remain.                                                                                                                            | Outcome 2 closes every reader/writer/default/override and physical owner boundary together.                                 |
| R3 recovery                          | Partial standalone primitives at 797c530d/9445335c: runtime-migration-plan/apply/lock/admission and storage validation. Historical 43/43 checks cover primitives, not installed bootstrap or deployment.                                                                                             | Registered verb, production schema catalog, real killed-process recovery, all-writer fencing and actual cutover are absent. |
| R9 timing core                       | Complete targeted helpers at ae15bbc4/c02c0a73: timingActorKey, marker parsing, reconcileActorCoverage, deriveActorEngagement, opt-in rows/queue evidence and incomplete rollups.                                                                                                                    | Live producers and all downstream consumers are not consistently coupled.                                                   |
| R9 incomplete source-story Close     | Partial committed integration at c096289a: canonical timing source, strict row parsing, snapshot lineage, v2 writer/readback and source-story Close. Normal checkpoint 217/217 plus controller 50/50; no claim all R1–R9 passed.                                                                     | Every lawful kind/forecast lane and every consumer must work before live adoption.                                          |
| R9 provenance/forecast compatibility | Uncommitted six-path WIP: outcome-builder, outcome-record, outcome-writer, runtime-adapter; integration timing-actor-runtime and unit outcome-telemetry tests. Latest legacy approval test 1/1; no-command fixture RED remains. Earlier focused 18/18 and 30/30 are subset results.                  | Entire WIP belongs to Outcome 1. Preserve, reconcile and verify it; do not force an intermediate “green” release.           |
| R5/R6/R7 cleanup                     | Not started as capability: no registered cleanup or migrate-runtime handler; generic existing cleanup utilities are not this deliverable. lib/cleanup-base-aware.mjs (#871) uses message-based issue-token reachability and prune/rebase recommendations; it cannot supply R6/R7 full-content proof. | Outcome 3 implements inventory through observed apply, managed retirement, local/origin proofs and recovery.                |
| R8 skill/install                     | Genuine isolated skill RED baseline is durable in docs/reviews/1857-expanded/1857-cleanup-skill-baseline-evidence.md. No cleanup skill shipped.                                                                                                                                                      | Outcome 3 includes command, skill, installer/provider parity and scenario GREEN as one product.                             |
| R9 delivery authority                | Original approval and exact historical receipts remain historical. Current ACs unticked, no whole-scope code review/final receipt.                                                                                                                                                                   | Final normal gates across all outcomes.                                                                                     |

Preserve `docs/reviews/1857-expanded/1857-fixture-containment-incident.md` and `2026-10-01-1857-stop-and-replan.md`. A nested fixture with a bare state.json previously selected the parent .ai-task-manager owner and cleared the author's overlay. The fixture correction is committed; production projectDirForState's generic anchor is still a real gap. The interrupted older author span has unknown end; never “repair” it by inventing a boundary.

## Execution model and one upfront integration inventory

- [ ] Before any source work, review this whole plan and rebaseline an outcome-level execution budget. Keep all work under #1857. Do not reopen lifecycle stages or assert a new adaptive forecast when no registered route permits it.
- [ ] Establish one supported normal worktree execution route: exact physical owned worktree, genuine session, self-link, live issue/branch and normal source/write/test/commit transport. Characterize the registered explicit foreign-worktree route or run the author natively in the owned checkout. Do not repeat native HOST chore ON/OFF windows per file. If that capability is unavailable, present one exact admission refusal and a bounded environment-remediation decision before implementation; no nested defect/worktree graph or installed guard edit.
- [ ] Freeze a single cross-outcome contract and fixture census before changing defaults or emitters. Use the current inventories below and the mechanically generated candidate census appendix. Resolve every entry to local/shared/native/advisory and sync/async reader/writer, with explicit test classification. Include bin, hooks (including shell), scripts/lib, scripts/maintenance and config/provider JSON in the same upfront scan, not only the ESM roots in the historical appendix. Fresh SAR inspection adds hooks/commit-trail.sh, hooks/task-tracker.sh, bin/cli.mjs, scripts/maintenance/capture-guidance-lifecycle.mjs and scripts/maintenance/capture-guidance-explain.mjs as explicit forwarding/entrypoint candidates. This is one batch inventory, not a reason for per-file approval. Keep ordinary config/templates distinct from runtime authority.
- [ ] Write behavior REDs for each outcome's exit matrix before implementation, then work the coherent outcome. Run focused tests when they resolve a changed behavior, aggregate compatibility once the contract is coherent, and full lanes at outcome/final boundaries. Reuse unchanged valid evidence where the registered workflow supports it; never relabel old-SHA receipts as new.
- [ ] Commit review-worthy coherent outcome changes only with normal enforcement and registered commit trace. Do not request review/permission for each helper, fixture or file. Report meaningful behavior/result, budget variance or a concrete blocker. A scope or destructive authority change still needs its actual decision.

No production work, test loops, commits or peer review are part of this drafting turn.

## Self-hosting containment and release admission

The self-link makes uncommitted source live to hooks. An outcome commit is not an isolation boundary. Before emitter or storage edits, the one environment-admission step must establish an immutable, known-good execution image for this worktree's hooks and lifecycle commands through the existing registered package installer/configuration route. Record its committed source identity, packaged file digest, resolved executable/hook paths, actual project root, and genuine actor identity. Keep the owned source checkout and six WIP paths intact; do not change installed guard source, disable hooks, spoof identity, or silently redirect authority to another checkout. Tests execute the candidate implementation against isolated fixtures; live hooks and timing continue on the stable image until an explicit cutover.

Characterize this route once before source work with read-only path observations and normal source-write/test/commit admission. If the installer cannot bind a stable runtime image to the actual owned worktree without weakening guards, record one concrete capability refusal and use the sanctioned environment remediation decision; do not start editing live emitters/defaults or repeat per-file chore windows. No guessed installation flags or manual installed-hook edits are authorized by this plan.

Outcome 1 source and tests may become coherent without activating the new emitters in this repository. Outcome 2 prepares the complete bootstrap, supported schema migration and installed guard chain. This repository adopts both the new emitters and durable defaults at the same separately admitted, quiesced live migration/cutover. Preserve its original timer/words/queue bytes and genuine migrator ledger. Do not emit partial new-generation evidence into #1857 while developing. A release/integration fixture must prove an active author retains its exact start, word cursors and queued evidence across edits and cutover; no mixed-generation row is published by a half-adopted producer. Historical pre-cutover rows remain historical and explicitly unattributed where necessary.

## Shared runtime and fixture inventory

Current source-grounded families from paths.mjs, state.mjs, queue.mjs, session-state.mjs and the schema inventory:

| Family                            | Owner / principal files                                                                                                                  | Conversion and evidence obligation                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Global state and chore audit      | Local; state.mjs, lib/chore-mode.mjs, config.mjs                                                                                         | Known extensible field schema; typed corruption; never inherit a different actor's start/words or turn corrupt data into empty grants. |
| Active sessions and gates         | Local; session-state.mjs, lib/session-store.mjs, lib/bound-state.mjs                                                                     | Exact physical owner/session; missing optional gates grant nothing; preserve generation and closed status.                             |
| Publication queue                 | Local; queue.mjs, runtime.mjs, hook-handler.mjs, lib/timing-post-outcome.mjs                                                             | Preserve original actor/interval/words and bytes; lease complete drain and RMW, not only final write.                                  |
| Fleet, occupancy, closed bindings | Main; fleet-registry.mjs, lib/occupancy.mjs, lib/worktree-binding-lifecycle.mjs                                                          | Reuse strict schemas; preserve paused/live records; all-root census and claims.                                                        |
| Issue/timing/orchestrator locks   | Local issue/timing, main orchestrator; issue-mutator-lock.mjs, orchestrator-lock.mjs, gh-timing-comment.mjs, estimation/record-claim.mjs | Real owner/process identity, confirmed death, nested lease behavior, no age-only takeover.                                             |
| Verifier cache                    | Local; lib/verifier-cache.mjs                                                                                                            | Versioned supported entries; noncanonical, cannot replace exact-head GitHub receipt.                                                   |
| Provider cursors/mirrors          | Local; word-counter.mjs, scripts/providers/claude.mjs, codex.mjs, grok.mjs                                                               | Genuine native provenance; preserve word/full cursors; safe transcript override; local mirror never wins merely by existence.          |
| Hook idempotency/capture          | Main; lib/hook-idempotency.mjs, lib/action-capture.mjs, capture-actions.mjs                                                              | Filename stamp semantics and exact binary capture buffers/hashes; not universal JSON/UTF-8 decoding.                                   |
| Draft and R4P recovery            | Local draft-branch.mjs; main lib/ready-for-plan-migration-freeze.mjs and ready-for-plan-migration.mjs                                    | Preserve journals including .db/aitm; inspect supported evolution; never classify recovery as disposable cache.                        |
| Test sandboxes/reaper             | Local durable registered worktrees; verbs/test.mjs, lib/test-sandbox-reaper.mjs                                                          | Exact registered foreign target; own nested state/session/queue/gates; no inherited parent authority.                                  |
| Other protected transactions      | lib/shelve-transaction.mjs, lib/reopened-close-recovery.mjs, delivery journals and lifecycle modules in census                           | Trace actual path APIs and classify durable state versus canonical remote records; no omitted direct writers.                          |
| Legacy/custom paths               | paths.mjs legacy map, state/config overrides, provider declarations and older .ai-task-manager/.claude sources                           | Explicit migration input with duplicate/trust disposition; no runtime fallback.                                                        |
| Advisory outputs                  | run-tests performance output and isolated artifacts                                                                                      | May remain volatile only if never consumed as admission or durable evidence authority.                                                 |

Fixture policy: use `scripts/tests/helpers/unit-runtime-root.mjs` for scoped pure unit adapters and `scripts/tests/helpers/runtime-root-fixture.mjs` for real Git integration. Inventory all alias, state path, tmp/runtime and provider fixtures together. Root creation, cwd/env/console setup and cleanup must be exception-safe. External parent sentinels must prove nested load/clear cannot touch the parent; never exercise actual author's state as a sentinel. Maintain static reader characterization at `scripts/tests/unit/task-tracker/lib/project-root-readers.test.mjs`, unit purity and guidance-import inventories without raising budgets or weakening assertions merely to pass.

## Outcome 1 — Trustworthy multi-actor timing through lawful Close and reports

**Delivered behavior:** Two genuine actors can work concurrently, queue/replay their own evidence, pause independently and complete every existing lawful delivery lane. Complete observations produce complete totals; unavailable history produces canonical explicit Unknown plus a known subtotal, without losing work, fabricating commands or blocking Close solely because old telemetry is incomplete.

**Existing interfaces to finish:** timingActorKey(identity), timingEngagementMarker(value), parseTimingRow(line), deriveActorEngagement(rows,nowTs), reconcileActorCoverage(intervals,candidate); createEstimationOutcomeRuntime({cfg,projectDir,resolveVerificationSha,deps}).ensure; buildEstimationOutcome; ensureEstimationOutcome; validateOutcomeTimingSource; Close's ensureDeliveryAuthorized/assertFieldsPersisted.

**Files:** Retain the actor addendum's exact core/producer/consumer/test inventory, and include `verbs/pause.mjs`, `state.mjs`, `session-state.mjs`, `word-counter.mjs` and `queue.mjs` where genuine actor isolation crosses the current shared compatibility ledger. No silent expansion to unrelated lifecycle behavior. Main consumer edits are runtime.mjs, gh-timing-comment.mjs, timing-rollup.mjs, lib/estimation/{runtime-adapter,outcome-builder,outcome-record,outcome-writer,renderers,rubric-model}.mjs, scripts/gh/log-issue-time.mjs, heal-backlog.mjs, lib/github-records/singleton-projections.mjs and scripts/reports/lib/estimation-records.mjs. All six WIP paths are reconciled here.

- [ ] Version every changed persisted state/session/queue/word-cursor shape before emitter adoption. Record exact pre-Outcome-1 and post-Outcome-1 schema generations and supported readers in the shared catalog; Outcome 2 must migrate both, including mixed-generation queues, without dropping entries. Use the path/state/session APIs rather than new literal storage roots. Keep public canonical outcome versions separate from these local schemas.
- [ ] Harmonize the whole evidence contract first. Public actor key is a versioned hash of validated provider/SID; exact tuple stays protected locally. Current real entryStart and observed current flush establish an interval without inserting a historical start. Queue freezes original identity, interval and word/full-cursor baselines before posting. Replay by another actor cannot reattribute; same-actor coverage unions, different actors add. Lifecycle phase facts remain shared context, not invented per-actor enters.
- [ ] Complete producer-to-consumer handling of unavailable evidence. Native/provider collector requires supported complete observation coverage to claim observed zero; metadata-only, missing/truncated/unrecognized evidence is unavailable. Wall engagement remains known separately. No global latest-row truncation, global max word marker, inferred human-review gap charge, Number(null) conversion, or shared pause/word-state contamination. Preserve exact fractional bounds and terminal suppression. Legacy untagged numeric work keeps totals incomplete.
- [ ] Finish the WIP contract for complete v1 and incomplete outcomes before adopting emitters. First inventory canonical persisted schema versions: current WIP adds mandatory fields to a strict v2 reader, so do not assume older v2 records are absent or reinterpret them silently. Preserve existing v1 and genuine v2 semantics; use a new explicit version or a documented unambiguous compatible reader transition for added provenance fields. Missing historical proof remains unavailable/refused as appropriate, never synthesized; correction uses normal immutable supersession. v2 proof binds repository/issue/head, actual verification/delivery record identity and canonical digest. Source-story keeps unchanged exact Test classifications/fingerprint. No-command issue-resident and root epic use freshly verified existing delivery authority, including required matching Test/Review heads; empty commands is not absent authority. Ordinary root epic aggregate-child delivery uses the existing merged-PR gate; historical no-commit epic records remain readable but are not a new ordinary no-commit grant. Preserve the distinct authorized recovery routes enumerated below.
- [ ] Add a narrow fresh delivery callback to the runtime from Close's already-resolved ensureDeliveryAuthorized({refresh:true}); no outcome/gate recursion or ctx verifier bypass. For issue-resident no-source diff, real Git must show exact accepted HEAD and complete issue-attributed commit inventory zero. Preserve issueAttributedDiffEvidence's source-story requirement; do not substitute unrelated trunk diff or fabricate a sandbox/command.
- [ ] Complete forecastStatus compatibility: frozen exact forecast; legacy-none only story with fresh complete corpus proving no forecast of any status and no frozen/ready claim; epic-not-applicable only epic. Legacy Plan approval without forecast-record-id is valid. Malformed claim-looking attributes, partial/adaptive records and contradictory kind refuse. Recheck fresh record corpus and fresh delivery body after writer/readback; concurrent forecast appearance refuses without silently mutating the written record.
- [ ] Preserve immutable canonical snapshot lineage and retry. Drain original queue before first freeze. Validate unique fully paged comment/record identity; preserve prefix plus footer with actual append behavior; reject changed/truncated/reattributed evidence and non-emittable successor aliases. Compare fresh proof identity/digest before prior payload reuse. Reject malformed original rows including normalized impossible calendar dates (February 31, 24:00), while supporting documented valid ISO/fraction/offset timestamps.
- [ ] Make Unknown a coherent product result. log-issue-time returns a structured incomplete outcome rather than generic outage; real transport failure remains failure. Board/body must not publish zero/partial as complete or silently display retained stale numeric totals as current. Singleton renderers and story/epic reports handle null variance/stages and show reasons/known lower bound. Fix calibration ingress as well as rubric-model: runtime-adapter.mjs estimationOutcomeSamples currently demands a forecast for every story and throws before the model can exclude legacy-none v2; listComparableOutcomes forwards all story payloads. Both must explicitly exclude incomplete outcomes from quantitative samples without rejecting lawful legacy-none records or substituting board values. Missing mandatory actual work evidence still refuses Close.
- [ ] Adopt all live emitters last within the same outcome, including hooks, pause/resume/switch, Test/Review/approval/close and phase transitions. Historical projections preserve their actual attribution or unknown. Complete end-to-end regression proof, style and affected lanes before the outcome commit.

### Source-derived lawful Close and provenance matrix

Do not equate NO_COMMIT_KINDS with terminal delivery authorization. issue-kind.mjs includes epic for Develop/Test, while isIssueResidentDeliveryKind explicitly excludes epic. requireDeliveryReceipt in close-delivery-receipt.mjs uses the latter, skips the top-level PR receipt for children, and separately handles explicitly authorized local-trunk close. no-commit-delivery-record.mjs can parse historical epic records; that schema membership alone does not authorize an ordinary root epic close. Preserve all these distinctions, including rejected combinations.

| Existing lane                                                           | Outcome and forecast rule; unchanged authority                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top-level code, frozen or genuine forecast-free legacy                  | Story telemetry; exact normal Test and Review head, command/classification/fingerprint and delivery proof. Frozen means exact forecast; legacy-none needs complete zero-forecast census and no claim.                                                                                                                  |
| Commit-bearing docs-only                                                | Story telemetry with the existing diff-decides testless contract; real accepted Test/Review heads and delivery remain required, no invented automated command.                                                                                                                                                         |
| Issue-resident audit, research, spike                                   | Each kind exercised separately. Story-compatible telemetry only through freshly accepted no-commit record, deliverable and matching Test/Review head. Forecast eligibility is observed frozen or rigorously proven legacy-none, never kind-based fabrication; incomplete records never enter quantitative calibration. |
| Child code/docs/no-commit task and sub-epic                             | Preserve parent lineage and merge-back/child acceptance gates. The skipped top-level PR check is not proof; provenance references the actual accepted child/parent delivery authority. Sub-epic uses epic forecast-not-applicable semantics; ordinary children retain their kind's forecast rule.                      |
| Ordinary root epic                                                      | Epic telemetry, forecast-not-applicable; aggregate child history delivery uses current merged-PR authority. NO_COMMIT_KINDS only relaxes its Develop/Test command expectations. Historical epic no-commit records remain parseable but cannot substitute for this gate.                                                |
| Explicit local-trunk lane                                               | Preserve the real local-trunk receipt/journal/burn and accepted Test/Review heads, not a caller skipped flag. Kind/forecast rules remain those of the underlying issue.                                                                                                                                                |
| Evidence-v2 cycle and pinned delivery waiver                            | Preserve exact acceptance/intent/delivery cycle identity and actual waiver grant/burn validation. Telemetry cannot fabricate a grant or replace verification. Forecast follows underlying kind and observed records.                                                                                                   |
| Incident epic                                                           | authorizeIncidentEpicCloseForCommand and its live owner/convergence/incorporated outcome evidence remain additive to native child/delivery gates; epic forecast-not-applicable.                                                                                                                                        |
| Historical false-delivery recovery, including epic historical-no-commit | Preserve strict historical kind/deliverable/record correlation and recovery audit authority; do not reinterpret as current ordinary no-commit permission. Keep historical outcome immutable or use explicit versioned correction under the recovery authority.                                                         |
| Reopened-close recovery                                                 | Bind to exact reopened transaction, accepted replacement head and verified recovery record; prefix/successor lineage remains valid. Reuse/correct immutable outcome only under that actual recovery contract.                                                                                                          |
| Non-delivery terminal disposition (cancel/duplicate/etc.)               | Preserve the existing disposition path; no fabricated delivered outcome, forecast, Test command or calibration sample. Timing availability must not convert the disposition into delivered status.                                                                                                                     |

All rows are regression cases through their actual production gate paths. A missing required receipt remains refusal; a lawful branch with no top-level receipt must use its own fresh authority, not a generic skipped/no-receipt exemption.

**Exit matrix established before coding:**

| Scenario                                                                                                                                                           | Required result                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Overlapping actors, one pauses while other continues; queue drained by third actor                                                                                 | Independent wall/word coverage retained; no global truncation; exact replay is idempotent and contradictory row replay refuses. |
| First tagged flush after legacy numeric history; fraction precision; paused actor at Review                                                                        | Known interval preserved, historical remainder Unknown, genuine inactive tail valid; no fabricated resume/start.                |
| Missing/truncated native activity vs supported observed idle interval                                                                                              | Unavailable distinct from observed zero; task/test execution counted in genuine actor engagement.                               |
| Persisted predecessor v2 read/retry/correction compatibility; complete v1; v2 source/frozen; v2 source/legacy-none; issue-resident/no-command; root epic/merged PR | Each real production lane succeeds only with its existing required authority; no invented forecast/Test command.                |
| Forged unavailable flag, wrong issue/repo/head/forecast/proof, missing Test/Review, skipped receipt                                                                | Refusal before completion; actual work gates remain intact.                                                                     |
| Queue pending; duplicate/truncated canonical source; changed proof; later valid close tail; concurrent forecast                                                    | Correct publication/retry or explicit refusal; no immutable record rewriting.                                                   |
| Impossible original dates/unknown events, changed prefix, quoted embedded heading                                                                                  | Invalid evidence refuses; unrelated embedded heading does not create false canonical source.                                    |
| CLI→board/body→report→calibration→Close                                                                                                                            | Explicit Unknown end-to-end; no null exception, stale numeric substitution or quantitative calibration.                         |
| Pause/flush in nested fixture and two actual sessions                                                                                                              | Parent/session sentinels and other actor words/timer unchanged.                                                                 |

Use existing actor/accounting, provider, rollup, outcome writer/schema/runtime, close-convergence/coverage-close, log-issue-time, singleton-projection, report and heal-backlog suites named in the addendum. Add integration coverage for the real default Git and fresh delivery gate paths, not only injected proof booleans. Acceptance assertions include:

```js
assert.equal(outcome.payload.telemetry.status, 'incomplete');
assert.equal(outcome.payload.actual.engagedHours, null);
assert.equal(outcome.payload.telemetry.knownEngagedMs, expectedActorUnion);
assert.deepEqual(replayedOriginalEvidence, queuedOriginalEvidence);
assert.equal(parentSentinelAfter, parentSentinelBefore);
assert.equal(calibrationSamplesForIncompleteSpike.length, 0);
assert.equal(calibrationSamplesForIncompleteAudit.length, 0);
```

## Outcome 2 — Durable runtime with usable migration, recovery and free volatile authoring

**Delivered behavior:** A fresh install or explicitly migrated repository uses durable local/main stores. Deleting/tampering all old scratch/tmp bytes cannot change admission. An engaged genuine migrator can recover after real process death through the installed registered command without manual control editing. Ordinary artifacts remain writable even when runtime is missing/corrupt/incomplete.

**Existing interfaces:** resolveRuntimeRoot, runtimeStoragePaths, assertRuntimeReadable, assertRuntimeOverrideSafe; planRuntimeMigration({projectRoot,mainRoot,adapters}); applyRuntimeMigration({plan,approvedPlanDigest,adapters}); readRuntimeMigrationStatus; resumeRuntimeMigration; withRuntimeWriterLease and withRuntimeWriterLeaseSync; classifyRuntimeMigrationInvocation. These currently form partial primitives, not deployed commands.

**Files:** Complete lib/runtime-storage.mjs, runtime-migration-{plan,apply,lock,admission}.mjs and facade runtime-migration.mjs; create verbs/migrate-runtime.mjs. Couple paths/state/config/runtime/session-state/queue/fleet/word-counter, every writer in the inventory, provider stateDir declarations, draft-branch, action-capture, idempotency, R4P journals, test/reaper and mutation-context/source-edit/activity/Bash guards. Register through bin/aitm-registry.mjs, task-tracker.mjs, verbs/help-data.mjs and lib/command-surface/catalog.mjs. Document .ai-task-manager/README.md and ignored runtime data; installer preserves it.

- [ ] Define upgraded-but-unmigrated as a distinct durable admission state: populated or ambiguous legacy stores plus no activated durable generation is migration-required, never total loss or fresh-empty initialization. Lifecycle mutations refuse with a typed actionable message naming the registered migration plan/status route. Artifact authoring stays allowed after physical protection; read-only status/explain and closed migrate-runtime plan/status/apply/resume remain reachable through the entire installed hook/preflight chain. Hooks that only capture unavailable context report typed migration-required/no mutation; hooks that guard lifecycle mutations refuse, never create empty state or discard queue entries. Install/update emits the same migration-required notice and preserves every legacy byte. Bootstrap prompt hooks must recognize the integrity-bound closed descriptor before runtime reads, not merely the command handler. Explicit empty initialization requires proven absence of legacy durable data, not just missing new control.
- [ ] Finish supported schema/source classification for every family before switching a default. Validate actual entries, not object/array shape. Preserve binary capture Buffers exactly. Convert unsafe whole-census roots to typed blockers. Give supported older .ai-task-manager/.claude/custom sources an explicit trust/duplicate/conflict route rather than indefinite “outside inventory” refusal. Canonical sources remain canonical.
- [ ] Complete physical ownership and full writer fencing together. projectDirForState matches the rightmost exact .ai-task-manager/runtime/store/ state-container suffix and verifies its physical owning worktree; a bare state.json or enclosing .ai-task-manager segment is never sufficient authority; nested registered Test worktree cannot select parent. Remove production volatile/legacy fallback and corrupt-to-empty behavior. Sync APIs remain sync and leases enclose whole read-modify-write/publication; async drains and nested/reentrant calls retain leases. Every old uncooperative writer blocks activation.
- [ ] Register closed bootstrap plan/status/apply/resume before any runtime-dependent guard read. Extend current descriptor coherently to accept exact plan-file bytes/digest and explicit trust acknowledgments for exact legacy hashes. Handler revalidates executable/integrity, roots, genuine process identity, current census and plan bytes independently. A digest string alone is not recoverable authority. Resume uses the protected approved-plan journal, never the volatile plan artifact.
- [ ] Complete journal-first fencing/publication/recovery for every boundary, including coordinator creation before owner.json, approved-plan creation, staging/rename, complete manifest, timing publication and fence release. Use real child-process SIGKILL fixtures; a thrown callback with finally is insufficient. Recover only exact protected inode/owner/transaction with confirmed process death; PID reuse, unknown host/liveness and owner-less crash remain typed recovery-required with an explicit trustworthy operator route, never age/unlink.
- [ ] Finish no-fence completed timing retry versus retained-fence recovery. Completed mutable stores and legitimate new/retired roots/successor generations do not invalidate immutable timing publication; retained fence requires original roots. Add separate empty local initialization journal for newly registered worktrees referencing current main generation; do not mutate original migration plan or inherit volatile grants. Total runtime loss permits explicit empty initialization/reconciliation, partial loss refuses.
- [ ] Wire the Outcome 1 timing contract to the real migration ledger/publisher exactly once. Same actor's protected interval overlaps the ordinary span without double credit; distinct actors add. Preserve other sessions/queues and hashed legacy bytes. Unknown crash/startup/publication tails remain durable unknown.
- [ ] Apply physical installed/runtime protection before artifact allowance, then decide ordinary artifact authoring before runtime binding/control reads. Missing/corrupt/incomplete runtime cannot re-block harmless docs/scratch/tmp. Mixed source targets/execution remain gated. Test all three guard paths, symlink aliases, overrides and corrupt control.
- [ ] Release layout/defaults and bootstrap as one verified outcome. First produce a real registered read-only migration plan with census, hashes, trust decisions and blockers for controller review. Quiesce genuine live writers only for a separately admitted live cutover; no silent activation during development. Preserve known installed CLI rollback/recovery path and originals.

**Exit matrix:** all local/shared families and custom/legacy roots; pre- and post-Outcome-1 schema generations; package upgrade with populated unmigrated legacy queue; full prompt-hook/bootstrap reachability; fresh install; valid activation; malformed/unknown schema; duplicate/missing/aliased sources; binary bytes; every root alias; nested parent sentinel; sync and async real cross-process writer drain; uncooperative writer; changed source/census/plan; actual SIGKILL at every publication boundary; reused PID; owner replacement; pre-journal crash; complete-before-release crash; completed timing retry after store/census changes; new linked worktree; old volatile deletion/recreation/tampering; ordinary artifact authoring under every runtime failure; actual hooked status/resume after crash.

Extend runtime-storage.test.mjs, runtime-migration.test.mjs and runtime-migration-transaction.test.mjs; add actual registered handler/installed-dispatch integration there or a dedicated runtime-migration-cli.test.mjs. Include root-reader, state-project-dir, fixture isolation, session/queue/wordcounter, Test/reaper, guard and installer suites. Preserve unit purity. Representative contract:

```js
assert.equal((await registeredStatus()).status, 'publishing');
assert.equal(await ordinaryLifecycleAdmission(), 'RUNTIME_TRANSACTION_INCOMPLETE');
assert.equal((await registeredResumeWithApprovedJournal()).status, 'complete');
assert.deepEqual(await legacyByteSnapshot(), originalBytes);
assert.equal(await sameActorUnionAfterNormalPause(), expectedUnion);
```

The named helpers above are integration-fixture operations driving the actual registered handler/guard, not production bypass APIs.

## Outcome 3 — Usable safe cleanup with worktree/branch proof and shipped skill

**Delivered behavior:** An operator invokes aitm-cleanup, receives a typed reviewable inventory and applies exact eligible selections. Actual native archival or ordinary retirement is distinguished from proposals. Branch pruning follows fresh proof and retirement; active local work survives missing origin. Installation works for every supported provider without overwriting user content.

**New modules/interfaces from accepted design:** lib/cleanup-plan.mjs buildCleanupPlan({roots,observations,adapters}); lib/cleanup-apply.mjs applyCleanupPlan({plan,approvedCandidateIds,approvedPlanDigest,adapters}); lib/cleanup-git.mjs observeCleanupGit, proveCleanupIntegration, applyWorktreeRetirement, reconcileHostArchive, deleteLocalBranch, deleteOriginBranch; verbs/cleanup.mjs. Register the full command/help surface together. Candidate records contain id/kind/identity/reasonCodes/evidence/blockers/expectedHashesOrOids/proposedAction. Results are applied/refused/unknown, with durable per-action journal.

**Integration files:** Treat the current single installTarget/skillAdapterPath provider model as an explicit backward-compatible multi-skill schema change. Cover scripts/tests/unit/providers/{registry,parity}.test.mjs and scripts/tests/unit/package/install-contract.test.mjs and scripts/tests/integration/package/install-health.test.mjs suites, including existing installation update gaining aitm-cleanup atomically. lib/delivery-integration-proof.mjs verifyObservedIntegration and deliver.mjs content comparator reused without weakened proof; bin/cli.mjs and scripts/providers/{claude,codex,grok}.mjs existing owned-stub/link installer patterns extended as necessary; skill/cleanup/SKILL.md plus skill/cleanup/adapters/{claude,codex,grok}/SKILL.md; .ai-task-manager/README.md, package and generated guidance through sanctioned generators.

- [ ] Build file and Git/host inventory and plan together. Unknown files/schemas, tracked config/templates/memory, active binding/occupancy/locks, queues, recovery/audit/evidence and roots/control/store/recovery namespace are protected. Age is descriptive only. Plans bind observed bytes/refs/evidence; exact selections and digest required for apply.
- [ ] Implement journal-before-action fresh apply. Changed hash/OID/identity/canonical evidence refuses. Reconcile partial actions and ambiguous network results from fresh observations, never blind retry or wildcard purge. Runtime protected roots can never be selected away.
- [ ] Implement host-aware retirement. Consume actual list_artifacts schema: attachmentType=worktree, exact identityKey and payload.root/workspaceRoot/sourceCwd. Codex-managed roots require an active host archive_worktree handoff and independently observed result/attachment state/recoverable snapshot provenance. Caller JSON success is not authority and CLI cannot simulate host API. Missing capability is protected/actionable handoff; Claude-managed roots remain typed unsupported-host-archive until an actual archive contract exists. Ordinary Git removal is allowed only after fresh approved clean/unpublished/ignored-work and live issue/delivery/claim checks.
- [ ] Delete exact local ref only after successful retirement and fresh census proving no other worktree checks it out. Protect main/current/pinned/shared/default/trunk/active work. Missing origin is never retirement evidence; local work can be pushed again.
- [ ] Prove origin contents against freshly observed trunk and candidate OIDs. Ancestry proves full containment; squash/rebase requires complete candidate inventory and substantive virtual-merge/content equivalence using verifyObservedIntegration, including ordered replay when relevant. Partial replay, post-PR additions, missing objects or ambiguous association refuse. Use expected-OID remote lease; distinguish deleting origin from pruning stale tracking cache. Merged labels/patch-id/deleted branch are not full proof.
- [ ] Ship the skill with command capability, not afterward as another micro-deliverable. Canonical discovery name aitm-cleanup; Claude .claude/skills, Codex .agents/skills, Grok .grok/skills; symlink and provider-specific stub modes load canonical cleanup source. Before any install/update validate all destinations: unowned directory, user-modified stub or unrelated symlink yields atomic collision. Owned uninstall removes exact owned entries and preserves user additions/runtime. No global skill modifications.
- [ ] Preserve the genuine pre-skill RED baseline and evaluate the completed skill once against the full scenario matrix. Fix observed behavior as part of the outcome: managed roots must not use raw Git removal; proposed/handoff actions must not be reported applied. Verify package inclusion, installer/update/uninstall and guidance parity, then commit the coherent outcome.

**Exit matrix:** dry inventory no mutation; protected runtime/config/recovery; stale/changed selection; interruption recovery; dirty/untracked/unpublished/needed ignored work; live claims; closed issue without delivery; main/current/pinned/shared; missing origin with active local branch; managed capability absent/forged receipt/real host handoff; branch checked out elsewhere; local compare-delete race; fresh actual origin versus stale tracking cache; ancestry/squash/rebase success and partial/post-PR mismatch; remote lease/network uncertainty; all three providers in both install modes and atomic collisions; skill proposal versus applied truthfulness.

**Genuine host evidence:** Maintain docs/reviews/1857-expanded/1857-cleanup-host-scenario-evidence.md. Record the exact approved scenario/candidate identity (sanitized public form), observed host attachment before/after, actual native archive result, recoverable snapshot provenance, fresh local-ref/checkouts observation, truthful skill report, and process timestamps/status. Seam tests prove classification, ordering, tamper refusal and recovery logic; they do not prove an actual archive. A non-destructive genuine host inventory/readiness and absent-capability scenario is always required. An applied archive scenario requires a separately approved disposable managed fixture or exact eligible selection, with no user work and no mass cleanup. Until that authority/capability exists, record the applied row as not executed and the limitation explicitly; never tick it from a seam. The product must still deliver actionable typed host handoff/refusal. Controller assesses that explicit operational evidence boundary at the normal final review; no fake receipt or silent raw-Git fallback.

Create integration cleanup-plan.test.mjs, cleanup-git.test.mjs and package/cleanup-skill.test.mjs (VC9/10). Use isolated real repositories and explicit host seams; never delete real assets in tests. Assert action ordering:

```js
assert.deepEqual(actions, [
  'revalidate',
  'journal-intent',
  'host-handoff',
  'verify-host-result',
  'refresh-checkouts',
  'compare-delete-local-ref',
]);
assert.equal(originMissingActiveLocal.proposedAction, 'retain');
assert.equal(partialSquash.proven, false);
```

## Requirement-to-outcome and whole-issue exit

| Requirement                 | Owner and terminal evidence                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1                          | Existing baseline + Outcome 2 all-state physical artifact/runtime guard matrix, original VC1/2.                                                  |
| R2                          | Outcome 2 complete production reader/writer/default/schema census and no volatile authority.                                                     |
| R3                          | Outcome 2 actual registered hooked migration, crash recovery, preserved bytes and genuine engagement.                                            |
| R4                          | Outcome 2 guard ordering, override/alias denial, tamper/delete and incomplete-control artifact availability.                                     |
| R5                          | Outcome 3 typed file plans/apply/protection and usable skill.                                                                                    |
| R6                          | Outcome 3 native/ordinary retirement, verified handoff and local branch deletion ordering.                                                       |
| R7                          | Outcome 3 fresh origin full-content proof, exact lease and local-survival cases.                                                                 |
| R8                          | Outcomes 2/3 README persistence/access and installer/provider/package/skill parity.                                                              |
| R9 and expanded actor scope | Outcome 1 end-to-end truthful telemetry; Outcome 2 migration reconciliation; normal whole-issue evidence, provenance and gates across all three. |

- [ ] Run canonical full unit/fast, integration and slow lanes, lint, format, package/install/guidance parity and original/new VC1–10 at the required final source state. package.json currently defines npm test as fast; it is not a substitute for npm run test:integration. Use registered verify-develop iteration/final according to current help and required receipt rules; no arbitrary extra repeat solely for narration.
- [ ] Reconcile final inventory: every runtime read/write/override classified; only migration inputs, inert fixtures and nonauthoritative advisory output may retain old volatile references. Every actor emitter/consumer handles typed unavailable and every lawful Close lane is exercised.
- [ ] Preserve original AC declarations; stamp/tick only actual executed evidence through normal actions. Resolve fresh typed Develop-exit refusals. No review or delivery from unticked/pending evidence.
- [ ] Obtain normal exact committed-head final receipt and one independent whole-code review covering original artifact diff, all three outcomes, changed telemetry gates and this revised contract. Repair actual findings coherently; no standing per-file review ceremony.
- [ ] Author reports CODE_COMPLETE only after all outcomes and required checks; controller owns Review/approval/delivery/close. Approved migration/cleanup actions retain their separate explicit operational authority. Preserve WIP/operational data until intentionally reconciled through normal paths.

## Effort and cost-control rebaseline

**Owner, artifact and route:** After XPR acceptance and before source resumes, the genuine author prepares docs/reviews/1857-revised-plan-xpr/1857-delivery-report.md with the outcome budget, assumptions, actual engagement-to-date availability, per-outcome reassessment threshold and validation allocation. The controller records/adopts the recommended advisory budget under the user's explicit AFK best-recommendation delegation; optional human choice is not a blocker. Use the registered issue-body replace-section route to hydrate Scope and Plan Metadata and an owned audit comment for the budget/link. Consult live Explain/help for a supported estimator action; if Develop has no lawful new adaptive forecast route, preserve the original forecast and label the budget advisory. No demotion or renewed Plan approval is implied. This is a post-review execution decision with a named durable home, not another mandatory plan-review cycle. A material budget overrun is recorded and re-estimated against the same complete outcome before expanding work; do not turn it into per-file approvals.

Do not reuse 24–36h as a promise of remaining work or infer historical cost from wall time. A fresh outcome-level execution budget must be established before source resumes, using this inventory and the revised plan review; no production work is authorized by a guessed total here.

| Budget unit                       | Concrete remaining basis                                                                                           | Main uncertainty to price once                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Outcome 1                         | Six-path WIP plus complete producers/queue/CLI/reports/Close integration and real lane fixtures.                   | Forecast-free and epic authority compatibility; legacy actor/shared-state effects; canonical retry concurrency.                               |
| Outcome 2                         | Unwired primitives, full schema/writer adoption, bootstrap and real process recovery, installation/default switch. | Number of remaining classified fixtures/writers, uncooperative host writer census, supported legacy sources and real killed-process recovery. |
| Outcome 3                         | New command/apply/proof capability and skill/installer product.                                                    | Native host observation capability and substantive squash/rebase proof availability; unsupported cases must be useful typed refusals.         |
| Whole-issue verification/delivery | Full lanes, exact-head receipts and independent review of combined result.                                         | Regression repairs from changed authority boundaries, not repeated unchanged microchecks.                                                     |

At that budget decision, assign an explicit engagement allowance and stop/reassess threshold per outcome, including author, test/integrity execution and independent reviewer time. Use the registered estimator only where the live workflow admits it; otherwise record a clearly advisory budget without renewed-forecast claims. Batch uncertainty assessment now; rebaseline again only on a material contract/capability or measured budget overrun, not each file. Unknown historical provider coverage remains unknown. The planning session is separately tracked; no false total-to-date precision.

## Self-review and handoff

Coverage is complete at the plan level: R1–R9 and every later actor/forecast/host/recovery requirement map above; no requirement is deferred to a new issue. Current behavior versus intended behavior is labeled. All new module names are explicitly proposed, current interfaces named above were read from source, and fixture pseudocode is clearly test operation notation. The next action is independent review and outcome-budget/admission reconciliation, not implementation. Original accepted spec/plan/addendum and all six WIP paths remain unchanged by this planning turn.

## Current mechanical candidate census

Read-only source scan at c096289a plus preserved WIP found 122 production modules and 147 test/helper modules with direct path/state/queue/session imports or recognized runtime/root/transcript strings. This is a complete candidate list for that explicit scan, **not** a claim that every candidate requires an edit or that lexical matching proves transitive closure. During the one upfront inventory, follow the listed resolver/writer call graph to its publication boundary and label each candidate converted, migration-only, advisory, forwarding, pure adapter or real-Git fixture. These classifications and schema table replace piecemeal rediscovery. New indirect writer evidence is incorporated into its existing outcome, not a new issue.

Scan terms: imports ending paths/state/queue/session-state.mjs; tmpAitmDir; existingRuntimePath; legacyPathFor; AI_TASK_MANAGER_PROJECT_DIR; TASK_TRACKER_PROJECT_DIR; CLAUDE_PROJECT_DIR; AITM_CAPTURE_PROJECT_DIR; AI_TASK_MANAGER_TRANSCRIPT_DIR; .tmp/aitm; .db/aitm. Scanned production roots scripts/task-tracker, scripts/providers, scripts/gh and all scripts/tests .mjs fixtures.

<details>
<summary>Production candidates (122)</summary>

```text
scripts/gh/dispatch-prep.mjs
scripts/gh/ensure-wave-parent.mjs
scripts/gh/init-repair.mjs
scripts/gh/lib/epic-metadata.mjs
scripts/gh/migrate-project.mjs
scripts/gh/move-state.mjs
scripts/gh/update-event-fields.mjs
scripts/gh/verify-priority-p3.mjs
scripts/providers/claude.mjs
scripts/providers/codex.mjs
scripts/providers/grok.mjs
scripts/task-tracker/activity-guard.mjs
scripts/task-tracker/agent-guard.mjs
scripts/task-tracker/backfill-timing-logs.mjs
scripts/task-tracker/capture-actions.mjs
scripts/task-tracker/commit-trail-handler.mjs
scripts/task-tracker/config-get.mjs
scripts/task-tracker/config.mjs
scripts/task-tracker/draft-branch.mjs
scripts/task-tracker/epic-base-edit-guard.mjs
scripts/task-tracker/fleet-registry.mjs
scripts/task-tracker/gh-timing-comment.mjs
scripts/task-tracker/heal-backlog.mjs
scripts/task-tracker/heal-timing-departure.mjs
scripts/task-tracker/heal-timing-interval.mjs
scripts/task-tracker/heal-timing-log.mjs
scripts/task-tracker/heal-timing-starts.mjs
scripts/task-tracker/hook-handler.mjs
scripts/task-tracker/hooks/on-ask.mjs
scripts/task-tracker/hooks/on-stop.mjs
scripts/task-tracker/hooks/on-user-prompt.mjs
scripts/task-tracker/hooks/stop-audit-pause-resume.mjs
scripts/task-tracker/issue-mutator-lock.mjs
scripts/task-tracker/lib/action-capture.mjs
scripts/task-tracker/lib/action-decision/review.mjs
scripts/task-tracker/lib/action-decision/session.mjs
scripts/task-tracker/lib/action-decision/test.mjs
scripts/task-tracker/lib/bind-context.mjs
scripts/task-tracker/lib/bound-state.mjs
scripts/task-tracker/lib/chore-mode.mjs
scripts/task-tracker/lib/config-init/config-authoring.mjs
scripts/task-tracker/lib/decomposition-plan-exit-guard.mjs
scripts/task-tracker/lib/develop-exit-commit-trail-head-guard.mjs
scripts/task-tracker/lib/estimation/record-claim.mjs
scripts/task-tracker/lib/move-state/audit-timing.mjs
scripts/task-tracker/lib/move-state/cache-unpark.mjs
scripts/task-tracker/lib/move-state/github-mutation.mjs
scripts/task-tracker/lib/move-state/guard-execution.mjs
scripts/task-tracker/lib/move-state/policy.mjs
scripts/task-tracker/lib/move-state/post-commit-tail.mjs
scripts/task-tracker/lib/move-state/transition-plan.mjs
scripts/task-tracker/lib/mutation-context.mjs
scripts/task-tracker/lib/occupancy.mjs
scripts/task-tracker/lib/project-dir.mjs
scripts/task-tracker/lib/reopened-close-recovery.mjs
scripts/task-tracker/lib/runtime-storage.mjs
scripts/task-tracker/lib/scratch-dir.mjs
scripts/task-tracker/lib/seed-kanban-cache.mjs
scripts/task-tracker/lib/session-store.mjs
scripts/task-tracker/lib/shelve-transaction.mjs
scripts/task-tracker/lib/verb-preflight.mjs
scripts/task-tracker/lib/worktree-binding-guard.mjs
scripts/task-tracker/lib/worktree-binding-lifecycle.mjs
scripts/task-tracker/measure-context.mjs
scripts/task-tracker/orchestrator-lock.mjs
scripts/task-tracker/orphan-finalize.mjs
scripts/task-tracker/paths.mjs
scripts/task-tracker/preflight-issue.mjs
scripts/task-tracker/project-fields.mjs
scripts/task-tracker/queue.mjs
scripts/task-tracker/runtime.mjs
scripts/task-tracker/session-state.mjs
scripts/task-tracker/source-edit-gate.mjs
scripts/task-tracker/state.mjs
scripts/task-tracker/verbs/ac-stamp.mjs
scripts/task-tracker/verbs/approve.mjs
scripts/task-tracker/verbs/assign.mjs
scripts/task-tracker/verbs/block.mjs
scripts/task-tracker/verbs/board.mjs
scripts/task-tracker/verbs/cancel-plan.mjs
scripts/task-tracker/verbs/cancel.mjs
scripts/task-tracker/verbs/check.mjs
scripts/task-tracker/verbs/chore-mode.mjs
scripts/task-tracker/verbs/close.mjs
scripts/task-tracker/verbs/comment.mjs
scripts/task-tracker/verbs/commit-trace.mjs
scripts/task-tracker/verbs/deliver.mjs
scripts/task-tracker/verbs/demote.mjs
scripts/task-tracker/verbs/discover.mjs
scripts/task-tracker/verbs/dod-stamp.mjs
scripts/task-tracker/verbs/epic-reconcile.mjs
scripts/task-tracker/verbs/explain.mjs
scripts/task-tracker/verbs/fleet.mjs
scripts/task-tracker/verbs/help-data.mjs
scripts/task-tracker/verbs/issue-body.mjs
scripts/task-tracker/verbs/kind.mjs
scripts/task-tracker/verbs/mirror-deep-dive.mjs
scripts/task-tracker/verbs/new.mjs
scripts/task-tracker/verbs/pause.mjs
scripts/task-tracker/verbs/plan-approve.mjs
scripts/task-tracker/verbs/plan-estimate.mjs
scripts/task-tracker/verbs/promote.mjs
scripts/task-tracker/verbs/reconcile.mjs
scripts/task-tracker/verbs/reject.mjs
scripts/task-tracker/verbs/resume.mjs
scripts/task-tracker/verbs/review.mjs
scripts/task-tracker/verbs/save-draft.mjs
scripts/task-tracker/verbs/save-plan.mjs
scripts/task-tracker/verbs/shelve.mjs
scripts/task-tracker/verbs/status.mjs
scripts/task-tracker/verbs/stop.mjs
scripts/task-tracker/verbs/supersede.mjs
scripts/task-tracker/verbs/switch.mjs
scripts/task-tracker/verbs/test.mjs
scripts/task-tracker/verbs/unassign.mjs
scripts/task-tracker/verbs/unblock.mjs
scripts/task-tracker/verbs/update.mjs
scripts/task-tracker/verbs/user-story.mjs
scripts/task-tracker/verbs/workflow-preflight.mjs
scripts/task-tracker/verify-delivery-incident-reconciliation.mjs
scripts/task-tracker/verify-epic-trail.mjs
scripts/task-tracker/word-counter.mjs
```

</details>

<details>
<summary>Test and helper candidates (147)</summary>

```text
scripts/tests/fixtures/chore-mode/chore-mode-fixture.mjs
scripts/tests/helpers/action-session-executor-fixture.mjs
scripts/tests/helpers/capture-guidance-release.mjs
scripts/tests/helpers/chore-mode-state.cases.mjs
scripts/tests/helpers/close-convergence-wiring-helpers.mjs
scripts/tests/helpers/evidence-v2/sandbox.mjs
scripts/tests/helpers/guidance-legacy-cli.mjs
scripts/tests/helpers/move-state-cli.mjs
scripts/tests/integration/dev-env/verify-local-worktree.test.mjs
scripts/tests/integration/task-tracker/core/bash-guard-tmp-contract.test.mjs
scripts/tests/integration/task-tracker/core/project-tmp-dir.test.mjs
scripts/tests/integration/task-tracker/core/seed-worktree.test.mjs
scripts/tests/integration/task-tracker/core/self-bind-resume.test.mjs
scripts/tests/integration/task-tracker/lib/absolute-word-markers.test.mjs
scripts/tests/integration/task-tracker/lib/action-capture.test.mjs
scripts/tests/integration/task-tracker/lib/artifact-write-policy.test.mjs
scripts/tests/integration/task-tracker/lib/assignee-guard.integration.test.mjs
scripts/tests/integration/task-tracker/lib/bash-guard-worktree-binding.test.mjs
scripts/tests/integration/task-tracker/lib/bound-worktree-state.test.mjs
scripts/tests/integration/task-tracker/lib/chore-mode-verb.test.mjs
scripts/tests/integration/task-tracker/lib/codex-word-marker-lifecycle.integration.test.mjs
scripts/tests/integration/task-tracker/lib/coverage-cache-unpark.test.mjs
scripts/tests/integration/task-tracker/lib/coverage-migrate-project.test.mjs
scripts/tests/integration/task-tracker/lib/coverage-source-edit-gate.test.mjs
scripts/tests/integration/task-tracker/lib/create-issue-entry-marker.test.mjs
scripts/tests/integration/task-tracker/lib/create-issue-partial-success.test.mjs
scripts/tests/integration/task-tracker/lib/cross-worktree-bind-resume.test.mjs
scripts/tests/integration/task-tracker/lib/discover-promote-aged-bucket.test.mjs
scripts/tests/integration/task-tracker/lib/downstream-package-boundary.test.mjs
scripts/tests/integration/task-tracker/lib/duplicate-child-guard.test.mjs
scripts/tests/integration/task-tracker/lib/evidence-v2/cli-contract.test.mjs
scripts/tests/integration/task-tracker/lib/evidence-v2/isolation.test.mjs
scripts/tests/integration/task-tracker/lib/fleet-registry.test.mjs
scripts/tests/integration/task-tracker/lib/guidance-cache-process.test.mjs
scripts/tests/integration/task-tracker/lib/guidance-legacy-transport.test.mjs
scripts/tests/integration/task-tracker/lib/install-hooks.test.mjs
scripts/tests/integration/task-tracker/lib/interruption-word-markers.test.mjs
scripts/tests/integration/task-tracker/lib/issue-body-verifier.test.mjs
scripts/tests/integration/task-tracker/lib/lock-env-leak-regression.test.mjs
scripts/tests/integration/task-tracker/lib/move-state-lock.test.mjs
scripts/tests/integration/task-tracker/lib/new-switch-marker-order.test.mjs
scripts/tests/integration/task-tracker/lib/reopened-close-binding-ownership.test.mjs
scripts/tests/integration/task-tracker/lib/resume-auto-gap-activity.test.mjs
scripts/tests/integration/task-tracker/lib/resume-fleet-refresh.test.mjs
scripts/tests/integration/task-tracker/lib/resume-fresh-bind-no-switch.test.mjs
scripts/tests/integration/task-tracker/lib/resume-seed.test.mjs
scripts/tests/integration/task-tracker/lib/runtime-migration-transaction.test.mjs
scripts/tests/integration/task-tracker/lib/runtime-storage.test.mjs
scripts/tests/integration/task-tracker/lib/shelve-blocked-r4p-state-exit.integration.test.mjs
scripts/tests/integration/task-tracker/lib/state-mutator-concurrency.test.mjs
scripts/tests/integration/task-tracker/lib/switch-verb-noop.test.mjs
scripts/tests/integration/task-tracker/lib/terminal-review-handoff.test.mjs
scripts/tests/integration/task-tracker/lib/timing-concurrency.test.mjs
scripts/tests/integration/task-tracker/lib/timing-degraded-write-visibility.test.mjs
scripts/tests/integration/task-tracker/lib/verb-start-resume-stop.test.mjs
scripts/tests/integration/task-tracker/lib/worktree-binding-lifecycle.test.mjs
scripts/tests/integration/task-tracker/verbs/bind.test.mjs
scripts/tests/integration/task-tracker/verbs/shelve.test.mjs
scripts/tests/integration/task-tracker/verbs/workflow-preflight.test.mjs
scripts/tests/slow/task-tracker/lib/ac-evidence-gate.test.mjs
scripts/tests/slow/task-tracker/lib/action-capture-integration.test.mjs
scripts/tests/slow/task-tracker/lib/activity-guard.test.mjs
scripts/tests/slow/task-tracker/lib/agent-guard.test.mjs
scripts/tests/slow/task-tracker/lib/agentic-help-runtime.test.mjs
scripts/tests/slow/task-tracker/lib/chore-mode-activity-guard.test.mjs
scripts/tests/slow/task-tracker/lib/cli.test.mjs
scripts/tests/slow/task-tracker/lib/commit-trail-handler.test.mjs
scripts/tests/slow/task-tracker/lib/coverage-hook-handler.test.mjs
scripts/tests/slow/task-tracker/lib/coverage-orchestrator-lock.test.mjs
scripts/tests/slow/task-tracker/lib/create-issue.test.mjs
scripts/tests/slow/task-tracker/lib/dirty-review-promote-false-success.test.mjs
scripts/tests/slow/task-tracker/lib/dirty-workspace-gate.test.mjs
scripts/tests/slow/task-tracker/lib/draft-branch.test.mjs
scripts/tests/slow/task-tracker/lib/ensure-wave-parent.test.mjs
scripts/tests/slow/task-tracker/lib/gates.test.mjs
scripts/tests/slow/task-tracker/lib/lifecycle.test.mjs
scripts/tests/slow/task-tracker/lib/move-state-approval-gate.test.mjs
scripts/tests/slow/task-tracker/lib/move-state-gate.test.mjs
scripts/tests/slow/task-tracker/lib/move-state.test.mjs
scripts/tests/slow/task-tracker/lib/proof-gate-reconciliation.test.mjs
scripts/tests/slow/task-tracker/lib/review-approval-prompt.test.mjs
scripts/tests/slow/task-tracker/lib/verb-preflight-wiring.test.mjs
scripts/tests/slow/task-tracker/lib/worktree-isolation.test.mjs
scripts/tests/slow/task-tracker/verbs/coverage-close.test.mjs
scripts/tests/slow/task-tracker/verbs/promote-verb.test.mjs
scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs
scripts/tests/unit/providers/parity.test.mjs
scripts/tests/unit/providers/registry.test.mjs
scripts/tests/unit/task-tracker/characterization/orchestrators.test.mjs
scripts/tests/unit/task-tracker/core/governed-plan-policy.test.mjs
scripts/tests/unit/task-tracker/core/node-runtime-policy.test.mjs
scripts/tests/unit/task-tracker/core/run-tests-timing.test.mjs
scripts/tests/unit/task-tracker/core/state-project-dir.test.mjs
scripts/tests/unit/task-tracker/core/word-marker-advance.test.mjs
scripts/tests/unit/task-tracker/epic-base-edit-guard.test.mjs
scripts/tests/unit/task-tracker/gh/move-state-host-returns.test.mjs
scripts/tests/unit/task-tracker/gh/review-in-place.test.mjs
scripts/tests/unit/task-tracker/lib/bind-context.test.mjs
scripts/tests/unit/task-tracker/lib/bind-reseed-e2e.test.mjs
scripts/tests/unit/task-tracker/lib/bound-state-session-authoritative.test.mjs
scripts/tests/unit/task-tracker/lib/bound-worktree-project-dir.test.mjs
scripts/tests/unit/task-tracker/lib/close-cross-close.test.mjs
scripts/tests/unit/task-tracker/lib/close-drain.test.mjs
scripts/tests/unit/task-tracker/lib/consecutive-promotes-no-reconcile.test.mjs
scripts/tests/unit/task-tracker/lib/coverage-review.test.mjs
scripts/tests/unit/task-tracker/lib/coverage-supersede.test.mjs
scripts/tests/unit/task-tracker/lib/graphql-params.test.mjs
scripts/tests/unit/task-tracker/lib/guidance-rule-coverage.test.mjs
scripts/tests/unit/task-tracker/lib/init-repair.test.mjs
scripts/tests/unit/task-tracker/lib/install.test.mjs
scripts/tests/unit/task-tracker/lib/memory-resync-apply.test.mjs
scripts/tests/unit/task-tracker/lib/memory-resync-classify.test.mjs
scripts/tests/unit/task-tracker/lib/move-state-internal-gate.test.mjs
scripts/tests/unit/task-tracker/lib/move-state/move-state-tail-profiles.test.mjs
scripts/tests/unit/task-tracker/lib/move-state/move-state-terminal-tail-isolation.test.mjs
scripts/tests/unit/task-tracker/lib/move-state/transition-plan.test.mjs
scripts/tests/unit/task-tracker/lib/on-ask.test.mjs
scripts/tests/unit/task-tracker/lib/on-stop.test.mjs
scripts/tests/unit/task-tracker/lib/on-user-prompt.test.mjs
scripts/tests/unit/task-tracker/lib/paths.test.mjs
scripts/tests/unit/task-tracker/lib/queue.test.mjs
scripts/tests/unit/task-tracker/lib/reconcile-no-drift-seed.test.mjs
scripts/tests/unit/task-tracker/lib/run-move-state-timeout.test.mjs
scripts/tests/unit/task-tracker/lib/scratch-contract-docs.test.mjs
scripts/tests/unit/task-tracker/lib/scratch-dir.test.mjs
scripts/tests/unit/task-tracker/lib/seed-kanban-cache.test.mjs
scripts/tests/unit/task-tracker/lib/session-state.test.mjs
scripts/tests/unit/task-tracker/lib/set-priority.test.mjs
scripts/tests/unit/task-tracker/lib/set-rank.test.mjs
scripts/tests/unit/task-tracker/lib/state.test.mjs
scripts/tests/unit/task-tracker/lib/test-407-binding-survives.test.mjs
scripts/tests/unit/task-tracker/lib/test-verb-injection.test.mjs
scripts/tests/unit/task-tracker/lib/timing-queue-retention.test.mjs
scripts/tests/unit/task-tracker/lib/verb-pipeline-enforcement.test.mjs
scripts/tests/unit/task-tracker/lib/word-counter-grok.test.mjs
scripts/tests/unit/task-tracker/lib/word-counter.test.mjs
scripts/tests/unit/task-tracker/lib/worktree-binding-guard.test.mjs
scripts/tests/unit/task-tracker/verbs/close-review-authority-wiring.test.mjs
scripts/tests/unit/task-tracker/verbs/coverage-check-verb.test.mjs
scripts/tests/unit/task-tracker/verbs/coverage-config.test.mjs
scripts/tests/unit/task-tracker/verbs/coverage-kind.test.mjs
scripts/tests/unit/task-tracker/verbs/coverage-promote.test.mjs
scripts/tests/unit/task-tracker/verbs/coverage-update.test.mjs
scripts/tests/unit/task-tracker/verbs/demote-verb.test.mjs
scripts/tests/unit/task-tracker/verbs/promote-test-to-review-gate.test.mjs
scripts/tests/unit/task-tracker/verbs/sandbox-env-isolation.test.mjs
scripts/tests/unit/task-tracker/verbs/verb-test-sandbox-env.test.mjs
```

</details>
