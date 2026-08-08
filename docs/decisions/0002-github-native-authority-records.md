# ADR 0002 — GitHub-Native Authority Records

**Date:** 2026-07-31

**Status:** Accepted

**Supersedes:** The SQLite/PostgreSQL/hosted-API authority direction in the
workspace-authority and work-lease plans associated with #1048, #1049, and #1053

---

## Context

AITM must coordinate governed work across local linked worktrees, disposable
cloud agents, multiple AI platforms, and multiple human workstations. The
previous design used a main-worktree SQLite database for local authority and an
authenticated HTTPS service backed by PostgreSQL for distributed authority.

That design made local state unreachable to disposable cloud environments and
required every distributed adopter to operate or purchase a database and API
service. A multi-tenant service could share the cost, but would create a hosted
AITM product, tenancy model, credential system, and operational dependency that
are not necessary for the core development workflow.

AITM already requires GitHub for repository access, issues, comments, project
state, identities, and collaboration. GitHub issue comments have stable global
node IDs and can be fetched directly or in a batched GraphQL node query.

The existing body-centric lifecycle is distributed but rewrites the issue body
frequently. It mixes stable story intent with mutable AC/VC/DoD state, evidence,
approvals, timing, and hidden markers.

## Decision

GitHub Issues and issue comments are the only durable authority for AITM story
tracking, coordination, lifecycle, review, and integration records.

### Stable issue body

The issue body contains the story reason, scope, research, dependencies, plan
metadata, and a hidden directory mapping singleton record types to opaque GitHub
comment node IDs. The directory is initialized once and normally remains
unchanged through the SDLC.

### Singleton comments

Exactly one mutable comment per singleton type holds the current Delivery
Contract, coordination, evidence, or timing projection. The structured hidden
JSON is canonical; visible Markdown is generated for humans.

### Immutable capsules

Coarse-grained assignments, worker results, evidence, reviews, transitions,
handoffs, integrations, corrections, and sealed contracts are append-only
capsules. Corrections supersede earlier record IDs rather than editing history.

### Scoped coordination

Each governed epic or standalone issue has one coordinator. A parent
coordinator may delegate a nested epic to another AI platform through a scoped,
epoch-fenced grant. Workers append submissions; only the active coordinator may
accept them and update authoritative projections.

### Append-first mutation

An immutable record is written and read back before mutable projections are
updated. Projection writes are replayable. A crash leaves either no authoritative
record or an authoritative record with a repairable stale projection.

### Derived caches

AITM Insights may materialize GitHub data in IndexedDB. Local SQLite may be used
for disposable read optimization only if introduced later. No cache may satisfy
a governed gate or grant authority.

## Alternatives Considered

### Local SQLite authority

Rejected as the distributed authority. Separate clones and disposable cloud
environments receive separate databases and cannot safely coordinate without a
new synchronization service.

### Remote PostgreSQL plus HTTPS API

Rejected as a required dependency. It is technically capable but adds recurring
cost, deployment, security, tenancy, availability, and maintenance burdens that
would reduce adoption.

### Multi-tenant hosted AITM service

Rejected for the current product scope. It would centralize costs but create an
unnecessary hosted product and account boundary.

### Continue storing everything in the issue body

Rejected. It keeps one parse surface but causes high body churn, mixes stable and
mutable concerns, and makes Markdown section placement and checkbox state carry
too much authority.

### Separate mutable index comment

Rejected for version 1. A body pointer to an index followed by pointers to the
real records adds a cold-read hop and another mutable failure surface. The small
set of singleton IDs fits directly in the body directory.

### Index every capsule in GitHub

Rejected. Creating a capsule and then updating a catalog recreates a two-write
consistency problem for every event. Accepted capsule IDs belong in current
projections; Insights builds the comprehensive index locally.

## Consequences

### Positive

- Distributed authority is available anywhere GitHub is available.
- Public projects incur no separate infrastructure charge.
- Private projects reuse existing GitHub access and enterprise controls.
- The body becomes stable and readable as the story record.
- Known singleton comments are retrieved in one batched GraphQL request.
- Immutable records provide an auditable repair path after crashes.
- Codex and Claude can coordinate through scoped grants without sharing a local
  database.
- Insights can rebuild its read model from the source of truth.

### Negative

- GitHub latency and rate limits constrain record granularity and polling.
- Issue-comment updates are not multi-object transactions.
- Manual edits and deletions must be detected and repaired.
- GitHub availability is required for authoritative progress.
- A cold Insights rebuild must scan issue comments that are not referenced by
  current projections.
- The compatibility period must support both legacy body contracts and the new
  comment contract.

### Required mitigations

- one authoritative coordinator per governed scope;
- epoch-fenced grants and assignments;
- immutable predecessor-linked record chains;
- canonical JSON, hashes, and read-back verification;
- coarse capsule writes and batched/cached reads;
- fail-closed conflict handling;
- sealed Delivery Contract snapshots;
- versioned schema and legacy adapters; and
- crash-injection, fork, deletion, and rebuild tests.

## Migration Decision

Existing issues are not bulk rewritten. A versioned authority locator selects
`legacy-body/v1` or `github-records/v1`. New governed issues use GitHub records
after the feature reaches parity. Active legacy issues are adopted individually
through a dry-run, parity check, singleton initialization, contract seal, body
directory write, and read-back verification.

Issues #1053 and #1054 are superseded rather than silently re-scoped in Develop.
Their exact pre-pivot branch tips are preserved under:

- `codex/archive-1053-pre-github-native-pivot`; and
- `codex/archive-1054-pre-github-native-pivot`.

New work may salvage storage-neutral invariants from those branches, but it does
not merge their SQLite/HTTPS authority implementation wholesale.

## References

- `docs/superpowers/specs/2026-07-31-github-native-authority-records-design.md`
- `docs/superpowers/plans/2026-07-31-github-native-authority-records.md`
- `docs/architecture/2026-07-31-issues-1053-1054-pivot-artifacts.md`
- GitHub GraphQL `nodes(ids:)` query and `IssueComment` node identity
