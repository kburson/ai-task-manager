# #1901 historical issue records — spec-responses

This is an exact preservation of owned issue-comment bodies before the October 9, 2026 conversion to concise process summaries and immutable Git links. It preserves historical wording, including then-current statuses and relative links; it does not assert those statuses remain current. The accepted artifacts, sealed review responses, and current preparation handoff remain the operational records. Timing, commit-trace, state-transition provenance, and other AITM-owned lifecycle comments are outside this archive and remain on the issue.

## Comment 6069268844

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069268844

Created: 2026-10-08T21:19:59Z. Last updated before archival: 2026-10-08T21:19:59Z.

<!-- historical-comment-body:start id="6069268844" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7ab4a2020215fd8c5d63b00c7253dcdb"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
artifact_commit: "06743dbddd6f9001d60b5674e52824230aead9f0"
artifact_blob: "292c2008e330d3b628dc6b7a84e2d1f360839e62"
artifact_digest: "sha256:e85871a74daba96ecc2310e0e0a3756759230bb0a1b1fcd7006e3eb73353ebbc"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:bd6c5d5a4a396b3f569c9b1acf45178ef4500e8f19a591d7de0d825207730f55"
  identity_source: "runtime"
started_at: "2026-10-08T21:01:26.774Z"
submitted_at: "2026-10-08T21:05:53.688Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent review of the #1901 event-derived timing spec at artifact commit `06743dbd`, checked against the baseline source in this worktree and the live #1901 issue body (User Story, Scope, AC1–AC6).

The core model is sound and matches the issue. It derives visible Active/Idle from engagement/departure/resume events, uses whole-second ticks, and keeps the transcript estimate separate. Lanes are per actor, the legacy bridge is narrow, and shared boundaries partition time instead of resetting it. I recomputed every #1854 example against the stated rules: 51, 453660, 133 (floor ticks 1791245839 → 1791245972), 5 and 901 seconds all match. `5 days 06:01:00` is correct. `gh-timing-comment.mjs::fmtTs` truncates sub-seconds through `getSeconds()`, so the `floor(ms/1000)` tick rule agrees with the displayed timestamps. The defect description is accurate:

- `runtime.mjs:697-706` nulls both seconds unless `readActivityEvidence` reports `observed`.
- `audit-timing.mjs:57-67` pre-flushes the actor, then posts zero-valued boundary rows.
- `readTimingActor` (`timing-actor.mjs:84`) rejects any suffix other than `row-sec`.
- `updateIssueComment` has no compare-and-swap.

Revisions are still needed. Five gaps would let an implementation that follows the spec literally break AC6 ("no cross-session active inflation"), corrupt the live log, or break installs on other package versions:

1. Live late-insertion reallocation uses the same non-CAS read-modify-write that the spec refuses to trust for repair.
2. Shared boundaries keep crediting Active to abandoned open lanes without limit.
3. There is no rollout contract for other installed versions, whose strict readers throw on the new suffix and display grammar.
4. "Valid continuous engagement evidence" is undefined, and the spec does not acknowledge that observed (Codex) rows will change meaning.
5. It is unclear whether the move-state pre-flush is part of the atomic lifecycle admission.

## Findings

### R1-F001 — Live late-insertion reallocation is a non-CAS rewrite of other rows, unguarded unlike repair

**Severity:** High.

**Spec text:** "Late insertion deterministically rederives every affected subsequent lane allocation and duration projection in one coordinated canonical-body mutation." The Historical recalculation section says: "The current `updateIssueComment` accepts ID/body without compare-and-swap. Local locking and a fresh read cannot exclude another host or manual edits. Therefore apply requires an explicitly coordinated exclusive maintenance window."

**Baseline evidence:** Live actor publication (`gh-timing-comment.mjs:826-895`, `postTimingEvent`) reads the canonical source, then appends, then calls `update`. It holds only `withLock(timingLockPath(issue, projDir))`, and `paths.mjs:222` keys that lock on the local project directory. Its read-back check `appendRow(observed.body, row) === observed.body` only proves that the new row is present.

**Problem:** Today a lost update between two hosts or worktrees drops at most one appended row. The read-back of the other writer detects that, and its journal replays it. Under the spec, the same window also loses rewrites of earlier rows. Those rewrites cover other actors' Active/Idle cells, `row-sec` values and `aitm-duration` projections. Two outcomes are possible:

- Writer X reallocates rows 10–14 for a late insertion. Writer Y appends from a body read before that and overwrites X. X's read-back fails and X replays, which is fine.
- Writer Y appends from a body read after X's insert but before X's rewrite. The result can have the inserted row with stale allocations on rows 11–14. That breaks conservation, and the read-back of neither writer detects it, because each one checks only its own row.

The spec treats exactly this class of race as disqualifying for repair. It then permits it on every routine publication that triggers reallocation, with no maintenance window. That is an internal contradiction.

**Required resolution:** Choose one and state it:

- (a) Live publication stays append-only. A late or out-of-order row is admitted at its true timestamp position with its own allocation computed against the fresh source. Any reallocation it would require on other rows is recorded as a `reallocation-pending` diagnostic, and the guarded repair path performs it later.
- (b) A post-write invariant check covers all rows (full conservation and allocation equality against a re-derivation of the observed body). On mismatch the writer re-derives and rewrites the whole projection, with a bounded retry and a terminal refusal state. The spec must also define what happens when the body other writers see is temporarily inconsistent.

Either way, extend AC6/AC5 tests with a two-writer interleaving that reproduces the stale-allocation case. Also replace the read-back predicate, which currently assumes append semantics.

### R1-F002 — Shared-boundary partition credits Active to abandoned open lanes without limit (AC6 cross-session inflation)

**Severity:** High.

**Spec text:**

- "Shared lifecycle facts partition all valid open lanes at their timestamp."
- "Orphan/session-end recovery publication is not the observed end of a lost session. If that end is missing, stop extending its engagement and retain an unavailable tail."
- "Long gaps are Active only with valid continuous engagement evidence."

**Problem:** A lane opens on an observed start/resume and closes only on its own departure, or on a recovery row (`session-end-recovery` in `lib/actor-hook-timing.mjs:21-25`, `orphan-finalize.mjs`). Recovery runs only when that same session or project later re-enters the hooks. A provider session that is killed or never resumed emits no departure and possibly never a recovery row. Under "partition all valid open lanes", every later shared boundary credits that dead lane's elapsed time as Active.

**Concrete case:** A Claude session is engaged on #N, and the terminal is closed with no Stop/pause. A Codex session then drives #N through plan → develop → test over three days. Each `*:started`/`*:completed` pair credits the dead Claude lane, and `totalActiveSec`/`engagedSec`/`planSec` gain about three days. AC6 explicitly forbids this ("without ... cross-session active inflation").

"Stop extending its engagement" does not help. It assumes a missing end is detected, and from rows alone it can be detected only after a recovery row arrives. If one arrives later, the spec must say whether boundary slices already credited to that lane become unavailable. That retroactively rewrites earlier rows, which R1-F001 covers.

**Required resolution:** Define precisely which open lanes a boundary may partition and what evidence keeps a lane open. Options:

- A boundary credits Active only to lanes whose engagement is evidenced up to the boundary. Examples are the publishing actor after its pre-flush, or a lane whose own later row's engagement endpoints span the boundary. Every other open lane's slice stays pending on that lane and is allocated only when the lane's own next row arrives.
- Abandonment is evaluated at read time in the projection. Stored cells stay provisional, and the spec says which.

Add tests where a lane opens and never closes across later boundaries, and where a lane opens and later receives `session-end-recovery`. Both must keep issue totals bounded by observed evidence.

### R1-F003 — No mixed-version rollout contract; strict baseline readers throw on the new suffix and display grammar

**Severity:** High.

**Spec text:** "Roll out readers first, then producers, then dry-run repair." Plus a new `aitm-duration:v1` suffix and a new `[N days ]HH:MM:SS` cell grammar.

**Baseline evidence:** This is an npm package installed into many projects and hosts. Every install writes to the same GitHub Timing Log comment. Any one comment can be read and written by several package versions at once: Codex and Claude sessions, sibling worktrees, the `aitm-test` project, and stale installs. Baseline readers fail hard on unknown grammar:

- `timing-actor.mjs:84` (`readTimingActor`) throws `TIMING_ACTOR_INVALID` on any suffix after the actor/engagement markers other than `row-sec`. `parseTimingRow` calls it on every line. So does `lastRowFromBody`/`safeReadLastRow` on the flush path, and `postTimingEvent` calls `parseTimingRow(row)`. An older install touching an issue that carries one new-format actor row therefore fails every timing flush for that issue.
- `timing-row-reader.mjs:16` `TRAILING_ROW_SEC_RE` is end-anchored. If the new suffix follows `row-sec` on a non-actor row, `readEstimationStageTiming` throws `estimation-row-sec`.
- `timing-rows.mjs:68` `parseDurationSeconds` accepts only `^(\d+)h (\d{2})m (\d{2})s$`.
- `timing-engagement.mjs:107-116` (`deriveActorEngagement`, which the spec pins for sealed-outcome validation and which `agent-review/validators/timing-log-sequence.mjs` uses) classifies unattributed rows by their display cell text. Any non-blank cell other than the literal `'0h 0m 0s'` counts as historical work. That includes a new `00:00:00`, and also the current formatter's own `0h 00m 00s`, which is a pre-existing mismatch.

"Readers first" is meaningful only inside one release artifact. The spec defines no mechanism that keeps an older installed reader from meeting new producer output.

**Required resolution:** Specify a cross-version contract:

- (1) Ship reader tolerance in release N. Producer emission of the new suffix and display grammar is off by default, behind a repository-level config gate, or in release N+1 with a documented minimum version.
- (2) Define the exact suffix placement relative to `aitm-actor`, `aitm-engagement`, `aitm-transition` and `row-sec`, for both actor and non-actor rows, and state the parse result an old reader gets.
- (3) Enumerate every consumer that reads display-cell text, including `deriveActorEngagement`'s `cells[3]` heuristic, and define its behavior on new cells. Pinned-semantics validators run on current bodies and will see new-format rows.
- (4) Add a test that runs the baseline reader functions on a body that contains new-format rows and asserts the declared degradation.

### R1-F004 — "Valid continuous engagement evidence" is undefined, and the behavior change for observed rows is not acknowledged

**Severity:** Medium.

**Spec text:**

- "Long gaps are Active only with valid continuous engagement evidence."
- "Stale zero/display metadata cannot override valid event intervals."
- Repair covers "zero/nonzero discrepancies".

**Problem:** At baseline, observed Codex rows show Active = wall time minus excess idle, using `idleThresholdMinutes` (default 5) in `active-time.mjs:152-166`. Idle is the in-window transcript idle. Under the event model, an engagement left open overnight with no departure becomes eight hours of Active and zero Idle. The issue's model ("an engaged interval contributes to Active") supports that. But the spec never states this consequence, and the undefined phrase "valid continuous engagement evidence" invites an implementer to reintroduce a transcript or threshold heuristic. Unstated in the spec:

- Whether an unbroken event-level engagement (opener, no departure) is sufficient evidence. The issue implies it is.
- What happens to `idleThresholdMinutes`, and to `computeActiveAndIdleSeconds` as a visible-cell producer (retired, or estimate-only).
- That historical repair rewrites previously observed rows: Idle moves to 0 and Active increases. The preview should flag those rows as a distinct category, apart from Unknown recovery.
- That board Engaged/Plan/Review projections will rise for issues that had observed rows. That is a user-visible metrics shift, not a defect side-effect.

**Required resolution:** Replace the phrase with a precise rule. Add a "behavior changes for currently observed rows" subsection covering the four points above. Add a regression test: an observed Codex window with a long transcript gap and no departure must render the full event interval as Active, with the transcript estimate retained in `aitm-engagement active=`.

### R1-F005 — The atomic admission scope of the move-state pre-flush versus the lifecycle pair is unspecified

**Severity:** Medium.

**Spec text:** "Lifecycle pairs are admitted together in their defined order." "The first row in a same-instant pair receives preceding slices; the second receives zero."

**Baseline evidence:** `audit-timing.mjs:57-63` first calls `flushBoundActorInterval`, which publishes an actor row through its own journal/`postTimingEvent`. It then takes a new `ts` (line 64) and posts the completion row and the entry row in separate `postTimingEvent` calls.

**Problem:** The spec does not say whether the bound actor's pre-flush survives. If it survives, it is a third row at an earlier tick, published in a separate mutation from the pair. A failure between them leaves a flush row with no boundary, or a boundary admitted with the bound lane already closed by the flush. Either way, the "preceding slices" the first boundary row receives depend on that ordering. If the pre-flush is removed, the boundary absorbs the bound actor's slice. That changes where words versus duration land, because words still bank on the flush per #832.

**Required resolution:** State whether the pre-flush is retained. If it is, state whether it belongs to the same admission unit as the pair, and which row owns the bound lane's slice up to the boundary. Cover a partial failure between flush and pair in the AC3/AC6 tests.

## Required changes

1. R1-F001: Make live publication either append-only, with reallocation deferred to guarded repair, or protected by a full-projection post-write invariant check with bounded retry and refusal. Replace the append-only read-back predicate. Add a two-writer stale-allocation test.
2. R1-F002: Define which open lanes a shared boundary may credit and what evidence keeps a lane open. Define what happens to previously partitioned slices when a lane later turns out to be orphaned. Add never-closed and late-recovery lane tests that keep totals bounded.
3. R1-F003: Add a mixed-version rollout contract: reader-tolerant release first, with producer emission gated by config or a minimum version. Define exact suffix placement. Enumerate display-cell consumers, including the pinned `deriveActorEngagement` cell heuristic. Add a test of baseline readers against new-format bodies.
4. R1-F004: Replace "valid continuous engagement evidence" with a precise rule. Document the behavior change for observed rows, the fate of `idleThresholdMinutes`, the repair preview category for rewritten observed rows, and the expected shift in board projections. Add an open-engagement long-gap regression.
5. R1-F005: Specify whether the move-state pre-flush survives, its admission unit relative to the lifecycle pair, and slice ownership. Add a partial-failure test.

## Optional suggestions

### R1-F006 — Split delivery into independently shippable stories

The scope covers:

- the engine
- every producer
- readers and rollups
- display grammar
- replay identity
- live reallocation
- sealed-source protection
- historical repair tooling

That is well beyond a typical defect. Consider having the implementation plan stage it as linked stories, each with its own Test gate:

- (1) The engine, append-only producers and display, plus tolerant readers. This fixes AC1–AC4 for new rows.
- (2) Guarded repair and export. This covers AC5.
- (3) Late-insertion reallocation and sealed-source interaction.

Items (2) and (3) carry most of the race and authority risk, and (1) delivers the user-visible fix on its own.

### R1-F007 — State explicitly that summed Idle, like Active, is per-lane effort and can exceed wall time

The spec says overlapping actor Active "may exceed issue wall time". `totalIdleSec` also sums Idle across lanes, including `legacy-idle-bridge`, so two actors paused over the same night count that night twice. Say so in the Public scalar projection table, so that no consumer reads `totalIdleSec` as waiting wall time.

### R1-F008 — File the pre-existing `'0h 0m 0s'` literal mismatch separately

`timing-engagement.mjs:116` compares against `'0h 0m 0s'`, but `formatDurationSeconds(0)` produces `0h 00m 00s`. Explicit-zero legacy cells are therefore counted as historical work. This predates #1901. Track it as its own defect instead of folding it in silently, and decide its interaction with R1-F003.

## Decision

revisions-requested

<!-- aitm-owned-comment key="design.xpr-reviewer-round-1" -->
````````
<!-- historical-comment-body:end id="6069268844" -->

## Comment 6069270729

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069270729

Created: 2026-10-08T21:20:06Z. Last updated before archival: 2026-10-08T21:20:06Z.

<!-- historical-comment-body:start id="6069270729" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7ab4a2020215fd8c5d63b00c7253dcdb"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
artifact_commit: "06743dbddd6f9001d60b5674e52824230aead9f0"
artifact_blob: "292c2008e330d3b628dc6b7a84e2d1f360839e62"
artifact_digest: "sha256:e85871a74daba96ecc2310e0e0a3756759230bb0a1b1fcd7006e3eb73353ebbc"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
  identity_source: "runtime"
started_at: "2026-10-08T21:00:32.785Z"
submitted_at: "2026-10-08T21:11:59.520Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed all five required findings and the overlapping-Idle clarification. Added concrete publication convergence, bounded lane evidence, mixed-version rollout, observed-row behavior and lifecycle pre-flush/pair contracts. Preserved issue scope, original source evidence, sealed outcomes and separate transcript estimates. This is a specification revision only.

## Finding dispositions

### R1-F001 — Accepted with clarification

Selected full-projection post-write verification with three bounded mutation attempts, source-inventory retention, drift merge/rederive, protected-byte refusal and recoverable journal/queue evidence. A complete event insertion and allocation rewrite is one body mutation, so there is no deliberate insert-before-rewrite intermediate write. Cross-host stale-snapshot races still exist; readers validate the whole projection and refuse authoritative complete totals on drift. Historical batch apply retains its stronger maintenance-window requirement.

### R1-F002 — Accepted

A shared boundary needs closing evidence for the particular lane, not just an unmatched opener. Its publisher can attest only its own continued bound engagement. Other tails remain pending/unavailable until their own closing observation arrives; dead sessions do not accumulate days through unrelated boundaries. Recorded bounded slices survive later unknown-tail recovery. The legacy Idle bridge explicitly retires the old legacy interruption.

### R1-F003 — Accepted

Reader-compatible release N precedes opt-in producer emission. Added disabled-by-default repository timingDurationModel gate, explicit participant readiness/minimum release inventory and operational exclusion of stale installations. Defined enabled suffix ordering, declared baseline reader incompatibility honestly, and required tests for old readers, disabled emission, compatible readers and sealed-source successor adapters. Enumerated display-sensitive consumers.

### R1-F004 — Accepted

Defined engagement with both matching opener and actor-owned closing evidence. Without departures, the bounded event window is Active regardless of transcript gaps. An opener alone supplies no end at another actor boundary. Transcript idle thresholds remain estimate-only. Added observed-estimate-reclassified previews, board delta visibility and long-gap regression while preserving original estimates.

### R1-F005 — Accepted

Retained the pre-flush as an independent journaled word-banking event; it owns elapsed time up to its tick and does not end engagement. The same-instant lifecycle pair is its own immutable atomic admission unit, with the first row owning only the remaining observed slice and the second zero. Added queue/remote partial-failure, restart, lost-response and replay contracts.

### R1-F006 — Partially accepted; linked-story creation deferred

Added independently verifiable delivery steps for readers/engine, enabled producers/scalars and guarded repair/reallocation. Concrete story decomposition belongs to the implementation-plan stage; no child issues or workflow transitions are invented during specification XPR. Full AC1–AC6 remains required.

### R1-F007 — Accepted

Explicitly stated summed Idle is per-lane waiting duration and, like Active, may exceed wall time. It cannot substitute for SessionTime.

### R1-F008 — Deferred outside this artifact

Verified the existing mismatch between the historical predicate literal 0h 0m 0s and the formatter output 0h 00m 00s. A global old-format behavior change is outside this defect and could alter pinned outcome semantics. The revised design requires correct decoded handling of new-format zero in its compatibility view while leaving original historical semantics intact. Separate backlog intake is appropriate after XPR; no fix or new issue authority is claimed here.

## Changes made

The specification now includes XPR clarifications for live convergence and evidence bounds, currently observed-row metrics changes, reader-first opt-in cross-version rollout, exact suffix ordering, retained pre-flush plus atomic lifecycle pair, associated regressions and implementation-planning boundaries. Earlier contradictory broad lane-credit and continuous-evidence wording was replaced rather than left as an overriding ambiguity.

## Declined changes and rationale

No required change declined. New linked stories and a separate old-format zero-literal defect are deferred to governed implementation planning/backlog intake; they are not silently bundled into this specification or used to weaken sealed historical validation.

## Verification

Re-read appendActorRow/postTimingEvent, flushBoundActorInterval, actor-flush journal, timing-post-outcome, queue, actor marker reader, timing row reader, deriveActorEngagement, duration codec and outcome source validation. Compared findings with the live issue already read by the reviewer. Document-only formatter and whitespace checks follow this edit; no product code or implementation tests were run.

Timing evidence: review-created at 2026-10-08T21:00:32.785Z; reviewer-joined at 2026-10-08T21:01:26.811Z; reviewer-revisions-requested at 2026-10-08T21:05:53.688Z. First reviewer round was 266.877 seconds (4m 26.877s); startup plus first reviewer handoff was 320.903 seconds (5m 20.903s). These come from sealed protocol events, exclude setup before review creation, and do not use the later XPR:start timing checkpoint as a backdated start. Final end-to-end measurement will use terminal protocol finalization.

<!-- aitm-owned-comment key="design.xpr-author-round-1" -->
````````
<!-- historical-comment-body:end id="6069270729" -->

## Comment 6069884526

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069884526

Created: 2026-10-08T22:01:42Z. Last updated before archival: 2026-10-08T22:01:42Z.

<!-- historical-comment-body:start id="6069884526" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7ab4a2020215fd8c5d63b00c7253dcdb"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
artifact_commit: "1e6f2461a1db7b2ab07119cdc57447fd60b2eb9d"
artifact_blob: "db7201ee19f1e08c7507d157c80f03861921d3b7"
artifact_digest: "sha256:c05810c5daa57b3a63663b938f36161574e97cd81b3f32a5e848222747329767"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:bd6c5d5a4a396b3f569c9b1acf45178ef4500e8f19a591d7de0d825207730f55"
  identity_source: "runtime"
started_at: "2026-10-08T21:01:26.774Z"
submitted_at: "2026-10-08T21:35:20.539Z"
finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Round 2 reviews the revised spec at artifact commit `1e6f2461`, checked against author response 1 and the baseline source.

Round-1 dispositions:

- **R1-F001: resolved.** The "XPR clarifications: live convergence and evidence bounds" section replaces own-row read-back with:
  - one complete-body mutation;
  - full-projection read-back;
  - a merge of retained immutable source events on drift;
  - three bounded attempts, then typed refusal/pending with journal retention;
  - reader-side `projection-stale` refusal of authoritative totals.

  It honestly disclaims compare-and-swap. A writer whose row a stale overwrite deletes now detects that through source-inventory retention, which closes the lost-row case.
- **R1-F002: resolved in principle.** A boundary can no longer turn another lane's lone opener into an end. Only the publisher may attest its own continued engagement. Dead tails stay uncredited. Bounded observed slices survive later recovery. The legacy lane retires through the bridge. Lines 79 and 93 were rewritten, not left contradictory.
- **R1-F003: partially resolved.** The release-N reader-first approach, the explicit suffix order, the honest declaration of baseline-reader incompatibility and the list of display-sensitive consumers are good. The activation gate has the wrong scope (R2-F001).
- **R1-F004: resolved.** "Matching actor-owned closing observation" replaces the undefined phrase. The threshold and transcript heuristics are estimate-only. Preview categories and board deltas are specified, and the long-gap regression is added.
- **R1-F005: resolved.** The pre-flush is retained as an independent journaled event that owns duration up to its own tick. The pair is a separate atomic admission unit. Partial-failure retry, restart and replay cases are specified.
- **R1-F006 to R1-F008:** acceptable as dispositioned.

Revisions are still requested for two gaps introduced by the new mechanisms:

- The activation gate is participant-local, while the model change it governs is a property of a shared comment.
- R1-F002's pending-boundary fill is now routine reallocation of earlier rows, and the spec does not reconcile it with the sealed-source protected-region refusal.

## Findings

### R2-F001 — The `timingDurationModel` activation gate is participant-local, but model state belongs to the shared Timing Log

**Severity:** High.

**Spec text** ("Mixed-version rollout"): "New emission and live reallocation remain disabled by default through the repository-level setting `timingDurationModel` ... Every public producer, repair apply path and runtime adapter checks this setting."

**Baseline evidence:** `config.mjs` resolves settings through layered defaults, user and project files. `setConfigValue` writes the project JSON. The candidate key would sit beside `idleThresholdMinutes`, which is a user-overridable key in `USER_KEYS`. The effective value is therefore decided per checkout and per user. Sibling worktrees on different branches, a user-level override, or a project file not yet updated in one worktree all give different answers for the same GitHub comment.

**Problem:** Activation is described as a one-time operator rollout, but nothing records it on the shared artifact. After activation:

- A release-N writer whose local setting is still `legacy` behaves correctly by its own rules. It keeps appending legacy-model rows into a log whose other rows carry `aitm-duration:v1` projections. Examples are a stale branch worktree, a user override, or a project file not yet pulled.
- Enabled readers rederive the full projection. They then see newly appended rows with transcript-derived or Unknown cells and no duration suffix, after the activation point. The spec does not say whether those are legacy rows to reconcile, malformed rows, or `projection-stale`. Each choice gives different totals.
- The reverse also happens: an enabled writer emits into a log that other release-N participants still treat as legacy.

The operational participant inventory guards against pre-N binaries, which cannot be helped. It cannot guard against release-N participants disagreeing, because they disagree by design under a local setting.

**Required resolution:** Make the active model a property of the canonical Timing Log. One option is an immutable activation marker in the comment, written once by an explicit rollout action. It would record the model, its activation source order or tick, and the operator or operation identity. Then:

- Every release-N writer honors the marker regardless of its local setting. It emits the logged model, or refuses with a typed diagnostic if it cannot.
- The local or repository setting only authorizes placing the marker on a log. It may also serve as a kill switch that refuses publication, never one that silently downgrades.
- Readers apply the legacy model to source rows before the marker and event-delta/v1 to rows after it. Define how a legacy-grammar row appended after the marker is classified: a typed diagnostic, not silent acceptance.
- Repair apply that converts history also writes or validates the same marker.

Add tests:

- Two release-N writers with different local settings on one log.
- A legacy-grammar row appended after activation.
- A marker-present log read by a reader whose setting is disabled.

### R2-F002 — Pending-boundary fill and sealed-source protected regions conflict for ordinary appends

**Severity:** Medium.

**Spec text:**

- "Which lanes a boundary can credit": "When such evidence arrives, deterministic reallocation splits that observed window at the already recorded boundaries under the publication convergence contract."
- "Publication identity ...": "An insertion requiring protected-prefix reallocation is refused; never move its timestamp or credit it elsewhere." Also: "A proposed change intersecting those protected bytes is preview/export only."

**Problem:** After R1-F002, reallocation of earlier rows is no longer limited to rare late insertions. Every ordinary in-order append whose closing evidence spans an earlier shared boundary triggers it. A typical case is another actor's update after a lifecycle pair it did not publish. If that boundary row lies inside a protected sealed-source region, the spec gives two incompatible readings:

- (a) The ordinary append is "an insertion requiring protected-prefix reallocation" and is refused. That blocks live timing publication for that actor indefinitely, which turns a duration-projection limitation into a lost event.
- (b) The append proceeds and the protected boundary keeps its pending slice. The spec then never says which row, if any, owns the portion before the boundary. It also does not say whether that portion becomes terminally unavailable, or whether the new row may absorb it. Absorbing it would be "credit it elsewhere", which is forbidden.

Sealed approval and outcome records cover the timing prefix in exactly the Review/close window, where multiple sessions are most likely. So this is a realistic path, not an edge case.

**Required resolution:** State that an ordinary append is never refused because a pending slice on a protected row cannot be filled. Treat the slice up to the last protected boundary tick as terminally unavailable with reason `sealed-source-protected`, carried on the new row's known-subtotal and reason payload, because the protected row's bytes cannot change. The appended row owns only its observed window after that boundary. Totals expose the protected remainder as unavailable and never credit it elsewhere.

Reserve "refused" for true late insertions whose own position falls inside the protected region. Add a regression test: an actor opens before a sealed `review:approved` pair and posts its first closing update after it. The update publishes, the protected bytes are unchanged, the pre-boundary slice is reported as protected-unavailable, and conservation holds over the known windows.

## Required changes

1. R2-F001: Move the active-model decision from participant configuration onto the canonical Timing Log. Use an immutable activation marker that every release-N writer honors, refusing rather than downgrading. Readers apply per-segment models. Define how legacy-grammar rows appended after activation are diagnosed. Repair apply writes or validates the marker. Add tests for divergent local settings and post-activation legacy rows.
2. R2-F002: Specify that ordinary appends are never refused over unfillable pending slices on protected rows. Make the protected pre-boundary portion terminally unavailable (`sealed-source-protected`), never credited elsewhere, and give the new row only its post-boundary window. Restrict "refused" to true late insertions inside the protected region. Add the sealed `review:approved` spanning-update regression.

## Optional suggestions

### R2-F003 — State that the boundary-credit rule applies symmetrically to interrupted lanes

"Which lanes a boundary can credit" speaks only of engagement and closing observations. An interrupted lane crossing a shared boundary has the same issue for Idle: its partition is pending until its own `resume` arrives. A lane paused and never resumed accrues no Idle through unrelated boundaries. One sentence would stop an implementer from crediting open-interruption Idle at every boundary. That would be the Idle analogue of the round-1 inflation.

### R2-F004 — Distinguish fillable-pending from terminal-unavailable, and state the close/board behavior for permanently incomplete logs

A lane whose session never returns leaves its boundary slices pending indefinitely. The baseline already returns null totals when an actor log is incomplete (`timing-rollup.mjs:311`, `:325`; `timing-rows.mjs:421`). Under the revised rule, though, any dead foreign session that was open across a lifecycle pair makes the issue's Engaged/Plan/Review projections permanently null.

Consider these additions:

- An availability state that separates pending (a later own observation can still fill it) from terminal (protected, or closed by an explicit operator or orphan-finalize action).
- An explicit operator action that converts a dead lane's pending tail to terminal unavailable, without inventing an end.
- A statement of what close and board-field updates record when only a known subtotal exists.

## Decision

revisions-requested

<!-- aitm-owned-comment key="design.xpr-reviewer-round-2" -->
````````
<!-- historical-comment-body:end id="6069884526" -->

## Comment 6069887888

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069887888

Created: 2026-10-08T22:01:54Z. Last updated before archival: 2026-10-08T22:01:54Z.

<!-- historical-comment-body:start id="6069887888" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7ab4a2020215fd8c5d63b00c7253dcdb"
role: "author"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
artifact_commit: "1e6f2461a1db7b2ab07119cdc57447fd60b2eb9d"
artifact_blob: "db7201ee19f1e08c7507d157c80f03861921d3b7"
artifact_digest: "sha256:c05810c5daa57b3a63663b938f36161574e97cd81b3f32a5e848222747329767"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
  identity_source: "runtime"
started_at: "2026-10-08T21:00:32.785Z"
submitted_at: "2026-10-08T21:41:37.425Z"
finding_ids: []
answered_finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed both required round-two findings and clarified symmetric Idle evidence plus availability/board behavior. The canonical log owns model activation, and valid ordinary appends retain protected-unfillable history without moving or losing events. This is a specification revision only.

## Finding dispositions

### R2-F001 — Accepted

Moved model authority to an immutable activation marker in the canonical Timing Log. Local configuration only permits requesting activation; it cannot override the shared model. Defined the effective source tuple, operation identity, concrete minimum release, recording time, idempotent admission and conflict diagnostics. Compatible writers honor the logged model or refuse. Added post-activation legacy-row handling, mixed-segment completeness and guarded historical conversion limits.

### R2-F002 — Accepted

Ordinary appends after protected history retain their source evidence and publish even when older pending allocations cannot be filled. Previously credited slices stay intact. Only uncredited protected portions become terminal-unavailable with sealed-source-protected provenance on the successor. The new row credits its post-cutoff window; true late insertion inside protected bytes refuses. Added the spanning-update and conservation tests.

### R2-F003 — Accepted

The closing-evidence rule now explicitly applies to interrupted lanes and Idle. A lone departure cannot accrue Idle through unrelated stage boundaries; its own matching closing evidence establishes the window.

### R2-F004 — Partially accepted

Added known, fillable-pending and terminal-unavailable portion states, evidenced recovery terminalization, stage-scoped null/Unknown board persistence, known-subtotal provenance and existing incomplete-outcome/calibration behavior. A new command declaring sessions dead remains outside #1901, in existing pause/runtime scope. No artificial end is introduced.

## Changes made

Added canonical model activation, model-segment coverage, protected pending-slice preservation for ordinary appends and explicit availability/board/close contracts. Replaced earlier participant-local activation and broad protected-insertion refusal wording. Added the corresponding regression requirements.

## Declined changes and rationale

No required change declined. The optional new dead-session operator command is deferred to its existing pause/runtime scope, retaining honest incomplete measurements and existing evidenced recovery.

## Verification

Re-read the sealed round-two response, layered configuration, actor publication, source lineage validation and the append-position versus projection-rewrite distinction. Document formatting and whitespace checks precede submission. No product code or implementation tests were changed.

Recovery evidence: the actual Claude transcript recorded APR_REVIEWER_GIT_VIOLATION, with artifact/HEAD/branch/index matching but worktree drift from an author-created standalone XPR record. Preserved that record in ignored scratch and verified the exact expected boundary digest sha256:0a7e6f1b45fc78f05dfd91562675a39f53ce50353ca734ca8dd3ee8c0b7590dd.

Reconciled the stalled provider-launch outcome using the official exact-session terminal snapshot, exact native submit refusal and matching reviewer fingerprint; original ledger and audit receipt are preserved in scratch. This confirmed completed provider execution only and created no review decision, timestamp or identity. The same actual Claude session then submitted round two, recorded at 2026-10-08T21:35:20.539Z in protocol revision 5. Future task-comment collateral remains ignored while reviewer turns are active. The recovery delay remains part of end-to-end elapsed time, separately identified from reviewer work.

<!-- aitm-owned-comment key="design.xpr-author-round-2" -->
````````
<!-- historical-comment-body:end id="6069887888" -->

## Comment 6069889519

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069889519

Created: 2026-10-08T22:02:00Z. Last updated before archival: 2026-10-08T22:02:00Z.

<!-- historical-comment-body:start id="6069889519" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7ab4a2020215fd8c5d63b00c7253dcdb"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
artifact_commit: "bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8"
artifact_blob: "b47734b6626d971a5d67a879c03bebc2c928c84f"
artifact_digest: "sha256:6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:bd6c5d5a4a396b3f569c9b1acf45178ef4500e8f19a591d7de0d825207730f55"
  identity_source: "runtime"
started_at: "2026-10-08T21:01:26.774Z"
submitted_at: "2026-10-08T21:43:27.288Z"
finding_ids: ["R3-F001","R3-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Round 3 reviews the revised spec at artifact commit `bb24dd7e`, checked against author response 2. I re-read the full post-round-1 tail, sections "Publication identity, reallocation and sealed-source compatibility" through "Pending versus terminal availability", for consistency with the earlier body.

**R2-F001: resolved.** "Model activation belongs to the shared comment" moves model authority onto one immutable `aitm-duration-model:v1` marker in the canonical Timing Log. The marker carries the effective stable source tuple, operation identity, minimum reader release and the actual recording time:

- Every release-N participant must honor the marker regardless of local `timingDurationModel`, or refuse with `duration-model-unsupported`. A kill switch refuses and never downgrades.
- Local configuration only authorizes requesting activation.
- Post-activation legacy-grammar rows are diagnosed as `post-activation-legacy-row` and are never silently accepted.
- Mixed-segment scalars report a `legacy-segment-unconverted` remainder instead of blending heuristic and event totals.
- Historical apply writes or validates the same marker in the same mutation and cannot move an immutable tuple.

That closes the participant-local scope gap. It also composes with the full-projection convergence contract: a release-N writer whose stale snapshot predates activation sees the marker on read-back and rederives under the logged model.

**R2-F002: resolved.** "Ordinary appends preserve unfillable protected slices" states that an ordinary append is never refused over an unfillable pending slice on a protected row:

- The uncredited pre-cutoff portion becomes terminal-unavailable (`sealed-source-protected`) in the successor's reason and known-subtotal payload.
- The new row owns only its post-cutoff window, and protected bytes stay exact.
- Refusal is reserved for true late insertions inside the region.
- Previously credited protected slices are not re-marked.
- Conservation explicitly accounts for unassigned protected extent.

The cross-reference added near line 193 removes the earlier contradiction.

**R2-F003 and R2-F004: resolved.** The closing-evidence rule is now symmetric for Idle. The availability states `known`, `fillable-pending` and `terminal-unavailable` are defined. Existing recovery and finalize events terminalize unknown tails without inventing an end. Board fields persist only complete values and keep null/Unknown otherwise, with provenance in the projection. Close and calibration keep existing incomplete-outcome handling. Deferring a dead-session operator command to the #1858/#1857 runtime scope is reasonable and consistent with the issue's Out of Scope.

I found no remaining correctness, consistency or scope defects that require another revision. The spec is internally consistent, matches the #1901 Scope and AC1–AC6, preserves the #1854 required results (51 / 453660 / 133 / 5 / 901), and leaves implementation, Plan approval and historical apply authority with their governed gates. Two non-blocking clarity suggestions follow.

## Findings

None.

## Required changes

None.

## Optional suggestions

### R3-F001 — Consolidate or add a precedence note before writing the implementation plan

The spec now spreads normative rules across the original body and three appended "XPR clarifications" and "XPR round 2" sections. Several early sentences are correct only together with a later override:

- line 93: boundaries partition only evidenced lanes;
- line 151: rollout under the later contract;
- line 193: ordinary appends defer to the protected-pending rule;
- line 219's review-choices list, which still names "partitioned shared boundaries" and omits the canonical activation marker.

An implementer reading top-down can miss the binding later text. Before or during implementation planning, consider one of two fixes. Either fold the XPR sections into their topical sections, or add a one-line precedence statement at the top saying the XPR sections are normative and override earlier wording where they are more specific. Also refresh the line-219 review-choices summary.

### R3-F002 — State what carries the marker on a future-only activation

The text says that "admits the activating source row and marker together" and that the tuple "is not a newly invented timing event". For historical conversion, the activating row is an existing unprotected row whose suffix the repair rewrites. For a future-only activation, it is not explicit whether either of these holds:

- the marker rides on the next ordinary producer row that the rollout action publishes, which then needs a real triggering event;
- the rollout action itself emits a sanctioned row.

State which one applies, so the implementation plan does not have to choose between delaying activation until the next organic row and inventing a row.

## Decision

accepted

<!-- aitm-owned-comment key="design.xpr-reviewer-round-3" -->
````````
<!-- historical-comment-body:end id="6069889519" -->

## Comment 6069891027

Source: https://github.com/kburson/ai-task-manager/issues/1901#issuecomment-6069891027

Created: 2026-10-08T22:02:05Z. Last updated before archival: 2026-10-08T22:02:05Z.

<!-- historical-comment-body:start id="6069891027" -->
````````text
<!-- ai-peer-review-template version="1" digest="sha256:e53bf4d9991ae94a699fede1d62fd90324e45923de951babcb8d9ad237900bd9" -->

# Review manifest

Mode: `normal`

```json
{
  "acceptance_basis": "reviewer-consensus",
  "artifact_history": [
    {
      "blob": "292c2008e330d3b628dc6b7a84e2d1f360839e62",
      "commit": "06743dbddd6f9001d60b5674e52824230aead9f0",
      "digest": "sha256:e85871a74daba96ecc2310e0e0a3756759230bb0a1b1fcd7006e3eb73353ebbc",
      "path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md",
      "snapshot": null,
      "turn": 0
    },
    {
      "blob": "db7201ee19f1e08c7507d157c80f03861921d3b7",
      "commit": "1e6f2461a1db7b2ab07119cdc57447fd60b2eb9d",
      "digest": "sha256:c05810c5daa57b3a63663b938f36161574e97cd81b3f32a5e848222747329767",
      "path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md",
      "snapshot": null,
      "turn": 1
    },
    {
      "blob": "b47734b6626d971a5d67a879c03bebc2c928c84f",
      "commit": "bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8",
      "digest": "sha256:6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f",
      "path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md",
      "snapshot": null,
      "turn": 2
    }
  ],
  "artifact_path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md",
  "authority": {
    "acceptance_attestation": null,
    "policy": "unavailable",
    "verifier": null
  },
  "authority_assurance": "unavailable",
  "claims": [
    {
      "claim_id": "claim-6c66b3cf-f87e-479a-a636-a396defe1795",
      "claimed_at": "2026-10-08T21:01:26.811Z",
      "expires_at": "2026-10-09T05:01:26.811Z",
      "host": "claude-code",
      "last_activity_at": "2026-10-08T21:01:26.811Z",
      "role": "reviewer",
      "session_fingerprint": "sha256:bd6c5d5a4a396b3f569c9b1acf45178ef4500e8f19a591d7de0d825207730f55"
    },
    {
      "claim_id": "claim-926e5008-7aaa-49a6-83f6-9e20f5367879",
      "claimed_at": "2026-10-08T21:05:53.688Z",
      "expires_at": "2026-10-09T05:05:53.688Z",
      "host": "codex",
      "last_activity_at": "2026-10-08T21:05:53.688Z",
      "role": "author",
      "session_fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
    }
  ],
  "commit_mode": "normal",
  "final_commit": "bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8",
  "human_decision": null,
  "identity_changes": [
    {
      "identity": {
        "evidence": {
          "model": {
            "assurance": "observed",
            "conflict": false,
            "declared_id": null,
            "observed_id": "gpt-6.1-sol",
            "requested_id": null,
            "source": "provider-result"
          },
          "session": {
            "assurance": "observed",
            "fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e",
            "source": "provider-result"
          }
        },
        "host": "codex",
        "identity_source": "runtime",
        "joined_at": "2026-10-08T21:00:32.785Z",
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
        "event_log_digest": "sha256:ebc571b8c9a350bc34ef1e4932f1bf24591fc4f109bf615e4938e7b716429d01",
        "predecessor_review_id": null,
        "reciprocal_receipt_digest": null,
        "record_id": "review-7ab4a2020215fd8c5d63b00c7253dcdb",
        "recovery_claim_digest": null,
        "recovery_id": null,
        "recovery_ordinal": 0,
        "review_id": "review-7ab4a2020215fd8c5d63b00c7253dcdb",
        "root_review_id": "review-7ab4a2020215fd8c5d63b00c7253dcdb",
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
          "assurance": "observed",
          "conflict": false,
          "declared_id": null,
          "observed_id": "gpt-6.1-sol",
          "requested_id": null,
          "source": "provider-result"
        },
        "session": {
          "assurance": "observed",
          "fingerprint": "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e",
          "source": "provider-result"
        }
      },
      "host": "codex",
      "identity_source": "runtime",
      "joined_at": "2026-10-08T21:00:32.785Z",
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
          "fingerprint": "sha256:bd6c5d5a4a396b3f569c9b1acf45178ef4500e8f19a591d7de0d825207730f55",
          "source": "environment-declaration"
        }
      },
      "host": "claude-code",
      "identity_source": "runtime",
      "joined_at": "2026-10-08T21:01:26.774Z",
      "model_display": "claude-opus-5-5",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "role": "reviewer",
      "session_fingerprint": "sha256:bd6c5d5a4a396b3f569c9b1acf45178ef4500e8f19a591d7de0d825207730f55"
    }
  },
  "record_id": "review-7ab4a2020215fd8c5d63b00c7253dcdb",
  "recoveries": [],
  "residual_risk": [
    "human-authority-unavailable"
  ],
  "review_id": "review-7ab4a2020215fd8c5d63b00c7253dcdb",
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
  "startup_commit": "06743dbddd6f9001d60b5674e52824230aead9f0",
  "status": "accepted",
  "supplements": [],
  "turns": [
    {
      "artifact": {
        "blob": "db7201ee19f1e08c7507d157c80f03861921d3b7",
        "digest": "sha256:c05810c5daa57b3a63663b938f36161574e97cd81b3f32a5e848222747329767",
        "path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
      },
      "author_response": {
        "digest": "sha256:3f7ecf05e4ebfeb388f4a2bd5e4d2e54e2d04e5c610d810556260cb103657e1b",
        "path": "docs/peer-reviews/1901/xpr/spec/2026-10-08-2026-10-08-1901-event-derived-timing-design-review-7ab4a2020215fd8c5d63b00c7253dcdb/review-7ab4a2020215fd8c5d63b00c7253dcdb-author-response-1.md"
      },
      "commit": "1e6f2461a1db7b2ab07119cdc57447fd60b2eb9d",
      "decision": "revisions-requested",
      "finding_ids": [
        "R1-F001",
        "R1-F002",
        "R1-F003",
        "R1-F004",
        "R1-F005",
        "R1-F006",
        "R1-F007",
        "R1-F008"
      ],
      "reviewer_response": {
        "digest": "sha256:2cdaf16239d462436a1d1e3f914bdfa1897930460aca81a4929ff3bae8883d58",
        "path": "docs/peer-reviews/1901/xpr/spec/2026-10-08-2026-10-08-1901-event-derived-timing-design-review-7ab4a2020215fd8c5d63b00c7253dcdb/review-7ab4a2020215fd8c5d63b00c7253dcdb-reviewer-response-1.md"
      },
      "snapshot": null,
      "turn": 1
    },
    {
      "artifact": {
        "blob": "b47734b6626d971a5d67a879c03bebc2c928c84f",
        "digest": "sha256:6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f",
        "path": "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
      },
      "author_response": {
        "digest": "sha256:6b04f601d295e1e65a5b9a3bd2c2703acd4cff15ba8ddee9ee12776132bc6444",
        "path": "docs/peer-reviews/1901/xpr/spec/2026-10-08-2026-10-08-1901-event-derived-timing-design-review-7ab4a2020215fd8c5d63b00c7253dcdb/review-7ab4a2020215fd8c5d63b00c7253dcdb-author-response-2.md"
      },
      "commit": "bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8",
      "decision": "revisions-requested",
      "finding_ids": [
        "R2-F001",
        "R2-F002",
        "R2-F003",
        "R2-F004"
      ],
      "reviewer_response": {
        "digest": "sha256:5c33ee50bc7b0e12228e54eae29f4294e7b2430bc16bba728d38d5ee971186b5",
        "path": "docs/peer-reviews/1901/xpr/spec/2026-10-08-2026-10-08-1901-event-derived-timing-design-review-7ab4a2020215fd8c5d63b00c7253dcdb/review-7ab4a2020215fd8c5d63b00c7253dcdb-reviewer-response-2.md"
      },
      "snapshot": null,
      "turn": 2
    },
    {
      "artifact": null,
      "author_response": null,
      "commit": null,
      "decision": "accepted",
      "finding_ids": [
        "R3-F001",
        "R3-F002"
      ],
      "reviewer_response": {
        "digest": "sha256:89db4ee401f501d32e4752ebfecfe157c1f333707047ed06ef973ae04b9750be",
        "path": "docs/peer-reviews/1901/xpr/spec/2026-10-08-2026-10-08-1901-event-derived-timing-design-review-7ab4a2020215fd8c5d63b00c7253dcdb/review-7ab4a2020215fd8c5d63b00c7253dcdb-reviewer-response-3.md"
      },
      "snapshot": null,
      "turn": 3
    }
  ]
}
```

<!-- aitm-owned-comment key="design.xpr-manifest" -->
````````
<!-- historical-comment-body:end id="6069891027" -->
