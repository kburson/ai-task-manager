# Contributing

## Test Convention

Tests for the task-tracker subsystem live under `scripts/task-tracker/tests/`.
Provider tests are co-located under `scripts/providers/tests/`.

Every test file begins with `// @story #NNN` identifying the issue that owns it.
See [ADR 0001 — Test Tree Convention](docs/decisions/0001-test-tree-convention.md)
for the full rules: subdirectory taxonomy, per-file line cap, integration vs unit
boundary, and the split policy.
