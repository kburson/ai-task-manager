# #1901 historical issue records — plan-responses

This is an exact preservation of owned issue-comment bodies before the October 9, 2026 conversion to concise process summaries and immutable Git links. It preserves historical wording, including then-current statuses and relative links; it does not assert those statuses remain current. The accepted artifacts, sealed review responses, and current preparation handoff remain the operational records. Timing, commit-trace, state-transition provenance, and other AITM-owned lifecycle comments are outside this archive and remain on the issue.

## Comment 6073604670

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073604670

Created: 2026-10-09T03:22:19Z. Last updated before archival: 2026-10-09T03:22:19Z.

<!-- historical-comment-body:start id="6073604670" -->
````````text
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

<!-- aitm-owned-comment key="plan.xpr-claude-reviewer-round-1" -->
````````
<!-- historical-comment-body:end id="6073604670" -->

## Comment 6073605664

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073605664

Created: 2026-10-09T03:22:24Z. Last updated before archival: 2026-10-09T03:22:24Z.

<!-- historical-comment-body:start id="6073605664" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-44cf48195bdeaa60b8acf83e3d0abe82"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "bcdb2b293df6d81d973ef9bcec4157dfd0b81dff"
artifact_blob: "a43a0aaeeceacfe53b93d08819049e1cb1105541"
artifact_digest: "sha256:718deac13d692a30be2ea6cea7c8f1d5d98f953d7fbd5ed4f216c1f0f4167984"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5"
  identity_source: "runtime"
started_at: "2026-10-09T02:18:47.881Z"
submitted_at: "2026-10-09T03:10:36.110Z"
finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Decision: revisions-requested. The revision is substantial and mostly resolves round 1. One residual gap in R1-F001 and one stale ownership sentence remain.

I re-read the complete revised 659-line plan and the author's turn-1 response, then re-checked current source. I ran no shell, Git or test commands, so I made no independent byte-hash of the artifact.

Verification of round-1 dispositions:

- **R1-F001, partially resolved.** The startup/release/guest/orphan/compaction decision table (lines 112–119) and the `classifySessionOwnership` contract (line 121) answer each sequence I raised. `lib/actor-hook-timing.mjs` is now Task 4-owned. Expected deferrals are nonfatal, and the same-worktree reviewer case is tested. The residual problem is R2-F001: the evidence sources that make release and takeover verifiable in production are still abstract, and fail-closed defaults turn the ordinary "next session" path into indefinite deferral.
- **R1-F002, resolved.** dispatch-prep and ensure-wave-parent go to Task 4, with a non-owning `orchestration-dispatch` role and the dispatch0/worker10/update20 regression (Session20/Active10/Idle0/unengaged10). That arithmetic is consistent with the wall-span formula. Every healer library and CLI I named is assigned to Task 9 with enabled-log `duration-model-source-repair-refused` dispositions. `entrypoints.mjs`, `help-data.mjs` and the #1558 admission fixture go to Task 10.
- **R1-F003, resolved.** Rollout `event_msg`/`token_count`/`info.last_token_usage.input_tokens` is now the primary Codex source, app-server capture is out of scope, aggregate/capacity substitutes are rejected, and the cached-input double-addition case is tested.
- **R1-F004, resolved.** Task 4 is split into Task 4 (producers, 14h), Task 5 (handoff/authority, 14h) and Task 6 (measurement, 8h). I re-derived the numbers. The children sum to 110 hours (12+10+12+14+14+8+12+8+12+8), plus 2 root hours gives 112. The six-wave critical path is max(12,10,8) + 12 + 14 + max(14,12) + max(8,12) + 8 = 72. The dependency edges are acyclic and consistent with the ranks.
- **R1-F005, resolved.** All requested minima now appear in the Task 4 and Task 7 verifiers. The enumerable focused-regression inventory rule (lines 137–139) covers the remainder.
- **R1-F006 through R1-F009, resolved.** The fixture verifier is offline, exact paths are in the adapter matrix, Task 7 owns the human-readable log-issue-time lines, and harness variables are bound in the examples.

I confirmed that every newly cited existing test file exists:
- `heal-timing-interval-cli`, `heal-timing-sweep` and `heal-timing-log-command`;
- `word-counter`, `word-counter-codex` and `word-counter-full-expansion`;
- `command-catalog-policy` and `command-catalog-parser-policy`;
- `coverage-dispatch-prep`, `dispatch-prep-inprocess` and `ensure-wave-parent`.

## Findings

### R2-F001 — Name the concrete production evidence that verifies departure release and authorizes takeover

Severity: high. Required.

Plan locations: line 72, line 74, line 80, the line 83 resolver contract, startup table rows 1, 2 and 4 (lines 114–117), Task 5 bullet 4 (line 438), and line 91's owner-only provenance rule.

The decision table now routes every non-handoff replacement through one of two gates.

- **Departure-successor gate.** "A's own canonical authenticated departure releases execution ownership." B "may acquire through kind=departure-successor after verifying exact release."
- **Authorized takeover gate.** This requires "retained actual operator authorization or genuine already authorized host/controller recovery decision."

The resolver is required to "fail-closed" on unavailable sources (line 438). The plan never names what concrete production evidence satisfies either gate, and its own constraints rule out the obvious candidates:

- Line 72 says "A readable actor/source ID, endpoint or matching human assignee is not release authority". So the actor marker on A's existing `pause`/`stop`/`switch-out` row cannot by itself authenticate the departure.
- Lines 75 and 83 say authority resolves to "retained genuine host binding/operation evidence". But line 91 keeps "native handles/transcript paths and exact authorization/binding receipts" as "owner-only local provenance". A successor in another worktree, on another host, or with a different provider generally cannot read A's local receipts. Even on the same host, the plan does not say which existing store holds them or whether B's process may read them.
- For takeover, the plan forbids "agent-authored approval prose, raw actor IDs and self-declared orphan status", requires "genuine user-origin or already authorized controller decision evidence", and gives no source. Current code has user-prompt hook surfaces (`hooks/on-user-prompt.mjs`, `hooks/codex-prompt-timestamp.mjs`, the #1558 direct-guidance admission), but the plan does not designate any of them, or anything else, as the user-origin authority. No existing "controller recovery decision" artifact is named either.

Here is the failure scenario under the plan as written. It is the most common real workflow. Session A works on #N and the terminal is closed without `/task pause`; A has no departure row. The user opens session B in the same worktree. Row 2 says SessionStart defers read-only with no recovery rows and no state change. The user then works in B for hours. Row 4 says presence is not authority, and the takeover resolver has no named authority source, so it fails closed. B's flushes and lifecycle rows are therefore contender-refused (line 355). The refusals are nonfatal, so they stay silent, and #N records no timing from B until someone finds a takeover authority the plan never defines. The same thing happens in the departure case whenever B cannot resolve A's owner-local receipts. Task 5 can satisfy every listed test with synthetic authority fixtures, which line 85 explicitly allows, while production has no satisfiable path.

Required:

1. Name the exact existing (or explicitly newly created, Task-owned) production evidence source for each gate.
   - Departure-successor: what B verifies, where it lives, and how B reads it across worktree/host/provider boundaries without exposing owner-only handles. Alternatively, state explicitly that the canonical Timing Log row plus a specified verifiable property is sufficient, and reconcile that with line 72.
   - Takeover: which user-origin artifact counts, for example a specific user-prompt hook receipt for an explicit `/task #N` or `timing-handoff recover` command, which component writes it, and how replay or model-forgery is excluded.
2. State the operator-visible behavior when B is deferred or refused: the exact message, the next command, and whether B's subsequent flushes are journaled for later admission or permanently dropped.
3. Add a Task 4/5 end-to-end test of the dominant path using the real resolver with production-shaped (not synthetic-authority) inputs:
   - A closes without pause;
   - B starts and is deferred;
   - the user issues the sanctioned command;
   - the takeover receipt is admitted;
   - B's later bounded work is recorded while A's tail stays unavailable.

   Add the analogous cross-worktree departure-successor case.

If the intended answer is that only same-host, same-worktree replacement is supported in this defect, state that scope limit and its operational consequence in the amendment.

### R2-F002 — Remove the stale Task 4 test-ownership sentence

Severity: low. Required, because the plan states that ownership is strict and that the amendment overrides conflicting task text.

Line 100 still ends: "newly named handoff/journal/measurement tests are Task 4 owned". After the split, Task 5 creates `timing-handoff*.test.mjs` (line 431) and Task 6 creates `timing-measurement.test.mjs` and `transcript-normalizer.test.mjs` (line 471). Hydration could hand those test files to two owners. Change the sentence to name Task 5 and Task 6 respectively.

## Required changes

1. Resolve R2-F001: name the concrete production authority and release-evidence sources, define deferred and refused operator behavior and journaling, and add production-shaped end-to-end tests for the closed-without-pause takeover and cross-worktree departure-successor paths. Alternatively, state an explicit supported-scope limit.
2. Resolve R2-F002: correct line 100's ownership of handoff and measurement tests to Tasks 5 and 6.

## Optional suggestions

### R2-F003 — Seed Task 10's verifier with the existing registration suites

The Focused regression inventory rule will pick these up at hydration, but listing them now makes the Task 10 minimum match its stated ownership. The suites are:
- `unit/task-tracker/lib/executable-entrypoint-classification.test.mjs`
- `integration/task-tracker/lib/guidance-admission.test.mjs`, which reads the #1558 admission surface
- `unit/task-tracker/verbs/help.test.mjs`
- `integration/task-tracker/verbs/help.test.mjs`

### R2-F004 — Use the full path for hook-handler in Task 4 Files

Task 4 Files (line 391) lists bare `hook-handler.mjs`, while every other entry uses a full repository path, as the adapter matrix does. Use `scripts/task-tracker/hook-handler.mjs` for consistency with the R1-F007 resolution.

## Decision

revisions-requested

<!-- aitm-owned-comment key="plan.xpr-claude-reviewer-round-2" -->
````````
<!-- historical-comment-body:end id="6073605664" -->

## Comment 6073606624

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073606624

Created: 2026-10-09T03:22:29Z. Last updated before archival: 2026-10-09T03:22:29Z.

<!-- historical-comment-body:start id="6073606624" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-44cf48195bdeaa60b8acf83e3d0abe82"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "e22473f927cdb0629651cdc94c1204ea7e621ca5"
artifact_blob: "c66c11455859d1a427f12fe84d6b5ef76541bbca"
artifact_digest: "sha256:9d35c258971ff176b2f9c2fb378272703e167218c64a5765e04c341a70f351a8"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5"
  identity_source: "runtime"
started_at: "2026-10-09T02:18:47.881Z"
submitted_at: "2026-10-09T03:16:37.603Z"
finding_ids: ["R3-F001","R3-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Decision: revisions-requested. One required finding remains, and it is narrow: the location chosen for the new shared receipt index sits inside a tree that the existing #1857/#1862 runtime migration treats as a legacy source and blocks on. Everything else in round 2 is resolved.

I read the author's turn-2 response, the new section "Concrete production authority and deferred-session recovery" (plan lines 87–101), the reconciled transfer-contract lines (72–83), the updated startup table (lines 128–141), and the corrected ownership sentence (line 116). I then checked every existing API and path the new section cites against current source. I ran no shell, Git or test commands.

Verification of round-2 dispositions:

- **R2-F001: resolved in substance, with one location defect (R3-F001).** The plan now names concrete production evidence for both gates.
  - Departure-successor: the owner's own operation receipt. It is checked with `readOccupancy` plus `sameBindingGeneration` and advanced only after canonical read-back. A bare row, a digest or caller-supplied JSON is explicitly insufficient, which reconciles line 72.
  - Takeover: a native Codex `response_item` user `input_text` message containing the exact standalone `timing-handoff recover` command. It is re-read independently through the real resolver and filtered by `isInjection`. Prompt timestamps or a `/task` bind alone are rejected.

  The scope limit is explicit: same OS user and host only, cross-host refused, Claude/other-provider takeover refused until an equivalent adapter exists. The visible deferred message, the explicit refusal codes, and the permanent non-credit of pre-authorization contender work are all specified. Generation-safe crash states and production-shaped end-to-end tests now cover both dominant paths, using real resolvers rather than an always-verified callback.

  I confirmed the cited APIs exist:
  - `fleet-registry.mjs::findMainWorktreePath` (line 58)
  - `lib/occupancy.mjs::readOccupancy` (line 44)
  - `lib/evidence-v2/binding-generation.mjs::sameBindingGeneration` (line 23)
  - `word-counter.mjs::isInjection` (line 263)
  - `lib/workflow-policy/authority-resolver.mjs`

  I also confirmed that the `on-stop.mjs` hook no longer stages a pause, so it does not need a departure receipt path.
- **R2-F002: resolved.** Line 116 now assigns the handoff/journal/authority tests to Task 5 and the measurement/native-normalizer tests to Task 6.
- **R2-F003: resolved.** The four registration suites I suggested were added to Task 10's verifier.
- **R2-F004: resolved.** Task 4 Files now spells out the full `scripts/task-tracker/hook-handler.mjs` path.

The estimate (112 hours), ranks and dependency graph are unchanged from turn 2. I re-checked them then and they remain arithmetically consistent.

## Findings

### R3-F001 — Move the shared handoff receipt index out of the legacy `.db/aitm` tree that the runtime migration inventories and blocks on

Severity: medium. Required.

Plan location: line 91 says "a private, restrictive-permission shared receipt index at findMainWorktreePath(projectDir)/.db/aitm/timing-handoff/<repository-digest>/<issue>/<operation-id>.json, reached through the existing … paths.mjs authority root".

That location conflicts with the current runtime-storage contract on three points.

1. **`paths.mjs` has no `.db` authority root.** Its roots are `.tmp/aitm/...` (lines 25–265). The current #1857/#1862 runtime authority is `runtime-storage.mjs::runtimeStoragePaths` (lines 230–249), which resolves `<mainRoot>/.ai-task-manager/runtime/store` as the shared store and `<projectRoot>/.ai-task-manager/runtime/store` as the local store. The `.gitignore` comment at lines 43–48 describes `/.db/` as retired ("not SQLite authority (ADR 0002 / #1048)"), kept ignored only for a residual #1217 journal.
2. **The runtime migration treats `.db/aitm` as a legacy source and blocks on anything it does not recognise.** `lib/runtime-migration-plan.mjs` lines 137–162 inventory `path.join(root, '.db', 'aitm')` as `kind: 'legacy-durable'`. Every file found there must be accepted by `adapters.classifyLegacy`, with a `family` registered in `FAMILY_SCOPES` (lines 27–43). Otherwise the plan records `block('unknown-source', source)`. The `FAMILY_SCOPES` list has no `timing-handoff` family. The first retained receipt written to the proposed path would therefore make the existing runtime migration refuse on that repository. That contradicts the plan's Scope ("Keep … #1857/#1862 runtime authority intact") and line 91 itself ("never replacement GitHub timing authority … no runtime-storage migration").
3. **The ownership matrix does not cover the fix either way.** Adding a registered family, or classifying the new files in the migration, means editing `lib/runtime-migration-plan.mjs` and probably `lib/runtime-storage.mjs`. Neither file is assigned to any task.

This is a location and ownership decision, not a redesign. Required: pick one of the following, state it at line 91, and assign any touched runtime-storage files to Task 5 (or another single owner) with focused tests.

- (a) Place the index in the current shared runtime store (`runtimeStoragePaths(...).sharedRoot`) as a newly registered `shared`-scope family. Update `FAMILY_SCOPES` and the migration classification so inventories stay green. Add the existing runtime-migration and runtime-storage suites, such as `integration/task-tracker/lib/runtime-migration.test.mjs`, `runtime-migration-transaction.test.mjs` and `runtime-storage.test.mjs`, to that task's verifier.
- (b) Justify a different, already-sanctioned non-inventoried location, and prove with a test that the runtime migration plan ignores it rather than blocking.

Either way, add a negative test showing that a written handoff receipt does not cause `unknown-source` (or any other block) in the real runtime migration plan.

## Required changes

1. Resolve R3-F001: relocate the shared handoff receipt index from `<main>/.db/aitm/timing-handoff/…` to a location consistent with current runtime-storage authority, or prove that the migration ignores it. Assign any runtime-storage or migration file edits to a single task, and add the runtime-migration non-blocking regression to that task's verifier.

## Optional suggestions

### R3-F002 — Make the deferred-startup message provider-accurate

The deferred message at line 99 tells every deferred session to "send: timing-handoff recover …". Under line 89, a Claude or other-provider successor that follows that instruction always gets `takeover-user-source-unsupported`. The message should either print the provider-specific supported route, or say directly that recovery is unavailable for this provider. Also document the actual workaround for an unpaused lost owner when the successor is not Codex, for example taking over from a Codex session on the same host and then releasing through an owned departure. That way the operator guide does not advertise a command that cannot succeed for the session reading it.

## Decision

revisions-requested

<!-- aitm-owned-comment key="plan.xpr-claude-reviewer-round-3" -->
````````
<!-- historical-comment-body:end id="6073606624" -->

## Comment 6073607605

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073607605

Created: 2026-10-09T03:22:33Z. Last updated before archival: 2026-10-09T03:22:33Z.

<!-- historical-comment-body:start id="6073607605" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-44cf48195bdeaa60b8acf83e3d0abe82"
role: "reviewer"
turn: 4
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "e8a34e7b1fbb39cafddae7a4189d819f005ba4b9"
artifact_blob: "31ea9b98614ed8efb863b327536e39bbe7549cc6"
artifact_digest: "sha256:df768032f5fa4111babc0a3ea9ef4acfc879a95217b75bdd638be9f289e86668"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5"
  identity_source: "runtime"
started_at: "2026-10-09T02:18:47.881Z"
submitted_at: "2026-10-09T03:19:34.415Z"
finding_ids: ["R4-F001"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Decision: accepted. Both round-3 items are resolved, and no new required findings exist.

I read the author's turn-3 response and checked the revised plan sections against current source: the authority section (plan lines 87–101), the adapter ownership row for Task 5 (line 215), and Task 5's Files and verifier (lines 447 and 473). I ran no shell, Git or test commands.

Verification of round-3 dispositions:

- **R3-F001: resolved.**
  - The receipt index now lives at `runtimeStoragePaths({projectRoot,mainRoot}).sharedRoot/timing-handoff/...`. This matches the current shared runtime store resolved by `lib/runtime-storage.mjs::runtimeStoragePaths` (lines 230–249). The retired `.db/aitm` location and the wrong `paths.mjs` authority claim are gone.
  - Task 5 is now the single owner of the additive `timing-handoff` shared-family registration in `lib/runtime-migration-plan.mjs` (its `FAMILY_SCOPES` registry, lines 27–43) and of any path or control compatibility in `lib/runtime-storage.mjs`. Both files appear in the ownership matrix and in Task 5's Files list.
  - An unactivated or migrating runtime refuses with `handoff-runtime-not-ready` before any mkdir or write. No live migration runs, and no store or control marker is created to bypass the refusal.
  - The regression plan uses the real `planRuntimeMigration` (`runtime-migration-plan.mjs:79`) and compares blockers before and after a receipt is written. It explicitly keeps the planner's existing refusal of a second migration into an already-created destination, rather than weakening it. Unexpected legacy files continue to block.
  - Task 5's verifier now includes the existing `runtime-storage`, `runtime-migration` and `runtime-migration-transaction` integration suites, and all three exist.
- **R3-F002: resolved.** The deferred-startup diagnostics are now provider-accurate.
  - Codex successors get the supported `timing-handoff recover` route.
  - Other-provider successors get an explicit "unavailable for this provider" message plus the real workaround: same-host Codex recovery, then an owned departure or a normal handoff.
  - Cross-host and unready-runtime sessions get their specific refusal and prerequisites.

Overall, the plan now holds together:
- It has explicit ownership semantics for every replacement path.
- Concrete, satisfiable production authority sources exist within a stated same-host scope.
- Every live timing writer and every registration file has a single owner.
- The Codex measurement source is reachable.
- The work is split into ten tasks across six waves. The children sum to 110 hours plus 2 root hours for 112, with a 72-hour critical path.
- Child verifiers carry the existing regression minima, plus a rule for enumerating further regressions at hydration.

Execution risk sits mainly in Task 5's breadth: the authority resolver, generation-safe recovery and runtime-family registration together in 14 hours. Child refinement should revisit that estimate. This is not a plan defect.

## Findings

None.

## Required changes

None.

## Optional suggestions

### R4-F001 — Correct the guard name `assertRuntimeWritable`

Line 91 says to "Use the existing assertRuntimeReadable/assertRuntimeWritable and assertRuntimeStoragePath guards". `assertRuntimeReadable` exists (`runtime-storage.mjs:309`), and so does `assertRuntimeStoragePath` (`runtime-storage.mjs:360`, an alias of `assertStoragePath`). No exported `assertRuntimeWritable` exists anywhere under `scripts/task-tracker`.

At deep dive, either name the actual existing write-side guard that Task 5 should reuse, or state that Task 5 adds `assertRuntimeWritable` to its owned `runtime-storage.mjs`, with focused tests. That way the implementer does not go looking for an "existing" API that isn't there.

## Decision

accepted

<!-- aitm-owned-comment key="plan.xpr-claude-reviewer-round-4" -->
````````
<!-- historical-comment-body:end id="6073607605" -->

## Comment 6073613115

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073613115

Created: 2026-10-09T03:23:01Z. Last updated before archival: 2026-10-09T03:23:01Z.

<!-- historical-comment-body:start id="6073613115" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-44cf48195bdeaa60b8acf83e3d0abe82"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "87f5225137ee3f90008a1fd232caf61ab2a287db"
artifact_blob: "1c5f6f22e334ff1f65def384ae221594a5035fe4"
artifact_digest: "sha256:059ebd09c9fe809b50f9b2007771b15fd18cff052f7a23b171750ed502051df9"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
  identity_source: "runtime"
started_at: "2026-10-09T02:17:32.513Z"
submitted_at: "2026-10-09T03:05:12.560Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008","R1-F009"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Resolved all five required findings and all four optional suggestions. The plan now has10 independently reviewable tasks in6 waves. Producer integration, ownership transfer/authority and native measurements have separate owners/verifiers. Actual startup/recovery/compaction/guest ownership decisions, dispatch wall milestones and every named maintenance/registration writer are explicit. Codex capture uses the existing reachable rollout path and exact field shape, supported by a real read-only native sample. Child focused regression evidence expands before Test, and all examples/report mappings are corrected. Child estimates sum110 hours plus2 root =112 joint hours; critical path72 hours. Historical spec/SPR evidence stays intact; this is the current XPR revision.

## Finding dispositions

### R1-F001 — Resolved

Added explicit startup/released-owner decision table and classifySessionOwnership contract. An actual owner's authenticated pause/stop/switch-out releases at its original tuple; legitimate successor bind uses departure-successor provenance, no unnecessary normal offer, and closes genuine joint Idle. New-sid automatic SessionStart never authorizes takeover: it defers read-only/nonfatally before occupancy/flush/state/checkpoint effects. Unjoined reviewer sid is deferred, and genuinely registered reviewer is isolated from AITM timing ownership. Orphan presence is not authority; verified controller/operator takeover opens bounded future work without inventing old end. Same-sid compaction preserves owner/state/cursors; same-sid resume is distinguished from genuinely missing-end recovery.

Task4 owns actual actor-hook-timing plus hook-handler/bind/resume adapters and integration tests. Task5 implements classification/control authority; Tasks1/3 validate normalized controls. All four source sequences and same-worktree reviewer startup now have explicit tests, without global lease redesign or generic hook exit1 for expected deferred cases.

### R1-F002 — Resolved

Exact-path ownership matrix assigns dispatch-prep and ensure-wave-parent to Task4, all listed actor-hook/healer/sweep/CLI writers to Tasks4/9, and entrypoints/catalog/help-data/#1558 admission inventory to Task10. Enabled orchestrator start is an explicitly non-owning dispatch wall milestone: SessionTime includes latency; worker engagement begins at actual bound start, with not-yet-engaged wall remainder and no invented Idle or duplicate start. Task1/7 pin dispatch0/worker10/update20 => Session20/Active10/Idle0/remainder10.

Backdated departure, opener deletion/replay cleanup, source rewriting and implicit heal/sweep applies stay legacy-only and refuse marker-present enabled mutations before writes, protected or not. Controlled source-preserving projection repair requires Task8's reviewed preview/exclusion/backup/fresh-base/read-back route. Actual CLIs and libraries are tested; registration never grants unintended new-model write authority.

### R1-F003 — Resolved by selecting reachable rollout capture

Chose option(a): existing Codex date-bucketed native rollout JSONL is primary; app-server subscription/capture is out of scope. Exact accepted path is event_msg.payload.type=token_count, payload.info.last_token_usage.input_tokens, validated against genuine session_meta.id/cli_version and prior turn_context/task_started turn context, cwd/provider/time/ordinal. The token row itself has no turn_id; no ID is invented. Total usage/capacity/exec aggregates are rejected.

Verified through the existing transcript resolver against this workflow's actual known native reviewer session: CLI0.162.0-alpha.2; top-level timestamp/ordinal/type/payload; info keys total_token_usage,last_token_usage,model_context_window; last input227699 and separately observed capacity258400. Only selected metadata/counter fields were inspected in output; private handles, paths and raw messages are not committed. These are observed sample values, not fixed model facts or current post-response context. Task6's isolated fixture captures sanitized shape/provenance and version cases; absent/unsupported evidence remains explicitly Unknown.

### R1-F004 — Resolved by decomposition

Old combined Task4 is split into Task4 actual producers/hooks/queue/outcomes(14h), Task5 handoff/authority/adjacent journal(14h) and Task6 native measurement(8h), each with four-part Story Intent, file boundary, APIs, dependencies and focused verifier. Measurement can fan out in wave1 with engine/codec. Handoff follows publisher/measurement in wave3; producers and projection are distinct-file siblings in wave4; repair/maintenance follow in wave5; final integration is wave6. Ten child estimates total110 plus2 root; critical path12+12+14+14+12+8=72. No worker is launched.

### R1-F005 — Resolved

Producer verifier explicitly includes every requested existing close/start-resume/runtime/queue/hook/approval/gap/slow-hook suite plus dispatch/wave-parent regressions. Projection explicitly includes timing-rows, seconds, actor-accounting, active-by-phase and pause-duration suites. Maintenance includes all named healer libraries/CLIs/sweep regressions; registration includes catalog tests.

A source-grounded focused-regression inventory rule additionally requires hydration/pickup to enumerate every existing test/import/helper/CLI invocation for modified files and materialize exact additional child VC commands before Test, with source hash and any unresolvable invocation evidence retained. Aggregate Task10 checks cannot replace another child's failed focused contract. Proposed new tests remain implementation obligations, not claimed already passed.

### R1-F006 — Resolved

History-fixture unit verifier is explicitly offline against committed bytes/manifest. Live GitHub capture/reverification is a separate one-time read-only preparation step. Capture failure blocks completing required fixture preparation; unit tests never contact GitHub or replace missing real sources with synthetic history.

### R1-F007 — Resolved

Adapter matrix uses exact full repository production paths for engagement/ladder and distinguishes library versus top-level healer CLI. New task file lists normalize lib/verb/test shorthand to actual assigned namespaces. Expanded named writers each have one owner and enabled disposition.

### R1-F008 — Resolved

Task7 owns actual human-readable log-issue-time output as well as board projection: enabled Session line uses independent sessionMin and Engaged reports joint Active without adding Review again. Actual CLI/partial/stale/legacy cases are in focused verification; board codec remains unchanged.

### R1-F009 — Resolved

Task3 binds const harness=twoWriterHarness(...) before passing it as deps and using it for assertions. New producer/handoff examples likewise declare their test-local harness variables and specify those fixture APIs, avoiding an unbound example name.

## Changes made

- Ten tasks/six waves, independent producer/handoff/measurement owners and updated112-hour joint estimate.
- Explicit startup/release/guest/orphan/compaction and dispatch source control contracts, verifiedControls callback and sourceRole/ownershipEffect.
- Reachable native rollout capture path/shape/correlation with real versioned sample and honest absence behavior.
- Exact known-writer ownership, enabled source-repair refusals and registration/admission inventory.
- Existing regression minima and enumerable child-specific additional VC obligations.
- Offline fixture checks, CLI Session/Engaged report mapping and bound examples.

## Declined changes and rationale

None. No app-server client/harness is added, no global distributed lease is promised, no existing word-counter semantics are redefined and no historical source/protected bytes are rewritten.

## Verification

- Complete sealed reviewer notes and named production sources reviewed, including actual actor-hook-timing and orchestrator buildRow/postTimingEvent paths.
- Real native token record metadata inspected via existing resolver; no credential/private message content was printed or copied into collateral.
- extractPlanTasks+validateSplitTasks:10 tasks; ok=true; zero errors/violations; each has valid intent/executable focused commands.
- Wave dependency/file-owner graph and arithmetic checked:110 child hours+2 root=112; six-wave critical path72.
- Existing newly referenced regression paths checked against repository files.
- Prettier formatted only tracked plan; git diff --check passed. No proposed implementation tests executed or claimed passing.
- Only plan/review documents changed; no implementation, live historical apply, model activation or provider harness was performed.

<!-- aitm-owned-comment key="plan.xpr-claude-author-round-1" -->
````````
<!-- historical-comment-body:end id="6073613115" -->

## Comment 6073614164

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073614164

Created: 2026-10-09T03:23:06Z. Last updated before archival: 2026-10-09T03:23:06Z.

<!-- historical-comment-body:start id="6073614164" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-44cf48195bdeaa60b8acf83e3d0abe82"
role: "author"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "bcdb2b293df6d81d973ef9bcec4157dfd0b81dff"
artifact_blob: "a43a0aaeeceacfe53b93d08819049e1cb1105541"
artifact_digest: "sha256:718deac13d692a30be2ea6cea7c8f1d5d98f953d7fbd5ed4f216c1f0f4167984"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
  identity_source: "runtime"
started_at: "2026-10-09T02:17:32.513Z"
submitted_at: "2026-10-09T03:14:44.785Z"
finding_ids: []
answered_finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the plan against all four sealed round-2 findings. The largest change names a satisfiable, bounded production authority route instead of relying on unspecified controller evidence. The supported handoff scope is now explicit: same OS user/host and shared main-checkout authority; cross-host authority and unattended controller takeover are refused. Codex native user-source takeover is supported; another-provider takeover needs a separately reviewed equivalent adapter. Normal/departure transfers remain provider-neutral within that same-host scope.

The accepted historical specification remains byte-identical. The later user amendment and this concrete authority clarification are part of the current plan review. No implementation, native handoff, production activation, historical repair or implementation test was performed.

## Finding dispositions

### R2-F001 — Addressed

Added "Concrete production authority and deferred-session recovery" immediately after the transfer contract and reconciled the older controller/owner-only language. Task 5 now owns the actual same-host shared receipt index under the main authority root, private actor-journal lookup, real current occupancy/generation/native binding validation and canonical admitted-release verification. A bare actor row/digest is insufficient; a real owner operation plus its retained receipt and canonical read-back is sufficient. A cross-worktree successor reads only the bounded same-user index and exact predecessor journal. Queued-only release, absent receipt, inaccessible source, competing intervening owner and unsupported host fail explicitly.

Added Task 5's timing-handoff-user-source.mjs and concrete native Codex user-message verification through the actual bound rollout resolver. It reuses existing role/hash/injection checks while supporting exact ordinal/raw digest when native IDs are absent. It independently re-reads native user input for the exact sanctioned recovery command bound to issue, opaque predecessor, successor and fresh operation. Model/tool/injected prose, prompt timestamp alone, copied IDs and caller JSON do not grant consent. Current scope does not invent an unattended controller adapter or claim cryptographic immunity from a hostile process rewriting every local authority file.

Generation-safe recovery uses the existing occupancy/binding-generation APIs, retains crash states and actual observation times, and never releases a newer generation or invents an old end. Added the exact visible deferred message/next command and typed explicit refusal behavior. Contender work before authorization is permanently uncredited and not silently journaled for later fabricated timing; checkpoints stay intact. Actual future bounded work starts after admitted recovery.

Required Task 4/5 end-to-end cases now drive real native/filesystem authority adapters with production-shaped occupancy, journal, receipt and native stream inputs, faking only external GitHub I/O. They exercise A closes unpaused → B deferred visibly → actual native user recovery command → receipt admission → known B future/unknown A tail, plus same-host cross-worktree actual departure-successor and the full negative/replay/crash set. No injected always-verified authority callback can satisfy these integration requirements.

### R2-F002 — Addressed

Corrected the measurement section's test-ownership sentence: handoff/journal/authority tests are Task 5-owned; measurement/native-normalizer tests are Task 6-owned. Task 4 integrates these interfaces and owns producer end-to-end tests. The adapter matrix and Task 5 Files include the new user-source adapter.

### R2-F003 — Addressed

Seeded Task 10's first focused verifier with existing executable-entrypoint-classification, integration guidance-admission, unit help and integration help suites. The broader enumerable regression inventory remains required before child Test.

### R2-F004 — Addressed

Task 4 Files now spells scripts/task-tracker/hook-handler.mjs in full, matching the ownership matrix.

## Changes made

Added the concrete bounded production authority/recovery section, reconciled older authorization language, added the Task 5 native user-source file and required real-resolver recovery tests, corrected split test ownership and exact hook path, and expanded Task 10's existing verifier minima. Ten tasks, six ranks and the 112-hour provisional joint estimate remain.

## Declined changes and rationale

None. The explicit same-host scope is the supported alternative requested by the reviewer; cross-host and unattended controller takeover are not claimed.

## Verification

- extractPlanTasks and validateSplitTasks: ten tasks; ok=true; no errors/violations.
- Artifact-only Prettier completed successfully after the substantive edit.
- git diff --check passed.
- This verification checks preparation collateral only. Proposed implementation suites remain unrun and no AC/DoD evidence is claimed.

<!-- aitm-owned-comment key="plan.xpr-claude-author-round-2" -->
````````
<!-- historical-comment-body:end id="6073614164" -->

## Comment 6073615122

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073615122

Created: 2026-10-09T03:23:11Z. Last updated before archival: 2026-10-09T03:23:11Z.

<!-- historical-comment-body:start id="6073615122" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-44cf48195bdeaa60b8acf83e3d0abe82"
role: "author"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "e22473f927cdb0629651cdc94c1204ea7e621ca5"
artifact_blob: "c66c11455859d1a427f12fe84d6b5ef76541bbca"
artifact_digest: "sha256:9d35c258971ff176b2f9c2fb378272703e167218c64a5765e04c341a70f351a8"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
  identity_source: "runtime"
started_at: "2026-10-09T02:17:32.513Z"
submitted_at: "2026-10-09T03:18:36.608Z"
finding_ids: []
answered_finding_ids: ["R3-F001","R3-F002"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed both sealed round-3 findings. The shared receipt index now uses the actual current physically verified shared runtime store, with one explicit owner for additive runtime-family compatibility and concrete no-new-migration-block regressions. Deferred startup now provides the route that the current provider can actually use.

## Finding dispositions

### R3-F001 — Addressed

Removed the retired .db location and nonexistent paths authority claim. The index is under runtimeStoragePaths({projectRoot,mainRoot}).sharedRoot/timing-handoff/...; Task 5 alone owns required additive shared family registration in runtime-migration-plan and path/control compatibility in runtime-storage. Existing runtime guards apply before any receipt write. No live runtime migration, legacy .db/.tmp handoff file, implicit store/control creation, weakened migration fence or changed existing family authority is permitted.

The feature requires an already activated compatible runtime. Unactivated/migrating state refuses handoff-runtime-not-ready before mkdir/write and references the separate existing runtime setup. Added production-shaped tests proving the unactivated refusal leaves its clean real migration plan byte-equivalent, and that a real receipt in an activated isolated store adds no unknown-source or other blocker compared with its baseline. An active store's pre-existing destination-exists second-migration refusal remains; the test cannot assert that re-migration succeeds or waive that policy. Tests also cover shared scope, path traversal/symlinks, malformed receipts and unreadable control.

Seeded Task 5's verifier with existing runtime-storage, runtime-migration and runtime-migration-transaction integration suites. The ownership matrix and Task 5 Files now explicitly name runtime-storage and runtime-migration-plan. This is additive compatibility for the new journal family, not a migration of existing runtime authority.

### R3-F002 — Addressed

The recovery-command diagnostic now applies only to a supported Codex successor. Other-provider successors receive an explicit unsupported recovery statement and the real workaround: a same-host Codex session verifies user-origin takeover, then releases through actual owned departure or prepares a normal handoff to the desired provider. Cross-host and unready-runtime sessions receive exact scope/runtime prerequisites. No provider sees an advertised successful recovery command that its current authority adapter cannot support.

## Changes made

Replaced the shared index location and production guard contract; assigned additive runtime compatibility and focused suites to Task 5; added baseline-versus-receipt real migration-plan checks; made deferred diagnostics provider-accurate. Task numbering, six ranks, dependencies and 112-hour joint estimate remain unchanged.

## Declined changes and rationale

None. The existing migration planner intentionally refuses already-created destination stores; the regression compares blockers before/after the new receipt rather than weakening that legitimate refusal.

## Verification

Source inspection confirmed runtimeStoragePaths.sharedRoot, physical root/path/control guards, the private FAMILY_SCOPES registry and the migration planner's destination-exists/legacy unknown-source boundaries. Artifact-only Prettier, plan extraction/split validation and whitespace checks run before submission. No implementation or implementation suite was run and no historical/runtime migration was performed.

<!-- aitm-owned-comment key="plan.xpr-claude-author-round-3" -->
````````
<!-- historical-comment-body:end id="6073615122" -->

## Comment 6073616358

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6073616358

Created: 2026-10-09T03:23:17Z. Last updated before archival: 2026-10-09T03:23:17Z.

<!-- historical-comment-body:start id="6073616358" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "1c5f6f22e334ff1f65def384ae221594a5035fe4",
      "commit": "87f5225137ee3f90008a1fd232caf61ab2a287db",
      "digest": "sha256:059ebd09c9fe809b50f9b2007771b15fd18cff052f7a23b171750ed502051df9",
      "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "a43a0aaeeceacfe53b93d08819049e1cb1105541",
      "commit": "bcdb2b293df6d81d973ef9bcec4157dfd0b81dff",
      "digest": "sha256:718deac13d692a30be2ea6cea7c8f1d5d98f953d7fbd5ed4f216c1f0f4167984",
      "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "c66c11455859d1a427f12fe84d6b5ef76541bbca",
      "commit": "e22473f927cdb0629651cdc94c1204ea7e621ca5",
      "digest": "sha256:9d35c258971ff176b2f9c2fb378272703e167218c64a5765e04c341a70f351a8",
      "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
      "snapshot": null,
      "turn": 2
    },
    {
      "blob": "31ea9b98614ed8efb863b327536e39bbe7549cc6",
      "commit": "e8a34e7b1fbb39cafddae7a4189d819f005ba4b9",
      "digest": "sha256:df768032f5fa4111babc0a3ea9ef4acfc879a95217b75bdd638be9f289e86668",
      "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
      "snapshot": null,
      "turn": 3
    }
  ],
  "artifact_path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-64b31abe-1673-4580-bba6-bb531e4cff5d",
      "claimed_at": "2026-10-09T02:18:47.911Z",
      "expires_at": "2026-10-09T10:18:47.911Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-09T02:18:47.911Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5"
    },
    {
      "claim_id": "claim-fde7a17b-9ffc-43eb-a7cc-de001586eae7",
      "claimed_at": "2026-10-09T02:24:37.126Z",
      "expires_at": "2026-10-09T10:24:37.126Z",
      "host": "codex",
      "last_activity_at": "2026-10-09T02:24:37.126Z",
      "role": "author",
      "session_fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "e8a34e7b1fbb39cafddae7a4189d819f005ba4b9",
  "human_decision": null,
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "declared",
            "conflict": false,
            "declared_id": null,
            "observed_id": null,
            "requested_id": "gpt-6.1-sol",
            "source": "launch-request"
          },
          "session": {
            "assurance": "declared",
            "fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e",
            "source": "official-runtime"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-09T02:17:32.513Z",
        "model_display": "gpt-6.1-sol",
        "model_id": "gpt-6.1-sol",
        "provider": "openai",
        "role": "author",
        "session_fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
      },
      "role": "author",
      "sequence": 3
    }
  ],
  "lineage_receipt": {
    "attempts": [
      {
        "consumed_grant_digest": null,
        "event_log_digest": "sha256:5bf17dbc36a396eb0a77fd19742961b753d7371dfd6ed519ed156629382e57e0",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-44cf48195bdeaa60b8acf83e3d0abe82",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-44cf48195bdeaa60b8acf83e3d0abe82",
        "root_review_id": "review-44cf48195bdeaa60b8acf83e3d0abe82",
        "successor_review_id": null
      }
    ],
    "complete": true,
    "schema": "ai-peer-review.lineage-receipt/v1"
  },
  "participants": {
    "author": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": null,
          "observed_id": null,
          "requested_id": "gpt-6.1-sol",
          "source": "launch-request"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e",
          "source": "official-runtime"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-09T02:17:32.513Z",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai",
      "role": "author",
      "session_fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
    },
    "reviewer": {
      "evidence": {
        "model": {
          "assurance": "declared",
          "conflict": false,
          "declared_id": "claude-opus-5-5",
          "observed_id": null,
          "requested_id": null,
          "source": "environment-declaration"
        },
        "session": {
          "assurance": "declared",
          "fingerprint": "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-09T02:18:47.881Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5"
    }
  },
  "record_id": "review-44cf48195bdeaa60b8acf83e3d0abe82",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-44cf48195bdeaa60b8acf83e3d0abe82",
  "runtime": {
    "adapter_version": "1.0.0",
    "author": {
      "effort": "medium",
      "host": "codex",
      "model_display": "gpt-6.1-sol",
      "model_id": "gpt-6.1-sol",
      "provider": "openai"
    },
    "classification": "XPR",
    "ownership": "broker",
    "project_root_digest": "3e6c69f5fabf249449b6c1f3115736df8c4b09a4c7a3f07ba7e8516fa1633183",
    "reviewer": {
      "effort": "high",
      "host": "claude-code",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "selector": "claude"
    },
    "schema": "ai-peer-review.runtime/v1",
    "transport_mode": "manual"
  },
  "schema": "ai-peer-review.manifest/v1",
  "startup_commit": "87f5225137ee3f90008a1fd232caf61ab2a287db",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "a43a0aaeeceacfe53b93d08819049e1cb1105541",
        "digest": "sha256:718deac13d692a30be2ea6cea7c8f1d5d98f953d7fbd5ed4f216c1f0f4167984",
        "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
      },
      "author_response": {
        "digest": "sha256:d93a40d0510527a25402f1414431f26af898a69a530f453a08121b3724186221",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-author-response-1.md"
      },
      "commit": "bcdb2b293df6d81d973ef9bcec4157dfd0b81dff",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004",
        "R1-F005",
        "R1-F006",
        "R1-F007",
        "R1-F008",
        "R1-F009"
      ],
      "reviewer_response": {
        "digest": "sha256:74b25bc76bca44320aeddc7ab8b459bc2fdbc2beecb1fa9ba25bf18100168155",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "c66c11455859d1a427f12fe84d6b5ef76541bbca",
        "digest": "sha256:9d35c258971ff176b2f9c2fb378272703e167218c64a5765e04c341a70f351a8",
        "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
      },
      "author_response": {
        "digest": "sha256:afbb8ecd062e9352c02e868e34ef1596485adeaf80618169f4d2067e45c440a6",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-author-response-2.md"
      },
      "commit": "e22473f927cdb0629651cdc94c1204ea7e621ca5",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001",
        "R2-F002",
        "R2-F003",
        "R2-F004"
      ],
      "reviewer_response": {
        "digest": "sha256:798a4ee05120fce28764579e7f4a5da4642800d472efdefb42b938b9c3c75dbd",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    },
    {
      "artifact": {
        "blob": "31ea9b98614ed8efb863b327536e39bbe7549cc6",
        "digest": "sha256:df768032f5fa4111babc0a3ea9ef4acfc879a95217b75bdd638be9f289e86668",
        "path": "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
      },
      "author_response": {
        "digest": "sha256:d4ce016e9e1c2019feee129e5461ae6c9237b9830131848378b8dd526a85a5ff",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-author-response-3.md"
      },
      "commit": "e8a34e7b1fbb39cafddae7a4189d819f005ba4b9",
      "decision": "revisions-requested",
      "finding_ids": [
        "R3-F001",
        "R3-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:dd11667fd3d84931e57b2b19bb80f6a4d7f741ec9232cd4c692b686970ae5018",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [
        "R4-F001"
      ],
      "reviewer_response": {
        "digest": "sha256:f9d1e37400b58b4d13feda64a14c1cbe7d04ee2f9d17021ceb3f94c8a8c60e22",
        "path": "docs/peer-reviews/1901/plan/xpr/plan/2026-10-09-2026-10-08-1901-event-derived-timing-review-44cf48195bdeaa60b8acf83e3d0abe82/review-44cf48195bdeaa60b8acf83e3d0abe82-reviewer-response-4.md"
      },
      "snapshot": null,
      "turn": 4
    }
  ]
}
```

<!-- aitm-owned-comment key="plan.xpr-claude-manifest" -->
````````
<!-- historical-comment-body:end id="6073616358" -->
