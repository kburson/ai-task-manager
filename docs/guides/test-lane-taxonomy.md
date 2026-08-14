# Test-Lane Taxonomy

The contract that assigns every discovered `*.test.mjs` file to exactly one
**lane**. It is the written rule behind `scripts/task-tracker/lib/test-lanes.mjs`
(`laneOf`, `laneManifest`, `LANES`) and the thing the runner selects lanes from.

## Why a contract, not a directory accident

Historically a test's lane was implied by which directory the runner happened to
read it from. Recursive discovery (#872) exposed co-located and domain-local tests
that belonged to no explicit lane. The canonical migration (#876) makes the lane a
strict declaration in every test path while discovery continues to scan all of
`scripts/`, so a misplaced file is reported instead of silently omitted.

## The three lanes

| Lane          | Required path prefix         | Meaning                                                                      |
| ------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `unit`        | `scripts/tests/unit/`        | one bounded module or feature, including isolated local Git/process fixtures |
| `integration` | `scripts/tests/integration/` | end-to-end coordination across repositories/remotes or live external systems |
| `slow`        | `scripts/tests/slow/`        | tests that each take ≥ ~2s; skipped by the fast develop loop                 |

Every path must match
`scripts/tests/<unit|integration|slow>/<source-relative-subtree>/<name>.test.mjs`.
The three lane prefixes are mutually exclusive, and the required lane segment makes
classification total only for valid canonical paths. `laneOf()` throws for every
other discovered test. Unit is never a default. Lane choice follows the behavior
under test: an isolated local Git repository, filesystem fixture, or real child
process may remain unit. `trunk-ref.integration.test.mjs` is integration because it
coordinates multiple repositories and a remote end to end, including clone, push,
fetch, and close-gate remote synchronization.

Co-located tests such as `scripts/gh/foo.test.mjs`, domain-local test roots such as
`scripts/providers/tests/`, and `.test.mjs` files in package-level support subtrees
are rejected. Move the file into the correct canonical lane; do not narrow discovery
or add an exception. Fixture-named directories are not an escape hatch: canonical
test discovery descends into `fixtures/` and `__fixtures__/` so the runner and audits
can reject any test-shaped file found there.

## API

```js
import { LANES, laneOf, laneManifest } from '../lib/test-lanes.mjs';

laneOf('scripts/tests/slow/task-tracker/x.test.mjs'); // 'slow'
laneOf('scripts/tests/integration/task-tracker/y.test.mjs'); // 'integration'
laneOf('scripts/tests/unit/task-tracker/lib/foo.test.mjs'); // 'unit'
laneOf('scripts/gh/foo.test.mjs'); // throws: outside the canonical tree

laneManifest();
// { unit: [...], integration: [...], slow: [...] }  — a partition of
// discoverTestFiles(): the union is the full discovered set, the lists disjoint.
// Any misplaced discovered test makes laneManifest() fail closed.
```

## Relationship to the runner's run-lanes

The runner's `fast | slow | all` selection is a **view** over this taxonomy, not a
separate scheme: `fast = unit ∪ integration`, `slow = slow`, `all = every lane`.
The runner (migrated in #874) imports `laneManifest`/`laneOf` rather than
re-deriving lanes from a directory list, so discovery and lane assignment share
one source of truth and cannot drift.
