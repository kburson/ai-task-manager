# Defect #1901: Event-derived Active/Idle timing

**Status:** Draft for human review. Implementation and historical apply have not started.
**Issue:** [#1901](https://github.com/kburson/ai-task-manager/issues/1901).
**Source baseline:** `e49543f2e93c6d5ce768322b8cb36bad8639bc61`.
**Bound branch:** `codex/1901-draft`, existing `e8fc` worktree.

## Intent and scope

A workspace operator should see recorded work and waiting time directly in a story's Timing Log. Derive Active/Idle from timestamped engagement, departure and reengagement events, independently of transcript telemetry. Missing transcript coverage must not suppress a recoverable elapsed interval.

Active is elapsed recorded engagement; Idle is elapsed recorded interruption. Neither asserts CPU execution, productive work or completed-turn coverage. Words and retained transcript activity estimates remain separately sourced.

Scope includes interval derivation, actor attribution, shared boundaries, display, canonical numeric metadata, readers/rollups, replay and guarded historical recalculation. Exclude board-format changes, pause/turn policy redesign (#1858), durable-runtime redesign (#1857/#1862), and #1847 criteria revisions. Never invent/backdate events, assign historical identities, alter word cursors, or rewrite sealed outcome/approval records.

This requested specification does not confer implementation, Plan-approval, closure or historical-apply authority.

## Confirmed defect

The baseline `runtime.mjs::flushActiveToGH` obtains actor interval endpoints, then uses `active-time.mjs::readActivityEvidence` to supply visible durations. Non-observed transcript evidence makes both seconds null. `gh-timing-comment.mjs::buildRow` renders those values as Unknown despite valid engagement start/end evidence. Transcript availability and event elapsed-time availability are separate facts.

`lib/move-state/audit-timing.mjs::emitPhasePairRows` flushes the bound actor, then publishes zero-valued shared boundaries. Time between the flush and the boundary is not allocated to that boundary. The actor branch of `lib/timing-rows.mjs` also leaves Idle unavailable; `timing-rollup.mjs` has separate private parsing and pause adjustments.

`backfill-timing-logs.mjs` repairs only legacy minute-zero rows without seconds markers. It skips actor Unknown and stale seconds, assumes a historical column shape, and writes a fetched body without an exact fresh-base check.

The [#1854 Timing Log](https://github.com/kburson/ai-task-manager/issues/1854#issuecomment-5915941693) was inspected live. Required results are:

| Recorded interval, offset -05:00                         | Closing row    | Active seconds | Idle seconds |
| -------------------------------------------------------- | -------------- | -------------: | -----------: |
| September 30, 13:15:28 resume → 13:16:19 pause           | `pause:other`  |             51 |            0 |
| September 30, 13:16:19 pause → October 5, 19:17:19 start | `start`        |              0 |       453660 |
| October 5, 19:17:19 start → 19:19:32 update              | `update`       |            133 |            0 |
| October 5, 19:19:32 update → 19:19:37 boundary           | `plan:started` |              5 |            0 |
| October 5, 19:19:37 boundary → 19:34:38 update           | `update`       |            901 |            0 |

The update marker preserves `start=1791245839945 end=1791245972731 active=unknown`, a raw difference of 132.786 seconds. Its displayed event timestamps establish 133 seconds. The precision contract below resolves this deliberately; preserve the raw evidence.

[#1851](https://github.com/kburson/ai-task-manager/issues/1851#issuecomment-5915448363) and [#1852](https://github.com/kburson/ai-task-manager/issues/1852#issuecomment-5915705167) are additional reported regression sources. Capture their exact tables during implementation; this draft does not claim every historical unavailable reason was identified.

## Options

**A — Shared event-derived allocation engine (recommended).** One derivation for publication, repair and accounting makes actor/boundary allocation inspectable. Requires coordinated reader/writer updates.

**B — Wall-time fallback only when transcript evidence is missing.** Smaller patch, but columns change meaning with telemetry availability and boundary/repair inconsistencies persist. Reject.

**C — Display conversion and legacy-zero repair only.** Smaller change, but recoverable actor Unknown and duplicate-credit risks remain. Reject.

## Accounting rules

### Precision and ownership

Normalize timezone-aware event instants to UTC whole seconds: `tick = floor(timestampMs / 1000)`. Subtract ticks rather than rounding each millisecond interval. Preserve timestamp text and original millisecond endpoints. Live and repaired calculations use the same rule, making splits conserve seconds.

Minute-only legacy timestamps use their recorded minute boundary and carry a minute-resolution annotation. Reject impossible dates, absent timezone offsets, nonfinite instants, negative deltas and unsafe integers. Never clamp invalid input to zero.

Use half-open slices `[fromTick, untilTick)`, each assigned to exactly one closing row and one lane. Different actor lanes can overlap: their sum is actor effort and may exceed issue wall time. Session wall time retains its separate existing definition.

A valid recorded engagement start/end marker can establish a bounded slice when its explicit opener row is absent. Normalize its endpoints, retain its lane identity, and reconcile prior allocated coverage. Label this source as engagement endpoints; preserve its transcript estimate separately. Conflicting boundaries or missing ends prevent this fallback.

First start without a predecessor has zero contribution. Update/departure without a valid opener is unavailable. Same-instant boundaries are valid zero; retain intentional blank-zero display.

### Engagement state

Each lane tracks unopened, engaged, interrupted or unavailable, plus opener and accounting cursor. Classify through the canonical `lib/timing-events/` grammar, including supported legacy events.

| Event                              | Preceding slice                               | State afterward           |
| ---------------------------------- | --------------------------------------------- | ------------------------- |
| Initial start                      | Zero, except the explicit legacy bridge below | Engaged                   |
| Resume after departure             | Idle since last accounted boundary            | Engaged                   |
| Update/neutral audit while engaged | Active since last accounted boundary          | Engaged                   |
| Pause, stop, switch-out            | Active up to departure                        | Interrupted               |
| Neutral audit while interrupted    | Attributable closed Idle slice                | Interrupted               |
| Shared lifecycle boundary          | Partition eligible lanes                      | Preserve engagement state |

A resume closes interruption. Other boundaries may partition it without closing it. Use pause-span metadata only with attributable scope and consistency with event brackets; union overlaps and never subtract a recorded pause twice. Ambiguous unscoped markers in multi-actor history yield an unavailable portion rather than pausing every actor.

Duplicate starts, repeated departures, out-of-order events and conflicting evidence produce explicit reasons. A later valid opener can restore future calculation without erasing earlier ambiguity.

Orphan/session-end recovery publication is not the observed end of a lost session. If that end is missing, stop extending its engagement and retain an unavailable tail. Fresh engagement requires a fresh observed opener. Long gaps are Active only with valid continuous engagement evidence; departure-bracketed gaps are Idle regardless of length. The old 12-hour backfill cap cannot reject the five-day Idle example.

### Actors and legacy bridge

Actor rows affect only their existing provider/session lane. Actor B cannot advance A's cursor or close A's interruption. A new actor cannot inherit another actor's earlier engagement/idle.

Pre-actor history uses a distinct `legacy-single-stream` lane without invented keys. In mixed history, unattributed lifecycle rows are shared facts; non-lifecycle rows without provable ownership are unavailable.

The required legacy bridge closes an interrupted legacy prefix on the first attributed start only when one legacy lane exists, no opener/recovery intervenes, and no competing attributed history exists. Allocate its Idle as `legacy-idle-bridge`, belonging to legacy history, not the new actor's prior session. Preserve that start's actor marker and word reset. Begin the new actor at the start timestamp. Competing candidates yield `legacy-bridge-ambiguous`.

This recovers 453660 seconds Idle without assigning historical identity. Later actor-to-actor handoffs have no implicit bridge.

### Lifecycle boundaries and totals

Shared lifecycle facts partition all valid open lanes at their timestamp and do not establish engagement. The first row in a same-instant pair receives preceding slices; the second receives zero. Preserve per-lane allocations. Shared cells show their sum only when that dimension is fully known; otherwise show Unknown with a separately inspectable known subtotal.

For #1854, the boundary receives five seconds and the later update receives 901 seconds. Original engagement evidence spanning both remains evidence and is not credited again.

Assign slices to the stage in force before their closing boundary. Completion/entry changes stage context without changing engagement. Completion-to-entry gaps remain an explicit unassigned-stage bucket unless existing policy supplies a stage. Retain distinct visits/demotions before aggregation.

Issue/actor totals sum disjoint slices. Review/Plan projections use these allocations and existing stage definitions; never add old heuristic totals or subtract pauses again. Preserve board codecs and minute conversion. Do not rewrite sealed outcomes; new projections identify their changed derivation/source.

## Architecture and metadata

Add a pure policy module, proposed as `lib/timing-duration-derivation.mjs`. Inputs are lexically parsed ordered rows, scoped pause evidence and explicit candidate event/time. Outputs are per-row allocations, lane state, known subtotals, completeness and reasons. No network, transcript reads, writes or implicit clock reads.

A row result has nullable Active/Idle seconds and ordered allocations. Each allocation identifies lane kind/key, endpoint ticks, seconds, source row references and method. Shared rows have multiple allocations. Replay equality includes source event identity and allocations rather than display text alone.

Keep `lib/timing-row-reader.mjs` as the lexical leaf. Centralize suffix parsing/replacement and preserve transition, actor, engagement, cost and opaque metadata. Coordinate with #1735's composed-suffix contract; do not presume its proposed helpers exist at this baseline.

Flush, bind/resume, lifecycle, approval, close and recovery producers use the engine at the serialized publication boundary against the fresh canonical timing source. New candidates derive allocations against the fresh source. Journaled or queued rows retain immutable event/endpoint identity; publication reconciles prior coverage before new credit. Existing journals retain immutable payload and checkpoint ordering. Queue/replay cannot open or credit the same interval twice. Extend existing #1857/#1862 runtime interfaces only as necessary; do not replace their storage/authority model.

For fully known rows, canonical `row-sec` agrees with allocation and display. Stale zero/display metadata cannot override valid event intervals. Keep engagement `active=...` as the original transcript estimate, including unknown; never substitute event-derived seconds there. Retain millisecond endpoints and words.

Add a versioned suffix, proposed as `aitm-duration:v1`, with deterministic encoded model `event-delta/v1`, allocations, input precision, evidence references and availability reasons. Repair reports additionally record operator, operation ID, algorithm/spec version and source/target digests. Repeated repair adds no duplicate provenance.

Partially unknown rows carry nullable dimensions and known subtotals in the new payload, not a misleading complete `row-sec` pair. Reasons include missing-opener, invalid-timestamp, missing-timezone, out-of-order, ambiguous-lane, conflicting-evidence, unobserved-session-end and legacy-bridge-ambiguous.

Update actor suffix validation, lexical preservation, numeric readers, replay and queue validation before emitting new metadata. Current `readTimingActor` rejects additional suffixes. Malformed/conflicting metadata produces diagnostics rather than extra cells or silent selection of whichever regex matched first.

## Display contract

Known seconds render as `[N days ]HH:MM:SS`. Omit days below 86400; otherwise use an unpadded positive integer plus the word `days` with exactly one ASCII space before and after it, including `1 days 00:00:00`. Hours are 00–23; clock components are two digits. Preserve intentional blank zeros; explicit zero is `00:00:00`.

| Seconds | Display            |
| ------: | ------------------ |
|       0 | `00:00:00`         |
|      47 | `00:00:47`         |
|     133 | `00:02:13`         |
|    3599 | `00:59:59`         |
|    3600 | `01:00:00`         |
|   86399 | `23:59:59`         |
|   86400 | `1 days 00:00:00`  |
|  453660 | `5 days 06:01:00`  |
|  864000 | `10 days 00:00:00` |

Shared seconds parsing accepts new and old `Xh MMm SSs` forms; the row adapter retains legacy minute-cell parsing. Reject negative/fractional/unsafe seconds, NaN/Infinity, numeric strings passed to numeric formatting, invalid ranges, zero/padded day prefixes and malformed grammar. Distinguish blank-zero, unavailable and malformed values. Conflicting known display/metadata yields a diagnostic; repair explicitly reconciles it.

Use a Timing Log-specific formatter to preserve board formatting/sorting. Display conversion alone cannot recalculate history or replace Unknown.

## Historical recalculation

Add explicit event-duration mode to the registered repair command, proposed as `aitm backfill-timing-logs --issue N --event-durations`. Dry-run is default; existing callers retain legacy-only behavior. Cover Unknown, zero/nonzero discrepancies, actors, boundaries and display conversion. Reconsider prior unrecoverable tags against current valid evidence while preserving originals in backups/reports.

Preview includes exact comment ID/body SHA-256, algorithm version, before/after values, allocations/reasons, retained Unknown and total changes. Apply must consume that preview's expected digest rather than regenerate silently. Select issues explicitly; discover #1847 children from its live tree without changing its scope or applying automatically.

Apply acquires per-issue writer coordination, excludes/drains queued publications, re-reads canonical identity/body and checks the exact expected digest. Save an exact non-overwriting backup/manifest under `.scratch/heal/` before mutation. Backup failure, source drift, invalid identity, suffix conflict or uncoordinated writer means no write.

The current `updateIssueComment` accepts ID/body without compare-and-swap. Local locking and a fresh read cannot exclude another host or manual edits. Therefore apply requires an explicitly coordinated exclusive maintenance window; without writer exclusion allow preview/export only. Never claim read-before-write is atomic. Recheck immediately before mutation and verify exact target after. A detected conflict stops subsequent issues, preserves evidence and never blindly restores over newer data.

Lost-response retry first observes the target: matching body/provenance succeeds without another mutation. Rerunning repair is byte-identical. Preserve timestamps, events, order, descriptions, words/cursors, actors and unrelated suffixes; do not synthesize history.

Roll out readers first, then producers, then dry-run repair. Build/test apply capability within this defect. Actual historical GitHub apply remains a separately authorized operational action, with changed totals and unknown remainder visible in its preview.

## Acceptance and verification

These are proposed tests, not implementation results claimed during drafting.

| Issue criterion | Required evidence                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| AC1             | Exact 133/5/51/453660 examples; unfinished turn and unavailable non-Codex telemetry; conservation across splits                      |
| AC2             | Format examples, round trips, boundaries, blank/explicit zero, invalid/unsafe input; unchanged board codec                           |
| AC3             | Real flush/resume/lifecycle/approval/close/recovery adapters; preserved events/words/actors; inspectable unavailable reasons         |
| AC4             | Legacy/new/mixed readers, composed suffixes, corrected seconds, separate transcript estimate, partial totals and phase sums          |
| AC5             | Default no writes, preview digest, exact backup, drift/backup/coordination refusal, read-back, lost response, byte-identical rerun   |
| AC6             | Actor interleaving/overlap, sequential actors, shared boundaries, missing end, duplicate/conflicting replay, journal/cursor recovery |

Capture full exact #1854 legacy/actor history and #1851/#1852 regression inputs with URL/digest/capture time. Add composed suffixes, missing full-word columns, same-second pairs, demotions, long Idle, minute-only times, timezone offset changes and invalid dates. Distinguish captured history from synthetic cases.

Extend vc:1–vc:4 and add focused derivation/runtime tests, including actor-flush-journal, integration actor-flush-isolation, bind-event and move-state audit coverage. Freeze exact runnable commands and reconcile issue verification mappings in the implementation plan. Retain normal repository test/lint/format and governed Test requirements.

Prove slice uniqueness, Active+Idle conservation for known windows, conserved splits, actor isolation, replay-stable totals, honest malformed/unavailable diagnostics and rendered/numeric agreement.

## Review and handoff

Review choices: shared engine A, whole-second precision, narrow legacy idle bridge, actor effort separate from wall time, partitioned shared boundaries, and exclusive maintenance for apply. All remain proposed.

After spec approval, write the issue-numbered implementation plan and satisfy refinement/Plan gates before code. This spec does not replace the later governed deep dive.

Design timing stays bound to #1901: design:start at drafting, design:review at human-review handoff, design:complete after design review completes. The baseline rejects these as Event slugs; record exact labels in Description on sanctioned update rows. New event vocabulary is outside this defect.
