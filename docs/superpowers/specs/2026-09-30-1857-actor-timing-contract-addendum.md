# #1857 actor timing and incomplete telemetry contract addendum

This addendum records user-authorized R9 implementation detail and the controller's October 1 ruling. It does not change the accepted specification or plan bytes, claim a renewed Plan approval, or replace normal work verification. Original approval and forecast remain original-scope evidence. Final independent code review must inspect these changes explicitly.

## Current engagement evidence

A genuine protected binding start and current flush observation establish a closed actor interval even when historical canonical rows lack actor attribution. Publish that interval on the current timing row through a versioned evidence marker; never insert a backdated start, relabel an old row, or infer the current actor for a historical approval/departure projection.

Public correlation uses a versioned SHA-256 key over a syntax-validated provider/session tuple. Exact identity remains protected locally. The marker carries ordered start/end instants, known wall milliseconds and explicit observed/unavailable active estimate. Actor, interval, estimate and row-sec parsing share one lexical implementation. Null must never coerce to zero. Queue stores original identity and interval before publication; replay preserves them independently of the draining actor.

Same-actor interval union prevents overlap from being counted twice, including migration and subsequent normal pause. Different actors sum independently. Real issue lifecycle boundaries supply phase context; no phase entry is manufactured for each actor. A final explicit pause may remain inactive at Review; missing end or unexplained telemetry remains incomplete.

## Durable incomplete telemetry

Existing complete v1 estimation outcomes remain readable and retain their meaning. Add a versioned incomplete outcome form using the normal estimation-outcome record type and registered canonical record writer.

The incomplete form must contain:

- Exact repository/issue and frozen forecast record linkage.
- Exact accepted verification head and unchanged valid work-verification receipt references.
- Explicit incomplete status and closed, meaningful unknown-reason codes.
- Known actor intervals and unioned subtotal, separately identified as a lower bound rather than a complete total.
- Source provenance binding the observed canonical timing comment identity and content digest to the projection.
- Null unavailable complete totals, stage totals where unavailable, variance and cost classifications; no invented zero or calibration datum.

An unavailable boolean supplied by a caller is never evidence. The normal writer must validate the payload, hold the existing logical record claim, write through canonical GitHub record transport and freshly read back the unique active record. Validate full payload identity/digest, issue, forecast and verification head, not merely status or a returned record ID. Ambiguous write outcome remains unresolved and retryable; malformed, wrong-issue, wrong-head, wrong-forecast, conflicting or stale records refuse.

Normal Close must validate the durable accepted record and its source/verification linkage before accepting incomplete telemetry. This replaces the invalid assumption that every legitimate outcome has a non-null numeric timing total. It does not skip outcome persistence, AC/DoD verification, independent review, ownership, commit, integration, delivery or close gates.

Board/body timing projection exposes Unknown with reason and provenance when a complete current total is unavailable. Do not overwrite verified values with zero or a partial subtotal, and do not present a retained historical number as a current complete total. Retained values, if useful, are explicitly last-observed context. Actual transport failures remain fail-loud; typed telemetry unavailability must not be mislabeled as a GitHub outage or force fabricated historical attribution.

Incomplete outcomes are excluded from quantitative calibration. Reports show known subtotal and unknown remainder without substituting stale board values. A later authoritative complete observation uses normal versioned correction/supersession, never silent record mutation.

## Exact implementation scope

Core corrections and evidence grammar:

- scripts/task-tracker/lib/timing-actor.mjs
- scripts/task-tracker/lib/timing-engagement.mjs
- scripts/task-tracker/lib/timing-row-reader.mjs
- scripts/task-tracker/lib/timing-rows.mjs
- scripts/task-tracker/lib/timing-ladder.mjs
- scripts/task-tracker/lib/bind-event.mjs
- scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs
- scripts/task-tracker/active-time.mjs

Producer and lifecycle coupling:

- scripts/task-tracker/gh-timing-comment.mjs
- scripts/task-tracker/runtime.mjs
- scripts/task-tracker/lib/timing-post-outcome.mjs
- scripts/task-tracker/hook-handler.mjs
- scripts/task-tracker/hooks/on-ask.mjs
- scripts/task-tracker/verbs/resume.mjs
- scripts/task-tracker/verbs/switch.mjs
- scripts/task-tracker/verbs/new.mjs
- scripts/task-tracker/verbs/status.mjs
- scripts/task-tracker/verbs/test.mjs
- scripts/task-tracker/verbs/review.mjs
- scripts/task-tracker/verbs/approve.mjs
- scripts/task-tracker/verbs/reject.mjs
- scripts/task-tracker/verbs/close.mjs
- scripts/task-tracker/lib/move-state/audit-timing.mjs
- scripts/task-tracker/lib/move-state/guard-execution.mjs
- scripts/task-tracker/lib/review-approval-timing.mjs

Projection and durable outcome:

- scripts/task-tracker/timing-rollup.mjs
- scripts/task-tracker/lib/estimation/runtime-adapter.mjs
- scripts/task-tracker/lib/estimation/outcome-builder.mjs
- scripts/task-tracker/lib/estimation/outcome-record.mjs
- scripts/task-tracker/lib/estimation/outcome-writer.mjs
- scripts/task-tracker/lib/estimation/renderers.mjs
- scripts/task-tracker/lib/estimation/rubric-model.mjs
- scripts/gh/log-issue-time.mjs
- scripts/task-tracker/heal-backlog.mjs
- scripts/task-tracker/lib/github-records/singleton-projections.mjs
- scripts/reports/lib/estimation-records.mjs

Tests:

- scripts/tests/unit/task-tracker/lib/timing-actor.test.mjs
- scripts/tests/unit/task-tracker/lib/timing-actor-accounting.test.mjs
- scripts/tests/unit/task-tracker/lib/timing-row-reader.test.mjs
- scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs
- scripts/tests/unit/task-tracker/core/gh-timing-comment-actors.test.mjs
- scripts/tests/unit/task-tracker/core/flush-active-anchor.test.mjs
- scripts/tests/unit/task-tracker/core/timing-rollup.test.mjs
- scripts/tests/unit/task-tracker/lib/timing-phase-close-delta.test.mjs
- scripts/tests/unit/task-tracker/lib/active-by-phase-spans.test.mjs
- scripts/tests/unit/task-tracker/lib/timing-event-emitter-characterization.test.mjs
- scripts/tests/unit/task-tracker/lib/estimation/outcome-builder.test.mjs
- scripts/tests/unit/task-tracker/lib/estimation/outcome-writer.test.mjs
- scripts/tests/unit/task-tracker/lib/estimation/outcome-telemetry.test.mjs
- scripts/tests/unit/task-tracker/lib/estimation/rubric-model.test.mjs
- scripts/tests/unit/reports/lib/estimation-records.test.mjs
- scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs
- scripts/tests/unit/task-tracker/core/close-board-body-agreement.test.mjs
- scripts/tests/slow/task-tracker/verbs/coverage-close.test.mjs
- scripts/tests/integration/task-tracker/lib/timing-actor-runtime.test.mjs
- scripts/tests/integration/task-tracker/lib/active-time-provider.test.mjs
- scripts/tests/integration/task-tracker/lib/github-record-singleton-projections.test.mjs
- scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs
- scripts/tests/unit/task-tracker/core/heal-backlog-fields.test.mjs

## Required RED and verification cases

1. Marker round trip, unavailable rendering, ordered bounds, malformed identities and overlap conflicts.
2. Current genuine interval after untagged history without historical synthesis; exact queue replay by another actor.
3. Independent actor engagement, word baselines, shared phase boundaries and valid paused Review tails; incomplete and out-of-order evidence remains visible.
4. Mixed-history projection retains known subtotal and unknown complete total. Invalid phase/time remains typed or unmatched; ladder preserves its documented per-row contract.
5. Body-omitted rollup cannot double-add tagged rows; inferred review waits are not charged as actor work.
6. Caller-crafted unavailable flag, wrong issue/head/forecast, stale source, conflicting active records and ambiguous/failed publication cannot satisfy Close.
7. Authoritatively persisted/read-back incomplete outcome permits normal lifecycle without numeric fabrication while all actual work receipts and delivery gates remain required.
8. Complete v1 compatibility, unknown display, no stale board substitution and exclusion of incomplete records from calibration.
9. Real same-actor migration coverage plus later normal pause does not double-credit; separate actors are additive. Canonical migration publication remains unimplemented until Task3 coupling and must not be claimed from pure helper tests.

Use sequential bounded source checkpoints, with live producer adoption last after pure/fixture tests. Both worktrees use normal enforcement for commits/review. No live migration or cleanup is authorized by this addendum.
