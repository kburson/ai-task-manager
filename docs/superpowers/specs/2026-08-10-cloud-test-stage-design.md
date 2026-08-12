# Cloud Test-Stage Delivery Design

**Date:** 2026-08-10 (revised 2026-08-11)

**Status:** Revised after Codex and two Claude design reviews; pending Claude re-review

**Branch:** `cloud-test-automation`

**Supersedes:** the 2026-08-10 first draft of this file, which assumed a GitHub
merge queue, and the intermediate 2026-08-11 draft, which proposed a custom
Checks API receipt publisher.

## Design-Review Additions

The following scope was added during the Codex/maintainer design review rather
than inherited from the first Claude draft. It is retained deliberately and is
not an incidental implementation detail:

- host-wide admission for at most six local worker agents, with configured
  cloud-VM overflow;
- required-check and strict-base ruleset coverage for `feature/epic/*`;
- hierarchical child-to-epic-to-trunk coalescence; and
- crash repair after receipt acceptance or merge.

Claude's follow-up reviews added a fail-closed slow-impact authority, an
explicit cloud-defer outcome for Develop lane escalation, measured staged
fan-out, an honest merge-throughput model, and a GitHub-backed integration
freeze at the epic-to-parent boundary.

## Decision Summary

AITM keeps planning, code changes, and affected-test feedback close to the
worker, but moves authoritative Test-stage validation to GitHub Actions.
GitHub's native workflow, job, and step results are the machine evidence. An
authorized orchestrator may run locally or in a cloud environment; it reads and
validates that evidence and appends the existing `verification-evidence`
capsule. CI receives no issue-write or check-write authority.

The design has four independent controls:

1. **Fast Develop feedback.** A worker runs bounded affected tests only.
   Healthy verification finishes within 180 seconds and must not exceed 300
   seconds; complete-lane escalation is deferred to cloud Test.
2. **Cloud Test validation.** Quality, unit, integration, and slow validation
   fan out to independent GitHub-hosted VMs for the same head SHA. Stable native
   gate jobs converge their results. Every execution job has a ten-minute hard
   ceiling.
3. **Local resource admission.** All local orchestrators collectively admit at
   most six concurrent local worker agents for this repository on one physical
   host. Orchestrators do not consume those slots. Additional workers use
   configured cloud VMs or remain queued.
4. **Serial integration per target branch.** Parallel work converges through a
   lazy, one-PR-at-a-time merge tail. Occasional conflicts return the later
   story to Develop; AITM does not add a repository-wide path-locking system.

No local process, worktree, or database is lifecycle authority. GitHub issues,
authority records, pull requests, Actions results, protected target branches,
and merged commits are the distributed coordination surfaces.

## Context

The test suite no longer fits comfortably in the feedback loop on the
maintainer's laptop. Discovery finds 895 `*.test.mjs` files across three lanes:
821 unit, 24 integration, and 50 slow. The runner starts one `node` process per
file, and files that reference `node:child_process` run serially. A fast-lane
measurement from 2026-08-11 (`.aitm/test-timing.json`, 845 files) shows the
cost:

| Measure                      |      Value | Note                                     |
| ---------------------------- | ---------: | ---------------------------------------- |
| Total wall time              | 236 822 ms | 3.9 minutes for the fast lane alone      |
| Parallel pool phase          |  96 562 ms | ~721 pool-eligible files                 |
| Serial phase                 | 140 260 ms | 124 files, costing more than the pool    |
| Sum of per-file wall         | 938 500 ms |                                          |
| Sum of in-process time       | 416 245 ms |                                          |
| Process spawn and I/O        | 522 254 ms | 55.6% of file wall time is not test work |
| Files over the 2 s threshold |         63 | worst single file 24 133 ms              |

One worker can tolerate that cost occasionally. Six workers running similar
fleets concurrently cannot: their agents, package installs, subprocesses, and
test pools compete for the same CPU, memory, and disk. The orchestrator is a
seventh agent on the host, but it performs coordination rather than build and
test work and therefore does not consume a worker slot.

GitHub-hosted jobs provide isolated VMs and are free for this public repository.
They are the appropriate place for full validation. The repository remains
user-owned, so GitHub merge queues are unavailable. Ruleset 20694244 currently
protects only `trunk`, requires `Fast lane (format, lint, unit)`, and enables
`strict_required_status_checks_policy`. This design extends equivalent
protection to epic integration branches and adds the slow verdict as a required
check.

## Goals

- Let many atomic stories execute concurrently without running their complete
  validation fleets on one local machine.
- Keep the local Develop feedback loop below 180 seconds in the healthy case
  and at or below 300 seconds in all supported cases.
- Complete each cloud validation job within ten minutes of runner start.
- Sustain three to six merges per hour on one busy target branch initially and
  use measured fixture-aligned sharding to work toward ten per hour.
- Make native GitHub Actions results authoritative machine evidence without
  granting CI authority to write AITM records or custom checks.
- Let local and cloud orchestrators use exactly the same GitHub-backed receipt,
  lifecycle, parking, and integration protocol.
- Preserve a compact validation receipt reference in the merged commit.
- Make retries, handoffs, and crash recovery deterministic.
- Give a failing run enough structured detail for targeted diagnosis without
  rerunning the complete fleet.
- Reuse the GitHub-native record mechanism already implemented under
  `scripts/task-tracker/lib/github-records/`.

## Non-Goals

- No merge queue and no organization migration.
- No repository-wide path or subsystem lease registry. Planning should isolate
  work; the integration tail handles the occasional conflict.
- No cloud VM provisioner. AITM may dispatch through a configured cloud-worker
  adapter, but provisioning and billing remain external.
- No agent authors code inside GitHub Actions. CI performs deterministic
  validation only.
- No cross-platform matrix. The initial CI policy is `linux-x64` with Node 22.
- No ninth kanban state. `awaiting-ci` is a coordination condition within Test.
- No automatic retirement or weakening of slow tests. Test consolidation,
  shared fixtures, and smoke-test substitutions require separately reviewed
  changes with equivalent risk coverage.
- No unconditional rewrite of the test runner's subprocess parallel-safety.
  Weighted pooling remains tracked by #1208, but becomes a rollout prerequisite
  when baseline GitHub-runner measurements cannot satisfy the budgets below.

## Time and Capacity Budgets

### Develop feedback budget

`verify-develop.mjs` remains local to the worker and runs format/lint work plus
a bounded set of tests selected directly from the story's affected surface. It
does not run the full suite and does not compute the cloud slow-lane decision.

The existing affected-test selector exposes two different kinds of result:

- directly selected tests, found from changed test files, the reverse-import
  graph, basename heuristics, or explicit manifest entries; and
- unit/integration lane escalation, where a policy-sensitive change means that
  an entire local-selection lane must run in cloud Test.

Develop executes the directly selected tests locally. It must not materialize
an escalated lane into every test file on the worker. When escalation is
required, Develop still runs format, lint, and its bounded direct selection,
then records `develop-cloud-escalation` evidence containing the head SHA,
changed paths, escalation reasons, and required lanes. That evidence is a
cloud-validation obligation, not a claim that those lanes passed. `/task test`
must preserve the obligation, and receipt acceptance must prove the named
complete lanes ran for the same head in GitHub Actions. Slow execution is
decided separately by the fail-closed cloud policy.

The elapsed budget for one Develop verification invocation is:

| Selection and elapsed time | Classification   | Required response                                     |
| -------------------------- | ---------------- | ----------------------------------------------------- |
| Direct, <= 180s            | Healthy          | Continue                                              |
| Direct, 181-300s           | Degraded         | Pass with timing evidence and an optimization warning |
| Direct, > 300s             | Over budget      | Fail `develop-verification-budget-exceeded`           |
| Escalated lane             | Cloud escalation | Run bounded local checks; require complete cloud lane |

The 180/300-second budget applies to a direct selection and to the bounded local
portion of an escalated selection. An over-budget result is a test-architecture
defect even when every assertion passes. The remedy is to reduce repeated
setup, merge related cases into one fixture, narrow the direct selection, or
replace redundant deep coverage with a justified smoke test. Raising the
ceiling or silently omitting an escalated lane is not the default remedy.

### Cloud Test budget

Every execution job uses `timeout-minutes: 10`; this 600-second hard stop is not
raised to accommodate test growth. Queue time is measured separately because
repository code cannot control it.

The existing runner ceiling is insufficient for this contract: its default is
600 seconds **per non-empty execution section**, so a pooled section followed by
a serial section can consume nearly 1,200 seconds. CI therefore supplies lower
lane-specific section ceilings and an outer repository-phase budget:

| Boundary                                  | Provisional limit | Purpose                                            |
| ----------------------------------------- | ----------------: | -------------------------------------------------- |
| GitHub execution-job hard stop            |              600s | Last-resort platform containment                   |
| Repository-controlled phase soft envelope |              480s | Fails with the active named phase before hard stop |
| Unit pooled or serial section             |              120s | `AITM_TEST_CEILING_MS=120000`                      |
| Integration serial section                |              120s | `AITM_TEST_CEILING_MS=120000`                      |
| Slow serial section                       |              420s | `AITM_TEST_CEILING_MS=420000`                      |

The 480-second envelope begins before `npm ci` and includes dependency install,
repository quality or test commands, clean-worktree checks, and diagnostic
serialization. Checkout, runner setup, and artifact upload share the remaining
120 seconds. A repository-controlled overrun exits with
`ci-repository-budget-exceeded` and the active phase. A section overrun retains
the runner's more specific message. GitHub conclusion `timed_out` is therefore
a last-resort `ci-hard-timeout`, not the normal signal for test growth.

These internal values are provisional until a measurement spike runs each job
at least five times on the selected GitHub-hosted runner profile. It records
cold and warm cache behavior, p50 and p95 checkout, setup, `npm ci`, quality,
pooled-unit, serial-unit, integration, slow, cleanup, artifact, and Stage 2 gate
times. The spike must prove p95 repository work fits its 480-second envelope and
p95 total execution-job time is at most 540 seconds, leaving 60 seconds before
the hard stop. If unit or integration cannot meet 120 seconds, or slow cannot
meet 420 seconds, test consolidation, fixture reuse, or #1208 becomes a
prerequisite; the 600-second hard stop is not relaxed.

Quality, unit, integration, and slow execution start concurrently. Keeping
integration in its own job spends another runner slot but removes its serial
cost from the unit/quality critical path. This design deliberately chooses
lower head-of-line PR latency over the higher whole-repository PR concurrency
of a two-job layout. Slow-impact selection belongs only to slow executors,
before dependency installation or slow-test execution; it never delays quality,
unit, or integration feedback and never enters the Develop loop.

### Local worker budget

The default physical-host budget is:

- one or more lightweight orchestrator sessions, which do not consume worker
  slots; and
- at most six worker agents modifying or testing this repository across all
  clones and worktrees on that host.

Six is a ceiling, not a utilization target. The admission controller may reduce
local concurrency when memory pressure, CPU saturation, or recent Develop
timings show that the feedback budget cannot be maintained. Overflow moves to
configured cloud VMs before the host is allowed to turn every worker's feedback
loop into a five-minute wait. If an isolated worker still exceeds the ceiling,
the test architecture—not host admission—is the defect.

AITM extends the existing `scripts/task-tracker/fleet-registry.mjs`; it does not
introduce a second, competing fleet abstraction. The current per-clone registry
continues to record task bindings, worktree observations, and conservative
pruning under the clone's main worktree. Its existing lock, read/write,
registration, status, stale-entry, pruning, and observation primitives are
reused where their semantics fit.

A separate host-capacity overlay supplies the six ephemeral worker leases. It
lives in AITM's machine-level user-state directory and is indexed by canonical
repository identity rather than clone or worktree path, so independent clones
and sessions on one physical host consult the same capacity record. Each lease
records the repository identity, issue, worker/session identity, process
identity, heartbeat, and expiry. It covers the worker and every child process it
starts. Opening a second orchestrator session therefore does not create six
more slots.

The host overlay is an operational semaphore, not lifecycle authority. A lost
or deleted lease can affect resource utilization but cannot authorize work,
advance an issue, or satisfy a gate. GitHub coordinator grants and work
assignments remain authoritative. Worker leases use heartbeat and
process-liveness checks with a short operational expiry; this is distinct from
the fleet registry's existing 24-hour observational staleness default. See
`docs/spikes/429-fleet-registry-gc.md` for the existing registry and reclamation
constraints.

The test runner derives its internal pool ceiling from the active host leases
instead of assuming it owns the machine. A seventh runnable worker is sent to a
configured cloud-worker adapter. Each overflow worker receives a different VM;
two overflow workers are never placed on one VM merely to reproduce the local
contention elsewhere. Without such an adapter the work remains queued. CI jobs
do not consume local leases.

## Trust and Authority Boundaries

| Concern                       | Authority or executor       | Durable surface                         |
| ----------------------------- | --------------------------- | --------------------------------------- |
| Story and lifecycle authority | Active issue coordinator    | GitHub authority records                |
| Code changes                  | Assigned local/cloud worker | Story branch and work assignment        |
| Develop verification          | Assigned worker             | Develop evidence                        |
| Test execution                | GitHub Actions              | Native run, job, and step conclusions   |
| Test evidence acceptance      | Active issue coordinator    | `verification-evidence` capsule         |
| CI wait state                 | Active issue coordinator    | Coordination projection                 |
| Merge eligibility             | Derived by orchestrators    | PR plus effective issue records         |
| Merge serialization           | Protected target branch     | GitHub branch rules and merge operation |
| Integration evidence          | Active issue coordinator    | `integration-result` capsule            |
| Permanent receipt pointer     | Merge author                | Git commit trailers                     |

CI uses `contents: read` and the permissions GitHub implicitly needs to report
its native job checks. It receives no `checks: write`, `issues: write`, or
`pull-requests: write`. The workflow cannot append issue records or create a
custom receipt check.

An orchestrator may run in one local session, one of several local sessions, or
a disposable cloud environment. Its authority comes from the active,
epoch-fenced GitHub coordinator grant—not from its filesystem or host. Separate
orchestrators for different tasks and epics write separate issue chains.
Replaced or stale orchestrators fail closed when their authority epoch no longer
matches.

## Lifecycle Walk

Develop is complete only after bounded affected verification passes within the
local budget and the branch contains a clean committed head. A
`develop-cloud-escalation` may accompany that completion, but it creates a
mandatory Test-stage lane obligation and never represents a local pass for the
escalated lane.

The canonical Test entry point is `/task test #N`:

1. Resolve the active authority locator and coordinator grant.
2. Validate Develop completion, any cloud-escalation obligation, the exact
   committed head, branch ownership, work assignment, and target integration
   branch.
3. Push with lease and create, or idempotently reuse, exactly one PR from the
   story branch to its immediate parent branch. A standalone or root story
   targets `trunk`; a child story targets its epic branch.
4. Read the PR back and verify repository, issue, base branch, head branch, and
   head SHA.
5. Append a Develop-to-Test `lifecycle-transition` capsule whose payload records
   PR number, target branch, base SHA, and head SHA. Then project the assignment
   state as `awaiting-ci` and point the coordination chain head at that capsule.
6. Release the local worker lease. The orchestrator may advance another
   eligible story while it polls GitHub.
7. Validate the native Actions result for the exact PR head.
8. On green, append the `verification-evidence` capsule, converge the evidence
   projection, clear `awaiting-ci`, and emit `REVIEW_COMPLETE` for Test to
   Review.
9. On red, clear the WIP exemption and route the story to retry, diagnosis, or
   `/task demote #N --rework` according to the failure taxonomy.

Every boundary is retry-safe:

- Failure before PR creation leaves the issue in Develop.
- Failure after PR creation but before the transition record adopts the one
  matching PR on retry; it never opens a duplicate.
- Failure after the transition record reconstructs `awaiting-ci` from GitHub.
- A new commit invalidates the pending or accepted receipt and requires a new
  run.
- A stale authority epoch cannot accept evidence or advance the issue.

`github-records/v1` issues use this cloud Test path. Issues that still use
`legacy-body/v1` retain the existing local sandbox and
`aitm-dod-verified` behavior until explicitly adopted. There is no dual-write
mode and no bulk migration.

## Native Actions Evidence

### Why there is no custom receipt check

GitHub Actions already creates app-authenticated workflow, job, and step
results. A custom check run would duplicate those facts, require write
permission in a job that executes repository-controlled code, and introduce a
second authority beside the native Stage 2 gates.

The orchestrator therefore constructs the canonical receipt from read-only
sources:

- the PR and exact head commit;
- the Actions workflow run and attempt;
- every native execution, shard, and Stage 2 gate result;
- named step conclusions;
- the workflow definition and policy fingerprints at the accepted commit;
- the target-base slow-impact policy; and
- the issue's assignment, contract, and authority records.

The orchestrator does not assert that tests passed. It verifies GitHub's native
conclusions and records them. Receipt provenance is `github-actions`, not
`agent`.

### Receipt schema and identity

The existing `aitm.verification-receipt/v1` remains the legacy local-sandbox
format. Cloud Test introduces `aitm.verification-receipt/v2`; this is a new
payload schema, not a new authority-record mechanism.

The v2 payload contains at least:

- repository name and immutable repository ID;
- issue, contract epoch, authority grant, and authority epoch;
- PR number, target branch, target base SHA, and exact head SHA;
- workflow ID, path, workflow commit, event, actor, and GitHub Actions app ID;
- run ID, run attempt, run URL, and timestamps;
- native job/check IDs, names, statuses, conclusions, and required step
  conclusions;
- expected runner labels, `linux-x64`, and Node 22 policy;
- lockfile, verification-config, CI-policy, and shard-policy fingerprints;
- the Quality, Unit, Integration, and Slow executor/shard identities and their
  stable Stage 2 gate conclusions;
- any Develop cloud-escalation reasons and required lanes, plus evidence that
  each obligation was satisfied by a complete native job for the same head;
- the five classifications `lint-full`, `format-full`, `test-unit`,
  `test-integration`, and `test-slow`, or an authorized slow-lane skip;
- clean-checkout/worktree verification; and
- acceptance timestamp and logical validation key.

The logical validation key is deterministic:

```text
github-actions:<repository-id>:<workflow-id>:<run-id>:<attempt>:<head-sha>
```

Retries first search effective evidence for this key. An identical accepted
payload is reused; a conflicting payload fails closed. The immutable capsule's
existing ULID `recordId` is the canonical validation receipt ID exposed outside
the issue.

### Source-aware validation

V2 does not ignore Node or platform mismatches. It validates them against the
CI policy rather than the orchestrator's local machine:

- runner labels must resolve to the allowed Linux runner profile;
- the successful setup step and workflow contract must select Node 22;
- repository, workflow, event, PR, base, and head identities must match;
- run attempt and job/check IDs must exist in the fetched Actions run;
- all required executors, shards, gates, and steps must have acceptable native
  conclusions;
- discovered tests must be covered exactly once by the accepted shard-policy
  fingerprint, with no missing or duplicate shard;
- lockfile, verification config, and CI policy hashes must match the tested
  head and target-base policy;
- every lane named by `develop-cloud-escalation` must have a successful native
  execution for the exact head;
- the final clean-worktree step must pass; and
- the issue must be derived from the PR's assigned story branch and active work
  assignment, never parsed from untrusted CI output.

Policy-surface changes—workflow files, either impact policy, shard or budget
policy, receipt validation, package test scripts, the test runner, or lifecycle
gates—force slow execution and require the workflow-security review defined by
the Delivery Contract. This decision comes from the fail-closed slow-impact
policy below, not from the existing affected-test selector. The default rule is
that CI-policy fingerprints match the protected target base. An approved
policy-change story may accept a new fingerprint only when its sealed contract
identifies the reviewed old and new values. The orchestrator refuses a topology
that silently removes or renames a required job, gate, shard, or step.

### Record mapping and distributed idempotency

The approved GitHub-native authority model already supplies the storage layers:

| Layer                           | Contents                             |
| ------------------------------- | ------------------------------------ |
| Native Actions run/jobs         | Machine execution facts              |
| `verification-evidence` capsule | Canonical v2 receipt and logical key |
| `evidence-projection` singleton | Accepted-record pointer index        |
| Issue directory                 | Singleton comment node IDs           |

The active coordinator appends with `appendCapsule`, reads the record back,
and converges `evidence-projection`. Append-first, expected-head checks,
authority epochs, and immutable logical keys make retries portable across
local and cloud sessions. The existing capsule and projection mechanisms are
reused; no receipt marker family or CI-authored issue comment is added.

## GitHub Actions Workflow

`.github/workflows/ci.yml` keeps its `pull_request:` trigger without a branch
filter so child-to-epic PRs run the same workflow as trunk PRs. It also retains
nightly, push-to-trunk, and manual entry points.

Workflow-level permissions remain:

```yaml
permissions:
  contents: read
```

### Staged fan-out

Stage 1 fans out four execution jobs immediately for the exact same PR head:

1. **Quality** runs format, lint, memory-index parity, and its clean-worktree
   check.
2. **Unit** runs `npm run test:unit` and its clean-worktree check.
3. **Integration** runs `npm run test:integration` and its clean-worktree
   check.
4. **Slow** evaluates slow impact and normally runs `npm run test:slow` before
   its clean-worktree check.

Each job independently checks out full history, verifies the expected head SHA,
materializes the local `trunk` ref when required by real-git tests, sets up Node
22, and uses the lockfile-keyed npm download cache before a clean `npm ci`.
Jobs do not share a mutable workspace or `node_modules` artifact. Repeating
deterministic setup costs runner minutes but preserves isolation and avoids
trusting files produced by another validation VM.

Stage 2 contains two short native aggregation jobs. `Fast lane (format, lint,
unit)` remains the required fast context for ruleset compatibility and depends
on successful Quality, Unit, and Integration results. The new required slow
context is `Slow validation policy` and depends on the Slow result. Both gates
run with `if: always()`, fail unless every required dependency has an acceptable
native conclusion, and receive no write permission. They are native Actions
jobs, not custom Checks API publishers. Receipt acceptance independently
validates every underlying execution job and cannot rely only on the aggregate
gate's conclusion.

Each gate uses `timeout-minutes: 2` and performs no checkout, dependency setup,
or repository execution. Its only work is to evaluate the native dependency
results and emit the stable context. Gate queue and startup latency remain part
of the head-of-line cycle and must be included in the measurement spike.

### Timing-balanced sharding

The four-executor topology is the initial deployment, not a permanent maximum.
After the measurement spike, Unit, Integration, or Slow may expand into a
fixed-size matrix of timing-balanced shards. Every shard receives the same head
SHA, runner policy, Node version, lockfile, and lane manifest. The checked-in
shard policy assigns every discovered test exactly once and is fingerprinted in
the receipt.

Shards align to fixture families rather than arbitrary equal file counts. Tests
that can share one expensive repository, sandbox, or process fixture stay in
one shard and reuse that setup; independent fixture families move to different
VMs. Shard counts increase only when measured critical-path reduction exceeds
the extra checkout, setup, and queue cost. Stable Stage 2 gate names insulate
rulesets from matrix width changes.

### Slow-impact authority

The slow decision does **not** treat `selectAffectedTests` as a slow-coverage
oracle. That function is intentionally fail-open for otherwise-unmapped paths,
and its reverse-import graph cannot see subprocess slow tests that never import
the modules they exercise. Cloud Test adds
`scripts/task-tracker/lib/slow-impact-selector.mjs`, exposing
`classifySlowImpact(changedPaths, policy)`, plus the checked-in
`scripts/task-tracker/slow-impact-manifest.json` policy.

Each slow-impact rule gives matching paths one explicit outcome:

- `slow-required`; or
- `safe-to-skip-slow`, with a reason that explains the positive exclusion.

For every changed path, `slow-required` wins over an exclusion. A path that
matches no rule is classified `slow-required` with reason
`unclassified-path`. The job may skip slow execution only when **every** changed
path is affirmatively `safe-to-skip-slow`. This is the normative default-deny
rule.

The initial required rules include:

- `.github/workflows/**`;
- `package.json`, lock files, and verification configuration;
- `scripts/run-tests*.mjs` and test discovery/lane infrastructure;
- `scripts/gh/**`;
- `scripts/task-tracker/verbs/**` and `scripts/task-tracker/states/**`;
- lifecycle, transition, close, review, and evidence-gate modules;
- both impact selectors and their manifests; and
- slow tests and their shared fixtures.

The manifest also positively classifies narrow safe exclusions such as
documentation and specifically reviewed source categories with no slow-system
responsibility. Slow execution is the normal path for an AITM code change; a
skip is expected mainly for documentation-only or explicitly reviewed changes.
The optimization model therefore budgets two real validation families rather
than treating slow execution as exceptional.

The completeness test inventories the protected target's entire tracked tree,
using `git ls-files`, minus a checked-in, reviewed inventory-exclusion list that
is initially empty. Every remaining path must match at least one explicit
`slow-required` or `safe-to-skip-slow` rule. A new top-level directory, workflow,
fixture, or configuration file therefore cannot escape policy review.
Fallthrough remains safe in production while repository tests prevent manifest
neglect from silently degrading into always-running slow coverage.

During migration, every path that the existing
`scripts/task-tracker/test-impact-manifest.json` escalates to `slow` must also
resolve `slow-required` under the new authority. The same implementation slice
then removes `slow` lane escalation from the old manifest and adds a test
forbidding its return. Thereafter the fail-open affected-test selector owns
bounded local unit/integration selection only, and the fail-closed slow-impact
manifest is the single permanent authority for cloud slow execution.

Each Slow executor then:

1. checks out full history and sets up Node 22;
2. resolves the PR target base and exact head;
3. runs `classifySlowImpact` before `npm ci`;
4. exits successfully with a structured step summary when every path is
   positively safe; or
5. installs dependencies, runs its complete assigned slow shard, and verifies a
   clean worktree when slow coverage is required.

Scheduled nightly runs bypass path-based skipping and execute every slow shard
unconditionally. Manual runs expose the same unconditional mode for policy and
fixture validation.

There is one stable slow gate name. There is no same-named skip job and no
workflow-level `paths:` filter. The gate always exists. A no-impact run is the
narrow exception; it is cheap but still leaves native evidence that selection
executed.

For compatibility during migration, the orchestrator cannot accept a skip when
older head-bound Develop evidence names `test-slow`, even if path classification
alone would permit it. New Develop evidence does not create slow obligations;
the fail-closed cloud policy is authoritative. The orchestrator accepts a skip
only after recomputing the decision with `classifySlowImpact` and the manifest
from the protected target base. The v2 receipt then carries:

- `reason: no-slow-impact`;
- target base and head SHAs;
- changed paths;
- selector version and hash; and
- `lanes: [test-slow]`.

Malformed, stale, unclassified, or unreproducible skip claims relax nothing.

### Workflow concurrency and required checks

The workflow uses a concurrency group keyed by repository and PR number with
`cancel-in-progress: true`. A new head cancels obsolete runs. A cancelled run
cannot produce accepted evidence.

Both fast and slow contexts become required, with strict up-to-date enforcement,
for:

- `trunk`; and
- `feature/epic/*` integration branches.

Ruleset changes and workflow changes are deployed in an order that never leaves
a required context absent: emit the stable contexts first, observe them on a
canary PR, add requirements, then remove any obsolete policy.

GitHub-hosted concurrency is finite. At the current 20-standard-job ceiling,
the initial four-executor topology can run Stage 1 for at most five PRs with no
headroom. The operational admission target is four active PR validations: 16
execution slots, leaving four for short gates, a head-of-line refresh, nightly
work, or push-to-trunk validation. Additional PRs remain queued. Wider test
matrices reduce simultaneous PR capacity further and are admitted only when
their measured latency improvement justifies that trade-off.

Slow execution is normal, so capacity planning counts its executor or shards
for every non-documentation PR. A ten-PR execution claim would require at least
40 simultaneous heavy-job slots under the initial topology, not the current 20.
If demand persistently exceeds hosted capacity, increasing runner capacity is a
separate operational decision, not a reason to weaken validation.

## Delivery Throughput Model

Validation fan-out improves one PR's latency, but strict up-to-date checks make
the merge tail the binding throughput constraint on a busy target branch. Only
the head PR is refreshed against the latest target, validated, and merged. The
next PR then repeats that cycle against the new target head.

For one target branch:

```text
merges per hour = 3600 / head-of-line cycle seconds
```

The cycle includes update/rebase, GitHub queue delay, the slowest parallel
validation path, Stage 2 gates, receipt acceptance, and merge. At a measured or
assumed 10-20 minutes per cycle, one target delivers approximately 3-6 merges
per hour. Ten merges per hour requires the complete cycle—not merely one test
lane—to reach six minutes or less. Once ready work arrives faster than that
rate, additional agents increase the queue but not target-branch throughput.

The optimization order is therefore:

1. split independent validation onto parallel VMs;
2. reuse expensive fixtures within timing-balanced shards;
3. reduce checkout, dependency, and setup churn with safe caches;
4. optimize serial runner work, including #1208 when measurements require it;
5. add runner capacity only when queueing, rather than test duration, dominates.

Hierarchical coalescence is the architectural multiplier. Different epic
branches have independent 3-6 merge-per-hour tails and can integrate children
concurrently. Trunk then validates and merges one combined epic tree instead of
replaying every child PR serially. Standalone stories and completed epics still
share trunk's one serial tail, so hierarchy improves aggregate delivery without
weakening strict mode or skipping the final interaction test.

## Failure Diagnostics

### Lane-specific manifests

`run-tests.mjs` adds diagnostic output per invocation:

```text
.aitm/test-failures-unit.json
.aitm/test-failures-integration.json
.aitm/test-failures-slow.json
```

Each failing entry contains the repository-relative `entry.full` path, lane,
exit status, duration, and bounded stdout/stderr. Truncation is explicit in the
document so a pathological failure cannot create an unbounded artifact.

Each job uploads a unique immutable artifact name containing lane, shard, run
ID, and attempt. Upload uses `include-hidden-files: true` and `if: always()`.
`run-tests.mjs` writes timing output before fleet-leak and section-ceiling
evaluation, and failure manifests are likewise diagnostic rather than verdicts.
A complete, green-looking artifact can therefore accompany a red native job.
Artifact presence is interpreted only after run, job, and step conclusions; it
can never establish that a failing job passed.

### Failure taxonomy

Classification begins with native workflow, job, and step conclusions. Artifact
presence explains a failure but never establishes the verdict.

| Outcome                    | Evidence                                     | Handling                                |
| -------------------------- | -------------------------------------------- | --------------------------------------- |
| Setup or pre-test failure  | Checkout/setup/install/quality step failed   | Diagnose the named step                 |
| Test assertion failure     | Test step failed; manifest may be present    | Triage listed files, then logs          |
| Test-section budget        | Runner emits a named section-ceiling breach  | Create test-performance rework          |
| Repository-phase budget    | Soft envelope names the active phase         | Create phase-specific performance work  |
| Post-test policy failure   | Tests green; clean/fleet/policy step failed  | Diagnose the policy step                |
| Manifest unavailable       | Expected diagnostic absent or unreadable     | Use logs; do not infer test category    |
| Cancellation or stale head | Run cancelled or head no longer current      | Ignore or rerun current head            |
| Hard timeout               | Job conclusion `timed_out` without soft exit | Record `ci-hard-timeout`; inspect infra |
| Platform or GitHub outage  | Runner/API evidence indicates infrastructure | Retry without labeling a code defect    |

A triage agent is spawned only after classification. It acquires a worker slot,
reads the lane artifact or failing step log, and reruns only named files or the
smallest reproducer. It produces a Worker Report with `root_cause` and proposed
rework; it does not commit unless it receives a new sanctioned assignment.

## CI Parking and the Do-Si-Do

`awaiting-ci` is a value in the GitHub-backed coordination projection. Its
details live in the immutable Develop-to-Test `lifecycle-transition` capsule
identified by the projection's chain head. This uses the current projection
shape: assignment state remains a string, while PR, base, and head identity stay
in an authoritative capsule. It is not a new issue state and is not inferred
from a local process.

A Test story is exempt from its epic's one-advancing-child WIP budget only when:

- the effective coordination projection says `awaiting-ci`;
- the record is authorized by the current coordinator epoch;
- the referenced PR is open;
- PR base and head match the recorded target and SHA; and
- no terminal Actions result for that head has been accepted or rejected.

The orchestrator can then select and dispatch other eligible stories. A parked
Test story consumes neither an epic WIP slot nor a local worker lease, so other
stories may also reach Test and validate concurrently. One orchestrator may
track many awaiting PRs; the practical bound is dependency correctness and
GitHub runner capacity, not one Test occupant per orchestrator. Each worker
context still owns only one active code-changing assignment at a time.

Green, red, cancellation, head drift, PR closure, authority replacement, or
expiration clears the exemption. A replacement coordinator rebuilds the wait
from the capsule chain, coordination projection, PR, and Actions run.

Blocker chains use the same rule. A session may work another eligible item while
one rung waits, but dependencies still unwind deepest-first; parallelism does
not permit a parent to integrate before its blocker.

## Planning-Time Isolation and Merge-Time Conflicts

AITM should attempt to decompose concurrent stories into atomic, isolated work
during refinement, planning, and assignment. Scope descriptions should name
expected files, subsystems, and interfaces so coordinators can avoid obvious
overlap.

These boundaries are planning guidance, not repository-wide exclusive leases.
This design deliberately does not add a global write-set registry, cross-epic
path lock, or hard Develop gate for undeclared files. The added coordination
cost is not justified until observed PR conflict or semantic-collision rates
show a material problem.

The occasional conflict is handled at the integration tail:

1. GitHub refuses the stale or conflicting merge, or the head-of-line rebase
   reports conflicts.
2. The orchestrator records the integration failure and runs
   `/task demote #N --rework`.
3. The story returns to Develop, rebases on the current target, resolves the
   conflict, and runs affected verification again.
4. A new commit invalidates the old receipt.
5. `/task test #N` updates the PR and obtains a fresh cloud receipt before the
   story can re-enter Review and the merge tail.

Semantic collisions that do not produce textual conflicts are caught by the
required tests after the lazy rebase. If conflict frequency rises, a future
design may add stronger overlap observation or leases using measured evidence.

## Parent-Directed Integration Freeze

An epic branch cannot obtain a stable receipt for its parent-directed PR while
child integrations continue advancing that same branch. AITM therefore freezes
child integration only when the branch-owning epic is first in its parent
branch's merge lane and begins its final refresh.

The active epic coordinator appends an immutable `integration-freeze` capsule
to the epic issue before updating the parent-directed PR. Its payload binds:

- the frozen epic branch and parent target branch;
- the parent-directed PR and observed epic-branch head SHA;
- the coordinator grant and authority epoch;
- acquisition and expiration timestamps; and
- phase `pending-receipt`, `accepted-receipt`, `merging`, or `released`.

Phase changes append successor `integration-freeze` capsules that supersede the
prior record; no capsule is edited in place. A release is the terminal
`released` phase with a reason and observed live state.

The epic's coordination projection uses opaque assignment state
`integration-frozen` and points at the effective capsule chain head. This reuses
the existing projection shape; no local lock or database becomes authority. The
capsule is authoritative and append-first, while the projection is a repairable
index. A child orchestrator resolves the issue that owns its target epic branch
and checks that issue's effective freeze immediately before its expected-SHA
merge. An active freeze queues the child without demoting it or invalidating its
receipt.

A child merge already past its final check may race with freeze acquisition.
After appending the freeze, the epic coordinator re-reads the branch head before
starting validation. Any drift releases that freeze and retries only after the
finite set of already-authorized child merges settles. Once the freeze is
visible, no new compliant child integration may pass its final gate. Strict
branch protection remains the final defense against an external or stale actor.

The freeze remains active through a pending receipt, an accepted green receipt,
and the expected-SHA merge. Releasing it when the verdict first turns green
would reopen the invalidation race; the green path releases only after merge
success is read back. An authorized release capsule supersedes the freeze on:

- successful parent merge;
- red validation or repository-phase budget failure;
- workflow cancellation;
- epic-branch head drift;
- parent PR closure;
- freeze expiration; or
- coordinator authority replacement or revocation.

The default expiry is 30 minutes and cannot be silently renewed. A replacement
coordinator reads the epic capsule chain, projection, live PR, exact branch
head, and Actions run. A freeze from an obsolete authority epoch is ineffective;
the replacement may acquire a new freeze only if the epic is still eligible and
head-of-line. A crash between capsule append and projection update is repaired
from the capsule, while a crash after merge releases the reconstructed freeze
when it appends the missing `integration-result`.

Freeze priority is bounded to prevent child starvation. Acquisition is allowed
only for a contract-complete, head-of-line epic. After red, cancellation, drift,
or expiry, one already-eligible child integration may take the epic-branch lane
before the same parent-directed PR reacquires, unless no child is waiting. A
successful freeze normally lasts one validation-and-merge cycle; queued
children resume against the post-release branch state or the epic's next
integration cycle.

## Merge Discipline

Integration is serial per target branch, not globally across unrelated target
branches. A PR enters the lane when its story reaches Review with accepted Test
evidence and the required Review/approval evidence. Its lane position is the
authorized Test-to-Review transition time, with PR number as the tie-breaker.

That position remains stable while the head PR rebases, retests, and renews any
head-bound evidence. Temporary invalidation caused by that authorized refresh
does not let the next PR take the slot. A PR leaves the lane only by merging,
closing, explicit approval rejection or revocation, an abandoned/expired merge
attempt, or demotion for rework. Every orchestrator derives the same head from
GitHub records. An orchestrator acts only when its own authorized PR is first;
it does not update later PRs. This is lazy update and avoids O(N²) retesting
without a local or repository-wide merge mutex.

For the head PR:

1. If the head owns a child-bearing branch, acquire and verify its integration
   freeze.
2. Fetch the protected target branch and verify the PR's base.
3. Rebase or update only the head PR to the current target.
4. Push with lease; the new SHA invalidates prior evidence.
5. Wait for fresh required fast and slow gates and accept a fresh receipt.
6. Reconfirm Review/approval evidence against that receipt and head.
7. Advance any effective freeze to `merging` and merge while supplying the
   expected PR-head SHA.
8. Read back the PR and merged commit before recording success.
9. Append `integration-result` with target branch, tested base SHA, tested head
   SHA, merged SHA, merge method, PR, and validation receipt ID.
10. Release any effective integration freeze.

Strict required checks on `trunk` and epic branches are the distributed
serialization boundary. If another merge advances the target, GitHub refuses
the stale merge; the PR becomes the next lazy-update candidate. A local mutex
cannot satisfy or replace this protection.

### Hierarchical coalescence to trunk

Child stories first integrate into their immediate epic branch. Different epic
branches may accept child work concurrently because they are different target
lanes. An epic does not close merely because its children reached that branch.
When its Delivery Contract is complete, the epic branch itself opens or updates
one PR to its parent branch, ultimately `trunk`, and the combined tree receives
a fresh native Actions receipt.

The same lazy lane rules apply at every level. At the final level, top-level
epic and standalone-story PRs serialize into `trunk`; deployment consumes only
that protected branch. This final validation detects interactions between
otherwise independent epics before deployment.

When an epic reaches this final level, its integration freeze lets one combined
tree retain a valid receipt long enough to merge. Other epic branches continue
integrating independently, so the freeze serializes only children targeting the
branch being promoted; it is not a repository-wide stop-the-world lock.

## Receipt Trailers and Crash Recovery

The `verification-evidence` capsule exists before merge, so its ULID can be
written into the commit message tail:

```text
[#1210] feat(ci): consume native Actions evidence

<concatenated squash body>

AITM-Validation-Receipt: 01K...
CI-Verified-Sha: a1b2c3d4e5f6...
CI-Run: 18234567890/2
```

All three trailers are required:

- `AITM-Validation-Receipt` points to the authoritative issue capsule;
- `CI-Verified-Sha` records the exact pre-merge head; and
- `CI-Run` records run ID and attempt, distinguishing reruns.

The merge author preserves GitHub's concatenated squash body because its
`[#N]` tokens feed commit attribution. For merge and rebase methods, equivalent
message preservation is required.

If the merge succeeds and the orchestrator dies before appending
`integration-result`, a replacement coordinator verifies the merged PR, commit,
trailers, receipt capsule, and authority epoch, then appends the missing
integration record and releases any effective freeze as one idempotent repair.
It never reconstructs a receipt from trailers alone.

Check data is retained by GitHub for 400 days and deleted after archival; logs
and artifacts have shorter repository-configured retention. The issue capsule
outlives those stores but remains an auditable claim after its external evidence
expires. The git trailers preserve the durable pointer and claim, not a
permanent copy of Actions data. This limitation is explicit and accepted.

## Ruleset and Branch-Topology Requirements

The current trunk-only ruleset is insufficient for child PRs. Delivery requires
equivalent active protections for `trunk` and `feature/epic/*`:

- pull requests required;
- native `Fast lane (format, lint, unit)` and `Slow validation policy` contexts
  required from GitHub Actions;
- strict up-to-date status checks;
- stale review dismissal where configured;
- review-thread resolution; and
- deletion and non-fast-forward protection appropriate to the branch role.

Close and integration gates use the existing Axis-1 done target: the nearest
surviving parent branch for a child story and `trunk` for a top-level story.
They do not describe every target as trunk. `integration-result.targetBranch`
must equal that resolved done target, and the attributed `[#N]` commit must be
reachable from it.

## Security Properties

- PR test code receives no write token capable of creating issue records or
  custom checks.
- Receipt acceptance independently queries GitHub and does not trust a JSON
  blob produced by the tested branch.
- Required job and step topology is validated against CI policy.
- Policy-surface changes force slow coverage and explicit review.
- Exact head SHA, base SHA, run attempt, workflow identity, and app identity are
  bound into evidence.
- Authority grants and epochs fence stale local and cloud orchestrators.
- Child integration gates derive branch freezes from authorized GitHub capsules,
  never a host-local mutex.
- A trailer cannot create or repair a missing receipt; it can only point to an
  existing accepted capsule.
- A green manifest cannot override a red native job conclusion.
- A skipped slow execution is accepted only after independent, default-deny
  impact recomputation.

## Testing Strategy

### Pure and unit tests

- V2 construction from representative native Actions API responses.
- Source-aware Node, platform, repository, workflow, event, app, run-attempt,
  base-SHA, and head-SHA validation.
- Deterministic logical keys and idempotent reuse across orchestrator sessions.
- Stale epoch, stale capsule head, conflicting logical key, and changed-head
  rejection.
- Native job/step classification for every failure-taxonomy row.
- Section, repository-phase, and hard-job budget classification at 120, 420,
  480, and 600 seconds, including a green timing artifact with a red policy
  conclusion.
- Slow-impact required-over-safe precedence, all-paths-safe skip semantics, and
  `unclassified-path` default-deny behavior using target-base policy.
- Slow-impact completeness over the target-base tracked tree minus the explicit
  inventory exclusions, including new top-level paths, workflows,
  `scripts/gh/**`, task-tracker verbs and states, lifecycle gates, impact policy,
  and test infrastructure.
- Migration invariant that every old-manifest `slow` escalation is
  `slow-required`, followed by rejection of any permanent `slow` lane in the
  affected-test manifest.
- Shard policy completeness, no duplicates, fixture-family cohesion, exact-head
  identity, and deterministic timing-balanced assignment.
- Direct Develop selection without lane materialization, head-bound
  `develop-cloud-escalation` evidence, and receipt refusal when a required
  cloud lane did not execute.
- Develop timing classification at 180 and 300 second boundaries.
- Existing per-clone fleet behavior plus host-overlay lease acquisition,
  six-worker saturation across independent clones, heartbeat expiry, process
  liveness, and shared capacity across local sessions.
- WIP exemption only for a fully validated `awaiting-ci` record.
- Legacy-body/local-Test and GitHub-records/cloud-Test routing.
- Trailer construction and parsing, including run attempt and concatenated
  squash-body preservation.

### Integration tests

- Two orchestrators for different issues accept independent receipts without
  shared local state.
- A stale coordinator cannot accept evidence after epoch replacement.
- Crash after PR creation adopts the existing PR.
- Crash after receipt append repairs the projection without another receipt.
- Crash after merge reconstructs the missing `integration-result` and releases
  the effective freeze without duplicating either record.
- Two eligible PRs targeting one base produce one lazy update; a stale merge is
  refused and retried.
- A merge conflict records failure, demotes to Develop, and requires a new
  receipt after repair.
- Integration-freeze acquisition before parent refresh, child refusal while
  active, race-driven release on head drift, green hold-through-merge, bounded
  failure release, authority replacement, and projection repair after crash.
- Freeze fairness permits one already-eligible child after an unsuccessful or
  expired parent attempt and prevents immediate reacquisition starvation.
- A seventh local worker uses the cloud adapter or remains queued.

### Workflow assertions

Extend `tests/slow/core/ci-lane-wiring.test.mjs` and
`lib/ci-workflow-history.mjs` to assert:

- read-only permissions;
- no custom Checks API publisher;
- independent Quality, Unit, Integration, and Slow execution jobs;
- Stage 2 Fast and Slow gate dependencies with `if: always()`;
- identical head SHA and policy fingerprints across every shard;
- slow-impact selection only in Slow executors;
- stable required contexts `Fast lane (format, lint, unit)` and
  `Slow validation policy`;
- 600-second job stops, the 480-second repository envelope, and lane-specific
  section ceilings, plus the two-minute gate stop;
- PR concurrency cancellation;
- lane-specific artifact names;
- `include-hidden-files: true` and `if: always()` uploads; and
- workflow/policy paths forcing slow execution.

`ci-lane-wiring.test.mjs` itself runs in the slow lane, so these assertions
depend on the slow-impact authority classifying `.github/workflows/**` and the
selector policy as `slow-required`. The wiring test cannot protect its own
execution until that fail-closed classification lands.

Static assertions complement, but do not replace, a canary PR that proves the
live rulesets recognize both native contexts before enforcement changes land.

## Consequences

**Better.** Full validation leaves the maintainer's machine. Six local workers
can retain short affected-test feedback while independent cloud VMs execute
quality, unit, integration, and slow work concurrently. Fixture-aligned shards
can reduce the slowest path further. Native GitHub evidence removes a privileged
custom publisher. A stable receipt ULID connects issue authority, Actions
identity, and the merged commit. Local and cloud orchestrators recover from the
same GitHub state.

**Worse.** One PR initially consumes four heavy execution slots plus two short
gate jobs. Four simultaneous PR validations are the practical admission target
under the current 20-job ceiling; wider matrices reduce it. Test includes queue
latency. Required protection on epic branches adds ruleset administration. A
network or GitHub outage pauses authoritative lifecycle progress. Linux-only
validation can miss a platform defect.

**Accepted.** Planning-time isolation does not guarantee conflict-free merges.
Occasional conflicts return to Develop. Evidence loses external verifiability
after GitHub retention expires, although its capsule and commit pointer remain.
Integration is serial per target branch. Unconfigured cloud-worker overflow
queues rather than oversubscribing the local host. At a 10-20 minute
head-of-line cycle, one target branch delivers only 3-6 merges per hour no
matter how many agents produced ready PRs. Ten per hour requires a measured
end-to-end cycle of six minutes or less. Integration freezes temporarily delay
children of an epic being promoted, with expiry and fairness limiting
starvation.

## Decomposition

Ordered by dependency; each item is independently reviewable.

1. **GitHub-runner measurement and budget calibration.** Measure at least five
   cold/warm runs for every proposed executor, record p50/p95 phase timings, and
   prove or revise the provisional 120/420/480-second internal budgets without
   raising the 600-second job stop. Gate later CI execution slices on the result
   and make #1208 or fixture consolidation prerequisite when required.
2. **Slow-impact authority and migration.** Add `classifySlowImpact`, the
   outcome-based manifest, required-over-safe evaluation, target-base
   recomputation, `unclassified-path` default denial, tracked-tree completeness,
   the cross-manifest invariant, and removal of old-manifest `slow` lanes.
3. **Receipt v2 and native Actions adapter.** Add source-aware schema,
   deterministic logical key, Actions response normalization, policy
   fingerprinting, executor/shard identity, Develop escalation obligations, and
   `github-actions` lifecycle provenance.
4. **Bounded Develop verification.** Separate direct test selection from lane
   escalation, avoid local lane materialization, emit head-bound cloud
   obligations, warn after 180 seconds, and refuse bounded work after 300
   seconds.
5. **Host worker admission.** Extend `fleet-registry.mjs` without replacing its
   per-clone observation model; add the repository-keyed machine-wide capacity
   overlay, lease heartbeat/process reclamation, adaptive runner-pool scaling,
   and cloud-adapter fallback.
6. **CI budget harness and failure evidence.** Add the 480-second named-phase
   envelope, lane-specific section values, bounded lane/shard manifests,
   artifact ordering rules, and native-first failure classification.
7. **Stage 1 validation fan-out.** Add independent Quality, Unit, Integration,
   and Slow executors with exact-head checks, clean installation, safe npm
   caching, clean-worktree verification, and unique diagnostics.
8. **Timing-balanced shard policy.** Add checked-in, fixture-aligned,
   exactly-once shard assignment and measurement-gated matrix widths for lanes
   whose critical path justifies more VMs.
9. **Stage 2 native gates.** Add read-only Fast and Slow aggregate jobs, stable
   context assertions, underlying-job validation, timeout, and nightly
   unconditional slow execution.
10. **Ruleset coverage.** Require native Fast and Slow contexts with strict
    up-to-date enforcement on trunk and epic integration branches.
11. **Test-stage repoint.** Make `/task test #N` create/reuse the PR, append the
    transition, project `awaiting-ci`, and retain the legacy locator path.
12. **Receipt acceptance.** Poll native Actions, append
    `verification-evidence`, converge projection, and emit `REVIEW_COMPLETE`.
13. **WIP and do-si-do.** Exempt only validated `awaiting-ci` stories and resume
    them from GitHub state across sessions.
14. **Integration freeze.** Add authorized freeze/release capsules, projection
    indexing, child final-gate checks, drift handling, expiry, crash repair, and
    starvation-bounded fairness.
15. **Merge tail and trailers.** Implement per-target deterministic ordering,
    lazy update, exact-head merge, throughput observation, receipt trailers,
    and `integration-result`.
16. **Conflict rework.** Record merge/rebase conflicts, demote to Develop, and
    require affected verification plus a fresh cloud receipt.
17. **Triage.** Add manifest/log-driven diagnosis and Worker Report output.
18. **Documentation.** Update workflow, settings, Test-stage, cloud-worker
    adapter, recovery, and merge guidance.

Issue #1208 remains separately tracked, but item 1 may promote it to a rollout
dependency if measured GitHub-runner timings cannot meet this design's fixed
budgets.

## References

- `docs/decisions/0002-github-native-authority-records.md`
- `docs/spikes/429-fleet-registry-gc.md`
- `docs/superpowers/specs/2026-07-31-github-native-authority-records-design.md`
- `docs/superpowers/specs/2026-07-20-epic-aware-git-branching-design.md`
- [GitHub Actions workflow syntax and matrices](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub Actions jobs and dependencies](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs)
- [GitHub Actions dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)
- [GitHub Actions job conditions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions)
- [GitHub required status check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
- [GitHub Actions secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub check data retention](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
