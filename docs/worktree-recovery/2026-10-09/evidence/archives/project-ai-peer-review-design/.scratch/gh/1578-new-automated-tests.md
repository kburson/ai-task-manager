## New Automated Tests

- `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`
  - package-boundary: total entry count stays under the ceiling
  - package-boundary: runtime entry points are still shipped

The existing package-boundary cases were strengthened under #1578: the exact ceiling is now 779 and the shipped peer-review adapter is an explicit required entry.
