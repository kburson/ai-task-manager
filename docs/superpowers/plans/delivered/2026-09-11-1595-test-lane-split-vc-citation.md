# #1595 Test Lane-Split VC Citation Repair Plan

## Goal

Make the existing `npm run test:all` migration preserve a valid, resolvable
Acceptance Criteria citation graph when it tombstones the retired command.

## Implementation

1. Add a failing case to
   `scripts/tests/unit/task-tracker/verbs/test-verb-lane-split-migration.test.mjs`
   with an AC that cites the retired command alongside an unrelated live VC and
   carries existing evidence properties.
2. In `scripts/task-tracker/lib/tests-lane-split.mjs`, identify the live IDs for
   `npm test` and `npm run test:slow` after append/reuse, then replace the exact
   retired citation token inside consolidated `aitm-verified` markers.
3. Preserve unrelated citation order and properties, deduplicate replacement
   IDs, retain the tombstone, and prove a second migration is byte-identical.
4. Run the focused test, affected verification, lint, format, fast, and slow
   lanes. Deliver the defect to trunk, merge updated trunk into #1592, and
   resume #1592's Test gate.

## Boundaries

No lifecycle bypass, raw issue-body mutation, historical body rewrite, command
policy change, or deeper defect is included.
