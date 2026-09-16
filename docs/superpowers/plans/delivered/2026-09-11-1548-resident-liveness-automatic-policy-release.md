# Resident Liveness, Automatic Policy, and Phase 2 Release Implementation Plan

<!-- cspell:words SWHID Zenodo -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver `ai-peer-review` Phase 2 with heartbeat-backed resident
liveness, adapter-validated automatic transport, reversible host setup, active
doctor checks, and a separately authorized public `0.2.0` release.

**Architecture:** Keep liveness and transport health in small provider-neutral
modules. The core accepts only closed, current resident leases from a registered
adapter, records the existing capability strings in the v1 event schema, and
requires both participants plus an end-to-end health result before admitting
`automatic-required`. Setup owns reversible versioned MCP/timeout additions;
manual and resume-only remain unchanged fallbacks. Release preparation is
separate from public tag, registry, GitHub Release, and archive mutation.

**Tech Stack:** Node.js 22 ESM, `node:test`, the exact-pinned MCP SDK already
accepted by #1547, JSON Schema draft 2020-12, GitHub Actions, npm provenance,
signed Git tags, Zenodo, and Software Heritage.

## Global Constraints

- Implement in `/Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1548-resident-liveness`
  on branch `codex/1548-resident-liveness` from exact standalone
  `origin/trunk` `4624084eb078d4d992dfed19e2eda328b86b3e28`.
- Preserve all Phase 1 event, protocol, manifest, response, manual, resume-only,
  recovery, and no-commit fixtures byte-for-byte.
- Never infer liveness from a bare PID. A resident lease requires a stable
  process-instance identifier plus an adapter observation and expiry.
- Generic adapters remain `staleness-only` unless they provide the same closed
  lease and health contracts as an official adapter.
- `automatic-required` admits only `live-wait` or `native-push`; `manual` and
  `resume-only` are explicit refusals for that mode.
- Filesystem notifications and provider events are wake hints; the sealed event
  log and immutable delivery receipt remain authority.
- Setup may add only package-owned, adapter-versioned MCP server, timeout,
  resident lease, and transport keys with dry-run, backup, idempotency, and
  removal coverage.
- No public tag, npm publish, GitHub Release, Zenodo record, Software Heritage
  archival request, or release-manifest evidence is created before the explicit
  Phase 2 publication approval required by the accepted source plan.
- Do not open a defect chain beyond two levels. Any discovered workflow defect
  must first be proven necessary and bounded.

---

### Task 1: Isolate the Standalone Work and Prove the Baseline

**Files:**

- No source changes.

**Interfaces:**

- Consumes: standalone `origin/trunk` at the exact merged #1547 commit.
- Produces: a clean linked worktree with installed dependencies and passing
  Phase 1 plus MCP baselines.

- [ ] **Step 1: Create the linked worktree from the exact remote base**

```bash
git -C /Users/kpburson/projects/Vibe-Coding/ai-peer-review fetch origin --prune
git -C /Users/kpburson/projects/Vibe-Coding/ai-peer-review worktree add \
  /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1548-resident-liveness \
  -b codex/1548-resident-liveness \
  4624084eb078d4d992dfed19e2eda328b86b3e28
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1548-resident-liveness ci
```

- [ ] **Step 2: Run the pre-change baseline**

```bash
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1548-resident-liveness test
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1548-resident-liveness run test:integration
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1548-resident-liveness run test:mcp
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1548-resident-liveness run test:packaging
npm --prefix /Users/kpburson/projects/Vibe-Coding/ai-peer-review-worktrees/1548-resident-liveness run test:smoke
```

Expected: every existing lane exits 0 before Phase 2 edits.

### Task 2: Specify and Implement Resident Lease Authority

**Files:**

- Create: `src/transport/resident.mjs`
- Create: `test/mcp/resident-liveness.test.mjs`
- Modify: `src/public-api.mjs`

**Interfaces:**

- Produces: `validateResidentLease(lease, now) -> ResidentLease`,
  `refreshResidentLease(previous, observation, now) -> ResidentLease`, and
  `residentHealth(lease, expected, now) -> HealthResult`.
- Consumes: an adapter observation with `process_instance_id`, diagnostic `pid`
  or official `opaque_handle`, `host`, `adapter_version`, `heartbeat_sequence`,
  `observed_at`, and `expires_at`.

- [ ] **Step 1: Write RED closed-contract tests**

Create table-driven tests that accept one current lease and reject missing or
unknown fields, invalid dates, expiry at or before the observation, expiry at or
before `now`, non-positive/unsafe PID, missing handle authority, non-increasing
heartbeat sequence, process-instance replacement, host replacement, adapter
version replacement, and PID reuse under a changed instance.

- [ ] **Step 2: Run the resident test and verify RED**

```bash
node --test test/mcp/resident-liveness.test.mjs
```

Expected: fail because `src/transport/resident.mjs` does not exist.

- [ ] **Step 3: Implement immutable lease validation and refresh**

`validateResidentLease` must return a frozen normalized record with
`capability: 'resident-liveness'`. Every refusal uses
`APR_PARTICIPANT_LOSS` and recovery `peer-review status <workspace> --next`.
`refreshResidentLease` validates both records, then requires identical host,
adapter version, process instance, and handle authority with a strictly
increasing heartbeat sequence and observation time.

- [ ] **Step 4: Implement deterministic health classification and run GREEN**

`residentHealth` returns frozen `{ healthy, reason, lease }` data and never
probes a PID. Reasons are closed to `ok`, `expired`, `participant-loss`,
`adapter-downgrade`, and `ambiguous-handle`.

```bash
node --test test/mcp/resident-liveness.test.mjs
```

Expected: all resident-liveness tests pass.

- [ ] **Step 5: Commit the resident boundary**

```bash
git add src/transport/resident.mjs src/public-api.mjs test/mcp/resident-liveness.test.mjs
git commit -m "feat: validate resident transport leases"
```

### Task 3: Enforce Automatic Transport Negotiation

**Files:**

- Create: `src/transport/native-push.mjs`
- Modify: `src/transport/registry.mjs`
- Modify: `src/cli/parse.mjs`
- Modify: `src/cli/run.mjs`
- Modify: `src/protocol/events.mjs`
- Modify: `schemas/event-v1.json`
- Create: `test/integration/automatic-required.test.mjs`

**Interfaces:**

- Produces: `createNativePushTransport(options)`,
  `validateAutomaticParticipant(observation)`, and
  `negotiateAutomaticRequired({ author, reviewer, healthCheck })`.
- Consumes: registered `live-wait` or official `native-push` adapters with exact
  adapter versions, current resident leases, and an async end-to-end health
  callback.

- [ ] **Step 1: Write RED negotiation and native-push tests**

Cover both participants on healthy `live-wait`, mixed healthy automatic
capabilities, manual refusal, resume-only refusal, missing/unhealthy health
check, stale lease, adapter-version mismatch, native-push delivery success,
native-push pending/manual recovery, restart with a new process instance, and
participant-loss intervention. Assert permissive modes preserve manual recovery
and disclose any downgrade.

- [ ] **Step 2: Run the negotiation test and verify RED**

```bash
node --test test/integration/automatic-required.test.mjs
```

Expected: fail because automatic negotiation and native push do not exist.

- [ ] **Step 3: Extend the registry without adding a synthetic mode adapter**

The registry accepts delivery adapters for `manual`, `resume-only`, and
`native-push`, and wait adapters for `live-wait`. `automatic-required` remains a
policy over two participant capabilities, never a transport adapter name.

- [ ] **Step 4: Admit automatic-required at start and join**

Remove the Phase 1 parser refusal. At start, require the author observation to
be automatic-capable and healthy. At join, require the reviewer observation and
the end-to-end health check before appending `reviewer-joined`. Preserve existing
v1 payload keys; widen only the closed transport enums to `live-wait` and
`native-push`, so all Phase 1 serialized fixtures remain byte-identical.

- [ ] **Step 5: Implement official native-push validation and run GREEN**

`createNativePushTransport` requires an injected official dispatch function,
opaque handle, supported host, adapter version, and current resident lease. It
never reads undocumented provider state. Delivery failure returns
`delivery-pending` plus manual recovery.

```bash
node --test test/integration/automatic-required.test.mjs test/unit/transport.test.mjs \
  test/integration/start-join.test.mjs
```

Expected: automatic-required tests pass and all Phase 1 transport/start/join
tests remain green.

- [ ] **Step 6: Commit automatic transport policy**

```bash
git add src/transport/native-push.mjs src/transport/registry.mjs src/cli/parse.mjs \
  src/cli/run.mjs src/protocol/events.mjs schemas/event-v1.json \
  test/integration/automatic-required.test.mjs test/unit/transport.test.mjs \
  test/integration/start-join.test.mjs
git commit -m "feat: enforce automatic transport policy"
```

### Task 4: Make Setup and Doctor Phase-2 Aware

**Files:**

- Modify: `src/config/load.mjs`
- Modify: `src/config/setup.mjs`
- Modify: `src/doctor.mjs`
- Modify: `schemas/config-v1.json`
- Modify: `test/integration/setup-doctor.test.mjs`
- Create: `test/smoke/transport.test.mjs`

**Interfaces:**

- Produces: package-owned adapter configuration with version `2`, a closed
  `automatic_transport` host record, and active doctor rows for MCP,
  resident-liveness, long timeout, and automatic-required.
- Consumes: the installed MCP server command, provider adapter version, tool
  timeout, resident health observation, and end-to-end health result.

- [ ] **Step 1: Write RED setup, doctor, and smoke tests**

For Codex and Claude fixtures, assert dry-run before/after bytes, backup-required
metadata, idempotent apply, exact package ownership, long timeout, MCP server
command, resident heartbeat settings, and exact removal. Generic remains
staleness-only. Doctor must mark each Phase 2 row `ok` only with the complete
healthy observation and must make requested automatic mode unhealthy for every
missing, stale, downgraded, or incompatible input.

- [ ] **Step 2: Run the setup/doctor tests and verify RED**

```bash
node --test test/integration/setup-doctor.test.mjs test/smoke/transport.test.mjs
```

Expected: fail because configuration v1 has no automatic transport record and
doctor still reports Phase 2 as not installed.

- [ ] **Step 3: Extend the closed config schema and reversible setup plan**

Add `hosts.<host>.automatic_transport` with exact keys `capability`,
`adapter_version`, `server_command`, `tool_timeout_ms`,
`heartbeat_interval_ms`, and `lease_ttl_ms`. Require positive safe integers,
`heartbeat_interval_ms < lease_ttl_ms <= tool_timeout_ms`, and automatic
capability only for Codex/Claude package-owned live-wait configuration. Removal
uses the existing ownership record and preserves foreign bytes.

- [ ] **Step 4: Activate doctor rows and run GREEN**

Doctor consumes observations; it performs no mutation and no PID probe. Manual
and resume-only requests stay healthy when their own rows are healthy, even if
Phase 2 is absent. Automatic-required makes all four Phase 2 rows required.

```bash
node --test test/integration/setup-doctor.test.mjs test/smoke/transport.test.mjs
```

Expected: setup, removal, doctor, and transport smoke tests pass.

- [ ] **Step 5: Commit setup and diagnostics**

```bash
git add src/config/load.mjs src/config/setup.mjs src/doctor.mjs schemas/config-v1.json \
  test/integration/setup-doctor.test.mjs test/smoke/transport.test.mjs
git commit -m "feat: configure automatic peer-review transport"
```

### Task 5: Prepare and Review the Phase 2 Release

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `skills/peer-review/SKILL.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify after publication authority: `provenance/release-manifest.json`
- Modify after publication authority: `scripts/verify-release.mjs`
- Modify: `test/packaging/package.test.mjs`
- Modify: `test/unit/verify-release.test.mjs`

**Interfaces:**

- Produces: a reviewed `0.2.0` package candidate, exact tarball bytes and hash,
  cross-platform CI evidence, then a separately authorized signed/public release
  and verified release manifest.
- Consumes: all Phase 2 tests and the existing release-evidence verifier.

- [ ] **Step 1: Update package metadata, skill, docs, CI, and release tests**

Set package and lockfile version to `0.2.0`; document automatic transport as
opt-in with manual recovery; add the Phase 2 focused lane to Linux, macOS, and
Windows CI; and update packaging tests to require the new public modules while
excluding tests, scratch, credentials, and provider-private state.

- [ ] **Step 2: Run the complete exact-head Phase 2 gate**

```bash
npm run test:mcp
npm run format:check
npm run lint
npm test
npm run test:integration
npm run test:packaging
npm run test:smoke
npm run test:slow
npm audit --omit=dev
npm pack --dry-run
git diff --check
git status --short
```

Expected: all checks pass, production audit reports zero known vulnerabilities,
and the package inventory contains no private or test-only files.

- [ ] **Step 3: Commit the release candidate and obtain independent review**

```bash
git add package.json package-lock.json skills/peer-review/SKILL.md \
  .github/workflows/ci.yml README.md test/packaging/package.test.mjs \
  test/unit/verify-release.test.mjs
git commit -m "release: prepare ai-peer-review 0.2.0"
```

Open a pull request from `codex/1548-resident-liveness`, require exact-head
independent review, and wait for every required cross-platform and CodeQL job.
Merge only through exact-head provider authority.

- [ ] **Step 4: Stop at the explicit publication gate**

Present the merged release-candidate SHA, dependency audit, packed size and
integrity, cross-platform CI, deterministic fake transport evidence, any live
opt-in evidence, signed tag proposal, and proposed public mutations. Do not
perform them until the user explicitly approves Phase 2 publication.

- [ ] **Step 5: After approval, publish and capture public evidence**

From a clean exact release commit: create and verify signed `v0.2.0`; publish the
exact tarball with npm provenance; create the GitHub Release with the tarball and
`SHA256SUMS`; create/version the Zenodo record; request Software Heritage
archival; then record only live-observed URLs, hashes, integrity, DOI, SWHID,
tag target, and signer fingerprint in `provenance/release-manifest.json`.

- [ ] **Step 6: Verify and commit the release evidence**

Update `scripts/verify-release.mjs` and its unit tests for the exact v0.2.0
release sequence, then run:

```bash
node scripts/verify-release.mjs
npm test
npm run test:integration
npm run test:packaging
npm run test:smoke
npm run test:mcp
npm run lint
npm run format:check
git diff --check
```

Commit the evidence under #1548, open the evidence PR, require exact-head CI and
review, merge, rerun `node scripts/verify-release.mjs` from merged trunk, and
only then permit #1549 to consume `ai-peer-review@0.2.0`.
