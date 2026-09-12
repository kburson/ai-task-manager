# Tiered Test Execution Design — #1219

**Status:** Design approved section by section and as a whole on 2026-09-12;
written specification for final document review. Implementation is not authorized
by this document alone.

**Issue:** #1219. Existing descendant issues remain provisional traceability.

**Implementation baseline:** `origin/trunk` at
`99c5e2c6f79b246144483068eafdc2369a3c5b09`.

## 1. Product decision

AITM keeps local development responsive by limiting local verification to an
explainable affected set and moving authoritative PR validation to ephemeral
GitHub Actions runners. Projects choose between two supported execution modes:

| Contract                           | `full-pr` — new-project default                                              | `tiered` — opt-in                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Develop                            | Bounded affected verification; conservative fallback when TIA is unavailable | Same deterministic TIA floor and bounded local execution                        |
| Test / every PR                    | Quality and all configured tests                                             | Quality, all Unit and Integration tests, plus any additional mandatory coverage |
| Slow execution                     | Sequential whenever included                                                 | Sequential whenever included                                                    |
| Scheduled complete validation      | Absent                                                                       | Every six hours through once a week; default every eight hours                  |
| Scheduled project-health authority | Inactive                                                                     | Durable state, freshness, CI admission, and governed repair                     |
| Initial operating overhead         | Configuration, PR workflow, required verification check                      | Adds the scheduler, durable health publication, and health enforcement          |

`full-pr` is a complete supported mode for small teams. It does not require a
health data branch, health issue, repair lease, ML model, or background scheduler.
A failed PR suite blocks that PR. It does not invent a project-wide scheduled
health incident.

In `tiered`, the complete suite samples the default branch at each due slot. It
may take an hour or more. Merges after the sampled SHA are explicitly outside
that complete proof and accept residual risk until a later complete run. A fresh
GREEN ancestor permits ordinary work when the candidate's required PR validation
passes. Exact-current-trunk complete proof is not required after every merge.

This specification uses `trunk` for this repository's default branch. Installed
projects resolve their configured default branch; they must not hard-code that
name or infer issue identity from a branch name.

## 2. Authority and inspected baseline

### 2.1 Design authority

The user's approved decisions govern this reset. The original specifications
preserve deliberation, constraints, and failure behavior; current trunk is
implementation truth. Historical plans and issue decomposition are traceability,
not authority to implement their former topology or lifecycle program.

These seven documents were read in full during the design audit:

1. [Original cloud Test specification](2026-09-01-1219-cloud-test-stage-design.md).
2. [Original implementation plan](../plans/2026-09-01-1219-cloud-test-automation.md).
3. [Portfolio WBS](../plans/2026-09-02-1219-cloud-test-portfolio-wbs.md).
4. [Continuous-delivery amendment specification](2026-09-04-1219-continuous-agent-delivery-amendment-design.md).
5. [Continuous-delivery amendment plan](../plans/2026-09-04-1219-continuous-agent-delivery-amendment.md).
6. [Repository-native TIA and build-health specification](2026-08-14-repository-native-polyglot-tia-and-build-health-design.md).
7. [Repository-native TIA plan](../plans/2026-08-14-git-native-polyglot-tia.md).

The approved reset explicitly replaces these earlier choices:

- Fixed five/six-job production fan-out and Slow sharding are not prerequisites.
- Mandatory direct TIA overflow may be deferred to remote Test, just as lane
  escalation may. Neither case removes coverage. Both produce performance
  findings when they exceed the applicable budget.
- A ten-minute cloud target is not a complete-suite duration cap.
- Cadence is configurable from four times daily to weekly, with unchanged-trunk
  skips; fixed nightly or fixed eight-hour-only scheduling is superseded.
- Freshness follows scheduled obligations, not a fixed 12- or 36-hour age limit
  on the last actual test execution.
- Explicit never-run initialization permits admission before the first complete
  run. Missing data after activation does not mean never run.
- Full-suite PR validation without scheduled health is the default for new
  projects. Tiered mode is an explicit later choice.
- Broad fast PR coverage replaces the August proposal for affected-only PR CI.
- Test-stage remote execution does not move merge ownership into Test, replace
  Review, or add a ninth lifecycle state.

### 2.2 Live repository and graph observations

The read-only refresh fetched `origin/trunk` and inspected native issue and
worktree authority. At the audited SHA:

- #1219 is OPEN / Develop, with six direct sub-epics and 29 stories; no deeper
  descendants were returned. #1220 is Develop; the other five sub-epics are
  Ready for Planning. #1226 is OPEN / Review; the other 28 stories are Ready for
  Planning.
- All stories have textual dependency declarations, but the inspected graph has
  zero native `blockedBy` edges. Prose is not native dependency authority.
- The newest #1219 worktree marker identifies the primary checkout on `trunk`.
  The historical `cloud-test-automation` branch is absent locally and remotely.
  The detached Codex checkout is not a substitute issue branch.
- The active trunk ruleset, `Protect trunk` (20694244), requires a PR and the
  strict check `Fast lane (format, lint, unit + integration)` from GitHub Actions.
  It does not yet require project-health validation.
- Canonical inventory is 845 Unit, 158 Integration, and 52 Slow files: 1,055
  total. These counts describe the audit, not fixed acceptance counts.
- #1226 calibration code is on trunk. Its fixture describes an older commit,
  inventory, and dependency lock; the old results cannot select today's topology
  or establish current performance. Its OPEN / Review state is preserved.

The historical original-plan commit was squash-integrated; its plan blob is
already represented on trunk. No history-only merge, branch resurrection,
issue closure, or graph repair is part of this reset.

## 3. Requirements ledger and current-code mapping

Paths in this section are repository-relative implementation evidence, not
instructions to modify them during design.

| Requirement / classification                                                                                             | Current implementation evidence                                                                                                 | Assessment and decision                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Explainable deterministic TIA — durable intent                                                                           | `scripts/task-tracker/lib/test-impact-selector.mjs`, `test-impact-manifest.json`                                                | Partial. Preserve changed tests, reverse dependencies, mappings, and conservative lane expansion; repair change resolution and unknown-path behavior.              |
| Whole branch change interval — durable safety invariant                                                                  | `verify-develop.mjs` collects a diff against `HEAD` plus untracked files                                                        | Missing committed branch changes against the target merge base. Correct before trusting selection.                                                                 |
| Non-removable coverage floor — durable safety invariant                                                                  | Selector materializes escalated lane files; provider custom steps can replace its plan                                          | Partial. Preserve coverage as explicit obligations; custom providers cannot bypass the activated floor.                                                            |
| Responsive local loop — durable performance objective                                                                    | `verification-providers/node.mjs` invokes one Node process per selected file; `verify-develop.mjs` executes steps synchronously | Partial. Introduce bounded batches, a wall-clock budget, cancellation/cleanup, and invocation admission.                                                           |
| Shared fixture setup without state leakage — durable intent                                                              | Runner fixtures already share some immutable setup within a file                                                                | Partial. Explicit fixture families and isolation certification are needed before wider reuse.                                                                      |
| Host test admission — durable resource constraint                                                                        | `run-tests.mjs` bounds some workers inside one invocation                                                                       | Missing across invocations. Coordinate this repository's clones/worktrees without introducing agent-fleet management.                                              |
| Exact-head remote Test handoff — durable intent                                                                          | `verbs/test.mjs` has local sandbox execution and protocol-specific evidence acceptance                                          | Partial. Legacy execution is local; the GitHub-record path expects accepted evidence but does not provide the complete new handoff. Extend current protocol seams. |
| Broad fast PR validation — durable intent                                                                                | `.github/workflows/ci.yml` runs quality, Unit, Integration                                                                      | Partial. Existing docs skips and conditional Slow behavior do not establish the new required inventory and health contract.                                        |
| Complete inventory, Slow serial — durable safety invariant                                                               | `test-lanes.mjs`, `run-tests-lanes.mjs`, `run-tests.mjs`                                                                        | Partial and partly contradicted. Current Slow-safe annotations permit concurrency two; force concurrency one for all Slow execution under this design.             |
| Configurable complete cadence and unchanged skip — durable intent                                                        | CI has nightly Slow and manual/label triggers                                                                                   | Missing as one complete, serialized, health-producing process.                                                                                                     |
| Durable health and CI admission — durable intent                                                                         | No implemented shared scheduled-health authority found                                                                          | Missing. Implement only for tiered mode, with explicit bootstrap and freshness semantics.                                                                          |
| Governed unhealthy-work block and repair — durable intent                                                                | Existing issue, ownership, worktree, defect, and delivery machinery                                                             | Reusable mechanisms, missing shared health gate and incident lease.                                                                                                |
| Native evidence and least privilege — useful security constraint                                                         | CI uses read-only contents permission; receipt and evidence modules enforce identity                                            | Partial. Retain native-first acceptance and separate candidate execution from trusted publication.                                                                 |
| Exact-head lifecycle and receipt compatibility — already-delivered capability                                            | `verification-receipt.mjs`, `lib/evidence-v2/`, `verbs/deliver.mjs`, `merge-back.mjs`, `graph-node-authority.mjs`               | Reuse current interfaces and protocol routing. Do not replace them with old planned abstractions.                                                                  |
| ML adds or prioritizes, never subtracts — durable extension boundary                                                     | No learner, activated model, or shared learning plane found                                                                     | Missing but optional. Preserve a future observation contract; initial delivery uses deterministic TIA.                                                             |
| Calibration and timing — already-delivered capability                                                                    | `lib/cloud-test/performance-baseline.mjs`, timing schema 5                                                                      | Reuse utilities, refresh measurements. Timing output alone is not a health verdict.                                                                                |
| Full PR mode and safe switching — newly approved durable intent                                                          | No coherent two-mode activation contract found                                                                                  | Missing. Make full PR the new-project default without changing existing installations implicitly.                                                                  |
| Fixed shards, paired topology canaries, throughput targets — obsolete assumptions                                        | Historical #1219 plans                                                                                                          | Remove as launch gates. Additional sharding requires later evidence.                                                                                               |
| Fleet overflow, integration freezes, Test-owned merge, collateral-only Review, broad runtime migration — unrelated scope | Historical amendment and several current lifecycle interfaces                                                                   | Exclude the larger programs. Retain only trust and identity checks necessary for these test contracts.                                                             |

Additional observed correctness limits matter to the design:

- Static graph extraction recognizes a subset of JavaScript ESM imports/exports;
  dynamic loading, subprocess dependencies, and other languages need explicit
  policy or conservative fallback. Reading only the current graph loses some
  deletion relationships.
- An unmatched path can currently become `no-verification-impact` without an
  affirmative exclusion policy. Malformed mappings can throw without producing
  a usable conservative obligation.
- The final Node Develop plan runs full lint and format, not the required
  exact-head TIA/obligation handoff record.
- `npm test` currently means Unit only. Complete means quality plus Unit,
  Integration, and Slow, not merely `npm test` followed by Slow.
- `.tmp/aitm/test-timing.json` is mutable per-invocation output and can precede
  final leak/ceiling checks. It cannot act as durable GREEN evidence.
- Current evidence-v2 code contains implemented and synthetic/rehearsal-only
  boundaries. A schema name alone does not prove installed cloud acceptance is
  available. Activation must exercise the actual installed protocol path.

## 4. Architecture and feature boundary

Three execution architectures were considered:

| Architecture                                       | Benefits                                                                               | Costs / decision                                                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| One PR executor; one independent complete executor | Few setup boundaries, simple inventory accounting, reuses current broad-fast job shape | Selected for tiered mode. The same PR executor runs complete coverage in full-pr mode.                                          |
| Separate quality, Unit, and Integration VMs        | Potentially shorter PR wall time and stronger resource separation                      | Viable later; repeats setup and adds jobs, result joins, and coverage accounting. Requires measurement.                         |
| Fixed multi-shard fast and Slow fan-out            | Maximum tunable parallelism                                                            | Rejected for initial delivery: more coordination, stale calibration dependence, and conflict with sequential Slow requirements. |

The cohesive feature consists of four cooperating boundaries:

1. **Local planner/executor:** resolves changes, computes mandatory coverage,
   admits one bounded invocation, executes safe batches, and emits evidence plus
   any remote obligations and performance findings.
2. **Test coordinator:** pushes the governed candidate, identifies its unique PR,
   waits for native Actions evidence, and accepts only the exact authorized
   candidate through the issue's existing evidence protocol.
3. **Repository CI:** executes the selected mode on ephemeral runners and exposes
   a stable required final gate with explicit dependency-success checks.
4. **Tiered health service:** repository-owned scheduler, typed publisher,
   durable health records, admission readers, and bounded repair authorization.
   This boundary is inactive and unnecessary in full-pr mode.

No external database, separate metrics repository, custom GitHub App, standing
bot account, or PAT is required for the health service. Use repository-owned
workflows and job-scoped `GITHUB_TOKEN` permissions. Existing user credentials
and sanctioned providers remain responsible for the existing governed PR and
delivery operations.

## 5. Configuration and mode transitions

### 5.1 One effective policy

The project owns a checked-in, versioned test-execution configuration. Its
contract includes mode, provider/lane inventory, deterministic mappings,
fixture-family policy, local limits, remote limits, and, only for tiered mode,
schedule and health settings. These are new configuration semantics, not claims
that current AITM already exposes matching CLI flags.

New-project setup selects `full-pr`. Existing installations are inspected and
explicitly migrated; a package update must not silently reinterpret a missing
mode field and remove existing verification. Unsupported or conflicting
configuration is reported with a concrete remediation.

Configuration tooling updates its managed portion of `ci.yml` and any referenced
complete/publisher workflows together. User-owned jobs remain intact; ambiguous
custom wiring is reported rather than overwritten. Manual workflow editing is
supported when it satisfies the same validated contract. A YAML toggle by
itself cannot create a GitHub schedule: activation must produce the actual
checked-in schedule trigger and verify it on the default branch.

The effective policy for a candidate comes from the protected base and trusted
runtime. A PR may propose policy changes, but may not use those changes to
weaken its own acceptance. Record old and proposed policy digests. Where a mode
transition changes required coverage, prove the stronger transition coverage
and both sides' relevant wiring before activating the new policy.

The governed coordinator enforces that rule outside candidate execution. It
loads the active policy and managed workflow semantics from the protected base,
then reads the candidate workflow as data and compares its managed-section
digest. A candidate that changes that section is a policy-transition proposal:
it must satisfy the previously active policy and cannot use its proposed jobs,
dependencies, or check names as authority for its own delivery. The proposed
policy becomes eligible only after it lands on the protected default branch and
passes transition activation. Candidate-produced checks remain diagnostic input;
their names or green conclusions never replace this coordinator decision.

### 5.2 Full PR to tiered

The reviewed change installs fast PR coverage, required health validation,
complete scheduling, durable publication, and recovery wiring. After it reaches
the default branch, initialize the tiered ledger explicitly and request an
immediate complete trunk run; do not wait as long as a week for the first slot.

An initialized never-run state permits admission until the first run starts or
its initial dispatch deadline expires. Once a run starts without an earlier
GREEN baseline, health is UNKNOWN until a complete result is accepted. Missing
bootstrap publication cannot be interpreted as never run.

### 5.3 Tiered to full PR

Establish and verify required full-suite PR validation before retiring the
scheduled-health gate or scheduler. Preserve historical health records for
audit. Do not leave a required context missing during the transition or allow a
candidate to choose the weaker half of two policies.

An open RED incident is not cleared by a mode switch. Resolve it through the
approved repair/recovery path before retiring tiered enforcement. This is a
transition condition, not a requirement for new full-pr projects to operate a
health service.

## 6. Develop selection, execution, and obligations

### 6.1 Change resolution and deterministic floor

Resolve the literal target branch and its applicable merge base. The change set
includes committed branch changes from that base, tracked working-tree/index
changes, and untracked paths. Preserve rename source and destination, deletions,
and path bytes through NUL-delimited parsing. An unreadable base or ambiguous
repository identity is an explicit failure, not an empty change set.

The mandatory floor is the union of:

- Changed and newly added tests.
- Known direct and transitive dependency consumers, including relevant base-side
  relationships for removed or renamed inputs.
- Explicit manifest mappings and always-run safety tests.
- Conservative coverage expansion for configuration, dependency-lock, runner,
  fixture, runtime, workflow, and other shared-impact changes.
- Additional conservative coverage where analysis cannot prove a narrower set.

An empty selection requires affirmative exclusion evidence under protected
policy. An unknown source path, unsupported language/dependency construct, or
invalid mapping cannot silently become “no impact.” The Node and explicit
project-provider seams remain available; provider-specific steps must express
the activated floor or declare conservative remote coverage instead of
overriding it away.

### 6.2 Fallback matrix

| Condition                                                | Local action                                                                                        | Required remote action                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Complete, reliable selection within budget               | Execute the selected safe batches                                                                   | Normal mode coverage plus any independently required obligations                              |
| Predicted or observed budget overflow                    | Stop scheduling additional local work at the bound; record completed and unfinished work separately | All remaining mandatory coverage, including direct selections and escalations                 |
| Stale optional history/model                             | Ignore it; retain deterministic selection                                                           | Normal mode coverage; optional additive tests may be retained                                 |
| Stale or incomplete deterministic graph                  | Rebuild against pinned inputs, or conservatively expand                                             | Execute expanded mandatory coverage that cannot fit locally                                   |
| Malformed manifest, unsupported analysis, unknown impact | Record the diagnostic; use the trusted conservative fallback inventory                              | Complete configured coverage when a narrower safe scope cannot be established                 |
| Cannot enumerate even a trusted conservative inventory   | Refuse successful Develop handoff                                                                   | Repair configuration/identity; do not manufacture a coverage obligation with unknown contents |
| Assertion failure                                        | Fail verification and repair the candidate                                                          | Remote execution may diagnose but cannot waive the observed failure                           |
| Explicit policy exclusion                                | Record exclusion and applicable quality checks                                                      | Full-pr still runs all configured tests; tiered still runs broad fast coverage                |

Deferral is an explicit `pending remote coverage` outcome, not a local pass.
Develop may enter Test with that outcome when its completed mandatory local work
has passed and the remaining coverage is durably identified. Delivery is blocked
until all mandatory obligations pass remotely at the accepted candidate identity.

### 6.3 Budgets and performance findings

Retain the historical local feedback objective of at most 180 seconds and the
default 300-second hard execution bound. Projects may make reviewed,
evidence-based adjustments. Time inside the admitted invocation includes
selection/setup/execution/cleanup; queue waiting is reported separately. Remote
wall-clock limits are separate policy values. A complete run is never subjected
to the former ten-minute topology-selection target.

Every activated remote executor requires a finite wall-clock limit compatible
with its runner platform. Enabling tiered mode requires an explicit complete-run
allowance and dispatch/publication grace; configuration validation refuses
missing or invalid bounds rather than guessing a freshness deadline. Per-file
timeouts, cleanup limits, and whole-run limits are distinct.

Predicted and observed over-budget TIA selections produce a durable performance
finding: selected suites/families, input identity, estimated and observed
runtime where available, setup cost, applicable budget, local completion,
deferral, and resource observations. Findings are deduplicated across retries
without erasing new evidence. A remote pass resolves coverage, not the finding.
The finding remains actionable until test/fixture performance is refactored or
the budget receives an evidence-based review. A finding alone is not a new
delivery veto after all required coverage passes.

Performance findings use the project's existing governed evidence/issue
mechanism. Full-pr projects do not need a scheduled-health ledger to retain them.

### 6.4 Local admission and fixture isolation

Initially permit one participating verification invocation at a time across
this repository's clones and worktrees on the same physical host. Internal
concurrency is bounded and reserves capacity for interactive development. This
is a test-runner admission mechanism, not a limit on agent count or a general
worker-fleet scheduler. It cannot control arbitrary unmanaged processes.

Admission uses an identifiable invocation owner and bounded recovery. A stale
lock is not reclaimed while its test children may still be running; cleanup or
operator diagnosis precedes replacement. Never rely on clone-local lock files
to enforce a host-shared limit. Queue cancellation, execution cancellation, and
resource starvation are visible outcomes.

The admission record lives in the platform's user-scoped runtime/state directory,
outside every checkout, under an AITM-owned namespace keyed by stable repository
identity (remote host plus repository owner/name), not by a clone path. All
clones and worktrees of that repository therefore contend on one record, while
unrelated repositories do not. The record is runtime coordination only, never
repository evidence or a portable lock, and its owner/process and child-liveness
checks govern stale recovery.

Fixture reuse is opt-in through reviewed family policy. A family can share
immutable repository seeds and expensive setup within one invocation. Each case
gets fresh mutable state or a verified reset. Family identity includes candidate,
runtime, provider/configuration, and invocation identity. Independently admitted
invocations never share mutable fixtures.

Process-global environment, cwd, modules/mocks, clocks, child processes, ports,
and temporary files require explicit isolation or restoration. A reset failure
or leak fails verification and disposes of the fixture. Retrying cannot conceal
the original failure. Use ordinary process isolation for unsupported families;
do not import arbitrary test files into one process simply to reduce spawning.
Parallel-safe annotations do not certify same-process isolation.

Dependency download caches may be keyed by lockfile/runtime. Mutable workspaces,
`node_modules`, and fixture state are not shared between ephemeral CI VMs. Small
families remain isolated if reuse cannot demonstrate a useful reduction in cost.

### 6.5 Develop evidence

Record repository/issue, base and candidate identity, working-tree digest for
iterations, provider/runtime/lock/policy identities, changed paths, selection
reasons, inventory, batches, outcomes, timings, exclusions, and obligations.
Before Test handoff, seal the record against a clean committed candidate. An
iteration on dirty files cannot authorize a different committed tree. Relevant
input changes invalidate reuse.

## 7. Test handoff and native CI acceptance

Test entry uses the existing governed branch/worktree and current lifecycle
protocol. It validates Develop evidence, pushes the exact committed candidate
using the sanctioned push contract, then creates or uniquely reuses the PR for
the literal head/base pair. An ambiguous transport result is reconciled by live
readback before retrying. Never create a replacement branch or second PR to
avoid recovery.

Record the expected head, base, issue/cycle/epoch, provider, policy, and PR
identity before waiting. `awaiting CI` is recoverable execution status inside the
existing lifecycle, not a ninth lifecycle stage. A restarted coordinator can
find the same PR, native run, and acceptance attempt without replaying mutations.
There is no second detached local sandbox running the full suite on this path.

In full-pr mode, the PR executor runs quality and every configured test. In
tiered mode, it runs quality and all Unit and Integration tests regardless of
local TIA selection, plus any uncovered mandatory obligations, including Slow
coverage. A deferred Unit test already covered by broad PR execution does not
need a duplicate run; coverage reconciliation must prove that identity match.
All Slow work is sequential, including today's annotated parallel-safe subset.
Docs-only PRs do not silently bypass the mode's promised PR inventory.

Acceptance requires native workflow/job/step evidence for the expected candidate,
trusted workflow identity, provider/runtime/policy identities, expected required
jobs, and executed inventory. Pin `HEAD` explicitly: a provider's synthetic merge
ref is not interchangeable with PR-head evidence. If integration testing uses a
merge ref additionally, record its distinct base/head identity and purpose.

The stable final gate runs even after upstream failure and succeeds only if each
required dependency explicitly succeeded and coverage reconciles. Skipped,
neutral, cancelled, timed-out, missing, or failed mandatory work cannot satisfy
the contract. The same applies to health validation in tiered mode. GitHub can
treat skipped or neutral checks as acceptable, so default platform semantics
alone are insufficient. [GitHub required-check behavior](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

The coordinator independently reads native results. Candidate artifacts support
inventory and diagnostics but never override a native failure. Native success
without necessary authenticated coverage evidence is insufficient. Conflicting
attempts remain visible; a later retry is not silent erasure of an earlier
failure. A changed head/base contract, expired authority epoch, replaced PR, or
untrusted workflow causes refusal and explicit revalidation.

Local receipt v1 remains local proof with its current exact-head/environment and
retirement semantics. Remote acceptance extends the applicable existing
GitHub-record/evidence-v2 interfaces; it does not reinterpret old receipts or
fabricate an installed protocol from rehearsal-only code. Append and projection
recovery must be idempotent and fenced by current authority.

Remote candidate success does not publish project GREEN. Review and delivery
retain their current owners, review requirements, exact-head provider actions,
delivery intents, receipts, and post-action readback.

## 8. Scheduled complete validation and freshness

### 8.1 Schedule and skip decision

Tiered cadence is one enumerated value: `every-6h`, `every-8h` (default),
`every-12h`, `daily`, or `weekly`. The six-, eight-, and twelve-hour slots are
anchored at 00:00 UTC and occur on exact top-of-hour divisions of the UTC day.
Daily configuration selects one UTC hour. Weekly configuration selects one ISO
weekday and one UTC hour.
Minute is zero for the initial contract. Configuration stores the cadence,
anchor/day/hour, policy version, next due slot, and bounded
dispatch/completion allowances; it rejects every other interval or incomplete
anchor instead of rounding or approximating it. Generated workflow triggers and
the coordinator's slot calculations must produce the same slot identities. In
particular, weekly uses day-of-week semantics and never an invalid day-of-month
step expression.

At each due slot, the trusted coordinator resolves the current default-branch
head and reads the latest accepted complete result:

1. If the latest result is a compatible successful complete run at that exact
   head, record an unchanged-trunk check and skip test execution.
2. If trunk changed, pin the current head and execute the complete inventory.
3. If there is no valid success, run complete validation or the authorized
   recovery path. A failure, cancellation, partial run, or missing result is not
   a successful baseline that suppresses subsequent work.

Compatibility includes the configured suite, policy, and execution environment
identity. A material policy/environment change invalidates an otherwise
same-SHA skip. Explicit manual, release-candidate, bootstrap, repair, and recovery
requests can force execution at an unchanged head. Release-candidate validation
remains complete where required by release policy.

Complete execution runs quality and every configured test lane, with all Slow
tests sequential. Discover inventory at the pinned head and reconcile it after
execution. Missing lanes, unexpected empty inventory, or abandoned files do not
produce GREEN. Timing output is finalized only after cleanup/leak and budget
verdicts are included.

### 8.2 Serialization and ongoing trunk changes

Only one project complete-validation executor runs at a time. This includes
forced repair-candidate and recovery complete requests that would otherwise
overlap the scheduled executor. Normal fast PR jobs remain independent. Full-pr
projects serialize Slow inside each isolated PR executor; they do not acquire a
tiered health-service lease.

Trunk advancement never cancels a complete run already in progress. Its result
covers its pinned SHA. Requests for the same head/contract join the existing run;
multiple waiting scheduled requests coalesce into one pending request. After the
active run finishes, resolve the pending request against current trunk. Preserve
the original due-slot accounting so queuing cannot endlessly refresh health.

Cancellation and shutdown dispose of child processes and leave a non-success
record. A lost executor is bounded by its recorded deadline; a new executor
cannot silently overlap an unaccounted predecessor.

### 8.3 Freshness is an obligation deadline

Track actual complete-test evidence separately from schedule observations.
Freshness does not mean the last actual execution must be less than a fixed
number of hours old. An idle repository can retain an old successful full run
while successive scheduled checks verify unchanged trunk.

For a valid GREEN baseline, ordinary admission lasts through:

`next required scheduled slot + configured dispatch/completion/publication allowance`

The allowance is finite, explicit, and versioned; it includes the configured
maximum complete-run duration and the permitted infrastructure grace. A trusted
unchanged check advances to the next slot without changing the last actual run's
SHA, timestamp, or outcome. A changed-trunk check creates a due full-run
obligation and does not extend that obligation's deadline merely by starting or
queuing work. A successful complete result satisfies its slot and establishes
the next deadline. Late results cannot move a deadline forward by pretending a
later slot was checked.

A missed check or overdue run makes health UNKNOWN at admission time even if no
publisher has written a new status. An intervening complete failure makes it
RED on trusted observation, without waiting for the old deadline. Corrupt or
inconsistent authority is UNKNOWN. A run still in progress can coexist with a
prior GREEN only until its deadline and only absent a newer failure.

For example, with an eight-hour cadence and unchanged trunk, a slot records an
unchanged check and no tests run. If a commit merges afterward, its PR proof
permits work until the next slot and allowance; that slot validates the then
current trunk. Weekly cadence accepts the analogous week-long risk window.

GitHub scheduled workflows can be delayed or dropped and run from the default
branch. Readers therefore calculate expiry themselves; scheduler reliability
cannot be the sole fail-closed mechanism. [GitHub schedule semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

An operator may manually dispatch the same protected coordinator to publish a
trusted schedule observation without forcing complete execution. This operation
may clear only a deadline-only UNKNOWN when the last compatible complete result
was GREEN, the current default-branch head is still its exact tested SHA, the
policy/environment identity is unchanged, and no failure, changed-trunk due
obligation, or other incident intervened. It records the missed slot and the
manual observation provenance before advancing the deadline. It cannot clear
RED, any other UNKNOWN cause, or a due obligation for changed trunk; those paths
still require the incident-specific reconciliation or complete recovery run.

## 9. Durable health, CI admission, and trust

### 9.1 Minimal repository-native persistence

Tiered mode uses a configurable protected same-repository orphan data branch,
defaulting to `aitm/tia-data`, for compact canonical health and lease records.
It has no merge base with application history and is never merged into trunk. A
persistent project-health issue points to the exact accepted data-branch commit.
The issue is an operational projection; its text or label cannot independently
grant authority.

The data-branch ruleset blocks deletion and non-fast-forward updates. It permits
only the named trusted publisher workflow identity to perform validated
fast-forward writes; ordinary users, candidates, and test jobs cannot push.
Publisher code, expected-old-head compare-and-swap, path/schema validation, and
narrow token permissions remain mandatory even for that bypass actor. Creating
or changing this ruleset is the separately reviewed external operation described
in section 12.

The initial data plane needs only versioned configuration identity, explicit
initialization, complete-run records, schedule observations, current health,
incident/lease state, and publication provenance. ML training data and model
activation are not required to operate it. Full-pr mode does not install this
plane simply to record an inactive flag.

Records identify repository, default branch, mode/policy epoch, pinned source
SHA, suite/provider/environment digests, native workflow/run/job/attempt identity,
start/completion times, result class, coverage digest, last checked slot, next
deadline, and any incident/lease. Keep current records directly addressable and
prior decisions reachable through history. Ordinary artifact expiry must not
destroy the evidence required to interpret current health.

Only complete runs pinned to default-branch snapshots can publish trunk health.
Complete PR runs, including repair candidates, carry a distinct scope and cannot
replace the last trunk result. The publisher validates this distinction before
updating health.

### 9.2 State and admission table

| Effective state         | Meaning                                                                                                                   | Ordinary CI and governed work                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Inactive                | Protected configuration selects full-pr; full PR validation is required                                                   | No scheduled-health dependency                                     |
| Initialized / never run | Explicit tiered initialization, no complete run started, initial dispatch deadline not exceeded                           | Allow under the approved bootstrap exception                       |
| GREEN                   | Latest applicable complete result is successful; projection and lineage valid; deadline not exceeded                      | Allow, subject to candidate validation and all existing gates      |
| RED                     | Trusted complete result failed or an unresolved failure incident remains                                                  | Block unrelated work; governed repair only                         |
| UNKNOWN                 | Missing/corrupt/inconsistent authority, no success after first run starts, overdue obligation, or indeterminate execution | Block unrelated work; diagnosis/recovery or authorized repair only |

A historical success older than the latest failure is not “last run GREEN.”
Unchanged checks and PR runs do not overwrite the last complete outcome. A
scheduled run that skips execution is a schedule observation, not a complete
run. A first run that never produced a usable result is UNKNOWN, not never run.

A deadline-only UNKNOWN can be reconciled by a fresh trusted schedule observation
that proves the same compatible successful head remains current and no failure
or other obligation intervened. Other UNKNOWN causes require repaired authority
and complete recovery validation. No such observation clears RED.

### 9.3 Publication security and recovery

Candidate test jobs have read-only repository permissions and no issue-write,
check-write, or health-write authority. The trusted publisher runs protected code
outside the candidate workspace and independently verifies native Actions source,
workflow, head, attempt, complete inventory, and outcome. It never executes
candidate artifact content or caller-supplied shell/path commands. Runtime
isolation checks real paths and containment, not just unequal directory strings.

Typed publication operations initialize, record schedule observations, record
complete results, and manage repair leases. Validate schemas, canonical bytes,
size/path allowlists, digests, repository identity, and legal transitions before
publication. Reject symlinks, application files, arbitrary payloads, secrets,
raw environments, absolute local paths, and raw logs from canonical records.

Use narrow job-scoped permissions: test execution reads; data publication writes
only through the validated data protocol; health-issue projection writes only
that projection. Existing repository-native ledger-validation status publication
may use its narrowly scoped permission; it is not a replacement for native PR
test conclusions. Do not grant test jobs the publisher's token.

Data updates are validated single-parent fast-forwards with an expected previous
head. Conflicts refetch and recompute within a finite retry bound. Issue
projection and data commit must agree; a crash between them yields UNKNOWN until
idempotent reconciliation completes. Native result publication is deduplicated
by source identity and attempt. An older success cannot overwrite a newer
failure or supersede a different incident/epoch.

The trusted controller reconciles terminal complete runs that failed before
upload/publication. Failure observation must not depend on a successful artifact
upload. If native evidence cannot be read, readers fail closed rather than keep
an unverifiable GREEN. Do not rely on token-generated data pushes to recursively
start workflows; recovery dispatch is explicit.

### 9.4 CI wiring and the enforcement boundary

In tiered mode, `ci.yml` contains a lightweight health-validation job that reads
the pinned durable state and can fail early before expensive ordinary PR jobs.
The head-authored job is an optimization and diagnostic, not a trusted
enforcement boundary. Its success is necessary platform evidence but never
sufficient for governed delivery. The required final gate explicitly requires
health validation success and all mode-required verification, and a skipped
health job is never accepted as success, but the out-of-candidate coordinator
decision below remains authoritative even when those checks are green.

Configuration validation checks semantic workflow wiring, referenced trusted
workflow identity, mode/coverage agreement, permissions, and the live default
branch ruleset's required final context and expected source. Searching YAML for
a job name is insufficient. Missing access to inspect protection is reported as
unverified protection, not successful activation. The user configures the
project's ruleset to require a PR and passing verification; applying an external
ruleset change requires the separately approved exact ruleset delta.

An earlier native green check is a result at CI time, not a continuously expiring
GitHub merge permit. AITM rereads health and protected-base policy at every
governed mutating preflight and immediately before its delivery action, verifies
the candidate managed-workflow digest against that base, and binds acceptance to
the observed health epoch/deadline. If health or protected policy changes before
the action is issued, revalidate or refuse. This coordinator runs outside the
candidate job and is the enforcement boundary a head rewrite cannot replace.
Tiered mode therefore requires authenticated authority reachability for every
governed mutation; an offline or unreadable health/policy read fails closed and
no cached green authorizes mutation. Read-only diagnosis and status remain
available offline.

This design does not claim an atomic transaction between a health update and
GitHub's merge API, or an instantaneous server-side expiry of an old green
check. Direct UI/API merges retain the platform's check-time behavior; this
feature does not introduce a new merge identity, App, or permission system to
eliminate that limitation.

## 10. Blocking and governed repair

In tiered RED or UNKNOWN, shared AITM preflight blocks unrelated start/bind,
planning, lifecycle advancement or demotion, Develop/Test verification, review,
delivery, closure, and recording unrelated progress as authorized work.
Read-only diagnosis, status/history, stopping or pausing work, complete recovery,
health reconciliation, and the active repair path remain available. This does
not claim to prevent arbitrary editor or shell actions outside AITM.

One expiring repair lease authorizes an incident. Every lease records repository,
incident class and health epoch, holder, issue, literal branch, permitted base,
unique nonce, acquisition, expiry, and heartbeat. Class-specific evidence is:

- A `test-failure` incident requires the failed native run and tested source SHA.
  It authorizes source repair or an explicitly reasoned recovery run and clears
  only after an accepted complete result on repaired/current trunk is bound to
  that incident.
- An `authority-infrastructure` incident records the failing operation or
  observation, diagnostic code, expected authority head, and observed source
  SHA when available; failed run and SHA are nullable. It authorizes only
  authority reconciliation, publisher repair, or a complete recovery run when
  coverage is indeterminate. It clears when authority is repaired and a trusted
  observation establishes an unambiguous state; if coverage is unknown, that
  observation must be an accepted complete result.
- A `deadline-only` scheduler-miss incident records the missed slot and prior
  GREEN baseline; failed run and SHA are null. It authorizes the manual trusted
  schedule observation in section 8.3 and clears only under that operation's
  unchanged-head conditions.

Claim, renewal, binding, release, and reclamation are serialized typed
operations. The duration and renewal policy are finite configuration; renewal
accommodates a full run that lasts longer than an individual lease interval. An
expired holder loses authority. A label alone, a copied nonce, or a stale branch
does not admit repair.

The holder creates or reuses a defect through sanctioned AITM mechanisms, binds
the authorized repair branch/worktree, and fixes the failure. Complete validation
on the exact repair PR head is mandatory and bypasses unchanged-trunk skipping.
The PR still follows existing review, ownership, required checks, and delivery
rules. The lease grants only the health exception, not permission to bypass
other gates.

After test-failure repair delivery, request an immediate complete run on repaired
trunk. Health remains RED until that new complete result passes and is accepted
for the incident. A passing repair PR, merge, label removal, or issue closure
does not clear it. Authority/infrastructure incidents follow their narrower
reconciliation or recovery rule above and remain UNKNOWN until their trusted
clearing observation. Ordinary same-SHA retry luck cannot silently erase a
failure. A stale pre-repair success finishing late cannot clear the incident.

GREEN publication clears the resolved lease. Ordinary candidates must incorporate
repaired trunk and obtain fresh candidate verification before delivery; a
pre-incident acceptance is insufficient. Existing provider-action ownership and
delivery receipts remain unchanged.

## 11. Diagnostics, observations, and measured follow-ons

Preserve distinct outcomes for selection/configuration failure, admission wait,
setup/install failure, assertion failure, local budget overflow, remote timeout,
infrastructure loss, cancellation, leak/reset failure, coverage gap, native
evidence mismatch, stale candidate, publication failure, and acceptance recovery.
All non-passing required work is visible; a transport failure is not a test pass.

Diagnostics report the failed/unfinished jobs and files, relevant native URLs,
bounded log excerpts, fixture-family identity, runtime/resource cost, and next
supported recovery action. Do not automatically rerun the full suite to diagnose
one failed publication or acceptance step. Reuse evidence only when its exact
identity and validity conditions still hold.

Retain bulky artifacts under an explicit retention policy, with compact current
health/coverage provenance surviving their expiry. Local caches are ignored,
disposable, and never shared health authority. Only trusted complete inventories
provide unbiased full-suite exposure; an unselected test is unobserved, not
passing. Deduplicate observations and retain source/provider/environment and
ancestry identities.

Optional history/ML may order or add tests. Models cannot subtract the
deterministic floor, activate themselves, grant repair, or publish health. Any
future learned activation requires sufficient labeled full-run exposure,
held-out/backtest evidence, explicit versioning, escape measurement, drift
checks, and rollback. Missing or stale history falls back to deterministic TIA.
Building a trainer or reproducing the old model/data platform is outside initial
delivery.

Use refreshed exact-input measurements to decide which fixture family to refactor
or whether further PR parallelism is justified. Preserve cold/warm distinctions,
runner profile, setup cost, test versus whole-run duration, sample count, and
failed attempts. Historical #1226 measurements are examples only. Do not claim
production p95 from an inadequate cohort or turn a shorter CI run into a claim
of ten merges per hour.

## 12. Acceptance scenarios and activation conditions

These are design acceptance conditions, not an implementation task sequence.

| Area                  | Required observable proof                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Small-project mode    | New full-pr setup runs quality and all configured tests on each PR, requires the final gate, and installs no scheduled-health service.                                                                                                                      |
| Change correctness    | Committed-only changes, staged/unstaged edits, untracked paths, unusual path bytes, renames, deletions, and target-base changes produce the correct explained floor.                                                                                        |
| Conservative fallback | Unknown impact, unsupported graph edges, malformed mappings, stale graph/history, and unreadable base cannot produce false empty verification.                                                                                                              |
| Coverage deferral     | Direct and escalated overflow preserve all mandatory work; Test cannot accept until the exact-head remainder passes. Assertion failures cannot be deferred away.                                                                                            |
| Performance finding   | Predicted/observed overrun records actionable suite/budget evidence; remote success closes coverage without silently closing that finding.                                                                                                                  |
| Resource admission    | Simultaneous invocations in different clones/worktrees resolve one user-scoped repository-identity record, respect the shared limit, separate queue time, and leave no overlapping children after killed owners.                                            |
| Fixture isolation     | Certified reuse reduces repeated setup; mutable leakage, reset failure, orphan children, and cross-invocation sharing fail; unsupported families remain isolated.                                                                                           |
| Remote handoff        | Push/PR ambiguity, duplicate requests, coordinator restart, head replacement, and stale epochs recover idempotently or refuse without a second PR/local full sandbox.                                                                                       |
| Native acceptance     | Missing, skipped, neutral, failed, cancelled, timed-out, forged, wrong-head, wrong-workflow, and incomplete-inventory evidence cannot pass the final gate.                                                                                                  |
| Complete execution    | Every configured lane executes, all Slow files run sequentially, and cleanup/budget outcomes are included before a complete verdict.                                                                                                                        |
| Schedule              | Only six-hour, eight-hour, twelve-hour, daily, and weekly policies validate; their UTC anchors produce matching workflow/coordinator slots; unchanged successful trunk skips; changed trunk runs; manual/repair forcing works.                              |
| Freshness             | Unchanged checks advance the next deadline without fabricating a run; missing slots, overdue jobs, queue overlap, and weekly cadence obey the same deadline rules.                                                                                          |
| Health persistence    | Missing/corrupt records, mismatched issue pointers, stale publishers, conflicting attempts, and partial writes fail closed and recover without inventing GREEN.                                                                                             |
| Bootstrap             | Explicit never-run admits only within its bootstrap conditions; deleted or unreadable state cannot reproduce that exception.                                                                                                                                |
| Repair                | Failure, authority/infrastructure, and deadline-only incidents enforce their class-specific nullable fields, remediation, and clearing observations; forged labels and stale leases refuse; concurrent claims yield one holder.                             |
| Mode transitions      | Full-pr to tiered installs and verifies the whole contract; tiered to full-pr establishes full coverage first and cannot discard an active RED incident.                                                                                                    |
| Compatibility         | Installed local receipts and current issue protocols retain their meanings; candidate code cannot evaluate or replace trusted authority.                                                                                                                    |
| Health admission      | Unreadable authority, offline mutation, a health change between preflight and delivery, and publisher/projection partial state fail closed; idempotent reconciliation cannot invent GREEN.                                                                  |
| Protection            | Configuration validation demonstrates the live required final gate and health dependency; a candidate that rewrites the managed health/final-gate jobs still cannot obtain governed delivery, and missing inspection permission is never silently accepted. |

Activation requires a protected pilot showing these properties and usable
diagnostics, with bounded runtime appropriate to the selected mode. No fixed
shard topology, minimum agent fleet, historical canary cohort, or merge-throughput
target is an activation prerequisite. External ruleset changes remain separately
reviewed operations. This design session performs none of them.

## 13. Existing story disposition

Retain #1219 as the design identity. The following is an approved assessment of
all 29 stories, not authorization to mutate them. “Rewrite” means preserve the
useful responsibility while replacing its historical contract. “Outside” retains
history and existing delivered interfaces without making the whole story a
prerequisite. Delivered evidence is never erased by a disposition recommendation.

| Story                                                 | Disposition                      | Responsibility retained or reason excluded                                                                                         |
| ----------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| #1226 — Exact-head baseline and canary primitives     | Retain delivered primitives      | Reuse calibration/input identity utilities; refresh measurements. Preserve OPEN / Review and existing evidence.                    |
| #1227 — Parameterized sharding and partition proof    | Obsolete as prerequisite         | Fixed shard execution is not required; retain the general inventory-completeness invariant in executor acceptance.                 |
| #1228 — Disposable canary and selected topology       | Obsolete as prerequisite         | No canary-selected fan-out is needed for the chosen architecture; future topology changes require fresh measurements.              |
| #1229 — Default-deny Slow impact                      | Rewrite                          | Conservative additional coverage and forced sequential Slow, without silent omission.                                              |
| #1230 — Phase budgets and native diagnostics          | Rewrite                          | Separate local/PR/complete bounds, full failure taxonomy, actionable diagnostics and overrun findings.                             |
| #1231 — Fixture families                              | Rewrite                          | Explicit reusable families, reset/isolation proof, and immutable setup boundaries.                                                 |
| #1232 — Bounded Develop and cloud obligations         | Rewrite                          | Correct branch diff, immutable coverage floor, all mandatory overflow deferral, and exact candidate handoff.                       |
| #1233 — Machine admission and cloud overflow          | Rewrite narrowly                 | Shared local test-invocation admission only; remove agent-fleet limits and general cloud worker overflow.                          |
| #1234 — Production Stage 1 fan-out                    | Rewrite                          | Simple PR executor supporting full-pr/tiered mode and managed workflow configuration.                                              |
| #1235 — Stage 2 gates and nightly validation          | Rewrite                          | Explicit final gate, configurable complete cadence, unchanged skips, and health validation.                                        |
| #1236 — Native evidence and receipt v2                | Rewrite                          | Native result normalization and current-protocol acceptance; preserve local receipt meaning and security boundaries.               |
| #1237 — Candidate/Test entry/PR adoption/hosted CI    | Rewrite                          | Exact-head push, unique PR reuse, recoverable waiting, and remote obligation acceptance.                                           |
| #1238 — Canonical clean-context flow review           | Outside                          | Existing review integration is reused; a new mandatory flow-review program is not needed to move tests remotely.                   |
| #1239 — Finding adjudication and governed defects     | Outside as a broad program       | Reuse sanctioned defects for repairs and performance follow-up; do not require the amendment's whole adjudication lifecycle.       |
| #1240 — Required contexts and epic protection         | Rewrite narrowly                 | Validate mode-specific CI and default-branch protection; do not introduce hierarchical epic rulesets.                              |
| #1241 — Parent integration freezes                    | Outside                          | Throughput/coordination program unrelated to these test tiers.                                                                     |
| #1242 — Test-owned merge and delivery receipt v2      | Outside                          | Preserve current delivery ownership and receipt interfaces.                                                                        |
| #1243 — Hierarchical delivery and merge-back          | Outside                          | Reuse literal-ref/graph authority without redesigning hierarchical delivery.                                                       |
| #1244 — Manifest-driven triage                        | Rewrite                          | Native failure/coverage/performance diagnostics with bounded artifacts.                                                            |
| #1245 — Weighted Slow pooling                         | Obsolete for this design         | Conflicts with sequential Slow execution; do not undo already-delivered generic runner utilities.                                  |
| #1246 — Dominant Slow fixture and throughput goal     | Rewrite                          | Evidence-based performance refactoring; remove ten-merges-per-hour acceptance.                                                     |
| #1247 — Pilot, documentation, default rollout         | Rewrite                          | Pilot both modes, low-overhead full-pr defaults, safe transitions, and verified tiered activation.                                 |
| #1518 — Runtime v3 and isolated execution root        | Outside as a migration program   | Retain required trusted-runtime isolation in acceptance/publisher boundaries; do not require wholesale runtime-v3 migration.       |
| #1519 — Stage enrollment and literal authority        | Outside as an enrollment program | Reuse current stage/graph authority and literal refs; no new enrollment project.                                                   |
| #1520 — Human PR approval bridge                      | Outside                          | Existing approval/provider mechanism remains authoritative.                                                                        |
| #1521 — Collateral-only Review                        | Outside                          | No Review relocation.                                                                                                              |
| #1522 — Review authorization, close, epic aggregation | Outside                          | Existing lifecycle behavior is preserved.                                                                                          |
| #1523 — Closed-story crossover assurance              | Outside                          | Separate assurance program.                                                                                                        |
| #1524 — Migration, activation, telemetry program      | Outside as written               | Narrow test-mode activation and evidence diagnostics belong to the rewritten testing stories, not the broader amendment migration. |

The six sub-epics require the same reassessment: #1220's delivered calibration
remains useful but its topology gates are obsolete; #1221 and #1222 retain remote
and local testing responsibilities; #1223 retains evidence/handoff slices;
Sub-epic #1224 retains default-branch verification protection only; #1225 retains measured
performance, diagnostics, and rollout. Their current boundaries and dependency
prose are not an approved implementation order.

The later decomposition must explicitly cover mode configuration/transitions,
durable health, schedule/skip/deadline semantics, CI wiring validation, governed
work preflight, and repair. Existing titles do not prove these responsibilities
are covered. No new issues or dependency edges are created by this specification.

## 14. Deliberate exclusions and consequences

The initial feature excludes mandatory ML training, general polyglot adapter
expansion beyond existing provider contracts, external data services, a custom
Checks-based test receipt service, GitHub merge queues, organization migration,
agent-fleet orchestration, fixed Slow sharding, hierarchical integration freezes,
new merge/trailer formats, Test-owned merges, collateral-only Review, and a broad
runtime/enrollment/migration program.

Complete validation is expensive by design. Tiered mode accepts an explicit
between-run risk window, configurable up to weekly; full-pr pays the full suite
cost on each candidate and is simpler to operate. At this repository's audited
1,055-file inventory, including 52 sequential Slow files, that complete run may
be on the order of an hour; `full-pr` is operationally simplest but is most
appropriate to teams and suites willing to pay that cost per PR. A fresh
ancestor GREEN is not proof that later trunk commits received full coverage.
Unknown dependencies increase remote work rather than reduce the safety floor.
Fixture reuse reduces setup only where isolation can be demonstrated. Finite
health deadlines can block ordinary work during CI outages, with the bounded
manual observation or incident-recovery route defined above.

The approved outcome is this specification and its governed documentation commit.
Implementation, an implementation plan, issue rewrites/closures, dependency
hydration, branch creation/pushes, and project ruleset changes require subsequent
work. Final written-document review precedes any such expansion.
