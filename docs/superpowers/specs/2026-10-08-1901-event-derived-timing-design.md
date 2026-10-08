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

A row result has nullable Active/Idle seconds and ordered allocations. Each allocation identifies lane kind/key, endpoint ticks, seconds, source row references and method. Shared rows have multiple allocations. Replay identity compares immutable source evidence. Derived allocations are a mutable projection validated separately, as defined below.

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

## Publication identity, reallocation and sealed-source compatibility

Separate immutable source-event identity from its mutable duration projection. Source identity contains the original timestamp (including precision and offset), event, actor/lane identity, engagement endpoints and original estimate, cumulative word cursors, description, transition identity, and all unrelated suffix metadata. Publisher-owned Active/Idle cells, row-sec and event-duration derivation metadata are projection fields. Preserve the existing publisher-owned Delta Words normalization contract separately; this defect does not alter word accounting or repair word cells.

At first admission retain a stable source identity and canonical evidence digest in derivation metadata. For historical rows derive that identity from the preserved source fields, not from mutable duration cells. A source key alone is insufficient: compare the full immutable evidence digest. Same identity and evidence acknowledge the current validated projection without another slice or word credit. Changes to immutable evidence remain conflicts. A mutable allocation revision or repaired display cannot invalidate replay of an original immutable journal row.

Preserve original timestamps for delayed actor and shared-boundary events. Order by normalized event tick, then stable source order at that tick; retain original ordering for existing equal-tick rows and completion-before-entry within a lifecycle pair. Newly arriving equal-tick rows receive a durable source order after existing rows at that tick. Never advance their timestamp to the current tail to manufacture ordering. Lifecycle pairs are admitted together in their defined order.

Late insertion deterministically rederives every affected subsequent lane allocation and duration projection in one coordinated canonical-body mutation. For start at 0, update at 20, and a late boundary at 10, the final body allocates 10 seconds to the boundary and 10 to the update. Do not merely subtract previously credited intervals or add the boundary on top. Retain immutable source identity, record the projection revision and validate conservation before mutation. Historical repair follows the same identity/reallocation contract.

The original actor-flush journal payload and digest remain immutable. Preserve two distinct successful checkpoint paths:

1. Confirmed remote publication resolves source identity against the current valid canonical projection and acknowledges admission after correlated read-back, without another slice or word credit.
2. Durable queue acceptance advances the existing local checkpoint once the exact immutable payload is durably queued, while explicitly reporting remote publication as pending. Later queue delivery reconciles source identity and the current projection, verifies canonical read-back, then acknowledges and removes that delivery.

If neither succeeds, keep the checkpoint unchanged and retain recoverable journal evidence. Existing terminal and outcome gates still require remote delivery before freezing immutable evidence; queued acceptance is never remote publication. Lost-response and restart recovery validate source admission or exact queued payload as appropriate rather than requiring old rendered row bytes to remain current. Conflicting immutable evidence or an invalid projection refuses rather than being treated as replay.

Keep existing sealed outcome schema validation on its original derivation semantics. Do not silently replace deriveActorEngagement for old outcome validation with the new whole-second allocation model. Add a separate model-dispatched projection path; compatible lexical readers may accept new metadata while old-schema validators ignore it semantically and retain their original numeric rules. Regression tests must exercise the actual outcome reuse adapters, not only record-byte preservation.

Before repair or publication-driven reallocation, enumerate sealed source references for the canonical timing comment and identify protected exact prefix and suffix bytes. The current outcome validator checks both. If reference discovery is incomplete, mutation is refused. A proposed change intersecting those protected bytes is preview/export only, with diagnostic sealed-source-protected identifying the record, source digest and protected region. Neither reformatting, derivation-suffix insertion nor late insertion may change those bytes. Preserve all referenced records and their validators.

Append-only successors outside protected regions remain allowed only when they satisfy existing source-lineage and successor validation, including ordering and engagement consistency. An insertion requiring protected-prefix reallocation is refused; never move its timestamp or credit it elsewhere. Extending authoritative repair lineage across protected sources is outside this defect and requires a separately designed, authorized change. Therefore some closed historical examples can be recalculated/exported but cannot be applied in place under this scope.

## Public scalar projection contract

The event-delta/v1 public projection uses these explicit formulas across legacy and actor histories. Query at the latest recorded event horizon; no implicit local-clock tail is added.

| Scalar                                                           | Slice dimension and scope                                                            | Conversion                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| totalActiveSec / engagedSec                                      | Sum Active over all attributable lanes and stages, including unassigned-stage slices | Integer seconds; Review is never added again                |
| totalIdleSec                                                     | Sum Idle over all attributable lanes and stages                                      | Integer seconds                                             |
| planSec / reviewSec                                              | Sum Active assigned to Plan / Review stage visits respectively                       | Integer seconds, aggregated across visits                   |
| per-stage Idle                                                   | Sum Idle assigned to that stage                                                      | Integer seconds, separately exposed                         |
| totalActiveMin / engagedMin / totalIdleMin / planMin / reviewMin | Corresponding complete seconds scalar divided by 60                                  | Math.round after aggregating seconds; no per-visit rounding |

SessionTime retains its existing independent wall-span definition and board codec. Do not substitute summed actor effort for that field. All changed scalar numeric values continue through the unchanged board display/sorting codec. The uniform minute conversion above replaces the conflicting legacy per-visit and actor fractional Plan conversions for the new projection only. Old sealed outcome calculation remains on its pinned semantics.

Closed slices in an open visit contribute normally. Unobserved future time beyond the recorded horizon contributes nothing. A genuinely unavailable interval at or before the horizon yields null only for projections that it could affect; expose the known subtotal and reasons. Uncertainty restricted to Develop cannot invalidate an otherwise complete Plan total. Unknown stage assignment can affect either stage projection and is reported explicitly. Known Idle-only intervals do not make Active unknown. Actor attribution uncertainty can leave an event-known legacy contribution available at issue level while per-actor attribution remains unavailable.

For a Plan visit with 120 Active seconds and 180 Idle seconds, Plan is 120 seconds / 2 minutes, with 180 seconds Idle separately. For closed Plan Active visits of 20 and 20 seconds, Plan is 40 seconds / 1 minute, not zero from per-visit rounding. Plan and Review are Active subsets of Engaged and must never be added to it a second time.

## Additional SAR regression requirements

Add delayed actor/shared-boundary insertion, equal-second ordering, atomic lifecycle-pair admission, original journal replay after reallocation and repair, and conflicting immutable evidence cases. Add actual sealed-outcome reuse validation after reader rollout, protected-prefix and suffix repair refusal, incomplete reference-discovery refusal, and allowed append-only successor validation. Add legacy/actor parity for interrupted Plan/Review, repeated and open visits, cross-stage uncertainty, integer-second subtotals and aggregate minute conversion. Also test remote failure followed by durable enqueue, local checkpoint advancement without interval/word recount at the next flush, restart after queue acceptance, queue-write failure preserving the checkpoint, and subsequent delivery after projection reallocation. These extend AC4, AC5 and AC6 without changing source timestamps or sealed record semantics.

## Review and handoff

Review choices: shared engine A, whole-second precision, narrow legacy idle bridge, actor effort separate from wall time, partitioned shared boundaries, and exclusive maintenance for apply. All remain proposed.

After spec approval, write the issue-numbered implementation plan and satisfy refinement/Plan gates before code. This spec does not replace the later governed deep dive.

Design timing stays bound to #1901: design:start at drafting, design:review at human-review handoff, design:complete after design review completes. The baseline rejects these as Event slugs; record exact labels in Description on sanctioned update rows. New event vocabulary is outside this defect.
