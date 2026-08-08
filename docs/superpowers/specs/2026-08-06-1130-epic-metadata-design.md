# Epic Metadata Reconciliation Design

## Problem

AITM currently represents Epic status in four carriers: the hidden issue-kind marker, the kind-filtered Definition of Done, the `epic` label, and the `🧑‍🧒‍🧒 [Epic]` title prefix. Explicit kind conversion updates only the first two, while first-child linking updates only the title. The label-driven title workflow does not recognize `epic`, so it removes the prefix that linking just added.

## Decision

Create one idempotent Epic metadata reconciliation boundary with a pure desired-state planner and injected I/O adapters. Both explicit `kind epic` conversion and first-child linking will call this boundary. The label workflow will reuse the pure planner so `opened`, `edited`, `labeled`, and `unlabeled` events converge drift instead of reversing conversion.

The canonical desired state is:

- body contains `aitm-issue-kind kind="epic"`;
- Functional DoD rows match the `epic` kind template while retaining applicable evidence;
- labels include exactly one case-insensitive `epic` label without replacing unrelated labels; and
- title contains exactly one canonical Epic prefix, which takes precedence over secondary kind-label prefixes.

GitHub does not offer a single transaction spanning body, labels, and title. The command boundary therefore provides logical atomicity: it reports success only after all carriers converge, fails closed on any carrier error, and recomputes from live state so retrying safely completes a partial operation without duplicates.

## Components

`scripts/gh/lib/epic-metadata.mjs` owns pure planning, body reconciliation, and I/O orchestration. `scripts/gh/lib/kind-prefix.mjs` exposes `epic` through the existing label-prefix authority. `scripts/gh/lib/epic-retitle.mjs` remains the first-child compatibility adapter. `scripts/task-tracker/verbs/kind.mjs` delegates explicit Epic conversion. The beta-report workflow consumes the shared planner for event-driven repair.

## Error Handling

Missing issue data, a missing repository `epic` label, or any failed body/label/title write is an error. No caller may print a success result after such a failure. Existing labels and body evidence are preserved. Re-entry reads current state and performs only missing writes.

## Verification

Tests cover pure four-carrier planning, mixed-label precedence, explicit conversion delegation, first-child convergence, repeated-call idempotency, and workflow repair on all configured issue events. Existing non-Epic title-prefix tests remain unchanged to prove compatibility.
