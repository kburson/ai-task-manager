# AITM Insights Project Implementation Plan

<!-- cspell:words correlator cutover cutovers healthcheck purgeable substreams transactionally WCAG -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the standalone AITM Insights skill, local visualization
application, and optional distributed event service after the AITM local-ledger
foundation has been published.

**Architecture:** The new `@kburson/aitm-insights` repository consumes the
transport-neutral `@kburson/aitm-ledger` package. Provider adapters stream
Claude and Codex transcripts into observational events and derived projections.
A loopback API serves the local SQLite-backed application, while the same API
contract is deployed behind authentication with PostgreSQL for distributed
teams. The published AITM skill governs development of this repository but is
not a production runtime dependency.

**Tech Stack:** Node.js `>=22.15.0`, ECMAScript modules,
`@kburson/aitm-ledger`, built-in `node:sqlite`, Fastify, React, Vite, Apache
ECharts, PostgreSQL, `pg`, JSON Schema, Playwright, `node:test`, OCI images, and
provider deployment templates.

## Global Constraints

- Governing design:
  `docs/superpowers/specs/2026-07-28-hybrid-ledger-and-insights-program-design.md`.
- Phase 2 begins only after Phase 1 publishes compatible versions of
  `@kburson/ai-task-manager` and `@kburson/aitm-ledger`.
- Initialize the new repository with that published AITM version before
  creating implementation issues.
- AITM may govern repository development, but production modules must not
  import AITM internals, invoke `npx aitm`, or require hidden GitHub markers.
- Local mode provides transcript mining and the complete web visualization
  product without Docker, PostgreSQL, or a cloud account.
- Standalone tests pass without `.ai-task-manager/`, GitHub credentials,
  provider transcript directories, a running AITM process, or PostgreSQL.
- The local database remains `<main-worktree>/.db/aitm/project.sqlite`.
- `.tmp/` is purgeable and contains no durable ledger, cursor, or projection
  state.
- Full raw transcript retention is disabled by default.
- Observed and inferred data never satisfy AITM lifecycle, evidence, review,
  approval, or delivery gates.
- Browser and agent clients never receive PostgreSQL credentials.
- Distributed writes pass through an authenticated HTTPS API.
- Remote-mode clients append locally first and use a durable outbox.
- Every event is idempotent by `eventId` plus `contentHash`.
- All project reads and writes are project-scoped and authorization checked.
- Use TDD, isolated issue worktrees, and one independently reviewable commit per
  implementation task.

---

## 1. Repository Structure

Create the new repository with this production boundary:

```text
aitm-insights/
  .ai-task-manager/              # installed AITM development governance
  .github/workflows/
    ci.yml
    remote-integration.yml
    deployment-smoke.yml
  deploy/
    compose.dev.yml
    aws/
    azure/
    gcp/
  packages/
    insights-cli/
      src/
      test/
    insights-core/
      src/
        ingest/
        attribution/
        derive/
        projections/
        retention/
      test/
      test-fixtures/
    insights-api/
      src/
        auth/
        routes/
        services/
      test/
    insights-postgres/
      src/
        migrations/
      test/
    insights-web/
      src/
        api/
        components/
        pages/
        visualizations/
      e2e/
  test/
    compatibility/
    integration/
  package.json
  package-lock.json
  README.md
  SECURITY.md
```

Package ownership:

- `@kburson/aitm-insights` is the CLI and installed skill package.
- `@kburson/aitm-insights-core` owns ingestion, attribution, retention,
  derivation, and read-model construction.
- `@kburson/aitm-insights-api` owns the transport-neutral HTTP application.
- `@kburson/aitm-insights-postgres` owns PostgreSQL migrations and storage
  adapters.
- `@kburson/aitm-insights-web` owns the browser application.
- `@kburson/aitm-ledger` remains the external protocol and local storage
  dependency.

Internal packages are private unless a later release decision establishes a
supported public interface.

## 2. Public Interfaces

### 2.1 Transcript source adapter

```js
// @kburson/aitm-insights-core
createTranscriptSource(config, deps = {}) -> TranscriptSource

// TranscriptSource
discover({ project }) -> AsyncIterable<TranscriptDescriptor>
open(descriptor, { cursor = null } = {}) -> AsyncIterable<TranscriptRecord>
fingerprint(descriptor) -> Promise<TranscriptFingerprint>
```

A `TranscriptRecord` is provider-neutral:

```js
{
  provider: "claude|codex",
  transcriptId: "provider-native-id",
  parentTranscriptId: "provider-native-id|null",
  recordId: "provider-stable-id-or-derived-hash",
  sequence: 42,
  occurredAt: "RFC3339 timestamp",
  kind: "message|tool-call|tool-result|lifecycle|metadata",
  role: "human|agent|system|tool|null",
  content: { text: "...", structured: {} },
  providerMetadata: {},
  source: {
    uriHash: "sha256",
    byteStart: 100,
    byteEnd: 250,
    prefixHash: "sha256"
  }
}
```

Provider adapters parse records. They do not persist events, assign tasks,
summarize content, or issue network requests.

### 2.2 Ingestion engine

```js
ingestProject({
  project,
  sources,
  ledger,
  policy,
  clock,
  ids
}) -> Promise<IngestionRunResult>
```

The ingestion engine:

1. discovers transcripts;
2. resumes from durable cursors;
3. detects truncation or rewrites;
4. redacts before persistence;
5. attributes records to task intervals;
6. appends observed events;
7. invalidates and rebuilds affected derived records;
8. commits cursor advancement in the same local transaction as emitted events.

### 2.3 Query service

```js
createInsightsQueryService({ ledger, projections }) -> InsightsQueryService

// InsightsQueryService
projectOverview(filter) -> Promise<ProjectOverview>
taskTimeline(taskId, filter) -> Promise<TaskTimeline>
sessionMatrix(filter) -> Promise<SessionTaskMatrix>
agentGraph(filter) -> Promise<AgentGraph>
timingBreakdown(filter) -> Promise<TimingBreakdown>
verificationTimeline(taskId, filter) -> Promise<VerificationTimeline>
repositoryRelationships(filter) -> Promise<RepositoryGraph>
decisionsAndRisks(filter) -> Promise<DecisionRiskFeed>
ingestionHealth(filter) -> Promise<IngestionHealth>
```

Every response includes source event IDs, authority filters, data-freshness
metadata, and gap diagnostics.

### 2.4 HTTP API

The local and hosted applications share this versioned surface:

```text
POST /v1/projects/{projectId}/events:batch
GET  /v1/projects/{projectId}/events?after={eventId}
GET  /v1/projects/{projectId}/snapshot
POST /v1/projects/{projectId}/sync:prepare
POST /v1/projects/{projectId}/sync:verify
GET  /v1/projects/{projectId}/health
GET  /v1/projects/{projectId}/insights/overview
GET  /v1/projects/{projectId}/insights/tasks/{taskId}
GET  /v1/projects/{projectId}/insights/session-matrix
GET  /v1/projects/{projectId}/insights/agent-graph
GET  /v1/projects/{projectId}/insights/timing
GET  /v1/projects/{projectId}/insights/relationships
GET  /v1/projects/{projectId}/insights/decisions-risks
GET  /v1/projects/{projectId}/insights/ingestion-health
```

## 3. Delivery Sequence

Tasks are sequential unless a task explicitly identifies independent
substreams. Tasks 1 through 6 establish the standalone core. Tasks 7 through 9
deliver the local product. Tasks 10 through 14 add distributed operation. Task
15 is the cross-repository release gate.

### Task 1: Bootstrap the Governed, Standalone Repository

**Files:**

- Create repository: `aitm-insights`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `README.md`
- Create: `SECURITY.md`
- Create: `.github/workflows/ci.yml`
- Create: `test/compatibility/dependency-boundary.test.mjs`
- Install through published AITM: `.ai-task-manager/`, `.agents/skills/task/`

**Interfaces:**

- Produces: governed development repository with standalone production package
  boundaries.
- Consumes: published Phase 1 AITM and ledger package tarballs.

- [ ] **Step 1: Verify Phase 1 release artifacts**

In a temporary directory, pack and inspect both published packages:

```bash
npm view @kburson/ai-task-manager version engines dist.integrity
npm view @kburson/aitm-ledger version engines dist.integrity
npm pack @kburson/ai-task-manager --dry-run
npm pack @kburson/aitm-ledger --dry-run
```

Stop if the ledger package lacks protocol schemas, SQLite migrations,
conformance fixtures, or the remote transport contract.

- [ ] **Step 2: Create the repository and install AITM**

Create a private GitHub repository initially. Clone it into an isolated local
directory, initialize npm, install the published AITM package, and run its
supported project initialization command.

Verify:

```bash
npx aitm --version
npx aitm doctor
npx aitm status
```

Create the Phase 2 epic and child issues from this plan only after the installed
AITM reports a healthy project.

- [ ] **Step 3: Write the failing dependency-boundary test**

The test recursively parses production imports and fails if any package:

- imports `@kburson/ai-task-manager`;
- imports from `.ai-task-manager/`;
- invokes `npx aitm` or an AITM script;
- treats GitHub hidden markers as required runtime input.

It also asserts every production package uses Node `>=22.15.0`.

- [ ] **Step 4: Scaffold the npm workspace**

Use root workspaces:

```json
{
  "workspaces": [
    "packages/insights-cli",
    "packages/insights-core",
    "packages/insights-api",
    "packages/insights-postgres",
    "packages/insights-web"
  ],
  "engines": { "node": ">=22.15.0" }
}
```

Pin `@kburson/aitm-ledger` to the Phase 1 compatible range and record its
protocol version in a compatibility manifest.

- [ ] **Step 5: Establish CI lanes**

The default lane runs lint, unit tests, SQLite integration tests, web component
tests, and production-boundary checks without secrets or Docker. PostgreSQL and
deployment lanes run separately.

- [ ] **Step 6: Run tests and commit**

```bash
npm ci
npm run format:check
npm run lint
npm test
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add package.json package-lock.json .gitignore .npmrc README.md SECURITY.md \
  .github test packages
git commit -m "[#$active_issue] chore: bootstrap AITM Insights"
```

Expected: default CI preconditions pass without provider transcripts,
PostgreSQL, or AITM runtime calls from production modules.

### Task 2: Lock the Ledger Compatibility Contract

**Files:**

- Create: `packages/insights-core/src/ledger/compatibility.mjs`
- Create: `packages/insights-core/src/ledger/open-local.mjs`
- Create: `packages/insights-core/test/ledger-conformance.test.mjs`
- Create: `test/compatibility/protocol-vectors.test.mjs`
- Create: `test/compatibility/standalone-startup.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: one ledger compatibility gate and local ledger opener.
- Consumes: `@kburson/aitm-ledger` protocol, fixtures, and SQLite adapter.

- [ ] **Step 1: Write failing protocol-vector tests**

Run the published valid, invalid, canonical-hash, idempotency, and supported
schema-version vectors through Insights. Assert identical results to the
expected fixture output.

- [ ] **Step 2: Write the failing standalone-startup test**

Launch the core in a temporary Git repository that contains neither
`.ai-task-manager/` nor GitHub configuration. Assert it creates an
observational project identity and opens `<root>/.db/aitm/project.sqlite`.

- [ ] **Step 3: Implement compatibility validation**

At startup:

- read the ledger package protocol range;
- read the database schema version;
- reject unsupported future schemas before mutation;
- report the minimum compatible package version;
- distinguish an AITM-governed ledger from an Insights-only ledger.

- [ ] **Step 4: Implement local opening**

Delegate path resolution, migrations, WAL policy, and connection behavior to
`@kburson/aitm-ledger`. Do not duplicate its SQLite SQL.

- [ ] **Step 5: Run focused and full tests**

```bash
node --test packages/insights-core/test/ledger-conformance.test.mjs
node --test test/compatibility/protocol-vectors.test.mjs
node --test test/compatibility/standalone-startup.test.mjs
npm test
```

- [ ] **Step 6: Commit**

```bash
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add packages/insights-core test/compatibility package.json package-lock.json
git commit -m "[#$active_issue] feat: enforce ledger compatibility"
```

### Task 3: Implement Claude and Codex Transcript Sources

**Files:**

- Create: `packages/insights-core/src/sources/port.mjs`
- Create: `packages/insights-core/src/sources/claude.mjs`
- Create: `packages/insights-core/src/sources/codex.mjs`
- Create: `packages/insights-core/src/sources/discovery.mjs`
- Create: `packages/insights-core/src/sources/record-id.mjs`
- Create: `packages/insights-core/test/sources/port.test.mjs`
- Create: `packages/insights-core/test/sources/claude.test.mjs`
- Create: `packages/insights-core/test/sources/codex.test.mjs`
- Create: `packages/insights-core/test-fixtures/claude/`
- Create: `packages/insights-core/test-fixtures/codex/`

**Interfaces:**

- Produces: provider-neutral `TranscriptSource` implementations.
- Consumes: local filesystem and injected discovery roots only.

- [ ] **Step 1: Create sanitized, synthetic fixtures**

Fixtures cover:

- normal messages;
- tool calls and results;
- parent and spawned sessions;
- compaction boundaries;
- interrupted records;
- multiple task mentions;
- large repeated context;
- malformed and unknown provider records.

Fixtures must contain no real user transcripts, credentials, absolute home
paths, repository secrets, or copyrighted source bodies.

- [ ] **Step 2: Write the adapter contract tests**

The shared suite asserts deterministic discovery, stable record IDs, monotonic
sequence values, bounded content, source offsets, parent identifiers, and
diagnostic records for unsupported input.

- [ ] **Step 3: Implement Claude parsing**

Parse supported Claude JSONL records into the provider-neutral contract.
Preserve provider-specific fields only under `providerMetadata`.

- [ ] **Step 4: Implement Codex parsing**

Parse supported Codex session-log records into the same contract. Keep provider
path discovery configurable because provider storage locations may change.

- [ ] **Step 5: Add safe discovery**

Discovery:

- accepts explicit roots before defaults;
- never traverses outside configured roots;
- ignores symlinks escaping the root;
- streams files instead of reading them entirely;
- hashes source URIs before persistence;
- records unsupported format versions as diagnostics.

- [ ] **Step 6: Run tests and commit**

```bash
node --test packages/insights-core/test/sources
npm test
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add packages/insights-core
git commit -m "[#$active_issue] feat: add transcript source adapters"
```

### Task 4: Build Incremental, Rewrite-Safe Ingestion

**Files:**

- Create: `packages/insights-core/src/ingest/ingest-project.mjs`
- Create: `packages/insights-core/src/ingest/cursor-store.mjs`
- Create: `packages/insights-core/src/ingest/rewrite-detector.mjs`
- Create: `packages/insights-core/src/ingest/event-mapper.mjs`
- Create: `packages/insights-core/src/ingest/diagnostics.mjs`
- Create: `packages/insights-core/src/migrations/001-insights-cursors.mjs`
- Create: `packages/insights-core/test/ingest/incremental.test.mjs`
- Create: `packages/insights-core/test/ingest/rewrite.test.mjs`
- Create: `packages/insights-core/test/ingest/crash-resume.test.mjs`

**Interfaces:**

- Produces: deterministic, resumable `ingestProject`.
- Consumes: transcript sources and `LedgerStore`.

- [ ] **Step 1: Write failing incremental-ingestion tests**

Assert:

- unchanged input emits no duplicate events;
- appended records resume from the last complete record;
- a truncated final JSONL record is deferred;
- cursor and event writes commit atomically;
- a crash before commit replays safely;
- a crash after commit resumes without duplication.

- [ ] **Step 2: Write failing rewrite tests**

Test same-length mutation, truncation, prefix rewrite, file replacement, and
record reordering. Expect the earliest divergent source range to be reprocessed
and affected derived records invalidated.

- [ ] **Step 3: Add namespaced cursor migrations**

Create `insights_transcript_cursors` with project, provider, transcript,
fingerprint, byte or record position, prefix hash, status, and timestamps.
Register it through the ledger migration engine.

- [ ] **Step 4: Implement transactional ingestion**

For each bounded batch:

1. read a verified cursor;
2. parse complete records;
3. map records to observed event candidates;
4. append events and advance the cursor in one transaction;
5. emit `transcript.cursor.advanced`;
6. return per-source counts and warnings.

- [ ] **Step 5: Implement rewrite recovery**

Find the last verified prefix checkpoint, append invalidation events for
affected observations and derived records, and resume from the divergence.
Never delete immutable canonical events.

- [ ] **Step 6: Run tests and commit**

```bash
node --test packages/insights-core/test/ingest
npm test
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add packages/insights-core
git commit -m "[#$active_issue] feat: add resumable transcript ingestion"
```

### Task 5: Correlate Tasks, Sessions, Agents, and Git

**Files:**

- Create: `packages/insights-core/src/attribution/interval-index.mjs`
- Create: `packages/insights-core/src/attribution/task-attributor.mjs`
- Create: `packages/insights-core/src/attribution/agent-correlator.mjs`
- Create: `packages/insights-core/src/attribution/git-correlator.mjs`
- Create: `packages/insights-core/src/attribution/confidence.mjs`
- Create: `packages/insights-core/test/attribution/task-switching.test.mjs`
- Create: `packages/insights-core/test/attribution/multi-session.test.mjs`
- Create: `packages/insights-core/test/attribution/spawned-agent.test.mjs`
- Create: `packages/insights-core/test/attribution/standalone.test.mjs`

**Interfaces:**

- Produces: `task.slice.observed` and `relationship.inferred` events.
- Consumes: authoritative task-context intervals when available, transcript
  metadata, Git facts, and explicit source references.

- [ ] **Step 1: Write the attribution truth table**

Cover these cases:

| Signal                                                   | Classification                          | Confidence                 |
| -------------------------------------------------------- | --------------------------------------- | -------------------------- |
| AITM `task.bound` interval contains record timestamp     | observed link to authoritative interval | `1`                        |
| Provider record contains explicit task and parent IDs    | observed                                | `1`                        |
| Spawn metadata matches project, task, branch, and parent | observed                                | `1`                        |
| Branch and worktree match one active task                | inferred                                | below `1`                  |
| Nearby issue text is the only signal                     | inferred                                | below configured threshold |
| Signals conflict                                         | unassigned warning                      | `0`                        |

- [ ] **Step 2: Write failing multi-task and multi-session tests**

Prove one session can be divided across sequential task intervals and one task
can aggregate slices from multiple sessions without double counting.

- [ ] **Step 3: Write failing spawned-agent tests**

Test explicit metadata, provider parent IDs, and heuristic fallback. Assert
confidence and source signals remain visible.

- [ ] **Step 4: Implement the interval index**

Build a time-ordered index from `task.bound`, `task.unbound`, `task.paused`,
`task.resumed`, and session events. Treat overlapping authoritative intervals
as a diagnostic, not an arbitrary winner.

- [ ] **Step 5: Implement correlation**

Use signals in descending authority:

1. authoritative task interval;
2. explicit provider metadata;
3. explicit spawn handoff metadata;
4. Git worktree and branch;
5. commit message and issue reference;
6. bounded textual inference.

- [ ] **Step 6: Run tests and commit**

```bash
node --test packages/insights-core/test/attribution
npm test
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add packages/insights-core
git commit -m "[#$active_issue] feat: correlate task and agent activity"
```

### Task 6: Enforce Redaction, Retention, and Derivation Provenance

**Files:**

- Create: `packages/insights-core/src/retention/policy.mjs`
- Create: `packages/insights-core/src/retention/redactor.mjs`
- Create: `packages/insights-core/src/retention/excerpt.mjs`
- Create: `packages/insights-core/src/derive/port.mjs`
- Create: `packages/insights-core/src/derive/rules.mjs`
- Create: `packages/insights-core/src/derive/materialize.mjs`
- Create: `packages/insights-core/src/migrations/002-derived-records.mjs`
- Create: `packages/insights-core/test/retention/default-policy.test.mjs`
- Create: `packages/insights-core/test/retention/secrets.test.mjs`
- Create: `packages/insights-core/test/derive/provenance.test.mjs`

**Interfaces:**

- Produces: sanitized observed events and provenance-bearing derived records.
- Consumes: provider-neutral records and attributed task slices.

- [ ] **Step 1: Write failing default-retention tests**

Assert the durable store excludes:

- complete raw messages;
- full tool output;
- repeated injected instructions;
- source bodies already addressable by Git SHA;
- environment values matching secret patterns;
- absolute user-home paths.

Assert it retains bounded excerpts, hashes, source offsets, tool names,
durations, exit states, artifact references, and redaction reasons.

- [ ] **Step 2: Write secret-redaction tests**

Use synthetic API keys, bearer tokens, private keys, connection strings,
cookies, and authorization headers. Verify secrets do not appear in events,
logs, diagnostics, snapshots, or browser API responses.

- [ ] **Step 3: Implement policy configuration**

Support:

```js
{
  rawArchive: { enabled: false },
  excerpts: { maxChars: 1000 },
  toolResults: { maxChars: 2000 },
  derived: { retentionDays: null },
  sourcePaths: { persist: "hash-only" }
}
```

Enabling raw archives requires an encryption key reference, destination,
maximum size, and retention period. Reject incomplete opt-in configuration.

- [ ] **Step 4: Implement deterministic derivation first**

Create rule-based summaries for timing, verification results, Git
relationships, task switching, retries, and ingestion gaps. Define an
injectable model-derivation port, but do not require a model service for the
initial release.

- [ ] **Step 5: Persist provenance**

Every derived record stores:

- source event IDs;
- algorithm and version;
- created timestamp;
- confidence;
- invalidation status;
- policy version.

- [ ] **Step 6: Run tests and commit**

```bash
node --test packages/insights-core/test/retention
node --test packages/insights-core/test/derive
npm test
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add packages/insights-core
git commit -m "[#$active_issue] feat: enforce insights data retention"
```

### Task 7: Build Rebuildable Local Read Models

**Files:**

- Create: `packages/insights-core/src/projections/registry.mjs`
- Create: `packages/insights-core/src/projections/runner.mjs`
- Create: `packages/insights-core/src/projections/project-overview.mjs`
- Create: `packages/insights-core/src/projections/task-timeline.mjs`
- Create: `packages/insights-core/src/projections/session-matrix.mjs`
- Create: `packages/insights-core/src/projections/agent-graph.mjs`
- Create: `packages/insights-core/src/projections/timing.mjs`
- Create: `packages/insights-core/src/projections/verification.mjs`
- Create: `packages/insights-core/src/projections/relationships.mjs`
- Create: `packages/insights-core/src/projections/decisions-risks.mjs`
- Create: `packages/insights-core/src/projections/ingestion-health.mjs`
- Create: `packages/insights-core/src/query/service.mjs`
- Create: `packages/insights-core/test/projections/rebuild.test.mjs`
- Create: `packages/insights-core/test/query/service.test.mjs`

**Interfaces:**

- Produces: `InsightsQueryService`.
- Consumes: canonical event stream only.

- [ ] **Step 1: Write projection golden tests**

Build one synthetic project containing parallel agents, task switching, failed
verification, rework, review, approval, commit, integration, and ingestion
warnings. Assert exact projection JSON.

- [ ] **Step 2: Write rebuild-equivalence tests**

Compare:

- incremental projection;
- clean rebuild from event zero;
- rebuild after invalidation;
- rebuild after snapshot restore.

All must produce the same canonical output and terminal watermark.

- [ ] **Step 3: Add projection migrations**

Create namespaced tables for materialized task slices, relationships,
summaries, and dashboard rollups. Store each projection's version and source
watermark.

- [ ] **Step 4: Implement the runner**

Projection handlers are pure event reducers wrapped by bounded storage
transactions. They must be restartable, versioned, and independently
rebuildable.

- [ ] **Step 5: Implement query filters**

Every query accepts:

- time range;
- task and session IDs;
- agent and worktree IDs;
- authority classes;
- confidence threshold;
- branch and file filters.

- [ ] **Step 6: Run tests and commit**

```bash
node --test packages/insights-core/test/projections
node --test packages/insights-core/test/query
npm test
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add packages/insights-core
git commit -m "[#$active_issue] feat: add insights read models"
```

### Task 8: Serve the Secure Local API and CLI

**Files:**

- Create: `packages/insights-api/src/app.mjs`
- Create: `packages/insights-api/src/mode/local.mjs`
- Create: `packages/insights-api/src/auth/local-token.mjs`
- Create: `packages/insights-api/src/routes/insights.mjs`
- Create: `packages/insights-api/src/routes/health.mjs`
- Create: `packages/insights-api/test/local-security.test.mjs`
- Create: `packages/insights-api/test/query-routes.test.mjs`
- Create: `packages/insights-cli/src/cli.mjs`
- Create: `packages/insights-cli/src/commands/init.mjs`
- Create: `packages/insights-cli/src/commands/mine.mjs`
- Create: `packages/insights-cli/src/commands/serve.mjs`
- Create: `packages/insights-cli/src/commands/doctor.mjs`
- Create: `packages/insights-cli/test/help.test.mjs`
- Create: `packages/insights-cli/test/local-flow.test.mjs`

**Interfaces:**

- Produces: `aitm-insights init|mine|serve|doctor`.
- Consumes: local ledger, ingestion engine, and query service.

- [ ] **Step 1: Write complete help tests**

Assert root and subcommand help exits zero, writes no files, opens no database,
starts no server, and requires no GitHub or provider access.

- [ ] **Step 2: Write failing local-security tests**

Assert:

- default bind is `127.0.0.1`;
- a cryptographically random token is required;
- cross-origin requests are denied by default;
- transcript-derived text is returned only as JSON data;
- non-loopback binding is rejected without explicit authentication;
- access tokens are never logged or persisted in shell history instructions.

- [ ] **Step 3: Implement local commands**

Behavior:

- `init` creates Insights configuration and observational project identity if
  no governed ledger exists;
- `mine` performs one incremental ingestion run;
- `serve` mines, refreshes projections, starts the loopback API, and serves web
  assets;
- `doctor` checks compatibility, database integrity, source access, retention
  policy, and cursor health.

- [ ] **Step 4: Implement local authentication**

Generate an in-memory token at startup, place it in the opened browser URL
fragment or equivalent non-server-log channel, exchange it for an
`HttpOnly`, `SameSite=Strict` session cookie, and immediately remove it from
visible navigation state.

- [ ] **Step 5: Test the complete local flow**

In a temporary standalone repository:

```bash
aitm-insights init
aitm-insights mine --source ./test-fixtures/codex
aitm-insights doctor --json
aitm-insights serve --no-open
```

Assert `.db/aitm/project.sqlite` exists, `.tmp/` can be deleted without data
loss, and all API routes return source-linked responses.

- [ ] **Step 6: Run tests and commit**

```bash
node --test packages/insights-api/test
node --test packages/insights-cli/test
npm test
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add packages/insights-api packages/insights-cli
git commit -m "[#$active_issue] feat: serve local insights API"
```

### Task 9: Deliver the Local Visualization Application

**Files:**

- Create: `packages/insights-web/index.html`
- Create: `packages/insights-web/src/main.jsx`
- Create: `packages/insights-web/src/api/client.js`
- Create: `packages/insights-web/src/pages/ProjectOverview.jsx`
- Create: `packages/insights-web/src/pages/TaskDetail.jsx`
- Create: `packages/insights-web/src/pages/IngestionHealth.jsx`
- Create: `packages/insights-web/src/visualizations/ExecutionTimeline.jsx`
- Create: `packages/insights-web/src/visualizations/LifecyclePath.jsx`
- Create: `packages/insights-web/src/visualizations/SessionTaskMatrix.jsx`
- Create: `packages/insights-web/src/visualizations/AgentGraph.jsx`
- Create: `packages/insights-web/src/visualizations/TimingBreakdown.jsx`
- Create: `packages/insights-web/src/visualizations/VerificationTimeline.jsx`
- Create: `packages/insights-web/src/visualizations/RepositoryGraph.jsx`
- Create: `packages/insights-web/src/visualizations/DecisionRiskFeed.jsx`
- Create: `packages/insights-web/src/components/AuthorityFilter.jsx`
- Create: `packages/insights-web/src/components/EvidenceDrawer.jsx`
- Create: `packages/insights-web/e2e/local-dashboard.spec.js`
- Create: `packages/insights-web/e2e/accessibility.spec.js`
- Modify: `packages/insights-api/src/app.mjs`

**Interfaces:**

- Produces: browser visualization product shared by local and hosted modes.
- Consumes: versioned Insights HTTP query routes only.

- [ ] **Step 1: Write browser acceptance tests**

Use the synthetic project from Task 7. Assert a user can:

- distinguish authoritative, observed, and inferred data;
- filter by task, session, agent, time, authority, and confidence;
- follow a chart point to source event IDs and evidence;
- see parallel agent fan-out;
- see one session split between tasks;
- see one task aggregated across sessions;
- identify failed verification and rework;
- identify ingestion gaps and sync lag.

- [ ] **Step 2: Establish visual and accessibility constraints**

Use semantic HTML, keyboard navigation, visible focus, non-color-only status
encoding, responsive layouts, text alternatives for charts, and WCAG AA color
contrast. Treat transcript excerpts as untrusted text and never inject HTML.

- [ ] **Step 3: Implement the application shell and API client**

The browser reads the API base from runtime configuration so the same build
works locally and remotely. No filesystem or database access is bundled into
the web package.

- [ ] **Step 4: Implement the initial visualization set**

Use ECharts for dense timelines, matrices, graphs, and timing plots. Keep
projection math server-side; browser components format and interact with
versioned response models.

- [ ] **Step 5: Bundle web assets into the API package**

Build static assets reproducibly and serve them with strict content-security
policy, no inline script requirement, immutable asset caching, and no
permissive cross-origin policy.

- [ ] **Step 6: Run browser and package tests**

```bash
npm run build --workspace @kburson/aitm-insights-web
npm run test --workspace @kburson/aitm-insights-web
npx playwright test packages/insights-web/e2e
npm test
```

- [ ] **Step 7: Commit**

```bash
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add packages/insights-web packages/insights-api
git commit -m "[#$active_issue] feat: add local insights dashboard"
```

**Local product milestone:** release a local-only preview after this task. It
must not require the distributed service.

### Task 10: Implement PostgreSQL Ledger and Projection Adapters

**Files:**

- Create: `packages/insights-postgres/src/open.mjs`
- Create: `packages/insights-postgres/src/event-store.mjs`
- Create: `packages/insights-postgres/src/projection-store.mjs`
- Create: `packages/insights-postgres/src/migrate.mjs`
- Create: `packages/insights-postgres/src/migrations/001-ledger.sql`
- Create: `packages/insights-postgres/src/migrations/002-insights.sql`
- Create: `packages/insights-postgres/test/ledger-conformance.test.mjs`
- Create: `packages/insights-postgres/test/projection-rebuild.test.mjs`
- Create: `deploy/compose.dev.yml`
- Modify: `.github/workflows/remote-integration.yml`

**Interfaces:**

- Produces: PostgreSQL storage implementations matching ledger and projection
  contracts.
- Consumes: published ledger conformance kit and canonical events.

- [ ] **Step 1: Write failing shared conformance tests**

Run the same append, batch, duplicate, conflicting-ID, ordering, watermark,
schema negotiation, and transaction cases against SQLite and PostgreSQL.

- [ ] **Step 2: Add contributor-only PostgreSQL**

Create `deploy/compose.dev.yml` for the remote integration lane. It is not part
of local user installation. Pin the PostgreSQL major version and add a health
check.

- [ ] **Step 3: Implement migrations**

Use:

- `jsonb` for the validated envelope and payload;
- typed indexed columns for project, event, task, session, authority, type, and
  time;
- unique `(project_id, event_id)`;
- stored content hash conflict detection;
- per-project projection watermarks;
- transactional migration checksums.

Do not use PostgreSQL row-level security as the sole authorization boundary;
the API must also enforce project scope.

- [ ] **Step 4: Implement the adapters**

Use parameterized queries only. Keep transactions bounded and map database
errors into stable storage-port errors.

- [ ] **Step 5: Run the remote integration lane**

```bash
docker compose -f deploy/compose.dev.yml up -d --wait
npm run test:postgres
docker compose -f deploy/compose.dev.yml down
```

Expected: SQLite and PostgreSQL pass the same logical conformance vectors.

- [ ] **Step 6: Commit**

```bash
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add packages/insights-postgres deploy .github/workflows/remote-integration.yml
git commit -m "[#$active_issue] feat: add PostgreSQL storage"
```

### Task 11: Secure the Hosted API

**Files:**

- Create: `packages/insights-api/src/mode/hosted.mjs`
- Create: `packages/insights-api/src/auth/github-oauth.mjs`
- Create: `packages/insights-api/src/auth/agent-tokens.mjs`
- Create: `packages/insights-api/src/auth/authorization.mjs`
- Create: `packages/insights-api/src/auth/token-store.mjs`
- Create: `packages/insights-api/src/routes/events.mjs`
- Create: `packages/insights-api/src/routes/sync.mjs`
- Create: `packages/insights-api/src/routes/admin.mjs`
- Create: `packages/insights-api/src/services/rate-limit.mjs`
- Create: `packages/insights-api/src/services/audit-log.mjs`
- Create: `packages/insights-api/test/authentication.test.mjs`
- Create: `packages/insights-api/test/authorization.test.mjs`
- Create: `packages/insights-api/test/events-idempotency.test.mjs`
- Create: `packages/insights-api/test/project-isolation.test.mjs`
- Create: `packages/insights-api/test/rate-limit.test.mjs`

**Interfaces:**

- Produces: authenticated, project-isolated hosted API.
- Consumes: PostgreSQL adapters and GitHub repository authorization adapter.

- [ ] **Step 1: Write the threat model**

Document trust boundaries for browser, human identity, agent token, API,
GitHub, PostgreSQL, deployment secrets, logs, and transcript-derived content.
Include cross-project access, token theft, replay, injection, denial of
service, and malicious transcript content.

- [ ] **Step 2: Write failing authentication tests**

Cover expired OAuth state, callback replay, revoked agent tokens, wrong scopes,
token rotation, hash-at-rest verification, and secret-safe logging.

- [ ] **Step 3: Write failing project-isolation tests**

For every route, attempt cross-project reads and writes with:

- another project's human member;
- another project's agent token;
- a valid token lacking the requested scope;
- a forged project ID in the request body.

- [ ] **Step 4: Implement human authentication**

Use GitHub OAuth for human sessions. Authorize access against current
repository permissions and cache authorization only for a bounded interval.
Require reauthorization for token management and destructive administration.

- [ ] **Step 5: Implement agent credentials**

Create random project-scoped bearer tokens with:

- `events:append`;
- optional `events:read`;
- expiration;
- rotation and revocation;
- one-time display;
- keyed hash storage;
- last-used audit metadata.

- [ ] **Step 6: Implement event and sync routes**

Validate authorization before payload processing, enforce content length and
batch limits, negotiate schema versions, preserve event IDs, return per-event
idempotency statuses, and acknowledge only committed persistence.

- [ ] **Step 7: Add rate limits and audit records**

Rate limits are project and credential scoped. Security audit records exclude
tokens, raw transcripts, complete event payloads, and database connection
strings.

- [ ] **Step 8: Run security tests and commit**

```bash
node --test packages/insights-api/test
npm run test:postgres
npm run lint
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add packages/insights-api SECURITY.md
git commit -m "[#$active_issue] feat: secure hosted insights API"
```

### Task 12: Implement Local and Remote Synchronization

**Files:**

- Create: `packages/insights-core/src/sync/client.mjs`
- Create: `packages/insights-core/src/sync/outbox-drainer.mjs`
- Create: `packages/insights-core/src/sync/prepare.mjs`
- Create: `packages/insights-core/src/sync/verify.mjs`
- Create: `packages/insights-core/src/sync/cutover.mjs`
- Create: `packages/insights-core/src/sync/disconnect.mjs`
- Create: `packages/insights-core/src/sync/batch-hash.mjs`
- Create: `packages/insights-cli/src/commands/remote.mjs`
- Create: `packages/insights-cli/src/commands/sync.mjs`
- Create: `packages/insights-core/test/sync/outbox.test.mjs`
- Create: `packages/insights-core/test/sync/cutover.test.mjs`
- Create: `packages/insights-core/test/sync/interruption.test.mjs`
- Create: `test/integration/local-remote-roundtrip.test.mjs`

**Interfaces:**

- Produces: resumable local-to-cloud and cloud-to-local cutover.
- Consumes: ledger outbox, hosted API, snapshots, and sync watermarks.

- [ ] **Step 1: Write interruption matrices**

Interrupt after each boundary:

- remote project creation;
- local preparation watermark;
- partial event batch;
- batch acknowledgement;
- initial catch-up;
- final verification;
- configuration switch;
- credential revocation.

Assert rerunning converges without duplicate or missing events.

- [ ] **Step 2: Implement append-local-first delivery**

Remote-mode producers append to local SQLite and enqueue the original event.
The drainer sends bounded batches, records acknowledgements transactionally,
and retries only unresolved event IDs.

- [ ] **Step 3: Implement cutover verification**

Compare:

- project ID;
- schema range;
- total event count;
- first and last event IDs;
- deterministic per-batch hashes;
- terminal watermark;
- allowed derived-record counts.

Do not switch configuration until the comparison has zero unexplained
differences.

- [ ] **Step 4: Implement reverse cutover**

Download a consistent remote snapshot, verify it, rebuild a new local database,
rebuild projections, then atomically select the new database. Preserve the old
database under `.db/aitm/backups/`.

- [ ] **Step 5: Implement CLI workflows**

```text
aitm-insights remote connect
aitm-insights sync status
aitm-insights sync push
aitm-insights sync verify
aitm-insights remote disconnect --target local
```

Commands display mutation scope before execution and never print credentials.

- [ ] **Step 6: Run round-trip tests and commit**

```bash
node --test packages/insights-core/test/sync
npm run test:postgres
node --test test/integration/local-remote-roundtrip.test.mjs
npm test
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add packages/insights-core packages/insights-cli test/integration
git commit -m "[#$active_issue] feat: synchronize local and remote ledgers"
```

### Task 13: Package the Service and Contributor Environment

**Files:**

- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `deploy/entrypoint.mjs`
- Create: `deploy/healthcheck.mjs`
- Create: `deploy/README.md`
- Create: `test/integration/container-smoke.test.mjs`
- Modify: `deploy/compose.dev.yml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces: one non-root OCI service image with built web assets.
- Consumes: hosted API and external PostgreSQL connection.

- [ ] **Step 1: Write the failing image inspection test**

Assert:

- image runs as a non-root numeric user;
- production dependencies only;
- no `.ai-task-manager/`, `.db/`, `.tmp/`, transcripts, test fixtures, Git
  history, or local credentials are included;
- a read-only root filesystem is supported;
- secrets arrive through runtime secret references;
- health checks do not disclose configuration.

- [ ] **Step 2: Build a reproducible multi-stage image**

Build the browser assets and Node service in separate stages. Copy only
production outputs and dependency metadata into the final image.

- [ ] **Step 3: Define startup behavior**

The entry point validates configuration, waits for PostgreSQL with a bounded
timeout, runs migrations under a migration lock, then starts the API. Concurrent
instances must not race migrations.

- [ ] **Step 4: Update contributor compose**

Compose includes PostgreSQL, one Insights service, health checks, and ephemeral
test volumes. Clearly label it as a contributor and small self-managed
deployment tool, not a local-user requirement.

- [ ] **Step 5: Run container smoke tests**

```bash
docker build -t aitm-insights:test .
node --test test/integration/container-smoke.test.mjs
docker compose -f deploy/compose.dev.yml up -d --wait
npm run test:remote-smoke
docker compose -f deploy/compose.dev.yml down
```

- [ ] **Step 6: Commit**

```bash
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add Dockerfile .dockerignore deploy test/integration .github/workflows/ci.yml
git commit -m "[#$active_issue] build: package Insights service"
```

### Task 14: Add AWS, Azure, and GCP Deployment Paths

**Files:**

- Create: `deploy/aws/README.md`
- Create: `deploy/aws/template/`
- Create: `deploy/aws/smoke.mjs`
- Create: `deploy/azure/README.md`
- Create: `deploy/azure/template/`
- Create: `deploy/azure/smoke.mjs`
- Create: `deploy/gcp/README.md`
- Create: `deploy/gcp/template/`
- Create: `deploy/gcp/smoke.mjs`
- Create: `deploy/shared/config-schema.json`
- Create: `deploy/shared/validate.mjs`
- Modify: `.github/workflows/deployment-smoke.yml`

**Interfaces:**

- Produces: supported reference deployments for one service plus managed
  PostgreSQL.
- Consumes: OCI image and stable runtime configuration schema.

- [ ] **Step 1: Define one provider-neutral configuration schema**

Require:

- public HTTPS origin;
- GitHub OAuth client references;
- agent-token hashing key reference;
- PostgreSQL secret reference and TLS policy;
- service image digest;
- backup retention;
- log destination;
- minimum and maximum service capacity.

- [ ] **Step 2: Write static deployment validation**

Each template must:

- use managed PostgreSQL by default;
- keep PostgreSQL private;
- terminate HTTPS at a managed ingress;
- source secrets from the provider secret manager;
- enable database backups;
- run the container as non-root;
- expose only the service port;
- configure health checks;
- avoid provider credentials in repository files.

- [ ] **Step 3: Implement AWS reference deployment**

Use a managed container runtime, private managed PostgreSQL, managed secret
storage, HTTPS ingress, and log collection. Document expected cost drivers and
the smaller self-managed alternative separately.

- [ ] **Step 4: Implement Azure reference deployment**

Use corresponding managed container, PostgreSQL, secret, ingress, and logging
services while preserving the provider-neutral runtime contract.

- [ ] **Step 5: Implement GCP reference deployment**

Use corresponding managed container, PostgreSQL, secret, ingress, and logging
services while preserving the provider-neutral runtime contract.

- [ ] **Step 6: Add ephemeral smoke tests**

For each provider, CI can provision a uniquely named test project deployment,
run health, OAuth-configuration, event round-trip, project-isolation, and web
asset checks, then destroy the exact resources it created. Destruction requires
validated provider, account, region, and deployment identifiers.

- [ ] **Step 7: Run validation and commit**

```bash
node deploy/shared/validate.mjs
npm run test:deployment-static
npm test
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add deploy .github/workflows/deployment-smoke.yml
git commit -m "[#$active_issue] feat: add cloud deployment paths"
```

Provider smoke lanes remain manual or scheduled until their isolated test
accounts and cost controls are configured.

### Task 15: Prove Standalone Operation, AITM Integration, and Release Safety

**Files:**

- Create: `test/acceptance/standalone-local.test.mjs`
- Create: `test/acceptance/aitm-local.test.mjs`
- Create: `test/acceptance/distributed.test.mjs`
- Create: `test/acceptance/uninstall-insights.test.mjs`
- Create: `test/acceptance/raw-chat-default.test.mjs`
- Create: `docs/operations/local.md`
- Create: `docs/operations/distributed.md`
- Create: `docs/operations/migration.md`
- Create: `docs/operations/recovery.md`
- Create: `docs/architecture/authority-boundary.md`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `package.json`

**Interfaces:**

- Produces: release evidence for all four supported configurations.
- Consumes: published-style packages, local ledger, UI, hosted API, and
  deployment artifacts.

- [ ] **Step 1: Pack and install production artifacts**

Create npm tarballs and the OCI image from committed source. Install the
tarballs into clean temporary repositories; do not test release acceptance
against workspace symlinks.

- [ ] **Step 2: Prove standalone local mode**

Without AITM, GitHub credentials, Docker, or PostgreSQL:

1. initialize Insights;
2. ingest synthetic provider fixtures;
3. restart and resume ingestion;
4. serve the local UI;
5. verify every initial visualization;
6. delete `.tmp/`;
7. verify the ledger, cursors, and projections remain intact.

- [ ] **Step 3: Prove AITM plus local Insights**

In a clean repository initialized by the published Phase 1 AITM:

1. execute representative lifecycle transitions;
2. run multiple sessions and isolated worktrees;
3. ingest their synthetic transcripts;
4. verify authoritative and observed correlations;
5. stop and uninstall Insights;
6. prove AITM gates, GitHub workflow, local ledger, and journal recovery still
   operate.

- [ ] **Step 4: Prove distributed mode**

Run two isolated clients and one hosted service:

1. create one project;
2. issue distinct scoped credentials;
3. append concurrently;
4. interrupt and resume delivery;
5. verify project isolation;
6. complete local-to-cloud cutover;
7. complete cloud-to-local cutover;
8. reconcile counts, IDs, hashes, projections, and watermarks.

- [ ] **Step 5: Prove raw-chat exclusion**

Search SQLite, PostgreSQL, snapshots, journal artifacts, logs, browser
responses, and package contents for fixture-only canary strings that occur
outside allowed excerpts. The default configuration must retain no complete raw
transcript.

- [ ] **Step 6: Run the release gate**

```bash
npm ci
npm run format:check
npm run lint
npm test
npm run test:postgres
npm run test:e2e
npm run test:acceptance
npm pack --dry-run
docker build -t aitm-insights:release-candidate .
```

Record exact package versions, ledger protocol range, schema versions, image
digest, test counts, and deployment-smoke evidence.

- [ ] **Step 7: Commit release documentation**

```bash
active_issue="$(npx aitm status --json | node -e \
  'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.parse(s).issue.number))')"
git add test/acceptance docs README.md SECURITY.md package.json package-lock.json
git commit -m "[#$active_issue] docs: complete Insights release gate"
```

## 4. Cross-Repository Release Contract

Before an Insights release, record:

```json
{
  "aitmDevelopmentVersion": "published version used to govern this repo",
  "ledgerVersionRange": "supported npm semver range",
  "eventSchemaVersions": [1],
  "sqliteSchemaRange": { "min": 1, "max": 1 },
  "postgresSchemaRange": { "min": 1, "max": 1 },
  "remoteApiVersions": ["v1"]
}
```

Compatibility CI tests:

1. minimum supported ledger version;
2. pinned release version;
3. next unpublished ledger version through a packed cross-repository artifact
   when available.

An incompatible ledger change must fail Insights CI before either package is
published.

## 5. Release Milestones

### Milestone A: standalone ingestion core

Tasks 1 through 7 complete. Claude and Codex fixtures ingest incrementally,
task attribution works, raw chat is excluded by default, and read models rebuild
from canonical events.

### Milestone B: local Insights product

Tasks 8 and 9 complete. A user can install Insights solely for local
visualization, with no cloud account, Docker, or PostgreSQL.

### Milestone C: distributed service

Tasks 10 through 12 complete. Multiple machines and cloud agents synchronize
through an authenticated API backed by PostgreSQL.

### Milestone D: deployable release

Tasks 13 through 15 complete. The service has a hardened image, three provider
paths, cross-landscape migration evidence, and proof that AITM remains secure
without Insights.

## 6. Phase 2 Exit Criteria

- [ ] The repository was initialized and governed with the published Phase 1
      AITM package.
- [ ] Production packages have no AITM runtime dependency.
- [ ] Standalone tests pass without AITM, GitHub credentials, provider data,
      Docker, or PostgreSQL.
- [ ] Claude and Codex transcript adapters pass sanitized fixture contracts.
- [ ] Incremental ingestion survives append, truncation, rewrite, and crash
      cases.
- [ ] One task can aggregate multiple sessions.
- [ ] One session can be divided across multiple tasks.
- [ ] Spawned agents retain parent, task, worktree, branch, and confidence
      relationships.
- [ ] Raw transcript retention remains off by default.
- [ ] Local users receive the complete web visualization product.
- [ ] `.db/aitm/project.sqlite` survives deletion of `.tmp/`.
- [ ] SQLite and PostgreSQL pass shared ledger conformance.
- [ ] Hosted project isolation, authentication, token rotation, rate limiting,
      and idempotency pass.
- [ ] Clients never receive PostgreSQL credentials.
- [ ] Local-to-cloud and cloud-to-local cutovers pass interruption and
      reconciliation tests.
- [ ] AWS, Azure, and GCP reference deployments pass static validation and at
      least one provider path has live smoke evidence before general
      availability.
- [ ] Removing or stopping Insights does not weaken AITM gates.
- [ ] Release artifacts are tested from npm tarballs and an OCI image built
      from the exact committed source.

## 7. Deferred Decisions Requiring Separate Approval

These are not authorized by this plan:

- moving visible AC, VC, or DoD checkbox authority out of GitHub;
- deleting current AITM GitHub markers or timing records;
- enabling raw transcript archives by default;
- allowing Insights to advance AITM lifecycle state;
- direct client connections to PostgreSQL;
- making the Git journal a multi-writer live database;
- multi-region active-active operation;
- supporting additional transcript providers without new sanitized fixtures
  and compatibility tests.

## 8. Primary Technical References

- [Node.js SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [SQLite write-ahead logging](https://www.sqlite.org/wal.html)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)
- [Fastify documentation](https://fastify.dev/docs/latest/)
- [Playwright documentation](https://playwright.dev/docs/intro)
