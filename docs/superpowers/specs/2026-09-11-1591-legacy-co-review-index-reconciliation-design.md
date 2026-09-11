# Legacy Co-review Index Reconciliation Design

## Context

The legacy co-review runtime projects protocol state into the main checkout's
`.tmp/aitm/fleet/co-review-index.json`. The package-migration guard treats every
row whose `lifecycle` is `active` as authoritative and refuses runtime removal.
That fail-closed behavior is correct, but the index has no governed way to
retire residue after isolated test directories or historical worktrees are
removed.

The live inventory observed during #1591's deep dive contains 28,974 rows:
14,653 active, 13,566 accepted, and 755 intervention-required. None of the
active rows has an existing runtime or worktree. Path disappearance is only an
observation, so it cannot by itself authorize removal.

## Goals

- Account deterministically for every index row and expose the evidence used
  to classify it.
- Remove only active projection rows that durable evidence proves are test
  residue or obsolete attempts superseded by a valid terminal archive.
- Preserve live, unresolved, terminal, malformed, and ambiguous rows.
- Reconcile under the existing index lock with an append-only, replay-safe
  journal.
- Prove that tracked legacy archives are byte-identical before and after the
  operation.
- Let the package-migration guard advance from its active-row refusal to its
  existing production-consumer refusal.

## Non-goals

- Do not remove `npx aitm co-review`, `scripts/review/**`, or any production
  consumer; #1592 owns decommission.
- Do not create or alter protocol events, terminal archives, delivery receipts,
  or GitHub authority.
- Do not translate legacy archives into the `ai-peer-review` schema.
- Do not infer acceptance or abandonment from a missing path.
- Do not change `ai-peer-review` package behavior.

## Considered Approaches

### Deterministic evidence classifier and journaled removal

This is the selected approach. A pure inventory classifies every row from a
conjunction of evidence signals. An apply phase removes only proven stale
active projections while recording the original rows and evidence in an
append-only journal. It is bounded, auditable, and preserves fail-closed
behavior for every unresolved row.

### Remove all rows whose runtime path is absent

This would be small, but it would turn missing local files into lifecycle
authority. A worktree can be temporarily unavailable, moved, or restored, so
the approach violates the issue's central safety requirement.

### Reconstruct terminal archives for missing protocols

This would manufacture evidence that no longer exists. The reconciliation
must consume durable authority, never create acceptance or abandonment on
behalf of the historical protocol.

## Architecture

### Inventory and classification

`scripts/review/lib/reconciliation.mjs` reads the index and returns records in
protocol-ID order. Every inventory record contains:

- the protocol ID and original lifecycle;
- the source category;
- normalized runtime and worktree paths;
- booleans for runtime and worktree existence;
- lifecycle evidence, including validated archive identity when applicable;
- a disposition and a human-readable reason.

The classifier uses these dispositions:

- `retain-terminal`: the index lifecycle is already accepted, abandoned, or
  intervention-required;
- `retain-live`: the runtime exists and `statusProtocol` confirms the same
  protocol ID, active lifecycle, and valid integrity;
- `remove-test-residue`: all of the following agree: lifecycle is active,
  runtime and worktree are absent, artifact is exactly `docs/artifact.md`, the
  owner/reviewer pair is one of the repository's test-only pairs, and the path
  is inside a recognized `.tmp/test`, `.scratch/test`, or
  `.scratch/.task-test-*` sandbox;
- `remove-inspection-probe`: lifecycle is active, paths are absent, identities
  are exactly `owner-probe` and `reviewer-probe`, and the runtime is inside a
  recognized `.tmp/inspect/*/runtime` directory;
- `remove-superseded-attempt`: lifecycle is active, paths are absent, and a
  tracked accepted archive manifest for the exact artifact path names a
  different protocol ID whose index row is already terminal, then points to an
  exact accepted commit object whose blob and SHA-256 match the manifest;
- `retain-unresolved`: any other active or malformed evidence combination.

No single path, identity, or artifact signal is sufficient. Live runtime
evidence always wins over stale-pattern evidence.

### Archive evidence

The reconciler enumerates tracked `docs/superpowers/reviews/*/*/README.md`
manifests. It requires the manifest protocol ID to name an already-terminal
index row for the exact artifact, verifies the exact accepted commit object
still resolves, reads the artifact at that commit, and compares both its Git
blob and SHA-256 to the manifest. The commit need not be an ancestor of `HEAD`:
governed squash delivery deliberately changes ancestry while the tracked
archive remains terminal authority. Historical archive evidence bytes are
snapshotted and preserved rather than silently repaired; their pre-existing
internal digest status does not get rewritten or represented as newly valid.
Archives are indexed by exact `artifact.sourcePath`. Ambiguous multiple valid
terminal records are deterministic only when one is latest by accepted
timestamp; otherwise the row remains unresolved.

Before apply, the reconciler hashes every tracked file beneath
`docs/superpowers/reviews`. It repeats the snapshot after the index rewrite and
requires exact path and digest equality. The snapshots are recorded in the
journal; the archive tree itself is never opened for writing.

### Journal and interruption recovery

The default journal is
`.tmp/aitm/fleet/co-review-index-reconciliation.jsonl` in the main checkout.
It is local durable operational evidence, not a generated Git artifact. Each
line uses schema `aitm.co-review-index-reconciliation/v1`.

An operation ID is the SHA-256 of the canonical before-index digest, ordered
removal records, ordered unresolved records, and archive snapshot. Apply holds
the same `.lock` directory used by normal index mutations and performs:

1. Re-read and classify the locked index.
2. Append and sync one `prepared` record containing every row selected for
   removal, its original bytes as parsed data, evidence, blockers, expected
   after-index digest, and the before archive snapshot.
3. Atomically write and rename the index with only selected protocol IDs
   removed.
4. Re-hash archives and refuse if any path or digest changed.
5. Append and sync one `applied` record with before/after index digests and the
   verified after archive snapshot.

On retry, a matching prepared operation is recovered instead of duplicated.
If the index still matches the before digest, apply finishes the rewrite. If it
already matches the expected after digest, apply records the missing applied
line. Any third digest is a conflict and remains fail-closed. A completed
operation with the same after digest returns unchanged. Newly accumulated rows
produce a new operation rather than mutating old journal entries.

### Command surface

`scripts/review/reconcile-legacy-index.mjs` supports three explicit modes:

- no flag: inspect and print a compact inventory summary without mutation;
- `--apply`: perform the journaled reconciliation and print before/after
  counts, operation ID, removal categories, blockers, and archive summary;
- `--verify`: require no active rows, validate the latest applied journal
  against the current index and archive snapshot, then run the existing
  migration guard. Reaching the known production-consumer refusal is success;
  an active-row refusal or any other guard outcome is failure.

Optional `--index-file`, `--journal-file`, and `--project-dir` parameters exist
only to isolate integration fixtures. Production defaults always resolve the
main-worktree authority paths.

## Error Handling

- An unreadable or shape-invalid index aborts before journal mutation.
- An unreadable or invalid archive can never authorize removal; the associated
  active row remains unresolved.
- Lock contention times out through the existing fleet-registry lock contract
  without changing the index or journal.
- A journal whose schema, operation digest, or before/after relationship is
  invalid aborts recovery.
- Archive drift aborts before an applied record and is surfaced as a hard
  conflict.
- `--verify` lists unresolved protocol IDs in deterministic order and exits
  nonzero.

## Testing

The focused integration suite creates isolated index, journal, Git, archive,
and runtime fixtures. It covers test sandboxes, task-test scratch roots,
inspection probes, missing historical worktrees with a valid superseding
archive, a genuinely live runtime, invalid/missing/ambiguous archive evidence,
lock contention, interruption after `prepared`, retry before and after index
rename, completed replay, and exact archive hash preservation.

The migration-guard suite proves that a reconciled fixture no longer fails on
an active row and reaches the unchanged production-consumer check. Full fast,
slow, lint, and formatting gates remain required by the issue.

## Sequencing

Issue #1591 is standalone and has no upstream dependency. It blocks #1592. After
issue #1591 is delivered, #1592 may re-run the idempotent apply immediately before
decommission so any test residue created during #1591 verification is included
in a new audited operation.
