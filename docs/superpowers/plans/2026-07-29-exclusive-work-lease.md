# Exclusive Work-Lease Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development and
> superpowers:test-driven-development. Implement sequentially and independently
> review every task.

**Goal:** Give governed issue work one exclusive, fenced holder across local
linked worktrees while preserving a non-disposable remote authority boundary.

**Architecture:** The minimal `@kburson/aitm-ledger` workspace package owns the
lease port, schemas, SQLite migrations, transactions, and shared conformance
fixtures. AITM selects SQLite or authenticated HTTPS authority, acquires on a
work-intending bind, propagates lease context to child processes, and verifies
the fencing token before governed effects. Fleet remains a projection.

**Tech Stack:** Node.js `>=22.15.0`, ESM, built-in `node:sqlite`, SQLite WAL,
`node:test`, JSON Schema, HTTPS transport contract.

## Global Constraints

- Local authority is `<main-worktree>/.db/aitm/project.sqlite`; `/.db/` is
  ignored and never committed.
- Remote configured means remote authoritative. Local state cannot grant,
  renew, hand off, or take over; unavailable remote authority fails writes
  closed.
- One active write lease exists per issue and per canonical worktree.
- `worktreeId` is derived from host identity plus the real worktree Git
  directory; `pathHash` hashes the real canonical display path. Symlink aliases
  cannot create a second identity, and a changed display path does not change
  the authoritative worktree ID.
- Fencing tokens increase monotonically. Former holders cannot mutate after
  handoff, takeover, release, or expiry.
- Live local holders are not reclaimed solely by elapsed TTL. Dead-holder
  takeover requires liveness evidence, expected token, and a reason.
- Bind failure leaves session, timing, GitHub, and fleet state unchanged.
- Active leases have a 15-minute TTL and renew before governed preflight when
  the heartbeat is at least 5 minutes old; a 60-second process hook supplies
  best-effort renewal during long commands. Paused leases use a 24-hour TTL and
  must renew on resume. Local liveness prevents TTL-only takeover; remote expiry
  fences the old holder and its next write fails closed.
- GitHub assignee remains human accountability; mutator locks remain
  short-lived serialization inside a valid lease; fleet is never authority.
- Read-only status/reporting needs no write lease.
- The session binding persists the non-secret lease context and preserves it
  across generic state/timing saves. Authentication secrets are never
  persisted.
- SQLite and HTTPS share a closed operation vocabulary. Unknown operations fail
  validation. Reuse of an idempotency key for a different canonical request
  fails with `idempotency-conflict`.
- The reviewed file inventory has 178 task assignments across 165 unique paths:
  Tasks 1-7 contain 13, 5, 17, 5, 116, 18, and 4 paths respectively.
  Lifecycle authority paths intentionally reappear in later tasks when the
  same provider, session, close, or fleet boundary needs another governed
  increment. If
  implementation discovers another required production path, update this plan
  and its inventory before editing it.
- This child excludes event write-ahead logging, Insights projections, remote service
  deployment, and PostgreSQL implementation.

---

### Task 1: Establish the Minimal Ledger Workspace

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Modify: `bin/cli.mjs`
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/release/publish-ledger-if-needed.mjs`
- Create: `packages/aitm-ledger/package.json`
- Create: `packages/aitm-ledger/src/index.mjs`
- Create: `packages/aitm-ledger/test/package-contract.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/install.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/core/package-boundary.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/core/ci-actions-node-pins.test.mjs`
- Create:
  `scripts/task-tracker/tests/integration/core/packed-ledger-install.test.mjs`

- [ ] Add failing package/installer tests for the workspace export, Node
      `>=22.15.0`, root and ledger pack contents, and exactly one generated
      root-scoped `/.db/` ignore in both this repository and installed consumer
      projects after fresh and repeated installation. Seed a similar ignore
      line to prove matching is line-aware, not substring-based.
- [ ] Run
      `node --test packages/aitm-ledger/test/package-contract.test.mjs`.
      Expected RED: package is absent.
- [ ] Add the workspace/package, root engine floor, lockfile entries, an exact
      Node `22.15.0` fast CI lane plus the current supported lane, an explicit
      `test:ledger` script, and independently publishable ledger metadata:
      version, license, engine, export map, files, and publish configuration.
      Root runtime resolution uses an exact ledger dependency and the release
      contract publishes a missing ledger version before the root, skips an
      already-published matching version, and fails closed on ambiguous
      registry/network errors. Root and ledger dry-run packs must exclude tests
      and include every required runtime module.
- [ ] Build both tarballs in project scratch, install them into a clean
      consumer, prove the installed CLI and ledger export load without a
      workspace symlink, and run the installed initializer twice. Assert
      required tarball paths and uniqueness rather than freezing incidental
      repository or pack file totals.
- [ ] Re-run the tests and `npm ci`. Expected GREEN.
- [ ] Commit:
      `git commit -m "[#${AITM_WORK_LEASE_ISSUE}] build(ledger): establish lease package boundary"`.

### Task 2: Define Lease Port, Records, and Conformance Vectors

**Files:**

- Create: `packages/aitm-ledger/src/lease/port.mjs`
- Create: `packages/aitm-ledger/src/lease/schema.mjs`
- Create: `packages/aitm-ledger/src/lease/errors.mjs`
- Create: `packages/aitm-ledger/test/lease-port.test.mjs`
- Create: `packages/aitm-ledger/test/fixtures/lease-conformance.mjs`

**Port:**

```js
acquire(request);
renew(request);
verify(request);
switchLease(request);
handoff(request);
release(request);
takeover(request);
observe(selector);
```

Every mutating request contains `projectId`, `idempotencyKey`, and an operation
timestamp. `verify` and `observe` are non-mutating and do not require an
idempotency key. `fencingToken` is a positive base-10 integer serialized as a
string on every JavaScript and JSON boundary. Tokens come from one
authority-wide strictly increasing sequence. Handoff, takeover, release,
expiry, and switch supersession advance the fence; renewal does not.

`verify.operation` is exactly one of `task-bind`, `source-write`,
`issue-attributed-commit`, `lifecycle-mutation`, `issue-body-mutation`,
`evidence-mutation`, `approval-mutation`, `review-mutation`, `close`, or
`branch-worktree-orchestration`. Unknown operations and aliases fail with
`invalid-request`.

`AcquireRequest` contains `projectId`, `issueId`, `mode: 'write'`,
`idempotencyKey`, `requestedAt`, `ttlMs`, and holder
`{ principalKind: 'worker', provider, agentRunId, sessionId, hostId,
worktreeId, pathHash, branch, pid }`. `RenewRequest` contains `projectId`,
`leaseId`, `fencingToken`, `idempotencyKey`, `requestedAt`, and `ttlMs`.
Every authority `issueId` is a canonical positive decimal string without a
leading `#`; session/UI references normalize at the adapter boundary so `1049`
and `#1049` can never create distinct authority records.
`VerifyRequest` contains `projectId`, `leaseId`, `fencingToken`, `operation`,
and `verifiedAt`. `SwitchLeaseRequest` contains the current project, issue,
lease, and fencing identity plus one target acquisition request; the source
issue is required so the returned transition receipt can be correlated without
adapter-side inference. `ReleaseRequest` contains the lease identity,
`releasedAt`, idempotency key, and a nonempty reason.

The lease adds `leaseId`, `fencingToken`, `state`, `acquiredAt`, `heartbeatAt`,
`expiresAt`, and audit metadata. Current usable state is `active` or `paused`;
terminal state is `released`, `expired`, or `superseded`. Stable error codes
are `invalid-request`, `idempotency-conflict`, `lease-contended`,
`worktree-contended`, `fence-stale`, `authority-unauthenticated`,
`authority-forbidden`, `authority-unavailable`, `holder-live`, and
`lease-not-held`.

`switchLease` performs target acquisition and current release atomically; target
failure preserves the old lease. Its result includes an idempotent transition
receipt authorizing exactly-once outgoing projection/timing finalization after
the authority transaction. Handoff retains the lease ID, issue, child worktree
identity, path hash, and branch; changes only the holder to an
`integration` principal; increments the fencing token; and returns an active
lease. `handed-off` is an audit event, not a usable lease state. The giver's old
token immediately fails, while an orchestrator may retain its separate epic
lease on a distinct epic worktree.

`TakeoverRequest` contains `projectId`, `issueId`, `expectedLeaseId`,
`expectedToken`, requester identity, `observedAt`, `idempotencyKey`, a nonempty
reason, and evidence
`{ kind, hostId, pid, checkedAt, detailsHash }`. Evidence kind is
`local-process-dead`, `remote-expired`, or `operator-attestation`; it is
validated and serialized identically by SQLite and HTTPS adapters.
`operator-attestation` says the holder is dead or unreachable; it cannot
displace a demonstrably live holder.

Idempotency keys are scoped to the project authority. The authority stores the
operation, canonical request digest, and terminal response. Exact replay returns
the original status and response before current-state or fencing checks. Reuse
for a different operation or canonical request fails with
`idempotency-conflict`; transport failures and `5xx` responses are not recorded.

- [ ] Add failing validation, idempotency, uniqueness, fencing, and sanitized
      contention tests using an in-memory contract double. Cover every mutator
      replay, conflicting key reuse, replay-before-fence evaluation, rejected
      numeric/zero/unsafe tokens, exhaustive operation vocabulary, handoff
      identity/fence behavior, and rejection of old tokens.
- [ ] Run `node --test packages/aitm-ledger/test/lease-port.test.mjs`.
      Expected RED.
- [ ] Implement the provider-neutral types, validation, errors, and reusable
      conformance suite.
- [ ] Re-run. Expected GREEN.
- [ ] Commit:
      `git commit -m "[#${AITM_WORK_LEASE_ISSUE}] feat(lease): define fenced authority port"`.

### Task 3: Implement Main-Worktree SQLite Authority

**Files:**

- Create: `packages/aitm-ledger/src/sqlite/open.mjs`
- Create: `packages/aitm-ledger/src/sqlite/migrations/001-leases.mjs`
- Create: `packages/aitm-ledger/src/sqlite/work-lease-store.mjs`
- Create: `packages/aitm-ledger/test/sqlite-work-lease-store.test.mjs`
- Create: `scripts/task-tracker/lib/main-worktree-path.mjs`
- Modify: `scripts/task-tracker/fleet-registry.mjs`
- Modify: `scripts/task-tracker/paths.mjs`
- Create:
  `scripts/task-tracker/lib/ledger/project-database-path.mjs`
- Create: `scripts/task-tracker/lib/ledger/project-identity.mjs`
- Create:
  `scripts/task-tracker/lib/work-lease/worktree-identity.mjs`
- Modify: `scripts/task-tracker/config.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/config.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/paths.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/project-database-path.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/ledger-project-identity.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/ledger-worktree-identity.test.mjs`
- Modify:
  `scripts/task-tracker/tests/slow/verbs/recovery-path-independence.test.mjs`

**Schema:** `schema_migrations`, `ledger_metadata`, `work_leases`,
`work_lease_events`, `work_bindings`, and `lease_fences`. `work_leases` has one
column for every lease field named in Task 2; `work_lease_events` adds event
ID/type, actor, reason, prior/new token, and canonical JSON; `work_bindings`
stores the current session/issue/worktree projection plus observed timestamp.
Partial unique indexes enforce issue and worktree ownership for every
ownership-retaining state (`active`, `paused`). Terminal states do not
participate.
Transactions use `BEGIN IMMEDIATE`, WAL, foreign keys, busy timeout, and atomic
fence increments.

`ledgerProjectId` is a generated UUID created once at initialization and stored
in `.ai-task-manager/task-tracker.json` plus `ledger_metadata`; it is not the
GitHub Projects node ID. Database open and remote configuration fail closed if
the two identities differ. Bootstrap follows this recovery matrix: config only
initializes DB from config; DB only atomically backfills config; neither commits
the winning UUID to DB under `BEGIN IMMEDIATE` and then atomically writes
config; both equal proceeds; both different fails closed. Concurrent
initializers must converge. The existing GitHub Projects `projectId` is never
accepted as `ledgerProjectId`.

`resolveMainWorktreePath(projectDir, { allowFallback = false })` becomes the
shared resolver imported and re-exported by fleet. Fleet may request its legacy
best-effort fallback; lease authority never does. Resolution failure returns
`main-worktree-unresolved` and creates no database.

`resolveWorktreeIdentity(projectDir, { hostId })` returns `{ worktreeId,
pathHash, displayPath }`. `displayPath` is the real canonical project path,
`pathHash` is its SHA-256 digest, and `worktreeId` hashes host identity plus the
real Git worktree directory. Raw display text never participates in uniqueness.

- [ ] Add failing tests for durable project identity, mismatch refusal, the
      bootstrap crash boundaries, concurrent initialization, strict
      main-worktree resolution, main and two linked worktrees sharing one
      database, symlink aliases, path moves, linked-worktree identity,
      same issue/two processes, different issues, same worktree/two issues,
      renew/release/handoff/switch idempotency, failed-switch preservation,
      project-wide fence monotonicity, retained-state uniqueness, stale fences,
      live protection, paused expiry, explicit dead-holder takeover, and
      positive-liveness rejection of operator attestation.
- [ ] Run the package store test plus the three new task-tracker tests. Expected
      RED.
- [ ] Implement path resolution, migration, store, liveness injection, and
      transactional operations.
- [ ] Re-run, including a child-process contention fixture. Expected exactly
      one winner and one sanitized contention result.
- [ ] Commit:
      `git commit -m "[#${AITM_WORK_LEASE_ISSUE}] feat(lease): add sqlite work authority"`.

### Task 4: Add Remote Contract and Fail-Closed Selection

**Files:**

- Create: `packages/aitm-ledger/src/lease/http-contract.mjs`
- Create: `packages/aitm-ledger/test/http-lease-contract.test.mjs`
- Create: `scripts/task-tracker/lib/work-lease/provider.mjs`
- Create: `scripts/task-tracker/lib/work-lease/http-store.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/work-lease-provider.test.mjs`

- [ ] Add failing shared conformance tests for request/response schemas,
      authentication headers, idempotency keys, error mapping, stale fences,
      and network failure. Cover header/body idempotency mismatch, selector XOR,
      absent observation, redirect rejection, every status/error mapping,
      malformed/unknown envelopes, missing credentials, TLS/DNS/timeout, and
      token redaction. Assert remote mode never opens, migrates, reads as
      authority, or mutates SQLite.
- [ ] Run the two test files. Expected RED.
- [ ] Implement `/v1/work-leases:acquire`, `:renew`, `:verify`, `:switch`,
      `:handoff`, `:release`, `:takeover`, and `GET /v1/work-leases` with JSON
      bodies matching Task 2, `Authorization: Bearer`, `Idempotency-Key`, and
      shared success/error envelopes. Fresh acquire/takeover return `201`;
      other successes and exact replays return their stored `200`/`201`.
      `invalid-request` maps to `400`, authentication to `401`, authorization to
      `403`, contention/live/idempotency conflict to `409`, stale/not-held to
      `412`, and unavailable to `503`. `GET` requires exactly one issue/worktree
      selector and returns `{ lease: null }` when absent. Select from
      `.ai-task-manager/task-tracker.json#workLease` fields `authority`,
      `endpoint`, `projectId`, and `tokenEnv`; `projectId` must equal the
      persisted `ledgerProjectId`. The default token environment name is
      `AITM_LEASE_AUTH_TOKEN`. Serialize `TakeoverRequest.evidence` verbatim
      after schema validation. Require HTTPS, reject redirects, validate the
      token environment name, and read the nonempty token only at request time.
      Never persist or expose the token. In remote mode every authority
      operation, including verify, fails closed and never falls back to local
      authority or an observation cache.
- [ ] Re-run. Expected GREEN.
- [ ] Commit:
      `git commit -m "[#${AITM_WORK_LEASE_ISSUE}] feat(lease): define remote authority contract"`.

### Task 5: Acquire, Propagate, and Verify Lease Context

**Files:**

- Create: `scripts/task-tracker/lib/work-lease/context.mjs`
- Create: `scripts/task-tracker/lib/work-lease/child-environment.mjs`
- Create: `scripts/task-tracker/lib/work-lease/guard.mjs`
- Modify: `scripts/task-tracker/lib/work-lease/governed-effect.mjs`
- Create: `scripts/task-tracker/lib/work-lease/verb-mutation-scope.mjs`
- Modify: `scripts/task-tracker/verbs/start.mjs`
- Modify: `scripts/task-tracker/verbs/resume.mjs`
- Modify: `scripts/task-tracker/verbs/switch.mjs`
- Modify: `scripts/task-tracker/verbs/approve.mjs`
- Modify: `scripts/task-tracker/verbs/plan-approve.mjs`
- Modify: `scripts/task-tracker/verbs/review.mjs`
- Modify: `scripts/task-tracker/verbs/promote.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/session-state.mjs`
- Modify: `scripts/task-tracker/state.mjs`
- Modify: `scripts/task-tracker/lib/state-recording.mjs`
- Modify: `scripts/task-tracker/lib/verb-preflight.mjs`
- Modify: `scripts/task-tracker/lib/assignee-guard.mjs`
- Modify: `scripts/task-tracker/issue-mutator-lock.mjs`
- Modify: `scripts/task-tracker/lib/runtime-capabilities.mjs`
- Modify: `scripts/task-tracker/runtime.mjs`
- Modify: `scripts/task-tracker/gh-timing-comment.mjs`
- Modify: `scripts/task-tracker/queue.mjs`
- Modify: `scripts/task-tracker/hook-handler.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `.claude/settings.json`
- Modify: `.codex/hooks.json`
- Modify: `scripts/task-tracker/bash-guard.mjs`
- Create: `scripts/task-tracker/lib/bash-effect-classifier.mjs`
- Modify: `scripts/task-tracker/lib/guard-entrypoint.mjs`
- Modify: `scripts/task-tracker/lib/gh-edit-guard.mjs`
- Modify: `scripts/task-tracker/source-edit-gate.mjs`
- Modify: `scripts/task-tracker/activity-guard.mjs`
- Modify: `scripts/task-tracker/lib/issue-body-mutate.mjs`
- Modify: `scripts/task-tracker/lib/functional-dod-derive.mjs`
- Modify: `scripts/task-tracker/lib/close-disposition.mjs`
- Modify: `scripts/task-tracker/lib/terminal-disposition.mjs`
- Modify: `scripts/task-tracker/lib/closed-issue-convergence.mjs`
- Modify: `scripts/task-tracker/lib/apply-review-delta.mjs`
- Modify: `scripts/task-tracker/lib/full-auto-merge-execute.mjs`
- Modify: `scripts/task-tracker/lib/lifecycle-dod.mjs`
- Modify: `scripts/task-tracker/lib/human-reviewer-audit.mjs`
- Modify: `scripts/task-tracker/lib/review-derive-rescan.mjs`
- Modify: `scripts/task-tracker/lib/stage-entry-markers.mjs`
- Modify: `scripts/task-tracker/lib/move-state/move-state-core.mjs`
- Modify: `scripts/task-tracker/lib/move-state/audit-timing.mjs`
- Modify: `scripts/task-tracker/lib/move-state/cache-unpark.mjs`
- Modify: `scripts/task-tracker/lib/unpark-dependents.mjs`
- Modify: `scripts/task-tracker/lib/move-state/github-mutation.mjs`
- Modify: `scripts/task-tracker/lib/move-state/guard-execution.mjs`
- Modify: `scripts/task-tracker/lib/move-state/post-commit-tail.mjs`
- Modify: `scripts/task-tracker/commit-trail-handler.mjs`
- Modify: `scripts/task-tracker/merge-back.mjs`
- Modify: `scripts/task-tracker/sync-epic.mjs`
- Modify: `scripts/task-tracker/cut-epic-branch.mjs`
- Modify: `scripts/task-tracker/cut-child-worktree.mjs`
- Modify: `scripts/gh/dispatch-prep.mjs`
- Modify: `scripts/gh/ensure-wave-parent.mjs`
- Modify: `scripts/gh/log-issue-time.mjs`
- Modify: `scripts/gh/update-event-fields.mjs`
- Modify: `scripts/gh/move-state.mjs`
- Create:
  `scripts/task-tracker/tests/integration/lib/exclusive-work-lease.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/work-lease-child-environment.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/governed-effect.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/work-lease-guard.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/promote-spawn-timeout.test.mjs`
- Modify: `scripts/task-tracker/merge-back.test.mjs`
- Modify: `scripts/task-tracker/sync-epic.test.mjs`
- Modify: `scripts/task-tracker/cut-epic-branch.test.mjs`
- Modify: `scripts/task-tracker/cut-child-worktree.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/gh/coverage-dispatch-prep.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/gh/dispatch-prep-inprocess.test.mjs`
- Modify:
  `scripts/task-tracker/tests/slow/lib/ensure-wave-parent.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/verbs/close-governed-boundary.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/terminal-disposition.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/closed-issue-recovery.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/closed-issue-recovery-live-state.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/closed-issue-actions.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/apply-review-delta.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/coverage-apply-review-delta.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/full-auto-merge-execute.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/full-auto-merge-path.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/close-lifecycle-tick-retry.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/close-strip-labels.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/core/close-emission-order.test.mjs`
- Modify:
  `scripts/task-tracker/tests/slow/verbs/coverage-close.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/close-convergence-wiring-helpers.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/close-convergence-wiring.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/close-convergence-finalize.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/close-drain.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/close-converge-audit-emission.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/close-force-atomic.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/close-repair.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/close-reconcile-lifecycle.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/close-review-authority-wiring.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/core/close-board-body-agreement.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/core/close-flush-timing.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/close-fail-closed.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/close-gate-order.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/cascade-child-close-fail-closed.test.mjs`
- Modify:
  `scripts/task-tracker/tests/characterization/orchestrators.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/runtime-capabilities.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/gh/move-state-governed-boundary.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/coverage-cache-unpark.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/coverage-review.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/coverage-unpark-dependents.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/move-state/event-field-sync-noop.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/update-event-fields-states.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/verbs/review-state-action.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/cross-worktree-bind-resume.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/state.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/session-state.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/work-lease-session-state.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/work-lease-timing-projection.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/work-lease-timing-queue-consumers.test.mjs`
- Modify:
  `scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs`

- [ ] Add failing tests proving acquisition precedes bind effects, loser has no
      assignee-claim/queue/timing/session/GitHub/fleet mutation, child process
      inheritance works, and state/body/evidence/approval/review/close/commit
      seams reject missing or stale tokens. Include atomic issue switching,
      source/activity gates, body mutation, commit trail, child dispatch/merge,
      adoption of a pre-upgrade active session, crash after grant before
      session write, and crash after switch before outgoing/incoming effects.
      Inject crashes before authority mutation, after authority commit before
      receipt persistence, after each outgoing/incoming projection, and after a
      remote write succeeds before its local checkpoint. Prove restart replays
      the exact canonical request and reconciles each projection without a
      duplicate.
      Prove exact runtime key names, absence of secrets, lease-context
      preservation across generic `saveState`, no cross-issue carry, and
      stale-token-safe clear.
- [ ] Run the named focused tests. Expected RED: cross-worktree bind currently
      succeeds and guarded seams lack lease context.
- [ ] Acquire on work-intending bind, persist only non-secret identity,
      propagate `AITM_LEASE_ID` and `AITM_FENCING_TOKEN` to owned child
      processes, and verify before governed effects. On the first governed
      action by a pre-upgrade bound session, acquire an adoption lease before
      any effect and persist it only if acquisition wins. A resume that needs
      renewal uses the same durable intent protocol with `operation: resume`:
      persist the exact `RenewRequest` and all four projection inputs, attach
      and validate the exact renewal receipt, then reconcile
      session/fleet/timing/GitHub before clearing the intent. Use `switchLease` for
      issue switches. Split read-only eligibility from mutating assignee claim;
      acquisition/switch happens before claim, queue drain, pause finalization,
      session, timing, GitHub, or fleet effects. Authority writes its lease,
      event, and binding atomically; switch returns a durable transition receipt
      whose projections replay exactly once after a crash. Before calling
      `acquire` or `switchLease`, atomically persist a non-secret session intent
      containing the exact canonical request, including its timestamps and
      idempotency key. The intent remains associated with the outgoing binding
      and records no granted authority. On restart, replay that byte-equivalent
      request; exact authority replay recovers the original lease or transition
      receipt. After the call succeeds, atomically attach the receipt and its
      `transitionId` before any projection. Checkpoint session/fleet/timing/GitHub
      projection inputs and completion per transition. A local checkpoint alone
      is not completion proof: every retryable external projection must be
      naturally idempotent or embed and read back the `transitionId` before retry
      so a network-success/local-crash boundary cannot duplicate it. Clear the
      intent only after all projections are positively reconciled. Persist
      an exact, non-secret prior-session snapshot (raw bytes plus digest, or
      explicit absence) with acquire intent so a deterministic no-grant outcome
      can restore the pre-attempt session after a process restart without
      overwriting a newer intent. Give every session/fleet/timing/GitHub
      projection a stable `projectionId` derived from the operation and acquire
      idempotency key; require callbacks to read back that identity and return a
      matching positive reconciliation proof before marking completion.
      Validate persisted request, trusted holder, authority project, receipt,
      and all four projection identities before any projection callback. For
      process-restart recovery, correlate the trusted holder by stable logical
      identity (provider, run, session, host, worktree, path, and branch), not
      PID, while replaying the original persisted acquire request byte-for-byte
      and validating its receipt against that original holder. Build a
      post-acquire release request from the validated receipt's `acquiredAt` so
      release chronology and retry identity remain stable. Persist
      neither bearer credentials nor token environment names in the intent or
      receipt. Persist session
      `lease: { projectId, leaseId, fencingToken, worktreeId }`, preserve it
      during same-issue state saves, and clear only on matching token. Register a
      60-second heartbeat hook while an owning process lives and renew at
      preflight/resume according to the TTL policy.
- [ ] Re-run focused tests. Expected GREEN; read-only status remains available.
- [ ] Commit:
      `git commit -m "[#${AITM_WORK_LEASE_ISSUE}] feat(lease): enforce governed work ownership"`.

### Task 6: Lifecycle, Fleet Projection, Handoff, and Recovery

**Files:**

- Modify: `packages/aitm-ledger/src/lease/port.mjs`
- Modify: `packages/aitm-ledger/src/lease/schema.mjs`
- Modify: `packages/aitm-ledger/src/lease/http-contract.mjs`
- Modify: `packages/aitm-ledger/src/sqlite/migrations/001-leases.mjs`
- Modify: `packages/aitm-ledger/src/sqlite/work-lease-store.mjs`
- Modify: `scripts/task-tracker/lib/work-lease/provider.mjs`
- Modify: `scripts/task-tracker/lib/work-lease/http-store.mjs`
- Modify: `scripts/task-tracker/lib/work-lease/context.mjs`
- Modify: `scripts/task-tracker/lib/work-lease/guard.mjs`
- Modify: `scripts/task-tracker/session-state.mjs`
- Modify: `scripts/task-tracker/fleet-registry.mjs`
- Modify: `scripts/task-tracker/verbs/pause.mjs`
- Modify: `scripts/task-tracker/verbs/stop.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/verbs/fleet.mjs`
- Modify: `scripts/task-tracker/cut-child-worktree.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/work-lease-lifecycle.test.mjs`
- Modify:
  `scripts/task-tracker/tests/integration/lib/two-sessions-same-issue.test.mjs`

- [ ] Add failing tests: pause retains with the paused TTL, resume renews,
      remote renewal loss fences writes, stop/close release, Review explicitly
      retains or hands off, deregistration cannot delete another holder,
      takeover audits reason/token, active/paused uniqueness, terminal release
      of uniqueness, handoff leaving the new holder active, and fleet
      reconstruction from lease plus bind observations.
- [ ] Run focused tests. Expected RED.
- [ ] Implement ownership-checked lifecycle operations and reconstruct fleet
      from `work_leases` plus `work_bindings`; these lease-scoped binding
      observations are not the unrelated general event journal. Fleet
      deregistration and stale pruning are holder/token checked and can neither
      release authority nor delete another holder. Review handoff increments the
      fence and changes the principal; pause never releases uniqueness;
      stop/close release only the matching holder and token.
- [ ] Re-run. Expected GREEN.
- [ ] Commit:
      `git commit -m "[#${AITM_WORK_LEASE_ISSUE}] feat(lease): govern handoff and fleet projection"`.

### Task 7: Documentation and Full Verification

**Files:**

- Modify: `docs/DESIGN.md`
- Modify: `docs/guides/parallel-agents.md`
- Create: `docs/guides/work-leases.md`
- Modify: `cspell-dictionary.txt`

- [ ] Document authority boundaries, local/remote modes, contention, handoff,
      takeover, recovery, secrets, and the no-fallback contract.
- [ ] Run:

  ```bash
  npm ci
  npm run test:ledger
  node --test \
    scripts/task-tracker/tests/unit/lib/install.test.mjs \
    scripts/task-tracker/tests/unit/core/package-boundary.test.mjs \
    scripts/task-tracker/tests/unit/core/ci-actions-node-pins.test.mjs \
    scripts/task-tracker/tests/integration/core/packed-ledger-install.test.mjs \
    scripts/task-tracker/tests/unit/lib/project-database-path.test.mjs \
    scripts/task-tracker/tests/unit/lib/ledger-project-identity.test.mjs \
    scripts/task-tracker/tests/unit/lib/ledger-worktree-identity.test.mjs \
    scripts/task-tracker/tests/unit/lib/work-lease-provider.test.mjs \
    scripts/task-tracker/tests/unit/lib/work-lease-lifecycle.test.mjs \
    scripts/task-tracker/tests/unit/lib/work-lease-session-state.test.mjs \
    scripts/task-tracker/tests/unit/lib/cross-worktree-bind-resume.test.mjs \
    scripts/task-tracker/tests/integration/lib/exclusive-work-lease.test.mjs \
    scripts/task-tracker/tests/integration/lib/two-sessions-same-issue.test.mjs
  npm run format:check
  npm run lint
  # Generate exact unit and slow inventories from run-tests-lanes.mjs, split
  # each deterministically into bounded disjoint halves, run all four halves
  # with node --test, and assert each original inventory equals its partition
  # union with no duplicate or omitted file.
  npm run test:integration
  npm pack --dry-run --json --ignore-scripts
  npm pack --dry-run --json --ignore-scripts --workspace @kburson/aitm-ledger
  git diff --check
  ```

  Expected: exit `0` throughout, exact inventory coverage with no duplicates or
  omissions, every command below the verification ceiling, required runtime
  files and no tests in both tarballs, exactly one lease winner in contention
  tests, and no whitespace errors.

- [ ] Commit:
      `git commit -m "[#${AITM_WORK_LEASE_ISSUE}] docs(lease): document exclusive work authority"`.
