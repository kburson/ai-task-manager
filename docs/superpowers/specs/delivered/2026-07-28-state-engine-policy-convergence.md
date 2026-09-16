# State Engine Policy Convergence

**Story:** #1012, corrected by #1025

**Parent:** #1005

**Status:** C6 delivery evidence

## Final Authority Owners

| Decision                                          | Final owner                                                            | Consumer contract                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Ordered state identities and configuration keys   | `scripts/task-tracker/lib/lifecycle-policy/states.mjs`                 | `stateIds`, `stateIndex`, `stateConfigKey`, `normalizeStateId`                           |
| Executable topology                               | `scripts/task-tracker/lib/lifecycle-policy/executable-transitions.mjs` | `forwardTarget`, `backwardTargets`, `validateExecutableTransition`, `validateTransition` |
| Entry and timing history topology                 | `scripts/task-tracker/lib/lifecycle-policy/history.mjs`                | `isEntryHistoryEdge`, `isTimingHistoryEdge`                                              |
| Action eligibility and delegation                 | `scripts/task-tracker/lib/lifecycle-policy/actions.mjs`                | `actionPolicyFor`                                                                        |
| Timing-event vocabulary and strict classification | `scripts/task-tracker/lib/timing-events/`                              | descriptor, strict classification, stage, retired, and emit eligibility queries          |
| Historical-row accounting classification          | `scripts/task-tracker/lib/timing-events/index.mjs`                     | `classifyTimingEventForAccounting`                                                       |
| Command help, aliases, and discoverability        | `scripts/task-tracker/lib/command-surface/catalog.mjs`                 | `commandByName`, `agentCommandCatalog`, `taskVerbNames`                                  |
| Verb-to-handler routing identity                  | `scripts/task-tracker/lib/command-surface/routing.mjs`                 | `ROUTE_IDENTITIES`, `routeIdentityForVerb`                                               |
| Operational state objects and guards              | `scripts/task-tracker/states/` and `lib/guard-registry.mjs`            | Derived from lifecycle identities; no topology ownership                                 |

The complete C1 defect disposition, target, and regression-owner inventory remains
canonical in `2026-07-27-state-engine-bug-bash-evidence.md`, section
“Disposition and Regression Ownership.” Every row has a final disposition,
target owner, and regression owner.

## Consumer Migration

| Removed facade                                  | Migrated families                                                                                                                         | Destination                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `scripts/task-tracker/state-machine.mjs`        | GitHub live-state readers, board mover, lifecycle verbs, body/verifier gates, reconciliation, transition-plan, and characterization tests | `lib/lifecycle-policy/` narrow queries                     |
| `scripts/task-tracker/lib/timing-event-map.mjs` | runtime departure checks, timing rows/ladder arithmetic, event-policy and validator tests                                                 | `lib/timing-events/` strict or accounting-specific queries |
| `scripts/task-tracker/command-manifest.mjs`     | aggregate catalog, front registry, executable classification, help runtime, and command registration tests                                | command catalog plus routing identity query                |

Production consumers do not import the raw state descriptor array, exact timing
descriptor catalog, or routing identity array. They use package queries. The
command catalog is the one production assembler allowed to consume routing
identities.

## Zero-Consumer Facade Scan

`policy-convergence.test.mjs` walks JavaScript imports under `bin/` and
`scripts/`, asserts that all three scheduled facade files are absent, and
asserts that no import specifier resolves to any removed facade basename.

The same test delegates to `policy-authority-audit.mjs`, which rejects literal
production authorities for complete state identity, directional edges, action
eligibility, timing events, and CLI metadata outside explicit approved-owner
allowlists. One synthetic negative fixture per category proves that every
detector rejects a representative duplicate.

Issue #1025 removed the unused literal `BACKWARD_CHAIN` exposed by the expanded
audit. Backward movement remains owned by lifecycle-policy queries;
`policy-dependency-boundaries.test.mjs` independently verifies package import
directions and the catalog-to-routing seam.

Issue #1026 hardened the detectors against keyed objects, home-state maps, literal
event catalogs, keyed command dispatch maps, and lowercase declaration names.
Issue #1027 then removed the complete literal status/config projections that the
hardened state-identity scan exposed in project tethering and init repair.

## Allowed Subset Policies

Partial state sets remain only where they encode a decision different from
lifecycle identity or topology:

- verb home-state eligibility;
- source-edit activity permissions;
- stage-marker healing eligibility;
- review/test verifier thresholds;
- issue-kind and gate-specific operational subsets.

Historical fixtures may repeat expected identities, edges, events, or command
names as independent regression oracles. Tests and fixtures are not production
authorities and are excluded from the production duplicate-owner scan.

## Dependency Boundary Proof

- Lifecycle policy imports only sibling lifecycle-policy modules and has no
  timing, guard, verb, mover, or other operational dependency.
- Timing-event policy imports only sibling timing-event modules. Its descriptors
  carry lifecycle stage identities as data and do not import operational timing
  arithmetic or emitters.
- Command routing identity is data-only. The command catalog consumes it and
  owns aliases/help; the front registry consumes catalog queries and never raw
  routing data.

## #1006 Audit Inputs

Issue #1006 may begin its JIT operational-mechanism audit after #1012 is integrated
and its structural and repository suites pass. Its required evidence-register
inputs are:

`#819`, `#899`, `#902`, `#921`, `#927`, `#932`, `#947`, `#952`, `#953`,
`#963`, `#968`, `#972`, `#981`, `#983`, `#984`, `#994`, `#1003`, and
`#1004`.

The audit must classify findings as already clean, required refactoring
grandchildren, blocking defect grandchildren, or independent optional cleanup.
No grandchild is created before the JIT audit records its concrete module,
coupling path, expected owner, and regression evidence.
