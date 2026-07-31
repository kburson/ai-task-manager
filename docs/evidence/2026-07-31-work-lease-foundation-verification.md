# Work-lease foundation verification evidence

Date: 2026-07-31

Issue: #1065

Foundation SHA: `9a1c9d59442c27096e93bf50685ce0de3e86f506`

This manifest records the bounded verification of the #1049 foundation. It
does not claim delivery of lifecycle work assigned to #1053 or #1054-#1066.

## Test inventory and partitions

The canonical discovery and taxonomy checks prove that `unit`, `integration`,
and `slow` are a disjoint partition and that their union contains every
discovered `*.test.mjs` file. The full fast runner executes the unit and
integration partitions; the slow runner executes the slow partition.

| Command                                                                                                                                 | Result                   |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `node --test scripts/task-tracker/tests/unit/meta/test-tree-layout.test.mjs scripts/task-tracker/tests/unit/lib/lane-taxonomy.test.mjs` | PASS — 11 tests          |
| `npm test`                                                                                                                              | PASS — bounded fast lane |
| `npm run test:slow`                                                                                                                     | PASS — 49 files          |

The governed Test-stage sandbox uses smaller canonical sections so each stays
under the unchanged 600-second ceiling while retaining the same exact union:

| Command                                              | Result                       |
| ---------------------------------------------------- | ---------------------------- |
| `node scripts/run-tests.mjs --lane unit --shard 1/4` | PASS — canonical unit shard  |
| `node scripts/run-tests.mjs --lane unit --shard 2/4` | PASS — canonical unit shard  |
| `node scripts/run-tests.mjs --lane unit --shard 3/4` | PASS — canonical unit shard  |
| `node scripts/run-tests.mjs --lane unit --shard 4/4` | PASS — canonical unit shard  |
| `node scripts/run-tests.mjs --lane integration`      | PASS — integration inventory |
| `node scripts/run-tests.mjs --lane slow --shard 1/2` | PASS — canonical slow shard  |
| `node scripts/run-tests.mjs --lane slow --shard 2/2` | PASS — canonical slow shard  |

## Package artifacts

The package-contract test and dry-run manifests establish these independently
publishable artifacts:

- Root: `@kburson/ai-task-manager@1.0.0`, 580 entries, including
  `bin/aitm.mjs`, `scripts/task-tracker/lib/work-lease/http-store.mjs`, and the
  runtime command surface. It contains no `scripts/task-tracker/tests/` files.
- Ledger: `@kburson/aitm-ledger@1.0.0`, 10 entries, including
  `src/index.mjs`, `src/lease/http-contract.mjs`,
  `src/sqlite/work-lease-store.mjs`, and both migrations. It contains no
  `test/` files.

| Command                                                                                                | Result                                    |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `node --test packages/aitm-ledger/test/package-contract.test.mjs`                                      | PASS — 3 tests                            |
| `npm pack --dry-run --json`                                                                            | PASS — root manifest inspected            |
| `npm pack --dry-run --json --workspace @kburson/aitm-ledger`                                           | PASS — ledger manifest inspected          |
| `npm publish --dry-run --json --workspace @kburson/aitm-ledger --registry=https://registry.npmjs.org/` | PASS — public-registry publish simulation |

## Repository quality gates

| Command                                              | Result                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `node scripts/task-tracker/tests/audit-line-cap.mjs` | PASS — 11 exact-path legacy ceilings, no growth              |
| `npm run lint`                                       | PASS                                                         |
| `npm run format:check`                               | PASS                                                         |
| `git diff --check`                                   | PASS                                                         |
| `git log --oneline -1`                               | PASS — exact implementation SHA recorded by the issue review |

## Scope notes

- Spawned mutation fixtures use an explicit test-only governed-effect adapter;
  production callers still acquire and verify real authority.
- Within the pre-existing non-slow audit scope, the line-cap baseline is a
  strict ratchet: exact legacy paths may shrink but cannot grow, renamed/new
  oversized tests fail, and stale entries fail. The historical `slow/`
  exclusion is unchanged by #1065.
- The packed consumer installs the ledger tarball and root tarball together,
  matching the independent package boundary without relying on registry state.
- Sharding is deterministic over the canonical sorted inventory; focused tests
  prove the shards are disjoint and their union is exact. It does not relax the
  per-section ceiling.
