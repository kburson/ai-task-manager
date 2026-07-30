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
- This child excludes event journaling, Insights projections, remote service
  deployment, and PostgreSQL implementation.

---

### Task 1: Establish the Minimal Ledger Workspace

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Modify: `bin/cli.mjs`
- Modify: `.github/workflows/ci.yml`
- Create: `packages/aitm-ledger/package.json`
- Create: `packages/aitm-ledger/src/index.mjs`
- Create: `packages/aitm-ledger/test/package-contract.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/install.test.mjs`

- [ ] Add failing package/installer tests for the workspace export, Node
      `>=22.15.0`, and exactly one generated `/.db/` ignore in both this
      repository and installed consumer projects.
- [ ] Run
      `node --test packages/aitm-ledger/test/package-contract.test.mjs`.
      Expected RED: package is absent.
- [ ] Add the workspace/package, root engine floor, lockfile entries, an exact
      Node `22.15.0` CI lane plus the current supported lane, and package
      export.
- [ ] Re-run the test and `npm ci`. Expected GREEN.
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
renew(leaseId, fencingToken);
verify(leaseId, fencingToken, operation);
switchLease(leaseId, fencingToken, targetRequest);
handoff(leaseId, fencingToken, recipient);
release(leaseId, fencingToken, reason);
takeover(request, expectedToken, reason);
observe(selector);
```

`AcquireRequest` contains `projectId`, `issueId`, `mode: 'write'`,
`idempotencyKey`, `requestedAt`, `ttlMs`, and holder
`{ provider, agentRunId, sessionId, hostId, worktreeId, pathHash, branch, pid }`.
The lease adds `leaseId`, `fencingToken`, `state`, `acquiredAt`, `heartbeatAt`,
`expiresAt`, and audit metadata. State is `active`, `paused`, `handed-off`,
`released`, `expired`, or `superseded`. Error codes are stable:
`lease-contended`, `worktree-contended`, `fence-stale`,
`authority-unavailable`, `holder-live`, and `lease-not-held`.

`switchLease` performs target acquisition and current release atomically; target
failure preserves the old lease. Handoff retains the child worktree identity
and changes the holder to an `integration` principal, so an orchestrator can
retain its separate lease on a distinct epic worktree.

`TakeoverRequest` contains `projectId`, `issueId`, `expectedLeaseId`,
`expectedToken`, requester identity, `observedAt`, `idempotencyKey`, a nonempty
reason, and evidence
`{ kind, hostId, pid, checkedAt, detailsHash }`. Evidence kind is
`local-process-dead`, `remote-expired`, or `operator-attestation`; it is
validated and serialized identically by SQLite and HTTPS adapters.

- [ ] Add failing validation, idempotency, uniqueness, fencing, and sanitized
      contention tests using an in-memory contract double.
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
- Create:
  `scripts/task-tracker/lib/ledger/project-database-path.mjs`
- Create: `scripts/task-tracker/lib/ledger/project-identity.mjs`
- Modify: `scripts/task-tracker/config.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/project-database-path.test.mjs`
- Create:
  `scripts/task-tracker/tests/unit/lib/ledger-project-identity.test.mjs`

**Schema:** `schema_migrations`, `ledger_metadata`, `work_leases`,
`work_lease_events`, `work_bindings`, and `lease_fences`. `work_leases` has one
column for every lease field named in Task 2; `work_lease_events` adds event
ID/type, actor, reason, prior/new token, and canonical JSON; `work_bindings`
stores the current session/issue/worktree projection plus observed timestamp.
Partial unique indexes enforce active issue and active worktree ownership.
Transactions use `BEGIN IMMEDIATE`, WAL, foreign keys, busy timeout, and atomic
fence increments.

`ledgerProjectId` is a generated UUID created once at initialization and stored
in `.ai-task-manager/task-tracker.json` plus `ledger_metadata`; it is not the
GitHub Projects node ID. Database open and remote configuration fail closed if
the two identities differ.

- [ ] Add failing tests for durable project identity, mismatch refusal, the
      main-worktree resolver, two linked worktrees,
      same issue/two processes, different issues, same worktree/two issues,
      renew/release/handoff/switch idempotency, failed-switch preservation,
      stale fences, live protection, paused expiry, and dead-holder takeover.
- [ ] Run the two new test files. Expected RED.
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
      and network failure. Assert remote mode never calls SQLite mutation.
- [ ] Run the two test files. Expected RED.
- [ ] Implement `/v1/work-leases:acquire`, `:renew`, `:verify`, `:switch`,
      `:handoff`, `:release`, `:takeover`, and `GET /v1/work-leases` with JSON
      bodies matching Task 2, `Authorization: Bearer`, `Idempotency-Key`, and
      `200/201/409/412/503` error mapping. Select from
      `.ai-task-manager/task-tracker.json#workLease` fields `authority`,
      `endpoint`, `projectId`, and `tokenEnv`; `projectId` must equal the
      persisted `ledgerProjectId`. The default token environment name is
      `AITM_LEASE_AUTH_TOKEN`. Serialize `TakeoverRequest.evidence` verbatim
      after schema validation. Never persist the token or auto-fallback from
      `remote` to `local`.
- [ ] Re-run. Expected GREEN.
- [ ] Commit:
      `git commit -m "[#${AITM_WORK_LEASE_ISSUE}] feat(lease): define remote authority contract"`.

### Task 5: Acquire, Propagate, and Verify Lease Context

**Files:**

- Create: `scripts/task-tracker/lib/work-lease/context.mjs`
- Create: `scripts/task-tracker/lib/work-lease/guard.mjs`
- Modify: `scripts/task-tracker/verbs/start.mjs`
- Modify: `scripts/task-tracker/verbs/resume.mjs`
- Modify: `scripts/task-tracker/verbs/switch.mjs`
- Modify: `scripts/task-tracker/session-state.mjs`
- Modify: `scripts/task-tracker/lib/verb-preflight.mjs`
- Modify: `scripts/task-tracker/lib/assignee-guard.mjs`
- Modify: `scripts/task-tracker/issue-mutator-lock.mjs`
- Modify: `scripts/task-tracker/lib/runtime-capabilities.mjs`
- Modify: `scripts/task-tracker/bash-guard.mjs`
- Modify: `scripts/task-tracker/lib/gh-edit-guard.mjs`
- Modify: `scripts/task-tracker/source-edit-gate.mjs`
- Modify: `scripts/task-tracker/activity-guard.mjs`
- Modify: `scripts/task-tracker/lib/issue-body-mutate.mjs`
- Modify: `scripts/task-tracker/commit-trail-handler.mjs`
- Modify: `scripts/task-tracker/merge-back.mjs`
- Modify: `scripts/task-tracker/sync-epic.mjs`
- Modify: `scripts/gh/dispatch-prep.mjs`
- Create:
  `scripts/task-tracker/tests/integration/lib/exclusive-work-lease.test.mjs`
- Modify:
  `scripts/task-tracker/tests/unit/lib/cross-worktree-bind-resume.test.mjs`

- [ ] Add failing tests proving acquisition precedes bind effects, loser has no
      bind/timing/GitHub/fleet mutation, child process inheritance works, and
      state/body/evidence/approval/review/close/commit seams reject missing or
      stale tokens. Include atomic issue switching, source/activity gates, body
      mutation, commit trail, child dispatch/merge, and adoption of a
      pre-upgrade active session.
- [ ] Run the named focused tests. Expected RED: cross-worktree bind currently
      succeeds and guarded seams lack lease context.
- [ ] Acquire on work-intending bind, persist only non-secret identity,
      propagate `AITM_LEASE_ID` and `AITM_FENCING_TOKEN` to owned child
      processes, and verify before governed effects. On the first governed
      action by a pre-upgrade bound session, acquire an adoption lease before
      any effect and persist it only if acquisition wins. Use `switchLease` for
      issue switches. Register a 60-second heartbeat hook while an owning
      process lives and renew at preflight/resume according to the TTL policy.
- [ ] Re-run focused tests. Expected GREEN; read-only status remains available.
- [ ] Commit:
      `git commit -m "[#${AITM_WORK_LEASE_ISSUE}] feat(lease): enforce governed work ownership"`.

### Task 6: Lifecycle, Fleet Projection, Handoff, and Recovery

**Files:**

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
      takeover audits reason/token, and fleet reconstructs from lease plus bind
      observations.
- [ ] Run focused tests. Expected RED.
- [ ] Implement ownership-checked lifecycle operations and reconstruct fleet
      from `work_leases` plus `work_bindings`; these lease-scoped binding
      observations are not the unrelated general event journal.
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
  node --test packages/aitm-ledger/test/*.test.mjs
  node --test \
    scripts/task-tracker/tests/unit/lib/project-database-path.test.mjs \
    scripts/task-tracker/tests/unit/lib/work-lease-provider.test.mjs \
    scripts/task-tracker/tests/unit/lib/work-lease-lifecycle.test.mjs \
    scripts/task-tracker/tests/integration/lib/exclusive-work-lease.test.mjs \
    scripts/task-tracker/tests/integration/lib/two-sessions-same-issue.test.mjs
  npm run format:check
  npm run lint
  npm test
  npm run test:slow
  git diff --check
  ```

  Expected: exit `0` throughout, exactly one lease winner in contention tests,
  and no whitespace errors.

- [ ] Commit:
      `git commit -m "[#${AITM_WORK_LEASE_ISSUE}] docs(lease): document exclusive work authority"`.
