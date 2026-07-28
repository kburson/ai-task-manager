# AITM Local Ledger Foundation Implementation Plan

<!-- cspell:words emittable purgeable -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable, recoverable, main-worktree-local event ledger to AITM
and publish the transport-neutral ledger package that the separate Insights
project will consume.

**Architecture:** A new `@kburson/aitm-ledger` workspace package owns the event
protocol, SQLite schema, migrations, storage API, backups, and conformance
fixtures. AITM writes authoritative events through one publisher while
preserving current GitHub behavior, checkpoints immutable events to a dedicated
Git data branch, and exposes a future remote transport through the same storage
port.

**Tech Stack:** Node.js `>=22.15.0`, ECMAScript modules, built-in `node:sqlite`,
`node:test`, JSON Schema, SQLite WAL, Git plumbing, GitHub CLI/GraphQL, npm
workspaces, Prettier, ESLint, markdownlint.

## Global Constraints

- Governing design:
  `docs/superpowers/specs/2026-07-28-hybrid-ledger-and-insights-program-design.md`.
- Phase 1 does not mine transcripts, serve a web application, operate
  PostgreSQL, or deploy cloud infrastructure.
- `.tmp/` remains purgeable and contains no authoritative database state.
- The local ledger path is `<main-worktree>/.db/aitm/project.sqlite`.
- The repository ignores `/.db/`; the live SQLite file is never committed.
- SQLite is supported only on a local filesystem, not NFS, SMB, or a
  cloud-synchronized folder.
- Every writable SQLite connection enables WAL, foreign keys,
  `busy_timeout=5000`, and `synchronous=FULL`.
- Canonical events are append-only and idempotent by `eventId` plus
  `contentHash`.
- AITM is the only producer of authoritative workflow events.
- Existing GitHub issue prose, markers, comments, project fields, and gates
  remain behaviorally unchanged throughout Phase 1.
- Ledger write failure cannot silently claim durable persistence.
- Raw transcripts and Insights-derived records are outside Phase 1.
- The Git recovery journal contains authoritative AITM events only.
- Public-repository journal push defaults off.
- Clients never receive PostgreSQL credentials.
- `@kburson/aitm-ledger` imports neither AITM nor Insights.
- Every new operator command is registered with complete zero-side-effect help.
- Use TDD, isolated issue worktrees, and one independently reviewable commit per
  task.

---

## 1. File Structure

### New ledger workspace

- `packages/aitm-ledger/package.json`: publish metadata and subpath exports.
- `packages/aitm-ledger/src/index.mjs`: public package facade.
- `packages/aitm-ledger/src/protocol/event.mjs`: envelope creation and
  validation.
- `packages/aitm-ledger/src/protocol/canonical-json.mjs`: stable serialization
  and hashing.
- `packages/aitm-ledger/src/protocol/ids.mjs`: UUID and monotonic ULID helpers.
- `packages/aitm-ledger/src/protocol/event-types.mjs`: authoritative and
  observational event catalogs.
- `packages/aitm-ledger/src/storage/port.mjs`: transport-neutral storage
  contract assertions.
- `packages/aitm-ledger/src/sqlite/open.mjs`: SQLite connection policy.
- `packages/aitm-ledger/src/sqlite/migrate.mjs`: migration runner.
- `packages/aitm-ledger/src/sqlite/migrations/001-initial.mjs`: initial schema.
- `packages/aitm-ledger/src/sqlite/event-store.mjs`: append/read operations.
- `packages/aitm-ledger/src/sqlite/outbox.mjs`: remote delivery queue.
- `packages/aitm-ledger/src/sqlite/backup.mjs`: verified backup and restore.
- `packages/aitm-ledger/src/testing/fixtures.mjs`: public conformance vectors.
- `packages/aitm-ledger/test/`: package unit and integration tests.

### New AITM integration modules

- `scripts/task-tracker/lib/ledger/project-identity.mjs`: stable project ID.
- `scripts/task-tracker/lib/ledger/publisher.mjs`: authoritative event
  publisher.
- `scripts/task-tracker/lib/ledger/task-context.mjs`: binding interval writer.
- `scripts/task-tracker/lib/ledger/event-mappers.mjs`: AITM result-to-event
  mapping.
- `scripts/task-tracker/lib/ledger/emergency-spool.mjs`: durable fallback under
  `.db/aitm/recovery/`.
- `scripts/task-tracker/lib/ledger/git-journal.mjs`: immutable branch segments.
- `scripts/task-tracker/lib/ledger/rebuild.mjs`: journal replay and projection
  rebuild.
- `scripts/task-tracker/lib/ledger/github-import.mjs`: current-project
  historical import.
- `scripts/task-tracker/lib/ledger/parity.mjs`: GitHub/ledger comparison.
- `scripts/task-tracker/lib/ledger/transports/local.mjs`: SQLite transport.
- `scripts/task-tracker/lib/ledger/transports/http.mjs`: future remote client.
- `scripts/task-tracker/ledger.mjs`: `aitm ledger` operator command.

### Existing integration points

- `package.json`, `package-lock.json`: workspace, engine, and scripts.
- `.gitignore`, `bin/cli.mjs`: durable database ignore installation.
- `scripts/task-tracker/paths.mjs`: `.db/` and main-worktree ledger resolvers.
- `scripts/task-tracker/config.mjs`: ledger configuration.
- `scripts/task-tracker/runtime.mjs`: shared publisher in verb context.
- `scripts/task-tracker/hook-handler.mjs`: session/timing publication.
- `scripts/task-tracker/lib/move-state/post-commit-tail.mjs`: transition
  outcomes.
- `scripts/task-tracker/lib/evidence-runner.mjs`: verification outcomes.
- `scripts/task-tracker/verbs/approve.mjs`: approval outcomes.
- `scripts/task-tracker/commit-trail-handler.mjs`: commit observations.
- `scripts/task-tracker/verbs/close.mjs`: integration and closure outcomes.
- `scripts/lib/self-doc.mjs`, `bin/aitm-registry.mjs`: `aitm ledger` routing.
- `docs/DESIGN.md`, `README.md`: installed behavior and recovery operations.

## 2. Interface Contract

Later tasks consume these exact public interfaces:

```js
// @kburson/aitm-ledger
createEvent(input, deps = {}) -> EventEnvelope
validateEvent(event) -> { ok: boolean, errors: string[] }
contentHash(event) -> string
openSqliteLedger({ path, readonly = false, timeoutMs = 5000 }) -> LedgerStore
backupSqliteLedger({ sourcePath, destinationPath }) -> Promise<BackupResult>
conformanceFixtures() -> ConformanceFixtureSet

// LedgerStore
append(event) -> { status: "inserted" | "duplicate", eventId: string }
appendBatch(events) -> BatchAppendResult
get(eventId) -> EventEnvelope | null
readAfter(eventId, { limit = 500 } = {}) -> EventEnvelope[]
watermark() -> { eventId: string | null, count: number }
transaction(fn) -> unknown
close() -> void
```

AITM consumes this integration interface:

```js
publishAuthoritative(eventType, payload, context = {}) ->
  Promise<{ status: "inserted" | "duplicate" | "spooled", eventId: string }>
```

## 3. Task Sequence

Tasks are sequential. Task 2 consumes Task 1's package boundary; every later
task consumes the protocol and store interfaces.

### Task 1: Establish the Ledger Workspace and Node Floor

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `packages/aitm-ledger/package.json`
- Create: `packages/aitm-ledger/src/index.mjs`
- Create: `packages/aitm-ledger/test/package-boundary.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/task-tracker/tests/unit/core/package-boundary.test.mjs`

**Interfaces:**

- Produces: importable `@kburson/aitm-ledger` workspace package with subpath
  exports `.` and `./testing`.
- Consumes: none.

- [ ] **Step 1: Write failing workspace and runtime-floor tests**

Add assertions that:

```js
assert.equal(root.engines.node, '>=22.15.0');
assert.deepEqual(root.workspaces, ['packages/*']);
assert.equal(ledger.name, '@kburson/aitm-ledger');
assert.equal(ledger.type, 'module');
assert.ok(ledger.exports['.']);
assert.ok(ledger.exports['./testing']);
```

The package-boundary test must also import
`packages/aitm-ledger/src/index.mjs` and assert it has no import path beginning
with `../../scripts/`, `ai-task-manager`, or `aitm-insights`.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
node --test packages/aitm-ledger/test/package-boundary.test.mjs
node --test scripts/task-tracker/tests/unit/core/package-boundary.test.mjs
```

Expected: FAIL because the workspace package and Node floor do not exist.

- [ ] **Step 3: Add the workspace package**

Use this package contract:

```json
{
  "name": "@kburson/aitm-ledger",
  "version": "0.1.0",
  "type": "module",
  "license": "AGPL-3.0-or-later",
  "engines": { "node": ">=22.15.0" },
  "files": ["src/"],
  "exports": {
    ".": "./src/index.mjs",
    "./testing": "./src/testing/fixtures.mjs"
  }
}
```

Add `"workspaces": ["packages/*"]` and raise the root Node floor to
`">=22.15.0"`. Ensure CI tests Node 22 at a release satisfying that floor and
the current LTS line.

- [ ] **Step 4: Install and run the focused tests**

Run:

```bash
npm install
node --test packages/aitm-ledger/test/package-boundary.test.mjs
node --test scripts/task-tracker/tests/unit/core/package-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
test -n "$active_issue"
git add package.json package-lock.json packages/aitm-ledger .github/workflows/ci.yml \
  scripts/task-tracker/tests/unit/core/package-boundary.test.mjs
git commit -m "[#$active_issue] build(ledger): establish workspace package"
```

### Task 2: Implement the Canonical Event Protocol

**Files:**

- Create: `packages/aitm-ledger/src/protocol/canonical-json.mjs`
- Create: `packages/aitm-ledger/src/protocol/ids.mjs`
- Create: `packages/aitm-ledger/src/protocol/event-types.mjs`
- Create: `packages/aitm-ledger/src/protocol/event.mjs`
- Modify: `packages/aitm-ledger/src/index.mjs`
- Create: `packages/aitm-ledger/test/event.test.mjs`
- Create: `packages/aitm-ledger/test/hash-vectors.test.mjs`

**Interfaces:**

- Produces: `createEvent`, `validateEvent`, `contentHash`,
  `AUTHORITATIVE_EVENT_TYPES`, `OBSERVATIONAL_EVENT_TYPES`.
- Consumes: Task 1 package facade.

- [ ] **Step 1: Write failing envelope, validation, and hash-vector tests**

Pin a deterministic event by injecting:

```js
const deps = {
  eventId: () => '01J00000000000000000000000',
  now: () => '2026-07-28T12:00:00.000Z',
};
```

Assert:

```js
assert.equal(event.schemaVersion, 1);
assert.equal(event.authority, 'authoritative');
assert.equal(event.eventType, 'task.bound');
assert.match(event.contentHash, /^[a-f0-9]{64}$/);
assert.deepEqual(validateEvent(event), { ok: true, errors: [] });
assert.equal(contentHash({ ...event, contentHash: undefined }), event.contentHash);
```

Add invalid vectors for unqualified task IDs, future schema versions, missing
producer identity, inferred confidence outside `[0, 1]`, and a mismatched hash.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
node --test packages/aitm-ledger/test/event.test.mjs
node --test packages/aitm-ledger/test/hash-vectors.test.mjs
```

Expected: FAIL because protocol modules are absent.

- [ ] **Step 3: Implement stable serialization and envelope validation**

`canonicalJson(value)` recursively sorts object keys, preserves array order,
rejects `undefined`, functions, symbols, `NaN`, and infinities, and returns
UTF-8 JSON without whitespace.

`createEvent(input, deps)` must:

```js
const event = {
  schemaVersion: 1,
  eventId: deps.eventId(),
  projectId: input.projectId,
  eventType: input.eventType,
  authority: input.authority,
  producer: input.producer,
  actor: input.actor,
  taskId: input.taskId ?? null,
  sessionId: input.sessionId ?? null,
  parentSessionId: input.parentSessionId ?? null,
  agentRunId: input.agentRunId ?? null,
  worktreeId: input.worktreeId ?? null,
  correlationId: input.correlationId,
  causationId: input.causationId ?? null,
  occurredAt: input.occurredAt ?? deps.now(),
  observedAt: deps.now(),
  git: input.git ?? null,
  confidence: input.confidence ?? 1,
  payload: input.payload ?? {},
  sourceRefs: input.sourceRefs ?? [],
  redaction: input.redaction ?? {
    containsRawChat: false,
    containsSecrets: false,
  },
};
```

Validate, calculate SHA-256 over the event without `contentHash`, append the
hash, freeze the result, and return it.

- [ ] **Step 4: Run package tests**

Run:

```bash
node --test packages/aitm-ledger/test/event.test.mjs
node --test packages/aitm-ledger/test/hash-vectors.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add packages/aitm-ledger
git commit -m "[#$active_issue] feat(ledger): define canonical event protocol"
```

### Task 3: Build the SQLite Schema and Migration Engine

**Files:**

- Create: `packages/aitm-ledger/src/sqlite/open.mjs`
- Create: `packages/aitm-ledger/src/sqlite/migrate.mjs`
- Create: `packages/aitm-ledger/src/sqlite/migrations/001-initial.mjs`
- Create: `packages/aitm-ledger/src/storage/port.mjs`
- Create: `packages/aitm-ledger/test/sqlite-migrate.test.mjs`
- Create: `packages/aitm-ledger/test/sqlite-policy.test.mjs`

**Interfaces:**

- Produces: `openSqliteLedger`, `runMigrations`, `assertLedgerStore`.
- Consumes: Task 2 event protocol.

- [ ] **Step 1: Write failing migration and connection-policy tests**

Create a temporary database and assert:

```js
assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
assert.equal(db.prepare('PRAGMA synchronous').get().synchronous, 2);
```

Assert migration `001-initial` creates:

```text
ledger_metadata
events
outbox
task_context_intervals
artifacts
sync_peers
journal_checkpoints
migrations
```

Assert a newer unknown schema version refuses writable open without altering
the file.

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test packages/aitm-ledger/test/sqlite-migrate.test.mjs
node --test packages/aitm-ledger/test/sqlite-policy.test.mjs
```

Expected: FAIL because SQLite modules are absent.

- [ ] **Step 3: Implement connection and migration policy**

Use:

```js
import { DatabaseSync } from 'node:sqlite';

export function openConnection({ path, readonly = false, timeoutMs = 5000 }) {
  const db = new DatabaseSync(path, { readOnly: readonly });
  if (!readonly) {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(`PRAGMA busy_timeout = ${Number(timeoutMs)}`);
    db.exec('PRAGMA synchronous = FULL');
  }
  return db;
}
```

The migration runner executes `BEGIN IMMEDIATE`, verifies each migration
checksum, applies unapplied migrations in numeric order, records the checksum,
sets `PRAGMA user_version`, and rolls back on any failure.

- [ ] **Step 4: Run focused tests**

```bash
node --test packages/aitm-ledger/test/sqlite-migrate.test.mjs
node --test packages/aitm-ledger/test/sqlite-policy.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add packages/aitm-ledger
git commit -m "[#$active_issue] feat(ledger): add sqlite schema and migrations"
```

### Task 4: Implement Event Store, Outbox, and Backups

**Files:**

- Create: `packages/aitm-ledger/src/sqlite/event-store.mjs`
- Create: `packages/aitm-ledger/src/sqlite/outbox.mjs`
- Create: `packages/aitm-ledger/src/sqlite/backup.mjs`
- Modify: `packages/aitm-ledger/src/index.mjs`
- Create: `packages/aitm-ledger/test/event-store.test.mjs`
- Create: `packages/aitm-ledger/test/sqlite-contention.test.mjs`
- Create: `packages/aitm-ledger/test/backup.test.mjs`

**Interfaces:**

- Produces: complete `LedgerStore`, outbox operations, and
  `backupSqliteLedger`.
- Consumes: Tasks 2-3.

- [ ] **Step 1: Write failing idempotency and conflict tests**

Assert:

```js
assert.deepEqual(store.append(event), {
  status: 'inserted',
  eventId: event.eventId,
});
assert.deepEqual(store.append(event), {
  status: 'duplicate',
  eventId: event.eventId,
});
assert.throws(() => store.append({ ...event, contentHash: 'f'.repeat(64) }), /event-id-conflict/);
```

Test ordered `readAfter`, batch atomicity, watermark count, outbox retry
metadata, two-process contention, consistent backup, and restore integrity.

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test packages/aitm-ledger/test/event-store.test.mjs
node --test packages/aitm-ledger/test/sqlite-contention.test.mjs
node --test packages/aitm-ledger/test/backup.test.mjs
```

Expected: FAIL because store modules are absent.

- [ ] **Step 3: Implement the store**

Use one `INSERT ... ON CONFLICT(event_id) DO NOTHING`, then read the existing
hash when no row was inserted. Store canonical JSON plus indexed columns in the
same transaction.

`appendBatch` validates every event before `BEGIN IMMEDIATE`. It returns:

```js
{
  inserted: ["01J..."],
  duplicates: ["01J..."],
  watermark: { eventId: "01J...", count: 2 }
}
```

Use `sqlite.backup()` for backups, run `PRAGMA integrity_check` on the result,
and return source/destination hashes.

- [ ] **Step 4: Run focused tests**

```bash
node --test packages/aitm-ledger/test/event-store.test.mjs
node --test packages/aitm-ledger/test/sqlite-contention.test.mjs
node --test packages/aitm-ledger/test/backup.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add packages/aitm-ledger
git commit -m "[#$active_issue] feat(ledger): persist events and verified backups"
```

### Task 5: Add Durable `.db/` Path and Project Identity

**Files:**

- Modify: `.gitignore`
- Modify: `bin/cli.mjs`
- Modify: `scripts/task-tracker/paths.mjs`
- Modify: `scripts/task-tracker/config.mjs`
- Create: `scripts/task-tracker/lib/ledger/project-identity.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-paths.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-project-identity.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/install.test.mjs`

**Interfaces:**

- Produces:
  `dbAitmDir(mainWorktreePath)`, `ledgerPath(projectDir)`,
  `ledgerBackupDir(projectDir)`, `ledgerRecoveryDir(projectDir)`,
  `ensureProjectIdentity({ configPath, store })`.
- Consumes: ledger package and existing `findMainWorktreePath`.

- [ ] **Step 1: Write failing path and installer tests**

Assert a linked worktree and its main worktree resolve the same:

```text
<main>/.db/aitm/project.sqlite
```

Assert `.tmp/aitm/` and `.db/aitm/` are different roots. Assert generated
`.gitignore` contains exactly one `/.db/` rule and installation never deletes
or overwrites an existing `.db/`.

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test scripts/task-tracker/tests/unit/lib/ledger-paths.test.mjs
node --test scripts/task-tracker/tests/unit/lib/ledger-project-identity.test.mjs
node --test scripts/task-tracker/tests/unit/lib/install.test.mjs
```

Expected: FAIL because `.db` resolvers and ignore installation are absent.

- [ ] **Step 3: Implement path and identity handling**

Add:

```js
export const DB_REL = '.db/aitm';

export function dbAitmDir(mainWorktreePath) {
  return path.join(mainWorktreePath, '.db', 'aitm');
}

export function ledgerPath(projDir = getProjectDir()) {
  return path.join(dbAitmDir(findMainWorktreePath(projDir)), 'project.sqlite');
}
```

Create directories with mode `0o700`. Store `ledgerProjectId` in
`.ai-task-manager/task-tracker.json` and `ledger_metadata`; mismatch is a hard
diagnostic.

- [ ] **Step 4: Run focused tests**

Run the three commands from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add .gitignore bin/cli.mjs scripts/task-tracker/paths.mjs \
  scripts/task-tracker/config.mjs scripts/task-tracker/lib/ledger \
  scripts/task-tracker/tests/unit/lib
git commit -m "[#$active_issue] feat(ledger): add durable project database path"
```

### Task 6: Add the AITM Publisher and Task Context Intervals

**Files:**

- Create: `scripts/task-tracker/lib/ledger/publisher.mjs`
- Create: `scripts/task-tracker/lib/ledger/task-context.mjs`
- Create: `scripts/task-tracker/lib/ledger/emergency-spool.mjs`
- Create: `scripts/task-tracker/lib/ledger/transports/local.mjs`
- Modify: `scripts/task-tracker/runtime.mjs`
- Modify: `scripts/task-tracker/verbs/start.mjs`
- Modify: `scripts/task-tracker/verbs/pause.mjs`
- Modify: `scripts/task-tracker/verbs/resume.mjs`
- Modify: `scripts/task-tracker/verbs/switch.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-publisher.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-task-context.test.mjs`

**Interfaces:**

- Produces: `publishAuthoritative`, `openTaskContext`, `closeTaskContext`.
- Consumes: Tasks 2-5.

- [ ] **Step 1: Write failing publisher and interval tests**

Cover:

- one task across two sessions;
- two sequential tasks in one session;
- duplicate bind replay;
- pause and switch interval closure;
- explicit `parentSessionId` and `agentRunId`;
- ledger failure spooling one canonical event to
  `.db/aitm/recovery/<eventId>.json`.

Assert the emergency spool contains no raw transcript content.

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test scripts/task-tracker/tests/unit/lib/ledger-publisher.test.mjs
node --test scripts/task-tracker/tests/unit/lib/ledger-task-context.test.mjs
```

Expected: FAIL because publisher and interval modules are absent.

- [ ] **Step 3: Implement publisher and binding events**

Build context from current AITM state, provider session ID, main-worktree
identity, branch, and HEAD SHA. Publish:

```text
session.started
task.bound
task.paused
task.unbound
task.resumed
session.ended
```

Only append after the corresponding existing AITM action succeeds. A ledger
failure writes a validated event to the durable recovery spool, prints a
machine-readable warning, and leaves existing GitHub behavior unchanged.

- [ ] **Step 4: Run focused and existing session tests**

```bash
node --test scripts/task-tracker/tests/unit/lib/ledger-publisher.test.mjs
node --test scripts/task-tracker/tests/unit/lib/ledger-task-context.test.mjs
node --test scripts/task-tracker/tests/integration/lib/two-sessions-different-issues.test.mjs
node --test scripts/task-tracker/tests/integration/lib/two-sessions-same-issue.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add scripts/task-tracker
git commit -m "[#$active_issue] feat(ledger): record sessions and task context"
```

### Task 7: Dual-Write Lifecycle and Timing Events

**Files:**

- Create: `scripts/task-tracker/lib/ledger/event-mappers.mjs`
- Modify: `scripts/task-tracker/runtime.mjs`
- Modify: `scripts/task-tracker/hook-handler.mjs`
- Modify: `scripts/task-tracker/lib/move-state/post-commit-tail.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-timing-map.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-transition-map.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/lib/timing-event-emitter-characterization.test.mjs`

**Interfaces:**

- Produces deterministic mapping from canonical timing/lifecycle outcomes to
  ledger payloads.
- Consumes: Task 6 publisher and canonical lifecycle/timing policies.

- [ ] **Step 1: Write failing mapping tests**

For every currently emittable timing event, assert a mapped
`timing.span.closed` payload or an explicit non-span audit mapping.

For transition outcomes, assert:

```text
requested -> transitioned
requested -> refused
same-state request -> no lifecycle.transitioned event
```

Pin active/idle seconds, word deltas, state visit, reason, and AITM source event
name.

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test scripts/task-tracker/tests/unit/lib/ledger-timing-map.test.mjs
node --test scripts/task-tracker/tests/unit/lib/ledger-transition-map.test.mjs
```

Expected: FAIL because mappers and dual-write calls are absent.

- [ ] **Step 3: Wire central emitters**

Publish from central post-success seams, not from every caller:

- `safePostTiming` for timing;
- move-state transition plan/tail for state moves and refusals;
- hook handler for compaction and session recovery.

Include the existing timing event slug as payload provenance. Do not change the
GitHub row or marker.

- [ ] **Step 4: Run focused and characterization tests**

```bash
node --test scripts/task-tracker/tests/unit/lib/ledger-timing-map.test.mjs
node --test scripts/task-tracker/tests/unit/lib/ledger-transition-map.test.mjs
node --test scripts/task-tracker/tests/unit/lib/timing-event-emitter-characterization.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add scripts/task-tracker
git commit -m "[#$active_issue] feat(ledger): dual-write lifecycle and timing events"
```

### Task 8: Record Verification, Review, Approval, Commit, and Delivery Evidence

**Files:**

- Modify: `scripts/task-tracker/lib/evidence-runner.mjs`
- Modify: `scripts/task-tracker/lib/agent-review/review-gate.mjs`
- Modify: `scripts/task-tracker/verbs/approve.mjs`
- Modify: `scripts/task-tracker/commit-trail-handler.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/lib/ledger/event-mappers.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-evidence-map.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-approval-map.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-delivery-map.test.mjs`

**Interfaces:**

- Produces required authoritative evidence event families.
- Consumes: Task 6 publisher.

- [ ] **Step 1: Write failing evidence mapping tests**

Cover:

- exact verification command, exit status, duration, and verified HEAD SHA;
- agent review pass/fail and findings count;
- explicit human approval versus full-auto approval actor;
- commit SHA, branch, and worktree identity;
- integration proof target ref and attributable commit;
- evidence invalidation after HEAD drift.

Assert command output is represented by bounded excerpt plus content hash, not
an unbounded raw log.

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test scripts/task-tracker/tests/unit/lib/ledger-evidence-map.test.mjs
node --test scripts/task-tracker/tests/unit/lib/ledger-approval-map.test.mjs
node --test scripts/task-tracker/tests/unit/lib/ledger-delivery-map.test.mjs
```

Expected: FAIL because evidence events are absent.

- [ ] **Step 3: Publish only after authoritative actions resolve**

Add post-success publication for:

```text
verification.started
verification.completed
review.completed
approval.recorded
git.commit.observed
git.integration.verified
evidence.invalidated
```

Preserve the existing explicit-human `--human` semantics. A failed or spooled
ledger write cannot alter the existing approval marker or close decision.

- [ ] **Step 4: Run focused and existing approval tests**

```bash
node --test scripts/task-tracker/tests/unit/lib/ledger-evidence-map.test.mjs
node --test scripts/task-tracker/tests/unit/lib/ledger-approval-map.test.mjs
node --test scripts/task-tracker/tests/unit/lib/ledger-delivery-map.test.mjs
node --test scripts/task-tracker/tests/unit/verbs/approve-full-auto-detect.test.mjs
node --test scripts/task-tracker/lib/close-gates-lineage.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add scripts/task-tracker
git commit -m "[#$active_issue] feat(ledger): record governed delivery evidence"
```

### Task 9: Add Historical Import and Parity Reporting

**Files:**

- Create: `scripts/task-tracker/lib/ledger/github-import.mjs`
- Create: `scripts/task-tracker/lib/ledger/parity.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-github-import.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-parity.test.mjs`
- Create: `scripts/task-tracker/tests/fixtures/ledger/historical-issue.json`

**Interfaces:**

- Produces: `importGithubIssue`, `compareIssueToLedger`.
- Consumes: current marker/timing readers and Task 4 store.

- [ ] **Step 1: Write failing import and parity tests**

Use a frozen issue fixture containing body markers, timing comment, project
fields, commit trail, approval, and close attribution.

Assert imported records use:

```js
authority: "observed"
producer: { name: "aitm-github-import", version: "..." }
```

Historical import must never fabricate an authoritative event or active-time
claim.

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test scripts/task-tracker/tests/unit/lib/ledger-github-import.test.mjs
node --test scripts/task-tracker/tests/unit/lib/ledger-parity.test.mjs
```

Expected: FAIL because importer and parity report are absent.

- [ ] **Step 3: Implement dry-run-first import and parity**

`importGithubIssue` emits observed events with source comment IDs and marker
hashes. `compareIssueToLedger` reports differences for:

- lifecycle state;
- timing totals;
- evidence satisfaction;
- approval kind;
- commit attribution;
- delivery target.

No import mutates GitHub.

- [ ] **Step 4: Run focused tests**

Run both commands from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 9**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add scripts/task-tracker/lib/ledger scripts/task-tracker/tests
git commit -m "[#$active_issue] feat(ledger): import and compare github history"
```

### Task 10: Implement Git Recovery Journal and Rebuild

**Files:**

- Create: `scripts/task-tracker/lib/ledger/git-journal.mjs`
- Create: `scripts/task-tracker/lib/ledger/rebuild.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-git-journal.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/ledger-rebuild.test.mjs`

**Interfaces:**

- Produces:
  `checkpointJournal({ store, repoDir, remote, push })` and
  `rebuildFromJournal({ repoDir, destinationPath, ref })`.
- Consumes: Tasks 4-5 and canonical hash validation.

- [ ] **Step 1: Write failing journal tests in disposable repositories**

Assert:

- branch name is `aitm-data/<projectId>`;
- normal development worktree remains clean;
- segments are immutable gzip JSONL;
- manifest contains counts, bounds, and hash chain;
- retry does not duplicate events;
- divergent non-append history refuses;
- public remote push defaults off;
- restore rebuilds an equivalent event set into a new database.

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test scripts/task-tracker/tests/unit/lib/ledger-git-journal.test.mjs
node --test scripts/task-tracker/tests/integration/lib/ledger-rebuild.test.mjs
```

Expected: FAIL because journal modules are absent.

- [ ] **Step 3: Implement append-only segments and verified rebuild**

Assemble segments under `.tmp/aitm/ledger-export/`, verify them, and advance the
dedicated ref without checking it out in the development worktree. Serialize
ref updates with a main-worktree ledger lock.

Restore into `<destination>.rebuild-<timestamp>`, run envelope validation and
SQLite integrity checks, compare counts/hashes, then rename atomically. Move an
existing database to `.db/aitm/backups/`.

- [ ] **Step 4: Run focused tests**

Run both commands from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 10**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add scripts/task-tracker/lib/ledger scripts/task-tracker/tests
git commit -m "[#$active_issue] feat(ledger): add git journal recovery"
```

### Task 11: Define the Remote Transport and Compatibility Kit

**Files:**

- Create: `scripts/task-tracker/lib/ledger/transports/http.mjs`
- Modify: `packages/aitm-ledger/src/storage/port.mjs`
- Create: `packages/aitm-ledger/src/testing/fixtures.mjs`
- Create: `packages/aitm-ledger/test/conformance.test.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ledger-http-transport.test.mjs`

**Interfaces:**

- Produces: `createHttpTransport` and public `conformanceFixtures`.
- Consumes: canonical envelope and store port.

- [ ] **Step 1: Write failing transport contract tests**

The fake server must observe:

```text
POST /v1/projects/{projectId}/events:batch
Authorization: Bearer <token>
Idempotency-Key: <batch-hash>
Content-Type: application/json
```

Assert schema negotiation, partial results, retryable failures, non-retryable
authentication failures, and token redaction from diagnostics.

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test packages/aitm-ledger/test/conformance.test.mjs
node --test scripts/task-tracker/tests/unit/lib/ledger-http-transport.test.mjs
```

Expected: FAIL because transport and fixtures are absent.

- [ ] **Step 3: Implement the transport boundary**

The HTTP transport implements the same `append`, `appendBatch`, `readAfter`,
and `watermark` semantics where available. It reads the token from
`AITM_LEDGER_TOKEN`, never project config, and accepts an injectable `fetch`.

Publish fixture vectors for:

- valid and invalid events;
- conflicting IDs;
- canonical hashes;
- supported schema ranges;
- SQLite seed database;
- expected batch responses.

- [ ] **Step 4: Run focused tests**

Run both commands from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 11**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add packages/aitm-ledger scripts/task-tracker/lib/ledger \
  scripts/task-tracker/tests/unit/lib/ledger-http-transport.test.mjs
git commit -m "[#$active_issue] feat(ledger): publish transport conformance contract"
```

### Task 12: Add the `aitm ledger` Operator Surface

**Files:**

- Create: `scripts/task-tracker/ledger.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Modify: `bin/aitm-registry.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Create: `scripts/task-tracker/tests/unit/core/ledger-command.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/command-manifest.test.mjs`

**Interfaces:**

- Produces:

```text
aitm ledger init
aitm ledger status
aitm ledger backup
aitm ledger checkpoint [--push]
aitm ledger import-github [--issue N|--all] [--apply]
aitm ledger parity [--issue N|--all]
aitm ledger rebuild --from-git [--ref REF]
aitm ledger doctor
```

- Consumes: Tasks 5, 9-11.

- [ ] **Step 1: Write failing zero-side-effect help and CLI tests**

Every subcommand must reject unknown flags and print full help without opening
SQLite, running Git, or calling GitHub.

Mutation commands are dry-run by default where applicable. `rebuild` requires
an explicit source and confirmation unless `--yes` is supplied.

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test scripts/task-tracker/tests/unit/core/ledger-command.test.mjs
node --test scripts/task-tracker/tests/unit/core/command-manifest.test.mjs
```

Expected: FAIL because `aitm ledger` is absent.

- [ ] **Step 3: Implement strict command routing**

Parse arguments before opening resources. Return machine-readable result tokens
such as:

```text
aitm-ledger-init project=<uuid> path=<absolute-path>
aitm-ledger-checkpoint watermark=<event-id> pushed=<yes|no>
aitm-ledger-parity issues=<n> differences=<n>
aitm-ledger-rebuild events=<n> integrity=ok
```

- [ ] **Step 4: Run focused tests and help smoke**

```bash
node --test scripts/task-tracker/tests/unit/core/ledger-command.test.mjs
npx aitm ledger help
npx aitm ledger status --help
```

Expected: PASS and zero mutations from both help commands.

- [ ] **Step 5: Commit Task 12**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add scripts/task-tracker/ledger.mjs scripts/lib/self-doc.mjs \
  bin/aitm-registry.mjs scripts/task-tracker/lib/command-surface \
  scripts/task-tracker/tests
git commit -m "[#$active_issue] feat(cli): expose ledger operations"
```

### Task 13: Prove Installed-Package Readiness for Insights

**Files:**

- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/DESIGN.md`
- Create: `docs/guides/ledger-storage-and-recovery.md`
- Create: `scripts/task-tracker/tests/integration/lib/ledger-clean-install.test.mjs`
- Create: `scripts/task-tracker/tests/integration/lib/ledger-package-fixtures.test.mjs`
- Modify: `scripts/task-tracker/tests/unit/core/assert-file-excludes.test.mjs`

**Interfaces:**

- Produces: packed AITM and ledger artifacts usable by the Insights bootstrap.
- Consumes: every prior task.

- [ ] **Step 1: Write failing packed-install tests**

The test must:

1. run `npm pack` for both workspaces;
2. install the tarballs into a clean temporary Git repository;
3. initialize AITM without a source-repository self-link;
4. create `.db/aitm/project.sqlite`;
5. emit and read one authoritative event;
6. checkpoint and restore through a local Git remote;
7. import `@kburson/aitm-ledger/testing`;
8. prove `.tmp/` deletion does not remove `.db/`;
9. prove `npm pack --dry-run` excludes `.db/`.

- [ ] **Step 2: Run the clean-install test and confirm failure**

```bash
node --test scripts/task-tracker/tests/integration/lib/ledger-clean-install.test.mjs
node --test scripts/task-tracker/tests/integration/lib/ledger-package-fixtures.test.mjs
```

Expected: FAIL until package files, docs, and exports are complete.

- [ ] **Step 3: Complete packaging and documentation**

Document:

- `.db/` durability;
- local-filesystem support;
- Git journal security;
- backup and restore;
- public-repository behavior;
- Node floor;
- Insights dependency contract;
- remote token handling;
- Phase 1 dual-write status.

Add workspace release scripts that pack and verify both packages before
publishing.

- [ ] **Step 4: Run full verification**

```bash
npm run format
npm run format:check
npm run lint
npm test
npm run test:slow
npm pack --dry-run
npm pack --workspace @kburson/aitm-ledger --dry-run
```

Expected: every command exits `0`; package listings contain the documented
ledger code and no `.db/` files.

- [ ] **Step 5: Commit Task 13**

```bash
active_issue="$(npx aitm status | sed -nE 's/^Active: #([0-9]+).*/\1/p')"
git add package.json package-lock.json README.md docs scripts
git commit -m "[#$active_issue] docs(ledger): prove installed insights foundation"
```

## 4. Phase 1 Release Gate

Before publishing:

- [ ] Run every command in Task 13 Step 4.
- [ ] Install the packed artifacts into a clean repository on the minimum
      Node version.
- [ ] Run a two-worktree concurrent-write test against one main-worktree
      database.
- [ ] Run journal restore after deleting the disposable clean repository's
      `.db/`.
- [ ] Verify current GitHub timing, markers, project fields, review, approval,
      and close behavior are unchanged.
- [ ] Verify a ledger outage does not disable an AITM security gate.
- [ ] Verify diagnostics never print remote tokens.
- [ ] Publish `@kburson/aitm-ledger` before the matching AITM release.
- [ ] Record both published versions and integrity hashes in the Phase 2
      bootstrap issue.

## 5. Handoff to Phase 2

Phase 2 begins only after the Phase 1 release gate passes. Provide the new
Insights repository with:

- the published AITM version;
- the published ledger version;
- packed-artifact integrity hashes;
- the governing design reference commit;
- this plan reference commit;
- the Insights plan reference commit;
- the conformance fixture version;
- a clean-repository AITM initialization transcript;
- the supported Node version matrix.
