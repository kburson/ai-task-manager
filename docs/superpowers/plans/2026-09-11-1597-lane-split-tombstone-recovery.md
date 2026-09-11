# #1597 Lane-Split Tombstone Recovery Implementation Plan

## Goal

Make Test migration recover a body that an older runtime already left in a partially migrated state: the aggregate verifier is a tombstone, the fast and slow lane commands are live, and an Acceptance Criterion still cites the retired ID.

## Root cause

`migrateVcMirror` returns immediately when no live `npm run test:all` command exists. It therefore never inspects a matching tombstone or retargets citations when the live command was removed by an earlier migration.

## Files to edit

- `scripts/task-tracker/lib/tests-lane-split.mjs`
- `scripts/tests/unit/task-tracker/verbs/test-verb-lane-split-migration.test.mjs`

## Implementation sequence

1. Add a focused test fixture matching #1592 after its pre-#1595 partial migration: tombstone ID 3, live fast/slow IDs 6 and 7, preserved lint/format IDs, and an AC that cites `vc:3 vc:4 vc:5` with existing evidence properties.
2. Assert RED behavior: the current transform leaves the dangling tombstone citation unchanged.
3. Extend the pure migration transform to parse only an exact `npm run test:all` tombstone when no live aggregate entry exists.
4. Resolve both replacement lane IDs from the live Verification Commands section. Retarget the retired token using the existing exact-token helper without allocating or rewriting commands.
5. Preserve unrelated citation order and marker properties, and assert a second pass is byte-identical.
6. Run focused, affected, lint, formatting, fast, and slow verification at the committed SHA before Review and delivery.

## Test addition

Extend `scripts/tests/unit/task-tracker/verbs/test-verb-lane-split-migration.test.mjs` with a named regression proving pre-existing tombstone recovery, property preservation, no new VC allocation, and idempotence.

## Risks and controls

- Multiple aggregate tombstones could make recovery ambiguous. Refuse to rewrite unless exactly one matching tombstone and both unique live lane IDs resolve.
- Broad text replacement could corrupt prose or tombstone records. Reuse the consolidated proof-marker transform, which replaces only exact `vc:N` tokens inside `vc-list`.
- A successful recovery must not change command order or IDs. Assert the entire Verification Commands block remains unchanged.

## Dependency map

Depends on: #1595 for the exact-token citation rewrite helper and atomic migration path.

Blocks: #1592 by restoring its exact-SHA Develop-to-Test transition.

No child or deeper defect is permitted or required.
