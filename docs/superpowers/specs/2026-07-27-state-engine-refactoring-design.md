# State Engine Refactoring Epic - Design

**Date:** 2026-07-27
**Epic:** #1005
**Child Epic:** #1006
**Status:** Approved architecture; pending implementation plan
**Topic:** Consolidate AITM lifecycle and timing-event policy behind stable query
interfaces, then use the converged policy layer to JIT-plan operational
mechanism refactoring.

---

## 1. Problem

AITM's state behavior is correct enough to operate, but its governing rules are
spread across several modules that independently encode related facts:

- lifecycle state identities and order;
- executable forward and reverse transitions;
- state-entry history transitions;
- timing-history transitions;
- action home-state eligibility;
- promote, demote, and park behavior;
- lifecycle timing events, audit events, and legacy aliases;
- agent-callable command inventory and help coverage.

The immediate defect chain #931, #996, #1001, and #1002 first exposed the cost
of that distribution, but it is not the complete basis for this design. The
companion `2026-07-27-state-engine-bug-bash-evidence.md` register collects 53
`bug` and `beta-defect` issues started on or after 2026-07-19, with an explicit
creation-date fallback where AITM Start metadata is absent. It covers lifecycle,
timing, evidence, mutation, CLI, and delivery-stability failures through #1004.

Each fix addressed a real producer, reader, workflow, or execution mismatch, and
the changes stacked positively. However, the corpus repeatedly had to discover
another independently maintained policy or mechanism surface. The risk is not
an infinite loop in the fixes themselves; it is continued drift because one
behavior must be updated in multiple places.

The current code has at least four different transition projections and multiple
event vocabularies:

| Policy surface             | Current owner                                            | Important distinction                                                     |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Executable lifecycle edges | `state-machine.mjs`                                      | Runtime authority, including side-effect-free self-loop requests          |
| State objects and chains   | `states/index.mjs`                                       | Contains reverse edges that are not all executable                        |
| Entry-marker history edges | `stage-entry-markers.mjs`                                | Includes history-only correction edges                                    |
| Timing-log sequence edges  | `timing-log-sequence.mjs`                                | Uses its own stage indices and reverse-edge set                           |
| Action eligibility         | `verb-home-state-guard.mjs` and verbs                    | Includes fail-open bootstrap behavior for unknown state                   |
| Move target policy         | `move-state/policy.mjs`                                  | Repeats state/config and forward/backward target facts                    |
| Timing-event vocabulary    | `phase-events.mjs`, `timing-event-map.mjs`, and emitters | Producer and strict-reader completeness is not proven                     |
| Agentic CLI metadata       | `command-manifest.mjs`, `self-doc.mjs`, and entry points | Existing help coverage does not prove every callable script is classified |

These are not interchangeable views. In particular:

- an edge accepted as historical evidence is not automatically executable;
- a reverse chain used for analysis is not automatically a legal demotion;
- a timing event can be valid audit evidence without being a lifecycle phase;
- a self-loop request can be accepted while remaining operationally
  side-effect-free.

The refactor must consolidate authority without flattening these distinctions.

## 2. Goals

1. Establish one authoritative lifecycle-policy package for state identities,
   executable topology, history projections, action eligibility, and verb
   movement descriptors.
2. Establish one authoritative timing-event package for current, parameterized,
   legacy, and retired event vocabulary.
3. Expose narrow query interfaces so consumers ask policy questions instead of
   importing and interpreting raw manifests.
4. Preserve and explicitly disposition every corrected behavior in the
   2026-07-19-and-later bug-bash evidence register.
5. Migrate consumers incrementally behind compatibility facades.
6. Remove duplicated policy only after every known consumer has converged.
7. Place the complete state-engine refactoring breadth under #1005 for
   traceability.
8. Adopt #1006 as a child epic and defer its grandchildren until a JIT
   architecture audit can use the completed policy interfaces as evidence.
9. Produce planning artifacts precise enough for a lower-cost model to generate
   GitHub stories without redesigning the architecture.
10. Make every agent-callable CLI entry point self-documenting and make the
    collective command surface complete, compact, and mechanically auditable.

## 3. Non-Goals

The policy-consolidation children do not:

- change the eight lifecycle states or their user-visible names;
- change executable transition behavior;
- change the atomic, idempotent state-movement saga;
- change GitHub board or issue-body mutation mechanics;
- change timing arithmetic, rollups, healing algorithms, or stored timing
  format;
- redesign guard execution or bootstrap behavior;
- redesign force, supersede, park, or close workflows;
- remove compatibility facades before all consumers have migrated;
- create #1006 grandchildren before its JIT architecture audit;
- turn historical acceptance rules into executable permissions;
- create GitHub stories during this design session;
- optimize help output for interactive human tutorials or marketing
  documentation.

Operational cleanup may later change internal organization under #1006, but only
after the policy layer has converged and its audit identifies evidence-backed
work.

## 4. Design Principles

### 4.1 One authority, multiple projections

There is one canonical lifecycle definition, but consumers receive purpose-built
projections. Executable, entry-history, and timing-history edge sets remain
separate named concepts.

### 4.2 Queries over data ownership

Consumers import query functions, not raw maps or arrays. This prevents a caller
from deriving an unintended transition rule from implementation details.

### 4.3 Behavior before structure

Characterization tests record current behavior before production imports move.
Structural cleanup is accepted only when those tests continue to pass.

### 4.4 Compatibility during convergence

Existing public module contracts remain available through temporary facades.
Each facade has a known consumer inventory and is removed only in the final
policy-convergence child.

### 4.5 One-way package dependency

Timing-event policy may reference lifecycle state identities. Lifecycle policy
must not import timing policy or any operational mechanism. This keeps the
policy graph acyclic.

### 4.6 JIT planning follows evidence

Direct children of #1005 are sequenced. Each child begins with a focused
deep-dive against the interfaces and findings delivered by its predecessor.
Issue #1006 does not receive speculative grandchildren in advance.

### 4.7 Agent-first command discovery

Agents must not need to inspect source code or guess syntax before invoking a
supported command. Help is part of the command contract, must be safe to request
in any repository state, and must optimize for fast machine scanning rather than
extended human-oriented explanation.

## 5. Target Architecture

### 5.1 Lifecycle policy package

Create:

`scripts/task-tracker/lib/lifecycle-policy/`

This package owns:

- canonical state IDs and ordering;
- state-to-configuration metadata;
- executable transition topology;
- self-loop request semantics;
- entry-marker history topology;
- timing-history topology;
- action home-state eligibility;
- promote delegation descriptors;
- demote and park eligibility/target descriptors.

The package exposes a narrow public API. Expected query shapes include:

```js
stateIds();
stateIndex(state);
validateExecutableTransition(from, to);
forwardTarget(state);
backwardTargets(state);
isEntryHistoryEdge(from, to);
isTimingHistoryEdge(from, to);
actionPolicyFor(action);
```

Names may be refined during the foundation child's JIT analysis, but the
semantic boundaries are fixed:

- callers cannot read a raw canonical manifest;
- executable validation reads only executable topology;
- history validators read their named projection;
- action eligibility is queried by action rather than reconstructed in verbs;
- unknown state handling remains explicit in the query result so callers can
  preserve bootstrap behavior.

### 5.2 Timing-event policy package

Create:

`scripts/task-tracker/lib/timing-events/`

This package owns:

- lifecycle phase event descriptors;
- audit and checkpoint event descriptors;
- departure and re-engagement events;
- parameterized event families such as `demoted:<state>`;
- supported legacy aliases;
- retired event vocabulary;
- event classification;
- optional lifecycle-stage association.

The package exposes queries such as:

```js
describeTimingEvent(event);
isKnownTimingEvent(event);
classifyTimingEvent(event);
stageOfTimingEvent(event);
isRetiredTimingEvent(event);
```

The package must distinguish:

- exact event names;
- parameterized event families and their grammar;
- tolerated legacy input;
- events prohibited from new emission;
- lifecycle events from non-lifecycle audit events.

Every production emitter must produce an event accepted by the strict reader.
Legacy readers remain tolerant where historical data requires it.

### 5.3 Operational consumers

The following remain consumers during policy consolidation:

- state-move saga and status mutation;
- entry-marker writing and healing;
- timing arithmetic and rollups;
- timing-log healing;
- GitHub board and issue-body mutation;
- guard execution and bootstrap;
- activity block-reason evaluation;
- source-edit gating;
- review, close, park, promote, and demote orchestration.

They may be migrated to policy queries, but their operational algorithms are not
redesigned in the policy children.

### 5.4 Agentic CLI contract

The existing `aitm` registry, command manifest, and self-documentation metadata
form the starting point. The refactor formalizes them as one auditable
agent-command surface.

Every executable JavaScript entry point shipped by the package must be
classified as exactly one of:

- agent-callable verb;
- agent-callable standalone command;
- package lifecycle CLI command;
- live repository-maintenance or migration command;
- internal hook or guard entry point;
- internal library or orchestration entry point;
- test, fixture, or retired one-shot entry point.

The classification must be explicit. A shebang, npm `bin` declaration,
`process.argv` main block, or executable file that is absent from both the
agent-callable catalog and the documented exclusion inventory fails the audit.
Live maintenance and migration entry points are agent-callable even when they
are not installed as npm binaries; they must either route through `aitm` or have
a documented reason for direct-only invocation.

Every agent-callable verb, standalone command, package lifecycle command, and
live maintenance or migration command must provide:

- `--help` and `-h` through direct invocation;
- `help`, `?`, `--help`, and `-h` through the `aitm` orchestrator;
- exit code `0` for a help request;
- no configuration requirement, network access, lock acquisition, task bind,
  file mutation, issue mutation, or board mutation before help exits;
- a stable, compact, plain-text response.

Each command's help metadata must contain:

| Field            | Required content                                                     |
| ---------------- | -------------------------------------------------------------------- |
| Purpose          | One-sentence operational result                                      |
| Usage            | Canonical `npx aitm ...` invocation                                  |
| Arguments        | Positionals, flags, allowed values, and defaults                     |
| Preconditions    | Required task state, configuration, credentials, or files            |
| Effects          | Mutations, dry-run behavior, and idempotency expectations            |
| Output           | Stable stdout result or token shape; stderr diagnostics              |
| Exit codes       | Success, usage, gate refusal, and command-specific failures          |
| Examples         | At least one minimal valid invocation                                |
| Related commands | Preferred predecessor, successor, or safer alternative when relevant |

Renderers may omit empty optional sections, but the catalog schema and tests
must not permit required semantics to be silently absent.

The collective `npx aitm help` output must:

- enumerate every agent-callable verb, standalone command, package lifecycle
  command, and live maintenance or migration command;
- group commands by operational purpose;
- include a one-line synopsis for selection;
- advertise the command's canonical detail-help invocation;
- avoid implementation file paths and duplicate long-form help;
- remain free of ANSI escapes when stdout is not a TTY.

For commands routed through `aitm`, `npx aitm help <command>` and
`npx aitm <command> help` must resolve to the same canonical metadata.
Direct-only package lifecycle or maintenance commands must expose the same
record through their canonical `--help` invocation. Unknown commands return the
usage-error exit code and print the compact aggregate inventory on stderr.

Help metadata is a runtime contract, not parallel prose. Routing, aggregate
listing, detailed rendering, and completeness tests must read the same
canonical records.

## 6. Policy Semantics to Preserve

### 6.1 Canonical states

The canonical ordered states remain:

```text
backlog -> on-deck -> refine -> plan -> develop -> test -> review -> done
```

### 6.2 Executable transitions

Forward executable edges remain:

```text
backlog -> on-deck
on-deck -> refine
refine -> plan
plan -> develop
develop -> test
test -> review
review -> done
```

Reverse executable edges remain:

```text
on-deck -> backlog
refine -> backlog
plan -> backlog
test -> develop
review -> develop
review -> test
```

A same-state request remains a valid, side-effect-free no-op. It must not
inherit entry, timing, marker, or mutation side effects merely because the
request validates.

### 6.3 History projections

Entry-marker history accepts all non-self executable edges plus these
history-only correction edges:

```text
develop -> plan
develop -> refine
plan -> refine
```

Timing-history acceptance remains independently characterized. It includes the
currently supported reverse-history behavior, including `done -> test`, without
granting that edge to executable movement unless a later separately approved
behavior change explicitly does so.

The invariant is:

```text
non-self executable edges are a subset of accepted history edges
```

The inverse is intentionally false.

### 6.4 Action home states

Current action eligibility remains:

| Action   | Allowed states              |
| -------- | --------------------------- |
| `test`   | `develop`, `test`, `review` |
| `review` | `test`, `review`            |
| `close`  | `review`                    |

Unknown state continues to fail open for bootstrap compatibility. Known,
disallowed states continue to fail closed.

Promote's action delegation, demote eligibility, and park eligibility retain
their current behavior. The refactor centralizes their descriptors; it does not
broaden them.

### 6.5 Timing events

The event policy must preserve:

- lifecycle phase events and their stage association;
- audit events including demotion, out-of-band movement, gate refusal, and
  update checkpoints;
- parameterized `demoted:<state>` validation;
- supported legacy aliases used by historical logs;
- retired vocabulary used for detection or healing;
- reader tolerance required by existing fixtures.

The exact catalog is captured by characterization tests before migration. The
catalog must include every bare or parameterized event emitted by production
code, including warning and dirty-close audit paths.

## 7. Epic Structure

Issue #1005 is the top-level State Engine Refactoring Epic:

```text
#1005 State Engine Refactoring Epic
|
+-- Foundation characterization and invariants
+-- Canonical lifecycle topology
+-- Lifecycle history and action policies
+-- Canonical timing-event policy
+-- Agentic CLI contract and discoverability
+-- Policy convergence and duplicate removal
`-- #1006 Operational Mechanisms Child Epic
    |
    +-- JIT architecture audit milestone
    `-- Evidence-derived grandchildren
```

The named policy items are targeted children of #1005. Their final story titles
and issue numbers are generated later from the implementation plan.

Issue #1006 is adopted as a child epic rather than deconstructed now. This preserves
the full refactoring breadth under one traceable parent while avoiding
prematurely specified operational stories.

## 8. Sequential Delivery Strategy

The direct policy children execute in order.

### 8.1 Foundation characterization and invariants

Inventory every policy producer and consumer. Build exhaustive behavioral tests
for current topology, event vocabulary, action eligibility, and compatibility
contracts. Establish dependency-boundary tests before introducing authority.
Create the issue-to-invariant disposition matrix for every row in the bug-bash
evidence register before any authority migration begins.

### 8.2 Canonical lifecycle topology

Introduce the lifecycle-policy package for state identity, order,
configuration metadata, executable transitions, and no-op semantics. Preserve
old imports through compatibility facades and migrate the first consumer family.

### 8.3 Lifecycle history and action policies

Add named history projections and action/verb descriptors. Migrate marker
validation, timing sequence topology, home-state guards, promote delegation,
demote, park, and related state-list consumers without changing behavior.

### 8.4 Canonical timing-event policy

Introduce the timing-events package. Characterize exact and parameterized
events, migrate producers and readers, and prove producer-reader completeness.
Preserve legacy and retired-event handling.

### 8.5 Agentic CLI contract and discoverability

Inventory and classify every executable entry point. Normalize verb,
standalone-script, and package lifecycle help metadata to the approved schema.
Migrate aggregate and per-command rendering to canonical records. Add static
completeness checks and side-effect-free runtime probes for every agent-callable
command.

This child follows lifecycle and timing-event policy so state preconditions,
gate behavior, and lifecycle vocabulary in help are derived from the converged
interfaces rather than copied again.

### 8.6 Policy convergence and duplicate removal

Migrate remaining consumers, run import and duplicate-policy scans, remove
facades only when their consumer inventories are empty, and prove package
dependency direction.

### 8.7 #1006 operational JIT audit

After policy convergence, inspect operational mechanisms against the new
interfaces. Produce a disposition matrix and create only the grandchildren
justified by evidence.

Each child begins by validating the predecessor's actual interfaces and test
evidence. If the implementation differs from the planned shape while honoring
the approved boundaries, the child updates its JIT plan rather than silently
reinterpreting the epic.

## 9. Standard Migration Pattern

Every policy migration follows this order:

1. Characterize the current behavior and consumer inventory.
2. Introduce or extend a narrow policy interface.
3. Keep the old contract as a compatibility facade.
4. Migrate one coherent consumer family.
5. Run targeted and regression tests.
6. Scan imports and duplicated literals for missed consumers.
7. Remove the facade only in the convergence child after its inventory is empty.

No child combines authority introduction, broad consumer migration, and facade
removal in one unreviewable change.

## 10. #1006 JIT Architecture Audit

Issue #1006 begins only after the policy-convergence acceptance criteria pass. Its
first milestone is an architecture audit across four areas:

1. state-move orchestration, mutation, and post-commit behavior;
2. timing write, read, arithmetic, and healing mechanisms;
3. guard bootstrap, registration, and execution mechanisms;
4. review, close, park, force, supersede, and related workflow orchestration.

For each finding, the audit records:

| Disposition                      | Result                          |
| -------------------------------- | ------------------------------- |
| Already clean                    | No new story                    |
| Required duplication or coupling | Targeted refactoring grandchild |
| Correctness defect               | Blocking defect grandchild      |
| Optional cleanup                 | Independent backlog item        |

Required #1006 grandchildren remain children of #1006 and therefore trace to
issue #1005. Optional cleanup is explicitly separated so it cannot indefinitely hold
the epic open.

The audit must cite concrete modules, duplicated decisions, coupling paths,
tests, and expected post-refactor ownership. A broad "clean up state engine"
story is not an acceptable output.

## 11. Failure Handling and Scope Control

Implementation stops for classification when any of these occurs:

- a characterization test disagrees with observed production behavior;
- two current modules encode materially different versions of a supposedly
  shared edge;
- an emitted timing event is absent from the strict reader;
- a facade has an untracked consumer;
- historical fixtures become invalid;
- the package dependency graph becomes cyclic;
- a migration requires operational behavior to change.

Classify the finding as one of:

1. implementation error within the active child;
2. compatibility rule that must be encoded explicitly;
3. new correctness defect that blocks the active child;
4. optional cleanup outside the active child's acceptance criteria.

Do not expand a child informally. Record the classification and update the issue
dependency graph through the sanctioned AITM workflow.

## 12. Verification Strategy

### 12.1 Lifecycle matrix

Test all 64 ordered pairs in the eight-state matrix. Assert:

- exact executable edges;
- exact same-state no-op behavior;
- exact entry-history edges;
- exact timing-history edges;
- rejection of every unlisted edge;
- executable non-self edges are accepted by required history projections.

### 12.2 Action and verb policy

Test:

- `test`, `review`, and `close` home-state tables;
- unknown-state bootstrap fail-open behavior;
- promote delegation compatibility;
- demote and park rules remain subsets of approved executable behavior;
- state-to-configuration metadata remains complete.

### 12.3 Timing-event completeness

Test:

- every production event emitter is accepted by the strict reader;
- every exact event has a classification;
- every parameterized family accepts valid and rejects invalid payloads;
- lifecycle stage association is correct where present;
- legacy aliases remain readable;
- retired events cannot be newly emitted;
- audit events are not misclassified as lifecycle phases.

### 12.4 Regression coverage

The regression basis is the complete companion bug-bash evidence register, not
only the #931 blocking chain. The foundation child must map every registered
defect to:

- a named invariant and existing regression test;
- a new characterization test when no durable regression exists;
- a #1006 audit input when the behavior belongs to an operational mechanism;
- a verification-only constraint for test, CI, package, or delivery stability;
- or an explicit independent-concern disposition.

At minimum, matrix tests must retain the lifecycle and timing regressions from
issues `#845`, `#848`, `#904`, `#931`, `#972`, `#981`, `#983`, `#996`,
`#997`, `#998`, `#999`, `#1001`, `#1002`, and `#1003`. Gate and mechanism
consumers must preserve the relevant evidence-register regressions assigned to
their child.

### 12.5 Structural verification

Before each child reaches Review:

- run its targeted unit and integration tests;
- run import scans for migrated facades;
- scan for duplicated state arrays, edge sets, and event catalogs;
- verify lifecycle policy has no dependency on timing or operational modules;
- verify timing-event policy depends only on approved lifecycle identities;
- run the repository's full test suite.

### 12.6 Agentic CLI verification

Test:

- every shipped executable entry point has one explicit classification;
- every public npm binary and live maintenance or migration entry point
  satisfies the help contract;
- every agent-callable command appears in aggregate help;
- every aggregate command resolves to detailed help;
- direct `--help` and `-h` work for every callable script;
- orchestrated `help`, `?`, `--help`, and `-h` forms are equivalent;
- every help probe exits `0` before configuration, network, lock, or mutation
  adapters are touched;
- each help record satisfies the required metadata schema;
- unknown commands exit with the usage-error code and a compact inventory;
- non-TTY output contains no ANSI escapes;
- command aliases resolve to canonical metadata instead of duplicating it;
- command additions fail CI unless routing, classification, and help metadata
  are complete.

## 13. Acceptance Criteria

The policy portion of #1005 is complete when:

- lifecycle policy is the sole authority for the approved lifecycle concepts;
- timing-events policy is the sole authority for timing-event vocabulary;
- all production consumers use narrow queries or documented compatibility
  adapters;
- compatibility facades scheduled for removal have no consumers and are gone;
- executable, entry-history, and timing-history semantics remain distinct;
- producer-reader event completeness is enforced by tests;
- every bug-bash evidence row has a documented disposition and regression
  owner;
- all regression tests assigned to the completed children pass;
- duplicate-policy and dependency-boundary scans pass;
- all agent-callable entry points satisfy the help contract and completeness
  audit;
- no operational behavior changed without a separately approved story.

Issue #1005 as a whole is complete only when:

- the policy portion is complete;
- #1006's JIT audit is complete;
- every required #1006 grandchild is complete;
- optional cleanup has been explicitly separated;
- a final authority audit finds no unintended duplicate state or event policy.

## 14. Planning and Story-Generation Handoff

The implementation plan derived from this specification will define:

- one story-generation brief for each direct policy child;
- one story-generation brief for the agentic CLI contract child;
- a complete mapping from the companion bug-bash evidence register to direct
  children, #1006 audit areas, verification constraints, or independent
  concerns;
- sequential dependencies and JIT entry questions;
- exact in-scope and out-of-scope boundaries;
- required evidence, tests, and acceptance criteria;
- the milestone contract that allows #1006 to begin;
- the #1006 audit template and grandchild creation rules;
- immutable references back to this specification and the implementation plan.

A lower-cost model may translate those briefs into GitHub epic/child bodies, but
it must not redesign package ownership, flatten policy projections, pre-create
issue #1006 grandchildren, or begin implementation. All stories must be created with
the repository's sanctioned issue-creation workflow and include durable plan
provenance.

## 15. Decision Record

- **Chosen:** one top-level epic for the full state-engine refactoring breadth.
- **Chosen:** two leaf policy packages, lifecycle policy and timing-event policy.
- **Chosen:** narrow query interfaces instead of shared raw manifests.
- **Chosen:** sequential targeted children with JIT deep dives.
- **Chosen:** #1006 as a child epic with evidence-derived grandchildren.
- **Chosen:** compatibility facades during migration.
- **Chosen:** an explicit inventory and compact self-documentation contract for
  every agent-callable CLI entry point.
- **Chosen:** help requests are zero-side-effect operations that work before
  configuration or repository initialization.
- **Rejected:** one large implementation story followed by an unstructured
  re-analysis.
- **Rejected:** deconstructing #1006 before policy convergence.
- **Rejected:** treating all transition projections as one edge set.
- **Rejected:** mixing operational algorithm changes into policy consolidation.
- **Deferred:** exact #1006 grandchildren until its JIT audit milestone.

## 16. Relationship to Existing Designs

This design complements rather than supersedes:

- `2026-07-08-atomic-idempotent-state-movement-design.md`, which owns atomic
  move orchestration, verification, and mutation semantics;
- `2026-07-14-timing-model-v2-design.md`, which owns timing arithmetic, row
  semantics, and healing behavior.

The new packages centralize the policy those mechanisms consume. Any proposed
change to the existing saga or timing model requires a separate, explicit
design decision under #1006 or a correctness defect.
