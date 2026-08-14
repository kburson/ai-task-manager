# Test-Lane Taxonomy

The contract that assigns every discovered `*.test.mjs` file to exactly one
**lane**. It is the written rule behind `scripts/task-tracker/lib/test-lanes.mjs`
(`laneOf`, `laneManifest`, `LANES`) and the thing the runner selects lanes from.

## Why a contract, not a directory accident

Historically a test's lane was implied by which directory the runner happened to
read it from (`readdirSync(tests/unit)`, `tests/integration`, `tests/slow`). Once
discovery went recursive (#872), the co-located tests that sit next to the source
they exercise belonged to no such directory and therefore to no lane — discovered,
but run nowhere. This contract makes lane a **rule applied to a path**, so every
discovered file — present and future — resolves to exactly one lane.

## The three lanes

| Lane          | Criterion                                               | Meaning                                                      |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `slow`        | a `slow` path segment under a `tests/` ancestor         | tests that each take ≥ ~2s; skipped by the fast develop loop |
| `integration` | an `integration` path segment under a `tests/` ancestor | tests that cross a module or process boundary                |
| `unit`        | **default** — every other discovered file               | one module in isolation, including co-located `foo.test.mjs` |

Classification is **total** and **mutually exclusive**, evaluated in order:

1. If a `slow` segment follows a `tests` segment → `slow`.
2. Else if an `integration` segment follows a `tests` segment → `integration`.
3. Else → `unit`.

Because `unit` is the catch-all default, **no discovered file is ever unassigned
or ambiguous**. Matching is on whole path segments, so a file merely _named_
`slow.test.mjs` is a unit test, not a slow one.

A co-located test is a unit test **by construction**: it lives beside the single
module it exercises. Promoting such a test to `integration` or `slow` means moving
it under the corresponding `tests/` directory — the path is the declaration.

## API

```js
import { LANES, laneOf, laneManifest } from '../lib/test-lanes.mjs';

laneOf('scripts/tests/slow/task-tracker/x.test.mjs'); // 'slow'
laneOf('scripts/tests/integration/task-tracker/y.test.mjs'); // 'integration'
laneOf('scripts/tests/unit/task-tracker/lib/foo.test.mjs'); // 'unit'

laneManifest();
// { unit: [...], integration: [...], slow: [...] }  — a partition of
// discoverTestFiles(): the union is the full discovered set, the lists disjoint.
```

## Relationship to the runner's run-lanes

The runner's `fast | slow | all` selection is a **view** over this taxonomy, not a
separate scheme: `fast = unit ∪ integration`, `slow = slow`, `all = every lane`.
The runner (migrated in #874) imports `laneManifest`/`laneOf` rather than
re-deriving lanes from a directory list, so discovery and lane assignment share
one source of truth and cannot drift.
