# Phase 1: Artifact Lifecycle and Review-Evidence Layout

<!-- cspell:words worktree worktrees supersession byte-identical no-commit -->

## Document status

- **Date:** 2026-09-13
- **Status:** Draft for written human and peer review
- **Owner:** `ai-peer-review`
- **Issue:** [#30](https://github.com/kburson/ai-peer-review/issues/30)
- **Parent feature epic:**
  [#29](https://github.com/kburson/ai-peer-review/issues/29)
- **Phase:** 1 of 5
- **Depends on:** no child phase
- **Scope:** Design only; this document does not authorize implementation,
  migration, backlog hydration, or release

## Source authority

This specification atomically extracts Phase 1 from the accepted
[Project-Local Review Lifecycle and Learning Design](2026-09-12-project-local-review-lifecycle-and-learning-design.md).
The source artifact digest is
`sha256:0b65a538437dc2ef2bb86533e991c90b945dacb9fbc7cbe16ad277f8f709fd27`.
Its review of record remains under
`docs/peer-reviews/spec/2026-09-12-project-local-review-lifecycle-and-learning-design-review/`.

The umbrella design remains the cross-phase authority. This child may clarify
Phase 1 mechanics, but it may not weaken the umbrella guarantees. A conflict
must fail review and be resolved in writing before implementation planning.

This file uses the repository's current `docs/design` convention because the
new lifecycle does not exist yet. Its later relocation, if any, must occur only
through the explicit migration designed here.

## Summary

Phase 1 creates the durable, project-local file model on which every later
phase depends. It introduces stable artifact identity, proposed and approved
locations for canonical specifications and plans, tracked compact review
evidence under `.peer-review`, package-generated revision patches, immutable
terminal records, deterministic human indexes, and explicit migration of
legacy collateral.

The phase preserves one complete File Under Review, abbreviated FUR, in each
commit. Review directories contain evidence about that file, never another
complete canonical-looking copy. Delivery is recorded as metadata and never
moves an approved artifact again.

## Goals

- Make proposal, approval, delivery, abandonment, and supersession legible.
- Give every governed specification and plan stable identity and lineage.
- Keep exactly one complete FUR in each commit.
- Preserve each accepted revision as a digest-verified patch and response pair.
- Make completed review evidence durable outside ignored scratch storage.
- Preserve current reviewer isolation and exact-path Git transaction behavior.
- Keep no-commit tests completely outside production lifecycle authority.
- Migrate legacy evidence only through a dry-run-first, receipt-backed command.

## Non-goals

- Moving live protocol coordination into SQLite; Phase 2 owns that change.
- Loading knowledge into prompts; Phase 3 owns retrieval.
- Creating lessons from defects; Phase 4 owns learning governance.
- Running provider-comparison worktrees; Phase 5 owns experiments.
- Modifying Superpowers or making AITM the storage owner.
- Making generated indexes or a database authoritative.
- Reconstructing arbitrary historical artifacts after Git object loss.

## Required repository layout

Project setup may explicitly enable this tracked layout:

```text
.peer-review/
├── config.json
├── artifacts/YYYY/MM/<artifact-id>.json
├── reviews/YYYY/MM/<review-id>/
│   ├── review-manifest.json
│   ├── author-handoff.md
│   ├── reviewer-invitation.md
│   ├── reviewer-response-001.md
│   ├── author-response-001.md
│   ├── revision-001.patch
│   └── terminal-agreement.json
└── amendments/YYYY/MM/<amendment-id>.json

docs/superpowers/
├── INDEX.md
├── specs/
│   ├── INDEX.md
│   ├── proposed/YYYY/MM/<spec>.md
│   └── approved/YYYY/MM/<spec>.md
└── plans/
    ├── INDEX.md
    ├── proposed/YYYY/MM/<plan>.md
    └── approved/YYYY/MM/<plan>.md
```

Phase 1 reserves `.peer-review/knowledge`, `audits`, and `experiments` for later
phases but must not emit invented records into them. Setup changes only paths
owned by this package. It must not broadly rewrite `.gitignore` or relocate
legacy files.

## Artifact identity and catalog

Every governed artifact has an immutable:

- `chainId`, shared with its downstream specification, plan, and backlog chain;
- `artifactId`, unique to one specification or plan;
- `artifactKind`, either `spec` or `plan`; and
- creation event containing its first governed path and digest.

An artifact record is a closed, versioned JSON document. Its materialized view
must expose current path, append-only path history, lifecycle, disposition,
content digest, upstream and downstream artifact references, review IDs, and
delivery receipts. Plans inherit the specification's `chainId` and cite its
`artifactId`.

Lifecycle and disposition remain separate:

```text
lifecycle:   proposed -> approved -> delivered
disposition: active | abandoned | superseded
```

`delivered` is metadata on an approved artifact. Abandonment and supersession
append facts without erasing earlier approval or delivery. A substantive change
to approved bytes requires a new `artifactId`, a new proposed path, the same
`chainId`, and `supersedesArtifactId`.

Dates and filenames organize storage; opaque IDs and SHA-256 digests establish
identity. Unknown schema fields, duplicate IDs with different bytes, path
escape, and catalog/path digest drift fail closed.

## Lifecycle operations

### Project setup

Setup adds the closed configuration and owned directories only after explicit
user selection. An unconfigured repository retains today's behavior and paths.
Setup validates repository containment, collision freedom, and Git state before
writing. Re-running an identical setup is idempotent.

### Intake

Review intake accepts one explicit artifact path and never guesses by scanning.
In normal commit mode it:

1. verifies the artifact is tracked, committed, clean, and contained;
2. assigns or resolves stable artifact and chain IDs;
3. moves an eligible root Superpowers artifact into the date-sharded
   `proposed` directory through an exact-path Git transaction;
4. writes its catalog record and deterministic indexes;
5. commits the exact intake bundle; and
6. binds the review to the resulting path, blob, commit, and digest.

An artifact already in `proposed` stays in place. An artifact outside the
configured lifecycle may be reviewed without an implied move. Intake of an
approved or delivered artifact fails with `APR_ARTIFACT_ALREADY_APPROVED` when
bytes match and `APR_APPROVED_ARTIFACT_CHANGED` when they drift. Recovery is to
create an explicit successor, never to edit the approved file.

### Author revision

The author edits the proposed FUR in place. For every submitted revision the
package:

1. verifies the prior authoritative digest;
2. reads the updated canonical file;
3. generates a deterministic unified diff;
4. applies the patch to prior bytes in isolation and verifies the result digest;
5. atomically creates the next numbered patch without replacement;
6. seals response paths and digests beside the patch receipt; and
7. creates evidence commit `C1`, then manifest-checkpoint commit `C2`.

The manifest records `C1`; it cannot claim its own `C2` hash. A later monotonic
checkpoint or amendment may cite `C2`. The review directory never stores a
complete copy of the FUR.

### Approval and delivery

Reviewer acceptance makes the current digest eligible for author finalization.
Finalization re-verifies that digest, moves the same file from `proposed` to
`approved`, records immutable terminal evidence and catalog history, regenerates
indexes, and commits one exact bundle. Proposed and approved copies may not
coexist in a commit.

Delivery appends a verified planning or hydration receipt. It does not move the
approved file. The receipt includes host, target IDs, paths, commits, digests,
and time while treating external identifiers as opaque values.

### Terminal amendments

Acceptance, override, and abandonment seal every existing review file.
Corrections append a new closed-schema amendment referencing the `reviewId`,
affected receipt, reason, actor, authority evidence, and replacement value.
Readers materialize original evidence plus applicable amendments; no command
rewrites a terminal file.

## Review manifest checkpoints and recovery

The manifest is created at intake and advances monotonically through `writing`,
`written`, and `verified` operation states. It records expected paths, operation
IDs, digests, commits, and predecessor relationships.

Recovery compares the manifest, filesystem, Git tree, and pending operation:

- complete identical work is reused idempotently;
- a complete `C1` may receive its exact planned `C2` checkpoint;
- missing or partial output remains preserved and needs attention; and
- conflicting bytes, receipts, or pre-existing destinations fail closed.

Phase 1 continues to use the current scratch event authority for live protocol
coordination. Durable Phase 1 files are designed so Phase 2 can reconstruct
completed state before retiring scratch authority for new reviews.

## No-commit contract

No-commit test mode performs no lifecycle mutation. It must not:

- move or rename the FUR;
- write production artifact, lifecycle, or delivery records;
- regenerate tracked indexes;
- create a Git commit;
- change `HEAD` or the index; or
- expose its result as approved or delivered.

It may retain transient snapshots and explicitly labeled test responses,
patches, agreement, and manifest output required by the existing test protocol.
Its terminal state is `accepted-uncommitted`. Production readers ignore it.

## Human indexes

`docs/superpowers/INDEX.md` and kind-specific indexes are deterministic catalog
projections, never authority. They group current records into Needs attention,
Ready for planning, Planning in progress, Ready for backlog, Delivered, and
Inactive. Each row carries the authoritative digest and links the chain,
artifact, review, downstream receipt, and current path.

Generation sorts by stable documented keys. CI regenerates and compares the
files byte-for-byte. A current path whose bytes disagree with the catalog is a
needs-attention error, not an opportunity to update the digest silently.

## Legacy migration

The migration command accepts an explicit legacy root or review selection and
defaults to dry run. Its plan enumerates every source, destination, digest,
collision, and intended relocation receipt. Apply mode must:

- refuse active legacy reviews;
- acquire the repository mutation boundary used by review commits;
- preserve every migrated file byte-for-byte;
- refuse destination collisions, including identical-looking ambiguity;
- write a tracked relocation receipt rather than rewriting historical paths;
- verify the resulting Git tree and digests before commit; and
- be idempotent when the same verified receipt already exists.

Legacy reviews may finish under their original contract. Project setup never
runs migration implicitly.

## Implementation seams

The plan should prefer focused modules rather than enlarging protocol service
code indiscriminately:

- lifecycle configuration and closed schemas;
- artifact catalog parsing, validation, and materialization;
- deterministic index rendering;
- intake, approval, successor, delivery, and disposition services;
- patch generation and verification;
- review-manifest checkpointing and amendments;
- legacy migration planning and application; and
- CLI adapters that call these services without owning policy.

Existing `src/git/repository.mjs`, `src/git/transaction.mjs`,
`src/collateral/paths.mjs`, `src/protocol/service.mjs`, and
`src/collateral/review-record.mjs` are compatibility seams, not permission to
mix all new behavior into one module.

## Verification strategy

The Phase 1 plan must cover:

- closed-schema validation, canonical JSON, collision, and path containment;
- root-to-proposed intake and proposed-to-approved finalization;
- one-FUR invariants, path history, successor immutability, and delivery metadata;
- deterministic patches for Unicode, empty files, newline edges, and renames;
- stale, malformed, overlapping, or pre-existing patch refusal;
- `C1`/`C2` interruption and idempotent reconciliation;
- no-commit `HEAD`, index, path, catalog, and readiness invariants;
- deterministic index generation and drift detection;
- legacy dry run, collision, byte preservation, receipt, and retry behavior; and
- retained golden parity for today's normal and no-commit reviews.

The issue-level targeted verifier is
`test/integration/project-lifecycle-layout.test.mjs`; the plan may decompose it
into smaller unit and integration files while retaining the named acceptance
probes in #30.

## Acceptance criteria

Phase 1 is ready for implementation planning when peer review agrees that:

1. setup is explicit and leaves unconfigured repositories unchanged;
2. identity, lifecycle, disposition, and lineage have one closed authority model;
3. normal intake and approval preserve exactly one complete canonical FUR;
4. every author revision produces digest-verified compact evidence;
5. terminal records are immutable and corrections are append-only;
6. approved delivery is metadata and later edits require a successor;
7. no-commit mode changes no production or Git authority;
8. human indexes are deterministic, digest-bound projections; and
9. legacy migration is explicit, byte-preserving, collision-safe, and receipted.

## Final decision

Phase 1 owns the durable artifact and evidence filesystem contract. It must land
before any later phase treats SQLite, learned knowledge, defect assessment, or
experiments as available. Later phases may add records and projections but may
not redefine canonical artifact bytes, lifecycle authority, terminal
immutability, or no-commit isolation.
