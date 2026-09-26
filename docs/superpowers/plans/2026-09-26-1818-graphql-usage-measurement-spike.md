# #1818 GraphQL Usage Measurement Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for
> tracking. AITM owns issue binding, state, verification, review, delivery, and
> close.

**Goal:** Measure AITM-owned GitHub GraphQL usage across concurrent worktrees
without changing GitHub request or response behavior, then produce a truthful
baseline that can guide backlog-cache epic #1817.

**Architecture:** Convert #1818 into an epic that delivers a repository-level
metadata collector, shared Git-common storage, participant enrollment, offline
reports, and a measured creation-to-planning baseline. The collector reuses the
existing action-capture process boundary for CLI traffic, adds explicit direct
HTTP observation seams, writes metadata-only JSONL under the Git common
directory, and reports known point costs separately from unknown and opaque
traffic. Each child preserves the reviewed spec boundary and leaves caching,
rate coordination, lifecycle policy changes, and backlog optimization to later
work.

**Tech Stack:** Node.js 26 ESM, GitHub CLI/GraphQL, Git common-directory local
storage, `node:test`, existing AITM action-capture helpers, Markdown/JSONL
report artifacts, and AITM governed lifecycle verbs.

**Spec:** `docs/superpowers/specs/2026-09-25-1818-graphql-usage-measurement-spike-design.md`

## Scope

Build and verify the measurement spike described by the ratified #1818 spec.
The work includes production GraphQL call-site inventory, metadata-only
observation, exact same-response query-cost capture where GitHub exposes it,
explicit unknown-cost accounting, Git-common writer storage, shared-root
enrollment and participant manifests, offline reports/graphs, coverage
diagnostics, and a measured creation-to-planning baseline with overlapping
worktrees.

Out of scope: backlog caching, request throttling, global rate coordination,
lifecycle behavior changes, mutation point estimation, secondary-rate-limit
accounting, manual GitHub/web traffic reconciliation, action-capture payload
storage changes, and any claim that observed lower-bound data fully represents
the shared GitHub account.

## Context

PR #1814 merged the reviewed spike specification and review evidence before
issue #1818 was created. The spec states that #1818 is independent of epic
#1817, but its measured findings guide that epic's planning. The current issue
is in Plan and has no reviewed plan artifact before this file.

The scope is larger than one implementation story: it touches launch routes,
the `gh` shim, direct GraphQL HTTP adapters, storage, manifests, reporting,
documentation, tests, and a real measured baseline. The plan therefore treats
#1818 as an epic candidate. Hydration should convert #1818 to kind `epic` and
create ordered children for the implementation slices below. If AITM refuses
conversion for a spike-origin issue, stop and record the refusal rather than
silently delivering all work under one oversized story.

## Acceptance Criteria

- [ ] A complete production GraphQL inventory classifies direct, covered,
      opaque, uncovered, REST, and out-of-scope paths.
- [ ] Observable query, mutation, retry, pagination, failure, disabled,
      unsupported, and ambiguous-dispatch cases emit metadata-only observations
      with exact same-response costs or explicit unknown-cost reasons.
- [ ] Concurrent worktrees and sessions write complete, non-interleaved JSONL
      records under the same Git common directory with independent attribution.
- [ ] Collection preserves original stdout, stderr, exit, exception, and
      response behavior and persists no query text, variables, secrets, issue
      bodies, or response payloads.
- [ ] Offline reports and graphs display call volume, known points, hourly
      peaks, operation and stage breakdowns, malformed/duplicate data, and coverage
      limits without presenting partial sums as complete totals.
- [ ] Usage collection reuses action-capture interception without enabling
      body capture and remains independent of active issue binding.
- [ ] The implementation includes the narrow `CLAUDE.md` Git-common storage
      exception, runtime shared-root reachability checks, participant manifests,
      and denial/selection-bias disclosures.
- [ ] A measured creation-to-planning baseline with overlapping permitted
      worktrees is recorded, or the spike explicitly reports why the result remains
      preliminary.

## Plan Metadata

- Priority: P1
- Size: XL
- Estimate: 42 hours
- Labels: SPIKE, enhancement, backend, dx, reliability, test
- Parent issue: #1818
- Decomposition: convert #1818 to an epic and create five ordered children. The
  parent owns final baseline acceptance, epic reconciliation, and handoff to
  #1817.

## Story Intent

- **Beneficiary:** AITM maintainer planning GitHub GraphQL reduction work
- **Capability:** measure GraphQL call volume, point costs, unknown costs, and
  coverage across concurrent worktrees
- **Need:** current rate-limit pressure is shared across sessions, but the
  project cannot attribute cost by operation or lifecycle stage
- **Value or failure prevented:** #1817 can prioritize real bottlenecks without
  guessing, hiding unknowns, or changing production behavior during measurement

## Global Constraints

- Preserve the reviewed spec as authority. Any deviation that changes scope,
  storage root, payload policy, point-cost method, or baseline sufficiency must
  receive a separate reviewed amendment before implementation.
- Record only metadata. Never store query text, variables, tokens, issue bodies,
  response bodies, raw exception messages, or debug HTTP dumps.
- Preserve original GitHub behavior. Instrumentation failures, storage failures,
  unsupported syntax, and disabled collection must not replace business results
  or exceptions.
- Do not add caching, throttling, coordination, lifecycle policy changes, or
  backlog optimization in this epic.
- Treat exact point cost as available only from supported same-response query
  cost data. Mutations and opaque invocations keep explicit unknown costs unless
  a separately reviewed exact source is demonstrated.
- Use Git common-directory storage only for the usage metadata and related
  coverage/control metadata named by the spec. Do not relocate action-capture
  payloads or unrelated runtime state.
- Use AITM issue #1818 for the parent. Child commits, PRs, Test receipts, and
  Review evidence use their assigned child issue numbers.
- Parent Review waits until every child reaches Review and the baseline evidence
  is reconciled against the parent acceptance criteria.

## Implementation Tasks

### Task 1: Inventory GraphQL Surfaces and Define the Usage Contract

#### Story Intent

- **Beneficiary:** spike implementer and reviewer
- **Capability:** know every AITM-owned production GraphQL path and the record
  contract each path must satisfy
- **Need:** instrumentation cannot be trusted if direct, shell, synchronous,
  HTTP, and opaque CLI paths are not classified up front
- **Value or failure prevented:** the baseline reports honest coverage instead
  of silently treating unobserved traffic as zero

#### Files and Delivery Boundary

**Estimate:** 7 hours. This child owns inventory, schemas, stable operation
identity, and source-level coverage checks. It does not wire production launch
routes or write reports beyond inventory output.

**Modify or create:** `scripts/task-tracker/lib/graphql-usage/*`,
`scripts/task-tracker/lib/action-capture.mjs` only where shared classification
helpers belong, inventory fixtures under `scripts/tests/fixtures/`, focused unit
tests under `scripts/tests/unit/task-tracker/lib/graphql-usage*.test.mjs`, and
operator docs as needed.

**Interface:** Define versioned observation, diagnostic, manifest, and inventory
records. Classify call sites as `direct-http`, `gh-api-graphql`,
`opaque-gh-cli`, `rest-or-nongraphql`, `uncovered`, or `out-of-scope`.

- [ ] Add a source inventory test that scans shipped Node and shell sources for
      GraphQL call patterns, direct `gh api graphql`, action-capture shim traffic,
      direct HTTP GraphQL builders, absolute-path bypasses, and high-level opaque
      CLI surfaces.
- [ ] Define the metadata-only observation schema, including cost coverage,
      dispatch status, context scope, launch route, session source, common-root ID,
      operation identity, and coverage diagnostics.
- [ ] Add tests that reject raw query text, variables, response bodies, issue
      bodies, secrets, and unsanitized path/session values from all record shapes.
- [ ] Record the initial inventory and uncovered-path expectations in the child
      issue or committed documentation.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/graphql-usage-inventory.test.mjs
node --test scripts/tests/unit/task-tracker/lib/graphql-usage-records.test.mjs
```

### Task 2: Wire Usage Collection Through CLI and HTTP Boundaries

#### Story Intent

- **Beneficiary:** AITM operator running normal commands
- **Capability:** observe GraphQL attempts and opaque invocations without
  changing command behavior
- **Need:** existing GraphQL traffic flows through mixed shell, shim, sync
  subprocess, and direct HTTP paths
- **Value or failure prevented:** measurement covers production routes while
  preserving stdout, stderr, exits, exceptions, and response payloads

#### Files and Delivery Boundary

**Estimate:** 10 hours. Depends on Task 1's record contract. This child owns
collection wiring and behavior preservation, not shared storage aggregation or
reports.

**Modify or create:** `scripts/task-tracker/lib/action-capture.mjs`,
`scripts/task-tracker/action-capture-bin/gh`, AITM CLI/bootstrap entry points,
direct HTTP GraphQL adapters such as value-report helpers, measurement-launcher
support, and focused integration tests with fake `gh` and injected transports.

**Interface:** A shared usage observation sink receives exactly one record per
lowest observable boundary. Known Node query builders may augment supported
queries with a collision-free `rateLimit { cost }` selection and strip only the
added telemetry alias before returning business data.

- [ ] Cover usage-only, action-only, both-enabled, and both-disabled modes
      without enabling action-capture payload storage from usage collection.
- [ ] Add shell and synchronous subprocess tests proving a completed observation
      is flushed before the parent returns on normal exit.
- [ ] Add injected transport tests for query, mutation, selected operation,
      fragments, aliases, inline literals, GraphQL errors, HTTP failures, retries,
      pagination, ambiguous dispatch, and unsupported syntax.
- [ ] Verify no duplicate records are produced when a known builder and the shim
      cooperate through a private observation context.
- [ ] Preserve existing action-capture public classification behavior while
      adding safer telemetry-specific classification.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/graphql-usage-collection.test.mjs
node --test scripts/tests/unit/task-tracker/lib/action-capture.test.mjs
```

### Task 3: Implement Git-Common Storage, Enrollment, and Concurrency

#### Story Intent

- **Beneficiary:** operators measuring multiple concurrent worktrees
- **Capability:** share usage observations under one Git common directory with
  trustworthy participant attribution
- **Need:** per-worktree `.tmp` output cannot serve as the reviewed evidence
  root for this spike, and cross-process appends can corrupt shared files
- **Value or failure prevented:** concurrent sessions produce readable,
  attributable, non-interleaved evidence with explicit denial and storage
  failure diagnostics

#### Files and Delivery Boundary

**Estimate:** 8 hours. Depends on Tasks 1 and 2. This child owns root
resolution, reachability probes, writer files, manifest handling, and storage
diagnostics. It does not own aggregate reports beyond storage inspection.

**Modify or create:** Git common-root resolver, storage writer, enrollment cache,
participant manifest helpers, CLAUDE.md storage exception, and integration tests
with disposable git worktrees and permission/failure fixtures.

**Interface:** Resolve the consuming worktree's absolute Git common directory,
probe `<git-common-dir>/aitm/graphql-usage/`, derive a non-secret common-root
ID, and write per-process JSONL files below
`v1/<worktree-id>/<session-id-or-unknown>/`.

- [ ] Add tests for normal gitdir files, worktrees, unsupported git resolution,
      no Git context, denied shared-root access, disk/write failures, stale
      enrollment cache, and expired enrollment.
- [ ] Exercise two worktrees, two sessions in one worktree, short-lived shims,
      concurrent async observations, partial final lines, malformed records, and
      duplicate/conflicting `callId` records.
- [ ] Add writer start and normal-close markers, soft-cap diagnostics, retained
      byte/file counts, and bounded redacted stderr fallback for storage failure.
- [ ] Amend `CLAUDE.md` with the narrow reviewed exception for GraphQL usage
      metadata under the Git common directory.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/graphql-usage-storage.test.mjs
node --test scripts/tests/unit/task-tracker/lib/graphql-usage-storage.test.mjs
```

### Task 4: Build Offline Reports, Graphs, and Coverage Diagnostics

#### Story Intent

- **Beneficiary:** maintainer deciding which GraphQL work to prioritize
- **Capability:** inspect volume, known points, unknowns, peaks, failures, and
  coverage gaps by operation, stage, issue, session, and worktree
- **Need:** raw JSONL is not decision-grade, and partial cost sums can mislead
  if displayed as complete totals
- **Value or failure prevented:** #1817 receives truthful lower-bound evidence
  and explicit insufficiency findings instead of false point rankings

#### Files and Delivery Boundary

**Estimate:** 8 hours. Depends on Task 3's storage shape. This child owns the
offline report command, aggregation rules, graph generation, and coverage
language. It does not perform the long baseline run.

**Modify or create:** a `graphql-usage` report command or AITM report subcommand,
aggregation libraries, Markdown/JSON report emitters, graph fixtures, and tests
for UTC/local intervals, rolling windows, schema validation, malformed input,
and coverage gates.

**Interface:** Reports read only supplied Git-common usage roots and participant
manifests. They never call GitHub. They separate HTTP attempts from opaque
invocations, known points from unknown costs, and complete-observation costs
from visible-response-only costs.

- [ ] Aggregate by UTC half-open buckets and rolling `(t - 60 minutes, t]`
      windows, with selectable local display including UTC offsets.
- [ ] Report hourly and daily charts, operation/stage/worktree/session/issue
      breakdowns, retries, failures, malformed lines, unsupported versions,
      duplicates, partial final lines, mixed collector versions, storage gaps, and
      root mismatches.
- [ ] Enforce the total-point ranking sufficiency gate: 100% complete cost
      coverage for the predeclared candidate group, with opaque/uncovered/gap
      limitations separately disclosed.
- [ ] Emit preliminary or volume-fallback conclusions when point ranking is
      insufficient.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/graphql-usage-report.test.mjs
node --test scripts/tests/integration/task-tracker/graphql-usage-report.test.mjs
```

### Task 5: Run the Baseline, Reconcile Evidence, and Prepare #1817 Handoff

#### Story Intent

- **Beneficiary:** #1817 planner and future implementers
- **Capability:** use a real measured creation-to-planning baseline with honest
  concurrency and coverage limits
- **Need:** instrumentation without a baseline does not answer which operations
  should be optimized first
- **Value or failure prevented:** backlog-cache work starts from measured lower
  bounds and documented unknowns rather than intuition

#### Files and Delivery Boundary

**Estimate:** 9 hours. Depends on Tasks 1-4. This child owns the authorized live
smoke, real baseline procedure, report artifact, final docs, and parent
reconciliation evidence. It does not mutate the backlog solely to generate
traffic.

**Modify or create:** baseline runbook, checked-in report summary, participant
manifest example or sanitized evidence, docs linking #1818 findings to #1817
planning inputs, and final parent reconciliation notes.

**Interface:** The baseline records at least one real creation-to-planning
workflow and a declared overlap interval with two enrolled permitted worktrees
sharing the report common-root ID, or explicitly reports why the result remains
preliminary.

- [ ] Run one controlled live query and one controlled live mutation only in an
      authorized test workflow, with cleanup accounted as observed traffic.
- [ ] Run the creation-to-planning baseline using the measurement launcher and
      participant manifest; do not create artificial backlog changes solely for
      traffic generation.
- [ ] Publish the baseline report with observation interval, collector version,
      participant coverage, denial counts, selected operations, exact known points,
      unknown-cost rates, volume rankings, and any insufficiency findings.
- [ ] Reconcile #1818 parent acceptance criteria against child results and name
      the concrete planning inputs for #1817.
- [ ] Run root verification at the final integrated head and prepare the parent
      for Review after every child reaches Review.

**Verification Commands:**

```sh
npm run quality
npm run lint
npm run format:check
git log --oneline -1
```

## Parent Hydration and Delivery

After this plan is reviewed and accepted, update #1818 with the reviewed plan
reference, convert the issue to kind `epic`, and create the five ordered child
issues through sanctioned AITM issue creation. Each child starts from R4P, moves
to Plan for its own deep dive, updates its estimate, then enters Develop only
after the applicable planning evidence exists. The parent keeps the ratified
spec and reviewed plan as its deep-dive authority; children perform focused
deep dives against their assigned plan section.

Parent #1818 must not move to Develop as a monolithic story unless AITM refuses
epic conversion or child hydration and the human explicitly approves a revised
single-story plan. In that case, update this plan and repeat review before
implementation.
