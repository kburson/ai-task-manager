### Finding

The dependency and parity migration is complete at `ai-peer-review@0.2.0`, but AITM still ships a second executable and protocol implementation under `scripts/review/**`. The remaining production coupling is the `co-review` command registry/self-documentation, the main-worktree legacy-index resolver and migration guard, and an occupancy exception imported from `scripts/review/lib/index.mjs`. The published package deliberately exposes per-review read-only status but no global worktree-discovery authority. Recreating the sharing exception from package state would therefore be an unsafe new authority model.

The #1591 reconciliation receipt verifies zero active legacy rows, 137 tracked archive files, operation `sha256:cbff75990e0b9aa5505e492fe25e1c05894406832795ed3685644defb06f62d1`, and index digest `sha256:3c3235f7e486c01edbd233683cc67ace7f039843266f41b7da26cefcac765816`. `HEAD`, local `trunk`, and `origin/trunk` are all `0988881f5796d19c270e4121a851143bb5046a6f`, and the governed worktree is clean.

### Chosen boundary

Delete the legacy runtime and its one-shot reconciliation command. Remove both catalog entries and every AITM-only co-review fixture/test. Make AITM occupancy strictly exclusive per physical worktree; peer-review participants remain outside AITM task binding and use the package's own role and workspace controls. Retain `scripts/task-tracker/lib/peer-review-adapter.mjs` only for exact package configuration, public API access, start arguments, and non-authoritative status observations cached by `occupancy.mjs`. Do not add an AITM peer-review wrapper or import package internals.

### Files to change

- Delete `scripts/review/**`.
- Delete the `scripts/tests/fixtures/co-review-*.mjs` family and the superseded `scripts/tests/{unit,integration,slow}/**/co-review*.test.mjs` suites.
- Add `scripts/tests/integration/review/peer-review-decommission.test.mjs` and a legacy archive digest manifest outside `docs/superpowers/reviews/**`.
- Rewrite `scripts/tests/integration/review/peer-review-migration-guard.test.mjs` as terminal migration/archive and non-authoritative-cache coverage.
- Modify `scripts/task-tracker/lib/peer-review-adapter.mjs`, `scripts/task-tracker/lib/occupancy.mjs`, `scripts/task-tracker/lib/occupancy-lifecycle.mjs`, and `scripts/task-tracker/paths.mjs` to remove legacy discovery and sharing authority.
- Modify `scripts/task-tracker/lib/command-surface/entrypoints.mjs`, `scripts/lib/self-doc.mjs`, and their catalog tests to remove both legacy commands and hidden routing.
- Modify `scripts/task-tracker/test-impact-manifest.json`, test-tree/package baselines, package-boundary tests, provider/occupancy tests, and the two generic guard tests that currently bootstrap legacy reviewer claims.
- Update `README.md`, `docs/DESIGN.md`, `docs/guides/github-native-coordination.md`, `docs/guides/grok-provider.md`, `docs/guides/settings-guide.md`, and `skill/shared/rules/review.md` so the direct `peer-review` CLI is the only supported artifact-review path.

### Execution sequence

1. Add a structural decommission regression and archive hash manifest; run it RED against the still-present runtime and command.
2. Remove catalog/self-documentation routing, legacy index/migration code, and the worktree-sharing exception while preserving the package adapter/cache.
3. Delete the runtime and all superseded fixtures/tests; update surviving tests and corpus/package baselines.
4. Update operator and maintainer documentation without rewriting historical specifications, plans, research, postmortems, or review archives.
5. Run the structural, package parity, Phase 2, terminal migration, package-boundary, command-catalog, occupancy, and generic guard tests; repair only regressions caused by the removal.
6. Run exact package packing, lint, format, full fast/integration, and slow gates, then proceed through governed Test, Review, delivery, and close.

### Test additions and proof

`scripts/tests/integration/review/peer-review-decommission.test.mjs` will fail if the legacy tree, command/catalog/self-doc entries, AITM protocol schema ownership, production imports, compatibility wrapper, or prohibited documentation returns. `scripts/tests/fixtures/legacy-review-archive-sha256.json` will enumerate every currently tracked review archive by path and SHA-256; the terminal migration test will require all listed paths to remain byte-identical while allowing future additive package reviews.

The existing package parity and Phase 2 suites continue to execute the installed public CLI/API with the legacy tree absent. The rewritten migration suite proves the immutable archive manifest and non-authoritative occupancy cache. Existing package, command-surface, occupancy, guard, corpus-layout, lint, format, fast, integration, and slow suites provide regression coverage.

### Risks

- Test-tree metadata and packed-entry ceilings can become stale after large deletions; update them to measured post-removal values rather than weakening their checks.
- Generic AITM guard suites currently use legacy protocol fixtures only to prove claim invariance. Remove those obsolete cases while retaining their ordinary guard coverage.
- Historical documents legitimately describe the retired implementation. Structural scans must distinguish immutable historical evidence from supported current documentation.
- Deleting the legacy index resolver is safe only after the live #1591 verification remains at zero active rows; the verified operation and immutable archive manifest make that precondition auditable.

### Sibling work

None. The removal is one bounded defect repair and does not require another defect level.

### Dependency Map

Depends on: #1591 (reconciled the authoritative legacy index to zero active rows)

Blocks: #1546 and the remaining #1531 delivery reconciliation chain by completing the promised no-duplicate-runtime endpoint
