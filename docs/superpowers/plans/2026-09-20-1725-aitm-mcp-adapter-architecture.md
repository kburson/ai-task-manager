# AITM MCP and External-System Adapter Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to execute one approved delivery task at a time.
> This umbrella plan must be hydrated into governed child work. No phase may
> begin implementation until its bounded specification and implementation plan
> have completed independent review and received the required approval.

**Goal:** Refactor AI Task Manager into a headless orchestration kernel shared
by CLI and MCP transports, with capability-specific provider adapters, durable
external authority, recovery-safe mutations, portable setup, and truthful host
assurance.

**Architecture:** Introduce a provider-neutral kernel under `src/` and retain
the current `scripts/` entry points as compatibility transports until verified
cutover. The active `work-items` adapter remains the sole durable evidence
authority, while repository, forge, CI, and identity behavior crosses typed
ports. Delivery is serially gated: Phase 0 must certify a feasible GitHub
execution topology and operating envelope before any Phase 1 mutation path can
be approved.

**Tech Stack:** Node.js 24+ ESM, built-in `node:test`, JSON Schema, current
GitHub CLI integration during migration, workspace-local MCP stdio transport,
npm package exports, and isolated provider certification fixtures.

**Spec:**
`docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md`
at reviewed trunk commit
`267b91b9218b59342a0d70e0859a0e38523a3923`.

## Global Constraints

- Phase 0 is an approval gate. No Phase 1 mutation implementation or migration
  activation begins until its retained results prove an approved execution
  topology, verified plugin snapshot, and numeric quota/retention envelope.
- Every delivery phase receives a bounded specification, implementation plan,
  executable tests, independent review, and explicit approval before coding.
- After this umbrella plan is reviewed, hydrate its tasks into governed child
  issues before creating the child artifacts. Each child specification and plan
  uses that child's allocated numeric issue ID in its filename; this plan does
  not preassign or guess future issue numbers.
- CLI and MCP are peer transports over one application-service path. Neither
  transport owns workflow policy, provider calls, or transport-specific action
  semantics.
- Exactly one writable binding exists for each configured `work-items`,
  `repository`, `forge`, and `ci` port. `work-items` is the sole backlog and
  canonical evidence authority. `identity` remains non-mutating and may expose
  multiple provider/account observations.
- No private workflow database, hosted AITM control plane, always-running local
  daemon, automatic transitive-plugin activation, or tracked provider secret is
  introduced.
- Governed writes require a provisioned, verified execution target. A fresh
  clone after `npm ci` supports read-only discovery and diagnosis only unless it
  is separately provisioned and verified as that target.
- Every mutating request carries a caller-held request key and authenticated
  project-scoped principal. Transport IDs, process IDs, display names, and
  agent-supplied actor strings are not identity.
- Every request, outcome, recovery record, approval, receipt, and projection is
  derived from schema-validated canonical data. Agent JSON is UTF-8, minified,
  deterministically ordered where hashed, and omits absent optional fields.
- Provider-specific APIs, opaque IDs, pagination, rate limits, retries,
  observation, and error translation remain inside their adapters.
- Selected executable plugins are fully trusted in-process code. This version
  verifies their complete runtime closure and immutable loading view but does
  not claim to sandbox or contain them.
- Interrupted or ambiguous effects are observed and reconciled under recovery
  ownership before retry. Search absence, timeout, or lease expiry never proves
  that a write did not occur.
- Evidence streams are append-only and hash-linked. Fork joins require a
  versioned multi-parent replay contract; old readers fail closed on unsupported
  schemas.
- Local Git effects bind canonical repository, clone/worktree identity, refs,
  expected revisions, and user-data boundaries. Another clone cannot supply
  proof that an original local effect did not occur.
- Existing GitHub projects keep their current writer until a shared,
  old-writer-fenced activation record commits. Local file restoration cannot
  reactivate a retired authority generation.
- Full-Auto requires truthful `guarded` or `strict` assurance across every
  participating port. `behavioral` hosts remain supervised-only.
- GitLab, Bitbucket, and Jira adapters are separately published projects. Their
  implementation is not folded into the core package.
- All implementation tasks use red-green-refactor cycles and preserve the
  existing CLI behavior until the applicable phase exit gate passes.

## Scope

This plan decomposes the reviewed umbrella architecture into independently
reviewable delivery units. It owns the Phase 0 proof, the core kernel and
built-in adapters, CLI migration, discovery, MCP, setup/portability, the public
adapter SDK, provider-plugin certification boundaries, host enforcement, and
the final compatibility cutover.

It does not pre-approve any phase-specific design, select an MCP SDK version,
allocate provider credentials, create external provider projects, or activate a
new mutation authority. Those decisions remain within the named review gates.

## Context

The current package routes daily work through `bin/aitm.mjs`,
`bin/aitm-registry.mjs`, and the script-oriented task tracker. GitHub-specific
durable records live primarily under
`scripts/task-tracker/lib/github-records/`, while evidence lifecycle behavior
already exists under `scripts/task-tracker/lib/evidence-v2/`. Package bootstrap
and health contracts live under `scripts/package/`, and provider-host adapters
under `scripts/providers/` currently describe agent providers rather than
external backlog/forge systems.

The migration must preserve those working paths while introducing the following
new boundaries:

| Boundary                  | Responsibility                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `src/kernel/contracts/`   | Canonical schemas, references, effects, results, errors, help, and serialization            |
| `src/kernel/actions/`     | Portable action definitions, application services, policy, and registry metadata            |
| `src/kernel/authority/`   | Request identity, journal replay, bootstrap, projections, approvals, recovery, and fencing  |
| `src/kernel/runtime/`     | Port resolution, immutable execution context, adapter dispatch, and installation admission  |
| `src/adapter-sdk/`        | Public ABI, `defineAdapter`, manifest validation, fixtures, and conformance runner          |
| `src/adapters/github/`    | Built-in GitHub work-items, forge, CI, identity, evidence, and diagnostics                  |
| `src/adapters/local-git/` | Repository binding, worktree/clone identity, local effects, observation, and recovery       |
| `src/transports/cli/`     | CLI request parsing and human/JSON rendering over kernel services                           |
| `src/transports/mcp/`     | MCP tools/resources and structured-content projection over the same services                |
| `src/setup/`              | Plugin discovery, trust selection, lock files, staging, staleness, and migration            |
| `src/host-bridges/`       | Host registration, learning projection, mutation routing, and assurance probes              |
| `scripts/tests/`          | Unit, integration, slow, portable-install, migration, parity, and live certification suites |

## Acceptance Criteria

- [ ] All 21 architecture acceptance criteria have an owning task and named
      executable verification coverage.
- [ ] Phase 0 retains a reviewed feasibility result and numeric operating
      envelope before any Phase 1 mutation child is approved.
- [ ] The existing CLI suite passes through the kernel before MCP becomes a
      required interface.
- [ ] Every agent-callable registry action has a tested MCP route, and every
      orchestrator-only primitive is rejected by all public dispatchers.
- [ ] Built-in GitHub and local Git adapters pass the same public conformance
      contracts required of external plugins.
- [ ] Setup, fresh-clone diagnosis, immutable plugin loading, learning
      projection, staleness, evidence-only recovery, migration, and host
      assurance pass their adversarial suites.
- [ ] Existing GitHub workflows remain available until the reviewed cutover;
      no phase silently rewrites historical evidence or switches authority.

## Plan Metadata

- Priority: P1
- Size: XL
- Estimate: 480 hours across the core program, excluding separately funded
  GitLab, Bitbucket, and Jira plugin implementation
- Labels: refactor

## Story Intent

- **Beneficiary:** maintainers and operators who run governed agentic delivery across repositories and external work systems
- **Capability:** invoke one recoverable AITM workflow through CLI or MCP while selecting compatible provider adapters per capability
- **Need:** the current script boundary leaks provider mechanics and cannot safely compose providers, retries, portable setup, or host enforcement
- **Value or failure prevented:** governed actions remain discoverable, attributable, recoverable, and portable without duplicate effects or provider-specific policy escaping into agents

## Delivery Gates

1. **Gate A — feasibility:** Tasks 1–3 complete and Phase 0 is explicitly
   approved. Failure returns the umbrella architecture to design review.
2. **Gate B — kernel mutation:** Tasks 4–10 complete serially. Each increment
   retains its previous path until the next increment passes its cutover tests.
3. **Gate C — agent surface:** Tasks 11–13 complete before MCP is considered a
   supported workflow path.
4. **Gate D — portability and ecosystem:** Tasks 14–16 complete before external
   adapters can claim portable activation.
5. **Gate E — provider and assurance rollout:** Tasks 17–20 complete before MCP
   replaces the legacy Full-Auto entry path.

## Hydration and Execution Protocol

- This file is the issue-hydration and dependency authority for #1725. It is
  not direct authorization to implement all 20 tasks inside the parent issue.
- Independent review must accept this file before `split-plan` or equivalent
  governed child creation.
- Each hydrated child starts by writing its bounded specification and detailed
  implementation plan against the then-current repository and its allocated
  issue number. That child does not edit source until both artifacts complete
  the required review and approval path.
- Phase 1 children are approved serially in the order shown. Later phase
  children may be created for visibility, but remain blocked on the preceding
  delivery gate.
- Tasks 17–19 are external-project deliveries. Their child records track
  compatibility and retained certification evidence; their source changes do
  not land in the core repository.

---

### Task 1: Specify the Phase 0 Reference Execution Topology

#### Story Intent

- **Beneficiary:** AITM maintainers responsible for enabling default-provider writes
- **Capability:** evaluate one concrete dispatcher topology against explicit ownership and isolation requirements
- **Need:** GitHub journals do not themselves fence stale dispatchers or establish exclusive execution
- **Value or failure prevented:** the kernel is not built around an execution model that later proves unsafe or unavailable

#### Files and Interfaces

- Create: `docs/superpowers/specs/2026-09-20-1725-aitm-mcp-phase-0-feasibility-design.md`
- Create: `docs/superpowers/plans/2026-09-20-1725-aitm-mcp-phase-0-feasibility.md`
- Define: provisioned execution target, one-shot supervisor/dispatcher lifecycle,
  request-worker channel, credential boundary, checkout-binding resolver, and
  explicit unsupported-host outcomes.

#### Steps

- [ ] Inventory every current GitHub and local Git mutation entry point, caller,
      credential source, conflicting scope, and existing guard.
- [ ] Specify the candidate single-dispatcher topology, including process-stop
      proof between invocations, outstanding-effect settlement, co-located
      multi-worktree routing, and refusal of independent-clone writes.
- [ ] Define host assumptions and falsifiable acceptance tests for credential,
      filesystem, process, and network isolation.
- [ ] Define failure outcomes for unavailable target, lost target, unsupported
      host, stale generation, and unprovable takeover.
- [ ] Complete independent review of both documents before prototype code.

**Verification Commands:**

```sh
rg -n "credential|git commit|git push|gh |graphql|api " bin scripts --glob '*.mjs'
npm test
```

### Task 2: Prototype the Dispatcher and Verified Plugin Snapshot

#### Story Intent

- **Beneficiary:** operators provisioning a governed execution target
- **Capability:** run one bounded dispatch through an exclusive target and load one adapter from immutable verified bytes
- **Need:** path hashing, local locks, and writable shared package trees cannot prove the code or owner used at effect time
- **Value or failure prevented:** admitted work cannot switch implementations or continue through a stale writer between validation and dispatch

#### Files and Interfaces

- Create: `src/feasibility/dispatcher-supervisor.mjs`
- Create: `src/feasibility/checkout-binding.mjs`
- Create: `src/feasibility/plugin-snapshot.mjs`
- Create: `scripts/tests/slow/feasibility/reference-topology.test.mjs`
- Produce a one-shot `dispatch(request) -> result` prototype and a staged,
  content-addressed adapter loader with only the shared SDK edge externalized.

#### Steps

- [ ] Write failing process-lifecycle, stale-owner, pause/resume, and target-loss
      tests before implementing the supervisor.
- [ ] Write failing closure tests for escaping paths, ambient dependencies,
      changed assets, a second kernel copy, and an edit between verification and
      import.
- [ ] Implement the minimum supervisor, checkout resolver, snapshot publisher,
      and identity-verifying loader needed to exercise the candidate topology.
- [ ] Prove one co-located multi-worktree request succeeds through the same
      dispatcher and one separately configured clone is refused.
- [ ] Retain prototype results; do not connect the prototype to current
      production mutation commands.

**Verification Commands:**

```sh
node --test scripts/tests/slow/feasibility/reference-topology.test.mjs
npm run lint
npm run format:check
```

### Task 3: Certify Phase 0 Failure Modes and Operating Envelope

#### Story Intent

- **Beneficiary:** maintainers deciding whether Phase 1 is economically and operationally viable
- **Capability:** review retained concurrency, recovery, quota, retention, and loading measurements against numeric budgets
- **Need:** the architecture adds durable request/outcome traffic and cannot assume provider throughput, retention, or recovery latency
- **Value or failure prevented:** rollout stops before default-provider delivery if safe execution or sustainable evidence volume cannot be demonstrated

#### Files and Interfaces

- Create: `scripts/benchmarks/mcp-architecture-operating-envelope.mjs`
- Create: `scripts/tests/slow/feasibility/github-reference-certification.test.mjs`
- Create: `docs/reports/aitm-mcp-phase-0-feasibility.md`
- Measure provider calls per action, verification reads, retained bytes per work
  item, sustained governed actions per hour, cold replay reads for a declared
  workload, and recovery latency.

#### Steps

- [ ] Exercise provisioning, concurrent clones, process suspension, credential
      rotation, stale-generation dispatch, takeover refusal, and local Git
      effects with fault injection.
- [ ] Measure normal, throttled, delayed-visibility, response-loss, and uncertain
      evidence-append profiles without discarding records.
- [ ] Record explicit numeric budgets and the tested provider/host assumptions.
- [ ] Record unsupported routes, including remote forwarding or no-daemon
      behavior if either proof fails.
- [ ] Obtain explicit Gate A approval. If any required safety proof fails, stop
      and return the architecture to specification review.

**Verification Commands:**

```sh
node --test scripts/tests/slow/feasibility/github-reference-certification.test.mjs
node scripts/benchmarks/mcp-architecture-operating-envelope.mjs --verify-report docs/reports/aitm-mcp-phase-0-feasibility.md
```

### Task 4: Define Canonical Kernel Contracts and Action Inventory

#### Story Intent

- **Beneficiary:** adapter and transport implementers
- **Capability:** exchange one versioned vocabulary for actions, references, effects, results, errors, help, and evidence
- **Need:** current commands expose provider identifiers and inconsistent result shapes across script boundaries
- **Value or failure prevented:** no agent, transport, or neighboring adapter must interpret an untyped provider value

#### Files and Interfaces

- Create: `src/kernel/contracts/` modules for authority references, principals,
  action requests, effects, results, errors, evidence, help, and JSON Schema.
- Create: `src/kernel/actions/inventory.mjs`.
- Create: `scripts/tests/unit/kernel/contracts.test.mjs` and
  `scripts/tests/unit/kernel/action-inventory.test.mjs`.
- Modify: `package.json` to export only reviewed public contract surfaces.

#### Steps

- [ ] Generate a retained inventory of every current command, provider mutation,
      evidence write, approval gate, and recovery behavior.
- [ ] Write failing schema and canonical-serialization tests, including omitted
      absent values, deterministic hash ordering, and malformed opaque IDs.
- [ ] Implement frozen canonical values and `aitm.result/v1`, `aitm.error/v1`,
      discovery, learning, action, effect, and evidence schema families.
- [ ] Classify each operation as portable, namespaced extension, or
      `orchestrator-only`, with a named portable parent for internal primitives.
- [ ] Verify the inventory has no unclassified executable operation.

**Verification Commands:**

```sh
node --test scripts/tests/unit/kernel/contracts.test.mjs scripts/tests/unit/kernel/action-inventory.test.mjs
npm test
```

### Task 5: Build Append-Only Authority Replay and Evidence Recovery

#### Story Intent

- **Beneficiary:** operators investigating or recovering interrupted work
- **Capability:** replay exact external-authority evidence and repair uncertain appends without repeating business effects
- **Need:** current single-predecessor evidence cannot certify multi-parent fork joins or response-loss recovery
- **Value or failure prevented:** missing, duplicated, forked, or delayed records cannot be mistaken for a clean state

#### Files and Interfaces

- Create: `src/kernel/authority/envelope.mjs`, `replay.mjs`,
  `projection.mjs`, and `evidence-append.mjs`.
- Adapt: `scripts/task-tracker/lib/evidence-v2/` and
  `scripts/task-tracker/lib/github-records/` behind compatibility ports.
- Create: `scripts/tests/unit/kernel/authority-replay.test.mjs` and
  `scripts/tests/integration/kernel/evidence-append-recovery.test.mjs`.

#### Steps

- [ ] Write red tests for genesis, ordinary predecessor chains, corrections,
      tampered parents, competing forks, multi-parent joins, late branches, and
      old-reader refusal.
- [ ] Write red tests for lost request/outcome/reconciliation append responses,
      duplicate physical records, delayed visibility, and restart without local
      state.
- [ ] Implement canonical event identity, hash validation, complete-frontier
      joins, deterministic replay, and bounded rebuildable head projections.
- [ ] Implement lookup/read-back/retry semantics that retain the original event
      ID, predecessor, envelope, and unknown-outcome classification.
- [ ] Keep evidence append an internal protocol primitive unavailable through
      generic public invocation.

**Verification Commands:**

```sh
node --test scripts/tests/unit/kernel/authority-replay.test.mjs scripts/tests/integration/kernel/evidence-append-recovery.test.mjs
npm test
```

### Task 6: Add Principal, Request-Key, Approval, and Policy Services

#### Story Intent

- **Beneficiary:** humans and services authorizing governed work
- **Capability:** bind requests and approvals to verified identities, exact subjects, and durable replay keys across transports
- **Need:** provider credentials, display names, blanket tool permission, and agent-provided approval fields do not prove intent or human review
- **Value or failure prevented:** retries deduplicate correctly and forged, stale, revoked, or mismatched authority cannot dispatch effects

#### Files and Interfaces

- Create: `src/kernel/authority/principal.mjs`, `request-key.mjs`, and
  `approval.mjs`.
- Create: `src/kernel/actions/policy-service.mjs`.
- Reuse: `scripts/task-tracker/lib/workflow-policy/` through an adapter until
  callers migrate.
- Create: `scripts/tests/unit/kernel/identity-policy.test.mjs` and
  `scripts/tests/unit/kernel/request-key.test.mjs`.

#### Steps

- [ ] Write red tests for cross-transport principal equivalence, credential
      rotation, missing or ambiguous identity, forged labels, shared service
      identity, and unauthorized key inspection.
- [ ] Write red tests for identical replay, changed payload conflict, distinct
      keys with identical payloads, and simultaneous retries.
- [ ] Write red tests for forged human approval, changed approved content,
      expired/revoked approval, automated authority offered at a human gate, and
      tool permission without workflow approval.
- [ ] Implement one policy result model that keeps initiator, execution
      principal, approver, delegation, exception, and Full-Auto authority
      distinct.
- [ ] Persist recoverable non-secret execution context and reject mutation when
      required identity or subject evidence cannot be reconstructed.

**Verification Commands:**

```sh
node --test scripts/tests/unit/kernel/identity-policy.test.mjs scripts/tests/unit/kernel/request-key.test.mjs
npm test
```

### Task 7: Implement Scoped Execution Ownership and Recovery Service

#### Story Intent

- **Beneficiary:** concurrent workers and recovery operators
- **Capability:** serialize conflicting work, fence stale dispatchers, and reconcile ambiguous effects against recorded targets
- **Need:** journal comparison, elapsed leases, and local locks do not stop an old owner at the provider effect boundary
- **Value or failure prevented:** takeovers and configuration changes cannot duplicate, redirect, or silently abandon external effects

#### Files and Interfaces

- Create: `src/kernel/authority/ownership.mjs`, `admission.mjs`, and
  `recovery.mjs`.
- Create: `src/kernel/runtime/execution-context.mjs` and `dispatcher.mjs`.
- Create: `scripts/tests/integration/kernel/governed-action-flow.test.mjs` and
  `scripts/tests/integration/kernel/recovery.test.mjs`.

#### Steps

- [ ] Write red tests for conflicting scopes, canonical acquisition order,
      stale owners, pause after the final check, in-flight takeover, clock skew,
      and unresolved-effect blocking.
- [ ] Implement the request sequence from authenticated admission through
      verified request append, fenced dispatch, observation, outcome append,
      projection, and canonical result.
- [ ] Implement evidence-only recovery with exactly one authenticated selector,
      no business payload, current recovery authority, and no business effects.
- [ ] Preserve original targets, effect keys, configuration generation, adapter
      identity, and recovery contract across binding or version changes.
- [ ] Refuse incompatible recovery, missing credentials, retired generations,
      or redirection to a new default.

**Verification Commands:**

```sh
node --test scripts/tests/integration/kernel/governed-action-flow.test.mjs scripts/tests/integration/kernel/recovery.test.mjs
npm test
```

### Task 8: Implement the Public Port Runtime and Built-In Local Git Adapter

#### Story Intent

- **Beneficiary:** operators managing worktrees and clones under governed delivery
- **Capability:** select explicit capability bindings and execute local repository effects only against verified targets
- **Need:** current working directory and matching remotes do not establish portable repository identity or recovery authority
- **Value or failure prevented:** local mutations cannot land in the wrong checkout or overwrite user data during recovery

#### Files and Interfaces

- Create: `src/kernel/runtime/ports.mjs`, `binding-resolver.mjs`, and
  `adapter-runtime.mjs`.
- Create: `src/adapters/local-git/adapter.mjs`, `binding.mjs`,
  `effects.mjs`, and `recovery.mjs`.
- Create: `scripts/tests/conformance/local-git-adapter.test.mjs`.

#### Steps

- [ ] Write red tests for one active writable binding per port, explicit
      observation-only reads, missing/ambiguous targets, and cross-provider
      identity separation.
- [ ] Write red tests for linked-worktree conflict scopes, distinct clones,
      moved bindings, unavailable originals, uncommitted data, expected refs,
      and recovery from another clone.
- [ ] Implement deterministic port resolution with no first-match or
      transport-specific default behavior.
- [ ] Implement local effect receipts and observation without silently pushing,
      discarding, recreating, or moving repository artifacts.
- [ ] Run the adapter through the same preliminary ABI contract intended for
      external adapters.

**Verification Commands:**

```sh
node --test scripts/tests/conformance/local-git-adapter.test.mjs
npm test
```

### Task 9: Move GitHub Behind the Adapter Contract and Route the CLI Through the Kernel

#### Story Intent

- **Beneficiary:** existing GitHub-backed AITM users
- **Capability:** keep current CLI behavior while all provider mechanics execute through the public adapter and kernel services
- **Need:** GitHub APIs, identifier conversions, evidence storage, and workflow policy are currently distributed across scripts
- **Value or failure prevented:** GitHub cannot retain privileged bypasses that external adapters cannot implement or test

#### Files and Interfaces

- Create: `src/adapters/github/` implementations for work-items, forge, CI,
  identity, evidence, observation, recovery, and diagnostics.
- Create: `src/transports/cli/invoke.mjs`, `render-human.mjs`, and
  `render-json.mjs`.
- Modify: `bin/aitm.mjs`, `bin/aitm-registry.mjs`, and existing command/verb
  adapters to call application services.
- Create: `scripts/tests/conformance/github-adapter.test.mjs` and
  `scripts/tests/integration/transports/cli-kernel-parity.test.mjs`.

#### Steps

- [ ] Write conformance failures for identifier round trips, exclusive evidence
      writes, declared effects, unauthorized behavior, error normalization,
      retention, bootstrap, and response-loss recovery.
- [ ] Implement GitHub ports without exporting raw REST/GraphQL identifiers
      across the adapter boundary.
- [ ] Add compatibility action definitions for every inventoried CLI operation
      and route commands through one application-service dispatcher.
- [ ] Render existing human output from canonical objects and expose identical
      minified objects under `--json`.
- [ ] Prove existing CLI tests pass without MCP and without a privileged GitHub
      route into policy or evidence.

**Verification Commands:**

```sh
node --test scripts/tests/conformance/github-adapter.test.mjs scripts/tests/integration/transports/cli-kernel-parity.test.mjs
npm test
npm run test:slow
```

### Task 10: Certify Existing-Project Migration and Durable Cutover

#### Story Intent

- **Beneficiary:** maintainers upgrading existing GitHub-backed installations
- **Capability:** stage, verify, activate, recover, and reverse a migration without rewriting evidence or reviving old writers
- **Need:** local configuration changes cannot fence old clones, unattended commands, or in-flight legacy effects
- **Value or failure prevented:** migration never creates two writable authorities or loses the ability to explain committed effects

#### Files and Interfaces

- Create: `src/setup/migration-inventory.mjs`, `legacy-checkpoint.mjs`, and
  `authority-cutover.mjs`.
- Adapt: `scripts/task-tracker/lib/evidence-v2/migration.mjs`.
- Create: `scripts/tests/slow/migration/kernel-cutover.test.mjs`.

#### Steps

- [ ] Write red tests for an older CLI racing checkpoint capture, in-flight
      effects, crashes before/after activation, another clone, and restoration
      of pre-migration files.
- [ ] Stage generated files without activating them; preserve existing issue,
      board, branch, PR, journal, approval, and receipt references.
- [ ] Fence or verifiably stop old writers, settle pending effects, capture the
      final legacy checkpoint, and read back one durable activation record.
- [ ] Keep the old path selected on pre-activation failure and the new authority
      selected on post-activation local failure.
- [ ] Require a separately reviewed reverse cutover; never delete or relabel
      historical evidence during rollback.

**Verification Commands:**

```sh
node --test scripts/tests/slow/migration/kernel-cutover.test.mjs
npm run test:slow
```

### Task 11: Generate the Action Registry, Capability Graph, and Human Help

#### Story Intent

- **Beneficiary:** agents and operators deciding what action is valid next
- **Capability:** discover every available or unavailable action with schemas, reasons, effects, recovery, and next actions
- **Need:** procedural skills currently carry command knowledge that can drift from executable behavior
- **Value or failure prevented:** unsupported, unconfigured, unauthorized, stale, or temporarily unavailable work is explained instead of guessed

#### Files and Interfaces

- Create: `src/kernel/actions/registry.mjs`, `capability-resolver.mjs`,
  `describe.mjs`, `explain.mjs`, and `recommend.mjs`.
- Create: `src/transports/cli/help.mjs`.
- Create: `scripts/tests/unit/kernel/discovery.test.mjs`.
- Create: `scripts/tests/integration/transports/cli-help.test.mjs`.

#### Steps

- [ ] Write red enumeration tests covering every executable action, schema,
      help reference, portable parent, and invocation classification.
- [ ] Implement the closed availability statuses `available`, `blocked`,
      `unconfigured`, `unauthorized`, `unsupported`,
      `temporarily-unavailable`, and `orchestrator-only`.
- [ ] Resolve capabilities from core definitions, selected manifests, bindings,
      host enforcement, live authorization, external compatibility, and work
      context.
- [ ] Produce contextual why/when/when-not, effects, approvals, retry,
      remediation, examples, and valid next actions.
- [ ] Render CLI help from the same canonical records used by agent discovery.

**Verification Commands:**

```sh
node --test scripts/tests/unit/kernel/discovery.test.mjs scripts/tests/integration/transports/cli-help.test.mjs
npm test
```

### Task 12: Add the Tiered MCP Tools and Resources

#### Story Intent

- **Beneficiary:** agent hosts invoking AITM without procedural command knowledge
- **Capability:** discover, inspect, invoke, verify, deliver, close, and recover through typed MCP contracts
- **Need:** raw command execution cannot guarantee schema coverage, action classification, or structured recovery results
- **Value or failure prevented:** agents use governed intentions while MCP remains a transport rather than a second policy engine

#### Files and Interfaces

- Create: `src/transports/mcp/server.mjs`, `tools.mjs`, `resources.mjs`, and
  `structured-result.mjs`.
- Modify only after a reviewed dependency audit: `package.json` and
  `package-lock.json` for one exact-pinned MCP runtime.
- Create: `scripts/tests/integration/transports/mcp-tools.test.mjs` and
  `mcp-resources.test.mjs`.

#### Steps

- [ ] Ratify the exact MCP runtime dependency, production graph, Node floor,
      license, packed size, audit result, and alternatives before installation.
- [ ] Write red tests for the five discovery tools, seven common mutation tools,
      generic portable and extension invokers, and all declared resources.
- [ ] Reject unknown actions, namespace mismatches, invalid schemas,
      `orchestrator-only` primitives, and generic-invoker approval bypasses.
- [ ] Return native `structuredContent` plus only an identical minified JSON text
      compatibility block when required.
- [ ] Keep action/workflow handles authoritative in AITM evidence rather than
      MCP task/session state.

**Verification Commands:**

```sh
node --test scripts/tests/integration/transports/mcp-tools.test.mjs scripts/tests/integration/transports/mcp-resources.test.mjs
npm audit --omit=dev
npm pack --dry-run
```

### Task 13: Prove CLI/MCP Parity and Replace the Procedural Skill Surface

#### Story Intent

- **Beneficiary:** agents switching between CLI-capable and MCP-capable hosts
- **Capability:** obtain the same action, effects, evidence, errors, and recovery classification through either transport
- **Need:** adding MCP must not fork workflow semantics or leave uncommon actions unreachable
- **Value or failure prevented:** transport choice cannot alter authority or require hidden procedural knowledge

#### Files and Interfaces

- Create: `scripts/tests/slow/transports/cli-mcp-parity.test.mjs`.
- Modify: `skill/adapters/*/SKILL.md`, `skill/shared/router.md`, and installed
  lightweight bootstrap templates.
- Create: `docs/guides/mcp.md`.

#### Steps

- [ ] Enumerate the registry and require one tested MCP mapping for every
      agent-callable action.
- [ ] Invoke common actions through typed MCP, generic MCP, and CLI with one
      request key and assert one durable action and equivalent outputs.
- [ ] Exercise stale approvals, stale generation, response loss, and recovery by
      switching transports after the first attempt.
- [ ] Replace detailed skill procedure with discover-first guidance while
      retaining the CLI compatibility path and explicit raw-provider guard.
- [ ] Keep MCP Full-Auto disabled until Task 20 passes.

**Verification Commands:**

```sh
node --test scripts/tests/slow/transports/cli-mcp-parity.test.mjs
npm run lint
npm run format:check
```

### Task 14: Build Guided Setup, Tracked Configuration, and Staleness Admission

#### Story Intent

- **Beneficiary:** maintainers installing or changing AITM integration
- **Capability:** preview and commit one reproducible provider, host, capability, and runtime selection
- **Need:** mutation admission cannot trust stale generated files, mutable plugin bytes, or package-version comparison alone
- **Value or failure prevented:** fresh consumers diagnose safely and active runtimes cannot dispatch through drifted configuration or code

#### Files and Interfaces

- Create: `src/setup/inspect.mjs`, `intent.mjs`, `plugin-discovery.mjs`,
  `selection.mjs`, `install-manifest.mjs`, and `staleness.mjs`.
- Extend: `scripts/package/install-contract.mjs`, `install-observer.mjs`, and
  `doctor.mjs`.
- Generate: `.ai-task-manager/project.json`, `adapters.lock.json`,
  `capabilities.lock.json`, and `install-manifest.json`.
- Create: `scripts/tests/integration/setup/guided-setup.test.mjs`.

#### Steps

- [ ] Write red tests for direct dependency/workspace discovery, explicit local
      paths, non-recursive scanning, trust preview, compatibility, lifecycle
      scripts, lock normalization, and no implicit setup.
- [ ] Implement independently repeatable setup phases with staged output and
      verified external bootstrap before atomic local publication.
- [ ] Record setup ABI, schema versions, intent hash, adapter/runtime identities,
      host policy fingerprints, generated paths, and content hashes.
- [ ] Classify authoritative drift, advisory version differences, learning-only
      drift, schema migration, authorization, and external compatibility
      separately.
- [ ] Enter diagnostic-only mode on authoritative drift while retaining the
      verified evidence-only recovery route at the provisioned target.

**Verification Commands:**

```sh
node --test scripts/tests/integration/setup/guided-setup.test.mjs scripts/tests/unit/package/doctor.test.mjs
npm test
```

### Task 15: Prove Portable Fresh-Clone Operation and Learning Projection

#### Story Intent

- **Beneficiary:** cloud workers and independent clones consuming committed AITM integration
- **Capability:** discover and diagnose after `npm ci` without setup, mutation ownership, or local maintainer files
- **Need:** package locks and host registration can appear portable while depending on external paths, mutable assets, or rewritten tracked memory
- **Value or failure prevented:** read-only portability claims remain reproducible and advisory learning cannot become hidden authority

#### Files and Interfaces

- Create: `src/host-bridges/learning-projection.mjs` and
  `src/host-bridges/registration.mjs`.
- Create: `scripts/tests/slow/setup/portable-clone.test.mjs` and
  `scripts/tests/unit/host-bridges/learning-projection.test.mjs`.

#### Steps

- [ ] Pack and install a fixture, commit generated integration, clone it without
      maintainer paths, run only `npm ci`, start MCP, and perform read-only
      discovery and diagnosis.
- [ ] Prove ordinary clones refuse business/evidence mutations and return the
      provisioned target's recovery guidance.
- [ ] Cover pinned registry plugins, tracked workspace plugins, external local
      adapters, escaping symlinks, undeclared builds, changed assets, and
      immutable-runtime edits.
- [ ] Preserve all human memory outside managed markers; fail without writes on
      duplicate, nested, malformed, or ambiguous ownership markers.
- [ ] Refresh only untracked host-local projections on semantic fingerprint
      change; tracked targets warn and never rewrite at session boot.

**Verification Commands:**

```sh
node --test scripts/tests/slow/setup/portable-clone.test.mjs scripts/tests/unit/host-bridges/learning-projection.test.mjs
npm pack --dry-run
```

### Task 16: Publish the Adapter SDK, Verified Loader, and Conformance Runner

#### Story Intent

- **Beneficiary:** independent adapter authors and maintainers selecting their code
- **Capability:** implement, validate, and load a compatible adapter without core changes or a central allowlist
- **Need:** executable plugin trust, ABI compatibility, content identity, and shared-kernel module identity need one public contract
- **Value or failure prevented:** extension packages cannot silently escape their reviewed closure or load a second incompatible kernel

#### Files and Interfaces

- Create: `src/adapter-sdk/index.mjs`, `define-adapter.mjs`,
  `manifest-schema.mjs`, `conformance.mjs`, and fixtures.
- Create: `bin/aitm-adapter-conformance.mjs`.
- Create: `scripts/tests/slow/adapter-sdk/independent-plugin.test.mjs`.
- Modify: `package.json` exports and bins with the ratified first ABI version.

#### Steps

- [ ] Ratify and document the first public ABI version and its package-version
      compatibility matrix; do not equate ABI and package majors implicitly.
- [ ] Test manifest/port schemas, reference round trips, capability reporting,
      retry/recovery, authorization, evidence, diagnostics, minified JSON, and
      prohibited effects.
- [ ] Test complete executable closure, assets, loader inputs, shared SDK module
      identity, private-submodule refusal, no ambient resolution, and no second
      kernel copy.
- [ ] Certify declared execution ownership, bootstrap, retention, evidence
      recovery, stale-owner rejection, and explicit unsupported outcomes.
- [ ] Prove an independently built reference adapter loads and passes without a
      core source change.

**Verification Commands:**

```sh
node --test scripts/tests/slow/adapter-sdk/independent-plugin.test.mjs
node bin/aitm-adapter-conformance.mjs scripts/tests/fixtures/adapters/reference/dist/adapter.mjs
npm pack --dry-run
```

### Task 17: Certify the Independent GitLab Adapter Project

#### Story Intent

- **Beneficiary:** GitLab-backed delivery teams
- **Capability:** bind GitLab work-items, forge, CI, and identity ports through the public ABI
- **Need:** provider support must evolve independently without GitLab rules entering the core
- **Value or failure prevented:** GitLab composition gains full governance without creating a privileged provider path

#### Files and Interfaces

- External project/package owned outside this repository.
- Core changes are limited to provider-neutral conformance fixtures or defect
  fixes that also preserve GitHub and reference-adapter behavior.

#### Steps

- [ ] Create a separately governed GitLab adapter specification and plan.
- [ ] Implement only declared GitLab ports and namespaced extensions.
- [ ] Pass the published conformance runner and opt-in live disposable-provider
      certification.
- [ ] Prove GitLab-only and Jira-work-items-plus-GitLab-forge/CI composition.
- [ ] Publish with a compatible AITM peer dependency and verified runtime
      identity.

**Verification Commands:**

```sh
npx aitm-adapter-conformance ./dist/adapter.mjs
npm test
npm pack --dry-run
```

### Task 18: Certify the Independent Bitbucket Adapter Project

#### Story Intent

- **Beneficiary:** Bitbucket-backed delivery teams
- **Capability:** bind Bitbucket forge, CI, and identity capabilities through the public ABI
- **Need:** Jira-plus-Bitbucket composition requires typed cross-provider references and exclusive evidence routing
- **Value or failure prevented:** Bitbucket effects remain recoverable while Jira or another work-items provider retains sole authority

#### Files and Interfaces

- External project/package owned outside this repository.
- The adapter returns observations and receipts; it never persists a parallel
  canonical evidence stream unless selected as active `work-items` in a future
  separately specified capability.

#### Steps

- [ ] Create a separately governed Bitbucket adapter specification and plan.
- [ ] Implement the declared forge, CI, and identity ports plus reviewed
      extensions.
- [ ] Pass conformance, live disposable-provider, quota, and response-loss
      certification.
- [ ] Prove Jira-work-items-plus-Bitbucket-forge/CI composition and original
      target recovery after binding change.
- [ ] Publish with a compatible peer dependency and verified runtime identity.

**Verification Commands:**

```sh
npx aitm-adapter-conformance ./dist/adapter.mjs
npm test
npm pack --dry-run
```

### Task 19: Certify the Independent Jira Adapter Project

#### Story Intent

- **Beneficiary:** teams whose backlog authority is Jira
- **Capability:** store lifecycle, approvals, journals, receipts, and recovery records in Jira while composing another forge and CI
- **Need:** mixed-provider delivery requires exactly one evidence authority and provider-neutral references
- **Value or failure prevented:** forge or CI adapters cannot create competing authority streams or redirect recovery

#### Files and Interfaces

- External project/package owned outside this repository.
- Implement: Jira `work-items` and `identity` ports, durable control/work-item
  streams, retention certification, evidence lookup, bootstrap, and diagnostics.

#### Steps

- [ ] Create a separately governed Jira adapter specification and plan.
- [ ] Implement Jira authority storage with exact-envelope retrieval,
      request-key continuity, bootstrap genesis, and bounded projections.
- [ ] Pass conformance, retention/archive, lost-response, duplicate-root, and
      opt-in live certification.
- [ ] Prove Jira-plus-GitHub, Jira-plus-GitLab, and Jira-plus-Bitbucket mixed
      fixtures route every canonical envelope only to Jira.
- [ ] Publish with a compatible peer dependency and verified runtime identity.

**Verification Commands:**

```sh
npx aitm-adapter-conformance ./dist/adapter.mjs
npm test
npm pack --dry-run
```

### Task 20: Enforce Host Mutation Routing and Cut Over Full-Auto

#### Story Intent

- **Beneficiary:** maintainers authorizing unattended governed delivery
- **Capability:** know and enforce the actual mutation boundary used by Full-Auto across provider and local Git effects
- **Need:** MCP availability and hidden credentials do not prevent raw tools, HTTP calls, shell commands, or writable Git metadata from bypassing governance
- **Value or failure prevented:** unattended runs cannot claim stronger isolation than the host actually enforces

#### Files and Interfaces

- Create: `src/host-bridges/mutation-policy.mjs`, `assurance.mjs`, and host-specific
  bridge modules.
- Adapt: current bash/source-edit/provider guards to generated adapter-declared
  mutation surfaces.
- Create: `scripts/tests/slow/host-bridges/assurance.test.mjs`.

#### Steps

- [ ] Write red tests for strict, guarded, and behavioral classifications across
      provider credentials, endpoints, commands, filesystem, process, network,
      CLI, and local Git channels.
- [ ] Generate policies from selected adapter manifests and return canonical
      replacement-action errors for blocked raw mutations.
- [ ] Prove guarded hosts block known declared surfaces while retaining allowed
      reads; prove strict hosts isolate write channels from calling agents and
      other untrusted processes.
- [ ] Refuse Full-Auto under behavioral assurance or an unknown/untrusted
      executable identity.
- [ ] Record the minimum participating-port assurance, trusted plugin content
      identities, trust basis, and precise enforcement boundary in durable
      receipts.
- [ ] After independent review, switch MCP Full-Auto from disabled to supported
      and retain the compatibility route for one major-version transition.

**Verification Commands:**

```sh
node --test scripts/tests/slow/host-bridges/assurance.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

## Acceptance-to-Task Traceability

| Spec criterion | Owning tasks                           |
| -------------- | -------------------------------------- |
| 1              | 4, 7, 9, 12, 13                        |
| 2              | 8, 9, 17, 18, 19                       |
| 3              | 9, 16                                  |
| 4              | 14, 16–19                              |
| 5              | 4, 11–13                               |
| 6              | 4, 9, 11–13                            |
| 7              | 1–3, 14, 15                            |
| 8a–8d          | 2, 7, 12, 14–16                        |
| 9              | 5, 9, 10, 16, 19                       |
| 10             | 5–7, 13                                |
| 11             | 14, 15                                 |
| 12             | 16, 20                                 |
| 13             | 9, 10                                  |
| 14             | 1–3 and every task's phase review gate |
| 15             | 1–3, 7                                 |
| 16             | 5, 9, 14, 16, 19                       |
| 17             | 5, 7, 9, 16                            |
| 18             | 6, 7, 13, 20                           |
| 19             | 7, 10, 14, 16                          |
| 20             | 5                                      |
| 21             | 1–3, 8, 20                             |

## Final Program Verification

Run only after every in-repository task has reached its own reviewed exit gate
and the external provider tasks have retained their independent certification
results:

```sh
npm test
npm run test:slow
npm run lint
npm run format:check
npm audit --omit=dev
npm pack --dry-run
git diff --check
```

Release review must also inspect the Phase 0 report, adapter conformance
artifacts, portable-clone fixture, migration-cutover evidence, CLI/MCP parity
matrix, and host-assurance receipts. Any release-gate failure named in the
governing specification blocks activation of only the affected capability; it
must not be hidden by weakening the result or deleting evidence.
