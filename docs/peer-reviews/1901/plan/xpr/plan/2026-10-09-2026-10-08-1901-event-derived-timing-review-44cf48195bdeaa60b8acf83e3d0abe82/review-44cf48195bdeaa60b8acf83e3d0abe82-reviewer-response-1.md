<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-44cf48195bdeaa60b8acf83e3d0abe82"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "87f5225137ee3f90008a1fd232caf61ab2a287db"
artifact_blob: "1c5f6f22e334ff1f65def384ae221594a5035fe4"
artifact_digest: "sha256:059ebd09c9fe809b50f9b2007771b15fd18cff052f7a23b171750ed502051df9"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5"
  identity_source: "runtime"
started_at: "2026-10-09T02:18:47.881Z"
submitted_at: "2026-10-09T02:24:37.126Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008","R1-F009"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Decision: revisions-requested.

The plan is internally consistent on most of what it carries forward from the accepted specification: whole-second flooring, separating immutable source from mutable projection, protected sealed bytes, atomic lifecycle pairs, bounded non-CAS convergence, the shared activation marker and guarded preview/apply. The arithmetic checks out. Task hours sum to 80 (12+10+12+14+12+8+6+6), plus 2 for orchestration gives 82, and the wave critical path is 12+12+14+8+6 = 52. The normative amendment's examples (40/20/20, the 20-second handoff, and Session15 with unavailable joint effort for an overlap conflict) agree with the stated formulas. The Story Intent blocks, verifier blocks and root AC/VC bindings are present for all eight tasks.

The plan is not ready to hydrate. The amendment's single-owner rule meets the repository's existing automatic session-replacement path without saying what happens. Several live timing writers are outside the ownership map, even though the plan says every seam is "assigned now". The new context-token measurement depends on a capture channel the repository has no access to. Task 4 combines three separable features in a 14-hour estimate. And child-level focused verifiers leave out the existing regression tests for files those children modify.

Scope of this review: I read the complete 550-line plan, the specification's accounting, architecture, publication, scalar-projection and XPR-clarification sections, and current source at the cited seams. The seams were `runtime.mjs`, `hook-handler.mjs`, `lib/actor-hook-timing.mjs`, `lib/bind-event.mjs`, `gh-timing-comment.mjs::postTimingEvent`, `scripts/gh/log-issue-time.mjs::timingFieldProjection`, `scripts/gh/dispatch-prep.mjs`, `scripts/gh/ensure-wave-parent.mjs`, the `lib/heal-*.mjs` family, `lib/command-surface/{catalog,entrypoints}.mjs` and `scripts/providers/*`. I checked every existing test path named in the eight verifier blocks and all exist. Proposed new paths correctly do not exist yet. I could not fetch the linked GitHub clarification comment (#1901 comment 6071936726), so I judged the amendment's authority claims against the plan text and the author response that cites it. I ran no shell commands beyond the mandated join. Shell access was hook-refused for this unbound reviewer session, so I made no independent byte-hash of the artifact and ran no Git commands, tests or live writes.

## Findings

### R1-F001 — Define how automatic session replacement interacts with single-owner admission

Severity: high. Required.

Plan locations: the normative amendment (lines 59–61), the Ownership-transfer evidence contract (lines 72–83), and the Task 4 bullet "A contender refuses without writing, banking words or shifting checkpoint" (line 355).

The amendment says replacement "consumes a recorded ownership handoff". It also says "ordinary update plus another actor's bind/start never proves transfer", a normal offer comes "only from the outgoing actual bound native session", and crash takeover needs "retained actual recorded human/operator authorization or already authorized host recovery decision". Unsupported authority "refuses takeover".

The repository's most common replacement path is automatic and matches none of these shapes. `hook-handler.mjs::onSessionStart` (lines 305–320) calls `lib/actor-hook-timing.mjs::runActorHookTiming` with `event: 'SessionStart'`. Lines 17–33 of that function make the **new** provider session emit `session-end-recovery` ("prior session end unavailable") and then `session-start` under its own actor key. It does this whenever worktree state has an active binding, with no outgoing offer and no human authorization. This fires on every new Claude/Codex session, every `/clear`, and every crash restart in a bound worktree. It would also fire for a peer-review reviewer that joins "from a distinct session in the same physical worktree" while the author's binding is active, which is this review's own topology.

The plan leaves three outcomes possible, and each child could pick a different one:

1. The SessionStart path refuses as an unauthorized contender. Every new session then loses timing publication, and `onSessionStart` exits 1 on the thrown error (hook-handler.mjs lines 359–366).
2. The path is classified as an "already authorized host recovery decision". The plan never says this, and it would let any process in the worktree take ownership while the predecessor may still be live, which contradicts the conflict-refusal rule.
3. It is admitted as ordinary and produces `ownership-conflict`. Joint effort then becomes unavailable on nearly every multi-session issue.

The same gap applies to ordinary sequential sessions. If A records `pause`/`stop`/`switch-out` and B later binds, the plan never says whether an owner's own departure releases ownership. Line 61 ("Explicit departure/resume keeps the actual Idle gap") reads as same-actor only.

Required: state explicitly how ownership is released and acquired in these sequences:
- the owner's departure followed by another session's bind;
- automatic SessionStart rebind in a bound worktree;
- the existing orphan/session-end recovery;
- the PreCompact/PostCompact same-sid path.

Assign the decision to Task 4 with a named owner for `lib/actor-hook-timing.mjs`, which is not in Task 4's file list. Add Task 1/3/4 tests for each sequence, including a reviewer session starting in a worktree that holds the author's active binding. If the intended answer is that a released owner (after departure) can be succeeded without an offer, say so, and say what evidence proves release. If it is not, document the operational consequence: every session restart needs an explicit handoff command.

### R1-F002 — Several live timing producers and maintenance writers have no declared owner

Severity: high. Required.

Plan locations: "These known seams are assigned now. A later sweep verifies completeness rather than deciding their owners" (line 155). "Existing files are single-owner … If a consumer sweep discovers an unlisted shared file, pause that change and route it to its declared owner" (line 149). The adapter ownership table (lines 157–168) and the Task 4/7/8 Files sections.

Current source has timing writers that appear nowhere in the ownership map:

- `scripts/gh/dispatch-prep.mjs` (lines 100–122) and `scripts/gh/ensure-wave-parent.mjs` (lines 333–352) call `postTimingEvent` with a `buildRow({event:'start', …})` row that has **no actor key**. The first is the orchestrator's dispatch-time `start` on every fanned-out child, before the child agent's own attributed `start`. The second is the orchestration `start` on the wave parent. In the enabled model, an actorless start inside actor-era history is an unattributed non-lifecycle opener, and the agent's later start is a duplicate start. The plan does not decide the most consequential question here. Is the dispatch `start` the "earliest valid original recorded start/resume opener" for `projectSessionWallSpan`? If yes, SessionTime includes dispatch latency. If no, line 104's rule ("Complete span requires no earlier retained source/prefix with unresolved potentially earlier start") makes SessionTime null for every dispatched child.
- `lib/actor-hook-timing.mjs`, the actual producer for SessionStart, PreCompact and PostCompact rows (see R1-F001). Task 4 lists `hook-handler.mjs` but not this module.
- `lib/heal-timing-departure.mjs` and the `heal-timing-departure.mjs` CLI insert a **backdated** departure row through `buildBackdatedDepartureRow` (lines 1–5, 147–156). In an enabled log, that inserts an inferred observation that changes Active/Idle allocation, which conflicts with "no invented end" and with the protected late-insertion rules. Operators run this path as standard repair today.
- `lib/heal-actor-opener-replays.mjs` writes through `updateTimingComment` (line 141). `lib/heal-timing-starts.mjs` with the `heal-timing-starts.mjs`/`heal-timing-starts-sweep.mjs` CLIs, the top-level `heal-timing-log.mjs` CLI, and `lib/heal-timing-sweep.mjs` all rewrite timing bodies under the timing lock. Task 7 owns only `lib/heal-timing-log.mjs`, `lib/heal-timing-interval.mjs`, `heal-backlog.mjs`, `lib/timing-slug-rename.mjs` and the sequence validator.
- Task 8 registers `backfill-timing-logs` and new commands, but registration currently lives in `lib/command-surface/entrypoints.mjs`. That file classifies `backfill-timing-logs.mjs` and the heal CLIs as `live-maintenance-or-migration` internal rows, and `catalog.mjs` derives command metadata from it. Task 8 does not list `entrypoints.mjs`, `verbs/help-data.mjs` or the #1558 admission-surface inventory fixture.

Under the plan's own rule, any child that finds these files must pause because no declared owner exists, so hydration would create children that block on discovery. Required: assign each file above to one task with an enabled-model disposition (adopt the seam, refuse on marker-present logs, or explicitly remain legacy-only). Decide whether orchestrator dispatch/wave-parent `start` rows count toward SessionTime's earliest opener, and how they relate to ownership. Add fixtures for a dispatched child (actorless dispatch start, then the agent's attributed start) to Task 1 and Task 5.

### R1-F003 — The primary Codex context-measurement source is not reachable from AITM's capture path

Severity: medium. Required.

Plan location: Session measurements, bullets 2–3 (lines 92–93).

The plan names "a genuine version-checked thread/tokenUsage/updated notification correlated to the actual bound thread/turn" as the supported Codex evidence, citing the app-server documentation. It treats a rollout `token_count` record as only conditionally eligible. AITM does not run as an app-server client. It runs as hook commands and reads native rollout JSONL. `scripts/providers/codex.mjs` declares `transcriptSchema: 'codex-rollout-v1'`, `transcript-resolver.mjs` resolves date-bucketed `<prefix>-<sid>.jsonl` files, and `transcript-normalizer.mjs` handles `response_item` records. No production file under `scripts/` references `tokenUsage`, `token_count`, `inputTokens`, `input_tokens` or app-server. A hook process has no subscription through which it could receive `thread/tokenUsage/updated`. Line 93 also forbids adding a new provider harness.

As written, Task 4 must either build a capture channel the plan forbids, or ship a "supported" path that never fires while every row says `Unknown`. That burns estimate and creates a misleading test surface.

Required: pick one of these and state it in the plan:
(a) make the rollout `token_count` last-request record (with its exact field path and version check) the primary Codex source, with the app-server notification out of scope;
(b) explicitly scope context capture to always-Unknown with reasons in this defect, deferring real capture to a separately filed issue.

Either way, Task 4's tests should pin which concrete record shape is accepted.

### R1-F004 — Task 4 bundles three separable features under a 14-hour estimate

Severity: medium. Required.

Plan locations: the wave table (line 143), Task 4 Files (line 349) and its verifier (line 375).

Task 4 now owns:
- the producer/journal/queue/lifecycle/PublicationResult rewiring across 15 existing modules (the original AC3 scope);
- the whole ownership-transfer protocol: offer/acceptance/takeover shapes, an authorization resolver against genuine host evidence, an adjacent durable handoff journal, and recovery semantics;
- the session-measurement feature: a new `normalizeNativeUsageObservation` provider export, cursor generations and baselines, and context gauges.

It creates three new modules plus a provider test and extends or creates 11 test files. The amendment raised the root estimate from 70 to 82 hours, but Task 4 still sits at 14 hours and size L. In the same plan, Task 3 (one publisher seam) is 12 hours.

The handoff protocol and the measurement capture have independent risk, independent verifiers and different consumers: Task 3 admits handoff pairs, while Task 5 projects measurements. One worker in one worktree carrying all three on the critical path is the plan's main schedule and context-exhaustion risk, and it puts R1-F001's unresolved semantics into the same unit as the AC3 producer rewiring.

Required: split Task 4 into at least (4a) producers/journal/queue/lifecycle and PublicationResult, (4b) ownership handoff and authorization, and (4c) native measurement capture, unless R1-F003(b) removes 4c. Give each its own estimate, rank, dependencies and focused verifier. Re-derive the root estimate and critical path.

### R1-F005 — Child focused verifiers omit existing regression tests for the files those children modify

Severity: medium. Required.

Plan locations: "Each child owns executable focused verifiers; aggregate gates never substitute for a failed child contract" (line 53), and the Task 4 and Task 5 Verification Commands.

Task 4 modifies `runtime.mjs`, `queue.mjs`, `hook-handler.mjs`, `verbs/{resume,review,approve,close}.mjs` and `lib/move-state/*`. Its verifier leaves out existing tests that directly cover those timing paths, including:
- `unit/task-tracker/core/close-flush-timing.test.mjs`
- `integration/task-tracker/lib/verb-start-resume-stop.test.mjs`
- `integration/task-tracker/lib/timing-actor-runtime.test.mjs`
- `unit/task-tracker/lib/actor-queue-isolation.test.mjs`
- `unit/task-tracker/hooks/stop-audit-pause-resume.test.mjs`
- `unit/task-tracker/verbs/approve-timing-boundary.test.mjs`
- `integration/task-tracker/lib/resume-auto-gap-activity.test.mjs`
- `slow/task-tracker/lib/coverage-hook-handler.test.mjs`

Task 5 modifies `lib/timing-rows.mjs` and `lib/timing-engagement.mjs`, but its verifier leaves out:
- `unit/task-tracker/lib/timing-rows.test.mjs`
- `timing-rows-seconds.test.mjs`
- `timing-actor-accounting.test.mjs`
- `active-by-phase-spans.test.mjs`
- `core/pause-row-duration.test.mjs`

Under this repository's per-child cadence, child Test stages run their declared targeted commands, and only Task 8 runs `npm test` / `test:slow`. A Task 4 or Task 5 regression in those suites would first surface at wave 5, in a different owner's worktree, after wave 4 has built on it. That is exactly the aggregate-substitution the plan prohibits.

Required: add the existing directly affected suites to each modifying task's verifier. At minimum cover the files named above and the existing tests for every module in the Files list. Alternatively, add a rule that each child's verifier includes every existing test that imports a module the child modifies, and have hydration enumerate them.

## Required changes

1. Resolve R1-F001: specify ownership release and acquisition for departure-then-rebind, automatic SessionStart rebind, orphan/session-end recovery and same-sid compaction. Assign `lib/actor-hook-timing.mjs`, and add the sequence tests, including the same-worktree reviewer case.
2. Resolve R1-F002: assign every listed unowned timing writer and registration file to a single task with an enabled-model disposition. Decide whether actorless orchestrator `start` rows count for SessionTime and ownership, and add dispatched-child fixtures.
3. Resolve R1-F003: choose a reachable Codex context source (rollout `token_count` last-request) or scope context to Unknown-only with a follow-up issue, and pin the accepted record shape.
4. Resolve R1-F004: split Task 4 into separately estimated and verified units, then re-derive the root estimate, wave table and critical path.
5. Resolve R1-F005: add existing directly affected regression suites to each modifying child's focused verifier, or state an enumerable rule hydration applies.

## Optional suggestions

### R1-F006 — Make the Task 1 history-fixture verifier explicitly offline

Line 211 says capture is verified "against canonical current comment authority" and that "capture failure blocks the real-history verifier". State that `1901-timing-history-fixtures.test.mjs` checks only committed bytes against the manifest digest, with no network access. Make re-verifying against live GitHub a separate one-time capture step, so the unit lane stays hermetic.

### R1-F007 — Remove path-shorthand ambiguities in the adapter table

Line 155 says shortened paths resolve beneath `scripts/task-tracker`. Under that rule, `timing-engagement.mjs` and `timing-ladder.mjs` in the Task 5 row resolve to non-existent top-level files; the real files are under `lib/`. `heal-timing-interval.mjs` in the Task 7 row resolves to the top-level CLI, while Task 7's Files section names `lib/heal-timing-interval.mjs`, and both files exist. Use exact paths in the table.

### R1-F008 — Cover the human-readable Session line in log-issue-time

`scripts/gh/log-issue-time.mjs` lines 82–83 also print `Session Time: ${totalActiveMin} min` and an Engaged line of the form "active + review". Task 5's bullet names only `timingFieldProjection`. Include the printed report lines in the enabled-model mapping and its tests, so the CLI output does not keep the old alias.

### R1-F009 — Bind the harness variable in the Task 3 example

In the Task 3 snippet, `deps: twoWriterHarness(...)` is passed inline but `harness.sourceIds()` is called afterward. Bind the harness first so the example can actually run, as the Task 1 guidance requires ("New module failures must be caused by missing implementation … not broken test import paths").

## Decision

revisions-requested
