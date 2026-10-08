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
