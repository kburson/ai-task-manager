# Workspace Authority Stabilization Design

**Date:** 2026-07-29

**Status:** Approved in chat

## Goal

Make AITM safe for continued multi-agent development after the #925
Codex/Claude overlap by fixing two authority gaps and reconciling the local
workspace without losing unique work:

1. Review approval is valid only for the current Review epoch and its current
   Agent Review proof.
2. Governed work requires an exclusive, fenced issue/worktree lease whose
   storage boundary supports local linked worktrees and future distributed
   agents.
3. Existing local Codex-environment commits are tracked, verified, and
   delivered through the normal issue workflow.
4. Obsolete #925 and legacy-hook artifacts are backed up and retired only after
   equivalence checks.

## Incident Evidence

### Stale review authority

Issue #925 received a Full-Auto review approval against `fc4a5f11`. Corrective commits
continued through `fbdc2db6`. A sanctioned Review → Develop demotion invalidated
AC, Verification Command, Functional DoD, and Agent Review proof, but preserved
the old `aitm-review-approved` marker and visible Full-Auto footnote.

After a fresh Test and Agent Review cycle, `approve --human` returned
`already-approved` solely because the old marker existed. Close would have
accepted that stale marker. The operator had to remove it through the versioned
body mutator, document the correction, and stamp a new human approval.

The failure is distinct from:

- #932, which invalidated execution proof on demotion;
- #979, which distinguished genuine human approval from Full-Auto approval when
  creating a new marker; and
- #1037, which reused #932 invalidation during demotion-shaped reconciliation.

### Missing exclusive work ownership

Codex and Claude authenticated as the same GitHub user. Both therefore passed
the assignee gate. AITM allowed a second worktree to bind #925 while its timing
span was already active, then overwrote the single fleet entry for that issue.

The current mechanisms have different purposes:

- GitHub assignee: human/team accountability;
- task binding: session attribution and timing;
- fleet registry: observational status;
- issue mutator lock: short critical-section serialization;
- worktree path: filesystem location.

None is an exclusive authorization to perform governed work. Locks are also
worktree-anchored, so separate worktrees do not necessarily contend on the same
lock root.

### Workspace divergence

The main checkout has two unique local commits based on the pre-#925 trunk:

- `a9942483` — Codex local-worktree environment design and plan;
- `8448906a` — Codex local-worktree environment implementation.

Current `origin/trunk` has the two #925 integration commits instead. The local
and remote path sets do not overlap, and a merge-tree audit is clean.

The main checkout also contains two untracked legacy Claude hook stubs. Current
install tests explicitly assert that fresh installs do not write those stubs.

The preserved #925 worktree is clean, and its tree is identical to the #925
squash commit. A separate stash contains incomplete #925-era WIP and must be
exported before retirement.

## Program Structure

One stabilization epic owns three sequential children:

1. **Review-epoch authority**
2. **Exclusive issue/worktree lease**
3. **Codex local-worktree environment delivery**

The epic also owns the operational cleanup acceptance criteria. Implementation
is sequential because the first two children share lifecycle markers, binding,
preflight, and mutation authority surfaces. Read-only investigation and
independent review may run in parallel.

## Review-Epoch Authority

### Epoch identity

Every Review entry has a stable epoch identifier derived from the canonical
Review visit marker:

```text
review:<visit-number>:<entered-review-timestamp>
```

The identifier is structural, not inferred from current wall-clock time.
Re-entering Review creates a new epoch. A same-state Review action rerun within
one visit retains the epoch.

### Proof binding

The current Agent Review pass marker records:

- Review epoch;
- verified commit/tree SHA;
- verifier timestamp;
- validator set and result.

The current review approval marker records:

- Review epoch;
- Agent Review proof SHA;
- approval timestamp;
- human or Full-Auto provenance;
- Full-Auto signals when applicable.

An approval is authoritative only when all of these hold:

1. its epoch equals the latest Review epoch;
2. a passing Agent Review marker exists for that epoch;
3. its proof SHA equals the Agent Review proof SHA;
4. no later invalidation event exists for the epoch; and
5. the applicable human/Full-Auto lifecycle policy is satisfied.

Marker presence alone is never authority.

### Shared reducer

One review-authority module owns:

- epoch discovery;
- approval parsing and serialization;
- current-authority reduction;
- stale/current classification;
- invalidation transforms;
- legacy compatibility; and
- human/Full-Auto provenance projection.

Approve, demote, reconcile, Test lifecycle normalization, Review exit guards,
close gates, close convergence, and human-review audit call this module. They do
not carry private marker-presence interpretations.

### Approval and invalidation behavior

- Repeated approval in the same epoch with the same provenance and proof is an
  idempotent no-op.
- A stale approval never causes `already-approved`.
- `approve --human` after a fresh Agent Review writes current human authority,
  even when an older Full-Auto approval exists.
- Review → Develop demotion and demotion-shaped reconciliation invalidate the
  current epoch through the shared reducer.
- Forward reconciliation and unrelated body writes do not invalidate current
  authority.
- Final Review is unticked when its authority is invalidated.
- Full-Auto footnote content is removed when the Full-Auto authority it
  describes becomes stale.

Historical approval provenance remains auditable through the issue timeline,
the body version history, timing/audit comments, and an explicit invalidation
record. The current marker remains a projection of current authority rather
than an append-only event ledger.

### Legacy compatibility

A legacy approval marker without an epoch is classified:

- current only when the body contains no later Review re-entry, demotion, or
  approval-invalidation evidence; otherwise
- stale and non-authoritative.

The next successful approve rewrites the current projection using the epoch
schema. Close fails with repair guidance rather than silently accepting an
ambiguous legacy marker.

## Exclusive Issue/Worktree Lease

### Authority model

AITM introduces a storage-neutral `WorkLeaseStore` interface:

```text
acquire(request) -> lease
renew(leaseId, fencingToken) -> lease
verify(leaseId, fencingToken, operation) -> decision
switchLease(issueId, leaseId, fencingToken, targetRequest) -> lease
handoff(leaseId, fencingToken, recipient) -> lease
release(leaseId, fencingToken, reason) -> result
takeover(request, expectedToken, reason) -> lease
observe(issueId | worktreeId) -> lease | null
```

A lease contains:

- project and issue identity;
- lease ID;
- monotonically increasing fencing token;
- provider and agent/session/run identity;
- host/device identity;
- canonical worktree identity and display path;
- branch;
- acquired, heartbeat, and expiry timestamps;
- lifecycle state; and
- handoff/release/takeover audit metadata.

Two uniqueness constraints are authoritative:

1. one active write lease per issue;
2. one active write lease per canonical worktree.

`switchLease` atomically releases the current issue and acquires the target
issue in one storage transaction. If target acquisition fails, the current
lease remains unchanged. A handoff to an epic orchestrator retains the child
worktree identity and changes the holder to an integration principal; an
orchestrator's separate epic lease is attached to its distinct epic worktree
and does not violate worktree uniqueness.

### Durable local backend

The local backend is part of the planned AITM ledger boundary and stores its
state at:

```text
<main-worktree>/.db/aitm/project.sqlite
```

The lease child establishes the minimal `@kburson/aitm-ledger` workspace
boundary needed for this authority and raises the supported Node.js floor to
`>=22.15.0`. That keeps local storage on the built-in `node:sqlite` API without
an experimental runtime flag and aligns the stabilization work with the
previously designed hybrid-ledger package boundary. The child does not
implement the unrelated event journal, Insights projections, or hosted
PostgreSQL service.

It is never stored under `.tmp/aitm`. Every linked worktree resolves the same
main-worktree database. Acquisition, fencing-token increment, renewal, handoff,
and release are transactional.

The local backend coordinates linked worktrees and processes on one workstation.
PID/host liveness is supporting evidence, not the sole authority. A lease is not
reclaimed merely because its wall-clock TTL elapsed while the recorded holder
is demonstrably live.

### Distributed boundary

The same interface has an authenticated HTTPS/PostgreSQL adapter contract.
This stabilization program ships:

- the provider-neutral interface;
- the SQLite implementation;
- remote request/response schemas;
- adapter conformance fixtures; and
- fail-closed provider selection.

It does not pull unrelated Insights analytics or reporting into the lease
child.

When distributed authority is configured:

- the remote backend is authoritative;
- local SQLite may cache observations but cannot grant a lease;
- acquisition or renewal cannot succeed offline; and
- a stale former holder fails its next governed write because its fencing token
  is no longer current.

This makes current local development collision-safe without creating a local
architecture that must later be discarded.

### Enforcement points

Lease verification is required before:

- a work-intending task bind;
- source-write authorization and issue-attributed commits;
- lifecycle state mutation;
- evidence or issue-body mutation;
- approval, rejection, review, and close;
- branch/worktree orchestration that claims issue ownership.

Read-only status, reporting, and analysis do not require a write lease.
Short-lived issue mutator locks remain in place inside an already-valid lease.

Child processes inherit the lease ID and fencing token. A separately launched
Codex or Claude process does not inherit them and must acquire or receive an
audited handoff.

### Lifecycle semantics

- `start` acquires or resumes the holder's valid lease.
- Reentrant calls from the same session/worktree/token are idempotent.
- `pause` retains the lease and records paused state.
- `stop`, `close`, and explicit abandonment release it.
- Agent → orchestrator transfer uses audited handoff, not a second acquisition.
- Issue switching uses the atomic lease switch operation; it never releases
  first.
- Review may retain or hand off the lease; it never silently drops ownership.
- Takeover is explicit, reasoned, and increments the fencing token.
- A live holder is never automatically displaced.
- A dead or unreachable holder is reclaimed only through the defined
  liveness/expiry policy and an audit record.

### Fleet projection

The fleet registry becomes a projection of lease and binding events. It cannot
overwrite another active holder or delete a lease it does not own. `fleet
prune` repairs projections; it does not grant or revoke authority.

## Codex Local-Worktree Environment Delivery

The existing approved design, plan, and implementation are retained as one
tracked child issue.

Before altering local `trunk`:

1. export a bundle containing the two local commits;
2. create a named preservation branch;
3. archive the two untracked legacy hook stubs outside the repository; and
4. record hashes and exact ancestry.

The child branch is rebased onto current `origin/trunk`, verified against its
existing plan, and squash-integrated with a `[#N]` commit. The original commits
remain recoverable through the bundle and preservation branch until delivery
is confirmed.

No undocumented Codex app configuration schema is introduced. The checked-in
setup script, verifier, tests, and operator guide remain the deliverable.

## #925 Artifact Retirement

Before removing anything:

1. export a git bundle for `codex/925-close-convergence`;
2. export the incomplete stash as a binary patch and record its source SHA;
3. verify the preserved feature tree equals #925 squash commit `5a32d626`;
4. verify the worktree is clean; and
5. verify #925 is Closed, Done, Delivered, and reachable from `origin/trunk`.

After those checks:

- remove `.worktrees/925-close-convergence`;
- delete the squash-integrated feature branch;
- drop the exported #925 stash only after patch read-back succeeds; and
- run worktree prune dry-run plus live worktree enumeration.

No other worktree or branch is removed under this program. Unique, ambiguous,
host-managed, nested test, and unrelated issue worktrees remain untouched.

## Error Handling

### Review authority

- Missing or ambiguous epoch evidence fails close with repair guidance.
- A malformed current approval marker does not fall back to presence.
- Approval mutation uses the versioned issue-body writer and read-back
  verification.
- Partial invalidation reports its completed and pending phases and remains
  retry-safe.

### Lease authority

- Contention names the current holder, provider, session, worktree, and lease
  state without exposing secrets.
- A failed acquisition performs no local task bind, GitHub mutation, timing
  row, or fleet overwrite.
- A fencing mismatch blocks before governed effects.
- Backend unavailability fails closed for coordination-requiring writes.
- Release and handoff are idempotent and ownership-checked.

### Cleanup

- Every destructive cleanup action is preceded by an external backup and an
  exact target check.
- No `git clean`, broad recursive delete, hard reset, or stash drop occurs
  without the specific evidence described above.
- A failed rebase or verification leaves the preservation branch and bundle
  intact.

## Verification

### Review-epoch authority

- pure epoch/reducer tables;
- marker compatibility and serialization tests;
- approve current/stale/idempotent tests;
- demote and demotion-shaped reconcile parity;
- human and Full-Auto provenance tests;
- close/lifecycle fail-closed tests; and
- a hermetic #925 sequence:
  Review approval → demote → new commit → Test → Review → human approval →
  close.

### Work lease

- same issue, two processes: exactly one winner;
- different issues: both succeed;
- same issue, two linked worktrees: one winner;
- same worktree, two issues: second acquisition refused;
- child process inheritance;
- stale fencing-token refusal;
- live-holder protection;
- dead-holder reclaim;
- handoff, pause, release, close, and takeover audit;
- fleet projection reconstruction;
- SQLite transaction/concurrency tests; and
- shared conformance fixtures for SQLite and the remote adapter contract.

### Local environment and cleanup

- existing focused verifier and shell-contract tests;
- setup shell syntax;
- formatting, lint, fast, and slow repository suites;
- pre-integration delta, whitespace, ancestry, and merge-tree audit;
- post-integration trunk verification; and
- final clean-status, fleet, lock, worktree, stash, branch, and prune audit.

## Acceptance Summary

The program is complete only when:

- stale human or Full-Auto approval cannot authorize a later Review epoch;
- current human approval can supersede stale Full-Auto provenance;
- same-issue Codex/Claude work has one fenced winner;
- linked worktrees share durable local lease authority;
- distributed configuration cannot silently fall back to local authority;
- the local Codex environment work is tracked and delivered;
- main `trunk` is clean and aligned with `origin/trunk`;
- obsolete Claude hooks and #925 artifacts are externally recoverable but no
  longer present in the repository; and
- all governed issues are closed through AITM with verified trunk commits.

## Non-Goals

- Implementing unrelated Insights analytics or dashboards.
- Treating GitHub assignee, fleet JSON, or a disposable local file as lease
  authority.
- Allowing automated takeover of a demonstrably live holder.
- Removing unrelated worktrees or branches.
- Rewriting historical issue timelines.
- Weakening human-review or evidence gates to simplify recovery.
