# State Engine Refactoring Epic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate AITM lifecycle and timing-event policy, enforce a complete
agentic CLI help contract, and then JIT-audit the remaining operational
mechanisms under one traceable epic.

**Architecture:** Six sequential direct children establish characterization,
canonical lifecycle topology, history/action projections, timing-event policy,
agentic CLI discoverability, and final policy convergence. Existing issue #1006
is a nested child epic that starts only after convergence and creates
evidence-backed grandchildren from a JIT operational audit.

**Tech Stack:** Node.js 22+, ECMAScript modules, `node:test`, GitHub CLI and
GraphQL, AITM issue/body helpers, Prettier, ESLint, markdownlint.

## Global Constraints

- Governing design:
  `docs/superpowers/specs/2026-07-27-state-engine-refactoring-design.md`.
- Evidence corpus:
  `docs/superpowers/specs/2026-07-27-state-engine-bug-bash-evidence.md`.
- Preserve the current eight-state lifecycle and every corrected behavior in
  the evidence corpus unless a separately tracked defect approves a change.
- Executable, entry-history, and timing-history topology are distinct named
  projections.
- History-only edges never become executable by derivation.
- Same-state requests remain side-effect-free no-ops.
- Lifecycle policy must not import timing policy or operational mechanisms.
- Timing-event policy may import lifecycle state identities only.
- Consumers use narrow query APIs, not raw canonical manifests.
- Compatibility facades remain until the convergence child proves their
  consumer inventories are empty.
- Policy children do not redesign the atomic move saga, timing arithmetic,
  healing algorithms, GitHub mutation, guard execution, force, supersede,
  review, or close orchestration.
- Every agent-callable entry point has complete, compact, zero-side-effect help.
- Unknown-state bootstrap remains fail-open where current behavior requires it.
- Legacy timing and marker readers remain tolerant.
- Use isolated, seeded worktrees for implementation children.
- Each child performs its own JIT deep dive before writing code.
- Each child uses TDD and stops on undocumented behavior differences.
- Direct children execute sequentially in the dependency order below.
- Do not create #1006 grandchildren before its JIT audit milestone.
- Create and mutate GitHub issues only through sanctioned AITM workflows.

---

## 1. Delivery Graph

```text
#1005 State Engine Refactoring Epic
|
+-- C1 Foundation characterization and invariant matrix
|   |
|   `-- C2 Canonical lifecycle topology
|       |
|       `-- C3 Lifecycle history and action policies
|           |
|           `-- C4 Canonical timing-event policy
|               |
|               `-- C5 Agentic CLI contract and discoverability
|                   |
|                   `-- C6 Policy convergence and duplicate removal
|                       |
|                       `-- #1006 Operational Mechanisms Child Epic
|                           |
|                           +-- JIT architecture audit milestone
|                           `-- Evidence-derived grandchildren
```

No direct children run in parallel. Each child consumes interfaces and evidence
from its predecessor and therefore cannot be fully planned before predecessor
completion.

## 2. Story-Generation Contract

Generate C1-C6 as `sub-issue` shapes under #1005 using
`npx aitm create-issue --shape sub-issue --parent 1005`. Do not use direct
`gh issue create`.

Each child body must include:

- the exact title in this plan;
- the Scope and Acceptance Criteria from its story brief;
- `**Parent epic:** #1005`;
- `**Sequence:** Cn of 6`;
- `**Depends on:**` the predecessor issue, or `None` for C1;
- immutable `## Plan Metadata` references to the design, evidence register, this
  plan, and their reference commit;
- the standard Pickup Directive and Definition of Done rendered by AITM;
- label `refactor`;
- label `dx` in addition to `refactor` for C5.

The generated issues are Backlog stubs. Do not estimate, promote, deep-dive, or
implement them during story generation.

After C1-C6 exist:

- link existing #1006 as a sub-issue of #1005;
- retitle #1006 as specified in Section 9;
- apply labels `epic`, `refactor`, and `reliability`;
- replace its placeholder Scope and Acceptance Criteria with the Section 9
  brief while preserving hidden AITM markers;
- record C6 as its dependency;
- do not create grandchildren.

## 3. Common JIT Entry Protocol

Every child begins with these actions:

- [ ] Seed and verify an isolated child worktree from the immediate parent epic
      head.
- [ ] Bind the child as an agent role and read its Pickup Directive.
- [ ] Read the governing design, evidence register, epic plan, predecessor issue,
      predecessor commits, and predecessor tests.
- [ ] Re-run the predecessor's targeted tests before changing imports.
- [ ] Inventory current producers, consumers, facades, and exact behavior for the
      child scope.
- [ ] Map assigned evidence-register issues to named invariants and regression
      tests.
- [ ] Record any mismatch as implementation error, compatibility rule, blocking
      defect, or optional cleanup.
- [ ] Produce the child-level code plan with exact files, signatures, failing
      tests, commands, and expected results.
- [ ] Obtain the required Plan approval before implementation.

## 4. C1 - Foundation Characterization and Invariant Matrix

**Issue title:** `Characterize AITM state-engine policy and bug-bash invariants`

**Purpose:** Establish an executable baseline and a complete disposition matrix
before canonical authority is introduced.

**Primary files to inspect:**

- `scripts/task-tracker/state-machine.mjs`
- `scripts/task-tracker/states/index.mjs`
- `scripts/task-tracker/lib/stage-entry-markers.mjs`
- `scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs`
- `scripts/task-tracker/lib/verb-home-state-guard.mjs`
- `scripts/task-tracker/phase-events.mjs`
- `scripts/task-tracker/lib/timing-event-map.mjs`
- `scripts/task-tracker/command-manifest.mjs`
- `scripts/lib/self-doc.mjs`
- `bin/aitm-registry.mjs`

**Likely test locations:**

- `scripts/task-tracker/tests/unit/core/state-machine.test.mjs`
- `scripts/task-tracker/tests/unit/core/phase-events.test.mjs`
- `scripts/task-tracker/tests/unit/core/command-manifest.test.mjs`
- `scripts/task-tracker/lib/verb-home-state-guard.test.mjs`
- `scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs`
- new focused characterization tests under
  `scripts/task-tracker/tests/unit/lib/`

**Interfaces:**

- Consumes: current production behavior and the 53-row bug-bash register.
- Produces:
  - exact 8x8 executable, entry-history, and timing-history matrices;
  - exact action-home-state table;
  - exact timing-event catalog including parameterized, legacy, and retired
    events;
  - executable-entry-point classification inventory;
  - issue-to-invariant disposition matrix;
  - import/dependency baseline for later convergence checks.

**Scope for generated issue:**

Characterize current state-engine and agentic command behavior without moving
production authority. Add exhaustive matrix, vocabulary, eligibility,
entry-point classification, and bug-bash disposition tests. Produce machine
readable fixtures or exported test constants that later children can use as
their compatibility oracle.

**Acceptance Criteria:**

- [ ] All 64 lifecycle state pairs have explicit executable, entry-history, and
      timing-history expectations.
- [ ] Same-state no-op semantics and all reverse/history-only distinctions are
      pinned by tests.
- [ ] Action eligibility, promote delegation, demote, park, and bootstrap
      behavior are characterized.
- [ ] Every production timing emitter maps to a known exact or parameterized
      event rule.
- [ ] Every shipped executable entry point is classified as agent-callable or an
      explicit internal/excluded category.
- [ ] Every row in the bug-bash evidence register has one disposition and one
      regression owner.
- [ ] The characterization suite passes against pre-refactor production code.

**Required verification:**

```bash
node --test scripts/task-tracker/tests/unit/core/state-machine.test.mjs
node --test scripts/task-tracker/tests/unit/core/phase-events.test.mjs
node --test scripts/task-tracker/tests/unit/core/command-manifest.test.mjs
npm test
```

**Commit intent:** Use the generated child issue number with
`test(state-engine): characterize lifecycle policy invariants`.

## 5. C2 - Canonical Lifecycle Topology

**Issue title:** `Introduce canonical lifecycle topology and executable-transition queries`

**Purpose:** Establish lifecycle identity and executable topology as one
authority while preserving current import contracts.

**Files expected to be created:**

- `scripts/task-tracker/lib/lifecycle-policy/index.mjs`
- `scripts/task-tracker/lib/lifecycle-policy/states.mjs`
- `scripts/task-tracker/lib/lifecycle-policy/executable-transitions.mjs`

**Primary consumers to migrate or facade:**

- `scripts/task-tracker/state-machine.mjs`
- `scripts/task-tracker/states/index.mjs`
- `scripts/task-tracker/lib/move-state/policy.mjs`
- state/config mapping consumers identified by C1

**Interfaces:**

- Consumes: C1 characterization fixtures and dependency inventory.
- Produces:

```js
stateIds();
stateIndex(state);
forwardTarget(state);
backwardTargets(state);
validateExecutableTransition(from, to);
```

`validateExecutableTransition` must return a structured result that
distinguishes allowed edge, side-effect-free same-state no-op, unknown state,
and refused edge. The exact object shape is fixed in this child's JIT plan after
current caller contracts are inspected.

**Scope for generated issue:**

Create the canonical lifecycle-policy package for state identity, order,
configuration metadata, executable edges, and no-op semantics. Preserve
existing external imports through thin compatibility facades and migrate one
coherent runtime consumer family. Do not add history projections or action
policy yet.

**Acceptance Criteria:**

- [ ] One canonical source owns state IDs, order, config metadata, executable
      edges, and no-op semantics.
- [ ] Runtime transition validation reads only the executable projection.
- [ ] Existing `state-machine.mjs` callers retain their public contract through a
      facade.
- [ ] Existing `states/index.mjs` analysis behavior is preserved without making
      its non-executable edges authoritative.
- [ ] The C1 8x8 executable matrix passes unchanged.
- [ ] Lifecycle policy imports no timing or operational modules.

**Required verification:**

```bash
node --test scripts/task-tracker/tests/unit/core/state-machine.test.mjs
node --test scripts/task-tracker/tests/unit/core/lifecycle-integration.test.mjs
npm test
```

**Commit intent:** Use the generated child issue number with
`refactor(state-engine): centralize lifecycle topology`.

## 6. C3 - Lifecycle History and Action Policies

**Issue title:** `Centralize lifecycle history projections and action eligibility`

**Purpose:** Move marker/timing history projections and action/verb eligibility
behind named lifecycle-policy queries.

**Files expected to create or extend:**

- `scripts/task-tracker/lib/lifecycle-policy/history.mjs`
- `scripts/task-tracker/lib/lifecycle-policy/actions.mjs`
- `scripts/task-tracker/lib/lifecycle-policy/index.mjs`

**Primary consumers:**

- `scripts/task-tracker/lib/stage-entry-markers.mjs`
- `scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs`
- `scripts/task-tracker/lib/verb-home-state-guard.mjs`
- `scripts/task-tracker/verbs/promote.mjs`
- `scripts/task-tracker/verbs/demote.mjs`
- `scripts/task-tracker/verbs/park.mjs`
- guard and activity-state list consumers identified by C1

**Interfaces:**

- Consumes: C2 state identity and executable queries.
- Produces:

```js
isEntryHistoryEdge(from, to);
isTimingHistoryEdge(from, to);
actionPolicyFor(action);
```

The JIT plan must define the structured action-policy result for known-allowed,
known-refused, and unknown-state bootstrap behavior.

**Scope for generated issue:**

Add named entry-history and timing-history projections plus action eligibility
and promote/demote/park descriptors. Migrate marker validation, timing sequence
topology, home-state guards, and verb policy consumers without changing
operational algorithms.

**Acceptance Criteria:**

- [ ] Executable, entry-history, and timing-history projections remain
      independently queryable.
- [ ] All non-self executable edges are accepted by required history
      projections.
- [ ] History-only edges never authorize runtime movement.
- [ ] `test`, `review`, and `close` home-state behavior is unchanged.
- [ ] Unknown-state bootstrap remains fail-open where currently required.
- [ ] Promote delegation and demote/park eligibility match C1 characterization.
- [ ] Regressions assigned from #845, #848, #931, #997, #998, #999, and #1001
      pass.

**Required verification:**

```bash
node --test scripts/task-tracker/tests/unit/core/state-machine.test.mjs
node --test scripts/task-tracker/lib/verb-home-state-guard.test.mjs
node --test scripts/task-tracker/tests/slow/verbs/promote-verb.test.mjs
node --test scripts/task-tracker/verbs/demote.test.mjs
node --test scripts/task-tracker/verbs/park.test.mjs
npm test
```

**Commit intent:** Use the generated child issue number with
`refactor(state-engine): centralize history and action policy`.

## 7. C4 - Canonical Timing-Event Policy

**Issue title:** `Introduce canonical timing-event vocabulary and producer-reader invariants`

**Purpose:** Establish one event catalog for lifecycle, audit, departure,
re-engagement, parameterized, legacy, and retired timing events.

**Files expected to be created:**

- `scripts/task-tracker/lib/timing-events/index.mjs`
- `scripts/task-tracker/lib/timing-events/catalog.mjs`
- `scripts/task-tracker/lib/timing-events/parameterized.mjs`
- `scripts/task-tracker/lib/timing-events/legacy.mjs`

**Primary consumers:**

- `scripts/task-tracker/lib/phase-events.mjs`
- `scripts/task-tracker/lib/timing-event-map.mjs`
- `scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs`
- production event emitters identified by C1
- timing healers as readers only, without changing their algorithms

**Interfaces:**

- Consumes: C2/C3 lifecycle state identities and history-stage association.
- Produces:

```js
describeTimingEvent(event);
isKnownTimingEvent(event);
classifyTimingEvent(event);
stageOfTimingEvent(event);
isRetiredTimingEvent(event);
```

**Scope for generated issue:**

Create the canonical timing-event package and migrate event producers and strict
readers to it. Prove every production emitter is accepted by the strict reader,
parameterized grammars are validated, and legacy/retired events remain
distinguishable. Do not change timing arithmetic, span recovery, or healing
algorithms.

**Acceptance Criteria:**

- [ ] Every exact event has one canonical descriptor and classification.
- [ ] Parameterized event families accept valid payloads and reject invalid
      payloads.
- [ ] Every production emitter produces an event accepted by the strict reader.
- [ ] Legacy aliases remain readable and retired events cannot be newly emitted.
- [ ] Audit events are not misclassified as lifecycle phases.
- [ ] Existing phase/timing public imports remain available through facades.
- [ ] Regressions assigned from #904, #972, #981, #983, #996, #1002, and #1003
      pass without timing arithmetic changes.

**Required verification:**

```bash
node --test scripts/task-tracker/tests/unit/core/phase-events.test.mjs
node --test scripts/task-tracker/lib/timing-event-map.test.mjs
node --test scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs
npm test
```

**Commit intent:** Use the generated child issue number with
`refactor(timing): centralize event vocabulary`.

## 8. C5 - Agentic CLI Contract and Discoverability

**Issue title:** `Enforce complete agentic CLI help and command-surface discovery`

**Purpose:** Make every agent-callable command self-documenting and make
unclassified executable entry points fail CI.

**Primary files:**

- `scripts/task-tracker/command-manifest.mjs`
- `scripts/task-tracker/verbs/help-data.mjs`
- `scripts/task-tracker/verbs/help.mjs`
- `scripts/lib/self-doc.mjs`
- `bin/aitm-registry.mjs`
- `bin/aitm.mjs`
- `bin/cli.mjs`

**Primary tests:**

- `scripts/task-tracker/tests/unit/core/command-manifest.test.mjs`
- `scripts/task-tracker/tests/unit/core/cli-help-flag.test.mjs`
- `scripts/task-tracker/tests/slow/lib/aitm-dispatcher.test.mjs`
- new executable-entry-point classification audit

**Interfaces:**

- Consumes: C3 lifecycle/action queries and C4 event vocabulary for accurate
  state, gate, and event descriptions.
- Produces:
  - normalized command metadata schema;
  - aggregate agent-command catalog;
  - explicit exclusion inventory;
  - side-effect-free help probes for all agent-callable commands.

**Scope for generated issue:**

Inventory every shebang, npm binary, executable file, and `process.argv` main
entry point. Normalize public command metadata to include purpose, usage,
arguments, preconditions, effects, output, exit codes, examples, and related
commands. Ensure aggregate and detailed help render from canonical records and
exit before configuration, network, locks, or mutation.

**Acceptance Criteria:**

- [ ] Every executable entry point has exactly one public or excluded
      classification.
- [ ] Every public npm binary and live maintenance/migration command supports
      direct `--help` and `-h`.
- [ ] Routed commands support equivalent `help`, `?`, `--help`, and `-h` forms.
- [ ] Every agent-callable command appears in the aggregate catalog.
- [ ] Every help record satisfies the required metadata schema.
- [ ] Help exits `0` before config, network, locks, binding, or mutation.
- [ ] Unknown commands return the usage-error code with compact aggregate help.
- [ ] Non-TTY output contains no ANSI escapes.
- [ ] Adding an executable entry point without classification/help fails CI.
- [ ] CLI evidence assigned from #854, #879, and #964 remains preserved.

**Required verification:**

```bash
node --test scripts/task-tracker/tests/unit/core/command-manifest.test.mjs
node --test scripts/task-tracker/tests/unit/core/cli-help-flag.test.mjs
node --test scripts/task-tracker/tests/slow/lib/aitm-dispatcher.test.mjs
npm test
```

**Commit intent:** Use the generated child issue number with
`refactor(cli): enforce agentic help completeness`.

## 9. C6 - Policy Convergence and Duplicate Removal

**Issue title:** `Converge state-engine consumers and remove duplicate policy authorities`

**Purpose:** Complete consumer migration, remove empty facades, and prove the
target dependency graph and authority boundaries.

**Files:** Determined from C1's inventory and updated by C2-C5. The JIT plan must
name every remaining facade, consumer, duplicate literal, and removal.

**Interfaces:**

- Consumes: all C1-C5 policy packages, catalogs, facades, inventories, and tests.
- Produces:
  - lifecycle policy as sole authority for approved lifecycle concepts;
  - timing-events package as sole authority for event vocabulary;
  - agent-command catalog as complete command/help inventory;
  - zero-consumer facade report;
  - duplicate-policy scan;
  - dependency-boundary proof;
  - milestone evidence allowing #1006 to start.

**Scope for generated issue:**

Migrate all remaining known consumers to narrow policy or command-catalog
queries. Remove compatibility facades only after import scans prove no
consumers. Add structural audits that reject duplicate state arrays, edge sets,
event catalogs, action tables, and unclassified executable entry points.

**Acceptance Criteria:**

- [ ] All C1 inventory entries have a final owner and consumer status.
- [ ] Lifecycle and timing-event packages are the sole approved authorities.
- [ ] No production consumer imports raw canonical manifests.
- [ ] Every removed facade has a zero-consumer import scan.
- [ ] Duplicate state, edge, action, event, and CLI metadata scans pass.
- [ ] Lifecycle policy has no timing or operational dependency.
- [ ] Timing events depend only on approved lifecycle identities.
- [ ] All assigned bug-bash regressions and the full repository suite pass.
- [ ] #1006 entry criteria and audit inputs are recorded in its issue body.

**Required verification:**

```bash
npm run format:check
npm run lint
npm test
npm run test:slow
git diff --check
```

**Commit intent:** Use the generated child issue number with
`refactor(state-engine): complete policy convergence`.

## 10. Existing #1006 - Operational Mechanisms Child Epic

**Issue title:** `Operational state-engine mechanisms JIT audit and refactoring`

**Parent:** #1005

**Depends on:** C6

**Purpose:** Audit mechanisms after policy convergence and create only
evidence-backed grandchildren.

**Scope for updated issue:**

After C6 proves policy convergence, perform a JIT architecture audit across:

1. state-move orchestration, mutation, sentinel, and post-commit behavior;
2. timing write/read arithmetic, interruption recovery, rollups, and healing;
3. guard bootstrap, registration, evaluation, and fail-open/fail-closed behavior;
4. review, close, park, force, supersede, and workflow orchestration;
5. marker/body parsing, normalization, reconciliation, and GitHub integration.

Use the bug-bash evidence register and C1 disposition matrix as inputs. Produce
a module-level disposition matrix and create grandchildren only for required
duplication/coupling or correctness defects. Separate optional cleanup into
independent backlog issues.

**Acceptance Criteria for updated issue:**

- [ ] C6 policy-convergence milestone evidence is present before audit work
      begins.
- [ ] Every assigned operational evidence row is mapped to concrete modules,
      coupling paths, tests, and current policy queries.
- [ ] Every audit finding is classified as already clean, targeted refactor,
      blocking defect, or optional cleanup.
- [ ] Required findings have focused grandchildren with explicit dependencies
      and immutable plan provenance.
- [ ] Optional cleanup is separated and does not hold #1005 open.
- [ ] The atomic move saga, timing arithmetic, historical compatibility, and
      guard contracts remain unchanged unless a separately approved defect
      requires correction.
- [ ] #1006 and all required grandchildren are complete before #1005 closes.

**No grandchildren are generated in the initial story-generation pass.**

## 11. Epic #1005 GitHub Contract

**Title:**

`State-engine policy consolidation and operational refactoring`

The epic-title helper will retain or add the repository's canonical
`[Epic]` prefix when children are linked.

**Labels:**

- `epic`
- `refactor`
- `reliability`
- `dx`

**Epic Scope:**

Consolidate AITM lifecycle topology, history projections, action eligibility,
timing-event vocabulary, and agentic CLI contracts behind authoritative query
interfaces. Preserve the complete 2026-07-19-and-later bug-bash evidence corpus,
then JIT-audit operational mechanisms under child epic #1006 after policy
convergence.

**Epic Acceptance Criteria:**

- [ ] C1-C6 are linked as sequential direct children with immutable design,
      evidence, and plan provenance.
- [ ] Existing #1006 is linked as a nested child epic and remains blocked by C6.
- [ ] Lifecycle policy is the sole approved authority for state identity,
      executable topology, history projections, and action eligibility.
- [ ] Timing-event policy is the sole approved authority for exact,
      parameterized, legacy, and retired event vocabulary.
- [ ] Every agent-callable entry point satisfies the help contract and
      completeness audit.
- [ ] Every bug-bash evidence row has a disposition and regression owner.
- [ ] #1006 completes its JIT audit and all required grandchildren.
- [ ] A final authority audit finds no unintended duplicate policy.
- [ ] Full format, lint, fast, and slow verification passes.

## 12. Story-Generation Verification

After updating #1005 and generating/linking children:

- [ ] Query #1005 and assert title and labels match Section 11.
- [ ] Query #1005 sub-issues and assert exactly C1-C6 plus #1006 are linked.
- [ ] Query each C1-C6 body and assert Parent, Sequence, Depends on, design,
      evidence, plan, and reference commit metadata.
- [ ] Assert every child is Backlog and has no estimate supplied at creation.
- [ ] Assert C1-C6 have `refactor`; C5 also has `dx`.
- [ ] Query #1006 and assert title, labels, parent, C6 dependency, Scope, and
      Acceptance Criteria.
- [ ] Assert #1006 has no grandchildren.
- [ ] Confirm no implementation source files changed.
- [ ] Confirm the worktree contains only intentional documentation changes, if
      any remain.

## 13. Cheaper-Model Handoff

The next model should:

1. Select C1 only.
2. Create and seed its isolated child worktree.
3. Bind as agent.
4. Follow the Common JIT Entry Protocol.
5. Write C1's code-level TDD implementation plan from current repository state.
6. Execute C1 through Review.
7. Integrate C1 through the epic branch workflow.
8. Update C2's JIT inputs with C1's actual interfaces and evidence.

It must not pre-plan implementation details for C2-C6 beyond their approved
boundaries and must not start #1006 before C6 convergence evidence exists.
