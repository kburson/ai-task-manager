# Phased Multi-Artifact Review Sessions Design

**Issue:** #10

**Status:** Proposed for Full-Auto approval

## Context

`ai-peer-review` currently binds one `spec` or `plan` artifact at `start`, runs a two-participant review loop, and makes reviewer acceptance terminal only after author-owned finalization. That is the right authority model for one artifact, but it forces a fresh review identity, reviewer join, and operator relay when a plan should be reviewed immediately after its specification.

The migrated #1377 draft proposed phases and a participant liveness beacon. The phase model remains useful; the beacon does not. Resident waiting, token-free MCP waits, transport negotiation, and the #9 coordinator now provide durable activation without participant polling or transcript authority. This design extends the event ledger and current finalization/handoff transactions only.

## Goals

- Accept an ordered, immutable list of `spec` and `plan` phases while supporting either kind alone.
- Finalize each accepted artifact through the registered author and preserve phase-specific evidence.
- Advance a durable cursor after non-final acceptance and bind the next artifact through an exact author re-engagement handoff.
- Reuse the same reviewer identity and the existing coordinator wake contract across phase boundaries.
- Reconstruct the complete phase state after restart or compaction solely from validated events and transaction journals.
- Preserve legacy single-artifact bytes, projections, results, finalization, consolidation, and archive behavior when phases are omitted.

## Non-goals

- Depth-Probe, Ready-for-Planning routing, or consumption of approval stamps by another task manager.
- Liveness beacons, transcript inspection, repeated status polling, or another background coordinator.
- Automatic participant/model selection or participant replacement without existing protected authority.
- Arbitrary artifact kinds, dynamic phase insertion, phase removal, parallel phases, or phase branching.
- Per-phase maximum-turn configuration. The existing maximum is reused independently for every phase.
- Automatic construction of the next artifact. The author creates and commits or seals it before re-engagement.

## Invariants

1. `events.jsonl` and its validated projection remain the sole lifecycle and phase authority.
2. Phase kinds are an ordered, non-empty, unique list drawn only from `spec` and `plan`; the first kind equals the initial artifact kind.
3. Omission of `--phases` emits the existing `review-created` event and legacy result bytes without optional phase fields.
4. A phase cursor advances exactly once and only after the registered author completes the existing finalization transaction for a reviewer-accepted artifact.
5. Completed phase evidence is append-only. Later artifact binding cannot replace its path, blob, digest, accepted commit/snapshot, manifest, or finalization commit.
6. Only the registered author with a current claim may bind the next artifact, whose kind is derived from the phase list rather than caller-selected.
7. Review response turn numbers remain globally monotonic so collateral paths never collide. `phase_turns_used` alone resets to zero at phase entry.
8. The existing `max_turns` value is the maximum for each phase. Exhaustion enters whole-session intervention at the current cursor.
9. Final-phase acceptance uses the existing terminal events, final manifest path, status enum, and consolidation contract.
10. Every actionable cursor change has a verified delivery receipt before the #9 coordinator may wake a participant.

## Phase declaration and compatibility

`start` gains one optional flag:

```text
peer-review start <artifact> --artifact-kind <spec|plan> [--phases <kind[,kind...]>]
```

The parser preserves the comma-separated string; `parsePhaseKinds(value, initialKind)` validates canonical input and returns a frozen list. Whitespace, empty members, duplicates, unknown kinds, and first-kind mismatch fail with `APR_PHASE_INVALID` before review ID calculation or filesystem mutation.

For phased starts, deterministic review identity includes the ordered list. The initial event keeps schema `ai-peer-review.event/v1` and adds one optional closed payload property:

```json
{
  "phases": {
    "kinds": ["spec", "plan"]
  }
}
```

The event schema accepts exactly the legacy payload or the phased payload. The reducer adds a `phases` projection only for the latter. Existing logs therefore reduce to byte-identical legacy protocol objects.

Single-kind `--phases spec` and `--phases plan` are valid phased declarations but follow the normal final acceptance path because their first phase is also last. Omitting `--phases` remains the preferred compatibility form.

## Event and state model

A phased projection is closed and event-derived:

```json
{
  "kinds": ["spec", "plan"],
  "cursor": 0,
  "current_kind": "spec",
  "phase_turns_used": 0,
  "completed": []
}
```

Reviewer decision and author revision events retain their current payloads. Their phase is implicit from the cursor at the event sequence, avoiding a caller-controlled duplicate phase field. Global `turns_used` continues to identify response paths; every reviewer decision also increments `phase_turns_used`.

Four new lifecycle events cover the two commit modes:

- `phase-acceptance-committed`
- `phase-acceptance-sealed-no-commit`
- `phase-artifact-committed`
- `phase-artifact-sealed-no-commit`

The phase-acceptance payload contains the current cursor, kind, accepted artifact seal, phase-manifest seal, and finalization commit or snapshot authority. It is valid only from `author-finalization` on a non-final cursor and transitions to `awaiting-phase-artifact` with the author actionable.

The phase-artifact payload contains the next cursor, derived kind, new artifact seal, and repository boundary. It is valid only from `awaiting-phase-artifact`, must advance by exactly one, and transitions to `reviewer-turn`. It resets `phase_turns_used`, preserves global `turns_used`, replaces only the current artifact projection, and leaves completed evidence immutable.

`next_action` adds `advance-phase-artifact` for `awaiting-phase-artifact`. The existing finalization and terminal states remain unchanged on the last cursor.

## Phase finalization

`peer-review finalize <workspace>` remains the only acceptance-finalization command. It still requires the registered author identity and current claim, verifies the accepted artifact and repository boundary, appends `finalization-started`, seals deterministic evidence, and commits only exact owned paths in normal mode.

For a non-final phase, it writes a collision-free phase manifest:

```text
phase-01-spec-review-manifest.md
```

`buildPhaseManifest` reuses the current manifest evidence model but adds `phase_index`, `phase_kind`, and `phase_status: accepted`, and bounds artifact history and turns to the current phase. Its schema is `ai-peer-review.phase-manifest/v1`. It is evidence of one completed artifact, not terminal authority for the overall review.

The exact-path finalization journal remains the idempotency boundary. A crash after the commit but before the phase-acceptance event is recovered by verifying the transaction-recorded commit and manifest bytes, then appending the one missing event. A retry after the event validates and returns the existing completed-phase result.

In no-commit mode, the phase manifest and accepted snapshot are sealed without a Git commit and recorded by `phase-acceptance-sealed-no-commit`. The existing non-durable residual-risk disclosure remains visible.

## Re-engagement handoff

A new author command binds the next artifact:

```text
peer-review advance <workspace> <artifact>
```

The command accepts no artifact-kind or cursor flag. Both values come from the projection. It:

1. requires `awaiting-phase-artifact`, the registered author identity, and a current claim;
2. resolves the artifact inside the same physical repository and validates its exact tracked state or no-commit seal;
3. verifies the next cursor and refuses an already completed path/bytes substitution;
4. appends the commit-mode-specific phase-artifact event through the review mutex;
5. creates the globally next reviewer response draft;
6. writes and verifies one reviewer delivery receipt for the new revision; and
7. invokes the configured transport once, using the existing pending-delivery recovery behavior.

The operation key is derived from review ID, next cursor, artifact seal, repository boundary, and participant fingerprint. Exact retry returns or repairs the same handoff. Different bytes at the same cursor produce `APR_PHASE_CONFLICT`.

The reviewer does not rejoin. `resume` and generated handoff guidance read the new cursor, current artifact, response path, and `reviewer-submit` next action from authority.

## Turn budget and intervention

`max_turns` stays a session configuration value and applies independently to every phase. The reducer increments both total and phase counters for reviewer decisions. Budget checks compare `phase_turns_used` with `max_turns`; global numbering is used only for ordering and filenames.

Turn-budget exhaustion, stale claim, participant loss, protected continuation, replacement, abandonment, and supersession remain whole-session operations. Intervention records the current cursor in the projection by virtue of event sequence, not an additional caller field. Continuing returns to the interrupted role in the same phase. Earlier completed phases remain immutable; no command can advance around intervention.

## Coordinator and transport integration

No new wake adapter is added. Non-final phase finalization writes a verified author delivery at its new revision; next-artifact binding writes a verified reviewer delivery at its new revision. `decideWake` therefore continues to derive the participant from `current_actor`, require a matching delivery receipt, and emit only the pointer capsule:

```text
peer-review resume <absolute-workspace>
```

The capsule does not carry artifact prose, manifest bytes, phase content, or provider state. Manual and resume-only transports retain one bounded `status --next` fallback. Active durable coordination suppresses participant polling exactly as delivered by #9.

## Status, help, and public API

Phased status/results add a `phases` object only when phased authority exists. `status --next` renders `peer-review advance <workspace> <artifact>` as an author template with an explicit artifact placeholder during `awaiting-phase-artifact`; other states retain their current exact commands.

The closed parser, command catalog, help data, generated templates, skill, README, schemas, and golden hashes all describe `--phases` and `advance`. The public API exports phase parsing/projection helpers and phase-manifest construction for provider-neutral embedding.

## Failure behavior

- `APR_PHASE_INVALID`: noncanonical declaration, invalid kind/order, duplicate, or initial mismatch; no review created.
- `APR_PHASE_CONFLICT`: an existing cursor is bound to different artifact or repository authority; preserve the workspace and inspect events.
- `APR_INVALID_TRANSITION`: finalization/advance invoked from the wrong state or cursor.
- Existing artifact, identity, claim, Git recovery, delivery, transport, reviewer-boundary, and event-integrity failures pass through unchanged.

No failure permits cursor skipping, participant inference, event rewriting, blind transport retry, or fallback to transcript state.

## Testing strategy

Unit tests close every new payload and projection shape, mutate cursor/kind/artifact evidence, prove per-phase budget reset with monotonic global turns, validate manifest/path collision resistance, and enforce CLI/help closure.

`test/integration/phased-review.test.mjs` covers normal and no-commit `spec,plan` sessions, single-kind phased sessions, omitted-option legacy parity, non-final finalization, re-engagement delivery, final terminal acceptance, restart/exact retry, wrong-author and wrong-artifact refusals, intervention preservation, and coordinator wake selection. Existing unit, golden, integration, MCP, packaging, smoke, lint, format, and pack lanes remain required.

## Delivery

The change ships as one governed PR because schemas, reducer transitions, finalization, handoff delivery, and operator guidance must land atomically. #9 is delivered and closed; no current open issue blocks #10.
