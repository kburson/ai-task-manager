# GitHub-Native Authority Records Design

**Date:** 2026-07-31

**Status:** Approved in chat

**Decision record:** `docs/decisions/0002-github-native-authority-records.md`

**Delivery plan:** `docs/superpowers/plans/2026-07-31-github-native-authority-records.md`

## Goal

Make GitHub Issues and issue comments the durable, distributed authority for
AITM story delivery. The design must support:

- one developer coordinating several local or cloud agents;
- Codex and Claude working concurrently in non-overlapping governed scopes;
- multiple clones and human workstations using the same backlog;
- open-source projects without separate hosting expense;
- private and enterprise projects using their existing GitHub controls; and
- AITM Insights rebuilding a browser-local query cache from GitHub.

The result replaces the planned SQLite/PostgreSQL/hosted-API authority model.
SQLite and IndexedDB may be used only as disposable derived caches. They may
never grant lifecycle, coordination, review, or integration authority.

## Decision Summary

GitHub is the system of record. A governed issue uses four record layers:

1. The issue body is the stable story definition and contains a small hidden
   directory of singleton comment node IDs.
2. Singleton issue comments contain the current mutable projections for the
   delivery contract, coordination, evidence, and timing.
3. Immutable capsule comments record coarse-grained assignments, submissions,
   transitions, reviews, handoffs, integrations, and corrections.
4. IndexedDB or another local cache holds a rebuildable projection for Insights.

One coordinator is authoritative for each governed epic or standalone issue.
A parent coordinator may delegate a nested epic and its descendants to another
AI platform. Grants are scoped and epoch-fenced. Workers append submissions;
only the active coordinator accepts them and advances governed state.

## Context

### Why the database design is rejected

A local SQLite database works only while all authoritative actors can reach the
same durable filesystem. It fails as the primary authority when cloud workers
run in disposable environments, when multiple workstations clone the project,
or when a local orchestrator needs another provider to observe a change
immediately.

A remote PostgreSQL service and authenticated API could solve reachability, but
would impose deployment, maintenance, security, tenancy, and recurring cost on
every adopting project. A multi-tenant service would reduce per-project cost but
would create a separate hosted product and account boundary that AITM does not
need in order to deliver governed development.

GitHub already supplies durable storage, identity, repository authorization,
global availability, audit timestamps, issue hierarchy, and stable issue-comment
node IDs. It is available wherever the code and backlog are already available.

### Why the current issue-body model is insufficient

The existing lifecycle stores AC, Verification Commands, Definition of Done,
approval markers, lifecycle markers, timing projections, and metadata in one
issue body. This gives gates one parse surface, but routine SDLC operations
continually rewrite the story definition. It also makes hidden-marker placement,
heading scope, historical markers, and checkbox state carry more authority than
they should.

The new model preserves the issue body as the stable story record while moving
the mutable delivery contract and current projections into identified comments.

## Design Principles

1. **GitHub is authoritative.** Local files and browser databases are caches.
2. **One writer per governed scope.** Parallelism comes from scoped grants, not
   last-writer-wins updates.
3. **Append authority before projecting it.** Immutable records establish what
   happened; singleton comments render the current result.
4. **Stable intent, mutable delivery.** The body changes rarely; SDLC state lives
   in comments.
5. **Machine representation is canonical.** Visible Markdown is generated from
   hidden structured JSON.
6. **Failure is visible and repairable.** Missing, duplicated, malformed, stale,
   or forked authority blocks governed transitions.
7. **Records are coarse-grained.** GitHub comments are not a high-frequency event
   bus.
8. **Migration is incremental.** Existing body-governed issues continue through
   a versioned compatibility adapter.
9. **Human accountability is retained.** GitHub assignees remain accountable
   humans; coordinator grants control machine authority.
10. **No hosted dependency is required.** Webhooks or hosted accelerators may be
    added later, but correctness cannot depend on them.

## Record Architecture

### Stable issue body

The issue body owns material that should remain understandable and historically
stable:

- User Story and reason;
- scope, exclusions, and dependencies;
- research and deep-dive findings;
- Plan Metadata and immutable provenance;
- migration or supersession notes; and
- the hidden singleton directory.

Acceptance Criteria, Verification Commands, Definition of Done, lifecycle
checkboxes, evidence markers, and approval projections move to the Delivery
Contract comment.

### Body-resident singleton directory

All singleton comments required by a schema version are created during issue
initialization. AITM then updates the body once with their opaque GitHub GraphQL
node IDs:

```html
<!-- aitm-directory
{
  "schema": "aitm.directory/v1",
  "revision": 1,
  "issueNodeId": "I_kw...",
  "singletons": {
    "delivery-contract": "IC_kw...",
    "coordination": "IC_kx...",
    "evidence-projection": "IC_ky...",
    "timing": "IC_kz..."
  }
}
-->
```

Node IDs are opaque strings. No code may decode them to infer type or identity.
The directory changes only when a singleton is repaired, replaced, or added by
a future schema migration.

AITM can supply all directory IDs to the GraphQL `nodes(ids:)` query and retrieve
the current singleton bodies in one request. A separate index comment is not
part of version 1 because it would add another mutable authority surface and a
third cold-read hop.

### Singleton projection comments

Version 1 defines four singleton types:

| Type                  | Responsibility                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `delivery-contract`   | AC, VC, DoD definitions, checkbox projections, lifecycle projection, accepted-record references     |
| `coordination`        | active coordinator grant, authority epoch, delegated scopes, active assignments, record-chain heads |
| `evidence-projection` | accepted execution, test, review, approval, handoff, and integration evidence                       |
| `timing`              | the current timing table and normalized stage/session projection                                    |

Each singleton is created once. It may be edited only by the active coordinator
or a trusted AITM application acting under that coordinator grant.

The hidden structured payload is canonical. Visible Markdown is generated from
the payload and is validated on read. A manual checkbox edit alone cannot grant
authority.

### Immutable capsules

Capsules are self-identifying comments that are never edited. Corrections append
a new capsule that references and supersedes an earlier record.

Version 1 capsule types are:

- `coordinator-grant`;
- `coordinator-revocation`;
- `work-assignment`;
- `execution-result`;
- `verification-evidence`;
- `review-result`;
- `record-disposition`;
- `contract-sealed`;
- `contract-amended`;
- `lifecycle-transition`;
- `handoff`;
- `integration-result`;
- `conflict-resolution`; and
- `repair-result`.

A worker-created capsule begins as `submitted`. It cannot satisfy a gate until
the active coordinator records an accepted disposition and projects that
decision into the appropriate singleton.

Capsules are deliberately coarse. Console lines, heartbeats, token counts, and
internal reasoning are not separate comments.

## Common Machine Envelope

Every AITM comment starts with a hidden JSON envelope:

```html
<!-- aitm-record
{
  "schema": "aitm.record/v1",
  "recordId": "01J...",
  "recordType": "verification-evidence",
  "repository": "owner/repository",
  "issue": 1054,
  "createdAt": "2026-08-01T00:00:00.000Z",
  "authority": {
    "grantId": "01J...",
    "epoch": 4,
    "actor": "codex/session-id"
  },
  "predecessor": "01J...",
  "supersedes": null,
  "payloadHash": "sha256:...",
  "payload": {}
}
-->
```

The common validator requires exact known keys for the declared schema, durable
JSON values, canonical serialization, a globally unique record ID, repository
and issue correlation, and a valid payload hash. Secret-bearing keys and bearer
values are rejected before serialization.

Hashes exclude the hash field itself and visible generated Markdown. Schema
handlers may define additional normalized hash domains, such as a Delivery
Contract definition hash.

Unknown schema versions are preserved but never silently interpreted as valid
authority.

## Delivery Contract

### Structured payload

The Delivery Contract payload contains:

```json
{
  "schema": "aitm.delivery-contract/v1",
  "recordId": "01J...",
  "revision": 7,
  "contractEpoch": 2,
  "authorityEpoch": 4,
  "coordinatorGrantId": "01J...",
  "status": "active",
  "definitionHash": "sha256:...",
  "projectionHash": "sha256:...",
  "acceptanceCriteria": [],
  "verificationCommands": [],
  "definitionOfDone": [],
  "lifecycleProjection": {},
  "acceptedRecordIds": []
}
```

Each criterion and command has a stable logical ID. Machine consumers never
identify an item by visible wording or list position.

### Draft and frozen phases

During Refine and Plan, the coordinator may update draft definitions without
creating a capsule for each edit. Plan approval:

1. validates the complete contract;
2. appends an immutable `contract-sealed` capsule containing the full structured
   definitions;
3. records `definitionHash` and `contractEpoch`; and
4. updates the Delivery Contract projection.

After Plan approval, AC, VC, or DoD changes require a `contract-amended` capsule
and a new contract epoch. Test, Review, and approval evidence from an earlier
contract epoch is invalid unless policy explicitly proves that the amendment
cannot affect it.

## Coordinator Authority

### Scope

An epic coordinator owns the epic and the descendants explicitly included by
its grant. There is no global backlog coordinator.

A parent coordinator may delegate a nested epic and its descendants to another
AI service. A nested coordinator cannot mutate its parent, siblings, or excluded
descendants. Standalone issues receive issue-scoped grants.

Branch and integration authority follow the same hierarchy. A coordinator may
integrate its direct worker branches into its epic branch but cannot integrate
outside the granted branch boundary.

### Grant fields

A coordinator grant records:

- scope root issue;
- included descendants and explicit exclusions;
- coordinator actor, platform, and session identity;
- parent grant and issuing coordinator;
- authority epoch;
- allowed operations;
- branch and integration boundaries;
- activation time; and
- replacement, revocation, or expiration conditions.

Only one active grant may govern the same operation and scope. A replacement
closes the prior epoch. Old-epoch agents may submit observed work but cannot
advance current state.

### Assignments and worker results

A coordinator creates a narrower `work-assignment` capsule for a worker. It
states the issue, branch, files or subsystem, dependency baseline, verification
obligations, and authority epoch.

Workers append result and evidence capsules and report their exact node IDs to
the coordinator. The coordinator validates the records against the assignment,
records a disposition, and updates the singleton projections.

If the coordinator disappears, lifecycle advancement pauses. Workers may finish
and submit their bounded work. A replacement coordinator must explicitly adopt
or reject every outstanding submission.

## Governed Mutation Protocol

Every governed mutation follows one append-first protocol:

1. Fetch the issue directory and relevant singleton comments.
2. Validate schemas, hashes, directory identity, active grant, authority epoch,
   contract epoch, and current record-chain head.
3. Evaluate gates without writing.
4. Append one immutable authoritative capsule referencing the expected prior
   record and singleton revisions.
5. Read back and validate the exact capsule.
6. Update affected singleton projections idempotently.
7. Read back and validate revision and hash changes.

The capsule is authoritative after step 5. A crash after that point leaves a
stale projection, not an ambiguous mutation. The next coordinator replays the
record chain and repairs the singleton.

Before Plan approval, draft Delivery Contract edits are the exception: they are
mutable drafts and become authoritative only when sealed.

## Concurrency and Conflict Handling

GitHub comments do not provide a multi-comment transaction. Correctness comes
from one writer per scope, immutable records, predecessor links, epochs, and
read-back verification.

AITM classifies conflicts:

| Conflict                       | Behavior                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Stale singleton revision       | Refresh, recompute, and retry if authority is unchanged                         |
| Stale grant or authority epoch | Reject; the actor cannot retry as current authority                             |
| Duplicate active singleton     | Block transitions and run repair discovery                                      |
| Record-chain fork              | Block advancement until parent coordinator or human emits `conflict-resolution` |
| Partial projection update      | Replay accepted capsules and repair projections                                 |
| Manual edit/hash mismatch      | Preserve content, block authority, require adoption or restoration              |
| Missing/deleted singleton      | Discover by deterministic identity; repair directory only after validation      |
| Unsupported schema             | Preserve and report; do not infer authority                                     |

Issue initialization creates self-identifying singleton comments before writing
the body directory. On restart, AITM scans for deterministic singleton identities
before creating anything, so a crash does not blindly duplicate comments.

## Synchronization Model

“Real time” means synchronization at authority boundaries, not continuous
database replication.

Agents refresh GitHub state:

- before accepting or starting an assignment;
- before each governed mutation;
- before submitting evidence or review;
- before integration;
- immediately after publishing a capsule; and
- when the coordinator reports a scope change.

During active parallel coordination, the orchestrator may poll changed issue
comments with adaptive backoff. Direct agent messaging may reduce latency, but
the GitHub record must exist before another actor relies on it.

Polling uses overlapping time windows and deduplication by GitHub node ID,
record ID, update time, and payload hash. A cursor is an optimization, not proof
that no event exists.

## Insights Read Model

AITM Insights treats GitHub as authority and IndexedDB as a disposable materialized
view. Suggested object stores are:

- `repositories`;
- `issues`;
- `directories`;
- `contracts`;
- `records`;
- `projections`; and
- `syncCursors`.

Initial ingestion:

1. fetch issues and parse directories;
2. batch-fetch singleton comments by node ID;
3. scan comments for AITM record envelopes;
4. validate schemas, hashes, authority, and relationships; and
5. materialize issue, epic, timing, and evidence projections.

Incremental ingestion fetches changed issues and comments with an overlap
window, deduplicates the results, and recomputes only affected projections.

Deleting IndexedDB must never lose governed state. A full rebuild from GitHub
must produce the same projection for the same record set.

## Security and Privacy

- Records contain no GitHub tokens, bearer values, API keys, token environment
  names, credentials, or private reasoning.
- Actor identity is correlated to an authorized GitHub identity and an AITM
  coordinator or assignment record.
- Repository permissions control who can read and write records.
- Private repository records remain subject to the repository's GitHub access
  controls.
- Visible Markdown must not expose hidden operational secrets.
- Hashes prove consistency, not identity; authorization always comes from the
  active grant and GitHub actor.

## Rate and Volume Controls

- One capsule represents one coarse governed action or bounded worker result.
- Heartbeats do not create comments.
- Singleton updates are coalesced when one transition affects several visible
  fields.
- GraphQL node batching retrieves known singletons together.
- Insights caches validated records and performs incremental reads.
- A future sharded catalog may be introduced only after measured comment volume
  proves cold scans insufficient. It is not part of version 1.

## Compatibility and Migration

### Authority locator

The read boundary returns one of:

- `legacy-body/v1` for existing body-governed issues; or
- `github-records/v1` for directory-governed issues.

Lifecycle consumers ask the boundary for a Delivery Contract. They do not parse
the issue body or comment directly.

### Adoption sequence

1. Characterize current body gates and preserve their behavior in fixtures.
2. Implement record validation and read-only GitHub discovery.
3. Add singleton initialization and Delivery Contract draft/seal support.
4. Add capsule, coordinator, assignment, and transition authority.
5. Route read-side gates through the compatibility boundary.
6. Route write-side lifecycle mutations through append-first records.
7. Adopt active issues one at a time with read-back and rollback evidence.
8. Retire obsolete local-ledger requirements only after GitHub-native parity and
   recovery tests pass.

There is no bulk rewrite of historical issues. Closed issues remain historical.

## Preserved Work From Issues 1053 and 1054

The pre-pivot branches are historical inputs, not implementation baselines:

- `codex/archive-1053-pre-github-native-pivot` preserves the complete local
  work-lease program tip `c71eec20e9465ac21f4e8246a7746699bc7d8bd9`.
- `codex/archive-1054-pre-github-native-pivot` preserves lifecycle-journal tip
  `51780578f0ee0bdeaae7fb099ea287a00f553eda` and its two issue-specific commits.

Reusable concepts include stable operation identity, secret rejection,
immutable attachments, ordered projection checkpoints, exact replay proof,
epoch/fence cleanup, crash-boundary testing, and fail-closed repair.

The following implementation assumptions are rejected: SQLite as shared
authority, authenticated HTTPS/PostgreSQL as a required remote authority,
lease-store receipts as lifecycle truth, and disposable environment-local
databases.

No archived implementation commit is merged wholesale. Each new issue names the
specific invariant it salvages and introduces a failing GitHub-native test before
adapting code.

## Testing Strategy

### Unit

- exact record-envelope parsing and canonical hashing;
- unknown-key, secret, malformed, and schema-version rejection;
- directory parsing and deterministic singleton identities;
- Delivery Contract rendering and definition/projection hashes;
- coordinator scope and epoch resolution;
- record-chain validation, fork detection, and supersession;
- legacy-body and GitHub-record compatibility projections; and
- deterministic IndexedDB export fixtures.

### Integration

- create singleton comments, write one directory, and batch-read by node ID;
- interrupt initialization at every write boundary and repair idempotently;
- append a transition, interrupt projection updates, and replay repair;
- concurrent stale writers and coordinator replacement;
- Codex worker submission accepted by a Claude coordinator and the reverse;
- deleted, duplicated, manually edited, and malformed comments;
- contract amendment invalidating Test and Review evidence; and
- complete rebuild from GitHub producing the expected projection.

### Migration

- unchanged legacy issue behavior before adoption;
- dry-run adoption with no writes;
- exact AC/VC/DoD parity after adoption;
- rollback before first sealed GitHub-native transition;
- refusal to roll back after divergent GitHub-native authority; and
- no SQLite, PostgreSQL, or hosted API requirement in a fresh consumer install.

### Completion gates

- focused tests for every child;
- fast and slow repository suites;
- lint, format, whitespace, and package checks;
- exact-SHA independent review per child;
- second review for authority-critical children or any Critical/Important first
  finding; and
- one final cross-issue review against a frozen nested-epic SHA.

## Non-Goals

- Building a hosted multi-tenant AITM service.
- Providing offline authoritative lifecycle mutation.
- Using GitHub comments as a fine-grained telemetry stream.
- Rewriting closed historical issues.
- Making Insights an authority or gate provider.
- Solving source-code merge conflicts through record storage.
- Granting one coordinator authority over the entire backlog.

## Success Criteria

The design is complete when:

1. a fresh project needs only GitHub to coordinate distributed AITM work;
2. the issue body remains unchanged during normal Develop, Test, and Review;
3. all singleton comments are fetched by the body directory in one batched read;
4. stale or replaced coordinators cannot advance state;
5. a crash at any mutation boundary is replayable or visibly blocked;
6. AC, VC, DoD, review, and lifecycle gates use structured contracts rather
   than Markdown wording as authority;
7. Insights can delete and rebuild IndexedDB from GitHub without information
   loss; and
8. no required SQLite, PostgreSQL, API service, or cloud-hosting cost remains.
