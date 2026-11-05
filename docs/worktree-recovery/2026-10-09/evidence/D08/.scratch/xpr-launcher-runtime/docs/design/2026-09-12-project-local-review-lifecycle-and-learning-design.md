# Project-Local Review Lifecycle and Learning Design

<!-- cspell:words worktree worktrees SQLite FUR append-only supersession reranker unauditable materializer checkpointed unredacted reconstructable transactionally rescanning -->

## Document status

- **Date:** 2026-09-12
- **Status:** Draft for written human and peer review
- **Owner:** `ai-peer-review`
- **Scope:** Design only; this document does not authorize implementation,
  migration, backlog creation, or publication
- **Related designs:**
  [standalone extraction](2026-09-07-ai-peer-review-extraction-design.md) and
  [provider-neutral runtime orchestration](2026-09-11-provider-neutral-runtime-orchestration-design.md)

## Summary

Extend `ai-peer-review` into a project-local review lifecycle and learning
system without coupling it to AI Task Manager or changing Superpowers itself.
Each consuming repository owns its review evidence and learned knowledge because
its design context, code, constraints, and defects are specific to that project.

The design separates four concerns:

1. canonical human-authored specifications and plans remain under
   `docs/superpowers`;
2. tracked review evidence, artifact metadata, defect assessments, and learning
   records move under a repository-root `.peer-review` directory;
3. one disposable SQLite database per local Git clone provides fast knowledge
   retrieval and live review coordination across all linked worktrees; and
4. a bounded context compiler loads stable policy plus relevant accepted lessons
   into each peer-review session.

The tracked learning corpus is an append-only, schema-validated JSON event
ledger. SQLite is only a local materialized view. A review may use only accepted
lessons present in the reviewing worktree's committed `HEAD`. Every review pins
the exact knowledge snapshot it used. Losing SQLite may interrupt active
provider sessions, but must never destroy durably completed review evidence or
make a durably completed review unauditable.

This design also introduces provider-comparison experiments. Two or more review
pairings may review the same committed artifact from isolated worktrees at an
identical baseline. The experiment retains responses, patches, manifests, and a
blind comparison without keeping duplicate complete artifact versions in the
canonical project tree.

## Problem

Long-lived projects accumulate dozens or hundreds of specifications, plans, and
review-response files. Flat `docs/superpowers/specs`, `plans`, and `reviews`
directories do not reliably answer:

- Which design documents are still proposals?
- Which specifications are approved and ready for planning?
- Which plans are approved and ready for backlog hydration?
- Which approved artifacts were delivered downstream?
- Which specification produced a plan and which plan produced a backlog item?
- What did the reviewing agents see, recommend, reject, and change?
- Which later defects were preventable review escapes?
- Which learned lessons should influence the next review?

Git history preserves content but is not an efficient operational index. Squash
merges may also remove the individual artifact revisions from the delivered
branch even when response files survive. Storing a complete artifact copy for
every review turn would retain those versions, but would create duplicate
canonical-looking files and increase the risk that humans or agents choose the
wrong file.

The existing standalone package stores protocol authority and artifact
snapshots under ignored `.scratch/peer-review` paths and writes human-readable
collateral under `docs/peer-reviews`. That model was appropriate for extraction,
but it does not provide a project-local learning corpus, durable per-turn patch
evidence, an artifact lifecycle catalog, or efficient cross-worktree retrieval.

## Goals

- Keep one complete canonical File Under Review in each Git commit.
- Separate proposed specifications and plans from approved artifacts without
  modifying the Superpowers skills that originally create them.
- Record delivery to planning or backlog as downstream metadata, not another
  file move.
- Give humans deterministic indexes that expose unattended, approved, and
  delivered work without scanning every document.
- Keep responses, patches, manifests, and review-learning data outside the
  human documentation tree.
- Preserve per-turn changes as compact patch evidence that survives squash
  integration.
- Link specification, plan, backlog, implementation, defect, and review
  evidence through stable identifiers.
- Build a project-local body of review knowledge that teams and ephemeral
  environments share through Git.
- Load only applicable, accepted knowledge into a review and record exactly
  what was loaded.
- Permit automated learning while preventing a review pair from approving its
  own proposed lesson.
- Prefer cross-provider evaluation while supporting organizations restricted to
  one provider.
- Compare provider pairings against identical artifacts and knowledge inputs.
- Preserve current reviewer non-mutation, exact-path Git transaction,
  provider-identity, human-authority, and fail-closed recovery guarantees.

## Non-goals

- Modifying or forking the upstream Superpowers brainstorming, writing-plans,
  or executing-plans skills.
- Making AI Task Manager the owner of peer-review storage or learned knowledge.
- Automatically exporting project-specific knowledge to another repository,
  provider, hosted service, or telemetry system.
- Treating every review comment or every defect as a reusable lesson.
- Treating the absence of a reported defect as proof that a review was good.
- Training or fine-tuning a foundation model in the first implementation.
- Making an embedding index, vector database, or SQLite file durable authority.
- Retaining a complete copy of the FUR in a tracked review directory.
- Guaranteeing artifact reconstruction from patch files after arbitrary history
  rewriting. Patches are audit evidence, not backup storage.
- Blocking artifact delivery because a candidate lesson is waiting for an
  independent learning evaluation.
- Requiring provider diversity when policy, contract, privacy, availability, or
  cost restricts the user to one provider.
- Automatically selecting or delivering an experimental artifact variant.

## Definitions

### File Under Review

The File Under Review, abbreviated FUR, is the one complete canonical artifact
being reviewed. It is updated in place during review. It may move once from a
`proposed` path to an `approved` path at terminal acceptance, but it is never
copied into its review-evidence directory.

### Artifact chain

The lineage connecting a specification, its plan, downstream backlog records,
implementation, and later defects. An immutable `chainId` identifies the
lineage. Each specification and plan also has its own immutable `artifactId`.

### Lifecycle state

The forward readiness of a specification or plan:

- `proposed`: not yet accepted for the next process;
- `approved`: accepted and ready for the next process; and
- `delivered`: an approved artifact has a verified downstream receipt.

`Delivered` is a metadata state. The file remains in its `approved` directory.

### Disposition

An independent description of whether an artifact remains actionable:

- `active`;
- `abandoned`; or
- `superseded`.

Lifecycle and disposition are separate so an approved historical artifact can
later be superseded without falsifying its prior approval.

### Review evidence

The tracked invitation, handoff, reviewer responses, author responses, patches,
terminal agreement, and manifest that explain how a review progressed.

### Observation

A factual record produced by a review, experiment, or defect assessment.
Observations are retained for audit and future analysis but do not directly
change review prompts.

### Candidate lesson

A generalized failure pattern and proposed review obligation derived from
evidence. It is excluded from active review context until independently
accepted.

### Accepted lesson

A candidate approved by an independent evaluator or human authority. Only an
accepted lesson may influence a later peer-review prompt.

### Knowledge snapshot

The exact committed knowledge tree, active policy versions, accepted events,
scope overlays, retrieval configuration, and selected cases made available to
one review. A snapshot is pinned for the complete review, including all
revisions.

### Review experiment

A non-delivery comparison in which isolated review arms start from the same
artifact blob, knowledge snapshot, instructions, and budgets while varying a
declared provider or model pairing.

## Alternatives considered

### One tracked JSON or JSONL database

A single file is simple initially, but every review and defect would modify the
same path. Concurrent branches would conflict, partial appends would threaten
the complete dataset, and reads would eventually require repeated full scans.
This option is rejected.

### A tracked SQLite or vector database

This gives efficient queries but produces opaque Git diffs, poor merges, and
platform-specific binary churn. A corrupted or incompatible database would
also threaten the durable record. This option is rejected.

### A hosted central learning service

This could support large-scale training and cross-project analytics, but it
would weaken repository ownership, offline operation, project privacy, and
commit-pinned reproducibility. It is outside the package's provider-neutral
local-first boundary. This option is rejected for the canonical system.

### Selected hybrid

Use immutable JSON events in Git as durable authority, one clone-scoped SQLite
database as a disposable projection and session store, and bounded compiled
Markdown as agent context. This gives auditable collaboration, efficient local
CRUD and retrieval, and a clean future training dataset without making a model
or index authoritative.

## Repository layout

The target layout in a consuming project is:

```text
<repository-root>/
├── .peer-review/
│   ├── config.json
│   ├── artifacts/
│   │   └── YYYY/MM/<artifact-id>.json
│   ├── reviews/
│   │   └── YYYY/MM/<review-id>/
│   │       ├── review-manifest.json
│   │       ├── author-handoff.md
│   │       ├── reviewer-invitation.md
│   │       ├── reviewer-response-001.md
│   │       ├── author-response-001.md
│   │       ├── revision-001.patch
│   │       └── terminal-agreement.json
│   ├── amendments/
│   │   └── YYYY/MM/<amendment-id>.json
│   ├── audits/
│   │   └── YYYY/MM/<audit-id>/
│   │       ├── assessment.json
│   │       └── assessment.md
│   ├── experiments/
│   │   └── YYYY/MM/<experiment-id>/
│   │       ├── experiment-manifest.json
│   │       ├── arm-a-result.json
│   │       ├── arm-b-result.json
│   │       └── comparison.json
│   └── knowledge/
│       ├── schemas/
│       ├── ledger/YYYY/MM/<event-id>.json
│       ├── policies/<policy-id>.md
│       └── scopes/<scope-id>.json
│
└── docs/superpowers/
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

All `.peer-review` paths shown above are tracked. The SQLite database does not
live in a worktree and is never tracked. The package resolves the Git common
administrative directory and stores the clone-local database at:

```text
<git-common-dir>/peer-review/peer-review.sqlite
```

SQLite journal and shared-memory files use the same directory. The package
creates it with restrictive local permissions. A normal clone has one database;
all linked worktrees belonging to that clone share it. Another clone or an
ephemeral environment creates and hydrates its own database.

Date sharding keeps directories bounded. Dates and filenames are organizational
only; opaque IDs and content digests are authority.

## Ownership boundaries

### `ai-peer-review`

The standalone package owns:

- review intake, review protocol, and terminal finalization;
- FUR patch generation and verification;
- review evidence and manifest schemas;
- artifact IDs, path-history receipts, and lifecycle projections;
- the project-local learning ledger and knowledge materializer;
- review-time context retrieval;
- defect-to-review assessment records;
- independent candidate-lesson evaluation; and
- provider-comparison experiments.

### Superpowers

Superpowers continues to create specifications and plans using its ordinary
document paths and explicit artifact arguments. Peer-review normalizes a
submitted artifact before review and moves an accepted artifact afterward.
Superpowers does not read review directories or select artifact versions.

When peer-review is not used, Superpowers behavior does not change and the user
may organize documents manually.

### AI Task Manager and other backlog hosts

AITM or another host owns backlog records, workflow state, hydration, delivery,
implementation, and defect issue authority. A host may provide a delivery
receipt or defect reference to `ai-peer-review`; it does not own the review
protocol or knowledge corpus.

The package treats issue identifiers and host receipts as opaque external
references. It never advances an AITM state or creates an issue implicitly.

## Artifact lifecycle and catalog

### Stable identity

Every governed specification or plan receives:

- one immutable `chainId` shared by its downstream lineage;
- one immutable `artifactId` specific to that document;
- an `artifactKind` of `spec` or `plan`;
- a current path and append-only path history;
- content digests at lifecycle transitions; and
- optional upstream and downstream artifact IDs.

Plans inherit the specification's `chainId` and identify the source
`specArtifactId`. Hydrated backlog metadata identifies the `chainId`,
`specArtifactId`, `planArtifactId`, paths, commits, and digests.

### Intake

Peer-review accepts one explicit artifact path and never scans a directory to
guess which file should be reviewed.

In normal commit mode, if a submitted Superpowers artifact is still directly
under `docs/superpowers/specs` or `docs/superpowers/plans`, author-side intake
moves it to the matching date-sharded `proposed` directory before binding the
review. The move uses an exact-path Git transaction and receives a path-history
receipt. The review begins only after the moved artifact is committed and clean.

No-commit test mode never performs intake movement. It binds the FUR at the
explicit original path and records any proposed lifecycle projection only in
the transient review state. It does not write a production catalog event or
regenerate a human index.

An artifact already under `proposed` is used in place. An artifact outside the
configured Superpowers lifecycle may still be reviewed, but no lifecycle move
is implied. An approved or delivered artifact path is not valid intake for a
new review: matching recorded bytes fail with `APR_ARTIFACT_ALREADY_APPROVED`,
and digest drift fails with `APR_APPROVED_ARTIFACT_CHANGED`. Both recoveries
direct the author to create an explicit successor under `proposed`.

### Review revisions

The author updates the proposed FUR in place. No complete copy is written under
`.peer-review/reviews`. Each author revision produces a tracked patch from the
previous authoritative artifact state to the new state.

For normal commit mode, the previous Git blob supplies the before bytes. For
no-commit test mode, the package may retain transient artifact bytes as a BLOB
inside SQLite. Loss of that transient state may interrupt the no-commit test;
no-commit evidence remains explicitly non-durable.

### Approval

Reviewer acceptance makes the artifact eligible for approval. Author
finalization verifies that the accepted digest is current, moves the same FUR
from `proposed` to `approved`, records the move and accepted digest, writes the
terminal agreement and manifest, and commits the exact finalization bundle.

There is never a proposed and approved complete copy of the same artifact in one
commit.

In no-commit test mode, finalization does not move the FUR, create a Git commit,
write a production catalog event, or regenerate an index. It may retain the
existing uncommitted response, patch, agreement, and manifest outputs required
by the test protocol, all labeled `NO-COMMIT TEST MODE`. The terminal state is
`accepted-uncommitted`, which has no production approval or delivery effect.
Production catalog readers and downstream consumers consider only committed
normal-mode lifecycle events.

### Delivery

Delivery never moves the file again. A specification becomes delivered when a
verified planning receipt identifies the downstream plan. A plan becomes
delivered when a verified hydration receipt identifies its backlog item or
items. The artifact catalog retains the receipt, time, host, target IDs,
commits, and digests.

The approved path therefore remains a stable source for downstream references.

### Post-approval changes

An approved or delivered artifact is immutable at its recorded path and digest.
A substantive change requires a successor with a new `artifactId`, a distinct
proposed path, the same `chainId`, and a `supersedesArtifactId` link to the prior
artifact. The predecessor's approval and delivery receipts remain historical
facts and its stable path remains byte-identical.

Within a chain, current readiness always points to one explicitly approved
artifact ID and digest. Until a successor is approved, the predecessor remains
current. After successor approval, indexes and downstream consumers expose the
successor's readiness while retaining the predecessor under historical delivery
or supersession. A catalog/path digest mismatch is a fail-closed needs-attention
condition; it never silently changes which bytes are approved or delivered.

### Disposition

Abandonment and supersession append catalog events. They do not rewrite prior
approval or delivery facts. A supersession record must identify the replacing
artifact or explicitly state that no replacement exists.

### Human indexes

`docs/superpowers/INDEX.md` and the kind-specific indexes are deterministic
projections of artifact records. They are not authority. Generation groups
artifacts into:

- Needs attention;
- Ready for planning;
- Planning in progress;
- Ready for backlog;
- Delivered; and
- Inactive, including abandoned and superseded artifacts.

Each row shows the chain and links specification, plan, backlog receipt, current
artifact path, and latest review manifest. Regeneration must be deterministic,
and CI rejects index drift. Current-readiness rows include the authoritative
artifact digest and refuse to project a path whose bytes do not match it.

## Review evidence model

### Review directory

Every review has one date-sharded directory keyed by an immutable `reviewId`.
Artifact filenames and paths do not determine review identity because they may
change during finalization.

Tracked review files are limited to material useful for handoff or audit:

- author handoff;
- reviewer invitation;
- reviewer responses;
- author responses;
- per-revision patches;
- terminal agreement; and
- review manifest.

Process handles, leases, retries, cached context, temporary snapshots, and
intermediate projections remain only in SQLite.

### Patch evidence

The package, not either agent, generates each patch. It must:

1. verify the prior artifact digest;
2. read the updated FUR from its canonical path;
3. generate a deterministic unified diff;
4. verify that the patch applies to the prior bytes and produces the new digest;
5. atomically write the patch without replacing an existing file; and
6. seal the patch path and digest beside both response receipts in the manifest.

The review manifest records for each revision:

- prior and resulting FUR paths and digests;
- prior Git commit and blob when available;
- reviewer-response path and digest;
- author-response path and digest;
- patch path and digest;
- finding IDs and dispositions; and
- the prior commit containing the artifact, responses, patch, and other evidence
  to which the manifest checkpoint refers.

Commit receipts use explicit predecessor ordering; a manifest never claims to
contain the hash of its own commit. For a normal revision, the package first
creates evidence commit `C1` containing the verified FUR transition, responses,
and patch. It then writes a manifest checkpoint that records `C1` and commits
that checkpoint as `C2`. Git history identifies `C2` as the commit containing
the checkpoint; `C2` may be recorded only by a later monotonic checkpoint or an
amendment, never inside its own bytes. The terminal checkpoint becomes immutable
after `C2`.

Patch files preserve the visible change associated with each review cycle after
squash integration. They are not required to reconstruct the FUR. If historical
Git objects remain reachable, a tool may reconstruct a version from the
recorded baseline and ordered patches, but failure to reconstruct does not
invalidate otherwise verified review evidence.

### Active authority and recovery

SQLite coordinates the live session, but durable files remain the authority for
anything required after database loss. The manifest is created at intake and
checkpointed after every durable milestone. Its monotonic receipts allow the
package to reconcile an interrupted filesystem or database write.

An active transition uses three local states:

- `writing`: the expected output and operation ID are reserved;
- `written`: the durable file exists and has been hashed; and
- `verified`: its receipt is checkpointed and the protocol may advance.

Filesystem and SQLite writes are not falsely presented as one atomic
transaction. On startup, reconciliation compares manifest receipts, expected
paths, file digests, Git commits, and database operations. Complete identical
work is reused idempotently. Missing, partial, or conflicting output fails
closed and preserves all bytes.

A crash after `C1` but before `C2` leaves durable evidence that is not yet a
verified manifest checkpoint. Reconciliation verifies the reserved operation,
exact `C1` tree, and expected checkpoint bytes before creating or reusing `C2`;
any mismatch enters intervention without rewriting `C1` or fabricating a
self-referential receipt.

Deleting SQLite may lose provider handles, leases, and uncommitted no-commit
snapshots. It may inconvenience or interrupt an active review, but it must not
erase a response, patch, agreement, manifest receipt, or completed audit fact.

### Terminal immutability

After terminal acceptance, override, or abandonment, every existing file in the
review directory is immutable. Later information is appended under
`.peer-review/amendments` and references the original `reviewId`, affected
receipt, reason, actor, authority evidence, and replacement value. Materialized
reads combine the original review with applicable amendments without changing
the original record.

## Project-local learning corpus

### Repository privacy and portability

Every repository builds its own corpus. Review context, architecture, defects,
and organizational constraints are treated as project-specific. The package
does not automatically merge corpora across repositories.

A team shares learning by committing and merging `.peer-review/knowledge`.
Another clone or ephemeral environment receives the corpus through ordinary Git
operations and rebuilds its local index. Any future cross-project lesson must be
an explicit curated export or package-policy change, not automatic telemetry.

### Canonical event storage

The durable corpus stores one canonical JSON object per event. Event files are
append-only: create adds a file, update adds a correcting or superseding event,
and logical deletion adds a tombstone. Existing event bytes are never edited
during normal operation.

Every event contains:

- schema version and collision-resistant `eventId`;
- event type and timestamp;
- subject case, review, audit, artifact, and chain IDs where applicable;
- source evidence paths and SHA-256 digests;
- scope and artifact-kind applicability;
- failure classification;
- proposed obligation and explicit exclusions when it is a lesson; and
- creator, evaluator, status, and supersession references as applicable.

Canonical serialization, closed JSON Schemas, path containment, and SHA-256
digests apply. Events must not contain provider credentials, private session
handles, environment secrets, or unredacted data copied from an external defect
system.

### Learning lifecycle

Knowledge evolves through append-only events:

```text
observation -> candidate lesson -> accepted lesson -> retired or superseded
```

Reviews and defect audits may create observations and candidate lessons
automatically. A candidate creator cannot approve its own candidate. An
independent evaluator receives the bounded evidence bundle and returns one of:

- `accept`;
- `reject`; or
- `needs-human`.

An unavailable evaluator leaves the candidate inactive and does not block the
review, artifact approval, delivery, or defect workflow. A human may approve,
reject, override, retire, or supersede through a separately authorized event.

### Independent evaluation

Cross-provider evaluation is preferred because it reduces correlated blind
spots. It is guidance, not a constraint. Same-provider and same-model
evaluations remain valid when they use a separate invocation, isolated context,
a distinct evaluator role, and enforced prohibition against self-approval.

Evaluation records classify diversity as:

- `cross-provider`;
- `same-provider`;
- `same-model`; or
- `human`.

The record contains exact provider, host, model, instruction-set, and context
digests. The package reports diversity without downgrading an otherwise valid
decision solely because an employer or user permits only one provider.

### Root knowledge and subsystem overlays

The root policy applies to every review. Project configuration may map explicit
repository path patterns to named subsystem scopes. A review may activate
multiple scopes when an artifact crosses boundaries.

Scope selection is deterministic and recorded in the review manifest. An
overlay augments root policy by default. Suppressing a root obligation requires
an explicit, reviewed override; a similarly named directory never activates or
disables knowledge implicitly.

### Committed authority boundary

Only accepted lessons present in the reviewing worktree's committed `HEAD` may
influence a normal review. Startup reads the knowledge tree from Git rather than
trusting uncommitted filesystem bytes. Dirty knowledge paths are reported and
excluded from the active snapshot.

SQLite may ingest uncommitted observations or candidates for local audit work,
but they are never members of a prompt-eligible committed snapshot. This rule is
encoded as `knowledgeSource: committed-head` so a future explicitly governed
source mode can be added without changing historical meaning.

## SQLite materialized view and session store

### Clone-scoped location

The package resolves `git rev-parse --git-common-dir` and maintains one database
for the complete local clone. It must not copy the database into linked
worktrees. Database records use `worktreeId`, `reviewId`, and
`knowledgeSnapshotId` rather than assuming one checkout.

The database is local and disposable. It is neither staged nor committed, and
its location under Git administrative storage prevents it from appearing as an
untracked worktree file.

### Logical tables

The first implementation requires logical equivalents of:

```text
database_metadata
ingested_events
knowledge_cases
knowledge_scopes
knowledge_snapshots
snapshot_events
knowledge_retrievals
worktrees
review_sessions
review_participants
review_turns
review_pending_actions
review_file_receipts
review_leases
```

The schema may normalize further during implementation. Its required semantic
boundary is that knowledge rows are derivable from tracked JSON and durably
completed review state is derivable from tracked review evidence. Only active
runtime handles and transient no-commit bytes are intentionally
non-reconstructable.

### Startup ingestion

Every peer-review instantiation performs knowledge synchronization before
creating the review session:

1. resolve the worktree, Git directory, common directory, and `HEAD`;
2. obtain the committed `.peer-review/knowledge` tree object ID;
3. open SQLite, validate its schema, and acquire a short clone-scoped write
   lease;
4. reuse an existing snapshot immediately when the tree object and policy
   configuration are already indexed;
5. otherwise enumerate committed event blobs, validate their schema and digest,
   and ingest missing events transactionally;
6. materialize effective cases and exact snapshot membership;
7. release the write lease; and
8. create the review session pinned to that snapshot.

`ingested_events` is the ingestion manifest. A separate untracked manifest file
is unnecessary. It records at least the event ID, relative path, Git blob ID,
content digest, schema version, and ingestion result.

If an existing event ID appears with different bytes, synchronization fails
closed because an immutable event has been rewritten. Schema incompatibility or
database corruption triggers a safe rebuild when no unrecoverable active state
would be discarded; otherwise the affected reviews enter intervention-required
state with exact recovery guidance.

A defect audit may request synchronization immediately after writing new event
files or leave them for the next review startup. Only committed accepted events
can become prompt eligible.

### Concurrency

SQLite uses write-ahead logging, short transactions, a bounded busy timeout, and
idempotent operation IDs. Provider calls and agent reasoning never hold a
database transaction open.

Several worktrees may run reviews concurrently. The database may contain events
observed on many branches, but `snapshot_events` prevents cross-branch leakage:
a review can query only event IDs that are members of its pinned committed
knowledge snapshot.

Shared-database concurrency does not authorize concurrent retained-ref
mutation. The Git common directory owns a durable coordination lease distinct
from SQLite's short write transactions. A sealed reviewer interval begins at
the instant protocol authority installs its retained-ref boundary, not when the
reviewer process later joins or resumes. Initial join captures the boundary and
registers the interval atomically while holding the clone-wide mutation lease.
Author submission performs its exact commit, captures the resulting reviewer
boundary, and registers the next interval before releasing that same lease.

Intake, author submission, finalization, migration, and experiment-arm commits
must acquire the clone-wide mutation lease and prove that no other sealed
reviewer interval is active in any linked worktree before changing a retained
ref. If one is active, the operation returns `APR_GIT_COORDINATION_BUSY` with
the exact waiting or resume action and performs no Git mutation. A reviewer
resume binds to the existing seal and never silently replaces its ref baseline.

Agent reasoning and provider calls do not hold the SQLite write lock, and
reviews may reason, edit isolated worktrees, and write row-isolated transient
state concurrently. Only the short ref-changing transaction is serialized. Its
receipt records the operation ID and exact before/after ref values. An
unexpected retained-ref change still invalidates every affected reviewer
boundary; no branch namespace beyond the existing package-defined private
checkpoint exclusion is broadly exempted. Phase 2 must deliver this contract
before advertising cross-worktree concurrency, and Phase 5 experiment arms
depend on it.

The sealed interval ends only when reviewer submission atomically validates the
boundary and advances protocol authority away from that reviewer turn, or when
a governed abandonment or participant-replacement intervention explicitly
invalidates the old seal and records its disposition. Pending delivery, a
dormant or suspended reviewer session, process loss, and an interruption after
author handoff all retain the interval. Recovery resumes against the same
boundary or enters intervention; it does not clear protection merely because no
reviewer process is resident.

Two experiment arms at the same baseline reuse one snapshot and indexed corpus
while storing separate review-session rows.

### Rebuild and cleanup

If the database is absent, an ephemeral environment rebuilds it from the
committed knowledge ledger and tracked review manifests. Database or retrieval
schema changes carry explicit versions. Incompatible derived tables may be
dropped and rebuilt without modifying tracked evidence.

A cleanup command may compact or remove completed local session rows and
derived embeddings. It must not delete tracked files, active sessions, or Git
objects.

## Agent context loading

### Two-stage context

The package does not preload the full corpus. It compiles two bounded layers:

1. **Preload:** stable root policy, artifact-kind obligations, and applicable
   subsystem overlays.
2. **Supplemental retrieval:** the highest-ranking accepted case cards relevant
   to the submitted FUR.

The default total learning-context budget is 8,000 model tokens. Root policy and
scope obligations have priority. Supplemental retrieval uses the remaining
budget and includes no more than eight cases unless project configuration sets a
smaller maximum. Truncation removes the lowest-ranked whole case; it never truncates
a case into ambiguous fragments.

### Case-card shape

Storage JSON is optimized for CRUD and validation. Agent context is compiled to
compact Markdown because it is easier for a model to interpret and generally
uses fewer tokens than repeated JSON field syntax. Each case card contains:

- the failure pattern;
- the required review obligation;
- applicability and exclusions;
- affected artifact kinds and scopes;
- confidence and acceptance basis;
- source review or defect references; and
- a stable case ID for deeper evidence retrieval.

Raw review transcripts, patches, defect bodies, and artifact content are not
preloaded. An agent may request referenced evidence when a selected case becomes
material to a finding.

### Retrieval

The initial retrieval engine uses deterministic metadata filters plus SQLite
full-text ranking. Optional embeddings remain local derived data and must record
their model and compiler versions. They may supplement lexical ranking but may
not bypass lifecycle, scope, committed-snapshot, or acceptance filters.

Every ranking input is snapshot-local. Full-text corpus statistics, document
frequencies, normalization values, embedding candidates, tie-breakers, and any
learned features must be computed only from cases in the review's pinned
snapshot and from the recorded query and configuration. Filtering a shared FTS5
ranking after scoring is insufficient because out-of-snapshot rows can change
the scores of eligible cases. An implementation may materialize a
snapshot-scoped ranking table or use a scoring method whose result is provably
independent of rows outside the snapshot.

Every review manifest records:

- package and context-compiler versions;
- knowledge source and committed tree object ID;
- policy and scope IDs and digests;
- eligible and selected case IDs;
- retrieval method and configuration;
- compiled context digest; and
- final token count.

The snapshot remains fixed for every turn of the review. New lessons committed
while a review is running become eligible only for a new review session.

### Future machine learning

The event ledger is intentionally suitable for later training of a transparent
classifier or reranker. Actual model training is deferred until the project has
enough independently accepted outcomes for held-out evaluation. A learned model
must first run in shadow mode and demonstrate improvement in relevant-finding
recall without unacceptable false-positive burden or review-cycle inflation.

No learned score may override hard policy, evidence acceptance, snapshot
membership, scope exclusions, or human authority.

## Defect feedback and review-quality audit

### Linking a defect

A defect audit accepts a host defect reference and attempts to resolve:

- `chainId`;
- `specArtifactId`;
- `planArtifactId`;
- delivery receipt and backlog reference;
- implementation commits;
- relevant tests; and
- originating review IDs.

If the defect cannot be tied to a known artifact chain and historical review,
the assessment may record that result under `.peer-review/audits`, but it must
not append a learning candidate. This prevents unrelated defects from polluting
the knowledge corpus.

### Stage attribution

The audit distinguishes at least:

- `design-omission`: the approved specification omitted required behavior;
- `plan-translation`: the specification covered it but the plan did not;
- `hydration-loss`: the plan covered it but backlog acceptance criteria did not;
- `implementation-divergence`: backlog intent was present but implementation
  violated it;
- `verification-escape`: expected behavior was present but tests failed to
  detect the defect;
- `reviewer-miss`: available evidence should have produced a review finding;
- `author-disposition-error`: the reviewer raised the risk but the author
  rejected or inadequately resolved it;
- `insufficient-context`: the review inputs did not expose the necessary fact;
  and
- `out-of-scope`: the defect is unrelated to the reviewed design boundary.

An assessment may assign more than one stage when evidence proves a causal
chain. It must distinguish facts from evaluator inference and cite exact paths,
digests, findings, patches, commits, issues, and tests.

### Candidate generation

A preventable escape may propose a reusable lesson only when the evidence
supports both a recognizable failure pattern and a bounded review obligation.
The lesson must state where it applies and where it does not. A project-specific
incident description without a reusable review action remains an observation.

The independent learning evaluator receives the approved artifacts, relevant
review responses, patch receipts, defect assessment, and proposed obligation.
It does not receive authority to mutate the FUR, artifact lifecycle, defect, or
backlog.

## Provider-comparison experiments

### Isolation

An experiment starts from one committed baseline containing the FUR. Each arm
uses a separate Git worktree and branch at the same baseline commit, with the
same FUR path and digest. No arm creates a renamed full copy such as
`spec-codex-claude.md` in the canonical tree.

The experiment manifest fixes:

- baseline commit, artifact path, artifact ID, and digest;
- knowledge snapshot and selected case IDs;
- instruction, template, and context digests;
- token and turn budgets;
- stopping and intervention policies;
- provider, host, and model pairing for each arm; and
- review IDs and evidence paths.

Only declared experimental variables may differ between arms.

### Non-delivery default

Experiment mode is non-delivery by default. Each arm may update its isolated FUR
in place and commit its own review evidence, but neither variant moves or
updates the canonical artifact in the coordinating worktree.

Collection imports only the unique review evidence and result receipts needed
for the experiment record. The arm-specific complete FURs are not copied into
the coordinator. Their ordered patches describe the changes from the common
baseline.

A user may later select one arm or request a synthesized revision through a new
normal author-controlled change. Selection is explicit and starts from verified
digests; an experiment never chooses or delivers a winner automatically.

### Blind comparison

Where provider constraints permit, the comparison evaluator sees anonymous arm
labels rather than provider names. It evaluates:

- valid findings and important omissions;
- false positives and critique burden;
- severity calibration;
- accepted patch quality;
- review cycles, duration, tokens, and cost; and
- later defect escape rates when longitudinal evidence exists.

Experiment outcomes enter the learning corpus as observations. They do not
become active lessons merely because one arm scored higher.

## Error handling and safety

### Fail-closed conditions

The package refuses the affected operation when it encounters:

- invalid or duplicate immutable knowledge events;
- an existing event ID with a different digest;
- a knowledge snapshot that cannot be bound to committed `HEAD`;
- cross-snapshot retrieval leakage;
- a patch that does not reproduce the resulting FUR digest;
- a review path, artifact path, or Git common path that escapes its allowed
  boundary;
- conflicting review files or manifest receipts;
- a terminal review file mutation;
- an evaluator attempting to approve its own candidate; or
- an experiment arm whose controlled baseline differs.

Failures preserve existing files and return one exact recovery action. No
automatic recovery may delete, overwrite, renumber, or silently weaken evidence.

### Non-blocking conditions

The following do not block an otherwise valid artifact review:

- no project knowledge corpus exists yet;
- no accepted relevant cases are retrieved;
- an independent candidate evaluator is unavailable;
- uncommitted observations or candidates exist; or
- a defect cannot be linked to the reviewed artifact chain.

They are reported explicitly. Missing mandatory root policy after a project has
enabled it remains a configuration error rather than an empty-knowledge case.

### Secrets and private data

Tracked manifests record provider and model identity but never credentials,
private session handles, raw environment variables, or unrestricted provider
transcripts. Defect adapters must redact or reference protected external data
rather than copying it into Git. SQLite is local but is not approved secret
storage.

## Compatibility and migration

### Superpowers compatibility

The package continues to accept explicit paths emitted by existing Superpowers
skills. In normal commit mode, intake normalization is owned by peer-review and
occurs before review; approval movement occurs only after acceptance. In
no-commit test mode both movements are disabled, the original explicit path is
retained, and the accepted-uncommitted result is never exposed as production
readiness. Executing-plans and other consumers continue to receive an explicit,
committed final path.

Patch, response, and knowledge files live outside `docs/superpowers/specs` and
`plans`, so filename-based skill behavior cannot mistake them for canonical
artifacts.

### Existing `ai-peer-review` reviews

Active legacy reviews under `.scratch/peer-review` continue under their original
storage contract until terminal completion or explicit abandonment. The package
does not migrate an active review into SQLite mid-protocol.

Completed collateral under `docs/peer-reviews`, `docs/superpowers/reviews`, or a
configured legacy root may be moved only through an explicit migration command
with dry-run output, destination collision checks, digest verification, and a
tracked relocation receipt. Existing review files remain byte-identical.
Historical internal path values remain historical facts; the relocation receipt
maps old paths to new paths without rewriting a terminal manifest.

New reviews use `.peer-review/reviews` after project setup enables the new layout.
Setup must not silently move legacy data or modify unrelated ignore rules.

### Protocol authority transition

The current scratch `events.jsonl` protocol is not discarded without parity
proof. Migration first defines the manifest checkpoints and SQLite transaction
records capable of reproducing every current reducer state and recovery outcome.
Golden parity fixtures must prove that reviewer isolation, author commit
ownership, claims, grants, supplements, turn budgets, no-commit labeling,
acceptance, override, abandonment, and recovery retain their current meaning.

Only after parity passes may new reviews omit per-review scratch directories.

## Implementation phases

This architecture is delivered through ordered phases rather than one broad
change.

### Phase 1: Artifact and evidence layout

- Add `.peer-review` project configuration and schemas.
- Add artifact IDs, chain IDs, catalog records, and generated indexes.
- Add proposed-to-approved path normalization.
- Preserve end-to-end no-commit semantics across intake, acceptance,
  finalization, catalogs, indexes, and delivery gates.
- Move new review evidence to `.peer-review/reviews`.
- Generate and verify per-turn patches.
- Add terminal immutability and amendments.
- Provide explicit legacy-layout migration with receipts.

### Phase 2: Shared SQLite authority projection

- Add Git-common-directory discovery and database lifecycle.
- Materialize current protocol and completed review receipts.
- Replace new-review scratch coordination with SQLite tables.
- Add startup reconciliation, cross-worktree concurrency, and rebuild behavior.
- Add the clone-wide retained-ref mutation lease before enabling concurrent
  cross-worktree author commits.
- Preserve no-commit behavior and current protocol parity.

### Phase 3: Project-local knowledge retrieval

- Add the tracked knowledge ledger and ingestion schemas.
- Build committed-`HEAD` knowledge snapshots.
- Add root and subsystem policy selection.
- Compile bounded preload and supplemental context.
- Record retrieval receipts in review manifests.

### Phase 4: Defect feedback and governed learning

- Add defect-chain assessment records and stage attribution.
- Add observation and candidate generation.
- Add independent evaluator and human override paths.
- Add acceptance, retirement, and supersession materialization.
- Add review-quality queries and evaluation reports.

### Phase 5: Provider-comparison experiments

- Add identical-baseline worktree orchestration.
- Add anonymous arm comparison and evidence collection.
- Add non-delivery selection or synthesis handoff.
- Add longitudinal comparison metrics without automatic lesson activation.

Each phase requires its own implementation plan and may be released separately.
A later phase may depend on earlier schemas but must not broaden an earlier
phase's authority implicitly.

## Verification strategy

### Schema and ledger tests

- Accept canonical valid events and reject unknown fields.
- Reject duplicate IDs, rewritten event bytes, invalid supersession chains, and
  self-approval.
- Prove deterministic materialization regardless of filesystem enumeration
  order.
- Prove tombstones, retirement, and amendments retain historical evidence.

### Artifact lifecycle tests

- Normalize root Superpowers output into the correct proposed shard.
- Preserve one complete FUR through review and approval movement.
- Record exact path history across moves.
- Keep approved paths stable after downstream delivery.
- Reject mutation or review intake at an approved path and require a distinct
  digest-bound successor while preserving historical approval and delivery.
- Complete a no-commit review that starts from a root Superpowers path without
  moving the FUR, changing `HEAD` or the index, or affecting production indexes
  and delivery eligibility.
- Generate deterministic human indexes and detect drift.

### Patch tests

- Generate patches for additions, deletions, renames within the FUR, Unicode,
  empty files, and newline edge cases.
- Verify each patch recreates the after digest from the before bytes.
- Refuse stale, malformed, overlapping, or pre-existing patch outputs.
- Prove patch and response receipts remain associated with the correct turn.

### SQLite tests

- Build a new database from a committed corpus.
- Reuse an already indexed knowledge tree without rescanning event contents.
- Incrementally ingest a newly committed event.
- Rebuild after deletion or compatible corruption.
- Preserve or safely interrupt active sessions during incompatible recovery.
- Run simultaneous reviews from several worktrees without row collision.
- While one reviewer interval is active, reject another worktree's author commit
  without ref mutation; after the interval ends, serialize and receipt that
  commit successfully.
- After author A seals a handoff but before reviewer A resumes, reject author
  B's retained-ref mutation; preserve the same seal across interrupted delivery
  and reviewer process loss until submission or governed intervention.
- Reject an unauthorized retained-ref transition as a reviewer boundary
  violation even when the artifact, worktree, branch, `HEAD`, and index match.
- Prove branch-only events cannot appear in another snapshot's retrieval.

### Recovery and parity tests

- Delete SQLite and reconstruct durably completed review state from tracked
  evidence.
- Interrupt each writing, written, and verified transition and reconcile safely.
- Interrupt between evidence commit `C1` and manifest-checkpoint commit `C2`,
  then reuse exact completed work without a self-referential commit receipt.
- Prove current event-reducer and no-commit behavior against retained golden
  fixtures before retiring scratch workspaces for new reviews.
- Prove terminal files cannot be modified and amendments remain append-only.

### Retrieval tests

- Load root policy and all explicitly applicable overlays.
- Never activate a scope solely from a similar directory name.
- Exclude candidate, rejected, retired, superseded, uncommitted, and
  out-of-snapshot lessons.
- Return the same ordering and selected cases in a fresh clone and in a clone
  whose shared index also contains unrelated branch events outside the pinned
  snapshot.
- Enforce the token and case-count budgets deterministically.
- Record a reproducible context digest and exact case list.

### Defect-learning tests

- Link a defect through spec, plan, backlog, implementation, and review IDs.
- Attribute each defined escape class with evidence.
- Prevent an unrelated defect from creating a knowledge candidate.
- Leave an unevaluated candidate inactive without blocking review delivery.
- Accept cross-provider, same-provider, same-model, and human decisions while
  enforcing context isolation and no self-approval.

### Experiment tests

- Prove every arm starts at the same commit, artifact blob, knowledge snapshot,
  instructions, and budgets.
- Detect any undeclared controlled-input difference.
- Collect review evidence without copying complete FUR variants.
- Keep experiment mode non-delivery until explicit selection.
- Blind provider identities from the comparison evaluator where configured.

### Repository checks

Every implementation phase runs formatting, Markdown lint, spelling, unit,
golden, integration, packaging, smoke, MCP, extraction-layout, and secret-scan
checks appropriate to its changed surface. The standalone-layout verifier must
authorize package source and design changes without treating a consuming
project's runtime `.peer-review` directory as source owned by this repository.

## Acceptance criteria

The architecture is complete when:

1. humans can distinguish proposed, approved, delivered, abandoned, and
   superseded specifications and plans without opening every file;
2. a spec-to-plan-to-backlog-to-defect chain is resolvable through stable IDs
   and verified receipts;
3. exactly one complete canonical FUR exists in each commit;
4. every author revision has a package-generated, digest-verified patch beside
   its response evidence;
5. durably completed reviews and amendments are tracked under `.peer-review`
   and remain auditable after squash integration;
6. deleting the clone-local SQLite database cannot destroy durably completed
   evidence;
7. all worktrees in one clone safely share one database without knowledge
   leakage across committed snapshots;
8. a fresh or ephemeral clone reconstructs its database from Git;
9. peer-review startup automatically synchronizes the committed knowledge tree
   and pins the resulting snapshot for the entire review;
10. only independently accepted, committed, applicable lessons enter review
    context;
11. unavailable learning evaluation does not block artifact review or delivery;
12. unrelated defects do not change the knowledge corpus;
13. provider diversity is recommended and measurable but never mandatory;
14. provider-comparison arms begin with identical controlled inputs and do not
    deliver a variant automatically; and
15. concurrent linked-worktree reviews serialize retained-ref mutations without
    weakening the reviewer boundary;
16. approved and delivered bytes remain immutable, with later work represented
    by a digest-bound successor;
17. no-commit test mode leaves `HEAD`, the index, lifecycle catalogs, indexes,
    approval, and delivery authority unchanged; and
18. existing Superpowers behavior remains unchanged when peer-review is not
    invoked.

## Final decision

`ai-peer-review` will use repository-tracked JSON as project memory,
clone-scoped SQLite as local working memory, and bounded Markdown context as
agent working context. Review evidence and learning records belong under
`.peer-review`; canonical specifications and plans remain under
`docs/superpowers`. The package owns review movement and evidence, while backlog
hosts retain downstream lifecycle authority.

The design optimizes the durable corpus for machines without turning the model
or database into authority. It preserves a compact human document tree, gives
future agents exact historical context, and creates an evidence-based path for
review quality to improve from project-specific defects.
