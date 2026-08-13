# Retroactive AFK Interval Healing Design

## Context

AITM timing-v2 derives phase activity from chronological Timing Log rows. A
departure row opens an idle span, and a reengagement row closes it. The existing
idle-threshold calculation already prevents long transcript gaps from being
counted wholly active, so a repair must not add idle to threshold-derived cache
values.

The remaining defect is narrower: an operator cannot record a known, short AFK
interval after returning. `heal-timing-departure` repairs one missing departure
only when an unpaired reengagement already exists. It cannot insert a balanced,
caller-supplied interval.

## Decision

Add a separate `heal-timing-interval` live-maintenance command. It is dry-run by
default and accepts an issue, start timestamp, and end timestamp. The command
uses timing-v2 rows as the sole accounting authority, proposes one
`pause:retroactive`/`resumed` bracket, and reports the exact before/after phase
totals. Mutation requires explicit `--apply` authority and the existing blast-
radius confirmation.

This design rejects two alternatives:

- Editing cached active/idle duration cells directly would create a second
  accounting authority and double-count threshold-derived idle.
- Reconstructing the interval from transcripts would turn a caller-supplied
  correction into an inference engine and still leave short gaps ambiguous.

## Pure interval transformer

`scripts/task-tracker/lib/heal-timing-interval.mjs` will expose a pure transform
that receives Timing Log markdown plus caller-supplied endpoints. It will:

1. Parse every valid timing row and preserve its source line, row order,
   timestamp, event, word marker, full-word marker, and displayed UTC offset.
2. Require parseable endpoints with `end > start`.
3. Resolve both endpoints to one lifecycle phase visit. An endpoint outside a
   phase, or an interval crossing any lifecycle boundary, is refused.
4. Reject overlap with an existing departure bracket, an unpaired interruption,
   a partial existing repair, or any timing-row ambiguity inside the interval.
5. Detect an exact existing `pause:retroactive`/`resumed` pair as idempotently
   applied.
6. Insert two zero-value rows chronologically. Both rows inherit the last known
   word/full-word markers and timestamp offset at their insertion point; callers
   cannot provide active, idle, or word deltas.
7. Reconcile any completed phase cache by calling the existing
   `recomputeCompletedRows` transform.
8. Recompute `computeActiveByPhaseSpans` and accept the candidate only when one
   phase loses exactly the interval duration from active seconds, gains exactly
   that duration in idle seconds, and total elapsed seconds is unchanged.

The pure result includes the intended body, phase event, interval seconds, and
before/after totals. It performs no I/O.

## Command transaction

`scripts/task-tracker/heal-timing-interval.mjs` owns strict command behavior:

- Required: one issue number, `--start <timestamp>`, and `--end <timestamp>`.
- Default: dry-run; no comment mutation.
- Apply: `--apply` and the standard `--yes`/blast-radius contract.
- Unknown, duplicate, empty, or incomplete arguments exit with usage code 2.
- The entire read/transform/write/read-back sequence runs under the issue timing
  lock.
- A successful write is followed by a fresh timing-comment read and exact body
  comparison.
- If the update transport throws, the command re-reads once. It reports success
  only when the exact intended body is present; otherwise it surfaces the
  ambiguous failure without retrying a destructive mutation.
- Reapplying an exact pair reports `already-applied` without writing.

Dry-run and apply output both name the phase, interval seconds, and authoritative
active/idle totals before and after. This makes the accounting consequence
visible before an operator grants mutation authority.

## Command surface and documentation

The command is classified as a live maintenance/migration entrypoint and has a
detailed self-documentation record. Package-boundary and command-catalog exact
inventories are updated only for the newly shipped files and command.

## Error policy

The tool is default-deny. It writes nothing when timestamps are invalid or
reversed, configured access is unreadable, the timing comment is absent or
malformed, endpoints do not belong to one phase visit, a phase boundary or
existing bracket overlaps the interval, rows are out of chronological order,
or the authoritative accounting delta differs from the requested duration.

Malformed historical logs are not healed opportunistically. They remain under
the existing general timing-log healer and are outside this command's scope.

## Test strategy

Pure unit tests cover chronological insertion, sub-threshold active-to-idle
reclassification, completed-row reconciliation, marker/offset inheritance,
idempotency, and every refusal class. CLI tests use injected GitHub and lock
boundaries to prove dry-run no-write behavior, explicit apply authority, strict
argv, exact read-back, and ambiguous-write reconciliation.

Repository integration tests cover self-documentation, entrypoint
classification, and package inventory. Final verification runs Prettier and
lint before the complete fast and slow suites, with no overlapping broad test
processes.

## Scope boundaries

The change does not alter the transcript idle threshold, historical timing
vocabulary, normal pause/resume emission, automatic gap recovery, or unrelated
timing logs. It introduces no bulk mode and rewrites no issue other than the
single explicit target.
