# Hybrid AITM Ledger and Insights Program Design

<!-- cspell:words checkpointed Checkpointing cutover cutovers Merkle purgeable transactionally unflushed upcaster -->

**Date:** 2026-07-28
**Status:** Approved for implementation planning
**Program:** AITM local ledger foundation and AITM Insights
**Delivery:** Two sequential phases in two user-facing skill repositories

---

## 1. Executive Decision

AITM will separate project-governance facts from GitHub presentation and from
chat-derived analytics without weakening its existing gates.

The program has two sequential phases:

1. The existing `@kburson/ai-task-manager` project gains a durable local event
   ledger, a Git-backed recovery journal, and a transport-neutral event
   contract.
2. A new `@kburson/aitm-insights` project consumes that contract to mine agent
   transcripts, correlate work across sessions and tasks, provide local web
   visualizations, and optionally operate a shared cloud service backed by
   PostgreSQL.

The user-facing products remain two skills:

- **AITM Core** owns project-management intent, lifecycle policy, enforcement,
  evidence gates, and GitHub projections.
- **AITM Insights** owns transcript observation, task correlation, derived
  intelligence, visualization, synchronization, and the deployable cloud
  service.

A small npm support library, `@kburson/aitm-ledger`, is published from the
existing AITM repository. It is not a skill. It provides the shared event
protocol, validation, SQLite storage, migrations, and conformance fixtures
required by both user-facing projects.

AITM must remain safe and operational without Insights. Insights may operate
without a configured AITM project, but in that mode it is observational and
must not claim governed delivery.

## 2. Problem Statement

AITM currently uses GitHub issue bodies, hidden markers, comments, project
fields, local runtime JSON files, Git history, and provider-native chat logs to
represent different parts of task execution.

This produces three tensions:

1. GitHub is valuable as the collaborative backlog and human-readable project
   record, but high-volume machine telemetry makes issue bodies and comments
   noisy and creates parser, mutation, healing, and synchronization burden.
2. Provider-native transcripts contain useful evidence about agent execution,
   but they are workstation-local, provider-specific, large, and not organized
   around stable project and task identities.
3. A local-only database supports parallel agents in linked worktrees on one
   workstation, but cannot coordinate cloud agents or developers on separate
   machines.

The design must preserve AITM's deterministic governance while supporting two
deployment landscapes:

- local development using multiple isolated worktrees on one workstation;
- distributed development using multiple workstations and cloud agents.

## 3. Goals

### 3.1 AITM Core goals

- Store authoritative task events in a durable project-local SQLite database.
- Share one local database across every linked worktree for the repository.
- Keep the database outside `.tmp/`, because `.tmp/` is intentionally
  purgeable.
- Recover the authoritative local ledger after workstation loss without
  committing a mutable SQLite database file.
- Define a versioned event contract that does not expose AITM internals.
- Preserve AITM lifecycle, evidence, review, approval, and delivery gates when
  Insights is absent or unavailable.
- Preserve issue prose: Story, Scope, Deep Dive, Acceptance Criteria,
  Verification Commands, and Definition of Done.
- Introduce database-backed telemetry through a measured dual-write migration,
  not a flag-day deletion of GitHub evidence.
- Allow a future remote transport without teaching producers PostgreSQL syntax
  or distributing database credentials.

### 3.2 Insights goals

- Discover and incrementally process supported Claude and Codex transcripts.
- Associate multiple sessions with one task and multiple tasks with one
  session.
- Correlate spawned agents, parent sessions, worktrees, branches, commits,
  verification commands, and GitHub issues.
- Persist compact structured events and derived intelligence rather than full
  raw transcripts by default.
- Provide the same web visualization product in local and distributed modes.
- Run locally against SQLite without Docker or a cloud account.
- Run remotely behind an authenticated HTTPS API backed by PostgreSQL.
- Support verified local-to-cloud and cloud-to-local cutover.
- Build and test in a new repository without requiring a configured AITM
  project.

### 3.3 Program goals

- Complete and publish Phase 1 before bootstrapping Phase 2.
- Install the published AITM package into the Insights repository to govern
  Insights development.
- Keep the production dependency direction narrow:
  both skills depend on `@kburson/aitm-ledger`; Insights does not import AITM
  workflow internals.
- Make every stored fact carry provenance, authority, and schema version.
- Make data loss, partial synchronization, incompatible schemas, and
  unavailable remote services diagnosable and recoverable.

## 4. Non-Goals

### 4.1 Phase 1 non-goals

- No transcript mining.
- No web visualization application.
- No PostgreSQL implementation.
- No hosted API.
- No cloud-provider deployment.
- No removal of existing GitHub markers or timing comments before dual-write
  parity is proven.
- No use of Git as a live multi-writer coordination database.
- No tracking of the live SQLite database file in Git.

### 4.2 Phase 2 initial non-goals

- No storage of complete raw transcripts by default.
- No direct PostgreSQL access from developer or agent clients.
- No replacement of AITM lifecycle policy with inferred chat state.
- No ability for inferred Insights records to satisfy AITM gates.
- No multi-region active-active database topology.
- No arbitrary SQL plugin system.
- No requirement that a local-only user install Docker.
- No promise that every historical provider transcript can be parsed forever;
  unsupported records remain observable as ingestion diagnostics.

## 5. Design Principles

### 5.1 Governance and observation are separate

AITM records authoritative actions and decides whether an action is allowed.
Insights observes, correlates, summarizes, and visualizes. Insights can report
that a gate passed, but only an AITM-authored authoritative event can prove that
the gate passed.

### 5.2 One protocol, multiple storage implementations

Producers emit one canonical event envelope. Local mode persists through the
SQLite adapter. Distributed mode posts the same envelope to the Insights API,
which persists through the PostgreSQL adapter.

AITM producers never contain PostgreSQL SQL and never receive PostgreSQL
credentials.

### 5.3 Append facts; rebuild projections

Canonical events are append-only. Dashboards, duration totals, task timelines,
and relationship graphs are rebuildable projections. Corrections append
superseding or invalidating events rather than rewriting historical facts.

### 5.4 Explicit authority

Every record is classified as:

- `authoritative`: emitted by an AITM policy or execution path;
- `observed`: extracted directly from a transcript, Git, GitHub, or tool result;
- `inferred`: produced by a heuristic or model and accompanied by confidence
  and source references.

Consumers must not silently promote observed or inferred data to authoritative
data.

### 5.5 Local-first does not mean workstation-fragile

SQLite is the local operational store. An immutable Git journal provides
recoverability. The Git journal is a backup and transport artifact, not the live
database.

### 5.6 Raw transcript retention is opt-in

The default durable record contains structured events, derived summaries, and
selected evidence excerpts. Complete raw transcript archives require explicit
configuration, encryption, and a separate retention destination.

### 5.7 Fail closed only where global truth is required

Local safety gates continue using locally available AITM policy and evidence.
Distributed coordination gates that require current shared ownership,
dependency, or integration state fail closed when the remote authority cannot
be contacted.

## 6. Repository and Package Boundaries

### 6.1 Existing AITM repository

The existing repository owns:

- the `@kburson/ai-task-manager` skill and CLI package;
- the new `@kburson/aitm-ledger` npm support package;
- SQLite schema and migrations;
- canonical event validation and conformance fixtures;
- AITM event producers;
- local Git-journal checkpoint and restore commands;
- the remote transport client interface;
- GitHub projection and parity migration.

The repository becomes an npm workspace with the root AITM package and
`packages/aitm-ledger/`.

### 6.2 New Insights repository

The new repository owns:

- the `@kburson/aitm-insights` skill and CLI package;
- provider-specific transcript parsers;
- incremental ingestion and task attribution;
- derived intelligence and read models;
- the local visualization server and browser application;
- the hosted HTTPS API;
- the PostgreSQL adapter and migrations;
- authentication and authorization;
- local/remote synchronization;
- cloud deployment images, templates, and operator guides.

### 6.3 Dependency direction

```text
@kburson/aitm-ledger
        ^             ^
        |             |
AITM Core       AITM Insights
                      |
                      +-- local UI process
                      `-- hosted API/PostgreSQL process
```

`@kburson/aitm-ledger` must not import either skill.

AITM Insights may use AITM as its development-management tool, but its
production modules must not shell out to `npx aitm`, import AITM verb modules,
or read hidden issue markers as a required runtime dependency.

## 7. Deployment Landscapes

### 7.1 Landscape A: local workstation

```text
Worktree A ----\
Worktree B -----+--> main-worktree .db/aitm/project.sqlite
Worktree C ----/                 |
                                  +--> Git recovery journal
                                  `--> optional Insights local UI
```

All worktrees resolve the main worktree and open the same SQLite database on the
same local filesystem.

The supported local topology is one workstation and one local filesystem.
SQLite files on NFS, SMB, cloud-synchronized folders, or other network
filesystems are unsupported.

### 7.2 Landscape B: distributed project

```text
Developer workstation --\
Cloud agent A ------------+--> authenticated HTTPS API --> PostgreSQL
Cloud agent B ------------/                |
                                             `--> Insights web application
```

Each client retains a local SQLite cache and durable outbox. The remote API is
the shared authority. PostgreSQL is reachable only from the service runtime,
not from agents or browsers.

### 7.3 Product configurations

The supported configurations are:

1. AITM only: governance, local authoritative ledger, Git recovery journal.
2. AITM plus local Insights: governance, mining, and local web visualizations.
3. AITM plus distributed Insights: governance, shared event service, and remote
   visualizations.
4. Insights standalone: observational mining and visualizations without claims
   of AITM-governed delivery.

## 8. Local Filesystem Contract

### 8.1 Durable untracked data

The main worktree owns:

```text
.db/
  aitm/
    project.sqlite
    project.sqlite-wal
    project.sqlite-shm
    backups/
    exports/
    recovery/
```

The repository `.gitignore` and generated installation ignore block include:

```gitignore
/.db/
```

The `.db/` directory is untracked but not disposable. AITM commands must never
describe it as scratch, temporary, or safe to purge.

### 8.2 Purgeable runtime data

`.tmp/aitm/` remains the home for:

- locks;
- short-lived caches;
- test sandboxes;
- temporary export assembly;
- retry scratch;
- optional raw-transcript processing cache;
- transient provider state.

Deleting `.tmp/` must not delete the authoritative ledger, ledger backups, or
the last durable Git-journal checkpoint.

### 8.3 Main-worktree anchoring

The ledger path is resolved from the first worktree returned by
`git worktree list --porcelain`, using the same main-worktree discovery
principle as the fleet registry.

The resolver must:

- return the current project root in a single-worktree repository;
- return the main worktree for a linked worktree;
- reject a path whose resolved repository identity does not match the current
  worktree;
- create `.db/aitm/` with user-only permissions where the platform supports
  them.

## 9. SQLite Runtime Contract

Phase 1 raises the Node.js runtime floor to `>=22.15.0` and uses the built-in
`node:sqlite` module. This avoids a native npm add-on and provides the backup
API required by the local durability commands.

Every writable connection configures:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = FULL;
```

The ledger must:

- use short transactions;
- allow concurrent readers;
- serialize competing local writers through SQLite locking and retry bounded
  `SQLITE_BUSY` failures;
- never hold a write transaction while performing GitHub, Git, network, model,
  or filesystem traversal work;
- run schema migrations transactionally before accepting writes;
- refuse a database whose schema version is newer than the installed library;
- create consistent backups with the SQLite backup API, not file copying.

## 10. Canonical Event Envelope

Every event uses this logical shape:

```js
{
  schemaVersion: 1,
  eventId: "01K...",
  projectId: "uuid",
  eventType: "lifecycle.transitioned",
  authority: "authoritative",
  producer: {
    name: "ai-task-manager",
    version: "1.1.0",
    instanceId: "uuid"
  },
  actor: {
    kind: "human|agent|system",
    id: "stable-or-pseudonymous-id"
  },
  taskId: "github:owner/repo#123|null",
  sessionId: "provider-session-id|null",
  parentSessionId: "provider-session-id|null",
  agentRunId: "uuid|null",
  worktreeId: "uuid|null",
  correlationId: "uuid",
  causationId: "01K...|null",
  occurredAt: "RFC3339 timestamp",
  observedAt: "RFC3339 timestamp",
  git: {
    repository: "owner/repo",
    branch: "feature/child/123|null",
    headSha: "40-hex|null",
    worktreePathHash: "sha256|null"
  },
  confidence: 1,
  payload: {},
  sourceRefs: [],
  redaction: {
    containsRawChat: false,
    containsSecrets: false
  },
  contentHash: "sha256"
}
```

### 10.1 Identity requirements

- `eventId` is a monotonic ULID generated before persistence.
- `projectId` is created once during ledger initialization and stored in both
  project configuration and the ledger.
- `producer.instanceId` identifies one installed producer instance without
  exposing a workstation hostname by default.
- `taskId` uses a stable namespace, not an unqualified integer.
- `sessionId` retains the provider-native identifier and is namespaced by
  producer metadata in storage.
- `contentHash` is calculated from the canonicalized envelope excluding the
  `contentHash` field itself.

### 10.2 Idempotency

An event write is idempotent by `eventId` and `contentHash`:

- the same ID and hash is a successful no-op;
- the same ID with a different hash is an integrity error;
- duplicate batches return per-event results;
- retries do not create new event IDs.

### 10.3 Versioning

The envelope has a major integer `schemaVersion`. Additive payload changes stay
within the current version. Removing or changing the meaning of a field requires
a new version and an explicit upcaster.

Producers advertise their supported version range. Local and remote stores
reject unsupported future versions before mutation.

## 11. Event Families

### 11.1 AITM authoritative families

- `project.initialized`
- `session.started`
- `session.resumed`
- `session.ended`
- `task.bound`
- `task.unbound`
- `task.paused`
- `task.resumed`
- `lifecycle.transition.requested`
- `lifecycle.transitioned`
- `lifecycle.transition.refused`
- `verification.started`
- `verification.completed`
- `review.completed`
- `approval.recorded`
- `approval.revoked`
- `git.commit.observed`
- `git.integration.verified`
- `timing.span.closed`
- `evidence.invalidated`
- `journal.checkpointed`
- `ledger.restored`

### 11.2 Insights observational families

- `transcript.discovered`
- `transcript.cursor.advanced`
- `task.slice.observed`
- `tool.invocation.observed`
- `tool.result.observed`
- `decision.inferred`
- `risk.inferred`
- `summary.derived`
- `relationship.inferred`
- `artifact.referenced`
- `ingestion.warning`

The actual payload schema for every event type is versioned in
`@kburson/aitm-ledger`.

## 12. Ledger Entity Model

The canonical SQLite schema contains:

- `ledger_metadata`: project identity and schema metadata;
- `events`: immutable event envelopes and indexed identity columns;
- `outbox`: remote-delivery attempts and retry state;
- `task_context_intervals`: authoritative task/session binding intervals;
- `artifacts`: content-addressed evidence references;
- `sync_peers`: remote identities and watermarks;
- `journal_checkpoints`: Git-journal ref, watermark, counts, and hashes;
- `migrations`: applied migration IDs and checksums.

Insights creates its own projection tables through namespaced migrations:

- `insights_transcript_cursors`;
- `insights_task_slices`;
- `insights_decisions`;
- `insights_relationships`;
- `insights_summaries`;
- `insights_dashboard_rollups`.

Only the ledger migration engine creates or alters tables. Neither skill issues
ad hoc `CREATE TABLE` statements during normal operation.

## 13. Task and Session Attribution

### 13.1 Multiple sessions for one task

Each `task.bound` event opens a task-context interval for a session. Pausing,
switching, closing, or ending the session closes the interval. A task timeline
is the union of every interval with the same stable `taskId`.

### 13.2 Multiple tasks in one session

A session may contain sequential intervals for different tasks. Transcript
messages and tool activity are assigned to the interval active at their
timestamp.

An item spanning a switch boundary is not duplicated. It is either:

- assigned to the interval containing the item timestamp;
- linked explicitly to multiple tasks through `sourceRefs`;
- left unassigned with an ingestion warning.

### 13.3 Spawned agents

The dispatching process passes:

- `projectId`;
- `taskId`;
- `parentSessionId`;
- `agentRunId`;
- `correlationId`;
- expected worktree and branch identity.

The spawned session records these values before doing task work. If the
provider cannot accept metadata directly, Insights correlates using the
worktree, branch, issue binding, spawn timestamp, and transcript parent record,
and marks the result observed or inferred.

### 13.4 Confidence

Authoritative AITM bindings use confidence `1`.

Observed transcript relationships use confidence `1` only when the provider
record contains an explicit stable identifier. Heuristic relationships use a
value below `1` and list every source signal. Low-confidence relationships
remain visible for correction and are excluded from authoritative metrics by
default.

## 14. Data Retention

### 14.1 Permanent authoritative data

Retain indefinitely:

- task bindings and lifecycle events;
- verification, review, approval, and delivery events;
- event provenance and content hashes;
- timing spans and compact usage measurements;
- Git identities and artifact references;
- journal and synchronization watermarks.

### 14.2 Durable derived intelligence

Retain according to project policy:

- task summaries;
- decisions;
- risks;
- dependency and file relationships;
- selected evidence excerpts;
- dashboard projections.

Derived records retain their source event IDs, algorithm or model version,
confidence, and generation timestamp.

### 14.3 Ephemeral raw telemetry

Do not persist complete raw transcript content by default.

The miner streams provider transcripts and persists:

- source file identity and content hash;
- byte or record cursor;
- message metadata;
- compact selected excerpts;
- structured tool metadata;
- derived records.

Full tool output, repeated injected context, source files already in Git, and
large generated artifacts are represented by bounded excerpts and
content-addressed references.

An optional raw archive requires:

- explicit project opt-in;
- encryption at rest;
- a configured retention period;
- a configured maximum size;
- a destination outside the normal Git journal;
- documented deletion and key-recovery procedures.

## 15. Git Recovery Journal

### 15.1 Purpose

The Git journal protects local authoritative data from workstation or project
directory loss. It does not coordinate concurrent live writers.

### 15.2 Ref and layout

AITM writes a dedicated remote branch:

```text
aitm-data/<project-id>
```

The branch is not checked out into normal development worktrees. It contains:

```text
manifest.json
events/YYYY/MM/<producer-instance>/<first-ulid>-<last-ulid>.jsonl.gz
checkpoints/<watermark>.json
```

Segments are immutable, sorted by event ID, compressed with gzip, and include:

- first and last event IDs;
- event count;
- uncompressed and compressed SHA-256 hashes;
- previous-segment hash;
- schema-version range;
- producer instance;
- creation timestamp.

### 15.3 Checkpoint behavior

Checkpointing:

1. reads a stable event watermark from SQLite;
2. exports events after the prior checkpoint;
3. writes and verifies one or more immutable segments;
4. advances the dedicated branch with an append-only commit;
5. pushes the branch when configured;
6. appends `journal.checkpointed` locally after the push result is known.

A failed push leaves the local segment eligible for retry. It does not roll
back ledger events.

### 15.4 Public and private repositories

The Phase 1 journal contains authoritative AITM events only. Insights-derived
data is excluded unless explicitly enabled.

Initialization displays the data categories and requires confirmation before
the first remote journal push. If repository visibility is public, the default
is local journal export only; remote push requires an explicit
`allowPublicJournal` setting.

Raw transcripts are never written to the Git journal.

### 15.5 Restore

Restore:

1. verifies the manifest and segment hash chain;
2. validates every event envelope;
3. creates a new SQLite database in `.db/aitm/`;
4. replays events idempotently;
5. rebuilds task intervals and projections;
6. compares GitHub and Git reconciliation summaries;
7. atomically promotes the rebuilt database after verification.

The existing database is moved into `.db/aitm/backups/`, not overwritten in
place.

## 16. GitHub Content Boundary

### 16.1 Content retained in GitHub

Issue bodies retain:

- Story;
- Scope;
- Plan Metadata;
- Pickup Directive reference;
- Deep Dive;
- Acceptance Criteria;
- Verification Commands;
- Definition of Done;
- a compact human-readable status and provenance summary.

GitHub remains the collaborative product backlog and requirements surface.

### 16.2 Data eligible to move out of GitHub

After dual-write parity:

- detailed timing rows;
- session references;
- high-volume tool and test telemetry;
- repetitive transition markers;
- derived duration rollups;
- synchronization diagnostics.

The GitHub representation may retain compact summaries and links into Insights.

### 16.3 AC, VC, and DoD

AC, VC, and DoD prose and visible checkboxes remain in GitHub during both
phases. The ledger records stable item IDs, evidence events, and satisfaction
state.

The database may later become the evidence authority, but moving the visible
checkbox authority requires a separately approved migration after:

- stable IDs exist;
- bidirectional drift detection exists;
- offline behavior is proven;
- human review remains possible without Insights.

## 17. AITM Security and Availability

### 17.1 AITM without Insights

AITM Core remains complete without Insights:

- lifecycle transitions are validated locally;
- source-edit and command guards remain active;
- verification and approval gates remain active;
- GitHub issue contracts remain readable;
- commits and integration remain verifiable;
- local ledger events are written;
- Git recovery checkpoints remain available.

Insights absence cannot disable a gate.

### 17.2 Insights influence

Insights has read access to authoritative events and may append observed or
inferred events. It cannot:

- rewrite authoritative events;
- grant approval;
- mark a verification command successful;
- advance lifecycle state;
- waive a gate;
- classify a human action as automated or vice versa.

Any future control request from Insights must call a public AITM command or API
that re-runs normal policy.

### 17.3 Local web security

The local Insights web server:

- binds to `127.0.0.1` by default;
- generates a random session token;
- rejects requests without the token;
- disables permissive cross-origin access;
- opens SQLite read-write only through the ledger library;
- never renders unescaped transcript-derived HTML.

Binding to a non-loopback interface requires an explicit warning and
authentication configuration.

## 18. Distributed API and PostgreSQL

### 18.1 API boundary

Clients call the Insights HTTPS API. They never connect directly to PostgreSQL.

The minimum API surface is:

```text
POST /v1/projects/{projectId}/events:batch
GET  /v1/projects/{projectId}/events?after={eventId}
GET  /v1/projects/{projectId}/snapshot
POST /v1/projects/{projectId}/sync:prepare
POST /v1/projects/{projectId}/sync:verify
GET  /v1/projects/{projectId}/health
```

### 18.2 Authentication and authorization

Human users authenticate through GitHub OAuth and are authorized against
repository access.

Agent clients use revocable project-scoped bearer tokens:

- `events:append`;
- optional `events:read`;
- no database or migration permission;
- stored only as hashes by the service;
- displayed once at creation;
- rotated and revoked through the authenticated UI or admin CLI.

Service-to-PostgreSQL credentials:

- exist only in the service secret store;
- use TLS;
- are scoped to the service database;
- are not written into repository config, agent prompts, or transcript data.

### 18.3 PostgreSQL contract

PostgreSQL stores the same logical event envelope and idempotency invariants as
SQLite. SQL migrations are adapter-specific, but protocol behavior is shared
through conformance tests.

The API owns:

- validation;
- authorization;
- idempotency;
- rate limiting;
- audit logging;
- schema negotiation;
- transaction boundaries;
- projection refresh;
- database error translation.

### 18.4 Deployment

Insights ships:

- one OCI image containing the API and built web assets;
- configuration for an external PostgreSQL connection;
- a development compose file for Insights contributors;
- provider deployment templates and guides for AWS, Azure, and GCP.

Local-only AITM or Insights users do not need Docker.

The provider templates use managed PostgreSQL by default. A single compute
instance hosting both service and PostgreSQL is documented as a small,
self-managed option with explicit backup and availability limitations.

## 19. Local and Remote Synchronization

### 19.1 Local-to-cloud cutover

1. Initialize the remote project and authenticate.
2. Put the local ledger in sync-preparation mode while normal writes continue
   into the outbox.
3. Upload immutable events in idempotent batches.
4. Compare event counts, first/last IDs, and Merkle-style batch hashes.
5. Upload Insights-derived records allowed by retention policy.
6. Record the remote watermark locally.
7. Replay events written during preparation.
8. Run a final zero-difference verification.
9. Change project configuration from `local` to `remote`.
10. Retain SQLite as cache, outbox, and rollback source.

No local database is deleted during cutover.

### 19.2 Remote-to-local cutover

1. Request a consistent remote snapshot and terminal watermark.
2. Download and verify the event stream.
3. Rebuild a new local SQLite database.
4. Rebuild projections and run reconciliation.
5. Confirm no unflushed agent tokens or remote writers remain.
6. Change project configuration to `local`.
7. Revoke or retain remote credentials according to the selected disconnect
   policy.

### 19.3 Offline operation

Remote-mode clients append locally first and enqueue delivery. Events retain
their original IDs and timestamps. Reconnect drains the outbox in order.

Operations requiring current global coordination fail closed after a bounded
staleness window. Purely local observations and non-mutating analysis continue.

## 20. Insights Standalone Development

The Insights repository must pass its core test suite without:

- a configured `.ai-task-manager/` directory;
- GitHub credentials;
- a running AITM process;
- a provider transcript directory;
- a PostgreSQL server for local-only tests.

It achieves this through:

- `@kburson/aitm-ledger` protocol and SQLite test utilities;
- published conformance fixtures;
- synthetic Claude and Codex transcript fixtures;
- fake clocks and deterministic IDs;
- in-memory or temporary-file SQLite databases;
- fake Git/GitHub adapters;
- an injectable event source interface;
- containerized PostgreSQL only in the remote integration lane.

The new repository installs the published AITM skill for its own project
management, but that installation is excluded from production imports and from
the standalone test preconditions.

## 21. Web Visualization Product

The same browser application operates in both landscapes.

### 21.1 Local mode

`aitm-insights serve`:

- resolves the project ledger;
- starts the local API on loopback;
- serves the web assets;
- watches supported transcript sources;
- incrementally refreshes projections;
- opens the authenticated local URL.

### 21.2 Distributed mode

The hosted service serves the same assets and API contract. The browser does not
need local filesystem access.

### 21.3 Initial visualization set

- project execution timeline;
- task lifecycle and rework paths;
- task-to-session and session-to-task matrix;
- agent fan-out and parent/child run graph;
- active, idle, review, and plan time;
- verification and evidence timeline;
- commits, branches, integration, and delivery state;
- files and dependency relationships;
- inferred decisions, risks, and confidence;
- ingestion health, data gaps, and synchronization lag;
- filters for authoritative, observed, and inferred records.

Every derived chart links back to source event IDs and available evidence.

## 22. Error Handling and Diagnostics

### 22.1 Local ledger errors

- Newer schema: refuse writes and show the required package version.
- Corrupt database: preserve the file, run integrity diagnostics, and offer
  verified restore into a new file.
- `SQLITE_BUSY`: bounded retry with jitter, then append to the local producer
  queue and report degraded persistence.
- Disk full: stop accepting claims of durable persistence; preserve the pending
  outbox and surface a blocking diagnostic.
- Migration failure: rollback and keep the prior schema usable.

### 22.2 Journal errors

- Hash mismatch: stop restore or checkpoint advancement.
- Divergent remote data branch: fetch, verify whether segments are a strict
  append, and refuse destructive reconciliation.
- Push failure: retain local exported segments and retry later.
- Missing remote branch: initialize only after explicit confirmation.

### 22.3 Transcript errors

- Unsupported record: record `ingestion.warning` without aborting the file.
- Truncated JSONL: stop at the last complete record and retain the cursor.
- Rewritten transcript: compare content prefix hashes, invalidate affected
  derived records, and reprocess from the divergence point.
- Missing transcript: retain session identity and show an evidence gap.
- Potential secret: redact before persistence and record the redaction reason.

### 22.4 Remote errors

- Authentication failure: do not fall back to direct database access.
- Network failure: append locally and queue delivery.
- Schema mismatch: stop the incompatible batch before mutation.
- Partial batch: return per-event statuses and retry only unsuccessful IDs.
- PostgreSQL unavailable: API returns a retryable error and does not acknowledge
  persistence.

## 23. Migration from Current AITM Storage

Phase 1 uses four stages:

1. **Characterize:** capture current timing, lifecycle, evidence, approval, and
   delivery outputs as compatibility fixtures.
2. **Dual write:** retain current GitHub outputs while appending canonical
   ledger events.
3. **Compare:** generate parity reports for issue state, timing totals, evidence,
   approval, and integration.
4. **Thin:** move eligible high-volume telemetry out of GitHub only after
   separately approved parity thresholds are met.

The Phase 1 release stops after Compare. Thinning GitHub is a later,
evidence-backed change so the installed AITM used to build Insights retains the
current proven GitHub behavior.

## 24. Testing Strategy

### 24.1 Ledger package

- event-schema unit tests;
- canonical serialization and hash vectors;
- SQLite migration tests from every supported version;
- idempotency and conflicting-ID tests;
- multi-process WAL contention tests;
- crash-recovery and integrity tests;
- backup and restore tests;
- Git-journal segment and hash-chain tests;
- protocol fixture publication tests.

### 24.2 AITM integration

- task/session binding interval tests;
- lifecycle transition and refusal dual-write tests;
- timing event dual-write tests;
- verification, review, approval, and close evidence tests;
- linked-worktree shared-ledger tests;
- offline queue tests;
- GitHub-versus-ledger parity tests;
- clean-install tests against the published package tarball;
- package file inclusion and Node-version-floor tests.

### 24.3 Insights

- provider parser fixture tests;
- incremental cursor and rewritten-file tests;
- multiple tasks in one session;
- one task across multiple sessions;
- spawned-agent correlation;
- confidence and provenance tests;
- redaction and retention tests;
- local UI API and browser tests;
- PostgreSQL conformance tests;
- API authentication, authorization, rate-limit, and idempotency tests;
- synchronization interruption and resume tests;
- AWS, Azure, and GCP deployment smoke tests.

### 24.4 Cross-repository compatibility

The ledger package publishes a compatibility kit containing:

- JSON schema fixtures;
- valid and invalid event vectors;
- canonical hash vectors;
- SQLite seed databases at supported schema versions;
- expected query and projection results;
- remote API conformance cases.

AITM and Insights CI each test:

- the minimum supported ledger version;
- the currently pinned ledger version;
- the next unpublished workspace version where cross-repository CI is
  available.

## 25. Delivery Phases and Exit Criteria

### 25.1 Phase 1: AITM local ledger foundation

Phase 1 is complete when:

- `.db/aitm/project.sqlite` is the installed local ledger path;
- `.db/` is ignored and documented as durable;
- linked worktrees share one WAL-enabled database;
- AITM dual-writes all required authoritative event families;
- Git-journal checkpoint and verified restore pass;
- task/session attribution survives switching and compaction;
- remote transport is represented by a stable interface and conformance stub;
- existing GitHub behavior remains unchanged;
- `@kburson/aitm-ledger` is published;
- a packed, published-style AITM install passes in a clean repository;
- the published AITM package can initialize and manage the future Insights
  repository.

### 25.2 Phase 2: AITM Insights

Phase 2 is complete when:

- the new repository is governed by the published Phase 1 AITM;
- standalone fixture tests pass without configured AITM;
- local transcript mining and task attribution pass;
- the local web application provides the initial visualization set;
- the hosted API and PostgreSQL pass ledger conformance;
- agent clients use scoped API credentials rather than database credentials;
- local-to-cloud and cloud-to-local cutovers pass interruption tests;
- raw chat remains excluded by default;
- provider deployment paths have automated smoke evidence;
- AITM remains secure when Insights is stopped or uninstalled.

## 26. Program Risks and Mitigations

| Risk                                          | Mitigation                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite becomes another duplicated authority   | The append-only ledger is canonical for telemetry; GitHub remains canonical for visible requirements until a separately approved migration. |
| Multiple worktrees corrupt local state        | Main-worktree anchoring, WAL mode, short transactions, busy retry, and multi-process tests.                                                 |
| Git journal grows without bound               | Immutable compressed segments, checkpoint compaction policy, authoritative-only default, and retention reporting.                           |
| Public repository leaks data                  | Public remote push defaults off; raw chat excluded; derived Insights journal opt-in.                                                        |
| Insights weakens PM governance                | Authority classification and one-way dependency; inferred data cannot satisfy gates.                                                        |
| Insights cannot be tested independently       | Published ledger package, synthetic fixtures, fake adapters, and no AITM runtime imports.                                                   |
| Direct database credentials spread to agents  | Authenticated API with scoped revocable tokens; database credentials remain server-side.                                                    |
| Local/cloud cutover loses events              | Append-local-first outbox, idempotent IDs, watermarks, hash verification, and retained source database.                                     |
| Full transcripts overwhelm storage            | Stream processing, cursors, bounded excerpts, deduplication, compression, and opt-in raw archive.                                           |
| Node SQLite differs by supported Node release | Raise the floor to Node `>=22.15.0`, pin conformance vectors, and test the minimum and current LTS versions.                                |

## 27. Program Acceptance Criteria

- [ ] The program is expressed as two sequential implementation plans.
- [ ] Phase 1 completes and publishes before Phase 2 repository bootstrap.
- [ ] `.tmp/` remains purgeable and contains no durable database state.
- [ ] `.db/aitm/project.sqlite` is durable, untracked, and main-worktree
      anchored.
- [ ] The live SQLite database file is never committed to Git.
- [ ] A Git-backed immutable event journal can rebuild the local authoritative
      ledger after workstation loss.
- [ ] AITM remains fully governed without Insights.
- [ ] Insights provides local visualizations without requiring cloud
      deployment.
- [ ] Distributed clients use an authenticated API and never direct PostgreSQL
      credentials.
- [ ] Multiple sessions can contribute to one task.
- [ ] Multiple tasks can be separated within one session.
- [ ] Spawned-agent activity retains task and parent-session correlation.
- [ ] Raw transcript persistence is disabled by default.
- [ ] Every stored fact exposes authority, provenance, schema version, and
      confidence where applicable.
- [ ] The new Insights repository can test without a configured AITM project.
- [ ] The published Phase 1 AITM package can govern development of the Insights
      repository.

## 28. Implementation Documents

This design is implemented by:

- `docs/superpowers/plans/2026-07-28-aitm-local-ledger-foundation.md`
- `docs/superpowers/plans/2026-07-28-aitm-insights-project.md`

The first plan is executed in the existing AITM repository. The second plan is
retained here as the bootstrap contract and copied into the new Insights
repository at creation with this specification's immutable reference commit.

## 29. Primary Technical References

- [Node.js SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [SQLite write-ahead logging](https://www.sqlite.org/wal.html)
