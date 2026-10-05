<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-fe3b8aacd416cf76d25d311dc272c4dc"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-30-1857-complete-outcomes-revised.md"
artifact_commit: "ba5d00817fd387181d9a264f7687c186a3370f9e"
artifact_blob: "bb2eae7c25bda295c87772ef0f5cbaa8ad99780b"
artifact_digest: "sha256:8835ec6a7d95ceec7ec7df6d478d01092e9221e9b7403d3989c80cf667b4307e"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:c9125952da149fd3712e65df311e6de5c91e318ed41e211b32dfed3d7ab5ef12"
  identity_source: "runtime"
started_at: "2026-10-01T05:51:41.337Z"
submitted_at: "2026-10-01T05:54:09.704Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The three-outcome regrouping is sound. It replaces per-file ceremony with coherent deliverables, puts all six WIP paths in Outcome 1, orders the dependencies correctly (timing semantics, then durable runtime, then cleanup), and keeps destructive and live-cutover authority separate from source work. I spot-checked the plan against source. Every named existing interface exists at the cited module: timingActorKey, timingEngagementMarker, parseTimingRow, reconcileActorCoverage, deriveActorEngagement, createEstimationOutcomeRuntime, buildEstimationOutcome, ensureEstimationOutcome, validateOutcomeTimingSource, resolveRuntimeRoot, runtimeStoragePaths, assertRuntimeReadable, assertRuntimeOverrideSafe, plan/apply/status/resumeRuntimeMigration, withRuntimeWriterLease(Sync), classifyRuntimeMigrationInvocation and verifyObservedIntegration. Several baseline claims are also accurate:

- `paths.mjs:25` still has `TMP_AITM_REL = '.tmp/aitm'`.
- `state.mjs:192` projectDirForState still anchors on the rightmost `.tmp/aitm`, then any `.ai-task-manager` segment.
- `runtime-adapter.mjs:288` estimationOutcomeSamples throws `rubric-outcome-forecast` for any story outcome without a forecast.
- Codex/Grok install targets are `.agents/skills/task` and `.grok/skills/task`.

Four gaps remain material before source resumes. The Close-lane enumeration is incomplete and contradicts a lawful lane that currently exists. The plan never says how the dogfooding repository's own live hooks are protected while emitter and default-path changes are in progress. It does not define what happens to an upgraded but unmigrated repository once volatile fallback is removed. And it does not hand off the new persisted shapes from Outcome 1 to Outcome 2's migration catalog. Two smaller gaps concern evidence form and budget ownership.

## Findings

1. **[High] Close-lane enumeration is incomplete and contradicts an existing lawful lane.** Outcome 1 promises that both actors "complete every existing lawful delivery lane", but it names only source-story, issue-resident/no-command and root epic. It also says "Root epic requires merged-PR delivery for aggregate child history, never no-commit." Current source has `NO_COMMIT_KINDS = {audit, research, spike, epic}` (`scripts/task-tracker/lib/issue-kind.mjs:28`), backed by the canonical `no-commit-delivery-record.mjs` authorization, so no-commit epic delivery is a lawful lane today. Close also has incident-epic authority (`authorizeIncidentEpicCloseForCommand`), false-delivery recovery (`historical-no-commit`) and reopened-close recovery paths. The plan never lists audit/research/spike outcomes, sub-epic versus root epic, incident epic or the recovery lanes. Failure scenario: an epic closed through the existing no-commit lane, or a spike or audit issue, reaches outcome writing. Under the plan's rule, the epic is refused, which is a regression in a lane the plan promises to preserve. Or the spike/audit lane is simply untested, so a null or incomplete outcome throws in Close or in calibration ingress. The "every lawful kind/forecast lane" claim in the baseline table cannot be checked against a list that was never derived from source.

2. **[High] The dogfooding repository's live hooks run the source being changed, and the plan never isolates them.** This repository executes its own hooks and task-tracker through the `node_modules/ai-task-manager` self-link, so source edits are live as soon as they are saved, not only after a commit. Outcome 1's last step adopts live emitters (hooks, pause/resume/switch, Test/Review/approval/close) and edits `state.mjs`, `session-state.mjs`, `queue.mjs`, `word-counter.mjs` and `verbs/pause.mjs`. Outcome 2 switches default store paths and removes volatile fallback. The only containment statement is Outcome 2's "no silent activation during development", and the plan gives no mechanism that makes it true for the author's own session. Failure scenario: partway through Outcome 2, a changed default in `paths.mjs`/`state.mjs` makes the next hook in the author's #1857 session resolve an empty durable store. The session then loses its active start, words and queue view, or is refused admission. This is the same class as the documented fixture-containment incident, which cleared the author's overlay, but here it comes from production code paths. Outcome 1 has the same exposure: half-adopted emitters write mixed tagged and untagged rows into #1857's own canonical timing log, which is immutable history that cannot be "repaired" afterward.

3. **[High] The upgraded-but-unmigrated repository state is undefined.** The plan forbids volatile auto-import and fallback and says partial runtime loss refuses. It also says total loss permits explicit empty initialization. It never states what happens when a downstream repository updates the package and still has populated `.tmp/aitm` stores, including unposted timing queue entries, and no durable runtime. The exit matrix covers "fresh install", "valid activation" and "old volatile deletion/recreation/tampering", but not "package upgraded, migration not yet run". Failure scenarios:
   - (a) The new code sees no durable runtime, treats it as total loss and offers empty initialization. That orphans the legacy queue, so posted-timing evidence is silently lost.
   - (b) Every lifecycle verb refuses until migrate-runtime runs, and nothing in install/update or the hook surface tells the operator. The task skill then appears broken.
   - (c) The bootstrap migrate-runtime command is itself blocked by a guard that reads runtime first. The plan registers bootstrap "before any runtime-dependent guard read", but only for the command itself, not for the hook path that fires on the same prompt.

4. **[Medium] New persisted shapes from Outcome 1 are not handed off to Outcome 2's migration catalog.** Outcome 1 adds per-actor isolation to state, session, queue and word-cursor stores ("Queue freezes original identity, interval and word/full-cursor baselines"; independent pause state per actor). Those records land in today's volatile stores. Outcome 2 must then classify and migrate both the pre-Outcome-1 and the post-Outcome-1 shapes, because installations upgrade from either release. The plan's family table describes target semantics but does not require Outcome 1 to version its new store shapes, and it does not require Outcome 2's schema catalog to list both generations. Failure scenario: Outcome 2's strict "validate actual entries, not shape" catalog recognizes only one generation. A repository that ran an intermediate release then hits a typed unknown-schema blocker on migration, with no supported route. The same five files are also edited twice, once for actor isolation and once for relocation and leases. If Outcome 1 hard-codes path or state access rather than going through the path/state APIs, Outcome 2's relocation misses it.

5. **[Medium] Real host-handoff evidence has no defined form.** The Outcome 3 exit matrix includes "real host handoff" and "skill proposal versus applied truthfulness". The plan correctly says "CLI cannot simulate host API". The named test files (`cleanup-plan.test.mjs`, `cleanup-git.test.mjs`, `package/cleanup-skill.test.mjs`) can only exercise seams, though. A real Codex `archive_worktree` handoff and the independently observed attachment and snapshot state cannot be driven under `node:test`. The plan does not say what durable artifact proves that row, unlike R8's explicit `1857-cleanup-skill-baseline-evidence.md`. Failure scenario: at whole-issue exit, the "real host handoff" row is either ticked from seam tests, which is evidence inflation, or left unprovable, which blocks Develop exit with no planned route.

6. **[Medium] The budget gate has no owner, artifact or route.** "Before any source work, ... rebaseline an outcome-level execution budget" is a blocking precondition. The plan gives no numbers, by design, and also does not name where the budget is recorded, who approves it, or which registered route is used. The live issue Estimate is 7h, the 24–36h range is declared stale, and the plan says not to assert a new adaptive forecast where no route permits one. Failure scenario: after this review is accepted, the author cannot lawfully begin. Or the author records an ad hoc budget somewhere unreviewed, and the "stop/reassess threshold per outcome" has no checkable home.

7. **[Low] The provider adapter model is single-skill, so a second shipped skill is a schema change, not an extension.** Each provider declares exactly one `installTarget`/`skillAdapterPath` (`scripts/providers/claude.mjs:10,21`). `bin/cli.mjs:891-947` and `planManagedSkill` (`:1176`) install that single entry. `registry.test.mjs`, `parity.test.mjs` and `install-contract.test.mjs` assert the exact shape. The plan describes this as patterns "extended as necessary" and leaves those suites out of the Outcome 3 files and exit matrix. Risk: the work is under-scoped, and existing installations that run `update` may not gain the new managed `aitm-cleanup` entry, or may gain it without collision checks on the new destination.

## Required changes

1. Derive the lawful Close/delivery lane list from source: Close, `issue-kind.mjs` NO_COMMIT_KINDS, the no-commit delivery record, incident-epic authority, and false-delivery and reopened-close recovery. Put the enumerated list in Outcome 1. For each lane, state its outcome/forecast provenance rule and add it to the exit matrix. Resolve the "root epic ... never no-commit" statement against the existing lawful no-commit epic lane. Either keep that lane working for outcome provenance, or explicitly scope the merged-PR requirement (for example, only epics with aggregate child timing history) and state what happens to existing no-commit epics. Do not silently retire a lawful lane inside a timing outcome.
2. Add an explicit self-hosting containment strategy covering the author's own live hooks during Outcomes 1 and 2. Examples: run the dogfooding hooks from a pinned, known-good package copy while source changes are being made, with an explicit, recorded cutover point when the self-link is re-pointed; or show that each intermediate committed state is behavior-safe for a live session. State when this repository's own runtime adopts the new emitters and the new defaults, and make that cutover the same separately admitted live action the plan already requires for migration. Add a matrix row: an author session under active #1857 timing survives the edit and the cutover without losing its start, words or queue, and #1857's canonical log receives no mixed-generation rows.
3. Define upgraded-but-unmigrated behavior and add it to the Outcome 2 exit matrix. The definition must cover: the admission result for lifecycle verbs; which commands stay available (artifact authoring, status/explain, migrate-runtime plan/status/apply/resume, and hook no-ops versus refusals); the operator message and installer/update notice; preservation of unposted legacy queue entries until migration; and an explicit rule that a populated legacy store is never classified as "total runtime loss" eligible for empty initialization.
4. Require Outcome 1 to version every new or changed persisted local store shape and to reach the stores only through the existing path/state APIs. Require Outcome 2's schema catalog and migration tests to cover both pre-Outcome-1 and post-Outcome-1 generations of the state, session, queue and word-cursor families.
5. Specify the evidence form for the Outcome 3 real-host rows. Name a durable scenario evidence document, analogous to the R8 baseline, that records the genuine host handoff, the observed attachment and snapshot state, and the truthful skill report. State which exit-matrix rows seam tests cover and which this genuine-scenario evidence covers.
6. Name the budget artifact and approval route: where the outcome-level budget and per-outcome stop thresholds are recorded, who approves them (controller or human), and whether that happens before or as part of acceptance of this plan. The precondition must be satisfiable and auditable.

## Optional suggestions

1. List the provider multi-skill schema change explicitly in Outcome 3 files: `scripts/providers/*.mjs`, `bin/cli.mjs` install/update/uninstall and `planManagedSkill`, plus `registry.test.mjs`, `parity.test.mjs`, `install-contract.test.mjs` and `install-health.test.mjs`. Add an exit-matrix row for an existing installation running `update` that gains `aitm-cleanup` under collision checks.
2. The baseline says "Observed HEAD: c096289a", while the reviewed artifact commit is ba5d0081. Note that the intervening commits are plan/review documents only, so the census remains valid at the reviewed head.
3. In the Outcome 1 assertion snippet, add a case for an outcome on a no-commit kind (spike/audit) so calibration-ingress exclusion is exercised beyond the story kind.

## Decision

revisions-requested
